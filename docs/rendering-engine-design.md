# Rendering Engine Design

## 1. WebGPU Architecture

Apeiron utilizes a direct WebGPU pipeline optimized for parallel mathematical computation and deterministic execution.

### 1.1 The Deferred Resolve Pipeline (G-Buffer)

To decouple heavy orbit calculations from UI responsiveness, Apeiron utilizes a Deferred Resolve pipeline via an intermediate G-Buffer.

- **Accumulator Math Pass (Compute/Fragment):** During progressive rendering, the hot loops calculate and accumulate raw, multi-sampled mathematical output floats (e.g., Continuous Iteration, Distance Estimation, Stripe Average/TIA). No color or lighting decisions are made here.
- **Presentation Pass (Resolve Fragment):** A final Resolve Shader executes continuously at 60fps, reading the raw data buffers and dynamically applying Trigonometric Cosine Palettes, 3D specular lighting, topological contours, and exterior glow logic. This guarantees perfect anti-aliasing while allowing instant UI theme updates without recalculating a single fractal orbit.

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

### 1.5 Interior Early-Out Defenses

To prevent rendering bottlenecks caused by dense fractal interior locations that never escape their iteration loop, the f32 GPU mathematical loops use twin termination heuristics:
- **Analytic Checks (O(1)):** For unmodified views of the c-plane Mandelbrot set ($d=2$, $Z_0=(0,0)$), points are instantly evaluated against bounding formulas of the main cardioid and period-2 continuous bulb.
- **Cycle Detection (Brent's Algorithm):** Because arbitrary 4D rotations (slice angles) and exotic polynomial powers inherently alter mathematical boundaries, static analytic checks are systematically disabled in these modes. We use Brent's Cycle Algorithm inline ($O(1)$ spacial cost, $\epsilon < 10^{-20}$ bound threshold) to detect repeating loops and arbitrarily trap cyclic limits regardless of slicing domains. (*Note: The equivalent mechanism for the perturbation deep-zoom path lives in the reference cycle detectors outlined in the backend specifications.*)

### 1.6 Spatial History Cache (Mipmapping)

To prevent the engine from rendering a "Black Void" when the user rapidly pans or zooms out of mathematical bounds, the engine maintains a hidden **History Cache** of WebGPU textures:

- As the user zooms _in_, the engine occasionally snapshots the 4K canvas, downscales it to a reduced resolution to conserve VRAM, and pushes it to an off-screen Ring Buffer array.
- During rapid traversal (the `INTERACT_FAST` progressive rendering state), the fragment shader samples from this History Cache. It selects the closest zoomed-out texture and stretches it across the newly exposed territory.
- To prevent VRAM starvation and browser context crashes (especially on mobile browsers like iOS Safari), the History Cache is strictly limited to a Ring Buffer of the most recent 3 to 5 zoom tiers.

## 2. Advanced Coloring Features

Because the rendering engine is computationally decoupled from the math layer via the G-Buffer, it independently implements advanced visual processors:

1. **Histogram / Density Coloring:** Scans compute output bounds to perfectly distribute color frequencies across varying depths.
2. **Distance Estimation (DE):** Interprets derivative vectors from the compute shader to cast 3D lighting shadows, specular gloss, soft glow, and topological contours across mathematical surfaces.
3. **Orbit Traps:** Traces closest-approaches directly within the WGSL loop and exposes them as a secondary Buffer channel to map entirely different fractal structures geometry.
4. **Triangle Inequality Average (TIA / Stripe Rendering):** TIA limits are used for high-quality, smooth visual banding (`stripe-average`). At extreme perturbation depths ($>10^{15}$), the rendering pipeline compresses TIA by calculating it exclusively from the floating-point $\Delta z$ proxy values. Because TIA naturally functions as a visual frequency smoother, this avoids taxing the Rust arbitrary-precision core while remaining visually coherent.
