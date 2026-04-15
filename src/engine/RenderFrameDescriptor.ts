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
  maxIter: number; // The interactive/effective max iteration cap
  trueMaxIter: number; // The target static max iteration cap (used for consistent palette mapping)
  sliceAngle: number;
  exponent: number;
  refOrbits: Float64Array | null;
  skipIter: number;

  // ── Dynamic Resolution Scaling ───────────────────────────────────────
  /** 1.0 = full native resolution (STATIC). <1.0 = DRS sub-rect (INTERACT). */
  renderScale: number;

  // ── Temporal accumulation & Checkpointing ────────────────────────────
  /** Max iterations to compute this frame slice (clamped by IterationBudgetController) */
  yieldIterLimit: number;
  /** 1.0 = load struct from checkpoint; 0.0 = clear & start fresh. (Always 1.0 after cycle 1 starts) */
  isResume: number;
  /** If true, this is the final slice of the current cycle. Apply temporal blend. */
  isFinalSlice: boolean;
  /** If true, flip the ping-pong buffer before running the math pass (only once per cycle). */
  advancePingPong: boolean;
  /** If true, clear the checkpoint buffer before running the math pass (only once per cycle start). */
  clearCheckpoint: boolean;

  /**
   * Blend weight for ping-pong temporal accumulation in the shader:
   *   - 0.0  → replace prev buffer entirely (first cycle, or any INTERACT frame)
   *   - 1/N  → blend: mix(prev, current, 1/N) for the Nth accumulated cycle
   * Only applied when `isFinalSlice` is true.
   */
  blendWeight: number;

  /** Sub-pixel jitter offsets in UV space. 0.0 when blendWeight == 0. */
  jitterX: number;
  jitterY: number;

  // ── Theme / aesthetics ───────────────────────────────────────────────
  theme: RenderState;
}
