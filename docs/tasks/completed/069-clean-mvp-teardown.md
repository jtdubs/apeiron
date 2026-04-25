---
status: closed
---

# Task 069: Clean MVP Teardown & DS Implementation

## Objective

Strip out the complex perturbation orchestration (Rust web workers, FSM rebasing, reference trees) and transition the engine to a clean, brute-force WebGPU MVP using strictly standard `f32` and `Double-Single` iteration loops, capping the zoom at `1e-14`.

## Relevant Design Docs

- `docs/architecture.md`
- `docs/best-practices.md`

## Requirements

- **Remove Perturbation/Rebasing:** Completely remove `rust.worker.ts`, `PerturbationOrchestrator.ts`, and all reference buffering from `viewportStore` and `RenderOrchestrator`.
- **Brute-Force DS Support:** Write `continue_mandelbrot_iterations_ds` in WGSL that applies `ds_add` and `ds_mul` directly for all pixels without perturbation delta logic.
- **UI Simplification:** Remove perturbation modes from `ApeironSettingsPanel` and leave only `Auto`, `F32`, and `Double-Single`.
- **Zoom Limit:** Enforce a hard cap of `1e-14` zoom in `viewportStore.ts` (this limit is already physically imposed by f64 bounds).

## Implementation Plan

1. **Delete Rust Worker Logic:** Use `run_command` to delete `rust.worker.ts`, `PerturbationOrchestrator.ts`, `RenderOrchestrator.spec.ts` imports, etc.
2. **Clean up State Management:** Modify `viewportStore.ts`, `renderStore.ts`, and `mathContextAdapter.ts` to remove reference grids, BLA grids, and K-Means clustering.
3. **Rewrite WGSL Core Compute:** Update `core_compute.wgsl` to branch purely between `calculate_mandelbrot_iterations` (f32) and a newly defined `calculate_mandelbrot_iterations_ds` (Double-Single). Remove `perturbation.wgsl` dependencies.
4. **Clean up Settings Panel:** Edit `ApeironSettingsPanel.tsx` to remove the outdated render modes.
5. **Verify:** Run WebGPU headless unit tests to ensure that Double-Single math executes deterministically.

## Verification Steps

- [x] Ensure `ApeironSettingsPanel` only shows F32 and DS modes.
- [x] Ensure `zoom` strictly caps at 1e-14 and no coordinate jumping/rebasing occurs.
- [x] Run headless test scripts to confirm standard DS math executes correctly without WebGPU validation errors.
- [x] Implementation standard met (deterministic unit tests updated).
- [x] Documentation Sync.
