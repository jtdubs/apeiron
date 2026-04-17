---
status: closed
---

# Task 028: Resolve Magenta Screen Glitch at Deep Zoom

## Objective

Investigate and fix a rendering issue where zooming past 1e-4 results in a solid magenta screen, which likely implies NaNs or Infinitys are taking over the shader calculation space.

## Relevant Design Docs

- [Math Backend Design](../../design/math-backend.md)
- [Rendering Engine Design](../../design/rendering-engine.md)

## Requirements

- **Identify the Cause:** Reproduce the magenta screen artifact and identify the conditions creating NaNs/Infs within `math_accum.wgsl` or `PassManager.ts`.
- **Add Tests:** Introduce tests to the regression test layers that catch the magenta screen glitch, specifically hunting for invalid WebGPU output states.
- **Implement the Fix:** Repair the shader/engine pipeline without altering the tests to work around the reproduction of the issue.

## Implementation Plan

1. **Observe and Analyze:** Create unit tests in `run-headless.ts` focused to query rendering outputs for NaNs and Infinities or out-of-bounds representations.
2. **Find the NaN Source:** Debug WebGPU WGSL `math_accum.wgsl` to track the exact variable returning Infinity and spilling over to the UI.
3. **Draft the Patch:** Introduce WGSL safety measures or mathematical clamping.
4. **Validation:** Execute `test:engine` to verify that no pixel triggers structural faults and that our headless test correctly executes.

## Verification Steps

- [x] Write data/headless tests asserting `NaN/Infinity` avoidance at extremes.
- [x] Render frame successfully passes newly generated assertions.
- [x] No regressions in bit-perfect outputs.
- [x] Documentation Sync: update any math docs if the WGSL model was significantly altered.
