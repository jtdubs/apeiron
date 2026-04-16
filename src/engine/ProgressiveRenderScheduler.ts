import type { MathContext, ExecutionCommand } from './RenderFrameDescriptor';
import { IterationBudgetController } from './IterationBudgetController';
import { TelemetryRegistry, type TelemetryChannel } from './debug/TelemetryRegistry';

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

  private channels: {
    mode: TelemetryChannel;
    budget: TelemetryChannel;
    renderscale: TelemetryChannel;
    saSkip: TelemetryChannel;
    zoom: TelemetryChannel;
    maxIter: TelemetryChannel;
    exponent: TelemetryChannel;
    sliceAngle: TelemetryChannel;
    zr: TelemetryChannel;
    zi: TelemetryChannel;
    cr: TelemetryChannel;
    ci: TelemetryChannel;
    yieldIter: TelemetryChannel;
    loadCheckpoint: TelemetryChannel;
    advancePingPong: TelemetryChannel;
    clearCheckpoint: TelemetryChannel;
    blendWeight: TelemetryChannel;
    jitterX: TelemetryChannel;
    jitterY: TelemetryChannel;
  };

  private lastContext: MathContext | null = null;
  private lastCanvasSizeVersion = -1;
  private lastThemeVersion = -1;
  private lastRenderScale = 1.0;

  private readonly MAX_ACCUM_FRAMES = 64;

  constructor() {
    const reg = TelemetryRegistry.getInstance();
    this.channels = {
      mode: reg.register({
        id: 'engine.fsm',
        label: 'FSM Mode',
        group: 'FSM',
        type: 'enum',
        retention: 'latch',
        enumValues: { 0: 'INTERACT', 1: 'DEEPENING', 2: 'ACCUM' },
      }),
      budget: reg.register({
        id: 'engine.budget',
        label: 'Iteration Budget',
        group: 'FSM',
        type: 'analog',
        retention: 'latch',
        smoothingAlpha: 0.1,
      }),
      renderscale: reg.register({
        id: 'engine.renderscale',
        label: 'Canvas Res Scale',
        group: 'System',
        type: 'analog',
        retention: 'latch',
      }),
      saSkip: reg.register({
        id: 'engine.fsm.saSkip',
        label: 'SA Skip Depth',
        group: 'FSM',
        type: 'analog',
        retention: 'latch',
      }),

      zoom: reg.register({
        id: 'math.zoom',
        label: 'Zoom Level',
        group: 'Math',
        type: 'analog',
        retention: 'latch',
      }),
      maxIter: reg.register({
        id: 'math.maxIter',
        label: 'Requested Max Iter',
        group: 'Math',
        type: 'analog',
        retention: 'latch',
      }),
      exponent: reg.register({
        id: 'math.exponent',
        label: 'Exponent',
        group: 'Math',
        type: 'analog',
        retention: 'latch',
      }),
      sliceAngle: reg.register({
        id: 'math.sliceAngle',
        label: 'Slice Angle',
        group: 'Math',
        type: 'analog',
        retention: 'latch',
      }),
      zr: reg.register({
        id: 'math.zr',
        label: 'Z_Real',
        group: 'Math',
        type: 'analog',
        retention: 'latch',
      }),
      zi: reg.register({
        id: 'math.zi',
        label: 'Z_Imag',
        group: 'Math',
        type: 'analog',
        retention: 'latch',
      }),
      cr: reg.register({
        id: 'math.cr',
        label: 'C_Real',
        group: 'Math',
        type: 'analog',
        retention: 'latch',
      }),
      ci: reg.register({
        id: 'math.ci',
        label: 'C_Imag',
        group: 'Math',
        type: 'analog',
        retention: 'latch',
      }),

      yieldIter: reg.register({
        id: 'cmd.yieldIter',
        label: 'Yield Iter Limit',
        group: 'Execution',
        type: 'analog',
        retention: 'lapse',
      }),
      loadCheckpoint: reg.register({
        id: 'cmd.loadCheckpoint',
        label: 'Load Checkpoint',
        group: 'Execution',
        type: 'digital',
        retention: 'lapse',
      }),
      advancePingPong: reg.register({
        id: 'cmd.advancePingPong',
        label: 'Advance Ping-Pong',
        group: 'Execution',
        type: 'digital',
        retention: 'lapse',
      }),
      clearCheckpoint: reg.register({
        id: 'cmd.clearCheckpoint',
        label: 'Clear Checkpoint',
        group: 'Execution',
        type: 'digital',
        retention: 'lapse',
      }),
      blendWeight: reg.register({
        id: 'cmd.blendWeight',
        label: 'Blend Weight',
        group: 'Execution',
        type: 'analog',
        retention: 'lapse',
      }),
      jitterX: reg.register({
        id: 'cmd.jitterX',
        label: 'Jitter X',
        group: 'Execution',
        type: 'analog',
        retention: 'lapse',
      }),
      jitterY: reg.register({
        id: 'cmd.jitterY',
        label: 'Jitter Y',
        group: 'Execution',
        type: 'analog',
        retention: 'lapse',
      }),
    };
  }

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

    const mode = this.getPipelineMode(isInteracting);
    const modeVal = mode === 'INTERACT' ? 0 : mode === 'DEEPENING' ? 1 : 2;

    this.channels.mode.set(modeVal);
    this.channels.budget.set(rawBudget);
    this.channels.renderscale.set(snapshotRenderScale);
    this.channels.saSkip.set(context.skipIter);

    this.channels.zoom.set(context.zoom);
    this.channels.maxIter.set(context.maxIter);
    this.channels.exponent.set(context.exponent);
    this.channels.sliceAngle.set(context.sliceAngle);
    this.channels.zr.set(context.zr);
    this.channels.zi.set(context.zi);
    this.channels.cr.set(context.cr);
    this.channels.ci.set(context.ci);

    this.channels.yieldIter.set(command.yieldIterLimit);
    this.channels.loadCheckpoint.set(command.loadCheckpoint ? 1 : 0);
    this.channels.advancePingPong.set(command.advancePingPong ? 1 : 0);
    this.channels.clearCheckpoint.set(command.clearCheckpoint ? 1 : 0);
    this.channels.blendWeight.set(command.blendWeight);
    this.channels.jitterX.set(command.jitterX);
    this.channels.jitterY.set(command.jitterY);

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
