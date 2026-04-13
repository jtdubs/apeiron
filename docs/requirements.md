# Apeiron Technical Requirements

The following requirements dictate the architectural boundaries and technology stack for the Apeiron fractal engine. They prioritize mathematical stability, zero-latency rendering, and determinism.

## 1. Functional Requirements

### 1.1 Strict Mathematical Isolation

- **R1.1.1 GPU and Native Execution:** Mathematical calculations for orbit paths, perturbation mapping, and escape velocity MUST be strictly limited to the WebGPU Compute pipeline and the Rust (WASM) mathematical core.
- **R1.1.2 UI Decoupling:** JavaScript/TypeScript running on the main thread MUST NOT calculate any part of a fractal iteration sequence. It is strictly an orchestration and routing layer.

### 1.2 Data-First Headless Testing

- **R1.2.1 Component Separation:** The `createFractalEngine()` core MUST be able to execute without an `HTMLCanvasElement`.
- **R1.2.2 Buffer Parity Tests:** The system MUST continuously test mathematical parity between standard WebGPU Compute Shaders and the `rust-math` WASM core by extracting physical data buffers (ArrayBuffers) and comparing output values, specifically avoiding perceptual image diffing.
- **R1.2.3 Determinism:** The renderer MUST guarantee exactly the same numerical escape data regardless of screen dimension, MSAA levels, or browser environment.

### 1.3 Deep Zoom Parity (Competitive Execution)

- **R1.3.1 Emulated High Precision:** The engine MUST seamlessly provide emulated $f64$ double-precision inside WGSL before falling back to perturbation theory for zooms beyond $10^{15}$.
- **R1.3.2 Reference Orbit Offloading:** Perturbation theory reference orbits, which require massive arbitrary precision (GMP/MPFR-style calculations), MUST execute off the main thread in a Rust-compiled Web Worker to eliminate JavaScript Garbage Collection stutters.

## 2. Non-Functional Requirements

### 2.1 UI and Rendering

- **R2.1.1 DOM Evasion:** The hot rendering loop MUST completely bypass React `useState` DOM reconciliations, instead relying on standard `requestAnimationFrame` boundaries and `useRef`.
- **R2.1.2 Aesthetic Excellence:** The output system MUST support advanced shaders natively, including 3D Surface Distance Estimation, Histogram density coloring, and Buddhabrot-style stochastic tracking.

### 2.2 Performance & Rendering Orchestration

- **R2.2.1 Frame Budget:** The interactive render pipeline MUST maintain a strict 16.6ms standard UI frame budget.
- **R2.2.2 Progressive Architecture:** To abide by the frame budget under massive mathematical loads, the application MUST support Dynamic Resolution Scaling during UI interaction, and automatic Multi-Frame Accumulation (Supersampling / Subpixel jitter) when stationary.

### 2.3 Application & State Orchestration

- **R2.3.1 NPM Centralization:** The entirety of local application builds—including Rust target compilation, WASM bundling, UI rendering, and Node test execution—MUST be orchestrated centrally via standard `npm run` task commands within the root `package.json`.
- **R2.3.2 Shared State Serialization:** 4D mathematical coordinates, UI themes, and zoom parameters MUST be perfectly serializable to and from a Base64-encoded URL string to allow absolute zero-infrastructure viewport sharing among the fractal art community.
- **R2.3.3 Waypoint Interpolation:** The application MUST support capturing exact state parameters as Waypoints, and provide mathematically sound Logarithmic Zoom Tweening interpolation to smoothly animate camera transitions between them.
- **R2.3.4 Mobile Responsiveness:** UI panels and layout grids MUST smoothly scale to constrained mobile viewports natively leveraging responsive CSS techniques (like `clamp()` and `flex`) rather than relying on brittle JavaScript-based conditional DOM unmounting.
