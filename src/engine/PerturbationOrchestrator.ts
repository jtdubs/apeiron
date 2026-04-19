import { viewportStore, type ViewportState } from '../ui/stores/viewportStore';
import { TelemetryRegistry, type TelemetryChannel } from './debug/TelemetryRegistry';

export interface WorkerJob {
  id: number;
  anchorZr: string;
  anchorZi: string;
  anchorCr: string;
  anchorCi: string;
  deltaZr: number;
  deltaZi: number;
  deltaCr: number;
  deltaCi: number;
  initialDeltaZr: number;
  initialDeltaZi: number;
  initialDeltaCr: number;
  initialDeltaCi: number;
  exponent: number;
  paletteMaxIter: number;
  isRefining?: boolean;
}

export class PerturbationOrchestrator {
  private worker: Worker;
  private isWorkerBusy = false;
  private pendingWorkerJob: WorkerJob | null = null;
  private currentWorkerJob: WorkerJob | null = null;
  private timeoutId: number | null = null;
  private logTimeoutId: number | null = null;
  private unsubStore: () => void;
  private jobSequenceCounter = 0;
  private _isSynchronizingState = false;

  private channels: {
    dispatched: TelemetryChannel;
    active: TelemetryChannel;
    pending: TelemetryChannel;
    phase: TelemetryChannel;
    treeNodes: TelemetryChannel;
    btaLevel: TelemetryChannel;
    glitches: TelemetryChannel;
    refPeriod: TelemetryChannel;
  };

  constructor(workerFactory?: () => Worker) {
    const reg = TelemetryRegistry.getInstance();
    this.channels = {
      dispatched: reg.register({
        id: 'workers.dispatchedJobId',
        label: 'Job Dispatched',
        group: 'Workers',
        type: 'enum',
        retention: 'latch',
      }),
      active: reg.register({
        id: 'workers.activeJobId',
        label: 'Active Job ID',
        group: 'Workers',
        type: 'enum',
        retention: 'latch',
      }),
      pending: reg.register({
        id: 'workers.pendingJobCount',
        label: 'Pending Jobs',
        group: 'Workers',
        type: 'analog',
        retention: 'latch',
      }),
      phase: reg.register({
        id: 'workers.jobPhase',
        label: 'Job Phase',
        group: 'Workers',
        type: 'enum',
        retention: 'latch',
        enumValues: { 0: 'IDLE', 1: 'REFINING', 2: 'COMPUTING' },
      }),
      treeNodes: reg.register({
        id: 'workers.treeNodes',
        label: 'Tree Density',
        group: 'Workers',
        type: 'analog',
        retention: 'latch',
      }),
      btaLevel: reg.register({
        id: 'workers.btaLevel',
        label: 'BTA Skips (Grid)',
        group: 'Workers',
        type: 'analog',
        retention: 'latch',
      }),
      glitches: reg.register({
        id: 'workers.glitches',
        label: 'GPU Glitches',
        group: 'Workers',
        type: 'analog',
        retention: 'lapse',
        lapseValue: 0,
      }),
      refPeriod: reg.register({
        id: 'workers.refPeriod',
        label: 'Anchor Period',
        group: 'Workers',
        type: 'analog',
        retention: 'latch',
      }),
    };

    // If a mock is passed (for tests), use it. Otherwise statically construct Vite worker string.
    this.worker = workerFactory
      ? workerFactory()
      : new Worker(new URL('./math-workers/rust.worker.ts', import.meta.url), {
          type: 'module',
        });

    this.worker.onmessage = this.handleWorkerMessage.bind(this);
    this.unsubStore = viewportStore.subscribe(this.handleStoreChange.bind(this));

    // Bootstrap worker immediately on mount based on the initial store state
    this.handleStoreChange(viewportStore.getState());
  }

  private lastDeltaCr = 0;
  private lastDeltaCi = 0;
  private lastZoom = 0;
  private lastExponent = 2.0;

