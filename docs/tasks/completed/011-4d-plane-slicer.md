---
status: closed
---

# Task 011: 4D Parameter Space Viewport Slicer

## Objective

Update the UI state, the Rust math execution, and the WebGPU parameter buffers to explicitly map a 2D plane passing through the 4D coordinate definition `[zr, zi, cr, ci]` instead of utilizing strict 2D coordinate constraints.

## Relevant Design Docs

- [Math Backend Design](../../design/math-backend.md)
- [Rendering Engine Design](../../design/rendering-engine.md)
- [Frontend Design](../../design/frontend.md)

## Requirements

1. **4D State Conversion:** Update `useViewportStore` to hold native representation for the 4D origin `[zr, zi, cr, ci]`. Plus, maintain a `sliceAngle` parameter (0 to $\pi/2$).
2. **Camera Configuration:** Update WebGPU `CameraParams` to accept the 4D center and the interpolation angle bridging the Mandelbrot and Julia set geometries.
3. **Interactive 4D Slicing:** Add an event listener to the `<canvas>` for middle-mouse drag (horizontal axis `movementX`) that smoothly rotates the `sliceAngle` between 0 (Mandelbrot) and 90 degrees (Julia plane).
4. **Core Shader Iteration:** Refactor `mandelbrot_f32.wgsl`'s math loop (`z = z^2 + c`) to derive the actual fragment `c` and `z_0` iteratively from the interpolated 4D parameters.
5. **WASM Math Core Verification:** Ensure `rust-math/src/lib.rs` and our ground-truth tests properly calculate iterations via the 4D slicer parameters, maintaining test equivalence.

## Implementation Plan

1. ...

## Verification Steps

- [ ] ...
