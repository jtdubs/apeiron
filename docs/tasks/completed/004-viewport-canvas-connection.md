---
status: closed
---

# Task 004: Connect React Viewport to WebGPU Engine

## Objective

Connect the React UI frontend to the standalone WebGPU rendering engine (`initEngine()`) via a strictly decoupled loop to achieve basic screen rendering.

## Relevant Design Docs

- [Frontend Design](../../design/frontend.md)
- [Rendering Engine Design](../../design/rendering-engine.md)

## Requirements

- **The Viewport Component:** Create an `<ApeironViewport />` React component that solely mounts a `<canvas>` element and obtains its reference via `useRef`.
- **Zero-DOM Rendering:** Implement a strict `requestAnimationFrame` loop that operates outside of the React lifecycle, ensuring the execution context never triggers React re-renders.
- **Engine Handshake:** Pass the physical `<canvas>` element cleanly to `initEngine()`, allowing WebGPU to acquire a `GPUCanvasContext` and SwapChain.
- **Test Render:** The underlying WebGPU pipeline must draw a basic, verifiable test output (e.g., a simple color gradient or coordinate map) to prove successful context attachment.
- **ResizeObserver Integration:** Bind browser resize events to trigger explicit rebuilding of the internal SwapChain targets, avoiding WebGPU scaling crashes without leaking listeners.

## Implementation Plan

1. Create `ApeironViewport.tsx` under the UI component directory.
2. Structure the `useEffect` block to execute the `initEngine()` binding once strictly on mount.
3. Stub the internal `requestAnimationFrame` loop.
4. Modify `initEngine()` to accept and branch to an optional `HTMLCanvasElement`.
5. Write a basic fragment shader to output recognizable test pixels.

## Verification Steps

- [ ] `npm run dev` yields a browser window correctly rendering the basic WGSL test pass.
- [ ] Expanding the browser window correctly resizes the canvas output resolution via `device.configure` without pixelation or crashing.
- [ ] No React UI re-renders are triggered by the internal drawing loop.
- [ ] **Documentation Sync:** Did this implementation drift from the original plan? If so, update `docs/design/frontend.md` before closing this task.
