---
status: open
---

# Task 047: Execution Checkpointing

## Objective

Slice monolithic GPU math kernels into budget-limited chunks so the main thread
is never blocked for more than ~14 ms during `STATIC` mode rendering, while
preserving correct temporal accumulation (jitter-based anti-aliasing across
multiple full-resolution passes).

## Relevant Design Docs

- `docs/progressive-rendering-design.md`
- `docs/rendering-engine-design.md`

## Core Design

### GPU Resources

| Resource        | Type                        | Purpose                                                                 |
| --------------- | --------------------------- | ----------------------------------------------------------------------- |
| `gBufferAccumA` | `rgba16float` texture       | One side of ping-pong accumulation pair                                 |
| `gBufferAccumB` | `rgba16float` texture       | Other side of ping-pong accumulation pair                               |
| `checkpoint`    | Storage buffer (32 B/pixel) | Per-pixel iteration state; doubles as escape-result store once complete |

No additional "work" buffer is needed. The existing ping-pong pair serves all
purposes. The critical fix vs. the original design is **controlling when the
ping-pong advances**: once per complete deepening cycle, not once per frame.

### Ping-Pong Discipline

```
Cycle N start:
  flip ping-pong  →  writeTex = AccumB,  readTex = AccumA
  clearBuffer(checkpoint)          ← zero all iter fields
  isResume = 1  (even for first slice — incomplete pixels show readTex)

Each INTERMEDIATE deepening slice:
  math pass → AccumB
    cp.iter >= 0  (still computing this cycle)
      → run iterations
        escaped / hit max_iter  → store escape vec4 in checkpoint.{zx,zy,der_x,der_y}
                                   mark checkpoint.iter = -1
                                   write escape_data to AccumB
        still incomplete        → update checkpoint state
                                   write textureLoad(AccumA) to AccumB
    cp.iter == -1  (completed in a prior slice this cycle)
      → write textureLoad(AccumA) to AccumB
        (shows committed previous cycle; no blend yet)

FINAL deepening slice  (is_final_slice = 1):
  math pass → AccumB
    cp.iter >= 0  (completes on this slice)
      → compute → apply temporal blend → write mix(AccumA, result, 1/N)
    cp.iter == -1  (completed in an earlier slice; result stored in checkpoint)
      → read escape vec4 from checkpoint.{zx,zy,der_x,der_y}
         apply temporal blend → write mix(AccumA, stored_result, 1/N)

Display: resolve always reads AccumB
  - During deepening: AccumB = escape_data for done pixels + AccumA passthrough
    for in-progress pixels → coherent progressive display
  - After final slice: AccumB = correctly blended N-cycle average for ALL pixels
```

### Why this is correct

- `AccumA` (readTex) is **frozen for the entire cycle** — it always holds
  `avg_{N-1}` and is never written during deepening. The final-slice blend
  `mix(AccumA, current_result, 1/N)` therefore always operates against the
  correct committed reference.
- Pixels completing on **non-final slices** store their escape vec4 in the
  checkpoint struct (reusing the `zx/zy/der_x/der_y` fields, which are no
  longer needed once `iter = -1`). The final slice re-reads this stored result
  and applies the temporal blend. Every pixel participates in every blend,
  regardless of which slice it completed on.
- No separate blend pass or third texture is required.

### CheckpointState dual-use

```wgsl
struct CheckpointState {
  // When iter >= 0 (still computing):
  //   zx, zy      = current z
  //   der_x, der_y = current derivative
  // When iter == -1 (complete):
  //   zx, zy, der_x, der_y = stored escape vec4 (result.xyzw)
  zx: f32, zy: f32,
  der_x: f32, der_y: f32,
  iter: f32,       // -1 = complete, >=0 = current iteration count
  tia_sum: f32,    // trap-integral accumulator
  dz_x: f32, dz_y: f32,  // perturbation delta-z
};
```

### New CameraParams uniforms

```wgsl
yield_iter_limit: f32,   // max iterations to run per pixel this slice
is_resume:        f32,   // 1.0 → load checkpoint; 0.0 → start fresh (unused now — always 1 after cycle 1)
is_final_slice:   f32,   // 1.0 → apply temporal blend; 0.0 → passthrough only
canvas_width:     f32,   // pixel_id = y * canvas_width + x
```

