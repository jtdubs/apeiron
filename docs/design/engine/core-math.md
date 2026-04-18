# Math Backend Design

## 1. Core Paradigm

The Math Backend is the mathematical ground-truth generator for Apeiron. To achieve deep-zoom capabilities ($>10^{15}$) without experiencing JavaScript Garbage Collection stutter or `f32` truncation glitches, all core logic is separated into a high-performance native library.

## 2. Component: Rust WASM Core (`math-core`)

The standard `Number` in JS is limited to 64-bit IEEE-754 floats. We compile Rust arbitrary precision math into WebAssembly for our central calculations.

**Goals:**

- Eliminate JavaScript object creation in the hot loop (e.g. `Decimal.js` instances).
- Calculate long iteration chains iteratively to create Reference Orbits for Perturbation theory.
- Provide a deterministic, purely logical ground-truth array of iteration limits to serve as the baseline for our Headless Data-Tests.

**Implementation Rules:**

- **Origin Rebasing (Floating Origin):** Receives the UI's anchor `String` and panning `f64` deltas. It drops into Rust BigFloat/GMP execution inside the Web Worker to calculate the absolute new spatial anchor, returning the new coordinate string to the UI.
- **Reference Orbit Offloading:** Returns a raw `Float64Array` mapping the Perturbation Reference Orbit, which is efficiently written to the VRAM context using an explicit `device.queue.writeBuffer()` operation to prevent deep-copy lockups or `mapAsync` overhead in the render pipeline.
- **Explicit WASM Memory Deallocation:** Because the JavaScript Garbage Collector cannot access or track memory allocated inside the WebAssembly linear memory heap, the JS orchestrator MUST explicitly execute `.free()` on the returned `wasm-bindgen` memory object immediately after pushing the array to WebGPU VRAM. Failure to explicitly free these massive orbit arrays will result in catastrophic heap leaks during continuous user panning.

## 3. Emulated Precision & Perturbation

Apeiron shifts complexity in tiers:

1. **$f32$ Level:** Standard 32-bit float rendering.
2. **$f64$ Level:** Emulated double-precision (double-single arithmetic) directly inside WebGPU shaders.
3. **Perturbation Theory:** Once bounds shrink below $f64$ precision limits, the `math-core` worker calculates a single ultra-precise coordinate orbit. The WebGPU shader then calculates the $f32$ pixel-level _difference_ from that reference orbit.

## 4. 4D Parameter Space Model

A fundamental architectural constraint is that Apeiron treats generalized fractal domains—typically divided into strictly isolated Mandelbrot (where $z_0$ is isolated, varying $c$) or Julia sets (where $c$ is fixed, varying $z_0$)—as a single, unified 4D geometry defined by `[zr, zi, cr, ci]`.

Our engine operates exclusively by defining the mathematical viewport as a 2D plane passing through this continuous 4D space. The angle/orientation of this plane parameterizes what the user mathematically explores:

- **Mandelbrot Anchors**: The plane is aligned entirely on the `C` axes (`cr`, `ci`) with the `Z` axes `[zr, zi]` locked precisely to `[0,0]` (or a user-defined seed).
- **Julia Anchors**: The plane is aligned entirely on the `Z` axes `[zr, zi]` mapping the physical screen to Z-space, while the `C` axes `[cr, ci]` are locked to a specific coordinate acting as the Julia constant.
- **Hybrid Slices**: The math engine is inherently parameterized to support evaluating any continuous intermediate 4D slice via vector interpolation or rotation matrix.

All precision routines, `math-core` arbitrary precision orbit arrays, and hardware test fixtures MUST natively accept and compute against this `[zr, zi, cr, ci]` origin format instead of relying on hardcoded dual dimensions.

## 5. Advanced Math Features: Series Approximation (SA)

The math core implements **Series Approximation** by tracking higher-order spatial derivatives ($A$, $B$, $C$ coefficients of the Taylor expansion) alongside the primary reference orbit. In deep zoom scenarios, these structural polynomials allow the engine to confidently skip thousands or millions of iterations by analytically jumping $Z$ coordinates over long mathematically smooth paths via algebraic approximation, mapping extreme depths instantaneously without brute-force GPU calculation.

