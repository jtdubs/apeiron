---
status: closed
---

# Task 044: Frame-Time Telemetry & Interactive Quality Budget

## Objective

Eliminate the primary sources of interaction lag caused by interior-heavy fractal views by (a)
adding GPU frame-time instrumentation to `PassManager` so latency can be measured directly, and (b)
decoupling the `maxIter` value used during interaction from the full static-quality budget using a
zoom-proportional fraction, so the shader never runs the full iteration budget on pixels that will
be blurred by DRS anyway — without destroying depth structure at high zoom or causing jarring
transitions back to STATIC.

## Relevant Design Docs

- [docs/design/engine/temporal-pipeline.md](../../design/engine/temporal-pipeline.md)
- [docs/design/engine/webgpu-passes.md](../../design/engine/webgpu-passes.md)

## Background

At zoom ~1e-1, `calculateMaxIter` returns ~450 iterations. Interior pixels (those that never
escape) run the full shader loop with no early exit. On a high-resolution canvas with dense
interior coverage, a single accumulation frame can take 50–200 ms on the GPU, far exceeding the
16.67 ms frame budget.

The lag has two compounding sources:

1. **Wrong `maxIter` during interaction:** The same iteration cap drives the GPU cost for both the
   slow STATIC accumulation frames and the fast INTERACT frames, even though DRS already visually
   blurs the INTERACT output. A lower cap during interaction costs nothing perceptually — but the
   cap must scale with zoom. A fixed absolute cap (e.g. 200) would destroy all visible structure at
   deep zoom where `maxIter` may be 2000+. The correct primitive is a **zoom-proportional
   fraction**: reduce to a fraction of the full `maxIter`, floored at the base iteration count for
   an unzoomed view so the image never goes completely flat.

2. **One full-res STATIC frame blocks the INTERACT pipeline:** When the user touches the screen,
   `setInteractionState('INTERACT_SAFE')` fires synchronously, but the RAF loop was already
   mid-flight reading the old STATIC state. It already called `device.queue.submit()` with a
   full-resolution accumulation frame. The cheap DRS frame queues behind it. The canvas is frozen
   until the expensive GPU frame drains — proportional to interior coverage and current `maxIter`.

Neither deficiency is visible in the current code without measurement infrastructure.

## Requirements

- **GPU Timestamp Telemetry:** `PassManager` must optionally instrument the math accumulation pass
  with a `GPUQuerySet` of type `'timestamp'`. It must resolve timestamps asynchronously and expose
  a rolling `lastMathPassMs` getter so the callers can read GPU frame time without blocking.

- **HUD Debug Overlay:** The HUD must display the rolling GPU math-pass time (e.g. "GPU: 12.4 ms")
  when a debug flag is active, so interior-vs-exterior cost can be observed live.

- **Interactive maxIter Fraction:** `ApeironViewport.tsx`'s RAF loop must apply a zoom-proportional
  `effectiveMaxIter` when `interactionState !== 'STATIC'`. The formula is:

  ```ts
  const INTERACT_ITER_FRACTION = 0.33; // reduces budget to ~⅓ during interaction
  const INTERACT_ITER_FLOOR = calculateMaxIter(1.0); // never go below the unzoomed baseline
  const effectiveMaxIter = isInteracting
    ? Math.max(INTERACT_ITER_FLOOR, Math.floor(state.maxIter * INTERACT_ITER_FRACTION))
    : state.maxIter;
  ```

  Examples at representative zoom levels:
  - zoom 1.5 (default): `maxIter = 150` → `effectiveMaxIter = max(150, 49) = 150` (no change, already cheap)
  - zoom 1e-1: `maxIter = 450` → `effectiveMaxIter = max(150, 148) = 150` (3× reduction)
  - zoom 1e-3: `maxIter = 1050` → `effectiveMaxIter = max(150, 346) = 346` (3× reduction, still zoom-appropriate)
  - zoom 1e-5: `maxIter = 1650` → `effectiveMaxIter = max(150, 544) = 544` (3× reduction, preserves depth detail)
    The full `state.maxIter` value continues to be used for all STATIC accumulation frames.
    The fraction constant `INTERACT_ITER_FRACTION` should be a named constant at the top of
    `ApeironViewport.tsx` so it can be tuned based on telemetry results from Task 045.

