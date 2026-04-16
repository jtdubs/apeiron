import type { MathContext, ExecutionCommand } from './RenderFrameDescriptor';
import { IterationBudgetController } from './IterationBudgetController';

export function contextsEqual(a: MathContext, b: MathContext): boolean {
  return (
    a.zr === b.zr &&
    a.zi === b.zi &&
    a.cr === b.cr &&
    a.ci === b.ci &&
    a.zoom === b.zoom &&
    a.trueMaxIter === b.trueMaxIter &&
    a.sliceAngle === b.sliceAngle &&
    a.exponent === b.exponent &&
    a.refOrbits === b.refOrbits &&
    a.skipIter === b.skipIter
  );
}

export class ProgressiveRenderScheduler {
  private accumulationCount = 0;
  private deepeningTotalIter = 0;
  private budgetController = new IterationBudgetController(14);
  private cycleJitterX = 0;
  private cycleJitterY = 0;

  private lastContext: MathContext | null = null;
  private lastCanvasSizeVersion = -1;
  private lastThemeVersion = -1;
  private lastRenderScale = 1.0;

  private readonly MAX_ACCUM_FRAMES = 64;

  public getAccumulationCount(): number {
    return this.accumulationCount;
  }

  public getDeepeningTotalIter(): number {
    return this.deepeningTotalIter;
  }

  public getBudget(): number {
    return this.budgetController.getBudget();
  }

  public update(
    context: MathContext,
    isInteracting: boolean,
    canvasSizeVersion: number,
    themeVersion: number,
    snapshotRenderScale: number,
    canvasWidth: number,
    canvasHeight: number,
    mathPassMs: number,
  ): ExecutionCommand | null {
    let invalidated = false;

    if (!this.lastContext) {
      invalidated = true;
    } else if (!contextsEqual(this.lastContext, context)) {
      invalidated = true;
    } else if (this.lastCanvasSizeVersion !== canvasSizeVersion) {
      invalidated = true;
    } else if (this.lastThemeVersion !== themeVersion) {
      invalidated = true;
    } else if (this.lastRenderScale !== snapshotRenderScale) {
      invalidated = true;
    }

    if (invalidated || isInteracting) {
      this.accumulationCount = 0;
      this.deepeningTotalIter = 0;
      this.cycleJitterX = 0;
      this.cycleJitterY = 0;
    }

    if (!isInteracting && this.accumulationCount >= this.MAX_ACCUM_FRAMES) {
      return null; // RESOLVED state
    }

    const isFirstSlice = this.deepeningTotalIter === 0;
    const rawBudget = this.budgetController.update(
      mathPassMs !== -1 ? mathPassMs : 14,
      isFirstSlice,
    );

    const yieldIterLimit = Math.min(context.maxIter - this.deepeningTotalIter, rawBudget);

    const advancePingPong = isFirstSlice;
    const clearCheckpoint = isFirstSlice && this.accumulationCount > 0;

    const blendWeight = this.accumulationCount > 0 ? 1.0 / (this.accumulationCount + 1) : 0.0;
    const loadCheckpoint = this.accumulationCount > 0 || this.deepeningTotalIter > 0;

    if (advancePingPong && !isInteracting && this.accumulationCount > 0) {
      this.cycleJitterX = (Math.random() - 0.5) * (2.0 / canvasWidth);
      this.cycleJitterY = (Math.random() - 0.5) * (2.0 / canvasHeight);
    }

    this.lastContext = context;
    this.lastCanvasSizeVersion = canvasSizeVersion;
    this.lastThemeVersion = themeVersion;
    this.lastRenderScale = snapshotRenderScale;

    const command: ExecutionCommand = {
      renderScale: snapshotRenderScale,
      yieldIterLimit,
      loadCheckpoint,
      advancePingPong,
      clearCheckpoint,
      blendWeight,
      jitterX: this.cycleJitterX,
      jitterY: this.cycleJitterY,
    };

    return command;
  }

  public getPipelineMode(isInteracting: boolean): 'INTERACT' | 'ACCUMULATING' | 'DEEPENING' {
    if (isInteracting) return 'INTERACT';
    if (this.accumulationCount > 0 && this.deepeningTotalIter === 0) return 'ACCUMULATING';
    return 'DEEPENING';
  }

  public notifySliceComplete(command: ExecutionCommand) {
    this.deepeningTotalIter += command.yieldIterLimit;
    if (this.deepeningTotalIter >= this.lastContext!.maxIter) {
      this.deepeningTotalIter = 0;
      this.accumulationCount++;
    }
  }
}
