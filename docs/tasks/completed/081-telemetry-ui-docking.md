---
status: closed
---

# Task 081: Telemetry UI Docking and Layout Refactoring

## Objective

Refactor the Telemetry UI to enable dynamic layout docking (bottom vs right-side) and solve overlapping rendering by dynamically resizing the main WebGPU fractal canvas. Additionally, optimize the telemetry controls header to prevent layout wrapping on narrow screens.

## Relevant Design Docs

- [Apeiron Telemetry & Debugging System Design](../design/telemetry/architecture.md)

## Requirements

- **Dynamic Canvas Resizing:** The `ApeironViewport` canvas must accurately size to the remaining space of the viewport when Telemetry is open, preventing expensive GPU pixel computations for regions hidden by opaque debug overlay panels.
- **Docking Modes:** The `TelemetryDashboard` must toggle between `bottom` and `right` docking allocations. Right-docking allows the user to see a large vertical stack of lanes simultaneously while the main scene maintains a squarish aspect ratio.
- **Header Refactor:** Condense the `TelemetryDashboard` top bar controls (Cursor manipulation, preset dropdowns, export buttons) to prevent collision and ugly line-wrapping when horizontal space is limited.

## Implementation Plan

1. **State Extension:** Update `viewportStore.ts` to include `telemetryDock: 'bottom' | 'right'` initialized to 'bottom', and actions to modify it.
2. **App Layout Re-Architecture:**
   - Modify `App.tsx` to use a global Flexbox container driven by `telemetryDock`.
   - Update `ApeironViewport.tsx` canvas style to use `100% / 100%` rather than `100vw / 100vh` to naturally accommodate flex bounds. The existing `ResizeObserver` will inherently detect these changes and rebuild the WebGPU bindings automatically.
3. **Telemetry Top Bar De-cluttering:**
   - Migrate text-heavy cursor controls (`|◀`, `◀`, `▶`, `▶|`, `✕ CLEAR`) to minimalist icons.
   - Separate the tools into left and right flex-groups or overlay the cursor controls over the canvas area.
4. **Dock Resizing Adjustments:**
   - Modify `TelemetryDashboard.tsx` to support vertical or horizontal panel tracking instead of just tracking vertical height.
   - Introduce a Dock Toggle button in the header bar.

## Verification Steps

- [ ] Inspect horizontal line graph rendering when docked side-by-side to guarantee standard bounds calculations function properly.
- [ ] Confirm WebGPU resize events fire successfully when toggling between dock modes, and aspect ratio of standard view doesn't distort.
- [ ] Ensure the top bar properly minifies on widths less than 800px.
- [ ] **Implementation standard:** Zero React dependencies in Hot Paths maintained.
- [ ] **Documentation Sync:** No new architectural documentation changes are anticipated.