Critically, the core Taylor series derivatives ($A_n$, $B_n$, $C_n$) are absolute derivatives computed linearly from $Z_0$, completely decoupled from isolated limit cycle derivatives used to map inner period topology, preventing chaotic interpolation jumps during iteration skipping.

## 6. Interior Shading & Limit Cycles (Deep Zoom)

To render the interior of bounded sets beautifully (e.g., Distance Estimation topological contours), the engine must detect periodicity (Limit Cycles) and calculate the polynomial derivative (`der_since_check`) at that exact repeating cycle.

- **The Proxy Collapse Problem:** At extreme depths ($> 10^{15}$), WebGPU relies on floating-point $\Delta z$ proxy boundaries. Detecting limit cycles directly against these tiny $f32$ approximations leads to catastrophic proxy collapse, causing false-escapes or infinite loops.
- **Rust-First Calculation:** To solve this, cycle-detection and derivative accumulation execute _exclusively_ inside the arbitrary-precision Rust calculation during Reference Orbit generation.
- **Data Inheritance:** When Rust detects a mathematically proven interior cycle, it packs the final structural derivative metadata alongside the reference orbit array. When WebGPU is rendering perturbation pixels around that exact origin, any pixel that reaches the maximum iteration count without escaping immediately inherits this pristine Rust cycle metadata to paint its interior structures. This guarantees stability and prevents GPU execution timeouts.

## 7. The Deep Zoom Escalation Ladder

To attain functionally infinite recursion depths, the Apeiron architecture structurally shifts mathematical calculation tiers. This ladder documents the exact constraints unlocking sequential depth barriers.

### Level 1: Standard Hardware ($f32$)
- **Depth Limit:** ~ $10^{-7}$
- **Architecture:** Directly executes `continue_mandelbrot_iterations` inside WebGPU `f32` vectors.
- **Limitation:** At $10^{-7}$, hardware completely exhausts $f32$ mantissa precision, failing to differentiate adjacent screen pixels and resolving as blocky chunks.

### Level 2: Emulated Hardware (Double-Single or $f64$)
- **Depth Limit:** ~ $10^{-14}$
- **Architecture:** Emulates 48-bit logic by combining two `f32` uniforms (`hi`/`lo`) inside WebGPU. 
- **Limitation:** While blockiness is healed, depths beyond $10^{-14}$ natively crash the standard mathematical evaluation entirely.

### Level 3: Perturbation Theory & BLA
- **Depth Limit:** ~ $10^{-15}$
- **Architecture:** Bypasses brute-force iteration by calculating a central Reference Orbit in `f64` within the Rust Backend. WebGPU evaluates neighboring pixels using high-performance Bilinear Approximations (BLA) and offset tracking (`ΔZ`).
- **Limitation:** The Rust WASM worker is capped by native `f64` limitations. Beyond $10^{-15}$, Rust mathematically cannot target the required UI center coordinate, collapsing the Reference Orbit into noise.

### Level 4: Arbitrary Precision (GMP/BigFloat)
- **Depth Limit:** Infinite (Bounded by hardware memory/time)
- **Architecture:** Rust discards native `f64` and pulls in an Arbitrary Precision library (e.g., `rug`, `malachite`). The Reference Orbit is analytically solved over minutes using 100+-digit precision strings, and the pristine deterministic `f64` offsets are pushed back to the GPU context for ultra-fast rendering.
- **Limitation:** Over thousands of perturbation iterations, WebGPU's native `f32` tracking of the `ΔZ` offset will accumulate mathematical rounding errors ($\sim 10^{-15}$ for `f32`, $\sim 10^{-30}$ for DS).

### Level 5: Multi-Reference Rebasing
- **Depth Limit:** Infinite
- **Architecture:** As proxy parameters naturally diverge off the BLA linear approximations (Glitch Collapse where `|ΔZ| > |Z_n|`), the GPU cleanly ejects the failing coordinate bounding box. Rust calculates novel Arbitrary Precision secondary origins anchored precisely on the glitch regions. WebGPU context interpolates between 1..N continuous high-precision maps, entirely neutralizing mathematical divergence safely.
