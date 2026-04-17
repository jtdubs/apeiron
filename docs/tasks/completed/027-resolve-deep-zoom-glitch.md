---
status: closed
---

# Task [002]: Resolve Deep Zoom (1e-4) Loss of Detail & Black Voids

## Objective

Fix the mathematics and precision pipeline for deep zooms beyond `zoom < 1e-4`, which currently exhibit loss of detail and generate black voids upon proxy fallback due to WebGPU `Float32` truncation in reference orbits and a disconnected `start_c` vector in the escape fallback logic.

## Relevant Design Docs

- `docs/design/engine/core-math.md`
- `docs/design/engine/webgpu-passes.md`
- `docs/process/test-plan.md`

## Requirements

- **Reference Orbit Precision:** The WebGPU `PassManager.ts` must maintain the high-precision reference orbits obtained from the Rust math-core without brutally downcasting them directly to a JavaScript `Float32Array`.
- **Proxy Void Fallback Continuity:** When perturbation fails and must dynamically degrade to standard `continue_mandelbrot_iterations`, the fallback must receive the _absolute_ Cartesian coordinate (`anchorC + deltaC`) rather than relying solely on `deltaC` alone, avoiding iteration against the center of the Mandelbrot set ($C \approx 0$).
- **Test Covariance:** The headless node suite (`test:engine`) must procedurally evaluate deep-zoomed delta bounds ($\Delta c \approx 10^{-15}$).

## Implementation Plan

1. **Test Coverage Expansion:** Update `tests/cases.json` with deep zoom anchors spanning over 20-30 digits of precision. Modify `tests/run-headless.ts` to offset these precise points by highly constricted float ranges (`1e-15` or smaller) and enforce strict mathematically verified expectations.
2. **Fallback Handoff Coverage:** Add tests to specifically identify and fail early-escaped trajectories in perturbation that successfully hand off computation back into proxy $f32$ boundaries without generating mathematical blacks voids.
3. **Buffer Promotion:** Refactor `PassManager.ts` and WGSL arrays to consume the raw `Float64Array` bytes, natively buffering variables as `u32` splits or similar precision methods to enforce resolution continuity before the $\Delta$ calculation loop kicks in.
4. **Anchor Parameter Injection:** Redefine the `CameraParams` WGSL buffer payload in `math_accum.wgsl` and `PassManager.ts` to retain the absolute numerical baseline of the anchor ($C$), bypassing the `isPerturb` delta shrinkage so the fallback routine can adequately resolve limits.

## Verification Steps

- [ ] Execute `npm run test:engine` and confirm the generated cluster traces correctly compare bounds accurately well below `1e-15` precisions against actual mathematically-derived matrices computed physically by the standalone WebWorker cache.
- [ ] Render a local development scene at sizes deeper than `zoom = 1e-6` and verify detail remains critically sharp across all boundaries and deep transitions do not yield black voids.
- [ ] **Documentation Sync:** Confirm all mathematical and test architectural implementations remain accurately documented inside `docs/design/engine/webgpu-passes.md` and `docs/process/test-plan.md`.
