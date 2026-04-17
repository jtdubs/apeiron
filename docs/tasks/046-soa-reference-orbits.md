---
status: open
---

# Task 046: AoS to SoA Reference Orbit Migration

## Objective

Refactor the `ReferenceOrbitNode` memory structure from an Array of Structures (AoS) to a Structure of Arrays (SoA) layout. This ensures optimal GPU L1 cache utilization during diverging path execution in the WebGPU shaders (specifically when skipping iterations via Series Approximation).

## Relevant Design Docs

- [Math Backend Design](../design/engine/core-math.md)
- [Data Boundaries & Memory Layout](../architecture/data-boundaries.md)

## Requirements

- **Schema Update:** Modify `schema/MemoryLayout.json` to define contiguous arrays for `X` coords, `Y` coords, and individual A/B/C derivative coefficient arrays, replacing the interleaved `ReferenceOrbitNode` struct.
- **Rust Math Core Adjustment:** Update the `wasm-bindgen` memory allocators and generation logic in `rust-math/` so that reference permutations are yielded as discrete `Float64Array` streams.
- **TypeScript Orchestrator Adaption:** Update `src/engine/generated/MemoryLayout.ts` integrations and buffer binding commands to map these individual contiguous arrays into separate GPU Storage Buffers.
- **Shader Variable Remapping:** Refactor the WGSL `math_accum.wgsl` to pull `Z_n` variables from the separated storage arrays rather than a singular interleaved struct, minimizing unused byte reads in the thread group.

## Implementation Plan

1. Update `MemoryLayout.json` and run `npm run build:schema` to auto-generate the TypeScript and Rust struct mappings.
2. Adjust `rust-math` loop implementations. Since rust's inner mathematics likely uses interleaved coordinates locally in registers, explicitly construct the SoA outputs upon final iteration yield.
3. Re-map TS WebWorker message passing to handle structural array separation.
4. Modify `math_accum.wgsl` `var<storage, read>` bindings to the newly defined SoA buffers.
5. Validate headless tests (determinism should remain identically matched).

## Verification Steps

- [ ] Write a script or observe `TimestampQuery` metrics evaluating frame-rendering speed of deep-zoom locations (heavy Series Approximation skipping) before and after deployment.
- [ ] Run headless test suite to ensure mathematical regression did not occur due to memory bounds or struct padding.
- [ ] **Implementation standard:** Have all shared boundaries, extracted math helpers, or state-machine behaviors been strictly validated as headless deterministic units per `docs/process/best-practices.md`?
- [ ] **Documentation Sync:** Did this implementation drift from the original plan? If so, update relevant design docs.
