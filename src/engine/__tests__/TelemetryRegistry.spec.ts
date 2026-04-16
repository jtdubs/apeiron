import { expect, test, describe, beforeEach } from 'vitest';
import { TelemetryRegistry } from '../debug/TelemetryRegistry';

describe('TelemetryRegistry', () => {
  beforeEach(() => {
    TelemetryRegistry.resetInstanceForTesting();
  });

  test('registers and correctly accepts pushed metrics via channel closure', () => {
    const reg = TelemetryRegistry.getInstance();
    const ch = reg.register({ id: 'test.fps', label: 'FPS', group: 'sys', type: 'analog' });

    ch.push(60);
    ch.push(55);

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
      smoothingAlpha: 0.1,
    });

    ch.push(100);
    expect(reg.getEma('eval.smooth')).toBe(100); // 1st frame unconditionally seeds the EMA

    ch.push(50);
    // New EMA = (0.1 * 50) + (0.9 * 100) = 5 + 90 = 95
    expect(reg.getEma('eval.smooth')).toBe(95);

    ch.push(50);
    // New EMA = (0.1 * 50) + (0.9 * 95) = 5 + 85.5 = 90.5
    expect(reg.getEma('eval.smooth')).toBe(90.5);
  });
});
