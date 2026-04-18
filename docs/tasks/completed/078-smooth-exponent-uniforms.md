---
status: closed
---

# Task 078: Smooth Exponent Uniform Migration

## Objective

Decouple the numerical fractal exponent from the WebGPU pipeline override constants, migrating it into the fast-path uniform buffer to support smooth, continuous fractional exponent rendering without triggering asynchronous pipeline recompilation stalls.

## Relevant Design Docs

- [Rendering Engine Design](../design/engine/webgpu-passes.md)
- [048-pipeline-overridables-completed.md](completed/048-pipeline-overridables.md)
- [Apeiron Best Practices](../process/best-practices.md)

## Requirements

- **Uniform Buffer Migration:** Add `exponent` back into the `CameraParams` structure within `schema/MemoryLayout.json` so it can be uploaded every frame without halting the engine.
- **WGSL Override Refactoring:** In `core_compute.wgsl` and other math components, replace `override fractal_exponent: f32` with an `override exponent_branch_mode: f32`. The `exponent_branch_mode` `@id` will be used exclusively to select pre-compiled fast paths (e.g., `0` = dynamic generic `pow()`, `1` = unrolled z^2 math).
- **PassManager Sync:** Update `PassManager.ts` to derive the `exponent_branch_mode` pipeline cache key based on the current exponent value (e.g. checking for `2.0`). The numerical exponent itself must be packed into `packCameraParams` on every tick.
- **WASM Coordination:** Ensure that `PerturbationOrchestrator.ts` continues to treat changes to the exponent correctly for triggering Rust deep-zoom orbits (`isRefining` condition logic).

## Implementation Plan

1. Modify `schema/MemoryLayout.json` to insert `exponent` into `CameraParams`. Execute `npm run build:schema`.
2. Update `src/engine/shaders/escape/core_compute.wgsl` to swap `fractal_exponent` override for `exponent_branch_mode`, and pull the actual math exponent from `camera.exponent`.
3. Update `src/engine/PassManager.ts` to load `exponent` via `packCameraParams`.
4. Modify pipeline caching in `PassManager` to key off `exponent_branch_mode` (0 or 1) rather than the precise float value of the exponent to eliminate recompilation spam.
5. Fix `src/ui/components/ApeironHUD.tsx` and `ScrubbableNumber.tsx` configuration to operate at a perfectly smooth `step={0.01}` quantum.

## Verification Steps

- [x] Write a headless test or adjust `RenderOrchestrator.spec.ts` asserting that changing `exponent` by `0.01` does NOT change the cached pipeline mode, but DOES invalidate the progressive scheduler context.
- [x] Ensure `npm run test` passes without breaking the `PassManager` pipeline allocation.
- [x] Run the UI and scrub the exponent smoothly across fractional boundaries; FPS should remain locked with identical response times.
- [x] **Implementation standard:** Have all shared boundaries, extracted math helpers, or state-machine behaviors been strictly validated as headless deterministic units per `docs/process/best-practices.md`?
- [x] **Documentation Sync:** Did this implementation drift from the original plan? If so, update `docs/[relevant-design].md` and `docs/product/requirements.md` before closing this task.
