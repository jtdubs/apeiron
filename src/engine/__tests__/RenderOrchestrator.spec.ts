import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RenderOrchestrator } from '../RenderOrchestrator';
import type { ViewportState } from '../../ui/stores/viewportStore';
import type { RenderState } from '../../ui/stores/renderStore';
import * as adapter from '../../ui/stores/mathContextAdapter';

// Stub out window to avoid reference errors in headless
vi.stubGlobal('window', { devicePixelRatio: 1 });

describe('RenderOrchestrator f32 Precision Transition', () => {
  let state: ViewportState;
  let theme: RenderState;

  beforeEach(() => {
    state = {
      anchorZr: '0',
      anchorZi: '0',
      anchorCr: '0',
      anchorCi: '0',
      deltaZr: 0,
      deltaZi: 0,
      deltaCr: 0,
      deltaCi: 0,
      zoom: 1.89e-5,
      exponent: 2.0,
      paletteMaxIter: 1000,
      sliceAngle: 0,
      interactionState: 'STATIC',
      refOrbitNodes: new Float64Array(10), // Required for perturbation
      refMetadata: new Float64Array(10),
    } as ViewportState;

    theme = {
      renderMode: 'auto',
      themeVersion: 1,
    } as RenderState;
  });

  it('shifts to f32_perturbation before zoom 1.89e-5 to avoid pixelation', () => {
    const orchestrator = new RenderOrchestrator();

    // Spy on the builder to intercept the computed math mode
    const spy = vi.spyOn(adapter, 'buildMathContext');

    orchestrator.tick(state, theme, 16.6, true, 800, 600, 1);

    expect(spy).toHaveBeenCalled();
    const callArgs = spy.mock.calls[0];
    const effectiveMathMode = callArgs[5]; // 6th arg is effectiveMathMode

    // mode 1 is f32p. If it returns 0, it means we are staying in standard f32 too long.
    expect(effectiveMathMode).toBe(1);
  });
});
