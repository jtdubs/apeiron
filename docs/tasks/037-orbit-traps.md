---
status: open
---

# Task 037: Orbit Traps Geometry Core (Headless)

## Objective

Extend the existing mathematical WebGPU fragment logic inside the G-Buffer processing passes to strictly track mathematical coordinates mapping points, geometric distances, and cross limits writing to secondary target mapping bindings directly inside headless parameters.

## Relevant Design Docs

- [docs/design/rendering-engine.md](../design/rendering-engine.md)

## Requirements

- **WGSL Distance Primitives:** Update the shader logic natively processing mathematical ranges checking proximity constraints per-iterate loops.
- **Secondary Render Texture Sets:** Expose G-Buffer bindings isolating density map geometries outside default interior or escape-time maps resolving entirely separate logic bindings.
- **Uniform Mappings:** Map uniform parameters strictly controlling distance geometries (e.g. geometric constants limits, thickness matrices).

## Implementation Plan

1. Expand `engine.ts` headless pass configuration parameters exposing orbit mappings via structural uniform variables resolving.
2. Adjust WGSL `mandelbrot_f32` shader adding distance vectors mapping `pow(x, 2) + pow(y, 2)` limiting primitives continuously tracking shortest absolute vectors.
3. Bind the distance results arrays directly into `test/` regression mapping algorithms.

## Verification Steps

- [ ] Execute `tests/engine.deno.ts` against newly constructed geometric traps confirming numerical accuracy.
- [ ] **Documentation Sync:** Did this implementation drift from the original plan? If so, update relevant design docs.
