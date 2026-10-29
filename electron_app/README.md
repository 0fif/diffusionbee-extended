# Developing DiffusionBee Extended

From this directory:

```sh
npm ci
npm run build
npm run test:editor
```

The frontend build and Electron editor regression checks were verified on Apple Silicon with Node 22.14.0. The old dependency tree emits engine/deprecation warnings; this is not a claim of broad Node 22 support. `test:editor` opens an isolated, hidden Electron window, uses actual Vue components and canvas pixels, and prints a temporary screenshot path. It uses no models and mocks generation callbacks; it does not validate model output.

## Run with the verified release backend

```sh
npm run electron:serve:release
```

The launcher uses `../.runtime/DiffusionBee.app` by default. To use an installed app instead:

```sh
DIFFUSIONBEE_APP=/Applications/DiffusionBee.app npm run electron:serve:release
```

The official Apple Silicon **2.5.3** app bundle was tested on this machine. Its bundled Python runtime and native Apple GPU libraries avoid the old source backend's TensorFlow setup. Obtain the bundle from the [official release](https://github.com/divamgupta/diffusionbee-stable-diffusion-ui/releases/tag/2.5.3). The launcher does not download anything. `.runtime/` is ignored by git; binaries and model weights are not redistributed in this repository.

The frontend keeps its upstream package version, but queries the actual backend build asynchronously. A supported build-40 Apple Silicon backend enables the restored SDXL and Flux catalog paths. Flux uses the same **Text to image** screen and model selector as Stable Diffusion. Unsupported backend/model combinations remain gated.

Development hot reload is disabled by default to avoid destroying an active editing session. Set `DIFFUSIONBEE_LIVE_RELOAD=1` to opt in while developing; restart deliberately after changing code otherwise.

### Editor and generation validation

The editor supports cursor-centered wheel zoom, Fit/100%, Space-drag panning, brush/eraser/rectangle masks, mask undo/redo, and a contextual Generate fill prompt. It crops the masked region with surrounding context at model resolution and composites the result into the original-size photo. Fully unmasked pixels are preserved by the compositor; boundary quality still depends on the model and mask.

On October 28, 2026, the official 2.5.3 backend successfully generated with SD 1.5 Inpainting (512×512, 20 steps), JuggernautXL v7 (768×768, 12 steps), and Flux.1 Schnell (768×768, four steps). SD 1.5 Retry also produced a second result. This is coverage of these specific paths, not every catalog entry. Model weights were checksum-verified against the catalog. SDXL masked editing and Flux Dev have not yet received the same real-generation validation.

`test:editor` checks original-size compositing and unchanged unmasked pixels, mask coordinates, strokes, undo/redo, loading races, and generation/review guards with mocked callbacks. It does not assess generated-image quality. Live browser input checks also confirmed wheel zoom, captured pointer panning/release, and repeated viewport resizing from 770×550 to 1070×700 without runtime errors.

The launcher uses DiffusionBee's existing `~/.diffusionbee` data directory. The local backend and model files live in ignored `.runtime/`. Signing and packaging an Extended installer are not verified.

### Source-only backend

`npm run electron:serve` still supports a Python backend via `PY_SCRIPT` or a binary via `BIN_PATH`. The checked-in Python requirements pin `tensorflow==2.10.0`, which has no matching native wheel for this machine's Python 3.9.6 environment. This source-only setup remains unresolved; it is not required for the verified release-backed route above.

The `serve:ui` and `build:ui` scripts refer to an upstream `AppDemoUI.vue` file absent from this checkout. Use the commands above.

## Packaging

`npm run electron:build` requires `BACKEND_BUILD_PATH` pointing to prepared backend resources. Upstream signing also expects `APPLE_ID` and `APPLE_ID_PASSWORD`. No installer or signed build has been verified for Extended. App identifiers, data directories, and the upstream update check must be separated before distributing a forked installer.