- **Interaction-State Read Ordering Fix:** The RAF loop must read `interactionState` — and derive
  `renderScale` and `effectiveMaxIter` — immediately before calling `engine.renderFrame()`, not at
  the top of the loop body. This ensures that a `setInteractionState()` call that fires between the
  RAF start and the submit call will be honoured on the _same_ frame rather than the next one.
  (Note: due to JS single-threading, there is still a one-tick window; the primary benefit is
  eliminating the case where an early loop-body read races with an event handler that fires during
  the same microtask queue drain.)

## Implementation Plan

1. **Add `TimestampQuery` support to `PassManager`:**
   - In the constructor, attempt `device.createQuerySet({ type: 'timestamp', count: 2 })`. Wrap in
     a feature-detection guard (`device.features.has('timestamp-query')`); gracefully degrade to
     no-op if unsupported (e.g. Firefox, some mobile WebGPU implementations).
   - Allocate a `GPUBuffer` for query resolution (`QUERY_RESOLVE | COPY_SRC`, 16 bytes) and a
     staging buffer (`MAP_READ | COPY_DST`, 16 bytes).
   - In `render()`, wrap `accumPass.execute()` with `commandEncoder.writeTimestamp(query, 0)` and
     `commandEncoder.writeTimestamp(query, 1)`.
   - After `queue.submit()`, call `commandEncoder.resolveQuerySet()` then `copyBufferToBuffer()`
     into the staging buffer, then `device.queue.onSubmittedWorkDone().then(() => stagingBuffer.mapAsync(...))`.
   - Expose `get lastMathPassMs(): number` on `PassManager` (returns the most recently resolved
     value, or `-1` if not yet available).

2. **Wire telemetry into the HUD:**
   - Add a `showPerfHUD` flag to `renderStore` (default `false`).
   - When `true`, display `gpuMs` in a fixed-position overlay on the canvas (no React re-render hot
     path — read directly from `PassManager` ref inside the RAF loop and write to a DOM text node
     via a `useRef`-held element).

3. **Apply zoom-proportional `effectiveMaxIter` in the RAF loop (`ApeironViewport.tsx`):**
   - Add constants near the top of the `useEffect` closure:
     ```ts
     const INTERACT_ITER_FRACTION = 0.33;
     const INTERACT_ITER_FLOOR = calculateMaxIter(1.0);
     ```
   - Immediately before building the `RenderFrameDescriptor`, compute:
     ```ts
     const effectiveMaxIter = isInteracting
       ? Math.max(INTERACT_ITER_FLOOR, Math.floor(state.maxIter * INTERACT_ITER_FRACTION))
       : state.maxIter;
     ```
   - Pass `effectiveMaxIter` (not `state.maxIter`) as `maxIter` in the `RenderFrameDescriptor`.
   - Import `calculateMaxIter` from `viewportStore` for the floor calculation.

4. **Fix interaction-state read order in the RAF loop:**
   - Move the `interactionState` read, `isInteracting` computation, `renderScale` derivation, and
     `effectiveMaxIter` derivation to immediately before the `engine.renderFrame(desc)` call.
   - Ensure `geometryChanged` detection still uses the same snapshot (capture state once, use it
     consistently throughout the frame body).

5. **Verify with telemetry:** Confirm that GPU frame time drops proportionally when toggling the
   `effectiveMaxIter` fraction on/off at high interior coverage. At zoom = 1e-1, the ~3× iteration
   reduction should produce a measurable, roughly proportional GPU time reduction for interior-heavy
   scenes (exterior scenes will show little change, as they exit early anyway).

## Verification Steps

- [x] At zoom = 1e-1 with a dense Mandelbrot interior view, enable the perf HUD and confirm GPU
      math-pass time is reported and visible.
- [x] Confirm that GPU frame time during `INTERACT_SAFE` at zoom = 1e-1 is approximately ⅓ of the
      STATIC frame time for the same interior-heavy view (measured via the telemetry HUD).
- [x] Confirm that at zoom = 1e-5, the `effectiveMaxIter` is still high enough (≥ 500) that deep
      zoom structures remain visible during panning — no "everything goes black" regression.
- [x] Panning test: Touch the screen on a high-interior view and measure time-to-first-DRS-frame
      subjectively and via console timestamps. Should feel ≤ 1 RAF tick (~16 ms) of lag regardless
      of interior coverage.
- [x] Confirm `TimestampQuery` gracefully degrades: disable the feature flag and verify no errors
      and `lastMathPassMs === -1`.
- [x] **Documentation Sync:** Update `docs/design/engine/temporal-pipeline.md` to document the
      zoom-proportional interactive `maxIter` fraction policy and the telemetry architecture.
