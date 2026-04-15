export class IterationBudgetController {
  private targetMs: number;
  private currentBudget: number;
  private consecutiveFastFrames: number;

  constructor(targetMs: number = 14) {
    this.targetMs = targetMs;
    this.currentBudget = 1000;
    this.consecutiveFastFrames = 0;
  }

  /**
   * Updates the budget based on the latest GPU frame time.
   * Decreases trigger on any spiked slice. Increases ONLY trigger
   * on fast `isFirstSlice` passes to avoid Coastline divergence traps.
   */
  update(gpuMs: number, isFirstSlice: boolean): number {
    const spikeThreshold = this.targetMs * 1.1;

    if (gpuMs > spikeThreshold) {
      this.currentBudget = Math.max(100, this.currentBudget - 1500);
      this.consecutiveFastFrames = 0;
    } else {
      if (isFirstSlice) {
        if (gpuMs < this.targetMs) {
          this.consecutiveFastFrames++;
          if (this.consecutiveFastFrames >= 3) {
            this.currentBudget = Math.min(5000, this.currentBudget + 500);
            this.consecutiveFastFrames = 0;
          }
        } else {
          this.consecutiveFastFrames = 0;
        }
      }
    }

    return this.currentBudget;
  }

  /**
   * Aggressively floors the budget to handle potentially new heavy loads.
   * Called on new interact/accumulation cycles.
   */
  reset(): void {
    this.currentBudget = 1000;
    this.consecutiveFastFrames = 0;
  }

  getBudget(): number {
    return this.currentBudget;
  }
}
