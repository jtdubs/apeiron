---
status: closed
---

# Task 021: Resolving Bivariate Glitch Bands

## Objective

Fix the geometric tearing, vertical color banding, and complete loss of render detail on deep zoom by correctly managing mathematical boundaries and variable assignments in the WebGPU perturbation engine.

## Relevant Design Docs

- [Rendering Engine Design](../../design/rendering-engine.md)
- [Math Backend Design](../../design/math-backend.md)

## Requirements

- **Mathematical Correctness:** The shader pipeline must correctly update mathematical iterations and correctly advance states without index mixing ($Z_n + dz_{n+1}$).
- **Precision Degradation Fallback:** When reference precision limits (escape) are met before a given subpixel mathematically resolves, properly execute a dynamic degradation fallback starting from the correctly evaluated $Z_n$ local properties, rather than resetting to root level `f32` representation.

## Implementation Plan

1. In `math_accum.wgsl` `calculate_perturbation`, supply `delta_z` directly instead of defaulting to `(0.0, 0.0)`.
2. Ensure mathematical check evaluates against `cur_x, cur_y` properly calculated with correct reference variables from index $n+1$.
3. When hitting the `ref_escaped_iter` barrier, pass the actual local properties `cur_x, cur_y` into `continue_mandelbrot_iterations` to retain macro-resolution using standard floats for visually accurate render endings.

## Verification Steps

- [x] All headless mathematical regression checks `npm run test:engine` verify outputs against WASM ground-truths correctly.
- [x] Run UI visually, zooming in until previously broken band barriers seamlessly maintain continuous structural detail dynamically degrading out of existence.
- [x] **Documentation Sync:** Added to roadmap appropriately.
