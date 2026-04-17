---
status: closed
---

# Task 024: Engine PassManager & UI Cleanup

## Objective

Break apart the monolithic WebGPU `initEngine.ts` orchestration layer into `AccumulationPass` and `PresentationPass` abstractions through a unified `PassManager`. Resolve remaining UI technical debt from the internal code review.

## Relevant Design Docs

- `docs/design/engine/webgpu-passes.md`
- `docs/process/code-layout.md`

## Requirements

- **PassManager Implementation:** `initEngine.ts` must be refactored to delegate WebGPU pipeline creation, binding, and execution to abstracted pass objects instead of flattening all logic into a single closure.
- **Store Nomenclature Parity:** Ensure stores match architectural designs exactly. Rename `themeStore.ts` to `renderStore.ts` and update all imports.
- **Settings CSS Extraction:** Remove over 500 lines of excessive inline JSX styling within `ApeironSettingsPanel.tsx` by pushing standard design constraints into `ApeironHUD.css`.

## Implementation Plan

1. Rename `src/ui/stores/themeStore.ts` to `renderStore.ts` and refactor imports globally.
2. Extract all inline CSS out of `ApeironSettingsPanel.tsx` into corresponding CSS selectors in `ApeironHUD.css`.
3. Create `src/engine/PassManager.ts` to establish an interface/class for managing WebGPU pipelines.
4. Separate the `math_accum.wgsl` pipeline generation into an `AccumulationPass` class.
5. Separate the `resolve_present.wgsl` pipeline and UI uniforms into a `PresentationPass` class.
6. Refactor `initEngine.ts` to simply instantiate the `PassManager` and manage the SwapChain, routing request parameters to the respective passes without inline clutter.

## Verification Steps

- [ ] WebGPU runs at 60fps without crashing after class delegation is implemented.
- [ ] UI Settings Panel renders visually identical to its previous inline-styled state.
- [ ] `npm run test:engine` succeeds and headless regressions still perfectly match without breaking WebGPU bind groups.
- [ ] **Documentation Sync:** Did this implementation drift from the original plan? If so, update `docs/[relevant-design].md` and `docs/product/requirements.md` before closing this task.
