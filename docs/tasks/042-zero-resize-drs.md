---
status: open
---

# Task 042: Zero-Resize Dynamic Resolution Scaling

## Objective

Eliminate the GPU surface resize stall that causes a latency spike when transitioning from `STATIC`
to `INTERACT` mode on mobile devices by implementing viewport-scissor-based DRS entirely inside the
GPU, keeping the canvas and G-Buffer textures permanently fixed at full native resolution.

## Relevant Design Docs

- `docs/rendering-engine-design.md`

## Background

The current DRS strategy mutates `canvas.width` / `canvas.height` between `STATIC` (full DPR) and
`INTERACT` (1× DPR). Every size change triggers `engine.resize()` → `initGBuffer()`, which destroys
and recreates all G-Buffer `GPUTexture` objects and bind groups. On mobile GPU drivers this stall is
typically **10–50 ms**, manifesting as a visible "hiccup" on the first pan movement after the finger
touches the screen.

The fix: never change the canvas or G-Buffer dimensions at runtime. Instead, add a `renderScale`
uniform that the accumulation pass receives as a draw-viewport + scissor-rect constraint, and that
the resolve-present pass uses to remap its UV sampling so the low-res quadrant fills the full output.

## Requirements

- **Fixed Canvas Size:** The `<canvas>` element must be sized once on mount (and only on a genuine
  window resize via `ResizeObserver`). It must not be resized on `interactionState` transitions.
  `canvas.width` and `canvas.height` must equal `cssWidth × devicePixelRatio` at all times.

- **Fixed G-Buffer Size:** `PassManager.initGBuffer()` must only be called when the canvas
  dimensions genuinely change (genuine resize). It must never be called as a result of
  `interactionState` changing.

- **`renderScale` Uniform:** A `renderScale: f32` field (value `1.0` for `STATIC`, `1/devicePixelRatio`
  for `INTERACT_SAFE`/`INTERACT_FAST`) must be added to `CameraParams` in
  `math_accum.wgsl` and written via `buildCameraUniforms()` / `uniforms.ts`.

- **Accumulation Pass Scissor/Viewport:** In `AccumulationPass.execute()`, before
  `mathPass.draw(6)`, call:
  - `mathPass.setViewport(0, 0, renderWidth, renderHeight, 0, 1)` — limits rasterization to the
    scaled sub-rect.
  - `mathPass.setScissorRect(0, 0, renderWidth, renderHeight)` — prevents writes outside that region.
    Where `renderWidth = floor(fullWidth × renderScale)`, `renderHeight = floor(fullHeight × renderScale)`.

- **Resolve Pass UV Remap:** In `resolve_present.wgsl`, replace the direct `textureLoad` coordinate
  with a remapped coordinate: scale `in.position.xy` by `renderScale` so the sub-rect content
  stretches to fill the full canvas during INTERACT, and pass through unchanged during STATIC
  (`renderScale == 1.0`).

- **`renderStateKey` Cleanup:** Remove `canvas.width` and `canvas.height` from the
  `baseGeometryKey` string in `ApeironViewport.tsx`. The canvas dimensions are now stable and should
  not be part of the diff key — including them would force a full `frameCount` reset on every
  genuine window resize unnecessarily. Use a separate `canvasSizeKey` reset path guarded by the
  `ResizeObserver` callback.

- **Backward Compatibility:** Desktop behaviour (mouse drag, wheel zoom) must be unchanged. The
  `INTERACT_SAFE` / `INTERACT_FAST` / `STATIC` state transitions remain identical; only the DRS
  mechanism changes.

## Implementation Plan

1. **`uniforms.ts`:** Add `renderScale: f32` as the 16th field in `buildCameraUniforms()` (replacing
   the existing `pad` zero), shifting no other fields so the 64-byte uniform buffer layout is
   preserved.

2. **`math_accum.wgsl`:** Add `render_scale: f32` to `CameraParams` struct in place of `pad`. No
   other shader math changes.

3. **`resolve_present.wgsl`:** In `fs_main`, replace:

   ```wgsl
   let coord = vec2<i32>(floor(in.position.xy));
   ```

   with:

   ```wgsl
   let coord = vec2<i32>(floor(in.position.xy * params.render_scale));
   ```

   Add `render_scale: f32` to the `ResolveUniforms` struct (in place of `pad`). This remaps the
   full-canvas fragment position into the sub-rect texel space during INTERACT.

4. **`PassManager.ts`:**
   - Add `renderScale`, `renderWidth`, `renderHeight` parameters to `AccumulationPass.execute()`.
   - Before `mathPass.draw(6)`, call `setViewport` and `setScissorRect` with the scaled dimensions.
   - Add `renderScale` to the `paletteUniformsBuffer` write (slot `render_scale` in
     `ResolveUniforms`) so the resolve pass receives it each frame.
   - Remove the early-exit `if (width !== this.width || height !== this.height) { this.initGBuffer(...) }` guard from `render()` — replace it with a stricter check that only triggers on genuine canvas-level resize, not on scale changes.

5. **`ApeironViewport.tsx`:**
   - Remove the `canvas.width / canvas.height` mutation from the RAF loop body.
   - Set `canvas.width` and `canvas.height` once in the `ResizeObserver` callback (and on mount).
   - Compute `renderScale` from `interactionState` and pass it into `engine.renderFrame()`.
   - Remove `canvas.width`, `canvas.height` from `baseGeometryKey`; add a separate
     `canvasSizeVersion` counter incremented only by the `ResizeObserver`.

6. **`initEngine.ts`:** Propagate `renderScale` through `renderFrame()`'s parameter signature
   down to `PassManager.render()`.

7. **Verification:** Run the existing headless regression suite (`npm run test`) to confirm no
   buffer layout or math regressions. Manually test on a mobile device to confirm the first-pan
   latency spike is gone.

## Verification Steps

- [ ] **Headless regression suite passes:** `npm run test` green — no uniform buffer alignment
      errors, no NaN/Inf regressions, no baseline pixel-buffer mismatches.
- [ ] **No canvas resize on interaction:** Add a temporary `console.assert` (or browser DevTools
      breakpoint) confirming `canvas.width` does not change between `pointerdown` and `pointerup`
      on a mobile device.
- [ ] **Visual correctness at both scales:** The fractal renders correctly at full quality in
      `STATIC` mode and at reduced resolution in `INTERACT` mode, with the low-res content correctly
      upscaled to fill the viewport (no black borders or UV clamping artifacts).
- [ ] **Desktop parity:** Mouse drag and wheel zoom behaviour is unchanged.
- [ ] **Documentation Sync:** Did this implementation drift from the original plan? If so, update
      `docs/rendering-engine-design.md` before closing this task.
