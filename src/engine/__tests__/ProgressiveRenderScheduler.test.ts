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
    maxIter: 200,
    trueMaxIter: 200,
    sliceAngle: 0,
    exponent: 2,
    refOrbits: null,
    skipIter: 0,
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
    const command1 = scheduler.update(initialContext, false, 0, 0, 1.0, 1920, 1080, 10);
    // Should be a fresh start
    expect(command1?.isResume).toBe(0.0);
    expect(command1?.clearCheckpoint).toBe(false);

    scheduler.notifySliceComplete(command1!);

    // Now invalidate it by changing the context
    const mutatedContext = createMockContext({ zoom: 1.0 });
    const command2 = scheduler.update(mutatedContext, false, 0, 0, 1.0, 1920, 1080, 10);

    // It should reset the counters
    expect(scheduler.getAccumulationCount()).toBe(0);
    expect(scheduler.getDeepeningTotalIter()).toBe(0);
    expect(command2?.isResume).toBe(0.0);
  });

  it('handles INTERACT safe frame locking', () => {
    const ctx = createMockContext();
    const commandInteract = scheduler.update(ctx, true, 0, 0, 0.5, 1920, 1080, 10);
    expect(commandInteract?.blendWeight).toBe(0.0);
    expect(commandInteract?.renderScale).toBe(0.5);

    scheduler.notifySliceComplete(commandInteract!);

    // Even if it completes a slice, if it's still interacting next frame, it resets!
    scheduler.update(ctx, true, 0, 0, 0.5, 1920, 1080, 10);
    expect(scheduler.getAccumulationCount()).toBe(0);
  });

  it('progresses correctly through DEEPENING and ACCUMULATING', () => {
    // Fake a high maxIter to force deepening
    const ctx = createMockContext({ maxIter: 500, trueMaxIter: 500 });

    // Pass 1: DEEPENING (starts fresh)
    const cmd1 = scheduler.update(ctx, false, 0, 0, 1.0, 1920, 1080, 50); // fast ms to give high budget but not 500
    expect(cmd1?.isResume).toBe(0.0);
    expect(cmd1?.isFinalSlice).toBe(false);

    scheduler.notifySliceComplete(cmd1!);
    expect(scheduler.getDeepeningTotalIter()).toBeGreaterThan(0);
    expect(scheduler.getAccumulationCount()).toBe(0);

    // Pass 2: DEEPENING resumes
    const cmd2 = scheduler.update(ctx, false, 0, 0, 1.0, 1920, 1080, 50);
    expect(cmd2?.isResume).toBe(1.0);
    expect(cmd2?.isFinalSlice).toBe(false);

    // We manually advance deepening so it reaches final
    // We manually advance deepening so it reaches final
    // modify scheduler internals if we could, but let's just loop until final slice
    let cmdX = cmd2;
    while (!cmdX?.isFinalSlice) {
      scheduler.notifySliceComplete(cmdX!);
      cmdX = scheduler.update(ctx, false, 0, 0, 1.0, 1920, 1080, -1);
    }

    expect(cmdX?.isFinalSlice).toBe(true);
    scheduler.notifySliceComplete(cmdX!);

    // Now it should hit ACCUMULATING cycle 1
    expect(scheduler.getAccumulationCount()).toBe(1);

    // Pass: ACCUMULATING cycle 1, slice 1
    const cmdAccum = scheduler.update(ctx, false, 0, 0, 1.0, 1920, 1080, 10);
    expect(cmdAccum?.clearCheckpoint).toBe(true);
    expect(cmdAccum?.blendWeight).toBe(0.5); // 1 / (1 + 1)
  });
});
