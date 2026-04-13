---
status: closed
---

# Task 006: Construct `mandelbrot_f32.wgsl` core shader

## Objective

Replace the placeholder pipeline gradient shader with a dedicated `.wgsl` file that computes the Mandelbrot set mathematically utilizing native GPU $f32$ layout formats.

## Relevant Design Docs

- [Math Backend Design](../math-backend-design.md)
- [Rendering Engine Design](../rendering-engine-design.md)

## Requirements

- **Externalize WGSL:** Abstract the WebGPU shader logic out of the TypeScript wrapper into a standalone `mandelbrot_f32.wgsl` file. Expose its raw string contents through Vite's `?raw` loader.
- **f32 Mandelbrot Translation:** Implement the canonical $z_{n+1} = z_n^2 + c$ escape-time loop up to a static maximum iteration cap.
- **Aspect Ratio Awareness:** Properly map the screen pixel fragment coordinates (`gl_FragCoord` equivalent) to the math domain $[-2.5, 1.5]$ scaling strictly relative to the canvas aspect ratio.
- **Test Compatibility:** Wire the compute pass entry point in the same file or conditionally route so `test:engine` still verifies the array math exactly.

## Implementation Plan

1. Create `src/engine/shaders/mandelbrot_f32.wgsl`.
2. Move and refactor the `fs_main` logic into the WGSL file.
3. Import the file into `initEngine.ts` utilizing `mandelbrotWgsl from './shaders/mandelbrot_f32.wgsl?raw'`.
4. Run mathematically and visually to ensure the shader renders the basic un-zoomed set (even as a binary black/white bounds initially).

## Verification Steps

- [ ] WebGPU successfully compiles the external WGSL file.
- [ ] Running the client draws a recognizable (black & white) Mandelbrot set spanning $[-2.0, 1.0]$.
- [ ] Headless runner (`npm run test:engine:deno`) mathematically matches.
