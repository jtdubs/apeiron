---
status: closed
---

# Task 063: WebGPU Pipeline Caching and Pre-compilation

## Objective

Implement eagerly-compiled permutations via `createComputePipelineAsync` inside `PassManager` to avoid main-thread stuttering when users interact with UI themes (coloring) or scrub smoothly across continuous fractal exponents.

## Relevant Design Docs

- [Apeiron Best Practices](../process/best-practices.md) (Standard boundary/testing rules apply)

## Requirements

- **Async Compilation:** When properties requiring new WGSL overrides are changed (such as toggling an exponent on a UI slider), the browser must not synchronously block the event loop. The app must utilize `device.createComputePipelineAsync`.
- **Pre-compilation Caching:** The PassManager should proactively construct adjacent runtime permutations in the background. If a runtime requires an `@id` tuple that hasn't finished asynchronous generation, the active pipeline must safely falter or fall back to a previously cached variant without crashing.
- **UI Decoupling:** Interactions triggering pipeline creations should update FSM cleanly and never throw synchronous dispatch errors if the compilation is pending.

## Implementation Plan

1. Refactor `PassManager.ts` `AccumulationPass.getPipeline` so that if a pipeline does not exist, it requests async compilation and returns `null` or a cached fallback until resolution.
2. The `ApeironViewport` event ingestion loop should handle `null` pipeline states gracefully, yielding the frame gracefully rather than exploding on a failed `setPipeline()`.
3. Introduce an initialization phase where standard UI combinations (e.g., Default Exponent + Coloring Modes subsets) are requested concurrently on engine boot.

## Verification Steps

- [ ] Write a test asserting that creating an unprecedented pipeline permutation returns immediately while successfully fetching moments later without dropping exceptions.
- [ ] Using DevTools Performance Profiling, capture the trace of transitioning `fractal_exponent` across decimals and verify the `RAF` (Request Animation Frame) is absolutely entirely devoid of >16ms stalls that sync `createComputePipeline` inherently forces.
- [ ] **Implementation standard:** Have all shared boundaries, extracted math helpers, or state-machine behaviors been strictly validated as headless deterministic units per `docs/process/best-practices.md`?
- [ ] **Documentation Sync:** Did this implementation drift from the original plan? If so, update `docs/[relevant-design].md` and `docs/product/requirements.md` before closing this task.
