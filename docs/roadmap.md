# Apeiron Roadmap

## Phase 1: Foundation & Test Infrastructure

- [x] [Task 001: Initialize Vite/React project footprint](tasks/completed/001-vite-react-footprint.md)
- [x] [Task 002: Establish `initEngine()` headless WebGPU wrapper](tasks/completed/002-headless-webgpu-wrapper.md)
- [x] [Task 003: Implement Rust WASM `math-core` unit testing arrays](tasks/completed/003-rust-wasm-math-core.md)
- [x] [Task 004: Connect React Viewport to WebGPU Engine](tasks/completed/004-viewport-canvas-connection.md)
- [x] [Task 005: Create Automated Headless Regression Runner](tasks/completed/005-headless-regression-runner.md)
- [x] [Task 026: Frontend Worker Testing](tasks/completed/026-frontend-worker-testing.md)
- [x] [Task 029: Headless PassManager Testing and Render Artifact Detection](tasks/completed/029-headless-passmanager-testing.md)
- [x] [Task 033: Refactor Headless Testing Harness](tasks/completed/033-refactor-testing-harness.md)

## Phase 2: Tier 1 Rendering ($f32$)

- [x] [Task 006: Construct `mandelbrot_f32.wgsl` core shader](tasks/completed/006-f32-core-wgsl-shader.md)
- [x] [Task 007: Wire Camera Uniform Buffer to WebGPU](tasks/completed/007-camera-uniform-buffer.md)
- [x] [Task 008: Implement Mouse Drag & Wheel Camera Controls](tasks/completed/008-mouse-camera-controls.md)
- [x] [Task 009: Dynamic Iteration & Color Palettes](tasks/completed/009-iteration-color-palettes.md)

## Phase 3: 4D Architecture & Testing Harness

- [x] [Task 010: Standardize Headless Testing Harness](tasks/completed/010-test-harness.md)
- [x] [Task 011: 4D Parameter Space Viewport Slicer](tasks/completed/011-4d-plane-slicer.md)

## Phase 4: Advanced Rendering & Deep Zoom Infrastructure

- [x] [Task 012: Refactor f32 Shader into Deferred Resolve Pipeline (G-Buffer)](tasks/completed/012-deferred-resolve-pipeline.md)

## Phase 5: Arbitrary Precision & Perturbation

- [x] [Task 013: Rust Origin Limit-Cycle Detection](tasks/completed/013-rust-limit-cycles.md)
- [x] [Task 014: Web Worker Orchestration for WASM](tasks/completed/014-wasm-web-worker.md)
- [x] [Task 015: WebGPU Perturbation Shader Pipeline](tasks/completed/015-webgpu-perturbation.md)
- [x] [Task 016: React Perturbation Wiring](tasks/completed/016-react-perturbation-wiring.md)
- [x] [Task 020: Perturbation Delta Offset Testing](tasks/completed/020-perturbation-delta-testing.md)
- [x] [Task 021: Resolving Bivariate Glitch Glitch Bands](tasks/completed/021-resolving-bivariate-glitch-bands.md)
- [x] [Task 027: Resolve Deep Zoom (1e-4) Loss of Detail & Black Voids](tasks/completed/027-resolve-deep-zoom-glitch.md)
- [x] [Task 028: Resolve Magenta Screen Glitch at Deep Zoom](tasks/completed/028-resolve-magenta-screen-glitch.md)

## Phase 6: Distance Estimation & Aesthetics (G-Buffer Resolve)

- [x] [Task 017: Distance Estimation & Spatial Lighting](tasks/completed/017-distance-estimation-lighting.md)
- [x] [Task 018: Triangle Inequality Average (Stripe Rendering)](tasks/completed/018-tia-stripe-average.md)
- [x] [Task 023: Legacy UI Config Parity](tasks/completed/023-legacy-ui-parity.md)

## Phase 7: UI Capabilities & Integration

