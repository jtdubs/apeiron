import { describe, it, expect, beforeEach } from 'vitest';
import { ProgressiveRenderScheduler, contextsEqual } from '../ProgressiveRenderScheduler';
import type { MathContext } from '../RenderFrameDescriptor';

function createMockContext(overrides?: Partial<MathContext>): MathContext {
  return {
    zr: 0.0,
    zi: 0.0,
    cr: -0.8,
    ci: 0.156,
    zoom: 1.5,
    computeMaxIter: 200,
    paletteMaxIter: 200,
    sliceAngle: 0,
    exponent: 2,
    refOrbitNodes: null,
    refMetadata: null,
    refBlaGrid: null,
    skipIter: 0,
    debugViewMode: 0,
    ...overrides,
  };
}

describe('ProgressiveRenderScheduler', () => {
  let scheduler: ProgressiveRenderScheduler;

  beforeEach(() => {
    scheduler = new ProgressiveRenderScheduler();
  });

  it('determines contexts correctly', () => {
    const ctxA = createMockContext({ zr: 1.0 });
    const ctxB = createMockContext({ zr: 1.0 });
    const ctxC = createMockContext({ zr: 2.0 });

    expect(contextsEqual(ctxA, ctxB)).toBe(true);
    expect(contextsEqual(ctxA, ctxC)).toBe(false);
  });

  it('handles INVALIDATED state gracefully (geometry changed)', () => {
    const initialContext = createMockContext();
    const command1 = scheduler.update(initialContext, false, 0, 0, 1.0, 1920, 1080, 10, false);
    // Should be a fresh start
    expect(command1?.loadCheckpoint).toBe(false);
    expect(command1?.clearCheckpoint).toBe(false);

    // Now invalidate it by changing the context
    const mutatedContext = createMockContext({ zoom: 1.0 });
    const command2 = scheduler.update(mutatedContext, false, 0, 0, 1.0, 1920, 1080, 10, false);

    // It should reset the counters
    expect(scheduler.getAccumulationCount()).toBe(0);
    expect(scheduler.getIsDeepening()).toBe(true);
    expect(command2?.loadCheckpoint).toBe(false);
  });

  it('handles INTERACT safe frame locking', () => {
    const ctx = createMockContext();
    const commandInteract = scheduler.update(ctx, true, 0, 0, 0.5, 1920, 1080, 10, false);
    expect(commandInteract?.blendWeight).toBe(0.0);
    expect(commandInteract?.renderScale).toBe(0.5);

    // Even if it completes a slice, if it's still interacting next frame, it resets!
    scheduler.update(ctx, true, 0, 0, 0.5, 1920, 1080, 10, false);
    expect(scheduler.getAccumulationCount()).toBe(0);
  });

  it('progresses correctly through DEEPENING and ACCUMULATING', () => {
    // Fake a high maxIter to force deepening
    const ctx = createMockContext({ computeMaxIter: 500, paletteMaxIter: 500 });

    // Pass 1: DEEPENING (starts fresh)
    const cmd1 = scheduler.update(ctx, false, 0, 0, 1.0, 1920, 1080, 50, false); // fast ms to give high budget but not 500
    expect(cmd1?.loadCheckpoint).toBe(false);

    expect(scheduler.getIsDeepening()).toBe(true);
    expect(scheduler.getAccumulationCount()).toBe(0);

    // Pass 2: DEEPENING resumes
    const cmd2 = scheduler.update(ctx, false, 0, 0, 1.0, 1920, 1080, 50, false);
    expect(cmd2?.loadCheckpoint).toBe(true);

    // We manually advance deepening so it reaches final
    // We manually advance deepening so it reaches final
    // modify scheduler internals if we could, but let's just loop until final slice
    while (scheduler.getPipelineMode(false) === 'DEEPENING') {
      if (scheduler.getPipelineMode(false) === 'ACCUMULATING') break;
      scheduler.update(ctx, false, 0, 0, 1.0, 1920, 1080, -1, true); // send isTargetMet=true
    }

    expect(scheduler.getPipelineMode(false)).toBe('ACCUMULATING');

    // Now it should hit ACCUMULATING cycle 1
    expect(scheduler.getAccumulationCount()).toBe(1);

    // Pass: ACCUMULATING cycle 1, slice 1
    const cmdAccum = scheduler.update(ctx, false, 0, 0, 1.0, 1920, 1080, 10, true);
    expect(cmdAccum?.clearCheckpoint).toBe(true);
    expect(cmdAccum?.blendWeight).toBeCloseTo(0.3333333333333333); // 1 / (2 + 1)

    // Pass: ACCUMULATING cycle 1, slice 2 (Target Not Met)
    const cmdAccumSubslice = scheduler.update(ctx, false, 0, 0, 1.0, 1920, 1080, 10, false);
    // The scheduler must cleanly chunk the geometry and neither advance the ping-pong nor clear the checkpoint!
    expect(scheduler.getAccumulationCount()).toBe(2); // Should not advance cycle!
    expect(cmdAccumSubslice?.clearCheckpoint).toBe(false);
    expect(cmdAccumSubslice?.advancePingPong).toBe(false);
  });
});
