---
status: open
---

# Task 031: Progressive Rendering State Machine

## Objective

Implement the Temporal Supersampling (multi-frame ping-pong accumulation) pipeline in WebGPU and the Asynchronous Orchestration Protocol in the UI to maintain high visual fidelity and 60fps fluidity during deep zoom interactions.

## Relevant Design Docs

- [Progressive Rendering & Performance Design](../progressive-rendering-design.md)

## Requirements

- **Render Quality State Machine:** The frontend must track and pivot between three states: `STATIC` (debounced pause, executing accumulation), `INTERACT_SAFE` (in-bounds panning, 1-sample-per-pixel), and `INTERACT_FAST` (out-of-bounds speed panning, pure 2D scaling fallback).
- **Temporal Accumulation:** WebGPU must support a ping-pong buffer approach where it averages sub-pixel shifted samples over multiple frames while the user is inactive (`STATIC`).
- **Latest-Only Dispatch Buffer:** Prevent WASM worker queue starvation by only passing the freshest interaction coordinates to the arbitrary-precision engine after the worker finishes its current cycle.

## Implementation Plan

1. **Frontend Orchestration:** Update the frontend Zustand and Web Worker communication logic to strictly implement the "Latest-Only" dispatch pattern. Add `isInteracting` debounced state flags.
2. **WebGPU Accumulation Architecture:** Modify the `PassManager` to hold two alternating render targets (Buffer A and Buffer B). Introduce a `frame_count` uniform or equivalent accumulator mechanism.
3. **Sub-pixel Jitter in Compute:** Update the compute shader to apply sub-pixel offsetting based on the current interaction or accumulation phase.
4. **Resolve Pass Update:** Update the accumulation logic to mix `1.0 / frame_count` weighting into the ping-pong buffer when `STATIC`. When interaction resumes, flush the accumulation state and set framerate to 1-sample.

## Verification Steps

- [ ] Write a Vitest frontend worker test to validate that the Last-Only Dispatch Buffer accurately drops intermediate panning events and never queues more than 1 job on the Web Worker.
- [ ] Headlessly test the WebGPU shader to ensure that applying the sub-pixel uniform changes the iteration boundaries logically.
- [ ] Observe visually that stationary rendering progressively refines anti-aliased detail over 64+ frames.
- [ ] Observe visually that panning abruptly resets the accumulation buffer to raw 1-sample logic without frame dropping.
- [ ] **Documentation Sync:** Ensure the final implementation matches `docs/progressive-rendering-design.md`.
