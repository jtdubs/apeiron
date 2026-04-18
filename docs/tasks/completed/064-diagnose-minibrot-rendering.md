# Task: Diagnose Minibrot Rendering (f32, f32_perturbation, f64_perturbation)

status: closed

## Objectives

- Resolve the visual rendering glitch observed when viewing a Minibrot at zoom `3e-5`.
- Fix the issue in the `f32` backend where the INTERACT FSM state yields an arbitrarily incorrect color (orange) inside the fractal instead of black (ACCUM renders correctly).
- Identify and resolve the issue in the `f32_perturbation` backend causing the entire canvas to evaluate to black.
- Identify and resolve the issue in the `f64_perturbation` backend causing bulbous, unrepresentative orange shapes.

## Links to Design Docs

- `docs/design/engine/core-math.md`
- `docs/design/engine/webgpu-passes.md`

## Requirements

- No React state should be introduced into the rendering loop for debugging.
- We must establish data-first test cases in Deno that verify mathematical boundaries off-canvas before executing application code fixes.
- Must trace Sentinel values out of `math_accum.wgsl` into visual channels instead of blindly guessing states.

## Implementation Plan

### Phase 1: Sentinel Visualization

1. Patch `resolve_present.wgsl` to render specific errors from `math_accum.wgsl` (e.g., `-2.0`, `-5.0`) as distinct solid colors (Magenta, Cyan, Red). This identifies if the "orange" interior is just a negative iteration passing into the cosine palette.

### Phase 2: Mode Selection Validation

1. Audit `RenderOrchestrator` to verify why `f32` precision is selected at `3e-5` zoom.

### Phase 3: FSM State Validation (INTERACT vs ACCUM)

1. Verify discrepancy in `params.max_iter` or checkpoint yield bounds between high-res and low-res FSM passes.

### Phase 4: Headless Validation

1. Create a `4x4` unit test in Deno using the extracted URL parameters. Run `f32`, `f32p`, and `f64p` headless. Dump the resulting G-Buffer (raw iteration and delta z values) to pinpoint early bailouts or Double-Single overflow.

### Phase 5: Implementation & Synthesis

1. Commit the deterministic test, patch the math engine properly, ensure alignment with `core-math.md`, and close this task.
