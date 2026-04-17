import { describe, it, expect, beforeEach } from 'vitest';
import { AdaptiveDRSController } from '../AdaptiveDRS';

describe('AdaptiveDRSController', () => {
  let adrs: AdaptiveDRSController;

  beforeEach(() => {
    // Defaults: minScale=0.25, maxScale=1.0, minIter=100, maxIterDefault=200, targetMs=14.0
    adrs = new AdaptiveDRSController();
  });

  it('sustained gpuMs > target causes renderScale to step down each frame', () => {
    const initialState = adrs.update(10);
    expect(initialState.renderScale).toBe(1.0);
    expect(initialState.effectiveMaxIter).toBe(200);

    // One heavy frame (> 14 * 1.1 = 15.4)
    let state = adrs.update(16);
    expect(state.renderScale).toBe(0.9);
    expect(state.effectiveMaxIter).toBe(200);

    // Another heavy frame
    state = adrs.update(16);
    expect(state.renderScale).toBe(0.8);
    expect(state.effectiveMaxIter).toBe(200);
  });

  it('steps down maxIter once renderScale hits minimum', () => {
    // Force renderScale down to 0.25 (8 steps of 0.1)
    for (let i = 0; i < 8; i++) {
      adrs.update(20);
    }

    let state = adrs.update(20); // renderScale min reached, should drop maxIter
    expect(state.renderScale).toBeCloseTo(0.25);
    expect(state.effectiveMaxIter).toBe(175);

    state = adrs.update(20);
    expect(state.effectiveMaxIter).toBe(150);
  });

  it('sustained gpuMs < target * 0.75 for 5 frames causes quality to step up', () => {
    // Drop both to min manually
    for (let i = 0; i < 15; i++) {
      adrs.update(20);
    }
    let state = adrs.update(20);
    expect(state.renderScale).toBe(0.25);
    expect(state.effectiveMaxIter).toBe(100);

    // Now send fast frames (< 14 * 0.75 = 10.5)
    adrs.update(10);
    adrs.update(10);
    adrs.update(10);
    adrs.update(10);
    state = adrs.update(10); // 5th frame triggers upgrade

    // maxIter should upgrade first
    expect(state.effectiveMaxIter).toBe(125);
    expect(state.renderScale).toBe(0.25);

    adrs.update(10);
    adrs.update(10);
    adrs.update(10);
    adrs.update(10);
    state = adrs.update(10); // 10th frame triggers 2nd upgrade
    expect(state.effectiveMaxIter).toBe(150);

    // Upgrade maxIter up to 200
    for (let i = 0; i < 10; i++) adrs.update(10);
    state = adrs.update(10);
    expect(state.effectiveMaxIter).toBe(200);
    expect(state.renderScale).toBe(0.25); // still 0.25

    // Next 5 frames should upgrade renderScale
    for (let i = 0; i < 4; i++) adrs.update(10);
    state = adrs.update(10);
    expect(state.effectiveMaxIter).toBe(200);
    // JS math can be iffy, so toBeCloseTo is safer, but exact 0.35 works if starts from 0.25
    expect(state.renderScale).toBe(0.35);
  });

  it('never leaves [minScale, maxScale]', () => {
    // Try to upgrade beyond maxScale
    for (let i = 0; i < 100; i++) adrs.update(5);
    let state = adrs.update(5);
    expect(state.renderScale).toBe(1.0);
    expect(state.effectiveMaxIter).toBe(200);

    // Try to degrade beyond minScale and minIter
    for (let i = 0; i < 100; i++) adrs.update(20);
    state = adrs.update(20);
    expect(state.renderScale).toBe(0.25);
    expect(state.effectiveMaxIter).toBe(100);
  });

  it('reset() restores defaults regardless of current state', () => {
    // Degrade
    adrs.update(20);
    adrs.update(20);
    adrs.reset();

    const state = adrs.update(14); // Provide neutral frame
    expect(state.renderScale).toBe(1.0);
    expect(state.effectiveMaxIter).toBe(200);
  });

  it('first call with gpuMs = -1 leaves state unchanged', () => {
    let state = adrs.update(-1);
    expect(state.renderScale).toBe(1.0);
    expect(state.effectiveMaxIter).toBe(200);

    // Even if degraded, -1 should do nothing
    adrs.update(20);
    state = adrs.update(-1);
    expect(state.renderScale).toBe(0.9);
  });

  it('resets recoveryFrames on spikes when building up', () => {
    adrs.update(20);
    adrs.update(20);
    adrs.update(20); // degrade

    // 4 good frames
    adrs.update(5);
    adrs.update(5);
    adrs.update(5);
    adrs.update(5);

    // 1 bad frame
    adrs.update(20);

    // Needs 5 more good frames, not 1
    const state = adrs.update(5);
    expect(state.renderScale).toBeCloseTo(0.6); // degraded again
  });
});
