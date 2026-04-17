---
status: closed (rejected)
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

## Conclusion: REJECTED

After critical analysis of the GPU memory access patterns within `math_accum.wgsl`, this proposal is definitively rejected for the following architectural reasons:

1. **Warp-Coherent Access Patterns:** A reference orbit is globally shared across the entire fractal domain. Local thread groups (warps) evaluate standard iterations synchronously (`iter += 1.0`). Any divergence typically occurs only when stepping through `advance_via_bla`, but even then, neighboring pixels usually take the exact same BLA steps due to identical perturbation depths, maintaining thread coherence.
2. **GPU Cache Broadcasting:** Because all threads within a SIMT workgroup read `ref_orbits[iter]`, they request the exact same memory address. The GPU's L1 cache treats this as a uniform broadcast, pulling a single cache line (usually 64 or 128 bytes) and serving all threads simultaneously.
3. **AoS Fits Ideal Cache Boundaries:** `ReferenceOrbitNode` is an interleaved struct of 8 `f32` fields (64 bytes total). This maps perfectly to exactly one cache line fetch. When `init_perturbation_state` reads all 8 coefficients, or BLA reads 6, they pull all data seamlessly in one cache-line transaction without penalty.
4. **SoA Degrades Bandwidth & Register Pressure:** If migrated to an SoA layout, a single thread accessing `x, y` would require memory requests across two completely disparate buffer locations. This forces the memory controller to allocate 2 cache lines rather than 1. When an 8-variable read occurs (in SA initialization), SoA would hit up to 8 independent cache lines simultaneously, polluting the cache entirely, throttling bus bandwidth, and risking exhaustion of the `maxStorageBuffersPerShaderStage` limit.

**Decision:** The AoS design for `ReferenceOrbitNode` demonstrates ideal cache utilization for identical-offset broadcast memory loads. Maintaining the current structure prevents catastrophic L1 cache-thrashing that would arise from separated buffer reads in uniformly-iterating SIMT domains.
