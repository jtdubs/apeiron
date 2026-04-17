export class AdaptiveDRSController {
  private renderScale: number;
  private maxIter: number;
  private recoveryFrames = 0;

  private readonly targetMs: number;
  private readonly minScale: number;
  private readonly maxScale: number;
  private readonly minIter: number;

  constructor(
    targetMs: number = 14.0,
    minScale: number = 0.25,
    maxScale: number = 1.0,
    minIter: number = 100,
  ) {
    this.targetMs = targetMs;
    this.minScale = minScale;
    this.maxScale = maxScale;
    this.minIter = minIter;

    this.renderScale = this.maxScale;
    this.maxIter = 200; // Will be properly initialized on first update or reset
  }

  reset(targetIter: number): void {
    this.renderScale = this.maxScale;
    this.maxIter = targetIter;
    this.recoveryFrames = 0;
  }

  update(gpuMs: number, targetIter: number): { renderScale: number; effectiveMaxIter: number } {
    // Clamp to target if user zoomed out abruptly
    if (this.maxIter > targetIter) {
      this.maxIter = targetIter;
    }

    // If telemetry is unavailable, don't change state.
    if (gpuMs === -1) {
      return { renderScale: this.renderScale, effectiveMaxIter: this.maxIter };
    }

    const iterStep = Math.max(25, Math.floor(targetIter * 0.1)); // Dynamic step size based on depth

    if (gpuMs > this.targetMs * 1.1) {
      // Shed load immediately: Step down renderScale first, then interaction maxIter.
      if (this.renderScale > this.minScale) {
        this.renderScale = Math.max(this.minScale, this.renderScale - 0.1);
      } else if (this.maxIter > this.minIter) {
        this.maxIter = Math.max(this.minIter, this.maxIter - iterStep);
      }
      this.recoveryFrames = 0;
    } else if (gpuMs < this.targetMs * 0.75) {
      this.recoveryFrames++;
      if (this.recoveryFrames >= 5) {
        // Recover quality: Step up maxIter first, then renderScale.
        if (this.maxIter < targetIter) {
          this.maxIter = Math.min(targetIter, this.maxIter + iterStep);
        } else if (this.renderScale < this.maxScale) {
          this.renderScale = Math.min(this.maxScale, this.renderScale + 0.1);
        }
        this.recoveryFrames = 0; // reset after stepping up
      }
    } else {
      // Within target ranges, maintain state.
      this.recoveryFrames = 0;
    }

    return { renderScale: this.renderScale, effectiveMaxIter: this.maxIter };
  }
}
