# Rendering Engine Design

## 1. WebGPU Architecture

Apeiron utilizes a direct WebGPU pipeline optimized for parallel mathematical computation and deterministic execution.

### 1.1 Compute vs Fragment Isolation

- **Compute Pipeline (The Math Engine):** The mathematical evaluation of coordinates (calculating $f32$, $f64$, or applying Perturbation boundaries) strictly occurs via WGSL Compute shaders.
- **Fragment Pipeline (The Presentation Engine):** Once the Compute shader calculates raw iteration arrays, distance estimations, or orbit trap bounds, the Fragment Shader maps these values to visual gradients (e.g., Cosine Palette Interpolations).

### 1.2 Offscreen and Headless Capabilities

The engine initializes via a `createFractalEngine(canvas?)` abstraction.

- If passed a valid `HTMLCanvasElement`, it constructs the SwapChain and Fragment pipelines for real-time visualization.
- If omitted, it binds exclusively to offscreen textures and mapping buffers. This creates the backbone of our data-first unit testing.

### 1.3 4D Viewport Mapping (The Slicing Plane)

The WebGPU shaders explicitly abandon hardcoding purely 2D bounds arrays. The UI's `CameraParams` uniform buffer constructs a visual 2D viewport by projecting vectors across the newly defined 4D parameter space (`[zr, zi, cr, ci]`).

- Screen $X/Y$ inputs natively generate vectors to control the exact slice geometry, mapping fragment positions directly onto the slicing plane.
- WebGPU handles continuous 4D rotation arrays automatically, natively tracking the smooth interpolation topological morphing required to traverse deeply between Mandelbrot properties and Julia parameters without triggering a heavy UI restructure.

### 1.4 Dual Render Pipelines

To avoid an explosion of complexity across disparate math modes, the Engine maintains two entirely isolated mapping and shading targets:

1. **Escape-Time Engine:** Used for standard boundary thresholds, Distance Estimation, and Orbit Traps. Operates heavily on ray-marched, per-pixel fragment logic.
2. **Stochastic Engine (Buddhabrot):** Used for density accumulation mapping. Instead of per-pixel marching, it runs particle scatter compute shaders to fill iteration histogram buckets simultaneously, mapping densities to the final canvas.

### 1.5 Spatial History Cache (Mipmapping)

To prevent the engine from rendering a "Black Void" when the user rapidly pans or zooms out of mathematical bounds, the engine maintains a hidden **History Cache** of WebGPU textures:

- As the user zooms _in_, the engine occasionally snapshots the 4K canvas, downscales it to a reduced resolution to conserve VRAM, and pushes it to an off-screen Ring Buffer array.
- During rapid traversal (the `INTERACT_FAST` progressive rendering state), the fragment shader samples from this History Cache. It selects the closest zoomed-out texture and stretches it across the newly exposed territory.
- To prevent VRAM starvation and browser context crashes (especially on mobile browsers like iOS Safari), the History Cache is strictly limited to a Ring Buffer of the most recent 3 to 5 zoom tiers.

## 2. Advanced Coloring Features

Because the rendering engine is computationally decoupled from the math layer, it independently implements advanced visual processors:

1. **Histogram / Density Coloring:** Scans compute output bounds to perfectly distribute color frequencies across varying depths.
2. **Distance Estimation (DE):** Interprets derivative vectors from the compute shader to cast 3D lighting shadows and specular gloss across mathematical surfaces.
3. **Orbit Traps:** Traces closest-approaches directly within the WGSL loop and exposes them as a secondary Buffer channel to map entirely different fractal structures geometry.
