---
status: closed
---

# Task [01]: Frontend & Web Worker Testing Support

## Objective

Implement a robust testing strategy for the frontend UI state machine and its asynchronous interactions with the Rust Web Worker, resolving the gap in testing coverage for the "Latest-Only Dispatch Buffer" and "Render Quality State Machine".

## Relevant Design Docs

- [Frontend Design](../frontend-design.md)
- [Progressive Rendering Design](../progressive-rendering-design.md)
- [Test Plan](../test-plan.md)

## Requirements

- **Web Worker Context Isolation:** The testing framework must be able to natively intercept and execute `new Worker()` constructors in Node without requiring browser instantiation.
- **State Machine Emulation:** The orchestrator must be verifiable in isolation using mock states for `STATIC`, `INTERACT_SAFE`, and `INTERACT_FAST`.
- **"Latest-Only" Guarantee Verification:** Rapid-fire queue tests must assert that intermediary states are safely dropped when the mocked Rust Web Worker returns from a `BUSY` execution lock.
- **Zero DOM Rendering Overhead:** Tests must execute headlessly and efficiently without mounting a WebGL or WebGPU canvas.

## Implementation Plan

1. Install `@vitest/web-worker` to simulate web worker functionality in the Node-based testing environment.
2. Initialize testing configuration to include setup files that apply the worker interception global.
3. Build `tests/__mocks__/mock-rust-worker.ts` to implement a programmable fake worker that enables explicit control over "resolving" async tasks to test queue handling.
4. Create test files (`src/engine/__tests__/orchestration.spec.ts`) utilizing `vi.useFakeTimers()` to step through specific delay loops (like the `150ms` idle boundary for `STATIC` accumulations).
5. Assert on standard `useViewportStore` actions directly out of the context.

## Verification Steps

- [ ] Write integration test validating `INTERACT_FAST` is properly transitioned into `STATIC` after `150ms` timeout using fake timers.
- [ ] Write `Latest-Only Buffer` test, where 10 parameter update requests are dispatched but only the 10th request is passed along after the mocked worker resolves the 1st request.
- [ ] Incorporate this execution natively into `npm run test` ensuring both math arrays and state machine architectures pass smoothly.
- [ ] **Documentation Sync:** Did this implementation drift from the original plan? If so, update `docs/progressive-rendering-design.md` and `docs/test-plan.md` before closing this task.
