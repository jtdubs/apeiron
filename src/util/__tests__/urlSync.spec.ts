import { describe, it, expect, beforeEach } from 'vitest';
import { viewportStore } from '../../ui/stores/viewportStore';
import { renderStore, THEMES } from '../../ui/stores/renderStore';
import { serializeState, deserializeState } from '../urlSync';

describe('urlSync', () => {
  beforeEach(() => {
    // Reset stores to a known baseline
    viewportStore
      .getState()
      .setAnchorsAndDeltas('0.0', '0.0', '-0.8', '0.156', 0, 0, 0, 0, 1.5, 0, 2.0);
    const rs = renderStore.getState();
    rs.setPalette(
      THEMES.watermelon.a,
      THEMES.watermelon.b,
      THEMES.watermelon.c,
      THEMES.watermelon.d,
      'watermelon',
    );
    rs.setPrecisionMode('perturbation');
    rs.setColoringMode('iteration');
    rs.setSurfaceMode('3d-topography');
  });

  it('compresses and returns a valid base64 string', () => {
    const hash = serializeState();
    expect(hash).toBeTruthy();
    expect(hash).not.toContain('{'); // Should be base64 encoded
    expect(() => atob(hash)).not.toThrow();
  });

  it('can reliably deserialize a base64 string and restore zustand state perfectly', () => {
    // Modify state drastically to something else
    viewportStore
      .getState()
      .setAnchorsAndDeltas('1.123', '2.345', '0.1', '0.2', 0.5, 0.5, 0.5, 0.5, 1e-45, 0.785, 3.5);

    const rs = renderStore.getState();
    rs.setPalette(
      THEMES.cyberpunk.a,
      THEMES.cyberpunk.b,
      THEMES.cyberpunk.c,
      THEMES.cyberpunk.d,
      'cyberpunk',
    );
    rs.setPrecisionMode('f32');
    rs.setColoringMode('stripe');
    rs.setSurfaceMode('soft-glow');
    rs.setGlowFalloff(99.0);

    const hash = serializeState();

    // Now reset UI state back to default
    viewportStore
      .getState()
      .setAnchorsAndDeltas('0.0', '0.0', '0.0', '0.0', 0, 0, 0, 0, 1.0, 0.0, 2.0);
    rs.setPalette(
      THEMES.monochrome.a,
      THEMES.monochrome.b,
      THEMES.monochrome.c,
      THEMES.monochrome.d,
      'monochrome',
    );
    rs.setPrecisionMode('perturbation');
    rs.setGlowFalloff(20.0);

    // Call deserialize
    const success = deserializeState(hash);
    expect(success).toBe(true);

    // Assert that the state matches the drastic modification
    const v = viewportStore.getState();
    expect(v.anchorZr).toBe('1.123');
    expect(v.anchorZi).toBe('2.345');
    expect(v.zoom).toBe(1e-45);
    expect(v.exponent).toBe(3.5);

    const r = renderStore.getState();
    expect(r.paletteName).toBe('cyberpunk');
    // We expect the array actually loaded from THEMES
    expect(r.paletteA).toEqual(THEMES.cyberpunk.a);
    expect(r.precisionMode).toBe('f32');
    expect(r.coloringMode).toBe('stripe');
    expect(r.surfaceMode).toBe('soft-glow');
    expect(r.glowFalloff).toBe(99.0);
  });

  it('gracefully handles garbage or missing base64 hashes', () => {
    const success = deserializeState('#NOT_A_VALID_BASE64!!!!');
    expect(success).toBe(false);

    // It should not have crashed nor mutated state
    expect(viewportStore.getState().zoom).toBe(1.5);
  });
});