  private dispatchPendingWork() {
    if (this.pendingWorkerJob) {
      this.currentWorkerJob = this.pendingWorkerJob;
      this.pendingWorkerJob = null;
      this.isWorkerBusy = true;

      if (this.currentWorkerJob.isRefining) {
        this.worker.postMessage({
          id: this.currentWorkerJob.id,
          type: 'REFINE_REFERENCE',
          cr: this.currentWorkerJob.anchorCr,
          ci: this.currentWorkerJob.anchorCi,
          dcr: this.currentWorkerJob.deltaCr,
          dci: this.currentWorkerJob.deltaCi,
          max_iterations: this.currentWorkerJob.paletteMaxIter,
        });
        this.channels.phase.set(1);
      } else {
        this.worker.postMessage({
          id: this.currentWorkerJob.id,
          type: 'COMPUTE_REBASE',
          anchorZr: this.currentWorkerJob.anchorZr,
          anchorZi: this.currentWorkerJob.anchorZi,
          anchorCr: this.currentWorkerJob.anchorCr,
          anchorCi: this.currentWorkerJob.anchorCi,
          deltaZr: this.currentWorkerJob.deltaZr,
          deltaZi: this.currentWorkerJob.deltaZi,
          deltaCr: this.currentWorkerJob.deltaCr,
          deltaCi: this.currentWorkerJob.deltaCi,
          exponent: this.currentWorkerJob.exponent,
          paletteMaxIter: this.currentWorkerJob.paletteMaxIter,
        });
        this.channels.phase.set(2);
      }

      this.channels.dispatched.set(this.currentWorkerJob.id);
      this.channels.pending.set(1);
    } else {
      this.isWorkerBusy = false;
      this.currentWorkerJob = null;
      this.channels.pending.set(0);
      this.channels.phase.set(0);
    }
  }

