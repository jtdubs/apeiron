---
status: closed
---

# Task 065: Implement Double-Single BLA Acceleration for f64p Mode

## Objective

Safely re-enable Bilinear Approximation (BLA) skipping for the Double-Single (f64p) deep-zoom perturbation backend. This requires upgrading the BLA coefficient generation in the Rust WASM core and the corresponding WGSL shader logic to execute multi-iteration block advances without catastrophically truncating the 45-bit `dz` phase trajectory down to `f32` precision.

## Relevant Design Docs

- [Math Backend Design](../architecture/math-backend-design.md)
- [Bilinear Approximation Whitepaper](../reference/bilinear_approximation_whitepaper.md)
- [BLA Research Notes](../reference/BLA_RESEARCH.md)
- [Apeiron Best Practices](../process/best-practices.md)

## Requirements

- **DSBLANode Schema:** The Rust `BLANode` memory layout must be upgraded or duplicated (e.g., `DSBLANode`) to carry Double-Single precision coefficients. Currently, the tree is composed of standard 32-bit floats.
- **WASM Tree Compiler Upgrade:** The Rust core (`compute_mandelbrot`) must compute the Bilinear polynomial block cascades (`A`, `B`) using arbitrary precision (`BigDecimal`), and serialize them perfectly bounded into the DSFloat struct layout, instead of relying on standard `f64 -> f32` array truncation.
- **advance_via_bla_ds() WGSL Algorithm:** The shader needs a specialized BLA evaluation loop (`advance_via_bla_ds`) that operates natively on `DSComplex`. This function must receive `dz_ds` and apply the polynomial transformation `dz_new = A*dz + B*dz^2...` utilizing purely `complex_mul_ds` and `complex_add_ds` operations to ensure the phase remains totally lossless for up to 256 iteration skips.
- **Proxy Error Bounding Integrity:** The error propagation check in WGSL must be rigorously audited. If proxy limits are checked in single-precision, they must still accurately vet the scale of the error bounds so the DS engine does not accept a jump that would contaminate the 45-bit mantissa footprint.

## Implementation Plan

1. **Test Driven Headless Harness:** We already possess a perfect diagnostic script `tests/engine/Phase4Test.deno.ts`. We will use this to verify the algorithm. The existing `f64_perturbation` mode returns exactly `46.50` iterations without BLA at `4.5e-5` coordinate zoom. Any change to the structure MUST demonstrably return `46.50` in the Deno output, proving zero trajectory loss.
2. **Memory Layout Expansion:** Introduce `DSBLANode` into the TS compiler schema (`scripts/compileLayoutSchema.js`). Update the `f64p` shader pipeline (`math_accum.wgsl`) to read from a designated DS-tree buffer.
3. **Rust Core Compilation:** Upgrade `rust-math/src/lib.rs` to generate the `DSBLANode` values alongside the standard fallback `BLANode` matrix. Optimize it so memory capacity remains within WebAssembly linear bounds.
4. **WGSL Algorithm Substitution:** Implement `advance_via_bla_ds()` within the `f64p` loop inside `math_accum.wgsl`. Feed the 45-bit precision tracking into the step validation and safely update `dz_ds` at the end of the advance block.
5. **Validation:** Re-run `npm run test:ui` / `tests/engine/Phase4Test.deno.ts` to guarantee `f64p` converges exactly as it did unaccelerated, while restoring frame time to parity with the `f32p` backend.

## Verification Steps

- [x] Write logic in `rust-math/src/lib.rs` to spit out the `DSBLANode` tree.
- [x] Incorporate `advance_via_bla_ds()` into `math_accum.wgsl`.
- [x] Run `tests/engine/Phase4Test.deno.ts` and verify that `f64p` converges to the identical scalar divergence count (`~46`) seen without BLA, but evaluates significantly faster.
- [x] **Implementation standard:** Have all shared boundaries, extracted math helpers, or state-machine behaviors been strictly validated as headless deterministic units per `docs/process/best-practices.md`?
- [x] **Documentation Sync:** Did this implementation drift from the original plan? If so, update `docs/reference/bilinear_approximation_whitepaper.md` and `docs/product/requirements.md` before closing this task.
