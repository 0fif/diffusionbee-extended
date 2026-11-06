# DiffusionBee Extended

**Local image generation and photo editing for Mac, with modern models and a more capable editor.**

Extended is an independent fork of [DiffusionBee](https://github.com/divamgupta/diffusionbee-stable-diffusion-ui) by Divam Gupta. It keeps the original idea—generate images locally without assembling a Python environment—and builds on the editor, model management, and everyday workflows.

**Public beta:** [Download 0.1.0-beta.3 for Apple Silicon Macs](https://github.com/0fif/diffusionbee-extended/releases/tag/v0.1.0-beta.3). Requires macOS 26 or newer. The installer includes both engines and Python; generation models download inside the app.

## Why this fork?

DiffusionBee made local image generation approachable. We wanted to keep that simplicity while improving three things:

- **More useful photo editing.** Select an area, zoom in, adjust the mask, describe the change, and compare the result without forcing the entire photo into a square.
- **Newer image models.** Integrate modern engines into familiar tools, with model choices based on the task rather than separate tabs for each architecture.
- **A dependable workflow.** Make generation progress, cancellation, downloads, History, and export behave consistently—including when something fails.

Extended is a continuation of that work, not an official DiffusionBee update or a promise of Photoshop-level editing quality.

## What we've added and improved

### A more capable photo editor

- Cursor-centered zoom, panning, Fit and 100% views.
- Brush, eraser, and rectangle selections, with mask undo/redo.
- A selection-based prompt area and Compare, Keep, Discard, and Try again controls.
- Automatic working-crop sizing around the selection, with surrounding image context.
- Aspect-preserving processing and original-size photo output. Fully unmasked pixels stay unchanged when the generated edit is composited back.
- Boundary blending to reduce visible color and exposure seams.
- JPEG and PNG export, with the selected format retained through History.

The model processes a working crop; that crop's resolution does not become the final photo's resolution. Editing a small area also does not make generation instantaneous.

### Modern models in the existing tools

The integrated MFLUX engine brings newer image models to **Text to image**, **Image to image**, and **Inpainting**. The legacy engine retains existing Stable Diffusion, SDXL, and supported FLUX workflows.

| Modern model family | Text to image | Image to image | Selected edits |
| --- | --- | --- | --- |
| FLUX.2 Klein 4B / 9B | Yes | Yes | Yes |
| FIBO 2 Edit Turbo | Yes | Yes | Yes |
| Qwen Image 2.1 Turbo | — | Yes | Yes |

These are the routes implemented in Extended, not a claim that every model produces equally good results. Selected edits may use native masking or instruction editing followed by compositing, depending on the model and mode. See [model validation](backends/mflux/VALIDATION.md) for specific checks and limitations.

### Clearer model management

- Installed models and a searchable catalog, with task and engine filters.
- Compatibility checks before generation; an empty library stays empty until you choose a model.
- Source links, publisher previews, download sizes and other metadata when supplied by the source.
- Download progress, cancellation, verification, and resumable modern-model downloads.
- Consistent removal confirmation and no silent replacement of your selected model.

The catalog combines supported modern-model integrations with the upstream legacy catalog. **It is not a general Hugging Face browser.** A repository needs a compatible architecture, format, and implemented inference route before the app can use it. An image model's bundled text encoder is part of that model—not a separate chat feature.

### More reliable everyday use

- Distinct loading, generation, and finishing states, elapsed time, and run diagnostics.
- Stop waits for the worker to exit before accepting another job.
- Completed editing attempts save to History, including results followed by Try again or Discard.
- History persists across restarts; failed and unfinished images are excluded.
- Upscaler uses the photographic Real-ESRGAN model, saves durable results, and records them in History.
- Image previews open in isolated windows without application IPC or Node access.
- Updated Electron and Vue foundations, with regression checks for editing, model handling, downloads, persistence, and export.

## Requirements and installation

The current installer target is **Apple Silicon (M1 or newer), macOS 26 or newer**. That macOS requirement comes from the bundled MLX runtime. This build does not claim Intel Mac, Windows, or Linux support.

The app includes its engines and Python runtime. **Users do not need another DiffusionBee installation, Python, Homebrew, or developer tools.** Choose and download generation models inside the app; model weights are separate from the installer and can require several gigabytes each. Memory needs and generation speed depend on the model, working resolution, and available system memory.

To install:

1. Download the DMG from [Extended's Releases page](https://github.com/0fif/diffusionbee-extended/releases).
2. Open it and drag **DiffusionBee Extended** into Applications.
3. Launch the app. This project does not use Apple Developer ID signing or notarization. If macOS blocks the first launch, use **System Settings → Privacy & Security → Open Anyway** for the app you just downloaded. See [Apple's instructions](https://support.apple.com/en-us/102445). There is no need to disable Gatekeeper system-wide.
4. Open **Models**, choose a compatible model, and download it.
5. Choose a tool and select the installed model.

The release build applies an ad-hoc code signature for integrity checks. This is **not** Apple notarization or verification of the publisher's identity.

## Local processing and storage

Image generation and editing run locally. Internet access is used to retrieve model catalogs, metadata, previews, and model downloads. Any optional image-sharing action is separate from local generation.

Packaged modern models are stored in the application's writable user-data directory. For compatibility with existing installations, images and History currently remain under `~/.diffusionbee`; that location can also be used by upstream DiffusionBee. Removing a model does not remove your generated images.

## Known limitations

- Precise facial corrections and identity preservation are not guaranteed. A successful generation or a clean mask boundary does not establish that the requested edit looks right.
- Not every catalog model/task combination has been tested. Architecture support and a successful check of one checkpoint are different things.
- Interpolator uses the legacy backend and compatible legacy models. Its actual video-render workflow still needs end-to-end verification in the release candidate.
- The candidate has passed standalone launch, bundled-engine generation, Upscaler, History reopening, and preview checks. This first release is a public beta. See [release-source details](docs/RELEASE_SOURCE.md) for the bundled engine’s origin.

## Development and contributing

See [development and packaging instructions](electron_app/README.md), [modern backend setup](backends/mflux/README.md), and [model validation](backends/mflux/VALIDATION.md).

Useful checks from `electron_app`:

```sh
npm run test:editor
npm run test:models
npm run test:generation
npm run test:mflux
npm run test:history
npm run test:navigation
npm run test:export
npm run test:legacy
npm run test:preload
npm run test:runtime
npm run test:audit
```

Report bugs and feature requests in [this fork's issue tracker](https://github.com/0fif/diffusionbee-extended/issues). Include the app version, macOS version, Mac/chip, selected model, tool, and steps to reproduce. Remove personal prompts, images, and paths from logs before sharing them. Please direct Extended-specific issues here rather than to the original developer.

## Credits and license

Extended starts from DiffusionBee's public source at `daf82f8` and retains its [AGPL-3.0 license](LICENSE) and original authorship. It is independently maintained and is not affiliated with or endorsed by the original project.

Thanks to [Divam Gupta and DiffusionBee contributors](https://github.com/divamgupta/diffusionbee-stable-diffusion-ui), the [MFLUX contributors](https://github.com/mflux-community/mflux), [MLX](https://github.com/ml-explore/mlx), and [Real-ESRGAN](https://github.com/xinntao/Real-ESRGAN), along with the model authors and the open-source projects used by the original application.

Models and bundled dependencies have their own licenses. The application's license does not replace a model's terms, and the terms are not identical across all supported models.
