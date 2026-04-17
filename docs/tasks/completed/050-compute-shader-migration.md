---
status: closed
---

# Task 050: Compute Shader Migration (Quad Divergence Elimination)

## Objective

Migrate the primary deep-zoom iteration loops from the hardware Fragment pipeline (`@fragment fs_main`) strictly into the Compute pipeline (`@compute main_compute`). This eliminates the catastrophic "Quad Divergence Penalty" where hardware forces early-escaping pixels to stall on the ALU to accommodate adjacent interior pixels trapped in deep iterations.

## Relevant Design Docs

- [Rendering Engine Design](../design/engine/webgpu-passes.md)
- [Temporal Pipeline FSM](../design/engine/temporal-pipeline.md)

## Requirements

- **Compute Pipeline Separation:** Physically decouple the math accumulation execution from UI canvas rendering. The math engine must operate purely as a `GPUComputePipeline` writing dimensional limits to the G-Buffer (either `texture_storage_2d` or the `CheckpointState` linear storage arrays).
- **Presentation Fragment Pass:** Create or repurpose a lightweight `GPURenderPipeline` fragment shader that simply paints the canvas by linearly sampling the results calculated by the aforementioned Compute pass. **No mathematical `for/while` limits should exist in this presentation pass.**
- **DRS-Aware Compute Dispatches:** Add explicit `drs_width` and `drs_height` mapping constants to the `CameraParams`. The TypeScript orchestration layer must issue optimized `dispatchWorkgroups(ceil(drsW/16), ceil(drsH/16))` commands, allowing Compute to gracefully downscale calculation loads without breaking UV-to-Math coordinate conversions.

## Implementation Plan

1. Refactor `src/engine/shaders/escape/math_accum.wgsl` to centralize all execution loops inside `@compute @workgroup_size(16, 16) fn main_compute(...)`.
2. Replace local Fragment UV coordinates with global thread coordinates: `let uv = vec2<f32>(global_id.xy) / vec2<f32>(camera.drs_width, camera.drs_height);`.
3. In TypeScript (`ProgressiveRenderScheduler` or `PassManager`), encode the frame by first running the `ComputePassEncoder` with the mapped math buffers.
4. Immediately follow the Compute pass with a `RenderPassEncoder` linking the mathematical buffers to the Canvas swap-chain via the lightweight color-resolve shader.
5. Plumb the Interaction store's Dynamic Resolution Scaling (DRS) directly into the Compute dispatch logic to naturally shrink the hardware thread request payload during panning.

## Verification Steps

- [ ] Disable the 16.6ms limiter briefly and observe the raw `TimestampQuery` execution time differences for a deep-interior zoom between the Fragment approach and the Compute approach. A drastic reduction in execution spikes should occur.
- [ ] Test the Interaction state panning to verify that Dynamic Resolution Scaling (DRS) functions gracefully down-dispatches the math workload while interpolating onto the full-size UI canvas correctly.
- [ ] **Implementation standard:** Have all shared boundaries, extracted math helpers, or state-machine behaviors been strictly validated as headless deterministic units per `docs/process/best-practices.md`?
- [ ] **Documentation Sync:** Once validated, heavily revise `docs/design/engine/webgpu-passes.md` to reflect the total reliance on Compute kernels for the accumulator pass.
