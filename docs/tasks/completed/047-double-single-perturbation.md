---
status: closed
---

# Task 047: Implement Double-Single (DS) Arithmetic for Perturbation

## Objective

Implement Double-Single (DS) arithmetic in the WebGPU shaders to emulate ~48-bit floating-point precision for the perturbation offsets (`dz` and `dc`). This resolves the "Perturbation Wall" pixelation degradation caused by $f32$ delta quantization at extreme deep-zoom scales ($> 10^{13}$), bringing the codebase into alignment with the documented design goals.

## Relevant Design Docs

- [Math Backend Design](../design/engine/core-math.md)
- [Apeiron Best Practices](../process/best-practices.md) (Standard boundary/testing rules apply)

## Requirements

- **DS Math Helpers:** Implement Double-Single mathematical operations (e.g., `ds_add`, `ds_mul`, `ds_sub`) inside the WebGPU shader framework.
- **Complex DS Arithmetic:** Create composite structures/functions combining Complex math with DS math (e.g., representing a DS-Complex number as `vec4<f32>` where `xy` are the hi/lo real parts, and `zw` are the hi/lo imaginary parts).
- **Update Perturbation Pipeline:** Refactor `calculate_perturbation` and Series Approximation (BLA) advances inside `math_accum.wgsl` to strictly use the new DS-Complex types for tracking $\Delta z$ and $\Delta c$.
- **Boundary Precision:** Ensure that the UI/Orchestrator generates and calculates `delta_c` using $f64$ Arrays in TypeScript before dispatching the `hi` and `lo` 32-bit floats across the WebGPU uniform boundary.

## Implementation Plan

1. Create a new WGSL module (e.g., `ds_math.wgsl`) to house the raw DS arithmetic functions.
2. Formally define the `DSComplex` structure alongside `complex_mul_ds` and `complex_add_ds`.
3. Add isolated unit tests to the existing WebGPU headless test-runner specifically targeting precision limits of the `ds_add` and `ds_mul` functions against known $f64$ constants.
4. Refactor the `CameraParams` uniform and `MemoryLayout.json` to accept `dc_high` and `dc_low` components.
5. Migrate the `math_accum.wgsl` perturbation iteration loop to utilize the new DS functions.
6. Verify performance impact via GPU telemetry `TimestampQuery` metrics to ensure the heavier DS loops don't shatter the `16.6ms` frame limit. Adjust chunking `stepLimit` if necessary.

## Verification Steps

- [x] Execute `WebGPUTestHarness` to verify the mathematical soundness of the new WGSL `ds_math` primitives.
- [x] Run headless test suite to ensure standard $f32$ logic wasn't broken by the refactor.
- [x] Render a frame at $10^{15}$ depth and compare visual pixelation/artifacting against the legacy $f32$ path.
- [ ] **Implementation standard:** Have all shared boundaries, extracted math helpers, or state-machine behaviors been strictly validated as headless deterministic units per `docs/process/best-practices.md`?
- [ ] **Documentation Sync:** Did this implementation drift from the original plan? If so, update `docs/design/engine/core-math.md`.