- [x] [Task 019: Advanced UI Control Surfaces](tasks/completed/019-advanced-ui-controls.md)
- [x] [Task 020: Integration of HUD Toolbar](tasks/completed/020-hud-toolbar.md)
- [x] [Task 024: Engine PassManager & UI Cleanup](tasks/completed/024-engine-passmanager-refactor.md)
- [x] [Task 025: Mobile HUD & Interaction Fixes](tasks/completed/025-mobile-fixes.md)

## Phase 8: Extensibility & Variations

- [x] [Task 022: Variable Exponents](tasks/completed/022-variable-exponents.md)

## Phase 9: State Sharing & Deep Linking

- [x] [Task 030: URL State Serialization (Deep Linking)](tasks/completed/030-url-state-serialization.md)

## Phase 10: Performance & Progressive Rendering

- [x] [Task 031: Progressive Rendering State Machine](tasks/completed/031-progressive-rendering.md)
- [x] [Task 032: Performance Optimizations (Panning Latency)](tasks/completed/032-performance-optimizations.md)

## Phase 11: Advanced Engine Math

- [ ] [Task 034: Limit Cycles & Interior Bounds](tasks/034-limit-cycles.md)
- [x] [Task 035: Series Approximation (SA)](tasks/035-series-approximation.md)
- [x] [Task 036: Bilinear Approximation (BLA)](tasks/completed/036-bilinear-approximation.md)

## Phase 12: Expanded Rendering Archtypes

- [ ] [Task 037: Orbit Traps Geometry Core (Headless)](tasks/037-orbit-traps.md)
- [ ] [Task 038: Orbit Traps UI Sandbox (Frontend)](tasks/038-orbit-traps-ui.md)
- [ ] [Task 039: The Stochastic Scatter Engine (Buddhabrot)](tasks/039-stochastic-engine.md)

## Phase 13: Cinematic Animation

- [ ] [Task 040: Headless Interpolator Engine (Math & Playback)](tasks/040-headless-interpolator.md)
- [ ] [Task 041: The Sequence Studio HUD (UI)](tasks/041-sequence-studio.md)

## Phase 14: Mobile Performance

- [x] [Task 042: Zero-Resize Dynamic Resolution Scaling](tasks/completed/042-zero-resize-drs.md)
- [x] [Task 043: RenderFrameDescriptor — Typed Engine Contract](tasks/completed/043-render-frame-descriptor.md)

## Phase 15: Interior-Coverage Lag Elimination

- [x] [Task 044: Frame-Time Telemetry & Interactive Quality Budget](tasks/completed/044-frame-time-telemetry.md)
- [ ] [Task 045: Adaptive Dynamic Resolution Scaling (ADRS)](tasks/045-adaptive-drs.md)
- [x] [Task 046: Shader Interior Early-Out (Period Detection)](tasks/completed/046-shader-interior-early-out.md)
- [x] [Task 047: Execution Checkpointing](tasks/completed/047-execution-checkpointing.md)
- [x] [Task 051: Buffer Alignment Cleanup and Abstraction](tasks/completed/051-buffer-alignment-cleanup.md)

## Phase 16: State Machine Formalization

- [x] [Task 052: Formalize Temporal State Machine & Pipeline Contract](tasks/completed/052-formalize-temporal-fsm.md)
- [x] [Task 053: Refactor Math Accumulation Shader](tasks/completed/053-refactor-math-accum.md)
- [x] [Task 054: Compute Shader Unit Testing Architecture](tasks/completed/054-compute-shader-unit-testing.md)
- [x] [Task 055: Fragment Shader Debug Channels & UI Integration](tasks/completed/055-fragment-shader-debug-channels.md)
- [x] [Task 056: Fix WebGPU Storage Buffer Binding Size Limits](tasks/completed/056-max-buffer-size.md)

## Phase 17: Telemetry & DX (GTKWave Analyzer)

- [x] [Task 057: Telemetry Registry & Headless Primitives](tasks/completed/057-telemetry-registry.md)
- [ ] [Task 058: Telemetry Data Integration (Producers)](tasks/058-telemetry-integration.md)
- [ ] [Task 059: Telemetry UI (GTKWave Analyzer)](tasks/059-telemetry-ui.md)
