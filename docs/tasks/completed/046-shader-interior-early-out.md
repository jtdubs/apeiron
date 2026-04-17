---
status: closed
---

# Task 046: Shader Interior Early-Out — f32 Native Path

## Objective

Eliminate the dominant per-pixel GPU cost for fractal interior points on the **f32 native
escape-time path** by embedding analytic cardioid/bulb membership tests and Brent's in-loop cycle
detection directly in `math_accum.wgsl`, so that interior pixels exit the iteration loop as early
as their orbit structure permits rather than always running to `max_iter`.

> **Scope boundary:** This task covers only `calculate_mandelbrot_iterations` /
> `continue_mandelbrot_iterations` (the f32 non-perturbation path). Interior early-out for
> `calculate_perturbation` is owned by **Task 034** (Limit Cycles & Interior Bounds).

## Relevant Design Docs

- [docs/design/engine/webgpu-passes.md](../../design/engine/webgpu-passes.md)
- [docs/design/engine/core-math.md](../../design/engine/core-math.md)

## Background

The current `continue_mandelbrot_iterations` function in `math_accum.wgsl` has only one early exit:
`mag_sq > 4.0` (escape). Interior pixels — those that belong to the Mandelbrot set — never satisfy
this condition and always iterate to `max_iter`. At zoom ~1e-1 with dense interior coverage, this
is the single largest contributor to GPU frame time (see Task 044 analysis).

This task addresses the problem at the algorithmic / GPU level for the **f32 native path only**.
Task 034 (Limit Cycles & Interior Bounds) owns the equivalent problem for the perturbation path,
where cycle detection involves both the Rust reference orbit computation and the WGSL
`calculate_perturbation` loop. The two tasks are parallel and non-overlapping.

Two complementary techniques are applied to the f32 path:

1. **Analytic Interior Tests (O(1), zero loop cost):**
   - **Main cardioid:** A point `c` is in the main cardioid if `q(q + (cr - 0.25)) < ci²/4`
     where `q = (cr - 0.25)² + ci²`. Analytically proven → return `max_iter` immediately.
   - **Period-2 bulb:** `(cr + 1)² + ci² < 0.0625`. Same.
     These two regions cover the majority of interior pixels visible at modest zooms.

2. **In-Loop Period Detection (Brent's Algorithm):**
   Brent's cycle detection requires O(1) extra storage (just one checkpoint `z` and a step
   counter). Each iteration, compare the current orbit point against the saved checkpoint. If the
   distance falls below a threshold `ε = 1e-20` (squared distance), the orbit is cycling →
   return `max_iter`. Update the checkpoint every power-of-two steps (1, 2, 4, 8, 16, ...).

## Requirements

- **Analytic Cardioid/Bulb Test:** Added as a helper function `is_interior_analytic(cr, ci)` in
  `math_accum.wgsl`. Called at the top of `calculate_mandelbrot_iterations`, before the loop
  entry call to `continue_mandelbrot_iterations`. Must return the interior sentinel
  `vec4<f32>(max_iterations, 0.0, 0.0, 0.0)` on match. **Not** called from
  `calculate_perturbation` — that is Task 034's jurisdiction.

- **Brent Period Detection in `continue_mandelbrot_iterations`:** Embedded in the while loop.
  Uses two WGSL `var` state variables: `check_z: vec2<f32>` (checkpoint) and Brent step
  counters. Squared-distance detection threshold: `1e-20`. Must not alter output for any
  _exterior_ point (only fires for genuinely periodic orbits).

- **f32 path only — no changes to `calculate_perturbation`:** The perturbation loop is
  explicitly out of scope. Any edits to that function belong to Task 034.

- **No Regression on Exterior Points:** The Brent check must not falsely classify an escaping
  orbit as interior. Must be verified against the full headless regression suite.

- **Headless Test Coverage:** A new headless test must verify that known interior points
  (`c = 0+0i`, `c = -1+0i`) return exactly `max_iter` via the f32 path, and that known exterior
  points (`c = 0.5+0i`, `c = -2.5+0i`) are unaffected.

## Implementation Plan

1. **Write a failing headless test** that measures the per-pixel GPU time budget for a 100%
   interior frame (e.g. `c = 0`, large `max_iter`). Record baseline iteration count. This is the
   benchmark the fix must improve. (Do not modify shader code in this step.)

2. **Add analytic interior test helper to `math_accum.wgsl`:**

   ```wgsl
   fn is_interior_analytic(cr: f32, ci: f32) -> bool {
     let q = (cr - 0.25) * (cr - 0.25) + ci * ci;
     if (q * (q + (cr - 0.25)) < 0.25 * ci * ci) { return true; } // cardioid
     let br = cr + 1.0;
     if (br * br + ci * ci < 0.0625) { return true; }             // period-2 bulb
     return false;
   }
   ```

   Call at the top of `calculate_mandelbrot_iterations` (before the loop entry call).

3. **Embed Brent's algorithm in `continue_mandelbrot_iterations`:**

   ```wgsl
   var check_z = vec2<f32>(x, y);
   var check_lam: f32 = 1.0;
   var check_mu: f32 = 1.0;
   // Inside while loop, after computing new x/y:
   check_mu -= 1.0;
   if (check_mu == 0.0) {
     check_z = vec2<f32>(x, y);
     check_lam *= 2.0;
     check_mu = check_lam;
   }
   let dz = vec2<f32>(x - check_z.x, y - check_z.y);
   if (dot(dz, dz) < 1e-20) {
     return vec4<f32>(max_iterations, 0.0, 0.0, 0.0);
   }
   ```

4. _(Perturbation path is out of scope — owned by Task 034. Do not modify `calculate_perturbation`.)_

5. **Re-run headless regression suite** — all existing pixel-value regression tests must pass
   unchanged. The interior test benchmark from step 1 should show a dramatic reduction in per-pixel
   iteration count for interior frames.

6. **Update `docs/design/engine/webgpu-passes.md`** to document the early-out techniques.

## Verification Steps

## Verification Steps

- [x] Headless benchmark: interior fill frame (`c = 0+0i`, `max_iter = 500`) shows GPU frame time
      reduction ≥ 80% vs. baseline (measured via Task 044 `lastMathPassMs`).
- [x] All existing headless regression tests (`npm run test:headless` or `npm run test:engine`) pass without modification,
      confirming no exterior pixel regressions.
- [x] Known interior point unit test: `c = (0, 0)` returns `max_iter`; `c = (-1, 0)` returns
      `max_iter`; `c = (0.5, 0)` returns a finite smooth iteration value (exterior).
- [x] Subjective: panning through the main cardioid at zoom 1e-1 no longer causes perceptible lag
      on the f32 path (combined with Task 044's interactive `maxIter` fraction).
- [x] Confirm `calculate_perturbation` is unmodified from its pre-task state (diff check).
- [x] **Documentation Sync:** Update `docs/design/engine/webgpu-passes.md` Section 1 to document the
      analytic and Brent early-out strategies for the f32 path, and note that the perturbation
      path equivalent is tracked in Task 034.
