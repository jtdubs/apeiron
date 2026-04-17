---
status: closed
---

# Task 015: WebGPU Perturbation Shader Pipeline

## Objective

Implement the WebGPU side of the Perturbation Theory rendering logic. The compute shader will receive the $f64$ reference orbit and calculate the stable $f32$ difference for pixels, allowing zooms well beyond $10^{15}$.

## Relevant Design Docs

- `docs/design/engine/core-math.md`
- `docs/design/engine/webgpu-passes.md`

## Requirements

- **VRAM Data Transfer:** Use `device.queue.writeBuffer()` to efficiently stream the offloaded `Float64Array` reference orbits into the GPU buffer without freezing the context.
- **Shader Math:** Implement series approximation / delta proxy logic in the accumulating compute shader.
- **Testability & Determinism:** The output pixel states (escaped at iteration `n`, distance bounds) must be mathematically identical to the CPU ground truth within tests.

## Implementation Plan

1. Modify `math_accum.wgsl` (or equivalent compute shader) to accept a supplementary buffer containing the high-precision reference orbit.
2. Implement the mathematical logic calculating the $\Delta z$ (pixel delta offset) from the reference orbit.
3. Update edge-case behavior like "proxy collapse" detection and fallback to traditional `f32` or `f64` math when near the root coordinate.
4. Construct purely numerical tests passing deterministic 4D reference orbits into a headless WebGPU context and checking the computed offset buffers against expected arrays.

## Verification Steps

- [x] Does `device.queue.writeBuffer()` correctly populate the WebGPU buffers from the worker output?
- [x] Can the engine render a mathematically correct frame at $10^{16}$ zoom without blocky $f32$ artifacts?
- [x] **Testing:** Are there dedicated headless regression test fixtures for deep zoom perturbation coordinate mapping? Ensure data-first execution guarantees correct compute output before testing pixels.
