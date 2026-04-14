---
status: closed
---

# Task 031: Progressive Rendering (Shallow Zoom Foundation)

## Objective

Implement the Temporal Supersampling (multi-frame ping-pong accumulation) pipeline in WebGPU to maintain high visual fidelity and 60fps fluidity during interaction at shallow zooms. This sets the foundation for the `STATIC` and `INTERACT_SAFE` state machine.

## Relevant Design Docs

- [Progressive Rendering & Performance Design](../progressive-rendering-design.md)

## Requirements

- **Render Quality State Machine:** The frontend must track and pivot between `STATIC` (debounced pause, executing accumulation) and `INTERACT` (actively panning, 1-sample-per-pixel).
- **Temporal Accumulation:** WebGPU must support a ping-pong buffer approach where it averages sub-pixel shifted samples over multiple frames while the user is inactive (`STATIC`).

## Implementation Plan

1. **Frontend Orchestration:** Update the frontend Zustand logic to smoothly transition between `STATIC` and `INTERACT` based on user input, using a debounce threshold. Add `isInteracting` or active interaction state flags.
2. **WebGPU Accumulation Architecture:** Modify the `PassManager` to hold two alternating render targets (Buffer A and Buffer B). Introduce a `frame_count` uniform or equivalent accumulator mechanism.
3. **Sub-pixel Jitter in Compute:** Update the compute shader to apply sub-pixel offsetting based on the current interaction or accumulation phase.
4. **Resolve Pass Update:** Update the accumulation logic to mix `1.0 / frame_count` weighting into the ping-pong buffer when `STATIC`. When interaction resumes, flush the accumulation state and set framerate to 1-sample.

## Verification Steps

- [ ] Headlessly test the WebGPU shader to ensure that applying the sub-pixel uniform changes the iteration boundaries logically.
- [ ] Observe visually that stationary rendering progressively refines anti-aliased detail over 64+ frames.
- [ ] Observe visually that panning abruptly resets the accumulation buffer to raw 1-sample logic without frame dropping.
- [ ] **Documentation Sync:** Ensure the final implementation matches `docs/progressive-rendering-design.md`.
