---
status: closed
---

# Task 064: Unified Render Mode and Pipeline Specialization

## Objective

Unify the configuration, telemetry observability, and execution logic of the mathematical render modes (`f32`, `f32_perturbation`, `f64_perturbation`). This replaces dynamic runtime branching deep within the WGSL hot loop with rigorous `@id` override-based precompilation, while consolidating "auto" mode evaluation gracefully in the temporal engine orchestration cycle rather than hacky UI components.

## Relevant Design Docs

- [Apeiron Best Practices](../process/best-practices.md)
- [Math Backend Design](../design/engine/core-math.md)
- [Pipeline-Overridable Constants](completed/048-pipeline-overridables.md)

## Requirements

- **Unified Configuration**: Deprecate the boolean-like `precisionMode: 'f32' | 'perturbation'` in `renderStore` in favor of an explicit `renderMode: 'auto' | 'f32' | 'f32_perturbation' | 'f64_perturbation'`.
- **Top-Down Evaluation**: Move the logic that infers dynamic precision based on bounds/zoom depth (`< 1e-10` etc) into the `RenderOrchestrator` evaluation loop, distilling it into `effectiveMathMode: number` directly baked into the `MathContext`.
- **Passive Observability**: Refactor `ApeironViewport.tsx`'s telemetry logic to stop calculating precision and instead trivially read `context.effectiveMathMode`, eliminating duplicated logic branches.
- **Hardware Pipeline Precompilation**: Eliminate branching functions (e.g. `deep_zoom`) inside `math_accum.wgsl` and expand `@id` definitions into `@id(1) override math_compute_mode: u32 = 0u`. Update `PassManager` to build specific execution permutations cached alongside fractal dimensions.

## Implementation Plan

1. Migrate `renderStore` property `precisionMode` to `renderMode` and its UI bindings in `ApeironSettingsPanel`.
2. Update `RenderFrameDescriptor.ts` `MathContext` interface to enforce `effectiveMathMode: number`.
3. In `RenderOrchestrator.ts`, evaluate `effectiveMathMode` and pass it to `buildMathContext.ts`. Also dispatch `effectiveMathMode` to the existing `engine.math_mode` telemetry channel inside `tick()`.
4. In `ApeironViewport.tsx`, remove the hacky math mode telemetry injection logic.
5. In `PassManager.ts` update `getPipeline()` and caching constraints to use the evaluated `mathComputeMode` numeric.
6. In `math_accum.wgsl`, delete `let deep_zoom = ...` expressions and explicitly pivot to checking the `@id(1) override math_compute_mode: u32` constant (such as `if (math_compute_mode == 2u) { ... } else if (math_compute_mode == 1u) { ... }`). Ensure graceful branching that allows the WGSL pipeline compiler to nuke un-selected logic paths natively.

## Verification Steps

- [ ] Execute `WebGPUTestHarness` to verify the mathematical soundness of unified compute branches natively.
- [ ] Render a frame at $10^{15}$ depth (Deep Zoom DS Path) and confirm standard operations.
- [ ] View telemetry inside dashboard to confirm modes change deterministically via auto zoom changes.
- [ ] Observe UI Settings to verify manual override mappings drop appropriately via rendering state observation.
