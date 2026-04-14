---
status: open
---

# Task 034: Limit Cycles & Interior Bounds

## Objective

Detect limit cycles natively in the Rust `math-core` by strictly evaluating polynomial derivatives (`der_since_check`), and pipe this exact structural metadata into the WebGPU Uniforms to securely map the fractal interior, eliminating infinite depth "Proxy Collapse" bound freezes.

## Relevant Design Docs

- [docs/math-backend-design.md](../math-backend-design.md)

## Requirements

- **Rust Periodicity Toggles:** Add arbitrary precision bounding checks looking for repetitive interior mathematical bounds.
- **WASM Memory Inheritance:** Push structural derivative traits immediately after `Float64Array` execution memory bounds block.
- **WGSL Halt Flags:** Modify the perturbation fragment shader (`mandelbrot_perturbation.wgsl`) to accept interior bounding flags halting computation if entering mathematical limit boundaries.

## Implementation Plan

1. Inject periodicity thresholds inside the primary Rust calculation loops caching historical Z vectors.
2. Extend `WasmWorker` definitions in typescript to parse coordinate cycle boundaries.
3. Update `engine.ts` uniform bindings.
4. Short-circuit WGSL conditionals evaluating interior gradients.

## Verification Steps

- [ ] Run pure headless unit tests against known deep integer root matrices.
- [ ] **Documentation Sync:** Did this implementation drift from the original plan? If so, update relevant design docs.
