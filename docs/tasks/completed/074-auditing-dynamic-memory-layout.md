---
title: Memory Layout Audit and Code Standardization
status: closed
created: 2026-04-18
labels: [core, bug, math]
---

# Definition

Our buffer specifications are managed centrally inside `schema/MemoryLayout.json`. The JavaScript build pipeline parses this file and generates statically-typed structures and WGSL layout variables to guarantee cross-pipeline consistency. The purpose of this task is to enforce rigorous alignment between TypeScript engine orchestration elements and these generated constants.

# Objectives

1. Extend `scripts/compileLayoutSchema.js` to automatically calculate sequential byte offsets and array indexing structures.
2. Produce `xyz_OFFSET` and `xyz_BYTE_OFFSET` for all `MemoryLayout` fields.
3. Review and replace random static number inferences injected inside `PassManager` with dynamic length variables and struct bindings computed by `scripts/compileLayoutSchema.js`.
4. Run integration tests (Deno harness + NPM build pipelines) to verify 100% stable execution environments.

# Analysis

In a previous debugging lifecycle, a `writeBuffer` injection targeted a magic byte offset number (`124`) that erroneously overwrote an invisible padding dimension instead of its appropriate target parameter. During initialization, the uniform parameters correctly utilized an overarching structure replacement. However, hot-swapping specific configuration dimensions like `palette_max_iter` consistently failed. The cause was that the WGSL schema sizes mapped out structurally on disk, while manual memory manipulation targets used floating point math mappings in JS dynamically injected independently.

By pushing strict adherence to `GeneratedMemoryLayout`, we effectively ban specific math or integer hardcoding during memory manipulation and limit those tasks exclusively back into the generated script domain.

# Implementation Plan

1. Modify `scripts/compileLayoutSchema.js`. Add field-specific loops evaluating memory lengths block-by-block and translating them into dynamic exported variables `<Object>_OFFSET_<Field>` and `<Object>_BYTE_OFFSET_<Field>`.
2. Re-compile schematics using `npm run build:schema`.
3. Locate explicit numeric allocation fields in `PassManager.ts` such as `size: 32` | `size: 64`. Swap them to `ReferenceOrbitNode_SIZE * 4` and equivalents.
4. Correct `writeBuffer` logic targeting uniform injections. Repoint index array assignments via exact `ResolveUniforms_BYTE_OFFSET_<Field>` targeting.
5. Deploy engine tests confirming parity.
