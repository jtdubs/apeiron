import { describe, it, expect } from 'vitest';
import { buildCameraUniforms, buildPaletteUniforms } from '../uniforms';
import type { RenderState } from '../../ui/stores/renderStore';

describe('PassManager Pure Function Uniform Building', () => {
  it('correctly calculates actualRefMaxIter for the uniform buffer from rust refOrbits padding', () => {
    const expectedMaxIter = 10;
    const rustBufferLength = expectedMaxIter * 2 + 8;

    const uniforms = buildCameraUniforms(
      0,
      0,
      -1.0,
      0.0,
      1e-5,
      1.33,
      expectedMaxIter,
      0,
      2.0,
      0.0,
      0.0,
      1.0,
      true,
      rustBufferLength,
      undefined,
    );

    // Uniforms mapping:
    // [0-3]: Coordinates (zr, zi, cr, ci)
    // [4]: Scale
    // [5]: AspectRatio
    // [6]: maxIter
    // [7]: sliceAngle
    // [8]: usePerturbation
    // [9]: actualRefMaxIter
    // [10]: exponent
    // [11]: coloringMode

    expect(uniforms[9]).toBe(expectedMaxIter);
    expect(uniforms[8]).toBe(1.0); // usePerturbation true by default if valid active ref orbits and no f32 mode
  });

  it('disables perturbation when precisionMode is f32', () => {
    const theme = { precisionMode: 'f32' } as RenderState;
    const uniforms = buildCameraUniforms(
      0,
      0,
      -1.0,
      0.0,
      1e-5,
      1.33,
      100,
      0,
      2.0,
      0.0,
      0.0,
      1.0,
      true,
      208,
      theme,
    );
    expect(uniforms[8]).toBe(0.0);
  });

  it('builds pure palette uniforms with correct padding and flags', () => {
    const theme = {
      themeVersion: 1,
      paletteA: [1.0, 0.5, 0.0],
      paletteB: [0.0, 1.0, 0.5],
      paletteC: [0.5, 0.0, 1.0],
      paletteD: [1.0, 1.0, 1.0],
      paletteName: 'test',
      lightAzimuth: 10,
      lightElevation: 20,
      diffuse: 1.0,
      shininess: 32.0,
      heightScale: 0.1,
      ambient: 0.2,
      precisionMode: 'perturbation',
      coloringMode: 'stripe',
      surfaceMode: 'soft-glow',
      glowFalloff: 15.0,
      glowScatter: 2.0,
      contourFrequency: 20.0,
      contourThickness: 0.8,
      colorDensity: 3.0,
      colorPhase: 1.0,
    } as RenderState;

    const maxIter = 150;
    const uniforms = buildPaletteUniforms(theme, maxIter);

    // [0-2]: paletteA, [3]: pad
    expect(uniforms[0]).toBe(1.0);
    expect(uniforms[3]).toBe(0.0);
    // [16]: paletteMaxIter
    expect(uniforms[16]).toBe(150);
    // [23]: coloringMode (stripe = 1.0)
    expect(uniforms[23]).toBe(1.0);
    // [26]: surfaceMode (soft-glow = 2.0)
    expect(uniforms[26]).toBe(2.0);
    // [27]: surfaceParamA (glowFalloff)
    expect(uniforms[27]).toBe(15.0);
    // [28]: surfaceParamB (glowScatter)
    expect(uniforms[28]).toBe(2.0);
  });
});
