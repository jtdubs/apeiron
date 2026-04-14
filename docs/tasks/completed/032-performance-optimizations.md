---
status: closed
---

# Task 032: Performance Optimizations (Panning Latency)

## Objective

Eliminate the excessive user-interaction round-trip latency during mouse dragging and panning by decoupling device pixel ratio scaling, rectifying React rendering bottlenecks, and optimizing WebGPU submission frequency.

## Relevant Design Docs

- `docs/rendering-engine-design.md`

## Requirements

- **Dynamic Resolution Scaling (DRS):** The rendering engine must be capable of rendering at `1.0x` DPR during active pointer interaction to alleviate bandwidth, reverting to full optical `window.devicePixelRatio` during idle observation.
- **Granular React Subscriptions:** `ApeironHUD.tsx` must decouple from listening to the entirety of `viewportStore` on every coordinate update, preventing full React tree diffing multiple times per frame.
- **Lazy WebGPU Submissions:** The rendering engine should bypass API execution (`device.queue.submit()`) entirely via `needsRender` flags if logical bounds (coords, zoom, theme) haven't shifted since the last frame.

## Implementation Plan

1. Create a `isInteracting` atomic state inside `viewportStore` which toggles appropriately during Pointer Down vs Pointer Up routines.
2. In `ApeironViewport.tsx` and `PassManager`, query `isInteracting` to construct a scaled down G-Buffer when active.
3. Replace the `const state = useStore(viewportStore)` global bind with explicit `useStore(viewportStore, useShallow(...))` hook logic (or individual selectors) inside `ApeironHUD.tsx` and nested components to surgically prevent full-tree re-renders.
4. Wrap logic within `ApeironViewport.tsx`'s `requestAnimationFrame` to short-circuit if `viewportStore` and `renderStore` configuration delta equals absolutely zero since the previous frame.

## Verification Steps

- [ ] Confirm no React Developer Tools flamegraph "yellow blocks" or full tree re-renders originate from `ApeironHUD` while dragging on the canvas.
- [ ] Verify that Mobile Canvas performance returns to visually real-time parity under physical testing, without clipping.
- [ ] **Documentation Sync:** Did this implementation drift from the original plan? If so, update `docs/rendering-engine-design.md` before closing this task.
