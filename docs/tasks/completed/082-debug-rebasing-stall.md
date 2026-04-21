---
status: closed
---

# Task 082: Debug REBASING_WAIT Stall on f32 to f32p Transition

## Objective

Diagnose and fix a >1-minute pipeline stall and subsequent incorrect visual rendering when zooming past the `1e-4` magnification threshold (transitioning from `f32` to `f32p` calculation precision) at `c = -1.78643`.

## Problem Statement

When exploring a minibrot centered at `c = -1.78643`:

1. At `zoom = 1.05e-4` (f32 mode), rendering works and no glitches are reported.
2. Changing `zoom` to `9.95e-5` triggers a precision threshold crossing into `f32p` (Perturbation mode).
3. The Temporal Pipeline FSM enters `REBASING_WAIT`.
4. The engine hangs for over 1 minute without any visible progress.
5. The pipeline eventually switches to `f32p`, performs `DEEPENING` and `ACCUMULATING`, but the output drawing is entirely incorrect.

## Root Cause Hypotheses

1. **Rust Infinite Loop / Slow Path**: The Rust math worker is attempting to find a new reference orbit or nucleus for the `f32p` regime and is hitting an extreme edge-case in Brent's Algorithm or its reference solver, taking 60+ seconds.
2. **Bad Reference Orbit Hand-off**: The $c$-coordinate sent to the mathematical worker might be improperly formatted or missing precision beyond `f32`, leading the reference orbit finder to pick a chaotic boundary that doesn't appropriately cover the target minibrot.
3. **Orchestrator Deadlock**: A race condition or dropped tick in `ProgressiveRenderScheduler.ts` keeping the FSM in `REBASING_WAIT` longer than necessary, culminating in an incorrect epoch merge.

## Verification Setup (TDD)

Before modifying logic, we will:

1. Write a Headless Deno test to spawn the Math Engine.
2. Dispatch a `RenderFrameDescriptor` with $c=-1.78643$ and $zoom=1.05e-4$.
3. Dispatch a second context to simulate the threshold crossing $zoom=9.95e-5$.
4. Await the worker. Measure execution time and validate that the output `ReferenceTreeArray` bounds align with the expected result in under ~200ms.

## Links to Design Docs

- `docs/best-practices.md`
- `docs/design/engine/temporal-pipeline.md`
- `docs/tasks/completed/079-multi-reference-neighborhood-rendering.md`

## Implementation Plan

1. Research implementation of `REBASING_WAIT` and `f32` -> `f32p` transition in `ProgressiveRenderScheduler.ts`.
2. Inspect Rust math backend (`rust-math/src/solvers.rs` or `reference_tree.rs`) for orbit calculation slow paths.
3. Write `tests/engine/RebasingStall.deno.ts` to reproduce the stall.
4. Execute test, fix the identified anomaly, and confirm mathematical correctness.
