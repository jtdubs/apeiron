---
status: closed
---

# Task 045: Adaptive Dynamic Resolution Scaling (ADRS)

## Objective

Replace the current static DRS policy (always `1/devicePixelRatio` during interaction) with a
feedback-driven system that continuously measures GPU frame time and dynamically adjusts both
`renderScale` and the interactive `maxIter` cap to keep the GPU math pass within the 16.67 ms
frame budget under all conditions, including extreme interior coverage.

## Relevant Design Docs

- [docs/design/engine/temporal-pipeline.md](../design/engine/temporal-pipeline.md)
- [docs/design/engine/webgpu-passes.md](../design/engine/webgpu-passes.md)

## Prerequisites

- Task 044 must be complete. ADRS requires the `PassManager.lastMathPassMs` telemetry to function.

## Background

Task 044 introduces a fixed `maxIter` cap of 200 during interaction and static DRS (`renderScale =
1/dpr`). This is a significant improvement but still has failure modes:

- **Ultra-dense interior at low zoom:** Even 200 iterations × 100% interior at full DRS resolution
  can exceed 16 ms on low-end mobile GPUs.
- **Deep zoom + perturbation:** At zoom levels requiring 5000+ iterations, even a `1/dpr` render
  scale may not be enough to keep the GPU under budget.
- **Over-aggressive downscaling:** On fast desktop GPUs, `1/dpr` is too conservative — the GPU
  could handle full resolution at 60 fps and produce sharper interactive visuals.

True Adaptive DRS reacts to _measured_ GPU frame time rather than a fixed heuristic.

## Requirements

- **ADRS Controller:** A stateful controller class (pure TypeScript, no GPU dependencies) that
  accepts a `gpuFrameMs` sample each RAF tick and outputs the next frame's `renderScale` and
  `interactMaxIter` recommendations. It must:
  - Increase `renderScale` (recover quality) when `gpuFrameMs < TARGET_MS * 0.75` for 5
    consecutive frames.
  - Decrease `renderScale` (shed load) when `gpuFrameMs > TARGET_MS * 1.1` immediately.
  - Clamp `renderScale` to `[MIN_RENDER_SCALE, 1.0]` where `MIN_RENDER_SCALE = 0.25`.
  - Clamp `interactMaxIter` to `[MIN_INTERACT_ITER, 200]` where `MIN_INTERACT_ITER = 100`.
  - Step sizes: `renderScale ± 0.1` per adjustment step; `interactMaxIter ± 25` per step.
  - Expose `reset()` to snap back to default values when transitioning to `STATIC`.

- **Integration in RAF Loop:** The ADRS controller is instantiated once (alongside the engine ref).
  Each RAF tick during `INTERACT_SAFE` / `INTERACT_FAST`, the loop feeds the controller the latest
  `lastMathPassMs` value and reads back the recommended `renderScale` and `effectiveMaxIter`.

- **STATIC Recovery:** On transition from `INTERACT` → `STATIC`, the ADRS controller is reset to
  defaults. STATIC frames always use `renderScale = 1.0` and `state.maxIter` (unchanged).

- **HUD Visibility:** When the perf HUD (Task 044) is enabled, also display the current ADRS-chosen
  `renderScale` and `effectiveMaxIter` so the adaptive behavior is directly observable.

- **Headless Testability:** The ADRS controller must be a pure function/class with no side effects
  other than internal state. It must be importable and testable in Vitest without any GPU context.

## Implementation Plan

1. **Create `src/engine/AdaptiveDRS.ts`:**

   ```ts
   export class AdaptiveDRSController {
     private renderScale: number;
     private maxIter: number;
     private recoveryFrames = 0;
     constructor(
       private readonly targetMs: number = 14.0,
       private readonly minScale: number = 0.25,
       private readonly maxScale: number = 1.0,
       private readonly minIter: number = 100,
       private readonly maxIter: number = 200,
     ) {
       this.reset();
     }
     reset(): void {
       this.renderScale = this.maxScale;
       this.maxIter = 200;
       this.recoveryFrames = 0;
     }
     update(gpuMs: number): { renderScale: number; effectiveMaxIter: number };
     // ... step logic per spec above
   }
   ```

2. **Unit-test `AdaptiveDRSController` in Vitest:**
   - Test: sustained `gpuMs > target` causes `renderScale` to step down each frame.
   - Test: sustained `gpuMs < target * 0.75` for 5 frames causes `renderScale` to step up.
   - Test: `renderScale` never leaves `[minScale, maxScale]`.
   - Test: `reset()` restores defaults regardless of current state.
   - Test: first call with `gpuMs = -1` (telemetry unavailable, Task 044 degraded) leaves state
     unchanged.

3. **Instantiate in `ApeironViewport.tsx`:**
   - `const adrsRef = useRef(new AdaptiveDRSController())`.
   - Each RAF tick: call `adrsRef.current.update(engineRef.current?.passManager.lastMathPassMs ?? -1)`.
   - Use returned values as `renderScale` and `effectiveMaxIter` during INTERACT frames.
   - Call `adrsRef.current.reset()` on transition to STATIC.

4. **Update HUD telemetry display (extends Task 044 HUD).**

5. **Manual validation:** On both mobile and desktop, pan around a dense interior view. Observe the
   HUD showing the controller stepping `renderScale` and `maxIter` down under load and recovering
   when load drops.

## Verification Steps

- [ ] All Vitest unit tests for `AdaptiveDRSController` pass (`npm test`).
- [ ] On a mobile device / low-end GPU: dense interior panning maintains ≥ 30 fps (≤ 33 ms GPU
      frame time) as ADRS sheds load.
- [ ] On a desktop GPU: sparse exterior view at default zoom pans at full DRS scale (ADRS recovers
      to `renderScale = 1/dpr` target quickly after a load spike).
- [ ] STATIC accumulation is not affected: `renderScale` always returns to `1.0` and `maxIter` to
      `state.maxIter` when `interactionState === 'STATIC'`.
- [ ] `lastMathPassMs === -1` (degraded telemetry) does not crash or change ADRS state.
- [ ] **Documentation Sync:** Update `docs/design/engine/temporal-pipeline.md` Section 2 to document
      ADRS replacing the static DRS policy. Update `docs/product/requirements.md` if new constraints are
      introduced.
