# Animation System Architecture

This document defines the high-level architecture for our cinematic animation engine. The engine allows users to bookmark specific mathematical states and construct fluid, interpolating visual timelines across the deep-zoom parameter space.

## 1. Conceptual Models

Instead of rigid static lists, the animation architecture operates on three core conceptual components:

- **Waypoint:** A complete logical freeze-frame of the engine's active state at a specific moment. A waypoint encapsulates:
  - **Spatial Location:** The exact coordinate anchor in 4D parameter space (capturing both the Julia and Mandelbrot plane intersections).
  - **Depth Level:** The precise arbitrary-precision zoom magnification.
  - **Mathematical Engine State:** Active polynomial exponents and formula variations.
  - **Visual Configuration:** Attributes dictating the coloring mode, 3D Distance Estimation lighting angles, interior bounds, and active color palettes applied to that location.
- **Transition:** The spatial and temporal bridge connecting two consecutive Waypoints. Transitions govern:
  - **Duration & Velocity:** The explicit time afforded to traverse the parameters.
  - **Easing Data:** Non-linear mathematical curves (e.g. cubic ease-in-out) that dictate acceleration and deceleration, preventing jarring, artificial-feeling camera movements.
- **Animation Sequence:** An orchestrating timeline object that structures the ordered progression of Waypoints and the Transitions binding them together.

## 2. Interpolation Engine (The Hot Loop)

To support seamless cinematic playback, the interpolation engine handles the complex mathematics of bridging wildly differing parameter spaces without blocking the browser thread.

- **Logarithmic Zoom Tweening:** Simple linear interpolation fails dramatically when crossing deep zoom boundaries. The interpolation engine scales dimensional bounds logarithmically, guaranteeing a smooth, constant perceived dive velocity.
- **Precision Handoffs:** When interpolating a camera path that crosses between standard float boundaries down into pure Perturbation limits, the engine handles transitioning the native math cores smoothly to avoid visual stuttering.
- **DOM Independence:** Active timeline playback executes exclusively within `requestAnimationFrame` hooks. It bypasses React reconciliations, resolving intermediary mathematical bounds and pushing them directly to the WebGPU Uniforms during flight.

## 3. The Sequence Studio (UI Overview)

The animation controls integrate seamlessly as a Heads-Up Display (HUD) overlay, maintaining the unobstructed aesthetic of our primary design.

- **Timeline Scrubber:** A minimalistic track overlay that manages playback state. Users can physically drag a scrubber to arbitrarily preview any interpolated point along the mathematical sequence without fully rendering a video frame. To adhere to the Zero-DOM rule, high-frequency dragging must bind native pointer events (e.g. `onPointerMove`) to a `useRef` or directly mutate the `Zustand` store, deliberately avoiding `useState` loops for pixel tracking.
- **Waypoint Deck:** A visual carousel or listing displaying saved anchors. Users can selectively alter or immediately "snap-to" those logical states.
- **Transition Tuning:** Integrated controls allowing users to modify the temporal speed and trajectory curves connecting adjacent waypoints.
