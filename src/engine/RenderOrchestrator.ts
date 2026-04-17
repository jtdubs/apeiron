import type { ViewportState } from '../ui/stores/viewportStore';
import type { RenderState } from '../ui/stores/renderStore';
import type { RenderFrameDescriptor } from './RenderFrameDescriptor';
import { ProgressiveRenderScheduler } from './ProgressiveRenderScheduler';
import { AdaptiveDRSController } from './AdaptiveDRS';
import { IterationBudgetController } from './IterationBudgetController';
import { buildMathContext } from '../ui/stores/mathContextAdapter';
import { TelemetryRegistry, type TelemetryChannel } from './debug/TelemetryRegistry';

export class RenderOrchestrator {
  private scheduler = new ProgressiveRenderScheduler();
  private adrs = new AdaptiveDRSController();
  private budget = new IterationBudgetController(14);
  private wasInteracting = false;

  private devChannels: {
    budget: TelemetryChannel;
    adrsScale: TelemetryChannel;
    adrsIter: TelemetryChannel;
  };

  constructor() {
    const reg = TelemetryRegistry.getInstance();
    this.devChannels = {
      budget: reg.register({
        id: 'engine.budget',
        label: 'Iteration Budget',
        group: 'FSM',
        type: 'analog',
        retention: 'latch',
        smoothingAlpha: 0.1,
      }),
      adrsScale: reg.register({
        id: 'engine.adrsScale',
        label: 'ADRS Scale',
        group: 'WebGPU',
        type: 'analog',
        retention: 'latch',
      }),
      adrsIter: reg.register({
        id: 'engine.adrsIter',
        label: 'ADRS Max Iter',
        group: 'WebGPU',
        type: 'analog',
        retention: 'latch',
      }),
    };
  }

  public tick(
    state: ViewportState,
    theme: RenderState,
    gpuMs: number,
    isTargetMet: boolean,
    canvasWidth: number,
    canvasHeight: number,
    canvasSizeVersion: number,
  ): RenderFrameDescriptor | null {
    const isInteracting = state.interactionState !== 'STATIC';
    const renderDpr = window.devicePixelRatio || 1;

    // Reset controllers on state transition
    if (!isInteracting && this.wasInteracting) {
      this.adrs.reset();
      // Optional future: seed budget with ADRS performance insight
      this.budget.reset();
    }
    this.wasInteracting = isInteracting;

    let snapshotRenderScale = 1.0;
    let interactMaxIterOverride: number | null = null;
    let stepLimit = 1000;

    if (isInteracting) {
      const adrsState = this.adrs.update(gpuMs);
      snapshotRenderScale = adrsState.renderScale / renderDpr;
      interactMaxIterOverride = adrsState.effectiveMaxIter;

      // Step limit is naturally dictated by ADRS override during interaction
      stepLimit = adrsState.effectiveMaxIter;

      this.devChannels.adrsScale.set(adrsState.renderScale);
      this.devChannels.adrsIter.set(adrsState.effectiveMaxIter);
      this.devChannels.budget.set(stepLimit);
    } else {
      stepLimit = this.budget.update(Math.max(1, gpuMs));

      this.devChannels.adrsScale.set(1.0);
      this.devChannels.adrsIter.set(0);
      this.devChannels.budget.set(stepLimit);
    }

    // Isolate context generation
    const context = buildMathContext(
      state,
      theme,
      canvasWidth,
      canvasHeight,
      interactMaxIterOverride,
    );

    // Feed FSM
    const command = this.scheduler.update(
      context,
      isInteracting,
      canvasSizeVersion,
      theme.themeVersion,
      snapshotRenderScale,
      canvasWidth,
      canvasHeight,
      stepLimit,
      isTargetMet,
    );

    if (!command) {
      return null;
    }

    return {
      context,
      command,
      theme,
    };
  }
}
