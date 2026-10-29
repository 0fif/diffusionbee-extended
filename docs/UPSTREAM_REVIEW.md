# Upstream review and first editor fixes

Reviewed October 28, 2026 against `daf82f8`, source version 2.3.0. Reviewed the latest 150 issues, 100 available PR entries, and a separate all-state search for editor/inpaint/mask/outpaint reports. This is a qualitative triage, not a frequency count or exhaustive reproduction of reported bugs.

## Source availability limits

[Issue #561](https://github.com/divamgupta/diffusionbee-stable-diffusion-ui/issues/561) and [#533](https://github.com/divamgupta/diffusionbee-stable-diffusion-ui/issues/533) report newer release binaries without corresponding source updates. The checkout's last commit is December 2023, and `electron_app/package.json` says 2.3.0. Newer Flux/SDXL reports must not be treated as reproduced bugs in this checkout.

The README advertises an advanced AI canvas, but the checked-in router has no editor/outpainting page. The checked-in Python applet registration supplies frame interpolation, not an advanced canvas editor. [#572](https://github.com/divamgupta/diffusionbee-stable-diffusion-ui/issues/572) also asks where outpainting went. Restoring that feature needs a separate implementation/source investigation; it is not fixed by this patch.

## Verified and addressed in this branch

| Problem | Evidence and change |
| --- | --- |
| Mask dots land away from the click | Shared `ImageCanvas` used CSS coordinates for clicks and scaled coordinates for movement, matching [#259](https://github.com/divamgupta/diffusionbee-stable-diffusion-ui/issues/259). Both now use the canvas bounding rectangle and native image dimensions. |
| Fast strokes can leave gaps | Three brush stamps per mouse event replaced with a continuous round-capped stroke. A stationary click paints the full brush and marks the mask as present. |
| Retry/Discard can lose the mask | Replaced 150ms timers with waiting for Vue and actual image loading. Stale image loads are ignored. |
| Failed generation changes undo history | History now changes when a result arrives. Discard/Retry remove the rejected result's history entry. |
| Missing-image and empty-mask generation | Inpainting now explains what is missing before exporting canvas data or starting a job. |
| Empty drag crashes | Both image inputs ignore drops with no file. |
| Limited mask controls | Added inversion to both mask surfaces and brush size to image-to-image, adapting the ideas in PRs #340 and #418 to the current component structure. |

## Recurring reported problems to investigate next

| Priority | Area | Reports | Next verification |
| --- | --- | --- | --- |
| 1 | Reproducible backend and generation | [#506](https://github.com/divamgupta/diffusionbee-stable-diffusion-ui/issues/506), [#513](https://github.com/divamgupta/diffusionbee-stable-diffusion-ui/issues/513), [#464](https://github.com/divamgupta/diffusionbee-stable-diffusion-ui/issues/464) | Establish compatible Python/TensorFlow and one known SD 1.5 inpainting model; test startup, generation, cancellation, and retry with real output. |
| 2 | Inpainting changes outside the mask | [#269](https://github.com/divamgupta/diffusionbee-stable-diffusion-ui/issues/269), [#570](https://github.com/divamgupta/diffusionbee-stable-diffusion-ui/issues/570) | Compare source/output pixels outside the mask. Backend already composites when masking diffusion is enabled, but resizes/dilates masks; do not claim unchanged pixels without a real-image regression. |
| 3 | Downloads fail or stall | [#526](https://github.com/divamgupta/diffusionbee-stable-diffusion-ui/issues/526), [#536](https://github.com/divamgupta/diffusionbee-stable-diffusion-ui/issues/536), [#566](https://github.com/divamgupta/diffusionbee-stable-diffusion-ui/issues/566) | Reproduce interrupted downloads, checksum failures and restart; inspect partial-file handling and error messages. |
| 4 | Model and LoRA imports | [#411](https://github.com/divamgupta/diffusionbee-stable-diffusion-ui/issues/411), [#498](https://github.com/divamgupta/diffusionbee-stable-diffusion-ui/issues/498), [#504](https://github.com/divamgupta/diffusionbee-stable-diffusion-ui/issues/504) | Test supported architectures and surface useful incompatibility errors. Separate reports for newer binaries from this source. |
| 5 | Controls inaccessible on small/scaled screens | [#527](https://github.com/divamgupta/diffusionbee-stable-diffusion-ui/issues/527), [#471](https://github.com/divamgupta/diffusionbee-stable-diffusion-ui/issues/471) | Test complete app layout at minimum size and macOS display scaling. |

## Pull request decisions

| PR | Assessment |
| --- | --- |
| [#340: invert mask](https://github.com/divamgupta/diffusionbee-stable-diffusion-ui/pull/340) | Reviewed diff. Useful idea; old page paths no longer exist. Adapted canvas XOR inversion as a direct method, without the old prop/watcher toggle or package-version changes. |
| [#418: brush size](https://github.com/divamgupta/diffusionbee-stable-diffusion-ui/pull/418) | Reviewed diff. Adapted the existing brush-size prop into today's shared image-input form instead of cherry-picking the obsolete Img2Img page. |
| [#367: history cleanup](https://github.com/divamgupta/diffusionbee-stable-diffusion-ui/pull/367) | Reviewed description/files. Old History path; file deletion deserves ownership and missing-file tests before adoption. Not merged. |
| [#522: remove upscale size cap](https://github.com/divamgupta/diffusionbee-stable-diffusion-ui/pull/522) | Reviewed description/files. Small candidate, but needs memory/large-image tests with the actual upscaler. Not merged. |
| [#578: FastMCP backend refactor](https://github.com/divamgupta/diffusionbee-stable-diffusion-ui/pull/578) | Reviewed description/files. Broad service/MCP work does not address the editor defects; defer. |
| [#460: proxy support](https://github.com/divamgupta/diffusionbee-stable-diffusion-ui/pull/460) | Shortlisted from PR list for download investigation; patch not yet reviewed. |
| [#404: accessibility](https://github.com/divamgupta/diffusionbee-stable-diffusion-ui/pull/404) | Closed PR worth revisiting for keyboard workflows; patch not yet reviewed. |

## Validation and release boundary

- Baseline and changed frontend production builds pass, with existing bundle-size warnings.
- ESLint passes for the changed Vue components; `git diff --check` passes.
- `npm run test:editor` uses the installed Electron 13 renderer and actual Vue components. It checks canvas pixels for scaled clicks, continuous strokes, inversion and restoration, plus native dimensions and interrupted mouse strokes. Mocked generation callbacks check guards, failed-job history, Discard, Retry, Undo/Redo, empty drops, and retry reset on a new image.
- Inspected the rendered canvas and page controls in the isolated harness. The harness stubs the surrounding applet/backend and is not a full-app visual or accessibility test.
- **Real SD 1.5 inpainting and Retry are now verified** with the official 2.5.3 Apple Silicon backend and its checksum-verified inpainting model. The source-only TensorFlow environment is still unresolved. See [development instructions](../electron_app/README.md) for the launch command, test inputs, and pixel-comparison results. No new installer was produced.
- Before an Extended release: broaden model coverage beyond SD 1.5 inpainting, JuggernautXL text-to-image, and Flux Schnell text-to-image, separate app identity/data/update behavior, test export and strict outside-mask preservation, then package a test build.

## Catalog warning follow-up

The catalog uses minimum build numbers: many SDXL entries require 36, and Flux requires 40. Extended now queries the actual backend build rather than treating its old frontend package version as the only compatibility signal. The compatible release-backed path enables restored SDXL/Flux handling; unsupported combinations remain gated. Flux is selected inside Text to image.

The official app's source map supplied newer frontend model-handling code; see [release-source provenance](RELEASE_SOURCE.md). Actual JuggernautXL and Flux Schnell generation succeeded. The editor now crops selections and composites them at original resolution; regression tests assert fully unmasked pixels remain unchanged. Full catalog coverage, SDXL masked editing, and a distributable installer remain outstanding.
