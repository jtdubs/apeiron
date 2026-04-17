export class IterationBudgetController {
  private targetMs: number;
  private currentBudget: number;

  constructor(targetMs: number = 14) {
    this.targetMs = targetMs;
    this.currentBudget = 1000;
  }

  /**
   * Updates the budget smoothly based on the latest GPU frame time.
   * Utilizes a low-pass discrete proportional filter to lock smoothly
   * onto the target framerate without oscillating and causing edge flickering.
   */
  update(gpuMs: number): number {
    // Determine the safe threshold we want to gracefully hover exactly at
    const safeTargetMs = this.targetMs * 0.95;

    // Extrapolate the ideal budget using a linear proportionality assumption
    const ratio = safeTargetMs / Math.max(1.0, gpuMs);
    const idealBudget = this.currentBudget * ratio;

    // Smoothly interpolate towards the ideal budget (Low-pass filter) to eliminate flapping.
    // If it's a massive spike (> 1.5x target), react slightly faster to prevent locked freezes
    const smoothing = gpuMs > this.targetMs * 1.5 ? 0.5 : 0.8;

    this.currentBudget = this.currentBudget * smoothing + idealBudget * (1.0 - smoothing);
    this.currentBudget = Math.max(100, Math.min(5000, this.currentBudget));

    return Math.floor(this.currentBudget);
  }

  /**
   * Aggressively floors the budget to handle potentially new heavy loads.
   * Called on new interact/accumulation cycles.
   */
  reset(): void {
    this.currentBudget = 1000;
  }

  getBudget(): number {
    return Math.floor(this.currentBudget);
  }
}
