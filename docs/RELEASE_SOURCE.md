# Release-source provenance

Extended starts from the public DiffusionBee 2.3.0 source at `daf82f8`. To restore model compatibility, we inspected the official Apple Silicon 2.5.3 application bundle from the upstream GitHub release, including `Contents/Resources/app.asar/js/app.5d647135.js.map`.

The map embeds Vue source through `sourcesContent`, including `BasicSDApplet.vue`, `SDImageGenerationApplet.vue`, `Txt2ImgFlux.vue`, and `ModelStore.vue`. Flux pipeline/type options and newer model metadata handling were adapted to this Vue 2 frontend. Extended intentionally presents Flux in the existing Text to image model selector. The newer Vue 3 interface was not copied wholesale.

Original authorship and the repository's AGPL-3.0 license are retained. Downloaded application binaries, extracted source maps, and model weights remain in ignored `.runtime/`; no binary or weights are committed. Model licenses remain separate. Build-40 backend detection enables the corresponding restored UI paths and does not assert every model has been tested.
