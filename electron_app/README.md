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

The development frontend still identifies its compatibility level as upstream build 29. Using a build-40 backend does not establish that every newer SDXL/Flux workflow works in this older frontend. Catalog entries requiring newer builds remain gated and now say they are not yet supported by Extended.

### Verified real inpainting

On October 28, 2026, the current frontend generated a 512×512 image using the official 2.5.3 backend and `sd-v1-5-inpainting_fp16.tdict`, then successfully generated another image through Retry. The model checksum was `68303f49cca00968c39abddc20b622a6`, matching upstream's asset definition. The test used 20 steps, seed 1234, a rectangular mask, and the prompt “a red ceramic vase on a wooden table, studio photograph”.

The input had a plain wall and table. All 40,000 pixels inside the drawn rectangle changed; 16,142 pixels outside it changed because the backend expands/feathers the mask. No pixels more than 26 pixels from the rectangle changed. This validates this particular SD 1.5 workflow, not every model or strict preservation immediately outside the drawn mask.

The launcher uses DiffusionBee's existing `~/.diffusionbee` data directory. On this development machine the verified bundle and inpainting model are in `.runtime/`, and the model is registered in the local app. Complete-app generation is now verified; signing and packaging an Extended installer are not.

### Source-only backend

`npm run electron:serve` still supports a Python backend via `PY_SCRIPT` or a binary via `BIN_PATH`. The checked-in Python requirements pin `tensorflow==2.10.0`, which has no matching native wheel for this machine's Python 3.9.6 environment. This source-only setup remains unresolved; it is not required for the verified release-backed route above.

The `serve:ui` and `build:ui` scripts refer to an upstream `AppDemoUI.vue` file absent from this checkout. Use the commands above.

## Packaging

`npm run electron:build` requires `BACKEND_BUILD_PATH` pointing to prepared backend resources. Upstream signing also expects `APPLE_ID` and `APPLE_ID_PASSWORD`. No installer or signed build has been verified for Extended. App identifiers, data directories, and the upstream update check must be separated before distributing a forked installer.
