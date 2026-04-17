---
status: closed
---

# Task 036: Bilinear Approximation (BLA)

## Objective

Implement Bivariate Linear Approximation (BLA) to accelerate deep zoom perturbation rendering. BLA will allow the rendering engine to skip millions of iterations by calculating a linear proxy $\delta_{n+l} \approx A_l \delta_n + B_l \delta_c$. To support independent, per-pixel approximation boundaries, the Rust `math-core` will pre-compile a BLA block tree and provide it directly to the WebGPU fragment pipeline for dynamic traversal.

## Relevant Design Docs

- [docs/design/math-backend.md](../../design/math-backend.md)
- [docs/design/rendering-engine.md](../../design/rendering-engine.md)

## Requirements

1. **Rust BLA Tree Compilation:** Modify `compute_mandelbrot` to generate hierarchical BLA blocks (containing $A$, $B$ coefficients, error scalars, and step lengths) alongside the standard reference orbit.
2. **Deterministic Error Bounds:** The bounds must mathematically evaluate the neglected non-linear term ($\delta^2$) against a strict tolerance limit ($e.g., 10^{-6}$ precision factor scaled to pixel viewport dimensions) to guarantee zero visual artifacts.
3. **WebGPU BLA Traversal:** Introduce a new `storage` buffer binding in `math_accum.wgsl` to accept the serialized BLA tree. Modify the perturbation loop so that fragments independently parse the highest valid BLA block and rapidly advance their $Z$ states without uniform locking.
4. **Zero-Overhead Memory Transfer:** Pipe the BLA block tree directly from WASM memory to WebGPU VRAM without allocating intermediate JavaScript object trees. Check `performance.now()` in the WebWorker context to log compilation timing via the main console.

## Implementation Plan

1. **Rust Core (The Tree Builder):** Write a continuous block combinator in Rust that calculates the linear coefficients ($A_n$, $B_n$) and error envelopes sequentially over the reference orbit data, flattening them into a `Float64Array`.
2. **Worker & Orchestrator:** Add the transfer logic in `rust.worker.ts` and `PassManager.ts` to copy the new BLA buffer into a VRAM `GPUBuffer`.
3. **WGSL Shader Updates:** Augment `math_accum.wgsl`'s `calculate_perturbation` function. When parsing the reference orbit, evaluate the block error threshold natively per-pixel, applying the $A$ and $B$ linear projections and jumping forward if within bounds.

## Verification Steps

- [ ] Orbit generation and pixel traversal speed should vastly increase (magnitudes faster) on deep zooms >1e-50.
- [ ] No visual "glitching" or false escapes should be present (validates error bounds are tight).
- [ ] Ensure the JavaScript memory heap does not inflate during zooming, validating the buffer transfer logic.
