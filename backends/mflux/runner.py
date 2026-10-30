"""Isolated MFLUX jobs. JSON input; prefixed JSON events on stdout; library logs on stderr."""
import contextlib
import importlib.metadata
import json
import os
from pathlib import Path
import sys
import time
import threading
import resource
from diagnostics import system_memory, memory_delta
import uuid

CATALOG = json.loads(Path(__file__).with_name('models.json').read_text())
OUTPUT = sys.stdout
OUTPUT_LOCK = threading.Lock()


def emit(kind, **values):
    with OUTPUT_LOCK:
        print('DBEXT ' + json.dumps({'event': kind, **values}), file=OUTPUT, flush=True)


def model_entry(model_id):
    model = next((m for m in CATALOG if m['id'] == model_id), None)
    if model is None:
        raise ValueError('This image model is not supported by the MFLUX integration.')
    return model


def validate_request(request):
    model = model_entry(request['selected_sd_model'])
    prompt = request.get('prompt', '')
    if not isinstance(prompt, str) or not prompt.strip():
        raise ValueError('Enter a prompt before generating.')
    task = request.get('applet_name', 'txt2img')
    if task not in model['model_meta_data']['tasks']:
        raise ValueError('This model does not support the selected task.')
    width, height = int(request.get('img_width', 1024)), int(request.get('img_height', 1024))
    if width <= 0 or height <= 0 or width % 16 or height % 16:
        raise ValueError('Image dimensions must be positive multiples of 16.')
    steps = int(request.get('num_steps', 4))
    if steps < 1:
        raise ValueError('Steps must be positive.')
    if task != 'txt2img' and not Path(request.get('input_img', '')).is_file():
        raise ValueError('The input image is missing. Open it again before editing.')
    return model, {'prompt': prompt, 'seed': int(request.get('seed', 0)),
                   'width': width, 'height': height, 'num_inference_steps': steps, 'guidance': 1.0}


def install(request):
    from huggingface_hub import HfApi, snapshot_download
    from huggingface_hub.utils import tqdm
    model = model_entry(request['id'])
    target = Path(request['models_dir']) / model['id']
    info = HfApi().model_info(model['repo'], revision=model.get('revision'), files_metadata=True)
    (target / '.installed.json').unlink(missing_ok=True)
    emit('stage', message='Downloading model files. Existing files will be reused.')
    progress = {'completed_files': 0, 'total_files': 0, 'transferred_bytes': 0}
    progress_lock = threading.Lock()

    class DownloadProgress(tqdm):
        def __init__(self, *args, **kwargs):
            self.report_kind = 'bytes' if kwargs.get('desc', '').startswith('Downloading bytes') else (
                'files' if kwargs.get('desc', '').startswith('Fetching ') else None)
            self.reported_at = 0
            kwargs['disable'] = False
            super().__init__(*args, **kwargs)

        def display(self, *args, **kwargs):
            pass  # Progress goes to the app, not terminal control sequences.

        def update(self, n=1):
            result = super().update(n)
            self.report()
            return result

        def close(self):
            if hasattr(self, 'n'):
                self.report(force=True)
            super().close()

        def report(self, force=False):
            if not self.report_kind or (not force and time.monotonic()-self.reported_at < 0.25):
                return
            self.reported_at = time.monotonic()
            with progress_lock:
                if self.report_kind == 'bytes':
                    progress['transferred_bytes'] = self.n
                else:
                    progress.update(completed_files=self.n, total_files=self.total or 0)
                emit('download', **progress)

    snapshot_download(model['repo'], revision=info.sha, local_dir=target,
                      allow_patterns=['*.json', '*.safetensors', '*.jinja', '*.txt', '*.model', 'README.md'],
                      tqdm_class=DownloadProgress)
    emit('stage', message='Verifying downloaded files…')
    files = {str(p.relative_to(target)): p.stat().st_size for p in target.rglob('*')
             if p.is_file() and '.cache' not in p.parts and p.name != '.installed.json'}
    if not any(name.endswith('.safetensors') for name in files):
        raise ValueError('The downloaded model has no weights.')
    marker = {'repo': model['repo'], 'revision': info.sha, 'files': files, 'bytes': sum(files.values())}
    temporary = target / '.installed.json.tmp'
    temporary.write_text(json.dumps(marker))
    temporary.replace(target / '.installed.json')
    emit('result', installed=True, path=str(target), **marker)


