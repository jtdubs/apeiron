import { viewportStore, type ViewportState } from '../ui/stores/viewportStore';
import { TelemetryRegistry, type TelemetryChannel } from './debug/TelemetryRegistry';

export interface WorkerJob {
  id: number;
  absZr: string;
  absZi: string;
  absCr: string;
  absCi: string;
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

  private channels: {
    dispatched: TelemetryChannel;
    active: TelemetryChannel;
    pending: TelemetryChannel;
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

  private dispatchPendingWork() {
    if (this.pendingWorkerJob) {
      this.currentWorkerJob = this.pendingWorkerJob;
      this.pendingWorkerJob = null;
      this.isWorkerBusy = true;

      if (this.currentWorkerJob.isRefining) {
        this.worker.postMessage({
          id: this.currentWorkerJob.id,
          type: 'REFINE_REFERENCE',
          cr: this.currentWorkerJob.absCr,
          ci: this.currentWorkerJob.absCi,
          max_iterations: this.currentWorkerJob.paletteMaxIter,
        });
      } else {
        const casesJson = JSON.stringify([
          {
            zr: this.currentWorkerJob.absZr,
            zi: this.currentWorkerJob.absZi,
            cr: this.currentWorkerJob.absCr,
            ci: this.currentWorkerJob.absCi,
            exponent: this.currentWorkerJob.exponent,
          },
        ]);

        this.worker.postMessage({
          id: this.currentWorkerJob.id,
          type: 'COMPUTE',
          casesJson,
          paletteMaxIter: this.currentWorkerJob.paletteMaxIter,
        });
      }

      this.channels.dispatched.set(this.currentWorkerJob.id);
      this.channels.pending.set(1);
    } else {
      this.isWorkerBusy = false;
      this.currentWorkerJob = null;
      this.channels.pending.set(0);
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
        this.currentWorkerJob.isRefining = false;
        this.currentWorkerJob.absCr = e.data.cr.toString();
        this.currentWorkerJob.absCi = e.data.ci.toString();
        // Force Z back to 0 so the calculation executes from the anchor origin
        this.currentWorkerJob.absZr = '0';
        this.currentWorkerJob.absZi = '0';

        const casesJson = JSON.stringify([
          {
            zr: this.currentWorkerJob.absZr,
            zi: this.currentWorkerJob.absZi,
            cr: this.currentWorkerJob.absCr,
            ci: this.currentWorkerJob.absCi,
            exponent: this.currentWorkerJob.exponent,
          },
        ]);

        this.worker.postMessage({
          id: this.currentWorkerJob.id,
          type: 'COMPUTE',
          casesJson,
          paletteMaxIter: this.currentWorkerJob.paletteMaxIter,
        });
      }
    } else if (e.data.type === 'COMPUTE_RESULT' && e.data.orbit_nodes) {
      if (this.pendingWorkerJob !== null) {
        // User panned while we were waiting, discard obsolete result
        this.dispatchPendingWork();
      } else if (this.currentWorkerJob) {
        const job = this.currentWorkerJob;

        // Apply state synchronously to avoid tearing
        // Mathematical snapping: The viewport stays exactly where it is, but the anchor changes.
        viewportStore.setState((state) => {
          const currentAbsoluteCr = parseFloat(state.anchorCr) + state.deltaCr;
          const currentAbsoluteCi = parseFloat(state.anchorCi) + state.deltaCi;
          const currentAbsoluteZr = parseFloat(state.anchorZr) + state.deltaZr;
          const currentAbsoluteZi = parseFloat(state.anchorZi) + state.deltaZi;

          const newDeltaCr = currentAbsoluteCr - parseFloat(job.absCr);
          const newDeltaCi = currentAbsoluteCi - parseFloat(job.absCi);
          const newDeltaZr = currentAbsoluteZr - parseFloat(job.absZr);
          const newDeltaZi = currentAbsoluteZi - parseFloat(job.absZi);

          return {
            anchorZr: job.absZr,
            anchorZi: job.absZi,
            anchorCr: job.absCr,
            anchorCi: job.absCi,
            deltaZr: newDeltaZr,
            deltaZi: newDeltaZi,
            deltaCr: newDeltaCr,
            deltaCi: newDeltaCi,
            refOrbitNodes: e.data.orbit_nodes,
            refMetadata: e.data.metadata,
            refBlaGrid: e.data.bla_grid,
            refBlaGridDs: e.data.bla_grid_ds,
            refBtaGrid: e.data.bta_grid,
          };
        });

        this.channels.active.set(job.id);
        this.channels.pending.set(0);

        this.isWorkerBusy = false;
        this.currentWorkerJob = null;
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

    // Compute new orbits dynamically if deep zooming
    if (state.zoom < 1e-4) {
      if (
        state.deltaCr !== this.lastDeltaCr ||
        state.deltaCi !== this.lastDeltaCi ||
        state.zoom !== this.lastZoom
      ) {
        this.lastDeltaCr = state.deltaCr;
        this.lastDeltaCi = state.deltaCi;
        this.lastZoom = state.zoom;

        if (this.timeoutId) window.clearTimeout(this.timeoutId);
        this.timeoutId = window.setTimeout(() => {
          const absZr = (parseFloat(state.anchorZr) + state.deltaZr).toString();
          const absZi = (parseFloat(state.anchorZi) + state.deltaZi).toString();
          const absCr = (parseFloat(state.anchorCr) + state.deltaCr).toString();
          const absCi = (parseFloat(state.anchorCi) + state.deltaCi).toString();

          this.jobSequenceCounter++;

          const job: WorkerJob = {
            id: this.jobSequenceCounter,
            absZr,
            absZi,
            absCr,
            absCi,
            exponent: state.exponent,
            paletteMaxIter: state.paletteMaxIter,
            isRefining: true,
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
          refBlaGrid: null,
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
}
