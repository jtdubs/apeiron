---
status: closed
---

# Task [Bug-Perturbation]: Isolate and resolve "Solid Screen" Rendering at 1e-5 Zoom

## Objective

Identify, isolate, and fix the "solid screen" artifact that occurs at specific rendering coordinates during the transition from f32 math to Perturbation mode (~1e-4 / 1e-5 zoom levels). Determine if this is a "Reference Glitch" (requiring rebasing), an arithmetic underflow/NaN cascade, or a tolerance bug in the Bilinear Approximation (BLA) tree.

## Relevant Design Docs

- [Math Backend Design](../design/engine/core-math.md)
- [Rendering Engine Design](../design/engine/webgpu-passes.md)

## Requirements

- **Diagnostic Isolation:** Temporarily inject shading visualization modes into the WebGPU perturbation inner-loop to expose math failures (e.g., NaN cascades, escaping `\Delta_z > Z_n` limits).
- **Headless Reproduction:** Extract the exact mathematical state producing the error and capture it in a headless Deno verification script to trace execution deterministically.
- **Durable Solution:** Implement an architectural or mathematical fix (such as Reference Rebasing, BLA parameter tuning, or precision upgrade) depending on diagnostic output. Maintain f32 baseline performance unless structurally impossible.

## Implementation Plan

1. **Phase A: Find the Coordinate & Identify the Mode of Failure.**
   - Work with the user to get the exact `[zr, zi, cr, ci]` coordinate triggering the bug.
   - Inject debug visualizers (color-coded NaN checkers, glitch bounding detectors) into `camera.debug_view_mode`.
   - Toggle BLA off temporarily to see if the bug remains in standard Perturbation or is unique to BLA leap-stepping.
2. **Phase B: Headless Automated Test Generation.**
   - Construct a targeted automated test script capturing this exact viewport parameter space.
   - Observe standard execution limit failures (`data_out`) versus expected mathematical bailout.
3. **Phase C: Implementation & Fix.**
   - Refactor `math_accum.wgsl` or `math-core` (Rust) logic depending on identified root cause (e.g. inject Rebasing, DS arithmetic, or branch fail-safes).
   - Ensure pixel-perfect determinism using our new test suite.

## Verification Steps

- [ ] Provide initial failure coordinates and visual debugging feedback.
- [ ] Implement robust diagnostic visualizers inside WGSL for rapid QA feedback.
- [ ] Create isolated Headless Deno Test simulating the failure point.
- [ ] Implement Fix.
- [ ] Verify test suite passing and interactive visual resolution in browser.
- [ ] **Implementation standard:** Have all shared boundaries, extracted math helpers, or state-machine behaviors been strictly validated as headless deterministic units per `docs/process/best-practices.md`?
- [ ] **Documentation Sync:** Did this implementation drift from the original plan? If so, update `docs/[relevant-design].md` and `docs/product/requirements.md` before closing this task.
