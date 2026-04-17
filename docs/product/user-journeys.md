# Apeiron User Journeys

Apeiron is designed to bridge the gap between high-performance mathematical exploration and accessible, modern UI. The system caters to different personas with unique requirements.

## 1. The Deep-Zoom Enthusiast

- **Goal:** Explore extreme magnifications (beyond $10^{1000}$) to find novel structures like deep minibrots and complex spirals without UI stutter or visual artifacts.
- **Unique Characteristics:** Demands absolute numerical stability and expects real-time visual feedback even during massively intensive iteration processing.
- **Journey:**
  1. Opens Apeiron and easily navigates to $10^{13}$ depth using the mouse.
  2. The system seamlessly transitions from standard $f32$ math to $f64$ emulated math, and eventually into Rust-based perturbation theory.
  3. Uses deep-bound Keyframe pathing to save waypoints.
  4. Captures the exact mathematical and visual state via Base64 URL serialization to instantly share the viewport with the fractal art community.

## 2. The Algorithm Developer (The Math Dev)

- **Goal:** Debug glitches, build new coloring algorithms (like Distance Estimation or Orbit Traps), and optimize iteration boundaries.
- **Unique Characteristics:** Relies on strict separation of math and rasterization. Requires headless testing environments and raw numerical outputs.
- **Journey:**
  1. Writes a new coloring shader and WebGPU math pipeline.
  2. Runs pure automated headless tests via Node/Deno to verify exact escape bounds and coordinate arrays internally against the Rust baseline, completely bypassing the visual UI.
  3. Uses isolated diagnostic views (like a 1-sample monochrome map) to verify bounding box constraints.

## 3. The Digital Artist

- **Goal:** Produce visually stunning, fully-lit 3D topology renders and animated "zoom" videos.
- **Unique Characteristics:** Focuses on color palettes (Histogram, Stripe Average), Distance Estimation shading, and smooth interpolation between keyframes.
- **Journey:**
  1. Sets up complex color gradients and active 3D relief lighting (azimuth, specular gloss).
  2. Places multiple positional keyframes in a timeline editor, adjusting non-linear easing splines for camera movement to perform real-time explorations.
