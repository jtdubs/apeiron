# Mathematical Improvements Synthesis

This whitepaper aggregates the findings discovered across the `fraktaler-3`, `mightymandel`, and `Fractalshades` source codes during the Comparative Analysis task. These findings translate architectural capabilities extracted from external engines into engineering objectives tailored for Apeiron's constraints (WebGPU, WASM, and Typescript orchestration).

## Executive Summary

The analysis validated that Apeiron's core mechanisms (Linear Approximation skips, Zhuoran Proxy Collapse, and Arbitrary-Precision Rebasing via `BigDecimal`) firmly match the mathematical intent of established high-performance offline renderers like `mightymandel` and `fraktaler`. Because Apeiron targets real-time browser execution (WebGPU) while maintaining mathematical perfection, it correctly uses a hybrid approach: parallel Double-Single precision blocks calculated natively via shaders, dynamically healed via a Rust WASM backend using robust structured tree grids.

However, several external techniques present immediate optimization opportunities.

---

## Actionable Engineering Tasks

### Task A: Refine Glitch Prediction Thresholds
**Source Inspiration:** `fraktaler-2` \& `fraktaler-3`
**Context:** Apeiron relies heavily on a static Proxy Collapse check (`p_mag < dz_mag && dz_mag < 1e-6`) within `core_compute.wgsl`.
**Action:** 
1. Adopt the stricter bounded absolute check from `fraktaler-3`: Verify `|Z + z|^2 < |z|^2` across `f32p` emulation lines. This directly compares true cumulative vector space and is universally reliable devoid of static scalar limits (like `1e-6`).
2. Alternatively, investigate implementing the `fraktaler-2` derivative bounds check (`a * h < b * e`), scaling glitch thresholds parametrically by zoom bounds and local viewport dimensions.
**Target Location:** `core_compute.wgsl` and `perturbation.wgsl`

### Task B: Relocate Branch-Heavy BLA Checking to CPU (WASM)
**Source Inspiration:** `fraktaler-3` \& `Fractalshades`
**Context:** GPU execution lanes (SIMD units) are severely crippled by divergent if-else branching. `fraktaler-3` processes skip levels recursively within `std::vector` using pure CPU threading. `Fractalshades` pre-calculates the matrices into rigid bounds arrays ahead of execution (`numba_make_BLA()`).
**Action:** 
Apeiron's inline WGSL function `advance_via_bla()` recursively evaluates depth and collapses conditionally across active blocks. We should extract the `BLA_skip` identification engine entirely into the `rust-math` CPU crate. The Rust backend can resolve precisely how many nodes the active bounds can skip *before* pushing the data payload to the GPU, leaving the WebGPU compute pass exactly one pure linear matrix multiplication instead of a branching tree loop.
**Target Location:** `rust-math/src/mandelbrot.rs` and TS Orchestrator.

### Task C: Investigate Sampler Textures for High-Precision Buffers
**Source Inspiration:** `mightymandel`
**Context:** `mightymandel` unpacks Double matrices (`dvec2, dvec4`) directly out of `usampler2D zdz0s` bindings using `packDouble2x32`. 
**Action:** 
Apeiron pushes High/Low bounds inside linear raw `storage` block buffers. As resolution limits hit SSBO maximum binding sizes, evaluate rewriting the reference Keyframe grids to dynamically map against 2D Texture Arrays (`texture_2d<u32>`), treating pixels as compressed matrix channels.
**Target Location:** `bla_stepper.wgsl` / MemoryLayout limits.

### Task D: Expand Rust Unit Tests for Glitch Heuristics
**Source Inspiration:** Apeiron Architecture Standard
**Context:** Moving and modifying the glitch logic (Task A) demands objective verification prior to visual integration.
**Action:** Add comprehensive deterministic test parameters comparing legacy `dz_mag < 1e-6` results against the new `|Z+z|^2 < |z|^2` boundary within `rust-math/tests/glitch_test.rs`.

---
## Conclusion

Apeiron establishes itself as a technologically sophisticated web engine. Modifying how early logic flows into WGSL (shifting branches to WASM and enforcing rigid thresholds) represents the final optimization threshold before theoretical WebGPU limitations are hit.
