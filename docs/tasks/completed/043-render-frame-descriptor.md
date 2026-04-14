---
status: closed
---

# Task 043: RenderFrameDescriptor — Typed Engine Contract

## Objective

Replace all positional-parameter passing, string-based state diffing, and implicit coupling
between the RAF loop and the GPU engine with a single typed `RenderFrameDescriptor` struct.
Move accumulation state management entirely into the RAF loop, leaving the engine as a pure
executor that receives explicit, pre-computed rendering intent.

## Relevant Design Docs

- `docs/rendering-engine-design.md`

## Background & Motivation

Four compounding fragilities exist in the current STATIC/INTERACT rendering pipeline:

1. **String-based state diffing** — `renderStateKey` and `camState` build large strings every
   RAF tick to detect changes. This is allocation-heavy, ordering-sensitive, and semantically
   opaque — a field added in the wrong position silently does nothing.

2. **`frameCount` conflates two concerns** — it simultaneously means _temporal blend weight_
   (`1/N` in the shader's `mix()`) and _accumulation progress gate_ (RAF loop's `<= 64`
   check). These are independent concerns that share one variable, causing the
   STATIC→INTERACT transition bug (ticket closed via `passFrameCount` workaround).

3. **`render_scale` straddles two uniform buffers via a hardcoded byte offset** — the resolve
   shader reads `render_scale` from `ResolveUniforms` at hardcoded byte offset 116, while
   `buildPaletteUniforms` writes `0.0` there and PassManager overwrites it separately. Any
   palette struct refactor risks silently breaking this.

4. **PassManager has hidden internal state the RAF loop cannot inspect** — `needsMathUpdate`,
   `lastCameraState`, `lastThemeVersion` are invisible to the caller, making the system hard
   to reason about and test.

## Requirements

- **`RenderFrameDescriptor` struct:** A new file `src/engine/RenderFrameDescriptor.ts`
  defines the typed contract between the RAF loop and the engine. All fields are explicit and
  named. No positional parameter lists.

- **Explicit `blendWeight`:** Replace `frameCount` in the engine API with `blendWeight: number`
  (range `0.0`–`1.0`). `0.0` = discard prev buffer entirely (first frame, INTERACT).
  Values like `1/N` drive progressive STATIC accumulation. The engine passes this directly to
  the WGSL `mix()` call (replacing `1.0 / camera.frame_count`). The RAF loop computes it.

- **All accumulation state in RAF loop:** The RAF loop owns `accumulationCount` (replaces
  `frameCount`). Reset is a single unconditional `accumulationCount = 0` when geometry changes
  or mode transitions to INTERACT. No `passFrameCount` workaround needed.

- **`render_scale` moved to camera uniform only:** `render_scale` is removed from
  `ResolveUniforms` and the palette buffer. It is already present in `CameraParams` (the
  accumulation uniform). The resolve shader receives `render_scale` by being added to
  bind group 0 (sharing the camera uniform buffer) OR via a small dedicated uniform. The
  magic byte-offset `writeBuffer(116, ...)` is eliminated.

- **`PassManager.render()` accepts `RenderFrameDescriptor`:** The 15-arg positional signature
  is replaced with a single typed struct argument (plus `targetView`, `width`, `height` which
  are infrastructure, not per-frame intent).

- **`interactionState` removed from engine API:** The engine does not need to know the
  semantic mode name. It receives `renderScale` and `blendWeight` — the operational
  consequences — not the mode label. `interactionState` stays in `viewportStore` for the
  RAF loop to read.

- **String diffs eliminated:** `renderStateKey` and `camState` are deleted. Change detection
  uses version counters (matching the existing `themeVersion` pattern) or shallow field
  equality on the descriptor struct.

- **All existing tests continue to pass.**

## Implementation Plan

