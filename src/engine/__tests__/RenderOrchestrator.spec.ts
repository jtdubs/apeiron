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
      zoom: 0.9e-5,
      exponent: 2.0,
      paletteMaxIter: 1000,
      sliceAngle: 0,
      interactionState: 'STATIC',
    } as ViewportState;

    theme = {
      renderMode: 'auto',
      themeVersion: 1,
    } as RenderState;
  });

  it('shifts to ds before zoom 1e-5 to avoid pixelation', () => {
    const orchestrator = new RenderOrchestrator();

    // Spy on the builder to intercept the computed math mode
    const spy = vi.spyOn(adapter, 'buildMathContext');

    orchestrator.tick(state, theme, 16.6, true, 800, 600, 1);

    expect(spy).toHaveBeenCalled();
    const callArgs = spy.mock.calls[0];
    const effectiveMathMode = callArgs[3];

    // mode 1 is DS. If it returns 0, it means we are staying in standard f32 too long.
    expect(effectiveMathMode).toBe(1);
  });

  it('invalidates progressive context but maintains math mode when exponent changes smoothly', () => {
    const orchestrator = new RenderOrchestrator();

    // Force non-interacting and target met so it transitions out of initial frame
    const desc1 = orchestrator.tick(state, theme, 16.6, true, 800, 600, 1);
    expect(desc1?.command.loadCheckpoint).toBe(false); // First slice

    // Second tick without change should accumulate/deepen and load checkpoint
    const desc2 = orchestrator.tick(state, theme, 16.6, true, 800, 600, 1);
    expect(desc2?.command.loadCheckpoint).toBe(true);

    // Third tick with exponent tweak
    state.exponent = 2.01;
    const spy = vi.spyOn(adapter, 'buildMathContext');
    const desc3 = orchestrator.tick(state, theme, 16.6, true, 800, 600, 1);

    expect(spy).toHaveBeenCalled();
    const callArgs = spy.mock.calls[spy.mock.calls.length - 1];
    const effectiveMathMode = callArgs[3];

    // Mode should fallback to 0 (F32) since exponent != 2.0
    expect(effectiveMathMode).toBe(0);

    // Should invalidate scheduler due to context change
    expect(desc3?.command.loadCheckpoint).toBe(false);
  });
});