def metadata(request):
    from huggingface_hub import HfApi
    model = model_entry(request['id'])
    info = HfApi().model_info(model['repo'], revision=model.get('revision'), files_metadata=True)
    files = [f for f in info.siblings if f.rfilename.endswith(('.json', '.safetensors', '.jinja', '.txt', '.model')) or f.rfilename == 'README.md']
    emit('result', downloads=info.downloads, likes=info.likes,
         updated=info.last_modified.isoformat() if info.last_modified else None,
         bytes=sum(f.size or 0 for f in files), revision=info.sha, source='Hugging Face')


def generate(request):
    memory_before = system_memory()
    started = time.monotonic()
    timings = {}
    phase = 'startup'
    phase_started = started

    def stage(name, message):
        nonlocal phase, phase_started
        now = time.monotonic()
        timings[phase] = now - phase_started
        phase, phase_started = name, now
        emit('stage', phase=name, message=message)

    emit('stage', phase='startup', message='Starting image engine')
    model, options = validate_request(request)
    target = Path(request['models_dir']) / model['id']
    if not (target / '.installed.json').is_file():
        raise ValueError('Download this model from Models before generating.')
    # Generation never downloads weights implicitly or resolves a newer revision.
    os.environ['HF_HUB_OFFLINE'] = '1'
    from mflux.models.common.config import ModelConfig
    from mflux.models.flux2.variants import Flux2Klein, Flux2KleinEdit
    from mflux.callbacks.instances.memory_saver import MemorySaver
    import mlx.core as mx
    task = request.get('applet_name', 'txt2img')
    config = getattr(ModelConfig, model['model_meta_data']['sd_type'])()
    stage('loading', 'Loading ' + model['title'])
    cls = Flux2Klein if task == 'txt2img' else Flux2KleinEdit
    class TimedEngine(cls):
        def _encode_prompt_pair(self, **kwargs):
            encoded = super()._encode_prompt_pair(**kwargs)
            # MLX is lazy: finish prompt computation before timing denoising.
            mx.eval(*(value for value in encoded if value is not None))
            return encoded

    engine = TimedEngine(model_config=config, model_path=str(target), quantize=4)
    # Override only for controlled diagnostics; the product default remains 1 GB.
    cache_limit = int(os.environ.get('DBEXT_MLX_CACHE_LIMIT_BYTES', '1000000000'))
    engine.callbacks.register(MemorySaver(model=engine, keep_transformer=False, cache_limit_bytes=cache_limit))

    class Progress:
        def call_before_loop(self, **kwargs):
            stage('generation', 'Generating image')
            self.last_step = time.monotonic()

        def call_after_loop(self, **kwargs):
            stage('decoding', 'Decoding image')

        def call_in_loop(self, t, seed, prompt, latents, config, time_steps):
            # MFLUX invokes callbacks before its own mx.eval; count completed steps.
            mx.eval(latents)
            now = time.monotonic()
            emit('progress', value=100 * (t + 1) / max(1, config.num_inference_steps),
                 step=t + 1, steps=config.num_inference_steps, step_seconds=now-self.last_step)
            self.last_step = now

    engine.callbacks.register(Progress())
    if task != 'txt2img':
        options['image_paths'] = [request['input_img']]
    stage('preparing', 'Preparing prompt' if task == 'txt2img' else 'Preparing prompt and input image')
    result = engine.generate_image(**options)
    stage('saving', 'Saving image')
    out_dir = Path(request['output_dir'])
    out_dir.mkdir(parents=True, exist_ok=True)
    output = out_dir / ('mflux-' + uuid.uuid4().hex + '.png')
    result.save(str(output))
    timings[phase] = time.monotonic() - phase_started
    # Timing is diagnostic for this run only, never a catalog rating or compatibility gate.
    emit('result', generated_img_path=str(output), elapsed_seconds=time.monotonic()-started,
         timings=timings, peak_memory_bytes=mx.get_peak_memory(),
         process_peak_bytes=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * (1 if sys.platform == 'darwin' else 1024),
         system_memory_delta=memory_delta(memory_before, system_memory()), cache_limit_bytes=cache_limit,
         engine='mflux', model=model['id'])


def main():
    request = json.load(sys.stdin)
    command = sys.argv[1]
    with contextlib.redirect_stdout(sys.stderr):
        if command == 'probe':
            version = importlib.metadata.version('mflux')
            if version != '0.24.0':
                raise ValueError('Install the supported MFLUX version: 0.24.0.')
            import mlx.core as mx
            if sys.platform == 'darwin' and not mx.metal.is_available():
                raise ValueError('MFLUX requires a supported Metal device on macOS.')
            emit('result', available=True, version=version)
        elif command == 'install':
            install(request)
        elif command == 'metadata':
            metadata(request)
        elif command == 'generate':
            generate(request)
        else:
            raise ValueError('Unknown command')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        emit('error', message=str(error))
        sys.exit(1)
