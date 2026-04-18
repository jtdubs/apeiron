---
status: closed
---

# Task 073: Rust Math Kernel Native Testing

## Objectives

- Introduce comprehensive native unit tests for the core WebAssembly mathematical logic located in `rust-math/src/lib.rs`.
- Decouple WASM FFI bindings (`js_sys::Float64Array`) from the math routines strictly to enable headless native testing via `cargo test` without the overhead or friction of V8/Node JS emulators.
- Add test coverage for complex logic introduced in Task 065 (Double-Single BLA) and Task 070 (Reference Selection Optimization).

## Implementation Plan

1. Abstract `MathPayload` mapping into an inner `NativeMathPayload` component structurally decoupled from `js_sys`.
2. Enable `cargo test` via `npm run test:math` in the build orchestration.
3. Build comprehensive testing scopes within `math_tests.rs`:
   - Validating orbit generation and precision metadata metrics.
   - Covering integer exponent multiplication logic.
   - Covering fractional exponent trigonometric logic.
   - Asserting specific bounds on standard BLA logic and testing accurate reconstruction from DS BLA splitting parameters.
   - Testing exact Newton-Raphson targeting for Misiurewicz point references and period 2 Nucleus structures.

## Synthesis

This test suite drastically reduces regression risk moving forward, enabling confident structural improvements inside the execution pipelines. Natively executing the payload without FFI emulation layers guarantees lightning-fast execution during standard automated workflows.
