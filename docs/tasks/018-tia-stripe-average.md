---
status: open
---

# Task 018: Triangle Inequality Average (Stripe Rendering)

## Objective

Introduce Triangle Inequality Average (TIA) logic into the G-Buffer accumulation pipeline for producing smooth visual bands, taking care to optimize it for deep perturbation rendering.

## Relevant Design Docs

- `docs/rendering-engine-design.md`

## Requirements

- **Deep Zoom Compression:** To prevent killing the Rust logic at depths $>10^{15}$, TIA must be computed in WebGPU using the $\Delta z$ proxy boundaries.
- **G-Buffer Expansion:** Store the resulting continuous float outputs into the accumulation buffer.

## Implementation Plan

1. Code the TIA algorithm within the $f32$ accumulation shader and the $f64$ emulated fallback.
2. Inject the TIA calculation directly against $\Delta z$ floats in the perturbation path.
3. Set up the Resolve shader to map TIA outputs into smooth cyclical sine-palettes.
4. Implement rigorous regression testing verifying continuous math generation, asserting smooth interpolation gradients rather than stepped results.

## Verification Steps

- [ ] Does stripe shading render smoothly?
- [ ] **Testing:** Does the numerical regression suite cover extreme zoom TIA proxies to ensure they don't break strict math test boundaries?
