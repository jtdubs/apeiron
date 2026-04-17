import type { MathContext, ExecutionCommand } from './RenderFrameDescriptor';
import { TelemetryRegistry, type TelemetryChannel } from './debug/TelemetryRegistry';

export function contextsEqual(a: MathContext, b: MathContext): boolean {
  return (
    a.zr === b.zr &&
    a.zi === b.zi &&
    a.cr === b.cr &&
    a.ci === b.ci &&
    a.zoom === b.zoom &&
    a.computeMaxIter === b.computeMaxIter &&
    a.paletteMaxIter === b.paletteMaxIter &&
    a.exponent === b.exponent &&
    a.refOrbits === b.refOrbits &&
    a.skipIter === b.skipIter
  );
}

export class ProgressiveRenderScheduler {
  private accumulationCount = 0;
  private isDeepening = true;
  private isFirstSlice = true;
  private cycleJitterX = 0;
  private cycleJitterY = 0;

  private channels: {
    mode: TelemetryChannel;
    renderscale: TelemetryChannel;
    saSkip: TelemetryChannel;
    zoom: TelemetryChannel;
    computeMaxIter: TelemetryChannel;
    exponent: TelemetryChannel;
    sliceAngle: TelemetryChannel;
    zr: TelemetryChannel;
    zi: TelemetryChannel;
    cr: TelemetryChannel;
    ci: TelemetryChannel;
    stepLimit: TelemetryChannel;
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
        enumValues: { 0: 'INTERACT', 1: 'DEEPENING', 2: 'ACCUM', 3: 'IDLE' },
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
      computeMaxIter: reg.register({
        id: 'math.computeMaxIter',
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

      stepLimit: reg.register({
        id: 'cmd.stepLimit',
        label: 'Step Limit',
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

  public getIsDeepening(): boolean {
    return this.isDeepening;
  }

  public update(
    context: MathContext,
    isInteracting: boolean,
    canvasSizeVersion: number,
    themeVersion: number,
    snapshotRenderScale: number,
    canvasWidth: number,
    canvasHeight: number,
    stepLimit: number,
    isTargetMet: boolean,
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
      this.isDeepening = true;
      this.isFirstSlice = true;
      this.cycleJitterX = 0;
      this.cycleJitterY = 0;
    } else if (isTargetMet && this.isDeepening) {
      this.isDeepening = false;
      this.accumulationCount++;
      this.isFirstSlice = true;
    } else if (!this.isDeepening) {
      if (isTargetMet) {
        this.accumulationCount++;
        this.isFirstSlice = true;
      } else {
        this.isFirstSlice = false;
      }
    } else {
      this.isFirstSlice = false;
    }

    if (!isInteracting && this.accumulationCount >= this.MAX_ACCUM_FRAMES) {
      this.channels.mode.set(3);
      return null; // RESOLVED state
    }

    const isFirstSliceVal = this.isFirstSlice;

    const advancePingPong = isFirstSliceVal;
    const clearCheckpoint = isFirstSliceVal && this.accumulationCount > 0;

    const blendWeight = this.accumulationCount > 0 ? 1.0 / (this.accumulationCount + 1) : 0.0;
    const loadCheckpoint = this.accumulationCount > 0 || !isFirstSliceVal;

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
      stepLimit,
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
    this.channels.renderscale.set(snapshotRenderScale);
    this.channels.saSkip.set(context.skipIter);

    this.channels.zoom.set(context.zoom);
    this.channels.computeMaxIter.set(context.computeMaxIter);
    this.channels.exponent.set(context.exponent);
    this.channels.sliceAngle.set(context.sliceAngle);
    this.channels.zr.set(context.zr);
    this.channels.zi.set(context.zi);
    this.channels.cr.set(context.cr);
    this.channels.ci.set(context.ci);

    this.channels.stepLimit.set(command.stepLimit);
    this.channels.loadCheckpoint.set(command.loadCheckpoint ? 1 : 0);
    this.channels.advancePingPong.set(command.advancePingPong ? 1 : 0);
    this.channels.clearCheckpoint.set(command.clearCheckpoint ? 1 : 0);
    this.channels.blendWeight.set(command.blendWeight);
    this.channels.jitterX.set(command.jitterX);
    this.channels.jitterY.set(command.jitterY);

    this.isFirstSlice = false;

    return command;
  }

  public getPipelineMode(isInteracting: boolean): 'INTERACT' | 'ACCUMULATING' | 'DEEPENING' {
    if (isInteracting) return 'INTERACT';
    if (this.isDeepening) return 'DEEPENING';
    return 'ACCUMULATING';
  }
}
