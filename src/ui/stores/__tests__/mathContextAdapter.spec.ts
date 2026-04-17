import { describe, it, expect, vi, beforeEach } from 'vitest';
import { buildMathContext } from '../mathContextAdapter';
import { calculateMaxIter, viewportStore, type ViewportState } from '../viewportStore';
import { renderStore, type RenderState } from '../renderStore';
import { calculateSkipIter } from '../../../engine/seriesApproximation';

vi.mock('../../../engine/seriesApproximation', () => ({
  calculateSkipIter: vi.fn(),
}));

describe('mathContextAdapter', () => {
  let mockState: ViewportState;
  let mockTheme: RenderState;

  beforeEach(() => {
    vi.mocked(calculateSkipIter).mockReset();
    vi.mocked(calculateSkipIter).mockReturnValue(0);

    mockState = {
      ...viewportStore.getState(),
      anchorZr: '0.0',
      anchorZi: '0.0',
      anchorCr: '-1.0',
      anchorCi: '0.5',
      deltaZr: 0.1,
      deltaZi: 0.1,
      deltaCr: 0.1,
      deltaCi: 0.1,
      sliceAngle: 0,
      zoom: 1.0,
      exponent: 2,
      paletteMaxIter: 500,
      refOrbits: null,
      interactionState: 'STATIC',
    };

    mockTheme = {
      ...renderStore.getState(),
      precisionMode: 'f32',
    };
  });

  it('builds standard f32 context accurately', () => {
    const ctx = buildMathContext(mockState, mockTheme, 1920, 1080);

    // In f32, coordinates are anchor + delta
    expect(ctx.zr).toBeCloseTo(0.1);
    expect(ctx.zi).toBeCloseTo(0.1);
    expect(ctx.cr).toBeCloseTo(-0.9); // -1.0 + 0.1
    expect(ctx.ci).toBeCloseTo(0.6);
    expect(ctx.paletteMaxIter).toBe(500);
    expect(ctx.computeMaxIter).toBe(500); // Because STATIC
    expect(ctx.skipIter).toBe(0);
  });

  it('builds floating-origin perturbation context accurately', () => {
    mockState.refOrbits = new Float64Array(10);
    mockTheme.precisionMode = 'perturbation';
    vi.mocked(calculateSkipIter).mockReturnValue(42);

    const ctx = buildMathContext(mockState, mockTheme, 1920, 1080);

    // In perturbation, coordinates are purely the delta offsets relative to the floating origin
    expect(ctx.zr).toBeCloseTo(0.1);
    expect(ctx.zi).toBeCloseTo(0.1);
    expect(ctx.cr).toBeCloseTo(0.1);
    expect(ctx.ci).toBeCloseTo(0.1);

    expect(ctx.skipIter).toBe(42);
    expect(calculateSkipIter).toHaveBeenCalled();
  });

  it('applies interaction throttling appropriately', () => {
    mockState.interactionState = 'INTERACT_SAFE';
    mockState.paletteMaxIter = 1000;

    const interactFloor = calculateMaxIter(1.0); // e.g. 150
    const expectedYield = Math.max(interactFloor, Math.floor(1000 * 0.33)); // 330

    const ctx = buildMathContext(mockState, mockTheme, 1920, 1080);

    expect(ctx.paletteMaxIter).toBe(1000);
    expect(ctx.computeMaxIter).toBe(expectedYield);
  });

  it('factors skipIter into the throttle budget when in interacting perturbation', () => {
    mockState.interactionState = 'INTERACT_SAFE';
    mockState.refOrbits = new Float64Array(10);
    mockTheme.precisionMode = 'perturbation';
    mockState.paletteMaxIter = 1000;
    vi.mocked(calculateSkipIter).mockReturnValue(200);

    const interactFloor = calculateMaxIter(1.0); // e.g. 150
    const fractionYield = Math.floor(1000 * 0.33); // 330
    const expectedYield = Math.max(interactFloor, fractionYield) + 200; // 530

    const ctx = buildMathContext(mockState, mockTheme, 1920, 1080);

    // Clamped budget calculation
    expect(ctx.paletteMaxIter).toBe(1000);
    expect(ctx.computeMaxIter).toBe(Math.min(1000, expectedYield));
  });
});