  private handleWorkerMessage(e: MessageEvent) {
    if (e.data.type === 'REFINE_RESULT') {
      if (this.pendingWorkerJob !== null) {
        this.dispatchPendingWork();
      } else if (this.currentWorkerJob && this.currentWorkerJob.id === e.data.id) {
        console.log(
          `[PerturbationOrchestrator] Refined anchor: ${e.data.refType} (period: ${e.data.period}, pre-period: ${e.data.pre_period})`,
        );

        // Progress job to COMPUTE phase using the newly minted mathematically pure reference
        this.channels.refPeriod.set(e.data.period || 0);

        this.currentWorkerJob.isRefining = false;
        this.currentWorkerJob.anchorCr = e.data.cr;
        this.currentWorkerJob.anchorCi = e.data.ci;
        // The delta is completely absorbed since we're now mathematically exactly on the core point
        this.currentWorkerJob.deltaCr = 0.0;
        this.currentWorkerJob.deltaCi = 0.0;

        // Force Z back to 0 so the calculation executes from the anchor origin
        this.currentWorkerJob.anchorZr = '0';
        this.currentWorkerJob.anchorZi = '0';
        this.currentWorkerJob.deltaZr = 0.0;
        this.currentWorkerJob.deltaZi = 0.0;

        this.worker.postMessage({
          id: this.currentWorkerJob.id,
          type: 'COMPUTE_REBASE',
          anchorZr: this.currentWorkerJob.anchorZr,
          anchorZi: this.currentWorkerJob.anchorZi,
          anchorCr: this.currentWorkerJob.anchorCr,
          anchorCi: this.currentWorkerJob.anchorCi,
          deltaZr: this.currentWorkerJob.deltaZr,
          deltaZi: this.currentWorkerJob.deltaZi,
          deltaCr: this.currentWorkerJob.deltaCr,
          deltaCi: this.currentWorkerJob.deltaCi,
          exponent: this.currentWorkerJob.exponent,
          paletteMaxIter: this.currentWorkerJob.paletteMaxIter,
        });
      }
    } else if (e.data.type === 'COMPUTE_REBASE_RESULT' && e.data.orbit_nodes) {
      if (this.pendingWorkerJob !== null) {
        // User panned while we were waiting, discard obsolete result
        this.dispatchPendingWork();
      } else if (this.currentWorkerJob) {
        const job = this.currentWorkerJob;

        // Apply state synchronously to avoid tearing
        // Mathematical snapping: The viewport stays exactly where it is, but the anchor changes.
        this._isSynchronizingState = true;
        viewportStore.setState((state) => {
          // Precise delta rebasing without ever adding arbitrary precision strings to f64s locally
          const newDeltaCr = state.deltaCr - job.initialDeltaCr;
          const newDeltaCi = state.deltaCi - job.initialDeltaCi;
          const newDeltaZr = state.deltaZr - job.initialDeltaZr;
          const newDeltaZi = state.deltaZi - job.initialDeltaZi;

          return {
            anchorZr: e.data.abs_zr,
            anchorZi: e.data.abs_zi,
            anchorCr: e.data.abs_cr,
            anchorCi: e.data.abs_ci,
            deltaZr: newDeltaZr,
            deltaZi: newDeltaZi,
            deltaCr: newDeltaCr,
            deltaCi: newDeltaCi,
            refOrbitNodes: e.data.orbit_nodes,
            refMetadata: e.data.metadata,
            refBlaGridDs: e.data.bla_grid_ds,
            refBtaGrid: e.data.bta_grid,
          };
        });

        this.channels.active.set(job.id);
        this.channels.pending.set(0);
        this.channels.phase.set(0);

        // Expose new tree diagnostics
        if (e.data.orbit_nodes) {
          this.channels.treeNodes.set(e.data.orbit_nodes.length || 0);
        }
        if (e.data.bta_grid) {
          this.channels.btaLevel.set(e.data.bta_grid.length || 0);
        }

        this.isWorkerBusy = false;
        this.currentWorkerJob = null;
      }
    } else if (e.data.type === 'RESOLVE_GLITCHES_RESULT') {
      const newCr = e.data.new_cr;
      const newCi = e.data.new_ci;

      console.log(`[PerturbationOrchestrator] Glitch resolved to new anchor: ${newCr}, ${newCi}`);

      this._isSynchronizingState = true;
      viewportStore.setState((state) => {
        const newDeltaCr = state.deltaCr - e.data.glitch_dr;
        const newDeltaCi = state.deltaCi - e.data.glitch_di;

        return {
          anchorCr: newCr,
          anchorCi: newCi,
          deltaCr: newDeltaCr,
          deltaCi: newDeltaCi,
          refOrbitNodes: e.data.orbit_nodes,
          refMetadata: e.data.metadata,
          refBlaGridDs: e.data.bla_grid_ds,
          refBtaGrid: e.data.bta_grid,
        };
      });

      if (e.data.orbit_nodes) {
        this.channels.treeNodes.set(e.data.orbit_nodes.length || 0);
      }

      // Remove busy state if glitched job was acting as pending fallback
      this.isWorkerBusy = false;
      if (this.pendingWorkerJob !== null) {
        this.dispatchPendingWork();
      }
    }
  }

