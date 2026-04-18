---
status: closed
---

# Task 048: Decouple WASM to WebGPU Buffer Exchanges

## Objective

Refactor the brittle data pipeline returning from the Rust WebWorker to separate the monolithic float array into distinct, explicit data structures (ReferenceOrbitNode[], OrbitMetadata, BLANode[]) across the Rust, TypeScript, and WebGPU boundaries. Introduce strict headless tests to verify these exchanges.

## Relevant Design Docs

- [Data Boundaries & Memory Layout](../architecture/data-boundaries.md)
- [Apeiron Best Practices](../best-practices.md) (Standard boundary/testing rules apply)

## Requirements

- **Rust Export Modernization:** The WASM module (`compute_mandelbrot`) must produce a structured `#[wasm_bindgen]` struct exporting 3 distinct `js_sys::Float64Array` properties (`orbit_nodes`, `metadata`, `bla_grid`) instead of pushing linearly into a single vector. Padding the orbit array to identical lengths will remain, but the arrays will not be concatenated.
- **TypeScript Decoupling:** `rust.worker.ts` and `PerturbationOrchestrator.ts` must pass and store these arrays independently.
- **WebGPU Buffer Separation:** `PassManager.ts` must allocate three independent `GPUBuffer` targets for these buffers, rather than one massive blob.
- **WGSL Cleanup:** The shader (`math_accum.wgsl`) and layout generator (`compileLayoutSchema.js`) must be updated to assign distinct `@group(0) @binding(X)` endpoints for these stores, abolishing the error-prone stride math currently used in `layout_accessors.wgsl`.
- **Data Exchange Verification:** Introduce a headless test suite (`MathBufferExchange.spec.ts`) that programmatically validates that the array constraints matching the `schema/MemoryLayout.json` exactly align with the returned WASM buffers.

## Implementation Plan

1. **Verify Setup (Testing):** Create `src/engine/__tests__/MathBufferExchange.spec.ts` strictly ensuring the sizes, strides, and bounds of returned buffers match the expectations laid out in `MemoryLayout.json`.
2. **Rust Backend:** Modify `rust-math/src/lib.rs` to construct and return a `MathPayload` object.
3. **Web Worker:** Modify `rust.worker.ts` to consume the new `MathPayload`, `.free()` it securely, and post the separated byte arrays to the TypeScript engine.
4. **PassManager Updates:** Expand the `G-Buffer` configuration to bind three isolated buffers explicitly.
5. **WGSL Refactor:** Remove the indexing logic from `layout_accessors.wgsl`. Bind in `math_accum.wgsl` at bindings `3`, `8`, and `9` respectively, eliminating `ORBIT_STRIDE` array accumulation math.

## Verification Steps

- [x] Execute `npm run test` to verify the buffer definitions match deterministic sizes exactly.
- [x] Run the UI to verify `Perturbation` mode correctly deep-zooms without artifacting.
- [x] Ensure that WebGPU validation warnings over "binding size mismatch" are non-existent.
- [x] **Implementation standard:** Have all shared boundaries, extracted math helpers, or state-machine behaviors been strictly validated as headless deterministic units?
- [x] **Documentation Sync:** Did this implementation drift from the original plan? If so, update `docs/architecture/data-boundaries.md`.
