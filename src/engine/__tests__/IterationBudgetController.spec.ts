import { describe, it, expect, beforeEach } from 'vitest';
import { IterationBudgetController } from '../IterationBudgetController';

describe('IterationBudgetController', () => {
  let controller: IterationBudgetController;

  beforeEach(() => {
    controller = new IterationBudgetController(14);
  });

  it('initializes with a budget of 1000', () => {
    expect(controller.getBudget()).toBe(1000);
  });

  it('does not increase budget on non-first slices even if fast', () => {
    for (let i = 0; i < 5; i++) {
      controller.update(10, false);
    }
    expect(controller.getBudget()).toBe(1000); // Remains at baseline
  });

  it('increases budget by 500 after 3 consecutive fast first-slices', () => {
    controller.update(10, true);
    expect(controller.getBudget()).toBe(1000);
    controller.update(10, true);
    expect(controller.getBudget()).toBe(1000);
    controller.update(10, true);
    expect(controller.getBudget()).toBe(1500); // 3rd consecutive triggers bump
  });

  it('allows intermediate non-first slices between fast first slices without resetting the counter', () => {
    controller.update(10, true); // 1st fast
    controller.update(10, false); // non-first
    controller.update(10, false); // non-first
    controller.update(10, true); // 2nd fast
    controller.update(10, true); // 3rd fast -> should bump
    expect(controller.getBudget()).toBe(1500);
  });

  it('drops budget aggressively on any spiked slice', () => {
    // Ramp up first to show a drop
    controller.update(10, true);
    controller.update(10, true);
    controller.update(10, true);
    expect(controller.getBudget()).toBe(1500);

    // Provide a spiked non-first slice
    controller.update(20, false); // > 14 * 1.1 = 15.4
    expect(controller.getBudget()).toBe(100); // 1500 - 1500 clamped to 100
  });

  it('drops budget aggressively on a spiked first slice', () => {
    // Ramp up
    controller.update(10, true);
    controller.update(10, true);
    controller.update(10, true);
    expect(controller.getBudget()).toBe(1500);

    // Provide a spiked first slice
    controller.update(20, true); // > 15.4
    expect(controller.getBudget()).toBe(100);
  });

  it('clamps max budget to 5000', () => {
    // 3 fast frames = 1 bump. Need 8 bumps (8 * 3 = 24 frames) to go from 1000 to 5000.
    for (let i = 0; i < 30; i++) {
      controller.update(10, true);
    }
    expect(controller.getBudget()).toBe(5000);
  });

  it('clamps min budget to 100', () => {
    controller.update(50, true); // Huge spike
    expect(controller.getBudget()).toBe(100); // 1000 - 1500 clamped
  });

  it('reset floors the budget back to 1000 and clears consecutive counter', () => {
    // Ramp up
    controller.update(10, true);
    controller.update(10, true);
    controller.update(10, true);
    expect(controller.getBudget()).toBe(1500);

    controller.reset();
    expect(controller.getBudget()).toBe(1000);

    // 2 more fast frames shouldn't bump it (because counter cleared)
    controller.update(10, true);
    controller.update(10, true);
    expect(controller.getBudget()).toBe(1000);
  });
});
