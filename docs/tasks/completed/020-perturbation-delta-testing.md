---
status: closed
---

# Task 020: Perturbation Delta Offset Testing

## Objective

Identify and fix the critical gap in the headless test suite where automated regression tests only execute perturbation math with `delta_c == 0.0`, entirely bypassing the core logic that causes deep-zoom artifacts during actual UI rendering.

## Relevant Design Docs

- `docs/process/test-plan.md`
- `docs/design/engine/core-math.md`

## Requirements

- **Delta Offset Testing:** The headless test suite (`run-headless.ts`) must test coordinate points that are specifically offset from the reference anchor (`start_c != ref_c`), mirroring how `fs_main` calculates `uv_mapped` pixel variants.
- **Delta Vector Definitions:** `tests/cases.json` needs to be extended, or the headless test runner needs to synthesize multiple off-center points for each anchor coordinate (e.g., center, +1e-5 real, -1e-5 imag) at various simulated zoom scales.
- **Reproduce Glitches Systematically:** By synthesizing scaled zoom offsets within the test suite, we must be able to programmatically trigger the math error causing the "solid magenta" or "coarse topography" artifacts observed in the UI without needing visual/manual verification.

## Implementation Plan

1. Modify `tests/run-headless.ts` to test a cluster of pixels (e.g., center, top-left, bottom-right) for each anchor in `cases.json`, simulating the `uv_mapped` logic from the fragment shader using realistic scale offsets (such as sizes `< 10^-5`).
2. Update the `initEngine.ts` `executeTestCompute` method so that it accepts and passes both a `start_c` array and an array of `ref_c` anchors (or applies a delta offset) so that `execute_engine_math` runs with actual `delta_c` values.
3. Validate that `run-headless.ts` properly catches mathematical breakdown (divergence leading to `NaN` iter values, or loss of detail) before we proceed to fix the underlying perturbation breakdown.
4. Execute the test and collect the `NaN` errors, then update the WGSL fallback logic to transition more gracefully to f32 or handle extreme `delta_c` errors properly.

## Verification Steps

- [x] Modify `executeTestCompute` to support testing `delta_c != 0`.
- [x] Run `npm run test:engine` and observe whether it now captures the regression/divergence on deep zoom patches.
- [x] **Documentation Sync:** Update `docs/process/test-plan.md` to note that perturbation assertions require proxy validation at scaled pixel offsets, not just single analytical anchor points.
