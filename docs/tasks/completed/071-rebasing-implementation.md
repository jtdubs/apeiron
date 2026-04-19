---
status: closed
---

# Task 071: Rebasing & Reference Chains Implementation

## Objective

Implement a proactive **Chained Rebasing** system and a **Reference Tree** manager to prevent proxy collapse glitches and eliminate f32p mantissa drop artifacts. This will extend the zoom depth of native f32 hardware significantly by ensuring delta offsets never breach exponential alignment bounds.

## Relevant Design Docs

- [Rebasing Strategies Whitepaper](../reference/rebasing_strategies_whitepaper.md)
- [Apeiron Best Practices](../process/best-practices.md)

## Requirements

### 1. Rebasing & Glitch Feedback (GPU)

- [x] Implement the `check_rebase` condition in the WGSL kernel: `dot(P, P) < dot(dz, dz)`.
- [x] Implement proxy collapse detection (bits-of-precision loss logic deferred from Task 070).
- [x] Implement the `rebase_step` to transfer the delta: `dz_new = Z + dz` (or secondary rebase dispatch).
- [x] Implement a readback storage buffer to signal glitch/rebase coordinates to the TypeScript orchestrator.

### 2. Reference Tree Orchestration (WASM Worker)

- [x] Implement `ReferenceTree` in Rust to maintain a hierarchy of high-precision reference orbits.
- [x] Implement **Chained Transformation** logic:
  - Update delta: $\delta_B = \delta_A + (Z_{A,n} - Z_{B,m})$.
  - Update parameter: $\Delta c_B = c - C_B$.
- [x] Implement tree traversal to find the "best" anchor node during a rebase event.
- [x] Coordinate iteration reset and BLA table swapping in the `PerturbationOrchestrator`.

### 3. BLA Integration

- [x] Update BLA validity radius calculation to account for rebasing thresholds.
- [x] Ensure seamless transition between BLA skips and rebase-monitored regular steps.

## Implementation Plan

### Reference Tree & Chained Transformation (Rust)

```rust
struct ReferenceTree {
    root: ReferenceNode,
}

struct ReferenceNode {
    id: ReferenceId,
    center: BigComplex,
    orbit: OrbitData,
    children: Vec<ReferenceNode>,
}

impl ReferenceTree {
    pub fn transform_delta(
        &self,
        from: &ReferenceNode,
        to: &ReferenceNode,
        delta: Complex64,
        iter_from: usize,
        iter_to: usize,
    ) -> Complex64 {
        // Shift formula: delta_B = delta_A + (Z_A,n - Z_B,m)
        let z_a = from.orbit.get_f64(iter_from);
        let z_b = to.orbit.get_f64(iter_to);
        delta + (z_a - z_b)
    }

    pub fn update_dc(&self, pixel_c: &BigComplex, to: &ReferenceNode) -> Complex64 {
        // delta_c = pixel_c - C_B
        (pixel_c.clone() - to.center.clone()).to_f64()
    }
}
```

## Open Questions & Clarifications

### 1. GPU Glitch Feedback & State Machine Boundary

- **Question:** How exactly should the WebGPU readback buffer be structured? Do we need the coordinate of the first pixel that glitched, or an array of all glitched pixels?
- **Recommendation:** Because of the multi-reference mandate, capturing only the first glitch will cause extreme latency bottlenecks (spinning dozens of TS->Rust->GPU roundtrips for a single frame). We should implement a **Bounded Append Buffer**. The readback `StorageBuffer` should start with an `AtomicU32` counter, followed by a fixed-size array of coordinate structs (e.g., max 64 glitches per pass). When a pixel glitches, it atomically increments the counter. If the index is within bounds, it writes its coordinate. The TS Orchestrator can then dispatch a batch of rebase coordinates to Rust to build out multiple tree nodes in parallel.

### 2. Multi-Reference Rendering Strategy (GPU)

- **Question:** When a new reference anchor is selected, do we partition the screen computation, or dynamically upload multiple reference orbits to the GPU?
- **Recommendation:** You are correct. Researching Claude Heiland-Allen's formalizations confirms that a single global reference is insufficient for deep regions where neighboring pixels diverge significantly. We need a true **multi-reference system**. The orchestrator will maintain a tree of `ReferenceNode`s, which will be flattened into a WebGPU `StorageBuffer` array. When a pixel hits the glitch threshold, the WGSL shader (or a secondary compute pass) will traverse this array to select the "best" new reference node that minimizes its relative error and rebase onto it.

### 3. Proxy Collapse Detection Logic (WGSL)

- **Question:** Is the proxy collapse heuristic purely Zhuoran's theoretical check `dot(Z_m + dz, Z_m + dz) < dot(dz, dz)`, or do we need specific IEEE-754 mantissa exhaustion checks?
- **Recommendation:** Implement both. Use Zhuoran's mathematical trigger as the primary defense against divergence, but include the hardware mantissa exhaustion check `abs(Z_m) + abs(dz) == abs(Z_m)` as an absolute fallback to catch pure IEEE-754 precision floor failures.

### 4. Reference Tree Orchestration (Rust -> TS)

- **Question:** Should the TypeScript Orchestrator send pure intent (e.g. `(x, y)` glitch queries) mapping to abstract `id`s, or manage the actual reference tree directly?
- **Recommendation:** TypeScript should remain completely stateless regarding the dense orbit data. TS should only track abstract node IDs and their bounds. The `ReferenceTree` state and hierarchy should live indefinitely inside Rust's WASM linear memory, and Rust should only yield the final transformed delta payloads back to TS.

### 5. Verification & TDD (Headless Execution)

- **Question:** For the `test_chained_transformation`, should we embed this perfectly into `rust-math/src/lib.rs` or create a new dedicated suite?
- **Recommendation:** Create a dedicated integration suite specifically for tree operations (e.g. `rust-math/tests/reference_tree_test.rs`). It should mock arbitrary precisions (`BigComplex` seeds) and explicitly verify that `delta_A` can transition to `delta_B` without losing its lowest significant bits.

## Verification Steps

- [x] Create a unit test `test_chained_transformation` in `rust-math/tests/reference_tree_test.rs` proving that delta transfers do not introduce precision loss artifacts.
- [x] **Implementation standard:** Have all shared boundaries, extracted math helpers, or state-machine behaviors been strictly validated as headless deterministic units per `docs/process/best-practices.md`?
- [x] **Documentation Sync:** Did this implementation drift from the original plan? If so, update `docs/reference/rebasing_strategies_whitepaper.md` before closing this task.
