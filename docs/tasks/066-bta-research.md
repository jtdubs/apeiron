# Task 066: Research Bilinear Taylor Approximation (BTA)

**Status:** Researching
**Topic:** Higher-order bivariate approximations for iteration skipping.

## Objective
Investigate the implementation of 2nd and 3rd-order Taylor series expansions for perturbation deltas.

## Research Goals
- [ ] Derive coefficients for the quadratic terms: $C \Delta z_n^2 + D \Delta z_n \Delta c + E \Delta c^2$.
- [ ] Evaluate the trade-off between increased pre-computation time/storage and the larger "jump" sizes allowed by BTA.
- [ ] Determine the "sweet spot" for order of expansion in GPU-bound environments (WebGPU).

## References
- FractalForums: "Bivariate Taylor Approximation for Mandelbrot"
- Kalles Fraktaler 2+ Implementation notes.
