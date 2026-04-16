---
status: closed
---

# Task 054: Compute Shader Unit Testing Architecture

## Objective

Design and implement a deterministic testing architecture that leverages alternate `@compute` entry points within WGSL shaders to execute isolated unit tests for internal math components and specific algorithmic pathways independent from the broader rendering pipeline.

## Relevant Design Docs

- [Test Plan](../test-plan.md)

## Requirements

- **Requirement 1: Design Phase:** Explicitly document the methodology for WGSL unit testing in `docs/test-plan.md`. This includes defining standard unit-test data layouts (`test_in`, `test_out` buffers) and the strict `@compute fn unit_test_...` naming convention.
- **Requirement 2: Engine Setup:** Modify `engine.deno.ts` (or the underlying headless initialization block) to allow explicitly specifying the `entryPoint` compiler directive when creating the compute pipeline, rather than defaulting instantly to `main_compute`.
- **Requirement 3: First Live Tests:** Implement an alternate entry point test for the newly extracted `complex_mul` or `complex_sq` mathematical logic from Task 053.
- **Requirement 4: Headless Integration:** Integrate these alternate-entry verification stages directly into `npm run test:engine` so they automatically act as CI gatekeepers.

## Implementation Plan

1. Update `docs/test-plan.md` adding "Layer 2 Flavor D: Isolated WGSL Unit Tests" describing alternate compute entry points.
2. Modify the headless test adapter class handling bindings. Ensure that if `test_mode` arrays are injected, they dynamically construct `BufferBindingType.storage` blocks specifically tailored for the `test_in` size limits rather than the monolithic G-Buffer dimensions.
3. Within `math_accum.wgsl` (or `lib_complex.wgsl`), append the new `@compute fn unit_test_complex_math` entry point block.
4. Write a Deno unit test file (e.g. `tests/engine/ComputeUnit.test.ts`) that initializes the WebGPU wrapper targeting the alternate entry point, dispatches a set of known vectors, mapping the `test_out` ArrayBuffer back to strict TypeScript assertions.

## Verification Steps

- [x] **Headless Test Hookup:** Running the new test directly triggers the unit test.
- [x] **Red/Green Flow:** An intentionally broken complex math sequence safely throws a native JS assertion failure, proving test fidelity without WebGPU rendering artifacts or crashes.
- [x] **Documentation Sync:** Validate that `docs/test-plan.md` has been expanded.
