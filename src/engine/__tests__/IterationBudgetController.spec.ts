import { describe, it, expect, beforeEach } from 'vitest';
import { IterationBudgetController } from '../IterationBudgetController';

describe('IterationBudgetController', () => {
  let controller: IterationBudgetController;

  beforeEach(() => {
    controller = new IterationBudgetController(14); // Target 14ms
  });

  it('starts at baseline budget of 1000', () => {
    expect(controller.getBudget()).toBe(1000);
  });

  it('smoothly scales budget down when frame times exceed target', () => {
    const newBudget = controller.update(20);
    // 14 * 0.95 = 13.3 target, ratio = 13.3 / 20 = 0.665
    // ideal = 665, smoothed = 1000 * 0.8 + 665 * 0.2 = 800 + 133 = 933
    expect(newBudget).toBeLessThan(1000);
  });

  it('smoothly scales budget up when frame times are safely below target', () => {
    const newBudget = controller.update(5);
    expect(newBudget).toBeGreaterThan(1000);
  });

  it('reacts more aggressively to extreme performance spikes', () => {
    const heavilySpiked = controller.update(30); // smooth 0.5

    controller.reset();
    const slightlySpiked = controller.update(16); // smooth 0.8

    expect(heavilySpiked).toBeLessThan(slightlySpiked);
  });

  it('clamps max budget to 5000', () => {
    for (let i = 0; i < 50; i++) {
      controller.update(1); // Extremely fast
    }
    expect(controller.getBudget()).toBe(5000);
  });

  it('clamps min budget to 5', () => {
    for (let i = 0; i < 50; i++) {
      controller.update(100); // Extremely slow
    }
    expect(controller.getBudget()).toBe(5);
  });

  it('reset floors the budget back to 1000', () => {
    controller.update(5);
    expect(controller.getBudget()).toBeGreaterThan(1000);

    controller.reset();
    expect(controller.getBudget()).toBe(1000);
  });
});
