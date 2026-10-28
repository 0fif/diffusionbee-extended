# Developing DiffusionBee Extended

From this directory:

```sh
npm ci
npm run build
npm run test:editor
```

The frontend build and Electron editor regression checks were verified on Apple Silicon with Node 22.14.0. The old dependency tree emits engine/deprecation warnings; this is not a claim of broad Node 22 support. `test:editor` opens an isolated, hidden Electron window, uses actual Vue components and canvas pixels, and prints a temporary screenshot path. It uses no models and mocks generation callbacks; it does not validate model output.

## Run the complete app

```sh
npm run electron:serve
```

This also needs a working backend. `src/bridge.js` defaults to the `python` executable and `../backends/stable_diffusion/diffusionbee_backend.py`; activate a compatible Python environment first. `PY_SCRIPT` overrides the script. `BIN_PATH` can select an existing backend executable when the script path exists. Do not assume that a newer upstream binary is protocol-compatible.

On the initial development machine (Apple Silicon, Python 3.9.6), backend startup fails with missing NumPy. The supplied requirements also pin `tensorflow==2.10.0`, for which pip finds no matching native wheel in this environment. Backend dependencies, GPU acceleration, model downloads, and real generation still need validation. Installing a different TensorFlow distribution/version requires compatibility testing, not just relaxing the pin.

The `serve:ui` and `build:ui` scripts refer to an upstream `AppDemoUI.vue` file absent from this checkout. Use the commands above for the verified build and isolated editor checks.

## Packaging

`npm run electron:build` requires `BACKEND_BUILD_PATH` pointing to prepared backend resources. Upstream signing also expects `APPLE_ID` and `APPLE_ID_PASSWORD`. No installer or signed build has been verified for Extended. App identifiers, data directories, and the upstream update check must be separated before distributing a forked installer.
