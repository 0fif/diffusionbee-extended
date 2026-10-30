# Modern image backend

Extended runs MFLUX alongside the existing DiffusionBee backend. Models choose their engine; users keep using Text to image, Image to image, or Inpainting. No chat/LLM inference routes are integrated. The text encoder included in an image-model package is a dependency of that image model.

## Setup

From `electron_app`, run `npm run setup:mflux` using Python 3.11 or newer. Set `MFLUX_SETUP_PYTHON` if that Python is not the default `python3`. The installer creates an isolated `.runtime/mflux-env` and installs `mflux==0.24.0`. It does not install weights. Then run `npm run electron:serve:release` and use Models → Discover to download a supported image model.

The development defaults put model packages in `.runtime/mflux-models`. `MFLUX_PYTHON`, `MFLUX_RUNNER`, and `MFLUX_MODEL_DIR` can override the executable, runner, and storage directory. Generated images use the existing `~/.diffusionbee/images` directory. Packaging this second runtime in a distributable installer is still separate release work.

## Supported integration

The registry in `models.json` currently includes FLUX.2 Klein 4B and 9B, in 4-bit MFLUX packages. Both architectures are integrated and have actual generation and instruction-edit checks. Task-level validation and its limits are recorded in [VALIDATION.md](VALIDATION.md); untested combinations remain explicit. Models are not excluded based on the development machine's performance. Discover searches the integrated registry plus the legacy catalog; it does not claim arbitrary Hugging Face repositories are compatible.

Klein uses `Flux2Klein` for text generation and `Flux2KleinEdit` for image-conditioned editing. Negative prompts, legacy samplers, and SD image-strength controls do not apply to this route and are hidden. Image-to-image defaults to an aspect-preserving working size up to 1024 on the longest side unless explicit dimensions are chosen. Inpainting keeps the original photo size and blends the edited working crop through the selection. **This is instruction editing followed by selection compositing, not a native mask-conditioned Klein model.** For instruction edits, a smooth boundary color correction matches the generated crop to the surrounding source before feathering; this reduces rectangular exposure/tint seams without changing unselected pixels. It cannot repair changed geometry or guarantee identity preservation. Edit quality must be assessed separately from successful execution.

## Downloads, compatibility, and statistics

Only registry entries can be installed or executed. Downloads use the Hugging Face client and a resolved repository revision, with a completed-install marker recording file sizes and the revision. The 4B package is pinned in the registry. Generation is offline and never silently downloads or upgrades weights. Partial downloads can be resumed, and cancellation leaves no completed-install marker. Removing a model removes only its managed package, not generated images.

Repository size, downloads, likes, and update date come from Hugging Face. Download counts describe that converted repository, not all versions of the model or unique users. Installed size is measured from the package. Legacy entries show unknown source statistics rather than invented values. Thumbnails use stable URLs where available and visibly fall back when a resource is absent or broken.

There are no RAM-based model exclusions, hardware popularity rankings, or universal speed ratings. Engine support is distinct from whether a particular configuration fits available memory. Per-job duration and peak memory are diagnostics only; they are not persisted as catalog ratings or advertised as general requirements.

## Protocol and tests

Each job runs in an isolated Python process, reading one JSON request from stdin. Prefixed JSON events report stage, progress, result, or error. The Electron adapter converts those events into the existing queue protocol. Cancellation terminates the worker and restores ready state; errors do not kill the app. Python/library output goes to stderr. The legacy engine remains available for its existing models.

Run:

```sh
node electron_app/tests/mflux.cjs
.runtime/mflux-env/bin/python -m unittest discover -s backends/mflux -p 'test_*.py'
cd electron_app
npm run test:editor
npm run build
```

Process tests cover routing, split output chunks, errors, cancellation, missing weights, and unsupported model IDs. Request tests reject unsupported tasks, missing inputs, invalid dimensions, and empty prompts. Real checks on October 29, 2026 generated a red vase at 768×512 and changed it to blue with the edit pipeline, preserving the scene visually. A separate app Text to image run at 768×576 verified normal selection, queue, result, and History integration. The in-app selection test exposed a rectangular lighting mismatch on the wall and table; recompositing the same generated vase with boundary color matching removed the visible tint while retaining the blue vase. Canvas regression checks cover that correction, object color retention, and unchanged unselected pixels. These are functional examples, not a universal benchmark or a claim of Adobe-equivalent quality.

## Generation status and diagnostics

The UI reports startup, model setup, prompt/input preparation, completed denoising steps, decoding, saving, and editor finishing. Elapsed time includes the whole request. Completed MFLUX runs expose stage durations and peak engine memory under Run details; no universal performance score or speculative countdown is shown. MLX evaluates lazily: the adapter evaluates prompt embeddings before denoising and waits for each step’s latents before reporting that step complete. Deferred weights and reference-image processing can still fall in the first denoising step. Run details also report peak process memory and whole-system swap/compression counter changes; other apps contribute to those counters, so they are observations rather than causal attribution. See [VALIDATION.md](VALIDATION.md) for the cache experiment and its limits.

Stop remains pending until the worker exits, ignores late events, and escalates from SIGTERM to SIGKILL after three seconds. The renderer also waits for asynchronous image compositing before accepting another job. `npm run test:generation` covers state transitions, real step counts, cancellation acknowledgments, late events, failure recovery, and asynchronous finishing. Process tests additionally exercise a worker that ignores SIGTERM.
