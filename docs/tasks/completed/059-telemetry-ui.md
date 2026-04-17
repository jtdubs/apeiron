---
status: closed
---

# Task 059: Telemetry UI (GTKWave Analyzer)

## Objective

Build the "Real UI Integration" described in the telemetry design, introducing a custom `Canvas2D` rendering layer and React interactive controls for Trace Capturing, Zooming, Panning, and Presets.

## Relevant Design Docs

- [Telemetry Design](../../design/telemetry.md)

## Requirements

- **Canvas Rendering (Zero-DOM Hot Path):** Build `TelemetryRenderer.ts` that safely paints continuous connected lines for `analog` values and non-interpolating GTKWave step-functions for `digital` states without thrashing React.
- **Trace Capture Controls:** React UI must support toggling a `Paused` state that detaches the renderer's read-head from the live engine data, allowing frozen forensic analysis.
- **Preset/Signal Selection:** UI implements a selector allowing developers to tailor the display using 'Add to View' logic, avoiding rigid tabs, and supports fast presets (e.g., 'Performance Diagnostics').
- **Hybrid DOM Text:** Use throttled React polling or purely isolated refs for the current EMA smooth-value text readouts alongside the dense canvas graphs.

## Implementation Plan

1. Create a `TelemetryDashboard.tsx` container utilizing Apeiron's standard glassmorphism styling.
2. Implement a unified custom Hook (e.g., `useTelemetry()`) that extracts EMA text states at a deliberate, low framerate (e.g., 4 FPS) for UI text values.
3. Create the `TelemetryRenderer.ts` logic capable of parsing both `analog` bounds arrays and `digital` step colors. Add Canvas resize observers.
4. Implement the "Freeze/Capture" mode logic. When engaged, the view ceases to follow the RingBuffer pointer and supports basic canvas displacement (Pan/Zoom X).
5. Hook into the main `App.tsx` or viewport layer to float the Draggable dashboard.

## Verification Steps

- [x] Manual Check: Verify that expanding the dashboard does NOT degrade the fractal rendering GPU throughput.
- [x] Manual Check: Verify that hitting "Freeze" correctly stops visual trace movement while application continues panning smoothly beneath it.
- [x] Manual Check: Verify GTKWave digital waveforms draw sharply.
- [x] **Documentation Sync:** Did this implementation drift from the original plan? If so, update design docs before closing.
