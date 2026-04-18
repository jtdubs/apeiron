# Task 068: FloatExp Numerical Format

**Status:** Researching
**Topic:** High-range numeric formats for extreme deep-zoom perturbation.

## Objective
Evaluate the feasibility of replacing or augmenting Double-Single (f64p) with a Float + Exponent (FloatExp) format to handle astronomical zoom depths.

## Research Goals
- [ ] Benchmark FloatExp performance on GPU (using `u32` for exponent and `f32/f64` for mantissa).
- [ ] Compare precision/range trade-offs vs. current `f64p` (Double-Single) implementation.
- [ ] Implement primitive arithmetic (Add/Mul) for FloatExp in WGSL.

## References
- Kalles Fraktaler: "FloatExp" technical notes.
- Pauldelbrot's posts on "Ex-orbit" and extreme zoom precision.
