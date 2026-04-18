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
    mathMode: TelemetryChannel;
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
      mathMode: reg.register({
        id: 'engine.math_mode',
        label: 'Compute Backend',
        group: 'Engine',
        type: 'enum',
        retention: 'latch',
        enumValues: {
          0: 'f32',
          1: 'f32p',
          2: 'f64p',
        },
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
    const targetIter = Math.max(150, Math.floor(state.paletteMaxIter * 0.33));

    if (!isInteracting && this.wasInteracting) {
      this.adrs.reset(targetIter);
      // Optional future: seed budget with ADRS performance insight
      this.budget.reset();
    }
    this.wasInteracting = isInteracting;

    let snapshotRenderScale = 1.0;
    let interactMaxIterOverride: number | null = null;
    let stepLimit = 1000;

    if (isInteracting) {
      const adrsState = this.adrs.update(gpuMs, targetIter);
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

    let effectiveMathMode = 0;
    if (theme.renderMode === 'auto') {
      if (state.refOrbitNodes !== null && state.zoom < 1e-9 && state.exponent === 2.0) {
        effectiveMathMode = 2; // DS
      } else if (state.refOrbitNodes !== null && state.zoom < 5e-4) {
        effectiveMathMode = 1; // f32 Perturbation
      } else {
        effectiveMathMode = 0; // f32
      }
    } else {
      effectiveMathMode =
        theme.renderMode === 'f64_perturbation' && state.exponent === 2.0
          ? 2
          : theme.renderMode === 'f64_perturbation' || theme.renderMode === 'f32_perturbation'
            ? 1
            : 0;
      if (effectiveMathMode > 0 && state.refOrbitNodes === null) {
        effectiveMathMode = 0;
      }
    }

    this.devChannels.mathMode.set(effectiveMathMode);

    // Isolate context generation
    const context = buildMathContext(
      state,
      theme,
      canvasWidth,
      canvasHeight,
      interactMaxIterOverride,
      effectiveMathMode,
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
