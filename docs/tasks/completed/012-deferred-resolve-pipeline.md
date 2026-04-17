---
status: closed
---

# Task 012: Refactor f32 Shader into Deferred Resolve Pipeline (G-Buffer)

## Objective

Split the existing `mandelbrot_f32.wgsl` into a two-pass architecture (Accumulation Pass + Presentation Pass) to decouple mathematical iteration from UI theme rendering.

## Relevant Design Docs

- `docs/design/engine/webgpu-passes.md`

## Requirements

- **G-Buffer Decoupling:** The initial WebGPU compute/fragment pass must output raw mathematical statistics (e.g., Continuous Iteration count, Distance Estimation, TIA proxy) into an intermediary buffer texture instead of applying colors directly.
- **Presentation Shader:** Create a separate resolve fragment shader that continuously runs at 60fps, reading the intermediate G-Buffer and dynamically applying Trigonometric Cosine Palettes.
- **Legacy Theme Support:** Ensure the Presentation Shader supports the legacy procedural `a,b,c,d` Cosine mapping approach to rebuild the legacy themes (`midnight`, `neon`, etc.).

## Implementation Plan

1. Rename/Refactor `mandelbrot_f32.wgsl` into distinct `math_accum.wgsl` and `resolve_present.wgsl` pipelines inside `src/engine/shaders/`.
2. Update the `initEngine.ts` wrapper to provision the intermediate G-Buffer textures.
3. Update the render loop to execute the math pass, and unconditionally execute the resolve pass at 60fps to apply current UI theme uniforms.
4. Establish the Uniform Buffer layout for the Cosine palettes (`a, b, c, d` vectors).

## Verification Steps

- [x] Does the UI correctly shift colors instantly at 60fps when themes are switched, without recalculating fractal coordinates?
- [x] Are headless regression tests still able to pull standard numerical arrays (ignoring color space mappings)?
- [x] **Documentation Sync:** Did this implementation drift from the original plan? If so, update `docs/design/engine/webgpu-passes.md` before closing this task.
