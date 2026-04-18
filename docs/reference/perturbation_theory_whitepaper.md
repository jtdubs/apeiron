# Whitepaper: Fractal Perturbation Theory (Perturbation Rendering)

## 1. Abstract
Fractal Perturbation Theory is a mathematical technique designed to circumvent the precision limitations of standard hardware floats ($f32$, $f64$) during deep-zoom rendering. By calculating a single high-precision "Reference Orbit" and evaluating neighboring pixels as lower-precision "Differences" (deltas), the technique achieves zoom depths beyond $10^{1000}$ while maintaining the performance of native GPU hardware.

## 2. Historical Context
Perturbation rendering was first popularized by **K.I. Martin** with the release of *SuperFractalThing* in 2013, effectively solving the "Double Precision Barrier" that had historically capped fractal explorers. It was further formalized by **Claude Heiland-Allen**, who extended the theory to include **Interior Distance Estimation (IDE)** and **Glitch Detection** metrics. It serves as the foundational layer for modern high-performance accelerators like Bivariate Linear Approximation (BLA).

## 3. The Problem: Precision Exhaustion
At zoom depths greater than $10^{15}$, the difference between two adjacent screen pixels ($z_a$ and $z_b$) becomes smaller than the machine epsilon of a 64-bit float. Brute-force calculation at these depths results in "Blockiness" where multiple pixels resolve to the same coordinate, or total numerical collapse. 

High-precision libraries (GMP, rug) can resolve these coordinates but are too slow for real-time GPU rendering. Perturbation solves this by shifting the bulk of the computation to a "Difference Map" that fits within standard $f32$ or $f64$ mantissas.

## 4. Mathematical Mechanics

### The Delta Equation (Mandelbrot)
The relationship between a pixel's orbit $z$ and the reference orbit $Z$ is defined as $z_n = Z_n + \Delta z_n$. Substituting this into the Mandelbrot map $f(z) = z^2 + c$:

$$(Z_{n+1} + \Delta z_{n+1}) = (Z_n + \Delta z_n)^2 + (C + \Delta c)$$
Expanding and subtracting the reference identity $Z_{n+1} = Z_n^2 + C$ yields the core perturbation formula:
$$\Delta z_{n+1} = 2Z_n \Delta z_n + \Delta z_n^2 + \Delta c$$

### Interior Distance Estimation (IDE)
To render smooth topological contours within the set, we must track the derivative $\Delta z'$.
$$\Delta z'_{n+1} = 2(Z_n \Delta z'_n + Z'_n \Delta z_n + \Delta z_n \Delta z'_n) + 1$$
This allows the engine to calculate the distance estimate $d \approx 0.5 \cdot \sqrt{|z|/|z'|} \cdot \ln|z|$ using only the perturbed values.

## 5. Algorithmic Implementation

### Non-Holomorphic Generalization (e.g., Burning Ship)
For non-holomorphic fractals where the derivative is not a single complex number (e.g., Burning Ship: $(|Re(z)| + i|Im(z)|)^2 + c$), the perturbation must be calculated in components to handle the absolute value differences:
$$\Delta z_{r, n+1} = |Z_{r,n} + \Delta z_{r,n}| - |Z_{r,n}|$$
$$\Delta z_{i, n+1} = |Z_{i,n} + \Delta z_{i,n}| - |Z_{i,n}|$$
This ensures that the "Delta" remains valid even across the non-differentiable absolute value boundaries.

## 5. Algorithmic Implementation

### The Perturbation Kernel (WGSL)
```rust
fn perturbation_step(dz: vec2f, dz_der: vec2f, Z: vec2f, Z_der: vec2f, dc: vec2f) -> vec2f {
    // dz_next = 2*Z*dz + dz^2 + dc
    let z_linear = vec2f(Z.x * dz.x - Z.y * dz.y, Z.x * dz.y + Z.y * dz.x) * 2.0;
    let z_quad = vec2f(dz.x * dz.x - dz.y * dz.y, dz.x * dz.y + dz.y * dz.x);
    return z_linear + z_quad + dc;
}
```

### Reference Selection
The quality of the perturbation depends entirely on the reference orbit $Z$. A "Good" reference is one that:
1.  Is calculated with sufficient arbitrary precision (e.g., 256+ bits).
2.  Is centrally located relative to the current viewport.
3.  Does not escape significantly earlier than the neighboring pixels.

### The Glitch Metric (Loss of Significance)
Numerical error accumulates when $\Delta z_n$ becomes large relative to $Z_n$. Claude Heiland-Allen's metric for bits of precision lost ($e$) is:
$$e = -\log_2(1 - \frac{\min(|Z_n|, |z_n|)}{\max(|Z_n|, |z_n|)})$$
When $e$ exceeds the hardware's capacity (23 bits for $f32$), the pixel is "Glitched."

### Re-referencing (The Proxy Collapse)
The most critical failure mode is **Proxy Collapse**, occurring when $|\Delta z_n| > |Z_n|$. At this threshold, the linear term $2Z_n \Delta z_n$ is overwhelmed by the quadratic error. 

**The Solution:** The engine must "Re-reference" by identifying a new anchor coordinate at the glitch site, calculating a new high-precision reference orbit, and switching the local pixel neighborhood to this new reference.

## 6. Failure Modes & Diagnostics
- **Magenta/Solid Screens:** Occurs when the reference escapes too early, leaving $\Delta z$ to explode without an anchor.
- **Glitch Bands:** Sharp discontinuities where the precision loss $e$ exceeds the threshold.
- **Noise/Artifacts:** Signifies that the arbitrary precision used for the reference orbit was lower than the required zoom depth.

## 7. Application to Apeiron
Apeiron implements this theory through a split-architecture:
1.  **Rust WASM Worker:** Calculates the high-precision `ReferenceOrbit` and `OrbitMetadata` using arbitrary-precision math.
2.  **WebGPU Shader:** Executes the `perturbation_step` for every pixel using $f32$ (for speed) or $f32 \times 2$ (Double-Single) for extended range.
3.  **Feedback Loop:** The GPU reports glitch coordinates back to the Rust orchestrator to trigger asynchronous re-referencing and multi-reference blending.

## 8. References
1. Martin, K. I. (2013). *SuperFractalThing Maths*. philthompson.me.
2. Heiland-Allen, C. (2013). *Perturbation techniques applied to the Mandelbrot set*. mathr.co.uk.
3. Ultra Fractal. *Writing Perturbation Equations*. ultrafractal.com.
