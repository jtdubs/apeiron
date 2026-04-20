# Glitch Ejection and Rebasing (Phase 4)

This document investigates how external tools detect perturbation failures ("Proxy Collapse" or "Glitches") and orchestrate "Rebasing" to maintain precision during deep zooms, comparing them against Apeiron's asynchronous rust execution model.

## 1. Kalles Fraktaler 2+ (`fraktaler-2`) - Analytical Glitch Detection

`fraktaler-2` provides the most mathematically rigorous approach to identifying proxy failure. Rather than relying entirely on a flat ratio like Zhuoran's heuristic, KF2 executes an analytical bounds check comparing the first derivative scaling against pixel spacing.

- **Formula (`formula.h:42`)**:
  ```cpp
  // |2w'(w+z)+1|/|delta0|+|w|(|w+2z|+|w|+2|z|)<epsilon/h
  R a = mag(2 * (dr * Zzr - di * Zzi) + 1, ...);
  R b = mag(cr, ci) + mag(zr, zi) * (...);
  return a * h < b * e;
  ```
- **Insight**: `h` represents the pixel spacing, and `e` represents the error margin. This checks if the perturbed error volume `b * e` overtakes the analytical scaled view bounds `a * h`. This is a highly stable check that dynamically hardens as zoom scales increase instead of operating strictly on orbit magnitude.

## 2. Fraktaler-3 - Inline CPU Rebasing

Because `fraktaler-3` is intrinsically CPU-bound, it can perform miraculous state healing instantaneously without communicating over GPU/Worker barriers.

- **Threshold (`hybrid.h:130`)**:
  ```cpp
  complex<t> Zz = Z + z;
  if (norm(Zz) < norm(z))
  {
    z = Zz;
    Z = 0;
    rebased = true;
  }
  ```
  It verifies `|Z + dz|^2 < |dz|^2`. If true, the delta magnitude has swallowed the reference magnitude!
- **Inline Healing (Rebasing)**: Rather than throwing an error and halting, it instantaneously absorbs the reference into the delta (`z = Zz;`), zeroes out the reference locally (`Z = 0;`), and flags the orchestrator that it effectively `rebased = true`. The CPU thread just keeps chugging using a zeroed baseline, essentially pivoting the reference coordinate seamlessly.

## 3. Comparison & Refinement for Apeiron

### Apeiron's Baseline (GPU -> WebWorker -> Rust)
- Apeiron calculates: `let proxy_collapsed = p_mag < dz_mag && dz_mag < 1e-6;`.
- When true, the GPU terminates the thread, exports the bailout array, and the TypeScript orchestrator asks the Rust WASM module to spawn a `BigDecimal` `ReferenceTree` sequence starting exactly at the point of failure.

### Refinement Path
1. **The Condition Check**: Apeiron's `proxy_collapsed` relies on checking `p_mag < dz_mag`. `fraktaler-3` proves that checking the *resolved* magnitude `norm(Z + z) < norm(z)` is slightly more strictly bounded. We should consider replacing `p_mag < dz_mag` with `cmag2(z0 + dz) < cmag2(dz)` within `core_compute.wgsl`.
2. **GPU Rebasing?**: We can't do Kalles-style inline rebasing cleanly on the GPU because Apeiron relies on unified SSBOs that must stay synchronized across the grid. Apeiron's current architecture of stopping, ejecting to TS, and throwing it to the Rust arbitrary-precision background engine is perfectly justified by the limitations of WebGPU architecture compared to CPU-C++ architectures.
