---
status: open
---

# Task 034: Limit Cycles & Interior Bounds

## Objective

Detect limit cycles natively in the Rust `math-core` by strictly evaluating polynomial derivatives (`der_since_check`), and surface this structural metadata through to the WebGPU perturbation shader so that interior pixels on the perturbation path exit their iteration loop early rather than always running to `max_iter`.

> **Scope boundary:** This task owns all interior early-out work for the **perturbation path** —
> both the Rust reference orbit computation and the WGSL `calculate_perturbation` loop. The
> equivalent early-out for the f32 native escape-time path is owned by **Task 046** (Shader
> Interior Early-Out — f32 Native Path).

## Relevant Design Docs

- [docs/math-backend-design.md](../math-backend-design.md)

## Requirements

- **Rust Periodicity Detection:** Add arbitrary precision cycle detection inside the primary Rust reference orbit calculation loop (e.g. caching historical Z vectors and checking for convergence via `der_since_check`). When a cycle is detected, record the period length and the iteration at which it was found.
- **WASM Metadata Propagation:** Extend the `Float64Array` memory layout passed from the Rust Web Worker to include cycle/period metadata so the GPU can consume it.
- **WGSL Early-Out in `calculate_perturbation`:** Use the cycle metadata from the Rust orbit (passed via uniform or storage buffer) to short-circuit the perturbation iteration loop when the reconstructed absolute orbit enters a detected periodic bound. Alternatively, embed Brent's algorithm directly in the WGSL perturbation loop if the Rust-flag approach proves insufficient for all interior regions.

## Implementation Plan

1. Inject periodicity thresholds inside the primary Rust calculation loops caching historical Z vectors.
2. Extend `WasmWorker` definitions in typescript to parse coordinate cycle boundaries.
3. Update `engine.ts` uniform bindings.
4. Short-circuit WGSL conditionals evaluating interior gradients.

## Verification Steps

- [ ] Run pure headless unit tests against known deep integer root matrices.
- [ ] **Documentation Sync:** Did this implementation drift from the original plan? If so, update relevant design docs.
