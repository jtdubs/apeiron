---
status: closed
---

# Task 077: Fix f32 Transition Threshold

## Objective

Fix the transition threshold out of standard `f32` precision. Currently, the orchestrator waits until `zoom < 1e-5` to switch to `f32_perturbation`, which leads to visible pixelation because the coordinate deltas exhaust the 24-bit mantissa space before reaching this depth.

## Relevant Design Docs

- [Math Backend Design](../design/engine/core-math.md)
- [Apeiron Best Practices](../../best-practices.md) (Standard boundary/testing rules apply)

## Requirements

- **Early Precision Shift:** The `auto` render mode in `RenderOrchestrator` must switch from `f32` to `f32_perturbation` at a lower depth (e.g. `zoom < 1e-4` or `5e-4`) before the `f32` step size drops below `~2.38e-7`.
- **f64p Review:** The `f32p -> f64p` boundary should also be evaluated and ideally tested to avoid similar truncation.

## Implementation Plan

1. Create an isolated headless test case in `src/engine/__tests__/RenderOrchestrator.spec.ts` that provides a `zoom = 1.89e-5` and verifies `auto` mode currently incorrectly selects math mode 0 (`f32`) instead of 1 (`f32p`).
2. Run the test and confirm it fails.
3. Modify the threshold in `RenderOrchestrator.ts` from `1e-5` to `1e-4` (and `1e-10` to `1e-9` if applicable).
4. Run the test again to ensure it selects the correct mode.

## Verification Steps

- [ ] New `RenderOrchestrator.spec.ts` correctly captures the `auto` mode rendering limits.
- [ ] Transition pixelation issue is resolved on `f32` boundary.
- [ ] Implementation standard met.
- [ ] Documentation Sync.
