---
status: open
---

# Task 079: Multi-Reference Neighborhood Rendering

## Objective

Transition the rendering engine from a Single-Reference shift model to a true Multi-Reference Frame architecture. Inspired by offline native renderers (like Kalles Fraktaler 2+), the system will intelligently cluster discarded glitched pixels, compute precise neighborhood "Centers", and bundle multiple reference orbits into a cohesive WebGPU buffer for parallel spatial rebasing.

## Current Limitations & Rationale

Currently, Phase 1 "Chained Rebasing" works by moving the global viewport anchor to the coordinate of a detected glitch. While effective for highly dense, localized zooms, this model triggers critical failures on **spatially wide chaotic boundaries**:

1. **The Tug-of-War Effect:** If the screen perfectly bisects two distinct mathematical features (e.g., one side falls deeply into the Minibrot, the other diverges into the exterior), no single reference can cover the entire screen. The GPU glitches on the right side, the TS orchestrator shifts right. Next frame, the left side glitches, the orchestrator shifts left. The UI engine becomes trapped in an infinite "tug-of-war" rebase loop without ever completing the frame.
2. **Costly Interruption:** Re-referencing globally forces a `-6.0` proxy collapse yield, drops all completed rendering progress across the entire grid, and forces a full pipeline stall.

**The Solution:** Instead of discarding the frame, the WebGPU pipeline will mark successful pixels as complete and group failed pixels. The orchestration layer delegates these glitch coordinates to Rust to compute multiple "Neighborhood Centers" simultaneously. During a subsequent dispatch, the WebGPU shader dynamically queries a `ReferenceTreeArray` buffer to evaluate the unresolved pixels against their closest newly attached neighborhood bounds.

## Relevant Design Docs

- [Perturbation Theory Whitepaper](../reference/perturbation_theory_whitepaper.md)
- [Rebasing Strategies Whitepaper](../reference/rebasing_strategies_whitepaper.md)
- [Apeiron Best Practices](../best-practices.md)
- [Multi-Reference External Analysis](../../external/mathematical_improvements.md)

## Requirements

### 1. Multi-Stage Glitch Resolution Pipeline

- **Pass 1 (Detection):** GPU executes perturbation. Threads detecting proxy collapses calculate a bailout heuristic (e.g. `|Z + z|^2 < |z|^2`). They write their failure state to a full-screen **GPU-bound Mask Buffer**, atomically flag the regional **Macro-Tile Buffer**, and `break` natively without corrupting finished pixels.
- **Pass 2 (Extraction & Generation):** The Typescript orchestrator pulls _only_ the microscopic Macro-Tile buffer across the worker boundary. The Rust math engine analyzes the tiles, identifies distinct cluster zones dynamically, computes new `BigDecimal` reference orbits for each cluster centroid, and packs them into a `ReferenceTreeArray`.
- **Pass 3 (Resolution):** The GPU is dispatched again across the full screen. Each thread checks the Mask Buffer natively; successful pixels immediately exit. Glitched threads evaluate the `ReferenceTreeArray`, select their closest neighborhood bounds, execute Vector Offset Translation (`Z = offset + z`), and resume iterating until finished.

### 2. "Center of Glitch" Cluster Algorithm

- Passing 8 million pixel coordinates mathematically to Rust is computationally unviable.
- The GPU will physically divide the screen into an optimized grid (e.g., 64x64 pixel "Macro-Tiles").
- A glitching GPU thread atomically increments the glitch state of its containing Macro-Tile.
- Rust receives this tiny array and dynamically treats flagged tiles as distinct glitch clusters, utilizing the geographic center of the active tile as the anchor for the new `BigDecimal` mathematical string.

### 3. Buffer Formats and Data Structures

- **Mask Buffer:** A full-resolution `array<u32>` existing _only in GPU VRAM_ mapping standard completion vs GLITCH states per pixel.
- **Macro-Tile Buffer:** A highly compressed `array<u32>` downloaded by Typescript holding cluster approximations.
- **WGSL Memory Schema:** The `core_compute.wgsl` shader must accept sequential multi-reference structures via SSBO.

```wgsl
struct ReferenceNode {
    origin_x: vec2<f32>,      // f32p Double-Single offset precision
    origin_y: vec2<f32>,      // f32p Double-Single offset precision
    bounding_radius: f32,     // valid spatial domain for use
    buffer_offset: u32,       // Index pointing to start of orbit in standard orbit buffer
    length: u32               // Limit of available sequential reference calculations
}

struct ReferenceTreeArray {
    count: u32,
    nodes: array<ReferenceNode, 32> // Arbitrary max reference threshold
}
```

- **Orbit Payload:** The primary Orbit/Delta buffer mapped to the GPU converts from a single strict array into one massively concatenated flat array, dynamically sliced via `buffer_offset` pointers.

## Implementation Plan

1. **WebGPU Mask & Macro-Tile Initialization:** Expand `PassManager.ts` to allocate a persistent global Mask Buffer (`w * h * 4` bytes) tracking glitch states dynamically, alongside the Read-only `MacroTile` storage buffer mapped tightly via byte-offset to Rust FFI endpoints.
2. **Rust Glitch Clustering (`rust-math/src/glitch.rs`):** Implement the Spatial Grid cluster loop. It must loop over the Macro-Tiles and generate an aggregated vector of distinct `(BigFloat, BigFloat)` coordinate centers.
3. **Rust Buffer Packing (`rust-math/src/reference_tree.rs`):** Modify the FFI layer to serialize multiple references into the `ReferenceNode` struct memory format alongside a concatenated `Float64Array`.
4. **WGSL Modification (`core_compute.wgsl`):**
   - Parse `ReferenceTreeArray`.
   - Before evaluating a step, allow masked pixels to loop over `nodes`, determining `distance(current_c,  node.origin_c) < node.bounding_radius`.
   - Apply Offset Translation to adapt mathematical parameters to the newly discovered branch.

## Verification Steps

- [ ] Execute `npm run test:engine` and extend `engine.deno.ts` to use a dense, chaotic boundary array natively constructed to provoke a "Tug-of-War" iteration.
- [ ] Assert that standard proxy collapses isolate properly into cluster bins inside the Headless Deno scripts.
- [ ] Ensure that WebGPU memory binding correctly parses and maps multiple `ReferenceNodes` within identical byte-offset validations against the dynamically generated `MemoryLayout.json`.
- [ ] **Implementation standard:** Have all shared boundaries, extracted math helpers, or state-machine behaviors been strictly validated as headless deterministic units per `docs/best-practices.md`?
