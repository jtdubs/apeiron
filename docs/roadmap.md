# Apeiron Roadmap

## Phase 1: Foundation & Test Infrastructure

- [x] [Task 001: Initialize Vite/React project footprint](tasks/completed/001-vite-react-footprint.md)
- [x] [Task 002: Establish `initEngine()` headless WebGPU wrapper](tasks/completed/002-headless-webgpu-wrapper.md)
- [x] [Task 003: Implement Rust WASM `math-core` unit testing arrays](tasks/completed/003-rust-wasm-math-core.md)
- [x] [Task 004: Connect React Viewport to WebGPU Engine](tasks/completed/004-viewport-canvas-connection.md)
- [x] [Task 005: Create Automated Headless Regression Runner](tasks/completed/005-headless-regression-runner.md)

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

## Phase 6: Distance Estimation & Aesthetics (G-Buffer Resolve)

- [ ] [Task 016: Distance Estimation & Spatial Lighting](tasks/016-distance-estimation-lighting.md)
- [ ] [Task 017: Triangle Inequality Average (Stripe Rendering)](tasks/017-tia-stripe-average.md)

## Phase 7: UI Capabilities & Integration

- [ ] [Task 018: Advanced UI Control Surfaces](tasks/018-advanced-ui-controls.md)
