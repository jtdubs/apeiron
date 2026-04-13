---
status: open
---

# Task 013: Rust Origin Limit-Cycle Detection

## Objective

Offload Deep Zoom interior Limit-Cycle boundary checking into the WASM Rust core to prevent `f32` proxy collapse in WebGPU during perturbation phase rendering.

## Relevant Design Docs

- `docs/math-backend-design.md`

## Requirements

- **Origin Cycle Check:** The `rust-math/src/lib.rs` logic must track recursive derivatives (`der_since_check`) while walking the deep reference orbit to accurately verify limit-cycle periodicity.
- **Reference Orbit Payload:** The returned Rust ArrayBuffer must be expanded to include not only the orbit coordinates, but the final `der_since_check` metadata to allow the GPU to calculate distance estimation for bounded sections.

## Implementation Plan

1. Refactor the `compute_mandelbrot` loop in `lib.rs` to support full arbitrary precision tracking (`BigDecimal` integration).
2. Implement cycle checking thresholds during the internal iteration loop to trap cycles without infinite processing.
3. Append limit cycle payload metadata onto the tail of the exported `Float64Array`.

## Verification Steps

- [ ] Does the Rust logic correctly flag well-known interior limit cycles (e.g. `0,0`) and return bounded derivative metadata?
- [ ] Do headless tests confirm output shape parity with the updated metadata structure?
- [ ] **Documentation Sync:** Did this implementation drift from the original plan? If so, update `docs/math-backend-design.md` before closing this task.
