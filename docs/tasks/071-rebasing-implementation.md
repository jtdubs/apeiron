---
status: open
---

# Task 071: Rebasing & Reference Chains Implementation

## Objective

Implement a proactive **Chained Rebasing** system and a **Reference Tree** manager to prevent proxy collapse glitches and eliminate f32p mantissa drop artifacts. This will extend the zoom depth of native f32 hardware significantly by ensuring delta offsets never breach exponential alignment bounds.

## Relevant Design Docs

- [Rebasing Strategies Whitepaper](../reference/rebasing_strategies_whitepaper.md)
- [Apeiron Best Practices](../process/best-practices.md)

## Requirements

### 1. Rebasing & Glitch Feedback (GPU)

- [ ] Implement the `check_rebase` condition in the WGSL kernel: `dot(P, P) < dot(dz, dz)`.
- [ ] Implement proxy collapse detection (bits-of-precision loss logic deferred from Task 070).
- [ ] Implement the `rebase_step` to transfer the delta: `dz_new = Z + dz`.
- [ ] Implement a readback storage buffer to signal glitch/rebase coordinates to the TypeScript orchestrator.

### 2. Reference Tree Orchestration (WASM Worker)

- [ ] Implement `ReferenceTree` in Rust to maintain a hierarchy of high-precision reference orbits.
- [ ] Implement **Chained Transformation** logic:
  - Update delta: $\delta_B = \delta_A + (Z_{A,n} - Z_{B,m})$.
  - Update parameter: $\Delta c_B = c - C_B$.
- [ ] Implement tree traversal to find the "best" anchor node during a rebase event.
- [ ] Coordinate iteration reset and BLA table swapping in the `PerturbationOrchestrator`.

### 3. BLA Integration

- [ ] Update BLA validity radius calculation to account for rebasing thresholds.
- [ ] Ensure seamless transition between BLA skips and rebase-monitored regular steps.

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

## Verification Steps

- [ ] Create a unit test `test_chained_transformation` in `rust-math/src/lib.rs` proving that delta transfers do not introduce precision loss artifacts.
- [ ] **Implementation standard:** Have all shared boundaries, extracted math helpers, or state-machine behaviors been strictly validated as headless deterministic units per `docs/process/best-practices.md`?
- [ ] **Documentation Sync:** Did this implementation drift from the original plan? If so, update `docs/reference/rebasing_strategies_whitepaper.md` before closing this task.
