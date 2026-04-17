---
status: closed
---

# Task 016: React Perturbation Wiring

## Objective

Bridge the gap between the React UI controls and the newly implemented Rust Web Worker & WebGPU Perturbation shaders. This will enable smooth, interactive deep zooming directly within the browser canvas, bypassing traditional floating-point limits natively within the application.

## Relevant Design Docs

- `docs/architecture/system.md`
- `docs/design/rendering-engine.md`

## Requirements

- **Offload Central Orbit:** When the user is exploring at a zoom depth below the safe bounds of `f32` (approx $< 10^{-5}$), the UI must orchestrate passing the current viewport's center coordinates to the `rust.worker.ts`.
- **Dynamic Render Context:** The React interface must pass the worker's returned `Float64Array` reference orbit back into the `initEngine.ts` pipeline via a new VRAM buffer assignment.
- **Fragment Shader Toggle:** `fs_main` in the WebGPU canvas pipeline needs to conditionally switch from `calculate_mandelbrot_iterations` (fast f32) to `calculate_perturbation` (proxy math) based on the presence of the reference orbit.
- **Performance:** Calculating the orbit in the Web Worker can take several milliseconds. Ensure the main thread is not blocked, and consider displaying a loading state or using the History Cache (Mipmapping) while the reference orbit resolves.

## Implementation Plan

1. Create a `MathContext` or Zustand store slice to handle high-precision viewport triggers (e.g. tracking when `scale` demands perturbation).
2. Wire up the generic `rust.worker.ts` integration so it can receive messages directly from the React UI context.
3. Update `initEngine.ts` `renderFrame` to accept an optional `refOrbits` buffer during interactive canvas painting, not just during static headless testing.
4. Refactor `math_accum.wgsl`'s `fs_main` fragment pass to use `calculate_perturbation` and delta pixel logic ($\Delta c =$ mapped $uv$ - center $uv$).

## Verification Steps

- [x] Does the UI cleanly transition from `f32` default rendering to Perturbation without crashing?
- [x] Can you zoom into the Seahorse valley interactively past $10^{15}$ depth without encountering blocky pixel artifacts?
- [x] Is frame-rate maintained during panning (using previous patch or mipmapping) while waiting for the Web Worker to compute a new reference anchor?
