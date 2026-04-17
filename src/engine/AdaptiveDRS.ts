export class AdaptiveDRSController {
  private renderScale: number;
  private maxIter: number;
  private recoveryFrames = 0;

  private readonly targetMs: number;
  private readonly minScale: number;
  private readonly maxScale: number;
  private readonly minIter: number;
  private readonly maxIterDefault: number;

  constructor(
    targetMs: number = 14.0,
    minScale: number = 0.25,
    maxScale: number = 1.0,
    minIter: number = 100,
    maxIterDefault: number = 200,
  ) {
    this.targetMs = targetMs;
    this.minScale = minScale;
    this.maxScale = maxScale;
    this.minIter = minIter;
    this.maxIterDefault = maxIterDefault;

    this.renderScale = this.maxScale;
    this.maxIter = this.maxIterDefault;
  }

  reset(): void {
    this.renderScale = this.maxScale;
    this.maxIter = this.maxIterDefault;
    this.recoveryFrames = 0;
  }

  update(gpuMs: number): { renderScale: number; effectiveMaxIter: number } {
    // If telemetry is unavailable, don't change state.
    if (gpuMs === -1) {
      return { renderScale: this.renderScale, effectiveMaxIter: this.maxIter };
    }

    if (gpuMs > this.targetMs * 1.1) {
      // Shed load immediately: Step down renderScale first, then interaction maxIter.
      if (this.renderScale > this.minScale) {
        this.renderScale = Math.max(this.minScale, this.renderScale - 0.1);
      } else if (this.maxIter > this.minIter) {
        this.maxIter = Math.max(this.minIter, this.maxIter - 25);
      }
      this.recoveryFrames = 0;
    } else if (gpuMs < this.targetMs * 0.75) {
      this.recoveryFrames++;
      if (this.recoveryFrames >= 5) {
        // Recover quality: Step up maxIter first, then renderScale.
        if (this.maxIter < this.maxIterDefault) {
          this.maxIter = Math.min(this.maxIterDefault, this.maxIter + 25);
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
