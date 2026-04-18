---
status: closed
---

# Task 072: Implement Bivariate Taylor Approximation (BTA)

## Objective

Implement 2nd-order Bivariate Taylor Approximation (BTA) to accelerate fractal perturbation by skipping iterations using a precomputed coefficient table.

## Relevant Design Docs

- [BTA Whitepaper](../reference/bta_whitepaper.md)
- [Apeiron Best Practices](../process/best-practices.md)

## Requirements

- **BTA Coeff Gen:** `rust-math` must compute up to quadratic coefficients.
- **BTA Doubling:** `rust-math` must be able to recursively double quadratic coefficients to build exponential skip lists.
- **Shader BTA Logic:** Implement `evaluate_bta2` and bounding box condition checks internally to drop from BTA cleanly.

## Implementation Plan

```rust
struct Bta2nd {
    a: vec2f, // Linear dz0
    b: vec2f, // Linear dc
    c: vec2f, // Quadratic dz0^2
    d: vec2f, // Mixed dz0 * dc
    e: vec2f  // Quadratic dc^2
}

// Included for future-proofing or high-occupancy desktop-only paths
struct Bta3rd {
    linear: array<vec2f, 2>, // a, b
    quad:   array<vec2f, 3>, // c, d, e
    cubic:  array<vec2f, 4>  // f, g, h, i
}
```

### 2. Evaluation Logic (WGSL)

Evaluating the approximation is the performance-critical path.

```rust
fn evaluate_bta2(coeff: Bta2nd, dz0: vec2f, dc: vec2f) -> vec2f {
    // 1. Precalculate powers (3 complex muls)
    let dz02 = cmul(dz0, dz0);
    let dz0dc = cmul(dz0, dc);
    let dc2 = cmul(dc, dc);

    // 2. Linear combination (5 complex muls + 4 complex adds)
    return cmul(coeff.a, dz0) +
           cmul(coeff.b, dc) +
           cmul(coeff.c, dz02) +
           cmul(coeff.d, dz0dc) +
           cmul(coeff.e, dc2);
}
```

### Implementation Strategy

1.  **Host-Side (Rust):**
    - [ ] Implement the BTA recurrence rules in `rust-math`.
    - [ ] Implement the BTA doubling (composition) rules for table generation.
    - [ ] Add unit tests for BTA coefficient generation and combination.
2.  **Orchestration (TypeScript):**
    - [ ] Update `PerturbationOrchestrator` to generate BTA tables (typically 32 levels, skipping up to $2^{32}$ iterations).
    - [ ] Manage SSBO lifecycle for BTA coefficient tables (ensure alignment for `Bta2nd` structs).
3.  **Shader (WGSL):**
    - [ ] Update `perturbation.wgsl` to include `Bta2nd` struct and `evaluate_bta2` function.
    - [ ] Implement the skip logic using the BTA table.
    - [ ] Implement health-check / glitch detection using the relative magnitude of $(C, D, E)$ terms to terminate skips.

## Verification Steps

- [ ] Write a headless Deno test that feeds identical perturbation initial conditions to both a standard iteration engine and the BTA engine, verifying identical delta-Z output after 2048 skips.
- [ ] **Implementation standard:** Have all shared boundaries, extracted math helpers, or state-machine behaviors been strictly validated as headless deterministic units per `docs/process/best-practices.md`?
- [ ] **Documentation Sync:** Did this implementation drift from the original plan? If so, update `docs/reference/bta_whitepaper.md` before closing this task.
