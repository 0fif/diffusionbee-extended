"""Opt-in real generation checks. Uses installed weights; never downloads models."""
import argparse
import json
import os
from pathlib import Path
import subprocess
import sys

parser = argparse.ArgumentParser()
parser.add_argument('--models-dir', required=True)
parser.add_argument('--output-dir', required=True)
parser.add_argument('--input-image', required=True)
parser.add_argument('--benchmark-cache', action='store_true')
args = parser.parse_args()
output = Path(args.output_dir)
output.mkdir(parents=True, exist_ok=True)
results = []


def run(label, model, task, width=512, height=512, cache=1000000000):
    request = dict(selected_sd_model=model, applet_name=task, models_dir=args.models_dir,
                   output_dir=str(output), input_img=args.input_image, img_width=width,
                   img_height=height, num_steps=4, seed=123,
                   prompt='A red ceramic vase on a wooden table, photograph' if task == 'txt2img' else
                   'Change the red vase to blue. Keep the background and lighting unchanged.')
    log = output / (label + '.log')
    with log.open('w') as stream:
        process = subprocess.run([sys.executable, str(Path(__file__).with_name('runner.py')), 'generate'],
                                 input=json.dumps(request), text=True, stdout=stream, stderr=subprocess.STDOUT,
                                 env=dict(os.environ, DBEXT_MLX_CACHE_LIMIT_BYTES=str(cache)), timeout=600)
    events = []
    for line in log.read_text().splitlines():
        offset = line.find('DBEXT ')
        if offset >= 0:
            events.append(json.loads(line[offset+6:]))
    result = next((event for event in events if event['event'] == 'result'), None)
    record = dict(label=label, request=request, exit_code=process.returncode, result=result)
    if result:
        from PIL import Image
        with Image.open(result['generated_img_path']) as image:
            record['dimensions_match'] = image.size == (width, height)
            image.verify()
    results.append(record)
    (output / 'results.json').write_text(json.dumps(results, indent=2))
    print(json.dumps(dict(label=label, success=bool(result) and process.returncode == 0,
                          seconds=result and round(result['elapsed_seconds'], 2))), flush=True)
    if not result or process.returncode or not record.get('dimensions_match'):
        raise RuntimeError('Generation failed; inspect ' + str(log))


if args.benchmark_cache:
    for i, cache in enumerate([1000000000, 4000000000, 4000000000, 1000000000]):
        run('cache-'+str(i), 'mflux-flux2-klein-4b-4bit', 'img2img', 1024, 704, cache)
else:
    for size in ['4b', '9b']:
        for task in ['txt2img', 'img2img', 'inpainting']:
            run(size+'-'+task, 'mflux-flux2-klein-'+size+'-4bit', task)
