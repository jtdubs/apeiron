---
status: closed
---

# Task 008: Implement Mouse Drag & Wheel Camera Controls

## Objective

Drive the WebGPU camera uniform map interactively utilizing physical mouse wheel scaling events and primary pointer drag event listeners, strictly bound to the Zustand store.

## Relevant Design Docs

- [Frontend Design](../frontend-design.md)
- [Rendering Engine Design](../rendering-engine-design.md)

## Requirements

- **Global Store Context:** Establish `viewportStore.ts` via Zustand to hold the authoritative ground-truth mapping values for $X$, $Y$, and $Zoom/Radius$.
- **Native Event Listeners:** Read the DOM `wheel` and `pointerdown`/`pointermove` listeners natively on the canvas reference hook to intercept interactions without incurring native React synthetic event overhead.
- **Engine Handshake:** Update the `requestAnimationFrame` loop initiated in `ApeironViewport` to extract the `getState()` raw values directly from the Zustand store per frame, passing them unconditionally to `engine.renderFrame(x, y, zoom)`.

## Implementation Plan

1. Create `src/ui/stores/viewportStore.ts` maintaining $[X, Y, zoom]$ numeric values.
2. Inside `ApeironViewport.tsx`, construct native `wheel` listeners that derive map scale, applying boundary locks if zooming exceeds $f32$ stability thresholds ($\text{zoom} \approx 10^{14}$).
3. Implement 2D pan dragging via standard event delta calculations.
4. Pass the Zustand state seamlessly to the WebGPU pipeline per frame.

## Verification Steps

- [ ] Mouse scrolling successfully drives logarithmic zooming in physical webgpu.
- [ ] Dragging mathematically translates the space.
- [ ] Profiling reveals exactly ZERO React `render` invocations during complex dragging or zooming patterns.
