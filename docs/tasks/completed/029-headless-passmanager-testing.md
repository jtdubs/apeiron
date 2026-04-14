---
status: closed
---

# Task 029: Headless PassManager Testing and Render Artifact Detection

## Objective

Refactor the `PassManager` to support offscreen headless rendering without a DOM Canvas, enabling end-to-end regression tests that scan the WebGPU pipelines for `NaN`/`Infinity` math explosions or full-screen rendering artifacts.

## Relevant Design Docs

- [Test Plan](../test-plan.md)
- [Rendering Engine Design](../rendering-engine-design.md)

## Requirements

- **Offscreen Target Support:** `PassManager.ts` must optionally accept an offscreen `GPUTexture` (instead of exclusively relying on `HTMLCanvasElement` / `GPUCanvasContext`) to accommodate headless environments like Deno.
- **Pure Functional Extraction:** Extract configuration and state mapping logic (e.g., calculating `actualRefMaxIter`, generating uniform camera buffers, parsing palettes) out of `PassManager.ts` into pure, stateless functions.
- **Remove Vitest GPU Mocks:** Eradicate heavily mocked `GPUDevice` tests from the Vitest suite in favor of testing the pure JS logic extraction, moving WebGPU pipeline assertions entirely to headless integration points.
- **Headless Execution Hook:** Expand engine execution APIs (`initEngine.ts` or similar) to expose an `executeTestRender(...)` command that runs the full 2-pass pipeline (`accum` + `present`) into an observable memory buffer.
- **General Fault Detection:** Introduce a new regression test in `run-headless.ts` that runs deep-zoom iteration batches through the `PassManager` and explicitly verifies the resulting texture arrays contain no mathematical faults (`NaN`, `Infinity`) or complete collapse artifacts (e.g., solid screen of pure Magenta or Black).

## Implementation Plan

1. **Extract Pure Uniform Math:** Refactor `PassManager.ts` by pulling the uniform sizing array construction (like `refOrbits.length - 8` calculations) out into a standalone, pure function like `buildCameraUniforms(state) -> Float32Array`.
2. **Purge Vitest GPU Mocks:** Delete the `mockDevice` structures and WebGPU API stubs from `src/engine/__tests__/PassManager.spec.ts`. Replace these with hyper-focused unit tests that strictly evaluate the newly extracted pure functions under diverse state bounds without utilizing WebGPU mocks.
3. **Decouple Canvas Dependency:** Modify `PassManager.ts` constructor and `render()` signatures. Pass a `GPUTextureFormat` natively into the constructor. Update `render()` to receive a distinct output target `GPUTextureView` rather than internally fetching `context.getCurrentTexture().createView()`.
4. **Implement `executeTestRender`:** In `initEngine.ts`, build an asynchronous pipeline that feeds deep-zoom coordinates to `PassManager`, allocates a `COPY_SRC | RENDER_ATTACHMENT` texture, executes the rendering passes, and maps the texture bytes back to a Javascript `Float32Array` or `Uint8Array`.
5. **Write the Anti-Glitch Test:** Inside `tests/run-headless.ts`, configure an extreme perturbation coordinate (like the one that previously caused the "magenta screen"). Execute `executeTestRender` and verify that the output RGBA bounds do not match known error gradients (`[255, 0, 255, 255]`) and that intermediate G-Buffer coordinates contain `isFinite()` validation.

## Verification Steps

- [x] Ensure `run-headless.ts` successfully triggers `PassManager` pipeline across Deno.
- [x] Confirm an explicit assertion checks presentation output for full-screen `NaN`-correlated colors (e.g., Magenta).
- [x] Verify existing frontend UI works as intended with the decoupled Canvas parameters.
- [x] **Documentation Sync:** Update `docs/test-plan.md` to reflect that UI/Presentation layer integrations are now validated natively via headless GPU runs.
