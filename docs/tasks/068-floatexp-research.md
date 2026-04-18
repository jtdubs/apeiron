---
status: open
---

# Task 068: FloatExp Numerical Format

## Objective

Evaluate the feasibility of replacing or augmenting Double-Single (f64p) with a Float + Exponent (FloatExp) format to handle astronomical zoom depths.

## Research Goals

- [ ] Benchmark FloatExp performance on GPU (using `u32` for exponent and `f32/f64` for mantissa).
- [ ] Compare precision/range trade-offs vs. current `f64p` (Double-Single) implementation.
- [ ] Implement primitive arithmetic (Add/Mul) for FloatExp in WGSL.

## Relevant Design Docs

- [Rebasing Strategies Whitepaper](../reference/rebasing_strategies_whitepaper.md)
- [Apeiron Best Practices](../process/best-practices.md)

## Requirements

- **WGSL primitive types:** WGSL must calculate using `FloatExp` (`f32` mantissa, `i32` exponent) primitive types.

## Implementation Plan

1. Benchmark FloatExp performance on GPU (using `u32` for exponent and `f32/f64` for mantissa).
2. Compare precision/range trade-offs vs. current `f64p` (Double-Single) implementation.
3. Implement primitive arithmetic (Add/Mul) for FloatExp in WGSL.

## Verification Steps

- [ ] Add Deno tests comparing WGSL `FloatExp` output to TS `BigNumber`.
- [ ] **Implementation standard:** Have all shared boundaries, extracted math helpers, or state-machine behaviors been strictly validated as headless deterministic units per `docs/process/best-practices.md`?
- [ ] **Documentation Sync:** Did this implementation drift from the original plan? If so, update `docs/reference/rebasing_strategies_whitepaper.md` before closing this task.
