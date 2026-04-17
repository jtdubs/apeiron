---
status: closed
---

# Task 055: Fragment Shader Debug Channels & UI Integration

## Objective

Extend the engine to support transmitting arbitrary mathematical geometry, intermediate shader states, or proxy-collapse errors via "Debug Views" output physically over the visible color channels natively within the application loop, toggleable via the React UI.

## Relevant Design Docs

- [UI Design](../../design/ui.md)
- [Rendering Engine Design](../../design/rendering-engine.md)

## Requirements

- **Requirement 1: Interactive Debug Control:** Expand `SettingsPanel` in the frontend so users/developers can select a `Debug View Mode` (e.g., "None", "Show Limit Cycles", "Show Checkpoints", "Show BLA Nodes", "Interpolation Strain").
- **Requirement 2: Uniform Buffer Transmission:** Update `uniforms.ts`, `RenderFrameDescriptor`, and the Uniform packing logic in `PassManager` to encode this `debug_mode` value in the struct and seamlessly transmit it to the Fragment Resolve shaders.
- **Requirement 3: Fragment Color Channel Abuse:** Modify the presentation shader to consume the `debug_mode` flag. If > 0, conditionally bypass the standard Cosine Palette visual lighting, instead normalizing internal metrics (like TIA averages, skipped iteration loops, proxy drift indices) directly to screen RGB.

## Implementation Plan

1. Add `debugViewMode: number` to `MathContext` inside `RenderFrameDescriptor`.
2. Update the `CameraParams` uniform payload schema to process `debugViewMode` across `uniforms.ts`.
3. Add a new segmented control or debug toggle to `src/ui/components/SettingsPanel.tsx`, dispatching updates cleanly into `useViewportStore`.
4. Modify `engine/shaders/escape/resolve.wgsl` (or equivalent presentation pass). Inject an `if/else` multiplexer processing `camera.debug_view_mode`. Map known specific properties out of the G-Buffer (e.g. if rendering checkpoints, map pixel areas where `checkpoint_iter > 0` to solid visible colors vs resolved pixels).
5. Add explicit handling inside `math_accum.wgsl` where necessary, converting complex states internally to dedicated vector returns if deep mathematical debug is required in `gl_FragColor`.

## Verification Steps

- [ ] Interactive UI Switch: Select a visual debug mode and verify an instant re-render maps data colors dynamically without crashing the system logic.
- [ ] Interactive Regression: Verify that while deep rendering is happening in the background, exposing debug channels natively scales with Dynamic Resolution DRS and accurately displays downscaled diagnostics.
- [ ] **Documentation Sync:** Ensure features are logged in relevant telemetry / architecture documents.
