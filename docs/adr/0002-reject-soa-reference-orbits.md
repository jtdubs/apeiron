# 2. Reject Migration to Structure of Arrays (SoA) for Reference Orbits

Date: 2026-04-17

## Status

Accepted (Rejection of Migration Proposal)

## Context

Task 046 proposed refactoring the `ReferenceOrbitNode` memory layout from an Array of Structures (AoS) to a Structure of Arrays (SoA). The hypothesis was that SoA would improve GPU L1 cache utilization during diverging paths in the WebGPU shaders, specifically when the fractal math skips iterations via Series Approximation.

Currently, `ReferenceOrbitNode` is defined as an 8-component structure (`x, y, ar, ai, br, bi, cr, ci`). It is accessed via `get_orbit_node(...)` which returns the fully interpolated 64-byte struct. Because the mathematical bounds evaluate against a globally tracked, static reference orbit, threadgroups across the `math_accum.wgsl` execution pipeline largely move through the same `iter` values synchronously.

## Decision

We reject the proposal to migrate from AoS to SoA for reference trajectories.

Our critical analysis of WebGPU semantics and the SIMT (Single Instruction, Multiple Threads) caching model dictated that:

1. **Warp-Coherence overrides Divergence Modeling:** Threads within a WebGPU workgroup iterate uniformly through temporal loops. Even when Bilinear Approximation triggers diverging paths, locally grouped invocations mostly share the same step count. Because they evaluate identical `iter` numbers on the reference trajectory, memory accesses to `ref_orbits[iter]` exhibit perfectly uniform broadcast characteristics.
2. **Bandwidth Degradation under SoA:** When uniform threads read the exact same uniform index sequentially, SoA actually _doubles_ hardware cache line fetch volume. Fetching a contiguous struct of `x, y` inside an AoS naturally loads the local cache line inside an L1 cache chunk. Conversely, retrieving `x` and `y` from independent arrays forces the memory controller to allocate multiple cache lanes. A Series Approximation initialization needing 8 coefficients would incur 8 L1 cache-line collisions instead of 1.
3. **Register Spillage Limitations:** We already rely upon a dense array of bound storage buffers for the state-machine interaction (`data_in`, `checkpoint`, `completion_flag`, `readTex`, `g_buffer_out`). Further dividing mathematical inputs into isolated contiguous buffers for each structure element approaches WebGPU's `maxStorageBuffersPerShaderStage` limits without providing substantive offset mitigation logic.

## Consequences

- The existing `ReferenceOrbitNode` AoS structure is preserved globally within `MemoryLayout.json`.
- Task `046-soa-reference-orbits` is considered complete, formally closed, and logged.
- Any future optimizations regarding pipeline iteration skip logic will default to preserving dense cache locality models rather than splitting fields via SoA.