  private handleStoreChange(state: ViewportState) {
    if (this.logTimeoutId) window.clearTimeout(this.logTimeoutId);
    this.logTimeoutId = window.setTimeout(() => {
      console.log(
        `📍 Viewport Config - z_anchor: ${state.anchorZr}, ${state.anchorZi} | c_anchor: ${state.anchorCr}, ${state.anchorCi} | zoom: ${state.zoom}`,
      );
    }, 250);

    if (this._isSynchronizingState) {
      this._isSynchronizingState = false;
      this.lastDeltaCr = state.deltaCr;
      this.lastDeltaCi = state.deltaCi;
      this.lastZoom = state.zoom;
      this.lastExponent = state.exponent;
      return;
    }

    // Compute new orbits dynamically if deep zooming
    if (state.zoom < 1e-4) {
      if (
        state.deltaCr !== this.lastDeltaCr ||
        state.deltaCi !== this.lastDeltaCi ||
        state.zoom !== this.lastZoom ||
        state.exponent !== this.lastExponent
      ) {
        this.lastDeltaCr = state.deltaCr;
        this.lastDeltaCi = state.deltaCi;
        this.lastZoom = state.zoom;
        this.lastExponent = state.exponent;

        if (this.timeoutId) window.clearTimeout(this.timeoutId);
        this.timeoutId = window.setTimeout(() => {
          this.jobSequenceCounter++;

          const job: WorkerJob = {
            id: this.jobSequenceCounter,
            anchorZr: state.anchorZr,
            anchorZi: state.anchorZi,
            anchorCr: state.anchorCr,
            anchorCi: state.anchorCi,
            deltaZr: state.deltaZr,
            deltaZi: state.deltaZi,
            deltaCr: state.deltaCr,
            deltaCi: state.deltaCi,
            initialDeltaZr: state.deltaZr,
            initialDeltaZi: state.deltaZi,
            initialDeltaCr: state.deltaCr,
            initialDeltaCi: state.deltaCi,
            exponent: state.exponent,
            paletteMaxIter: state.paletteMaxIter,
            isRefining: state.exponent === 2.0,
          };

          this.pendingWorkerJob = job;
          if (!this.isWorkerBusy) {
            this.dispatchPendingWork();
          }
        }, 150);
      }
    } else {
      if (state.refOrbitNodes !== null) {
        viewportStore.setState({
          refOrbitNodes: null,
          refMetadata: null,
          refBlaGridDs: null,
          refBtaGrid: null,
        });
      }
    }
  }

  public destroy() {
    this.unsubStore();
    this.worker.terminate();
    if (this.timeoutId) window.clearTimeout(this.timeoutId);
    if (this.logTimeoutId) window.clearTimeout(this.logTimeoutId);
  }

  public reportGlitches(glitches: { x: number; y: number }[]) {
    const state = viewportStore.getState();
    const rectWidth = window.innerWidth;
    const rectHeight = window.innerHeight;
    const aspect = rectWidth / rectHeight;

    // Transform coordinates from px to delta C relative to screen center
    const translatedGlitches = glitches.map((g) => {
      const ndcX = ((g.x + 0.5) / rectWidth) * 2.0 - 1.0;
      const ndcY = 1.0 - ((g.y + 0.5) / rectHeight) * 2.0; // WebGPU Y is up

      const offsetR = ndcX * state.zoom * aspect;
      const offsetI = ndcY * state.zoom;

      const cosAngle = Math.cos(state.sliceAngle);
      const sinAngle = Math.sin(state.sliceAngle);

      const rotR = offsetR * cosAngle - offsetI * sinAngle;
      const rotI = offsetR * sinAngle + offsetI * cosAngle;

      const deltaCr = state.deltaCr + rotR;
      const deltaCi = state.deltaCi + rotI;

      return { delta_cr: deltaCr, delta_ci: deltaCi };
    });

    // De-duplicate mathematically tight clusters (within f64 epsilons)
    const uniqueMap = new Map<string, { delta_cr: number; delta_ci: number }>();
    for (const g of translatedGlitches) {
      const key = `${g.delta_cr.toExponential(5)}_${g.delta_ci.toExponential(5)}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, g);
      }
    }
    const deduplicated = Array.from(uniqueMap.values());

    if (deduplicated.length > 0) {
      this.channels.glitches.set(deduplicated.length);

      this.worker.postMessage({
        id: ++this.jobSequenceCounter,
        type: 'RESOLVE_GLITCHES',
        glitches: deduplicated,
        paletteMaxIter: state.paletteMaxIter,
      });
    }
  }
}
