# Model checks and performance investigation

These are functional checks and local diagnostics, not hardware requirements or universal speed ratings. Packaging remains deferred.

## Reproducible model checks

MFLUX 0.24.0, 4-bit packages, seed 123, four steps, 512 × 512 output. Text generation requested a red vase; both edit routes requested changing a red vase to blue. All six results were valid images at the requested size, and the generated/recolored outputs were visually reviewed. `inpainting` at this layer is instruction editing; the editor’s crop/composite integration is checked separately.

| Model | Task | Result | Engine duration |
|---|---|---|---|
| mflux-flux2-klein-4b-4bit | txt2img | Passed | 15.1 s |
| mflux-flux2-klein-4b-4bit | img2img | Passed | 27.5 s |
| mflux-flux2-klein-4b-4bit | inpainting | Passed | 31.3 s |
| mflux-flux2-klein-9b-4bit | txt2img | Passed | 33.6 s |
| mflux-flux2-klein-9b-4bit | img2img | Passed | 62.5 s |
| mflux-flux2-klein-9b-4bit | inpainting | Passed | 65.3 s |

The real 9B editor check used a 1024 × 704 working crop and returned a 768 × 512 source-sized image. All unselected pixels matched the original exactly; the blue-vase result was visually reviewed. Generation took about 121.4 s and total phase time about 126.3 s in this run, with 7.04 GiB peak engine memory. System compression increased by about 14.5 GiB and swap-out counters did not increase; these remain host-wide observations, not model hardware requirements.

4B revision: `860e87183ceb29e39627c0612ebd66d8ea66e68c`. 9B revision: `f0c62655b9da432932ba24d4bfce8a96800cf0bd`. The catalog pins both. Task validation is tied to revision; changing it makes the check Untested until new evidence is recorded.

Legacy checkpoints are not promoted to Tested just because the engine supports their architecture. Previously checked FLUX.1 Schnell generation and Juggernaut XL selected editing are recorded; other model/task combinations explicitly remain Untested. Unsupported routes, such as FLUX.1 image-to-image in this integration, are labeled separately. Precise facial/eye correction is not validated by these vase checks.

## Cache experiment

Four sequential 4B edits, same prompt/input/seed, 1024 × 704, four steps. Order: existing 1 GB cache, candidate 4 GB, candidate 4 GB, existing 1 GB. One worker at a time; ordinary system activity was not artificially excluded. The decoded output pixels were identical across all four runs.

| Run | Cache limit | Total | Generation | Peak engine memory | System compression during run | System swap-outs |
|---|---|---|---|---|---|---|
| cache-0 | 1 GB | 47.96 s | 43.26 s | 4.37 GiB | 100.8 MiB | 0.0 MiB |
| cache-1 | 4 GB | 49.70 s | 45.22 s | 4.33 GiB | 4114.6 MiB | 0.0 MiB |
| cache-2 | 4 GB | 45.31 s | 40.98 s | 4.45 GiB | 1039.6 MiB | 0.0 MiB |
| cache-3 | 1 GB | 45.18 s | 40.69 s | 3.94 GiB | 0.0 MiB | 0.0 MiB |

Existing-cache mean: 46.57 s; larger-cache mean: 47.50 s. This small comparison shows no convincing speed benefit; the 1 GB default is retained. Generation remains the dominant measured phase. Swap-out counters did not increase in these runs, while compression varied substantially. These counters describe the whole machine, so they cannot establish that the image engine caused all compression or that memory pressure never mattered.

Run details now expose process peak memory plus whole-system compression/swap deltas alongside existing Metal peak memory and phase durations. Process and Metal allocations overlap and must not be added together. First-step timing can include deferred weights/reference-image encoding.

## Repeat the checks

Use `backends/mflux/verify_models.py` with `--models-dir`, `--output-dir`, and `--input-image`. It uses already installed packages and never downloads weights. Add `--benchmark-cache` for the four-run comparison. Full requests, phase timings, output paths, and logs are saved in the chosen output directory. `DBEXT_MLX_CACHE_LIMIT_BYTES` is a diagnostic override, not a machine-based compatibility rule.

## Models page

Actual generated previews are bundled for the two modern models. Unknown publisher thumbnails have a visible fallback and retry on Refresh. Task filters include image-to-image; task-specific validation distinguishes Tested, Untested, Unsupported, and Needs engine. Metadata has explicit loading/failure/retry states and preserves valid zero counts. Downloads show completed files and transferred bytes; incomplete packages remain resumable and are never registered as installed until verification finishes. Cancelling waits for the worker to exit. File counts are shown rather than pretending compressed network bytes equal installed size.

Automated checks: Python request/memory/download-interruption tests; Node model/task/revision and worker cancellation/resumption tests; real Vue/Electron Models rendering and search/filter/metadata/progress/empty states at 1070 and 770 pixels.
