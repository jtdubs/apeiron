---
status: closed
---

# Task 061: Decouple Frame Budget from Execution

## Objective

Fully detach the per-frame computational budget from the mathematical outcomes (`iter` counts) of the render pipeline, allowing unhindered Bilinear Approximation (BLA) jumps while preventing UI lockups via a stable PID controller frame budget.

## Relevant Design Docs

- [Progressive Rendering Design](../progressive-rendering-design.md)
- [State Machine Architecture](../state-machine-architecture.md)
- [Apeiron Best Practices](../best-practices.md)

## Requirements

- **Mathematical Independence:** The outcome images evaluated must be mathematically identical regardless of the target frame budget or frame boundary yields.
- **Variable Clarity:** Rename the confusing `maxIter` and `trueMaxIter` within `MathContext` to clearly distinguish the dynamic computation boundary (e.g., `computeMaxIter`) from the invariant coloring boundary (e.g., `paletteMaxIter`).
- **Unrestricted BLA:** BLA operations must be permitted to skip as many `iter` steps as mathematically valid up to `computeMaxIter`, completely ignoring the frame executing `budget`. The frame `budget` restricts loop execution _steps_, not mathematical `iter`.
- **Restored PID Frame Budgeting:** `IterationBudgetController` must use a low-pass discrete proportional filter (smoothly reacting PID) to map `gpuMs` against a `targetMs` (~14ms), eliminating oscillating edge-flickering.
- **Data-Driven Completion Sync:** Because the CPU (`ProgressiveRenderScheduler`) can no longer blindly calculate mathematical progress via step counting, the `math_accum.wgsl` shader must signal back to the `PassManager` when the entire viewport grid has completed `max_iterations` or escaped. The async resolution of this flag explicitly triggers the `FSM` transition from `DEEPENING` to `ACCUMULATING`.

## Implementation Plan

1. **Step-based Budgeting in WGSL:** Rename `yieldIterLimit` to `stepLimit` (or `stepBudget`) in the `ExecutionCommand`. Update `math_accum.wgsl` execution loops to track an execution `var steps = 0.0`. Bound yielding explicitly by `steps < camera.step_limit` alongside `iter < max_iterations`.
2. **GPU `iteration_target_met` Flag:** Add a 4-byte `storage` buffer `completion_flag` initialized to `1` (true). If any thread yields due to the step budget without completing `max_iterations` or escaping, it writes `0` (false), effectively acting as an `is_iteration_target_met` boolean.
3. **Async Pipeline Mapping:** Implement an async buffer read inside `PassManager.ts` that safely tests this flag without pipeline stalling. Propagate this boolean through the loop block to the FSM.
4. **FSM Modernization:** Strip the FSM `ProgressiveRenderScheduler.ts` of its `deepeningTotalIter >= maxIter` naive math guessing. Relink the state transitions securely to the new asynchronous `isIterationTargetMet` channel.
5. **Restore PID Filter:** Fully rewrite `IterationBudgetController.ts` using the PID filtering pattern (from prior branch `ddaf857`), safely unlinking it from rigid boundaries once `deepening` is complete.

## Verification Steps

- [x] Ensure `IterationBudgetController.spec.ts` accurately tests the PID scaling pathways and edge-case extreme latencies.
- [x] Provide tests showing that chunked and singular passes across the math shaders generate matching states when boundaries split.
- [x] Ensure `ACCUMULATING` state fires securely ONLY once the `completion_flag` returns `0`.
- [x] **Implementation standard:** Have all shared boundaries, extracted math helpers, or state-machine behaviors been strictly validated as headless deterministic units per `docs/best-practices.md`?
- [x] **Documentation Sync:** Did this implementation drift from the original plan? If so, update `docs/[relevant-design].md` and `docs/requirements.md` before closing this task.
