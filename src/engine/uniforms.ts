import type { RenderState } from '../ui/stores/renderStore';

export function buildCameraUniforms(
  zr: number,
  zi: number,
  cr: number,
  ci: number,
  scale: number,
  aspectRatio: number,
  maxIter: number,
  sliceAngle: number,
  exponent: number,
  jitterX: number,
  jitterY: number,
  blendWeight: number,
  hasValidActiveRefOrbits: boolean,
  refOrbitsLength: number | undefined,
  renderScale: number,
  yieldIterLimit: number,
  isResume: number,
  isFinalSlice: boolean,
  canvasWidth: number,
  theme?: RenderState,
): Float32Array {
  let actualRefMaxIter = maxIter;
  if (hasValidActiveRefOrbits && refOrbitsLength !== undefined) {
    actualRefMaxIter = (refOrbitsLength - 8) / 8;
  }

  let usePerturbationAllowed = true;
  if (theme && theme.precisionMode === 'f32') {
    usePerturbationAllowed = false;
  }
  const usePerturbation = hasValidActiveRefOrbits && usePerturbationAllowed ? 1.0 : 0.0;

  return new Float32Array([
    zr,
    zi,
    cr,
    ci,
    scale,
    aspectRatio,
    maxIter,
    sliceAngle,
    usePerturbation,
    actualRefMaxIter,
    exponent,
    theme?.coloringMode === 'stripe' ? 1.0 : theme?.coloringMode === 'banded' ? 2.0 : 0.0,
    jitterX,
    jitterY,
    blendWeight,
    renderScale,
    yieldIterLimit,
    isResume,
    isFinalSlice ? 1.0 : 0.0,
    canvasWidth,
  ]);
}

export function buildPaletteUniforms(
  theme: RenderState | undefined,
  paletteMaxIter: number,
  trueMaxIter: number,
): Float32Array {
  if (!theme) {
    // Return a default palette fallback if no theme provided
    const fallback = new Float32Array(32);
    fallback[12] = paletteMaxIter;
    fallback[31] = trueMaxIter;
    return fallback;
  }

  let surfaceParamA = 1.0;
  let surfaceParamB = 1.0;
  if (theme.surfaceMode === 'soft-glow') {
    surfaceParamA = theme.glowFalloff ?? 20.0;
    surfaceParamB = theme.glowScatter ?? 1.0;
  } else if (theme.surfaceMode === 'contours') {
    surfaceParamA = theme.contourFrequency ?? 20.0;
    surfaceParamB = theme.contourThickness ?? 0.8;
  }

  return new Float32Array([
    ...(theme.paletteA || [0, 0, 0]),
    0.0, // pad
    ...(theme.paletteB || [0, 0, 0]),
    0.0,
    ...(theme.paletteC || [0, 0, 0]),
    0.0,
    ...(theme.paletteD || [0, 0, 0]),
    0.0,
    paletteMaxIter,
    theme.lightAzimuth ?? 0,
    theme.lightElevation ?? 0,
    theme.diffuse ?? 0,
    theme.shininess ?? 0,
    theme.heightScale ?? 0,
    theme.ambient ?? 0,
    theme.coloringMode === 'stripe' ? 1.0 : theme.coloringMode === 'banded' ? 2.0 : 0.0,
    theme.colorDensity ?? 3.0,
    theme.colorPhase ?? 0.0,
    theme.surfaceMode === 'off'
      ? 0.0
      : theme.surfaceMode === 'soft-glow'
        ? 2.0
        : theme.surfaceMode === 'contours'
          ? 3.0
          : 1.0,
    surfaceParamA,
    surfaceParamB,
    trueMaxIter,
  ]);
}
