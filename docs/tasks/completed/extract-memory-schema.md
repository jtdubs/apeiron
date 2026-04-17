---
status: closed
---

# Task 56: Extract Memory Layout Schema

## Objective

Extract the cross-domain Memory Layout Schema from `scripts/compileLayoutSchema.js` into a standalone JSON file at `schema/MemoryLayout.json` to properly enforce a Single Source of Truth architecture.

## Relevant Design Docs

- [Apeiron Best Practices](../process/best-practices.md) (Standard boundary/testing rules apply)
- [Data Boundaries](../architecture/data-boundaries.md) (Strict cross-boundary structures)

## Requirements

- **Schema Decoupling:** The structural schema definitions mapping out `f32` offsets, `vec4<f32>` alignments, and WebGPU constants must exist in a pure data file (`schema/MemoryLayout.json`) outside of procedural generation scripts.
- **Code Generation Integrity:** The code generator (`scripts/compileLayoutSchema.js`) must seamlessly read from the new pure JSON file and successfully compile identical outputs for TypeScript (`MemoryLayout.ts`), WGSL (`layout.wgsl`), and Rust (`layout.rs`).

## Implementation Plan

1. Create a root-level `schema/` directory if it does not exist.
2. Abstract the `SCHEMA` variable contents from `scripts/compileLayoutSchema.js` and serialize them directly into `schema/MemoryLayout.json`.
3. Modify `scripts/compileLayoutSchema.js` to synchronously load and JSON-parse `schema/MemoryLayout.json`.
4. Validate the change by running the code generator and confirming standard outputs remain unchanged and tests/generation continue to function.

## Verification Steps

- [ ] Execute `node scripts/compileLayoutSchema.js` and verify it loads the JSON successfully.
- [ ] Ensure formatting bindings and Rust compilation do not fail down-stream after regeneration.
- [ ] **Implementation standard:** Have all shared boundaries, extracted math helpers, or state-machine behaviors been strictly validated as headless deterministic units per `docs/process/best-practices.md`?
- [ ] **Documentation Sync:** Did this implementation drift from the original plan? If so, update `docs/[relevant-design].md` and `docs/product/requirements.md` before closing this task.
