---
status: closed
---

# Task 003: Implement Rust WASM math-core unit testing arrays

## Objective

Create the native Rust arbitrary precision calculation module to act as the mathematical "Ground Truth" for fuzz testing the subsequent WebGPU engine.

## Relevant Design Docs

- [Math Backend Design](../../design/engine/core-math.md)
- [Test Plan & Debugging Methodology](../../process/test-plan.md)

## Requirements

- **BigFloat Ground Truth:** Utilize Rust arbitrary precision types to calculate the Mandelbrot set (or equivalent formula) without `f32`/`f64` degradation.
- **Data-First API:** The module must ingest a defined JSON region (coordinates, zoom state) and output `[Iteration, EscapedAt]` arrays.
- **WASM Pipeline:** Package this logic to compile into WebAssembly for use directly in the browser or via NodeJS headless workers.

## Implementation Plan

1. Initialize `cargo` project within the established mathematical boundary directory.
2. Implement core math iteration logic using arbitrary precision types.
3. Expose WASM bindgen functions to JavaScript.
4. Scaffold `tests/cases.json` data inputs.
5. Provide an `npm run build:math` orchestration script dynamically built in the root `package.json`.

## Verification Steps

- [ ] Compilation succeeds without errors using `wasm-pack` or equivalent tooling.
- [ ] Function is consumable in TypeScript and successfully calculates the iterations for `tests/cases.json` inputs.
- [ ] Array outputs demonstrably avoid `f32` precision collapse at zoomed subsets.
- [ ] **Documentation Sync:** Did this implementation drift from the original plan? If so, update `docs/design/engine/core-math.md` before closing this task.
