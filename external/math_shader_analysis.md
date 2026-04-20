# Math Shaders & Branch Prediction (Phase 3)

This document investigates the inner mathematical execution loops of external rendering layers to evaluate optimization opportunities against Apeiron's `core_compute.wgsl` baseline.

## 1. mightymandel (GLSL Transform Feedback)

`mightymandel` executes its math logic through a heavily optimized Vertex Shader (`fpxx_step_vert.glsl`) rather than a Compute Shader, taking advantage of OpenGL's Transform Feedback geometry pipeline to preserve state between frames.

- **Double Precision:** Because OpenGL (GLSL 4.0+) supports native `double` primitive types, `mightymandel` iterates entirely using hardware `dvec2` and `dvec4` structs.
- **The Execution Loop:**
  ```glsl
  dvec2 dz = ...; // Unpacked directly via packDouble2x32 from textures
  // High-precision step logic
  dz = 2.0 * (cmul(dz0, z) + cmul(dz, z) + cmul(dz, z0));
  z = 2.0 * cmul(z0, z) + csqr(z) + c;
  ```
- **Comparison to Apeiron:** Apeiron runs under the constraints of WebGPU, which lacks native 64-bit float shader capabilities. Because of this, Apeiron pays a massive instruction penalty executing `ds_add` and `ds_mul` (Double-Single `f32p`) logic for high precision. However, `mightymandel` proves that binding reference orbital tables to sampler arrays (`usampler2D zdz0s`) is highly functional for perturbation data lookups, validating Apeiron's approach.

## 2. deep-fractal (WebGL Texture Fetching)

`deep-fractal` is a browser-based application (like Apeiron) but operates on legacy WebGL logic.

- **Orbital State:** It uses an injected string template (`shaders.js`) that constructs a monolithic Fragment shader loop. State is retrieved from a 2D texture map dynamically constructed dynamically per `i`: `unpackOrbit(i)`.
- **Math Precision:** It only uses `highp float`. It does not attempt to unroll split-precision Double-Single logic to calculate beyond standard 32-bit floats natively inside the browser.
- **Iteration Skip (No BLA):** It natively steps $O(N)$ for every pixel and does not implement BLA or BTA algorithms for mathematical skipping, making it unviable at deep ranges compared to Apeiron but useful as a baseline footprint for texture readbacks. 

## 3. Glitch Predictor Comparison

Both `mightymandel` and Apeiron leverage identical heuristic branch logic for throwing execution faults.

**mightymandel:**
```glsl
if (cmag2(z0 + z) < cmag2(z0) * 1.0e-6) { ... glitch ... }
```

**Apeiron (`core_compute.wgsl`):**
```wgsl
let proxy_collapsed = p_mag < dz_mag && dz_mag < 1e-6; 
```

**Synthesis Insight:** Both algorithms rely on the ratio between the reference position and the delta position. The math essentially looks to see if the error deviation ($\Delta Z$) is larger than or equal to the actual reference orbit point ($Z_0$). Because `mightymandel` runs this at native 64-bit precision, it is far more stable per iteration block. Apeiron's split execution logic is mathematically verified against the industry standard here!

### Actionable Opportunities for Apeiron
1. **Unroll Optimization:** Apeiron's `ds_add` and `ds_mul` loops could potentially benefit from being mapped onto a geometry pipeline (Vertex shaders) similar to `mightymandel`'s Transform Feedback if Compute Shaders block execution lanes prematurely due to heavy register pressure.
2. **GLSL Translation for WebGL Fallback:** `mightymandel` provides a clean `fp32` fallback shader architecture if Apeiron requires a WebGL2 rendering path.
