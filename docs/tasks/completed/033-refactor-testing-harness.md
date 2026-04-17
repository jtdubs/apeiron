---
status: closed
---

# Task 033: Refactor Headless Testing Harness

## Objective

Decouple the WebGPU testing harness from the production `initEngine` code and modularize the monolithic `run-headless.ts` script into discrete `Deno.test` runner blocks for better maintainability and error reporting.

## Relevant Design Docs

- `docs/process/test-plan.md`

## Requirements

- **Production Clean-up:** The `initEngine.ts` file must only expose what is necessary for production (`device`, `adapter`, `context`, `renderFrame`, `resize`). It must not contain test-specific code like buffer reading methods (`executeTestCompute`, etc).
- **WebGPUTestHarness:** A dedicated `WebGPUTestHarness` module under `tests/` should be created to house all the logic for manipulating the `PassManager` for headless assertions.
- **Deno Test Migration:** `tests/run-headless.ts` must be migrated to `tests/engine.test.ts` utilizing `Deno.test` blocks to provide scope isolation between test phases (e.g. Math Bounds, Temporal Accumulation).

## Implementation Plan

1. Create `tests/WebGPUTestHarness.ts` exporting a unified testing utility class.
2. Port `executeTestCompute`, `executeTestRender`, `executeTestRenderSequence`, and `executeTestAccumulation` from `src/engine/initEngine.ts` to `WebGPUTestHarness`.
3. Refactor `src/engine/initEngine.ts` to strip out those methods, simplifying `ApeironEngine` and `initEngine()`.
4. Rename `tests/run-headless.ts` to `tests/engine.test.ts` and wrap sequential operations in `Deno.test()` blocks.
5. Update `package.json` to change the `"test:engine"` script to use `deno test` instead of `deno run` on the new file name.

## Verification Steps

- [ ] Run `npm run test:engine` and verify Deno's test runner outputs passing checks for all headless cases.
- [ ] Verify `npm run dev` and standard compilation (`npm run build`) still function without `initEngine`'s test methods.
- [ ] **Documentation Sync:** Ensure `package.json` updates and script usages match the `docs/process/test-plan.md` instructions.