1. **`src/engine/RenderFrameDescriptor.ts`** — Define and export the struct:

   ```ts
   export interface RenderFrameDescriptor {
     zr: number;
     zi: number;
     cr: number;
     ci: number;
     zoom: number;
     maxIter: number;
     sliceAngle: number;
     exponent: number;
     refOrbits: Float64Array | null;
     renderScale: number;
     blendWeight: number; // 0.0 = replace, >0 = temporal blend fraction
     jitterX: number;
     jitterY: number;
     theme: RenderState;
   }
   ```

2. **`src/engine/shaders/escape/math_accum.wgsl`** — Replace `frame_count: f32` with
   `blend_weight: f32` in `CameraParams`. Update the temporal blend line:

   ```wgsl
   // OLD:
   return mix(prev, ret, 1.0 / camera.frame_count);
   // NEW:
   return select(ret, mix(prev, ret, camera.blend_weight), camera.blend_weight > 0.0);
   ```

   Using `select` instead of `mix` avoids sampling `prev_frame` entirely when
   `blend_weight == 0.0`, which is the correct behaviour for the first INTERACT frame.

3. **`src/engine/shaders/escape/resolve_present.wgsl`** — Move `render_scale` out of
   `ResolveUniforms` (group 1). Instead, add a minimal second uniform in group 0:

   ```wgsl
   @group(0) @binding(5) var<uniform> frame_params: FrameParams;
   struct FrameParams { render_scale: f32 };
   ```

   OR reuse the existing camera uniform buffer by adding a binding alias for it in
   the resolve pass's bind group layout. Evaluate the simpler option during implementation.

4. **`src/engine/uniforms.ts`** — Update `buildCameraUniforms()`: rename `frameCount` →
   `blendWeight`, ensuring the 64-byte struct layout is preserved (same field count, same
   offsets except the renamed slot).

5. **`src/engine/PassManager.ts`**:
   - Change `AccumulationPass.execute()` to use `blend_weight` uniform semantics.
   - Change `PassManager.render()` signature to `render(targetView, width, height, desc: RenderFrameDescriptor)`.
   - Delete `camState` string, `lastCameraState`, `needsMathUpdate` flag. Replace with
     shallow descriptor comparison or a per-field version counter.
   - Delete the magic `writeBuffer(paletteUniformsBuffer, 116, ...)` call for `render_scale`.
   - The accumulation pass always runs when `desc` contains new data (determined by the
     comparison); the skip logic moves to the RAF loop.

6. **`src/engine/initEngine.ts`** — Update `ApeironEngine.renderFrame` interface to accept
   `RenderFrameDescriptor`.

7. **`src/ui/components/ApeironViewport.tsx`**:
   - Delete `renderStateKey`, `lastRenderStateKey`, `lastBaseGeometryKey` strings.
   - Add `accumulationCount: number` local variable (replaces `frameCount`).
   - On each RAF tick, compute `blendWeight` and `jitter` from `accumulationCount` and
     `interactionState`, construct `RenderFrameDescriptor`, and call `engine.renderFrame(desc)`.
   - Skip submission when `accumulationCount >= 64 && interactionState === 'STATIC'` and
     the descriptor is identical to the previous frame (no re-rendering needed).

8. **Update tests** — `PassManager.spec.ts` and `ApeironViewport.spec.tsx` update signatures
   and assertions to match the new descriptor-based API.

## Verification Steps

- [ ] `npm run test:engine` — 5 deno tests pass (no uniform buffer layout regressions,
      no NaN/Inf from blend weight math).
- [ ] `npm run test:ui` — 13 tests pass.
- [ ] **No string concatenation in RAF hot path** — verify `renderStateKey` and `camState`
      strings are gone from `ApeironViewport.tsx` and `PassManager.ts`.
- [ ] **First pan frame is clean** — no 1-frame tile glitch (the `blendWeight=0.0` on
      INTERACT frames replaces the `passFrameCount` workaround explicitly).
- [ ] **Documentation Sync:** Did this implementation drift from the original plan? If so,
      update `docs/rendering-engine-design.md` before closing this task.
