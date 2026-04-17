---
status: closed
---

# Task 023: Legacy UI Config Parity

## Objective

Adopt and refine rendering configuration concepts from the legacy `frac` project to clean up the Apeiron graphics control surfaces and expand aesthetic capabilities.

## Relevant Design Docs

- `docs/design/engine/webgpu-passes.md`

## Requirements

- Introduce the missing "Banded" coloring calculation to the WebGPU Resolve logic.
- Implement a "Surface Effects" master selector to hide complex granular topological sliders natively from users when not actively performing 3D light wrapping.
- Maintain decoupled calculation independence across the G-Buffer architecture for all shading passes.
- Ensure the state parameters behave correctly inside `themeStore`.

## Implementation Plan

1. **Model Upgrades**: Augment the `ColoringMode` Zustand property to include `banded` alongside `continuous` and `stripe`.
   - **Continuous**: Evaluates the fractional escape boundary float `t` linearly passing it over the cosine palette resulting in smooth, infinite soft gradients.
   - **Banded**: Bypasses fractional smoothing and maps explicit integer thresholds `floor(iter)` exclusively against the palette. Produces sharp, posterized geometric terrain boundaries.
   - **Stripe / TIA (Triangle Inequality Average)**: Ignores typical escape-time boundaries and averages spatial distance ratios per orbit cycle. Result maps naturally into tightly packed banded stripes bounded completely by the geometric domains.
2. **Topological Controller**: Create an overarching `surfaceMode` mapping between `off` (0), `3d-topography` (1), `soft-glow` (2) and `contours` (3). When anything other than `3d-topography` is selected, the UI must gracefully collapse granular 3D light properties (Azimuth, Elevation, Diffuse, Gloss) to declutter the panel.
3. **WebGPU Mapping**: Pipe the `surfaceMode` parameter safely to `resolve_present.wgsl` Uniform buffer padding, ensuring safe execution modes natively inside the Resolve pass.
4. **Shader Logic Effects**:
   - Add `floor(iter)` support natively when Banded exterior mapping is enabled.
   - For `surfaceMode == 1`, render standard Blinn-Phong directional math.
   - For `surfaceMode == 2` (Glow), override topographical directionals and utilize the G-Buffer `de` (Distance Estimation) float strictly to modulate brightness curves.
   - For `surfaceMode == 3` (Contours), map modulo operations against the `de` proxy float to snap crisp topological borders.

## Verification Steps

- [ ] Does the UI correctly obscure advanced spatial light modifiers unless specifically requested?
- [ ] Is "Banded" rendering successfully mathematically stepping integer limits on the shader mapping array?
- [ ] Does the `de` Distance Estimation float seamlessly construct Glow and Contour maps independent of the selected Coloring Mode?
