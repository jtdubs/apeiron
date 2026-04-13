# Apeiron Frontend Design

This document details the React architecture designed to support a high-performance WebGPU rendering
loop while adhering to the **Zero React DOM in Hot Paths** rule outlined in `AGENTS.md`.

## 1. Global State Management (Zustand)

We will use **Zustand** to manage the global application state. It provides a highly performant,
unopinionated store that allows components to selectively subscribe to state slices, avoiding
unnecessary re-renders.

We split state management across specific specialized stores:

- **`useViewportStore`**: The math source-of-truth. To prevent GC stutter at extreme zooms ($>10^{40}$), this store implements a **Floating Origin (Dumb Terminal)** architecture instead of using heavy TS math libraries like `decimal.js`:
  - **Anchors (Strings):** Absolute 4D coordinates (`anchorZ`, `anchorC`) are stored as primitive strings. The React thread never performs arbitrary precision arithmetic.
  - **Deltas (Numbers):** High-frequency mouse events update standard 64-bit float deltas (`panDeltaX`). WebGPU evaluates the float $\Delta$ against the string anchor.
  - When the user pans beyond safety bounds, the UI sends the string anchor + float deltas to the Rust Web Worker, which recalculates the absolute new string anchor off-thread.
- **`useRenderStore`**: Highly configurable visual parameters like `ColoringMode` (continuous/banded), `InteriorMode`, theme presets, lights, and Distance Estimation modes. 
  - **Pipeline Bypass Connection:** Mutating this store explicitly *bypasses* the WebGPU Compute shader (Stage 1 Math). State changes here only trigger the Fragment shader (Stage 2 Coloring), allowing users to tweak rendering aesthetics (like normals or color palettes) at maximum 60fps without triggering heavy mathematical recalculations of the underlying fractal structure.
- **`useTimelineStore`**: Orchestrates cinematic timeline sequences, waypoints, and tweening state
  (independent of active UI).

## 2. The Rendering Engine (`<ApeironViewport />`)

The core of the application is a single `<ApeironViewport />` component. Its primary job is to mount a
full-screen `<canvas>` element and immediately step out of the way.

- **Initialization**: On initial mount (`useEffect`), it acquires a `useRef` to the canvas,
  initializes the WebGPU context, and sets up the rendering pipeline (compiling shaders, structuring
  uniform buffers).
- **Window Lifecycle (ResizeObserver):** WebGPU requires explicit context rebinding. The `useEffect` must attach a `ResizeObserver` to the canvas. Whenever the browser resizes or device orientation shifts, the observer callback must explicitly execute `device.configure(...)` to completely rebuild the internal SwapChain targets and offscreen textures to match the new dimensions, preventing the engine from crashing.
- **The Hot Path**: It kicks off a standalone `requestAnimationFrame` loop. Inside this loop, it
  reads the current mathematical parameters directly from the `useViewportStore` and visual layers
  from `useRenderStore` (via `.getState()`), updates the WebGPU Uniform Buffers, and dispatches the
  draw call.
- **Zero React Dependency**: The render loop operates entirely independently of the React
  component's lifecycle. Zooming or changing variables will **not** cause `<ApeironViewport />` to
  re-render. The UI handles React rendering; the canvas just blindly renders memory.

## 3. Mouse Interaction & Navigation

Navigation events (pan and zoom) must be highly responsive to prevent input lag.

- **Event Attachment & Lifecycle Cleanup**: `wheel`, `pointerdown`, `pointermove`, and `pointerup` event listeners are
  attached natively to the `<canvas>` DOM node inside the initial `useEffect`. To prevent massive CPU leaks and duplicate firing during component unmounts or Vite Hot Module Replacements (HMR), the `useEffect` return function MUST explicitly call `removeEventListener` for all bindings.
- **State Mutation**: These native event handlers calculate camera deltas and directly mutate the
  `useViewportStore` camera parameters. This immediately propagates into the next frame of the
  `requestAnimationFrame` loop, resulting in zero-latency panning and zooming.

## 4. The Control HUD

The floating User Interface (sliders, input boxes, toggles) exists in a separate tree overlaid on
the canvas.

- Components in the HUD are standard React components that subscribe reactively to specific slices
  of the `useViewportStore`.
- When a user moves an exponent slider, the HUD component fires an action pushing the new exponent
  to the store.
- Because the `<ApeironViewport />` is specifically isolated from reacting to store changes, only the
  tiny slider component re-renders in the DOM, while the raw WebGPU loop effortlessly digests the
  new mathematical parameter.
