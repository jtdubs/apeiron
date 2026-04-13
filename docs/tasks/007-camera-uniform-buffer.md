---
status: open
---

# Task 007: Wire Camera Uniform Buffer to WebGPU

## Objective

Bind the dynamic camera view parameters (Center X, Center Y, and Scale/Zoom) strictly through a WebGPU Uniform buffer allowing the screen map to translate into arbitrary mathematical space dynamically.

## Relevant Design Docs

- [Frontend Design](../frontend-design.md)
- [Rendering Engine Design](../rendering-engine-design.md)

## Requirements

- **Uniform Buffer Struct:** Define a WGSL struct to receive the `vec2<f32>` view center, an `f32` scale parameter, and an `f32` aspect ratio.
- **Device Buffer Sync:** Create the corresponding WebGPU `buffer` and `bindGroup` configuration in `initEngine.ts` to seamlessly update graphics memory every frame exactly _prior_ to `draw()`.
- **Zero React Re-render:** Define a decoupled object containing target coordinate destinations that the Engine loop reads manually, bypassing React `useLayoutEffect` entirely.

## Implementation Plan

1. Modify `mandelbrot_f32.wgsl` to accept `@group(0) @binding(0) var<uniform> camera: CameraParams;`.
2. Instantiate `cameraBuffer` memory block within `initEngine.ts` mapped via `device.createBuffer`.
3. Modify the engine `renderFrame()` loop to explicitly accept mutable `x`, `y`, `zoom`, and update the GPU buffer via `device.queue.writeBuffer` prior to the render pass.

## Verification Steps

- [ ] Hardcoded changes in TypeScript successfully pass into WebGPU and displace the Mandelbrot view on reload.
- [ ] WebGPU frame logs zero memory leaks resulting from orphaned buffers on resize/reload.
