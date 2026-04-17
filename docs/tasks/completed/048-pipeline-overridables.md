---
status: closed
---

# Task 048: Pipeline-Overridable Constants for Branch Elimination

## Objective

Replace static uniform evaluations (such as `camera.exponent`) inside the WGSL deep-zoom execution loops with WebGPU `@id(X) override` constants. This allows the GPU driver to natively compile and cache branch-stripped, mathematically specialized pipelines, freeing up ALUs and preventing uniform branch stalls.

## Relevant Design Docs

- [Rendering Engine Design](../design/engine/webgpu-passes.md)
- [Apeiron Best Practices](../process/best-practices.md)

## Requirements

- **WGSL Update:** Refactor `src/engine/shaders/escape/math_accum.wgsl` to replace hot-loop branching (like `if (camera.exponent == 2.0)`) with an override constant (`@id(0) override fractal_exponent: f32;`). This may also apply to the `camera.use_perturbation` toggle.
- **Orchestration Update:** Modify the WebGPU pipeline construction logic in TypeScript. Instead of blindly passing these variables into the `CameraParams` uniform buffer every frame, detect changes to these structural numbers and inject them via the `constants` dictionary when calling `device.createShaderModule` or `device.create*Pipeline`.
- **Pipeline Caching:** Because recompiling shaders per-frame is devastating to performance, the orchestrator MUST implement a Pipeline Cache. If a user switches from $D=2.0$ to $D=3.0$, the engine should pull the compiled Pipeline from a Map cache or compile it once and store it.

## Implementation Plan

1. Audit `math_accum.wgsl` for any uniform booleans or constants evaluated purely for control-flow deep within the iteration loops.
2. Upgrade these to `@id(...) override` syntax.
3. Update `ProgressiveRenderScheduler` or `PassManager` to maintain a caching dictionary of `GPURenderPipeline` / `GPUComputePipeline` objects keyed by their override combinations.
4. Remove the replaced fields from `schema/MemoryLayout.json` `CameraParams` struct to trim buffer payload size. Let schema compile scripts regenerate buffers.

## Verification Steps

- [ ] Run headless test suite to verify structural rendering hasn't regressed.
- [ ] Measure exact kernel execution times using GPU `TimestampQuery` before and after deployment on a deep $d=2$ Mandelbrot zoom.
- [ ] **Implementation standard:** Have all shared boundaries, extracted math helpers, or state-machine behaviors been strictly validated as headless deterministic units per `docs/process/best-practices.md`?
