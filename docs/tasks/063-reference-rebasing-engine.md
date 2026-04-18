---
status: open
---

# Task 063: Reference Rebasing Engine (Dual-Orbit Perturbation)

## Objective

Solve the deep-zoom (>1e-7) Proxy Collapse limitations by creating a dynamic Reference Rebasing pipeline that recalculates high-precision `f64`/`BigFloat` reference orbits on-the-fly when geometric divergence occurs, ensuring mathematically pure pixel evaluation to infinite depths.

## Relevant Design Docs

- [Engine Core Math](../design/engine/core-math.md)
- [Apeiron Best Practices](../process/best-practices.md)

## Background & Discovery Capture (Task 062 Addendum)

During deep-zoom Perturbation testing (1e-5), we discovered dual mathematical vulnerabilities rendering "solid color screens":

1. **The True Nature of Proxy Collapse:** `core-math.md` originally assumed Proxy Collapse was largely mitigated by early limit-cycle detection in the Rust Backend. This is incorrect. Proxy Collapse (`|Δz| > |Z_n|`) naturally occurs anytime a localized coordinate wanders far enough from the central reference orbit due to structural topology (e.g. centering near a mini-mandelbrot origin while surrounding pixels diverge outwardly). 
2. **Bilinear Approximation (BLA) Blind Spots:** The BLA acceleration structure only calculates numeric validity matrix error margins, assuming `|Δz| < |Z_n|` holds true fundamentally. When a pixel mathematically hits Proxy Collapse, the linear assumptions of the BLA matrices aggressively disintegrate. Previously, BLA skipped right over the failure bounds and output massively corrupted `Δz` values that artificially triggered "escape" conditions inside standard math validations.

**The Current Mitigation (Task 062):**
We fixed shallow zoom anomalies (out to 1e-7) by strictly calculating `potential_dz > ref_mag` before BLA matrix jumps, aggressively backing them out. Once a proxy collapse is isolated step-by-step, we hand the coordinate over to the standard `continue_mandelbrot_iterations(f32)` iteration loop. At shallow zooms (1e-5), `f32` is mathematically capable of rendering the geometry cleanly. At `> 1e-7`, this `f32` fallback will succumb to mantissa truncation and cause pixelated structures rather than glitch-outs.

To cleanly render geometry beyond 1e-7, we must implement full mathematical rebasing.

## Requirements

- **Design Document Overhaul:** Revise `docs/design/engine/core-math.md` to cleanly separate "Limit Cycle Detection" (ambient optimizations) from "Proxy Collapse" (geometric failure). Add a section rigorously detailing the mathematical necessity of Reference Rebasing and BLA tolerance bounds validation.
- **Glitch Pixel Identification:** When WebGPU triggers `|Δz| > |Z_n|` in deep-zoom (`> 1e-7`), the shading pipeline must accurately mark those pixel boundaries as 'failed' (e.g., tracking glitch coordinate bounds).
- **Rust Math-Core Handoff:** Pass the coordinates of a failed pixel zone over the WGPU/WASM interface back to the Rust Backend.
- **Secondary Reference Orbit:** The Rust Backend must initialize a new high-precision (f64/GMP) orbit centered explicitly on the failed coordinate, pushing a secondary (or multi-reference) orbit back to the GPU context.
- **GPU Re-Entry:** WebGPU cleanly evaluates the localized geometry relative to the nearest rebased orbit.

## Implementation Plan

1. **Design Documentation:** Update `docs/design/engine/core-math.md` outlining the discoveries from Task 062, formalizing the Dual-Reference or Rebasing topological structures needed.
2. **Headless Verification:** Expand the deterministic testing arrays in `mandelbrot.test.ts` to actively simulate a `> 1e-8` proxy collapse, validating the pass manager accurately detects structural fallback without visual UI.
3. **Data Schemas:** Expand the `CameraParams` and layout schemas to handle 1..N reference orbits per frame rather than assuming singular centrality.
4. **Rust Worker Expansion:** Implement `calculate_rebased_orbits` in Rust, receiving an arbitrary payload of target zones and generating parallel orbits.
5. **WGSL Dual Traversal:** Implement WebGPU interpolation to select and trace against `get_orbit_node(ref_idx, iter)`.

## Verification Steps

- [ ] [Test] `core-math.md` rigorously documents Proxy Collapse divergence causes beyond Limit Cycles.
- [ ] [Test] The WebGPU Pass Manager accurately intercepts sub-render glitch boundaries natively.
- [ ] [Test] Deep zoom coordinates explicitly bypassing 1e-8 render cleanly as fractal boundaries, devoid of pixel-block limitations.
- [ ] **Implementation standard:** Have all shared boundaries, extracted math helpers, or state-machine behaviors been strictly validated as headless deterministic units per `docs/process/best-practices.md`?
- [ ] **Documentation Sync:** Did this implementation drift from the original plan? If so, update `docs/[relevant-design].md` and `docs/product/requirements.md` before closing this task.
