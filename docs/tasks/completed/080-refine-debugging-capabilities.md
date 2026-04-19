---
status: closed
---

# Task 080: Refine Advanced Debugging Capabilities

## Objective

Enhance the Apeiron debugging toolset to bridge the gap between mathematical/headless buffer failures and visual artifacts, enabling faster diagnosis of proxy collapse, float truncation, and BLA fallback logic across deep-zoom rendering tiers.

## Relevant Design Docs

- [Apeiron Test Plan](../process/test-plan.md)
- [WebGPU Passes](../design/engine/webgpu-passes.md)
- [Apeiron Best Practices](../process/best-practices.md) (Standard boundary/testing rules apply)

## Requirements

- **Visual/Heatmap Diagnostic Pass:** Refine the existing WebGPU `camera.debug_view_mode` system (specifically Mode 5.0 Dual-Path Heatmap and Mode 6.0 Cycle Detection). We must expose these formally in the developer UI and system scripts so that AI agents and developers can instantly activate visual drift diagnostics over falling into code-tracing rabbit holes.
- **Float Precision Telemetry Overlay:** Create a UI overlay that specifically exposes the mathematical tier currently active ($f32p$, $f64p$, etc.), real-time BLA limits, reference orbit rebasing costs, and Rust worker latency to clearly show when boundaries are exhausted.
- **Pair-Debugging State Snapshots:** Implement a robust snapshot mechanism allowing the User (during a glitch observation) to click a "Copy Debug State" UI button. This dumps the entire `MathContext`, `ExecutionCommand`, and current viewport parameters directly to clipboard in a format that easily seeds a failing Deno regression test case (updating `tests/cases.json`), allowing the Agent to take over seamlessly.
- **Shader Step-Through Emulation Hooks:** Integrate headless Deno utilities capable of sampling intermediate iteration bounds midway through the WGSL compute loop, allowing us to deterministically test where Series Approximation polynomials begin drifting before they hit the escape threshold.

## Implementation Plan

1. **[COMPLETED] Phase 1: Pair-Debugging State Snapshots**
   - Add a "Copy Export State" debug action to the `ApeironViewport` frontend so the User can paste it directly to the Agent.
   - Implement formatting in `PerturbationOrchestrator.ts` to output standard `tests/cases.json` inputs safely.
2. **[COMPLETED] Phase 2: Float Precision Telemetry Inspector**
   - _Status:_ Telemetry system is already fully scaled. We just need to ensure `engine.math_mode` is grouped in the 'Presets' tab for fast retrieval.
3. **[COMPLETED] Phase 3: Visual Diagnostic Refinement & Agent Toggles**
   - _Status:_ The `debug_view_mode` dropdown is already beautifully wired into the header of `TelemetryDashboard.tsx`. Agents are now instructed to request this during Pair-Debugging.
4. **[ICEBOXED] Phase 4: WGSL Intermediate Step Emulation**
   - Refactor the headless Deno runner to optionally dump buffers on targeted Nth iterations for shader step-through emulation, bypassing continuous iteration optimization specifically for math kernel validation.

## Verification Steps

- [x] Data validation of "Headless State Snapshots" ensuring Deno correctly recreates visual glitches identically when handed the exported snapshot.
- [x] UI visual test validating Telemetry overlay metrics accurately reflect the active Rust math state.
- [x] Visual regression test for the WebGPU Heatmap diagnostic mode, ensuring that fallback artifacts align with known failure depth thresholds.
- [ ] Deno automated test validating the WGSL intermediate state dumping correctly exposes mathematical progression (Skipped).
- [x] **Implementation standard:** All extracted telemetry and visualization math remains pure and headless-compatible.
- [x] **Documentation Sync:** Update `docs/process/test-plan.md` to formally document when/how to use the Heatmap Pass and State Snapshots prior to closing.
