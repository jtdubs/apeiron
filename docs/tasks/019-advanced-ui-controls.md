---
status: open
---

# Task 019: Advanced UI Control Surfaces

## Objective

Update the React presentation layer to expose all of the new aesthetic features developed in Phase 6, without breaking the "Zero React DOM in Hot Paths" architecture constraint.

## Relevant Design Docs

- `docs/requirements.md`

## Requirements

- **Uniform Buffer Mapping:** Controls must strictly mutate variables within the `CameraParams` or `Theme` uniform buffers (sent to WebGPU) rather than forcing React rerenders.
- **Components:** Create panels for lighting configuration, palette swamping, and precision modes.
- **Zero DOM Rendering:** Changes to specular controls must not impact 60ps 3D logic.

## Implementation Plan

1. Construct React UI partials (e.g., `<LightingPanel />`, `<ThemeSelector />`) mapped to engine hook state.
2. Develop state-management wiring allowing the rendering loop to silently ingest UI config without forcing component prop drilling.
3. Provide robust E2E UI testing to ensure controls bind to uniform buffers successfully.

## Verification Steps

- [ ] Do lighting sliders instantly affect the render canvas with zero frame drop?
- [ ] Do changes in the UI successfully reflect in the unified exported URL / Base64 serialization scheme?
