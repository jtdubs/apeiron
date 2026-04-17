---
status: closed
---

# Task 062: Migrate Coloring Mode to WGSL Override

## Objective

Promote `camera.coloring_mode` to a WGSL `@id` override replacing its dynamically uniform branch. This will guarantee absolute Dead Code Elimination (DCE) of triangle inequality accumulation logic, lowering active Vector General Purpose Register (VGPR) footprint for deep zoom computations.

## Relevant Design Docs

- [Apeiron Best Practices](../process/best-practices.md) (Standard boundary/testing rules apply)

## Requirements

- **Pipeline Override:** The WGSL compiler must treat `coloring_mode` as an `@id(2)` constant to ensure dead code pathways (e.g. `tia_sum` accumulation) are structurally pruned from the assembly.
- **Data Boundary Maintenance:** Remove or safely pad the former `coloring_mode` position in `CameraParams` within `schema/MemoryLayout.json` so that uniform offsets remain strictly 16-byte WGSL-aligned.
- **Pipeline Cache Keys:** `PassManager.ts` must append the coloring mode constant into its `pipelineCache` key (e.g., `exponent_perturbation_coloring`).
- **Dependencies:** This task relies on **Task 063** (Pipeline Pre-compilation) to guarantee that switching coloring permutations asynchronously does not halt the rendering application.

## Implementation Plan

1. In `src/engine/shaders/escape/math_accum.wgsl`, migrate `camera.coloring_mode` to `@id(2) override coloring_mode: f32 = 0.0;`. Replace internal usages accordingly.
2. In `schema/MemoryLayout.json` replace the original `coloring_mode` in `CameraParams` with `pad_c` to keep uniform byte alignments intact.
3. In `src/engine/PassManager.ts`, append `coloring_mode` parameter to `AccumulationPass.getPipeline(exponent, usePerturbation, coloringMode)` and push it into the pipeline dictionary and `createComputePipeline` entry constants.
4. Run `npm run build:math` and verify TS/Rust layers sync appropriately.

## Verification Steps

- [ ] Execute `npm run test:engine` and ensure all headless tests correctly bootstrap their required shaders.
- [ ] Render headless mathematical tests checking if `tia_sum` is accurately pruned when testing `unit_test_state_resume`.
- [ ] **Implementation standard:** Have all shared boundaries, extracted math helpers, or state-machine behaviors been strictly validated as headless deterministic units per `docs/process/best-practices.md`?
- [ ] **Documentation Sync:** Did this implementation drift from the original plan? If so, update `docs/[relevant-design].md` and `docs/product/requirements.md` before closing this task.
