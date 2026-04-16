import { expect, test, describe, beforeEach } from 'vitest';
import { TelemetryRegistry } from '../debug/TelemetryRegistry';

describe('TelemetryRegistry', () => {
  beforeEach(() => {
    TelemetryRegistry.resetInstanceForTesting();
  });

  test('registers and correctly accepts set metrics via fast-path closures', () => {
    const reg = TelemetryRegistry.getInstance();
    const ch = reg.register({
      id: 'test.fps',
      label: 'FPS',
      group: 'sys',
      type: 'analog',
      retention: 'latch',
    });

    reg.beginFrame();
    ch.set(60);
    reg.commitFrame();

    reg.beginFrame();
    ch.set(55);
    reg.commitFrame();

    expect(reg.getLatest('test.fps')).toBe(55);
    expect(reg.getBuffer('test.fps')!.getCount()).toBe(2);
    expect(reg.getAllRegisteredIds()).toContain('test.fps');
  });

  test('calculates correct Exponential Moving Average (EMA) safely encapsulated', () => {
    const reg = TelemetryRegistry.getInstance();
    // alpha = 0.1 means 10% new value, 90% old value
    const ch = reg.register({
      id: 'eval.smooth',
      label: 'Smooth',
      group: 'sys',
      type: 'analog',
      retention: 'latch',
      smoothingAlpha: 0.1,
    });

    reg.beginFrame();
    ch.set(100);
    reg.commitFrame();
    expect(reg.getEma('eval.smooth')).toBe(100); // 1st frame unconditionally seeds the EMA

    reg.beginFrame();
    ch.set(50);
    reg.commitFrame();
    // New EMA = (0.1 * 50) + (0.9 * 100) = 5 + 90 = 95
    expect(reg.getEma('eval.smooth')).toBe(95);

    reg.beginFrame();
    ch.set(50);
    reg.commitFrame();
    // New EMA = (0.1 * 50) + (0.9 * 95) = 5 + 85.5 = 90.5
    expect(reg.getEma('eval.smooth')).toBe(90.5);
  });
});
