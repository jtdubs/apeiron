import { calculateSkipIter } from '../../engine/seriesApproximation';
import { calculateMaxIter, type ViewportState } from './viewportStore';
import type { RenderState } from './renderStore';
import type { MathContext } from '../../engine/RenderFrameDescriptor';

const INTERACT_ITER_FRACTION = 0.33;

export function buildMathContext(
  state: ViewportState,
  theme: RenderState,
  canvasWidth: number,
  canvasHeight: number,
): MathContext {
  const isPerturb = state.refOrbits !== null && theme.precisionMode !== 'f32';

  const zr = isPerturb ? state.deltaZr : parseFloat(state.anchorZr) + state.deltaZr;
  const zi = isPerturb ? state.deltaZi : parseFloat(state.anchorZi) + state.deltaZi;
  const cr = isPerturb ? state.deltaCr : parseFloat(state.anchorCr) + state.deltaCr;
  const ci = isPerturb ? state.deltaCi : parseFloat(state.anchorCi) + state.deltaCi;

  const isInteracting = state.interactionState !== 'STATIC';

  const skipIter =
    canvasWidth > 0 && canvasHeight > 0
      ? calculateSkipIter(
          state.refOrbits,
          state.zoom,
          state.deltaCr,
          state.deltaCi,
          canvasWidth,
          canvasHeight,
          state.sliceAngle,
          theme.precisionMode,
        )
      : 0;

  const interactFloor = calculateMaxIter(1.0);
  const effectiveMaxIter = isInteracting
    ? Math.min(
        state.maxIter,
        Math.max(interactFloor, Math.floor(state.maxIter * INTERACT_ITER_FRACTION)) + skipIter,
      )
    : state.maxIter;

  return {
    zr,
    zi,
    cr,
    ci,
    zoom: state.zoom,
    maxIter: effectiveMaxIter,
    trueMaxIter: state.maxIter,
    sliceAngle: state.sliceAngle,
    exponent: state.exponent,
    refOrbits: state.refOrbits,
    skipIter,
  };
}