`blend_weight` (1/N for the Nth cycle's final slice) is passed separately.
On non-final slices `blend_weight` is always 0 and the blend path is skipped
entirely.

## Requirements

- **Iteration Budget Controller:** `IterationBudgetController` class in
  `src/engine/IterationBudgetController.ts` handling the coast-line variance:
  - `update(gpuMs, isFirstSlice): number`: Ramp-up (+500/frame) ONLY permitted
    when `isFirstSlice` is true and after 3 consecutive fast frames. Decreases
    (-1500) trigger on ANY slice that spikes above 1.1x target.
  - `reset()`: aggressively floors the budget (e.g., 1000) so a new `INTERACT`
    or a new accumulation cycle doesn't blindly apply an inflated budget from
    a previous mostly-escaped late cycle.
  - Clamp to `[500, 5000]`.

- **Ping-pong advances once per cycle:** `PassManager.render()` must flip
  the ping-pong only when `desc.advancePingPong === true`. The orchestrator
  sets this flag exactly once at the start of each new deepening cycle
  (`deepeningTotalIter === 0`).

- **Checkpoint cleared at cycle start:** When `desc.clearCheckpoint === true`,
  `commandEncoder.clearBuffer(checkpointBuffer)` is called before the math
  pass so stale `iter = -1` sentinels from the previous cycle do not suppress
  recomputation with the new jitter offset.

- **Escape result stored in checkpoint:** Both `continue_mandelbrot_iterations`
  and `calculate_perturbation` must write `escape_data` into
  `checkpoint[px].{zx, zy, der_x, der_y}` and set `checkpoint[px].iter = -1`
  whenever a pixel completes. This enables the final-slice re-read.

- **Passthrough on non-final slices:** In `fs_main`, when `cp.iter < 0` and
  `is_final_slice < 0.5`, write `textureLoad(prev_frame, coord, 0)` directly
  (no blend). `prev_frame` binding is `readTex` (AccumA — the frozen committed
  reference for this cycle).

- **Blend on final slice:** In `fs_main`, when `is_final_slice > 0.5`:
  - `cp.iter < 0` → `ret = vec4(cp.zx, cp.zy, cp.der_x, cp.der_y)`
  - `cp.iter >= 0` → run math to completion → `ret = escape_data`
  - Apply: `mix(textureLoad(prev_frame, coord, 0), ret, blend_weight)`
  - `blend_weight = 0` on the very first cycle (accumulationCount = 0)
    so the first frame simply overwrites.

- **`RenderFrameDescriptor` additions:**

  ```ts
  yieldIterLimit: number; // max iters this slice
  isResume: number; // always 1.0 after first cycle ever
  isFinalSlice: boolean; // true → apply blend; false → passthrough
  advancePingPong: boolean; // true → flip ping-pong before math pass
  clearCheckpoint: boolean; // true → clearBuffer before math pass
  blendWeight: number; // 1/N for cycle N; 0 for first cycle
  ```

- **HUD diagnostics** (when `showPerfHUD`):

  ```
  Mode:    INTERACT | DEEPENING | ACCUMULATING
  GPU:     <math-pass ms>
  Budget:  <IterationBudgetController unclamped target>
  Slice:   <clamped iters this pass>
  Deepen:  <pct>%  (<numerator> / <effectiveMaxIter>)
  Accum:   <count> / <MAX_ACCUM_FRAMES>
  ```

  Capture `hudDeepenNumerator` **before** resetting `deepeningTotalIter` so
  the HUD shows 100% on the completion frame rather than the reset value.

- **No blending outside the final-slice path:** The math pass must never
  call `mix(prev_frame, …)` except when `is_final_slice > 0.5`.

## Implementation Plan

1. **`IterationBudgetController.ts`** — implement and unit-test in isolation
   (only ramp-up on `isFirstSlice`, drop on any slice, floor on `reset()`, clamp boundaries).

2. **`math_accum.wgsl`:**
   - Add `CheckpointState` struct and `checkpoint` storage buffer at `@binding(5)`
   - Rename `prev_frame` binding to reflect its role: still `@binding(4)`,
     but it is now the frozen cycle-start readTex (AccumA)
   - Add `yield_iter_limit`, `is_resume`, `is_final_slice`, `canvas_width`
     to `CameraParams`; remove `blend_weight` from `CameraParams` — it is
     passed via a separate uniform or piggy-backed on `is_final_slice`
     (see step 4 for how `blend_weight` is communicated)
   - In both math functions: when a pixel completes, store escape vec4 into
     `checkpoint[px].{zx,zy,der_x,der_y}` and set `checkpoint[px].iter = -1`
   - In `fs_main`: implement the passthrough / final-blend logic above
   - Remove the old `blend_weight > 0` path from `fs_main`

3. **`uniforms.ts`** — extend `buildCameraUniforms` with the new fields;
   keep `blend_weight` as a uniform field (it can stay in `CameraParams` —
   it is simply always 0 except on the final slice).

4. **`PassManager.ts`:**
   - The ping-pong pair remains (`gBufferTextureA`, `gBufferTextureB`) but
     the flip is now gated on `desc.advancePingPong`
   - Allocate `checkpointBuffer` (`STORAGE | COPY_DST`, 32 B × width × height)
   - Add checkpoint buffer to the `AccumulationPass` bind group at binding 5
   - Call `commandEncoder.clearBuffer(checkpointBuffer)` when
     `desc.clearCheckpoint`

5. **`RenderFrameDescriptor.ts`** — add the six new fields listed above.

6. **`ApeironViewport.tsx` orchestration:**
   - Track `deepeningTotalIter: number` and `accumulationCount: number` as
     closure-scoped `let` variables inside the RAF loop ref
   - Per-frame logic (STATIC mode):
     ```
     isFirstSlice    = (deepeningTotalIter === 0)
     rawBudget       = budgetController.update(engine.getMathPassMs(), isFirstSlice)
     yieldIterLimit  = min(effectiveMaxIter − deepeningTotalIter, rawBudget)
     advancePingPong = isFirstSlice
     clearCheckpoint = (isFirstSlice && accumulationCount > 0)
     isDeepeningComplete = deepeningTotalIter + yieldIterLimit >= effectiveMaxIter
     isFinalSlice    = isDeepeningComplete
     blendWeight     = (isFinalSlice && accumulationCount > 0)
                         ? 1 / (accumulationCount + 1)
                         : 0
     isResume        = (accumulationCount > 0 || deepeningTotalIter > 0) ? 1.0 : 0.0
     ```
   - After `engine.renderFrame(desc)`, capture HUD values, then mutate state:
     ```
     deepeningTotalIter += yieldIterLimit
     if isDeepeningComplete:
       deepeningTotalIter = 0
       accumulationCount++
     ```
   - On INTERACT entry: `deepeningTotalIter = 0; accumulationCount = 0`
   - Jitter: apply new random jitter when `advancePingPong && accumulationCount > 0`;
     use `(0, 0)` for the very first cycle

7. **`WebGPUTestHarness.ts`** — extend inline camera uniform to 80 bytes;
   bind checkpoint buffer at binding 5; set `advancePingPong: true`,
   `clearCheckpoint: false`, `isFinalSlice: true`, `blendWeight: 0` for
   single-shot headless tests.

8. **Regression snapshots** — run `npm run test:update` after GPU tests pass
   to regenerate bit-perfect snapshots.

## Verification Steps

- [ ] `IterationBudgetController` unit tests pass (ramp-up, spike, clamp).
- [ ] All 6 headless GPU tests pass (fuzzy match, deep-zoom, accumulation,
      interior black-hole, f32 early-outs, bit-perfect regression).
- [ ] Browser smoke test with `showPerfHUD` at zoom ≈ 5e-2 (STATIC): - GPU frame time ≤ ~14 ms throughout - Budget stays in `[500, 5000]` - Slice = Budget on non-final slices; Slice < Budget on final slice - Deepen reaches 100% before each Accum increment - Accum counts monotonically 0 → 64 - No flickering: interior pixels stay black; boundary pixels converge
      smoothly to a stable color
- [ ] **Documentation Sync:** Update `docs/progressive-rendering-design.md`
      with the final ping-pong-discipline diagram before closing this task.
