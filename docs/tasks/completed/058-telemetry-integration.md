---
status: open
---

# Task 058: Telemetry Data Integration (Producers)

## Objective

Instrument the existing engine components (`ProgressiveRenderScheduler`, `PerturbationOrchestrator`, `ApeironEngine`) to push their volatile debug variables blindly into the `TelemetryRegistry` during the hot path.

## Relevant Design Docs

- [Telemetry Design](../telemetry-design.md)
- [Apeiron Best Practices](../best-practices.md)

## Requirements

- **Scheduler FSM Logging:** Intercept FSM states (`INTERACT`, `DEEPENING`, `ACCUMULATING`) and `yieldIterLimit` and push them as `digital` and `analog` frames respectively.
- **WebWorker Insights:** Log exact WebWorker compute latencies against WASM roundtrips and current Pending Job Queues inside `PerturbationOrchestrator`.
- **GPU Loop Profiling:** Integrate WebGPU timing profiles or generic `performance.now()` into the `ApeironEngine` frame execution, pushing `webgpu.renderms`.
- **Decoupling:** Remove the hardcoded UI string formations from `ApeironViewport.tsx` reliant on getter inspection, letting the engine run isolated.

## Implementation Plan

1. Instantiate `TelemetryRegistry` within `initEngine.ts` and make it available.
2. Modify `ProgressiveRenderScheduler.ts` to `push()` analog frame slices and digital FSM state-changes simultaneously with `command` issuance.
3. Modify `PerturbationOrchestrator.ts` to record timestamp deltas across its `COMPUTE_RESULT` worker messaging and emit to telemetry.
4. Remove the existing monolithic direct-DOM HUD logic from the React `ApeironViewport` file to clean house.

## Verification Steps

- [ ] Ensure that `npm run test:engine` test suites don't break due to the registry dependencies being pulled into the FSM classes.
- [ ] Run application manually and assert via DevTools that `TelemetryRegistry` buffers are actively accumulating real execution data.
- [ ] **Implementation standard:** Have all shared boundaries, extracted math helpers, or state-machine behaviors been strictly validated as headless deterministic units per `docs/best-practices.md`?
- [ ] **Documentation Sync:** Did this implementation drift from the original plan? If so, update `docs/telemetry-design.md` before closing this task.
