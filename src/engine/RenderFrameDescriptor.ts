import type { RenderState } from '../ui/stores/renderStore';

/**
 * The typed contract between the RAF loop and the GPU engine.
 *
 * Replaces the 15-argument positional renderFrame() signature and all
 * string-based state diffing. The RAF loop is responsible for computing
 * every field — including blendWeight and jitter — before handing this
 * to the engine. The engine is a pure executor: it receives explicit
 * rendering intent and submits GPU work accordingly.
 */
export interface RenderFrameDescriptor {
  // ── Viewport / fractal math ──────────────────────────────────────────
  zr: number;
  zi: number;
  cr: number;
  ci: number;
  zoom: number;
  maxIter: number;
  sliceAngle: number;
  exponent: number;
  refOrbits: Float64Array | null;

  // ── Dynamic Resolution Scaling ───────────────────────────────────────
  /** 1.0 = full native resolution (STATIC). <1.0 = DRS sub-rect (INTERACT). */
  renderScale: number;

  // ── Temporal accumulation ────────────────────────────────────────────
  /**
   * Blend weight for ping-pong temporal accumulation in the shader:
   *   - 0.0  → replace prev buffer entirely (first frame, or any INTERACT frame)
   *   - 1/N  → blend: mix(prev, current, 1/N) for the Nth accumulated frame
   *
   * The RAF loop computes this from its own accumulationCount.
   * The engine passes it directly to the WGSL mix() call via the uniform.
   */
  blendWeight: number;

  /** Sub-pixel jitter offsets in UV space. 0.0 when blendWeight == 0. */
  jitterX: number;
  jitterY: number;

  // ── Theme / aesthetics ───────────────────────────────────────────────
  theme: RenderState;
}
