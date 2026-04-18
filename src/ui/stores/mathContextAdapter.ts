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
  interactMaxIterOverride?: number | null,
): MathContext {
  const isPerturb = state.refOrbitNodes !== null && theme.precisionMode !== 'f32';

  const zr = isPerturb ? state.deltaZr : parseFloat(state.anchorZr) + state.deltaZr;
  const zi = isPerturb ? state.deltaZi : parseFloat(state.anchorZi) + state.deltaZi;
  const cr = isPerturb ? state.deltaCr : parseFloat(state.anchorCr) + state.deltaCr;
  const ci = isPerturb ? state.deltaCi : parseFloat(state.anchorCi) + state.deltaCi;

  const isInteracting = state.interactionState !== 'STATIC';

  const skipIter =
    canvasWidth > 0 && canvasHeight > 0
      ? calculateSkipIter(
          state.refOrbitNodes,
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
    ? interactMaxIterOverride !== undefined && interactMaxIterOverride !== null
      ? interactMaxIterOverride + skipIter
      : Math.min(
          state.paletteMaxIter,
          Math.max(interactFloor, Math.floor(state.paletteMaxIter * INTERACT_ITER_FRACTION)) +
            skipIter,
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
    refOrbitNodes: state.refOrbitNodes,
    refMetadata: state.refMetadata,
    refBlaGrid: state.refBlaGrid,
    skipIter,
    debugViewMode: state.debugViewMode,
  };
}
