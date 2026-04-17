---
status: closed
---

# Task 049: Register Pressure Audit & Checkpoint Compression

## Objective

Audit and minimize the live variable count (Vector General Purpose Register pressure) inside the `math_accum.wgsl` execution loops. Compress the `CheckpointState` struct to reduce global memory bandwidth costs during chunked FSM execution, preventing catastrophic implicit register-spilling by the GPU compiler.

## Relevant Design Docs

- [Data Boundaries & Memory Layout](../architecture/data-boundaries.md)
- [Temporal Pipeline FSM](../design/engine/temporal-pipeline.md)

## Requirements

- **Checkpoint Compression:** Analyze the 32-byte `CheckpointState` struct. Determine if precision logic allows structural elements (like perturbation `dz_x`/`dz_y` vs macro `zx`/`zy`) to be union-packed or derived. For example, if a pixel escapes early, we might not need to write back 8 distinct floats.
- **Defer Derivation Logic:** Offload structural metric tracking (such as `tia_sum` Triangle Inequality calculations or normal derivative accumulation) out of the hot pixel-processing loop. If possible, calculate these uniquely for escaped pixels in a separate lightweight execution pass or strictly isolate them to independent functions rather than carrying the registers across the whole `while` loop horizon.
- **Variable Lifetime Reduction:** Refactor `continue_mandelbrot_iterations` and `calculate_perturbation` to constrain the scope of temporary calculations. Avoid declaring variables outside the minimum necessary block so the compiler can confidently recycle the hardware registers.

## Implementation Plan

1. Trace the longest execution path inside the WGSL `while` loop and tally the theoretical active `f32` registry count.
2. Investigate whether `tia_sum` or BLA `bla_res` variables can be localized.
3. Update `schema/MemoryLayout.json` to alter `CheckpointState` if you discover packable elements. Update the corresponding `rust-math`, `TS`, and `WGSL` mappings via the build script.

## Verification Steps

- [x] Measure execution bounds during `DEEPENING` State. The goal is an observable drop in average ms-per-kernel or an observable capability to raise the `stepLimit` budget per frame without blowing the 16.6ms threshold.
- [x] Render headless mathematical tests to guarantee identical pixel limits for deep zoom boundaries.
- [x] **Implementation standard:** Have all shared boundaries, extracted math helpers, or state-machine behaviors been strictly validated as headless deterministic units per `docs/process/best-practices.md`?
