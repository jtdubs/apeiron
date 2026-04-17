---
status: closed
---

# Task 014: Web Worker Orchestration for WASM

## Objective

Offload the heavy arbitrary-precision Rust/WASM calculations (like Reference Orbit tracking) into a dedicated Web Worker to prevent JavaScript Garbage Collection stutters and maintain a 60fps UI, while adding strict test isolation.

## Relevant Design Docs

- `docs/design/engine/core-math.md`
- `docs/process/test-plan.md` (or general test requirements from `docs/product/requirements.md`)

## Requirements

- **Main Thread Offloading:** The WASM module MUST run inside a Web Worker. The main JS thread only orchestrates and sends messages (e.g., coordinate updates).
- **Buffer Transfer:** The worker must export calculations as raw `Float64Array` reference orbits, which are passed to the WebGPU pipeline.
- **Memory Management:** Ensure the JS orchestrator calls `.free()` on the `wasm-bindgen` memory object immediately after transferring orbit arrays to WebGPU VRAM.
- **Robust Testing Boundaries:** Implementing this orchestration provides a perfect seam for testing. We must ensure rigorous buffer-parity tests exist to validate worker inputs and outputs.

## Implementation Plan

1. Create a `rust.worker.ts` script to initialize and wrap the WASM module.
2. Implement a message passing interface between the React UI/Engine Orchestrator and the worker.
3. Hook up the worker to generate reference orbits.
4. Expand the headless regression test runner (`npm run test:engine`) to cover worker message payloads. Ensure tests inject mock calculations to verify worker serialization/deserialization limits.

## Verification Steps

- [ ] Is the WASM instantiation fully removed from the main thread?
- [ ] Do massive deep zooms skip JS garbage collection frame drops during orbit generation?
- [ ] **Testing:** Do new headless test cases generate identical buffer outputs when invoked through the Worker abstraction vs directly?
- [ ] **Memory:** Use browser devtools to verify no heap leaks occur over repeated zoom triggers.
