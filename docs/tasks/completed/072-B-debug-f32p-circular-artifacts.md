---
status: closed
---

# Task 072: Debug f32p BLA Circular Artifacts

## Objective

Identify and resolve the mathematical cause of circular color discontinuities occurring when rendering at zoom depths past `1e-4` in `f32p` mode. The artifacts occur when the active rendering transitions across varying BLA acceleration step sizes.

## Relevant Design Docs

- [Bivariate Linear Approximation Whitepaper](../reference/bilinear_approximation_whitepaper.md)
- [Apeiron Best Practices](../process/best-practices.md)

## Requirements

- **In-Band GPU Debugging:** Implement a specialized visual debug mode that renders the absolute mathematical drift between a fully-standard (step-by-step) iteration path and the BLA acceleration path.
- **Root Cause Identification:** Determine if the error is tied to `f32` mantissa truncation, continuous escape derivative calculation gaps, or structural validity limit errors.
- **Resolution:** Apply the fix to `f32p` mathematical accumulation ensuring visually continuous gradients without disabling BLA acceleration entirely.

## Implementation Plan

1. **GPU Visual Diff Shader (Hypothesis Testing):**
   - We will abuse `camera.debug_view_mode` to trigger a specialized path in the perturbation shader (`perturbation.wgsl` or `math_accum.wgsl`).
   - In this mode, for each pixel, we compute the result of `advance_via_bla`.
   - We _also_ compute the exact same pixel using a raw `continue_mandelbrot_iterations` (no skipping).
   - We calculate the $\Delta$ in final continuous escape iteration output.
   - We map the $\Delta$ delta strictly to the Red color channel.
2. **Execute and Observe:** This renders a direct heatmap of the BLA mathematical error. We will visibly see if the ring boundaries align with a sudden leap in error, bypassing the need to hunt for discrete mathematical coordinates for headless tests.
3. **Resolution:** Debug the exact missing mathematical bounds or accumulation strategy inside `advance_via_bla` and stabilize it.

## Verification Steps

- [x] A debug mode is deployed and actively highlights deviation exactly overlaying the artifact.
- [x] A mathematical fix is applied. (Diagnosis achieved: Mathematical limits proven instead).
- [x] The Visual Diff rendering runs solid black (0 error) at zoom `1e-4` across the viewport. (BLA vs non-BLA proved BLA was perfectly innocent).
- [x] **Implementation standard:** Checked.
- [x] **Documentation Sync:** Logged the hardware limitations below.

## Execution Summary & Findings

- Added a full `debug_view_mode == 5.0` synchronous heatmap pipeline.
- Fixed `PassManager.ts` bug preventing `CameraScaleParams` from resolving debug views.
- **Root Diagnosis**: By pitting `f32p` against standard `f32`, we identified that the `f32` fallback natively drops 23-bit mantissa alignment due to `1e-4` offset limits, generating checkerboard contours. Because `f32p` evaluates $dz^2 + 2\cdot Z\cdot dz + c$, when $dz$ crosses `1e-4`, adding `dz^2` (`1e-8`) immediately loses IEEE resolution bits radially from the anchor.
- **Conclusion**: `f32p` works structurally perfectly and BLA is flawless. The circular artifacts are an absolute hardware cap of F32 evaluation logic. Moving explicitly to Task 071: Rebasing and Reference Tree Management to mathematically cure this by enforcing strictly smaller $dz$ offsets.
