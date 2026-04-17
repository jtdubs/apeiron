---
status: closed
---

# Task 002: Establish initEngine() headless WebGPU wrapper

## Objective

Implement the headless-capable WebGPU engine wrapper to allow rendering and data extraction strictly without a browser DOM.

## Relevant Design Docs

- [Rendering Engine Design](../../design/rendering-engine.md)
- [Test Plan & Debugging Methodology](../../process/test-plan.md)

## Requirements

- **Zero DOM Dependency:** The initialization function must not rely on `document.createElement('canvas')` during headless server execution.
- **Hardware Fault Gracefulness:** `initEngine` must cleanly detect missing WebGPU adapters and throw explicit errors to fail CI runs safely.
- **Array Extraction:** Expose an interface capable of computing a basic WGSL shader and mapping the resulting buffer to a Float32Array strictly in JS/TS.

## Implementation Plan

1. Create engine initialization stub in TypeScript handling `navigator.gpu.requestAdapter()`.
2. Implement branched logic: standard canvas usage vs generic headless context.
3. Write a rudimentary pass-through WGSL compute shader and memory-map the output.
4. Export the `initEngine()` wrapper to be consumed by orchestration tests.

## Verification Steps

- [ ] The engine initializes in a Node/Deno environment equipped with WebGPU backends (e.g., `dawn.node`).
- [ ] The engine correctly executes a basic math pass (e.g., inputting `[1.0, 2.0]` and verifying output).
- [ ] **Documentation Sync:** Did this implementation drift from the original plan? If so, update `docs/design/rendering-engine.md` before closing this task.
