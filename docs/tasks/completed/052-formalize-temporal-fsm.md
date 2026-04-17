---
status: closed
---

# Task 052: Formalize Temporal State Machine & Pipeline Contract

## Objective

Extract the implicit boolean logic and progressive iteration counters currently trapped in the `ApeironViewport.tsx` render loop into a formal Finite State Machine (FSM), decoupling declarative mathematical intent from imperative WebGPU rendering commands.

## Relevant Design Docs

- [State Machine Architecture](../../architecture/state-machine.md)
- [Progressive Rendering Design](../../design/progressive-rendering.md)

## Requirements

- **Requirement 1: Viewport Epochs:** Remove individual dirty-checking parameters on geometry. Introduce an immutable geometry snapshot mechanism so the system deterministically acts when mathematical properties mutate.
- **Requirement 2: Temporal FSM:** Create an explicit state machine spanning `INVALIDATED -> DEEPENING -> ACCUMULATING -> RESOLVED`. Ensure the React render closure is purely stateless.
- **Requirement 3: Split RenderFrameDescriptor:** Refactor `RenderFrameDescriptor` into distinct sub-interfaces: `MathContext` (the declarative physics) and `ExecutionCommand` (the imperative GPU behavior). Update `PassManager` to consume these structured layers.
- **Requirement 4: Strict FSM Testing:** Because the new `ProgressiveRenderScheduler` is purely deterministic TypeScript (no UI or WebGPU side effects), it must be accompanied by a comprehensive suite of headless unit tests validating state transitions.

## Implementation Plan

1. **Schema Refactoring:** In `src/engine/RenderFrameDescriptor.ts`, split the single interface into `MathContext` and `ExecutionCommand` definitions.
2. **Immutable Snapshots:** Update `src/ui/stores/viewportStore.ts` to deterministically bundle geometry and parameters into a snapshot-capable struct (a `ViewEpoch` equivalent).
3. **Construct the FSM:** Create `src/engine/ProgressiveRenderScheduler.ts`. Port the implicit `accumulationCount`, `deepeningTotalIter`, and `yieldIterLimit` logic here. The class must evaluate a mathematical context and output an explicit `ExecutionCommand`.
4. **Unit Test the FSM:** Create `src/engine/__tests__/ProgressiveRenderScheduler.test.ts`. Write headless unit tests proving that mutating the `ViewEpoch` correctly triggers `INVALIDATED` states, and stable epochs correctly advance through `DEEPENING` and `ACCUMULATING`.
5. **Clean the Viewport:** Strip the internal tracking counters out of `ApeironViewport.tsx`'s RAF loop. The loop should solely bridge state updates into the FSM to fetch the `ExecutionCommand`, then bundle the config into WebGPU via `engine.renderFrame(...)`.
6. **Engine Alignment:** Adapt `engine.renderFrame()` in `PassManager.ts` to seamlessly process the bifurcated structures without altering the validated buffer mechanics.

## Verification Steps

- [ ] **FSM Unit Test Coverage:** Ensure `ProgressiveRenderScheduler.test.ts` passes and adequately tests state boundaries and reset triggers.
- [ ] Interactive Regression: Render the continuous `f32` fractal and trace `deepening` completion into `accumulating`.
- [ ] Pan continuous validation: Ensure the FSM reliably snaps to `INVALIDATED/INTERACT`, wiping accumulation arrays to avoid smearing the image during drag actions.
- [ ] Sleep Test: Rest the view for 2+ seconds and verify WebGPU telemetry drops to zero-load indicating `RESOLVED` success.
- [ ] Headless Run: Execute `npm run test` ensuring that Data Unit Tests for `math_accum.wgsl` accurately pass with the refactored uniform pipelines.
- [ ] **Documentation Sync:** Confirm modifications match the newly established parameters within `docs/architecture/state-machine.md`.
