# Apeiron Mathematical Baseline (Phase 1)

This document establishes the exact mathematical, architectural, and memory footprint of Apeiron as it currently stands. It serves as the formal baseline against which external tools (like Fraktaler 3, Kalles Fraktaler, etc.) will be compared in subsequent analysis phases.

## 1. Core Data Structures & Grids

### Reference Tree & Memory
Apeiron maintains a generalized memory structure for arbitrary precision orbits.
- **Reference Tree (`ReferenceTree` in Rust):** Arbitrary-precision nodes (using `BigDecimal`) acting as "anchors". 
- **Caching (`KEYFRAME_STRIDE = 1000`):** Instead of storing millions of high-precision `BigComplex` structs, the Rust tree caches keyframes every 1000 iterations to save memory, stepping forward on the fly as arbitrary queries are made. 
- **GPU Memory Mapping:** The `ref_orbits` layout on the GPU is loaded into a flat array of packed 64-bit bounds (`vec2<u32>`) that are deterministically unpacked in WGSL into High/Low slices (`unpack_f64_to_ds`) for emulated precision splits.

### BLA / BTA Data Grids
Apeiron utilizes a generalized BLA/BTA Stepper (`bla_stepper.wgsl`):
- **Maximum Layers:** Fixed at 15 layers (`for(var l_: i32 = 15; l_ >= 0; l_ -= 1)`), spanning up to $2^{15}$ steps at once. 
- **Grids:** Computes against two variants of the BLA grid:
  - `bta_grid`: Stores 2nd-order Bivariate Taylor Approximation coefficients ($A, B, C, D, E$ complex matrices).
  - `dsbla_grid`: Stores standard BLA matrices expanded out into Double-Single slices ($A_{r\_hi}, A_{r\_lo}$, etc.) for extreme precision skips.

## 2. Double-Single Execution Path (`f32p`)

Apeiron utilizes an explicitly isolated Double-Single execution runtime:
- **Mode Dispatch:** When `math_compute_mode == 2u`, the `calculate_perturbation` loop shifts to Double-Single emulated loops.
- **Data Shapes:** Perturbation targets (`dz`) and parameter offsets (`dc`) expand from standard `vec2<f32>` to `vec4<f32>` natively inside WGSL, using components `(RealHi, RealLo, ImagHi, ImagLo)` logic decoupled via `complex_add_ds` and `complex_mul_ds`. 
- **Tolerance Scaling:** For Double-Single iterations, BLA linearity checks use a much stricter static tolerance boundary (`1e-14` or `1e-15`) vs standard `f32` (`1e-7`), preventing geometric drift during exponential matrix multiplications.

## 3. Glitch Detection Heuristics

Apeiron employs the Zhuoran Proxy Collapse check but restricts it specifically to prevent mathematical anomalies (GPU NaN bombs): 

```wgsl
// Proxy Collapse Detection (Zhuoran Zero-Crossing algorithm)
let p_mag = cur_next_x * cur_next_x + cur_next_y * cur_next_y; // |Z_m + dz|^2
let dz_mag = dz.x * dz.x + dz.y * dz.y;    // |dz|^2
let proxy_collapsed = p_mag < dz_mag && dz_mag < 1e-6; 
```

- When `dz` is larger than the actual reference position, the assumed small-delta linearization rules snap.
- A secondary check ensures `dz_mag < 1e-6`, proving that the pixel is deep in a dense zoom hole rather than just experiencing a generic divergence boundary.

## 4. Reference Rebasing Mechanism

When a glitch passes the heuristic threshold, Apeiron uses an asynchronous queue architecture to heal the zone:
- **Ejection & Feedback:** Glitched pixels bump an atomic counter `atomicAdd(&glitch_readback.count, 1u)` and upload their raw coordinates into an array buffer to notify the TS Worker thread.
- **Heal Calculation (`glitch.rs`):** Rust takes the `delta_cr, delta_ci` offsets from the feedback payload, adds it natively to the `current_anchor` via `BigDecimal::with_prec(100)`, and allocates a specific new child node deeper in the `ReferenceTree`.
- **Payload Regeneration:** An isolated payload is computed asynchronously on this new node, forcing a brand new reference orbit down through the rendering FSM seamlessly without blocking the primary loop.
