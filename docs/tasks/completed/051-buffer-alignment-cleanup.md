---
status: closed
---

# Task 051: Buffer Alignment Cleanup and Abstraction

## Objective

Formalize and align the multi-boundary (Rust WASM -> TypeScript -> WebGPU) data transfer of Reference Orbits. Create a single source of truth for buffer layout offsets and sizes to eliminate hardcoded "magic numbers" (like 8, 136, 128) and prevent silent data alignment drift between the math generation and shader decoding phases.

## Relevant Design Docs

- [Math Backend Design](../../design/engine/core-math.md)
- [Rendering Engine Design](../../design/engine/webgpu-passes.md)

## Requirements

- **Centralized Layout Definition:** A single schema file (e.g., `src/engine/MemoryLayout.ts` or `layout.json`) must define the structural sizes of the Reference Orbit buffer (e.g., `ORBIT_STRIDE=8`, `META_STRIDE=8`, `BLA_LEVELS=16`, `BLA_NODE_STRIDE=8`).
- **Rust Integration:** The WASM backend (`rust-math/src/lib.rs`) must dynamically link to these constants during its build process (via `build.rs` pulling from the schema or a shared auto-generated Rust module) instead of hardcoding the offsets and capacities in the loop logic.
- **WGSL Injection:** WebGPU shaders (e.g., `math_accum.wgsl`) must not contain hardcoded magical indices like `[ref_offset + u32(iter)*8u + 3u]`. Instead, the TS engine should prepend an automatically generated `const` metadata injection block to the WGSL string before passing it into `device.createShaderModule()`.
- **TypeScript Encapsulation:** TS logic computing iteration counts (e.g., `(length - 8) / 136` in `PassManager.ts` and `uniforms.ts`) must be refactored to use the imported layout constants.

## Implementation Plan

1. **Create the Central Schema File:**  
   Create `src/engine/MemoryLayout.ts` exporting constants for layout offsets:  
   `ORBIT_STRIDE` (x, y, ar, ai, br, bi, cr, ci) = 8.  
   `META_STRIDE` (cycle_found, der_r, der_i, escaped_iter, abs_zr, abs_zi, abs_cr, abs_ci) = 8.  
   `BLA_LEVELS` = 16.  
   `BLA_NODE_STRIDE` (ar, ai, br, bi, err, len, pad1, pad2) = 8.  
   `FLOATS_PER_ITER` = `ORBIT_STRIDE + (BLA_LEVELS * BLA_NODE_STRIDE)`.
2. **Setup Rust Build-Time Script:**  
   In `rust-math/`, configure a `build.rs` step or a simple node script that reads `MemoryLayout.ts` and generates a `layout.rs` file containing equivalent Rust `const` bindings, ensuring the WebAssembly always packs memory using identical bounds. Update `rust-math/src/lib.rs` loops and capacity calculations to strictly use these variables.
3. **Refactor WGSL Shaders with Typed Getters:**  
   In `src/engine/initEngine.ts` or where the shader text is loaded, architect a dynamic string prepend step. Emit constants matching the TS schema (e.g. `const ORBIT_STRIDE: u32 = 8u;`). Additionally, to eliminate inner-stride magic offsets like `[base_index + 4u]`, we will generate strongly-typed WGSL `struct` definitions alongside their extractor functions (e.g., `fn get_orbit_node(base_index: u32) -> ReferenceOrbitNode`). This entirely abstracts mapping linear memory positions into named properties (`ar`, `err`, `escaped_iter`), guaranteeing safety inside the hot loops. Refactor `math_accum.wgsl` calculation logic to exclusively use these new getter methods.
4. **Refactor TypeScript Orbit Math:**  
   Replace `(refOrbitsLength - 8) / 136` and similar inline calculations in `PassManager.ts` and `uniforms.ts` with explicit logic driven by variables exported from `MemoryLayout.ts`.

## Verification Steps

- [x] Execute `npm run test:engine` (the headless Deno test harness) to verify that raw output data buffers identically match pre-existing baselines after the layout extraction.
- [x] Inspect the WASM and WGSL compiled execution logic locally iteratively during interactive rendering to ensure FPS hasn't suffered due to dynamic offsets in WGSL (the compiler should inline them completely as `const`).
- [x] **Documentation Sync:** Did this implementation drift from the original plan? If so, update `docs/design/engine/core-math.md` and `docs/product/requirements.md` before closing this task.
