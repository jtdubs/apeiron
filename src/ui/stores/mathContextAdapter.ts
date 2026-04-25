import { calculateMaxIter, type ViewportState } from './viewportStore';
import type { RenderState } from './renderStore';
import type { MathContext } from '../../engine/RenderFrameDescriptor';

const INTERACT_ITER_FRACTION = 0.33;

export function buildMathContext(
  state: ViewportState,
  _theme: RenderState,
  interactMaxIterOverride?: number | null,
  effectiveMathMode: number = 0,
): MathContext {
  const zr = parseFloat(state.anchorZr) + state.deltaZr;
  const zi = parseFloat(state.anchorZi) + state.deltaZi;
  const cr = parseFloat(state.anchorCr) + state.deltaCr;
  const ci = parseFloat(state.anchorCi) + state.deltaCi;

  const isInteracting = state.interactionState !== 'STATIC';

  // Series approximation / skip iter are disabled for the MVP, or we can just leave skipIter as 0.
  const skipIter = 0;

  const interactFloor = calculateMaxIter(1.0);
  const effectiveMaxIter = isInteracting
    ? interactMaxIterOverride !== undefined && interactMaxIterOverride !== null
      ? interactMaxIterOverride
      : Math.min(
          state.paletteMaxIter,
          Math.max(interactFloor, Math.floor(state.paletteMaxIter * INTERACT_ITER_FRACTION)),
        )
    : state.paletteMaxIter;

  return {
    zr,
    zi,
    cr,
    ci,
    computeMaxIter: effectiveMaxIter,
    paletteMaxIter: state.paletteMaxIter,
    zoom: state.zoom,
    sliceAngle: state.sliceAngle,
    exponent: state.exponent,
    effectiveMathMode,
    skipIter,
    debugViewMode: state.debugViewMode,
  };
}
