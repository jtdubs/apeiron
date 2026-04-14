---
status: closed
---

# Task 017: Distance Estimation & Spatial Lighting

## Objective

Leverage the G-Buffer (Deferred Resolve Pipeline) to apply 3D Distance Estimation (DE) topographical coloring, using the structural derivative data calculated by the math core.

## Relevant Design Docs

- `docs/rendering-engine-design.md`

## Requirements

- **G-Buffer Decoupling:** The math accumulation pass strictly provides the raw structural derivative metadata (via the Limit-Cycle detection work in Task 013). The Resolve pass applies lighting.
- **Shading Engine:** The Presentation Pass must support standard 3D rendering mechanics like Lambertian diffuse shading, specular highlights, and surface normal approximations mapped from the 2D gradient.
- **Testing Rendering Independence:** The renderer should be testable by injecting mock derivatives into the Resolve shader and verifying output RGBA values, separating it entirely from math logic tests.

## Implementation Plan

1. Establish a mapping layout in the G-Buffer to store continuous gradients/derivatives per fragment.
2. Build a normal-mapping function in `resolve_present.wgsl` to interpret the scalar distance estimation as a vector.
3. Design a lighting model function with configurable light angles, specular intensity, and ambient glow.
4. Implement diagnostic unit tests verifying light functions yield expected vectors.

## Verification Steps

- [x] Are derivatives correctly fetched from the G-Buffer without requiring re-computation?
- [x] Does the visual output reflect 3D topographic shading?
- [x] **Testing:** Have headless proxy tests been added to ensure `resolve_present.wgsl` outputs perfectly stable deterministic colors when fed known mock G-Buffer data?
