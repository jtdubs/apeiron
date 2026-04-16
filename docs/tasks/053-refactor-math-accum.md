---
status: open
---

# Task 053: Refactor Math Accumulation Shader

## Objective

Decomplexify `src/engine/shaders/escape/math_accum.wgsl` by extracting inline complex arithmetic into standalone helper functions, modularizing the monolithic execution loops (e.g., `calculate_perturbation` and `continue_mandelbrot_iterations`), and explicitly documenting how the iterative logic interacts with the overarching Temporal Pipeline FSM.

## Relevant Design Docs

- [Math Backend Design](../math-backend-design.md)
- [State Machine Architecture](../state-machine-architecture.md)
- [Test Plan](../test-plan.md)

## Requirements

- **Requirement 1: Complex Math Abstraction:** Abstract inline algebraic expansions (multiplications, exponents, cross-products) into a cohesive set of complex math helpers (e.g., `complex_pow`, `complex_sq`, `complex_add`) to improve readability of structural expansions.
- **Requirement 2: Modularized Perturbation Phases:** Break `calculate_perturbation` into smaller execution blocks. Specifically isolate the `Series Approximation` (SA) initialization logic, and the standard initialization / checkpoint resumption logic into an `init_perturbation_state` function.
- **Requirement 3: BLA Loop Extraction:** Extract the deeply nested Bilinear Approximation fallback logic out of the main iteration loop into an autonomous `advance_via_bla` routine.
- **Requirement 4: De-duplicate Exponent Iterators:** The manual derivative/polynomial calculations for `f32` scaling (`camera.exponent == 2.0`, integer limits, or floats) must be cleanly extracted into standalone step functions (e.g., `step_mandelbrot(...)`).

## Implementation Plan

1. (Tests First) Ensure the headless test runner produces a pristine, bit-perfect regression snapshot of rendering outputs before any modifications.
2. Extract the complex variable logic into functional helpers at the top of the file.
3. Extract `advance_via_bla` and place it above `calculate_perturbation`. Replace the inline BLA loops with simple deterministic checks against the new helper.
4. Extract the initialization block (Checkpoints and SA bounds logic) and routing logic.
5. Document all paths with inline explanations, notably explaining how the `yield_iter_limit` drives multi-frame `CheckpointState` storage in synchronization with the `ProgressiveRenderScheduler`.
6. Run the headless testing suite to assert bit-perfect parity.

## Verification Steps

- [ ] **Regression Snapshots:** The modifications inside `math_accum.wgsl` must produce exact byte-for-byte matching output ArrayBuffers in the downstream engine tests.
- [ ] **Visual Parity:** Test deep-zooming interactively on `main` branch to observe boundary tracking/BLA correctness during panning without artifacts.
- [ ] **Documentation Sync:** No new architectural documents are required for pure extraction tasks.
