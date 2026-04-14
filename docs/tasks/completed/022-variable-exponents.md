---
status: closed
---

# Task 022: Variable Exponents

## Objective

Extend the Apeiron rendering engine and math core to support arbitrary variable exponents (e.g., $Z^d + c$) to allow exploration of higher-order Mandelbrot variations, integrating a key legacy feature from the previous `frac` system.

## Relevant Design Docs

- [Math Backend Design](../math-backend-design.md)
- [Rendering Engine Design](../rendering-engine-design.md)
- [Frontend Design](../frontend-design.md)

## Requirements

- **Mathematical Flexibility:** Both WebGPU shaders and the Rust `math-core` must support a dynamic exponent $d$ in the primary fractal iteration equation $Z_{n+1} = Z_n^d + c$.
- **Precision Compatibility:** The Rust arbitrary-precision core must handle complex exponentiation (`Z^d`). Since the exponent $d$ itself will be treated as a standard `f64`, we avoid parsing it as arbitrary precision. However, for a `BigDecimal` complex base, calculating large non-integer powers still requires calculating $r^d e^{i \cdot d \theta}$. We must implement robust handling for this or use binary exponentiation if $d$ is an integer.
- **UI Integration:** The React UI (`ApeironHUD`) must provide an interactively scrubbable input to control the exponent $d$ (defaulting to 2.0).
- **Shader Translation:** The `f32` and perturbation shaders must replace hardcoded $Z^2$ arithmetic with the complex exponentiation formula: $Z^d = r^d (\cos(d\theta) + i\sin(d\theta))$, avoiding branching where possible.

## Implementation Plan

1. **State & Uniforms Expansion:** Update the `CameraParams` interface in TypeScript and the WebGPU uniform struct to include `exponent: f32`, guaranteeing proper padding and byte-alignment.
2. **UI Implementation:** Build a fast-response scrubber/slider in `ApeironHUD.tsx` to manipulate the exponent, restricted to a default range of `[1.0, 6.0]`, mapping it directly to the engine's `ViewportState`.
3. **WebGPU Shader Refactor:**
   - Add a strict **Uniform Fast-Path:** Because the exponent is a `Uniform` constant across the entire screen, branching based on integer versus fractional exponents executes synchronously with zero warp divergence.
   - For integer powers ($d = 2, 3, 4, \dots$), implement a fast-path loop utilizing iterative complex multiplication. This avoids all transcendental functions (`atan2`, `sin`, `cos`) and maintains incredibly fast framerates.
   - For fractional non-integers ($d \neq \text{floor}(d)$), fallback to the generalized polar coordinate form. This protects performance for exact integers entirely.
4. **Rust `math-core` Complex Arithmetic:**
   - Update the `Point` JSON schema in `rust-math/src/lib.rs` to ingest an `exponent` value (parsed as `f64`).
   - Expand the `BigDecimal` logic. Since the exponent is an `f64`:
     - If $d$ is an integer (e.g., $2.0, 3.0$), use exact **arbitrary-precision binary exponentiation** (repeated squaring/multiplication). This bypasses floating-point trigonometry entirely and acts as the pure high-performance integer fast-path.
     - If $d$ is fractional, calculate the phase and magnitude using an `f64` degradation path specifically for the $e^{id\theta}$ trigonometric factors while preserving arbitrary precision for the base.

## Verification Steps

- [ ] Write a headless test case that structurally asserts generation of a Multibrot ($d=3$ or $d=4$) via Rust `math-core` arrays.
- [ ] Run automated fuzzy validation to ensure the WebGPU `f32` shader outputs correspond directly with the Rust baseline using a $d=3.5$ floating-point exponent.
- [ ] **Documentation Sync:** Once the method for arbitrary-precision trig is finalized in Rust, explicitly document it and its performance implications in `docs/math-backend-design.md`.
