# Task 075: `math_accum.wgsl` Reorganization

status: closed

## Context

`math_accum.wgsl` has grown to over 1,100 lines and currently hosts multiple disparate architectural layers of the fractal engine, from bare-metal math functions to finite-state machine routers. This proposal outlines a structure to break the monolith into highly cohesive, focused modules.

## Proposed Module Structure

### 1. Pure Math Utility Shaders (`src/engine/shaders/math/`)

These modules will contain stateless mathematical functions. They must have **zero dependencies** on WebGPU buffer bindings or global engine parameters like `CameraParams`.

- **`complex.wgsl`**: Core vector-based algebra primitives (`complex_add`, `complex_mul`, `complex_sq`, `complex_div`, `complex_abs_sq`).
- **`polynomial.wgsl`**: Fractal geometric progression and spatial derivation algorithms (`step_polynomial`, `step_derivative`, `step_mandelbrot`).
- **`double_single.wgsl`** (formerly `ds_math.wgsl`): Emulated double-precision arithmetic (Dekker-Veltkamp split, `ds_add`, `ds_mul`, `complex_sq_ds`).
- **`f64_decode.wgsl`**: Binary unpacking functions that manipulate `vec2<u32>` bitwise blocks into standard `f32` and `ds` precision values (`unpack_f64_to_f32`, `unpack_f64_to_ds`). Perfectly bridges raw WebAssembly memory to WebGPU space.

### 2. Fractal Iterator Shaders (`src/engine/shaders/escape/`)

These files will encapsulate the explicit escape-time algorithms tied to specific zoom depths. Because they interact with the engine configuration, they uniquely depend on global `camera` and `checkpoint` buffers.

- **`standard_iteration.wgsl` (Level 1 - f32 Hardware)**:
  The brute-force execution layer (formerly named `standard_math`). Escapes pure math and dictates how the engine marches to bailout. Contains `continue_mandelbrot_iterations`, limit-cycle detection (Brent's Algorithm), and `get_escape_data`.
- **`bla_stepper.wgsl` (Level 2 & 3 - Acceleration)**:
  The BLA/BTA tree-traversal jump logic. Parses node arrays to exponentially leap mathematical loops over vast empty spaces. Contains `advance_via_bla` and `advance_via_bla_ds`.
- **`perturbation.wgsl` (Level 2 & 3 - Deep Runtime)**:
  The $\Delta Z$ arbitrary precision tracking engine, evaluating screen-space offsets against mathematical reference points. Contains `init_perturbation_state` and `calculate_perturbation`.

### 3. The Orchestrator Kernel (`src/engine/shaders/escape/math_accum.wgsl`)

Once stripped of iterators and util math, this file becomes a lightweight, highly readable execution router.

- **Imports**: Handles all `#import` directives in top-down structural order.
- **Memory Boundaries**: Declares all `@id` override constants and `@group(0) @binding(...)` inputs.
- **Execution Router**: Contains `execute_engine_math` to elegantly switch between Standard and Perturbation runtime branches.
- **Compute Pipelines**: Retains exclusively the WebGPU `@compute` entry points (`main_compute` and diagnostic `unit_test_*` pipelines) ensuring testing compilation perfectly wraps the external imports.

## Architectural Benefits

1. **Adherence to Best Practices**: Meets the explicit requirement from `docs/best-practices.md` demanding shader modularization and eliminating monolithic WGSL entries.
2. **Simplified Mental Map**: Pure math lives natively in `shaders/math/`. Bound iteration logic lives natively in `shaders/escape/`.
3. **Headless Unit-Testing Stability**: By leaving the `unit_test_*` endpoints in the main orchestrator, testing is fully decoupled from the underlying modular math APIs.
