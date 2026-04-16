import { viewportStore, type ViewportState } from '../ui/stores/viewportStore';
import { TelemetryRegistry, type TelemetryChannel } from './debug/TelemetryRegistry';

export interface WorkerJob {
  id: number;
  absZr: string;
  absZi: string;
  absCr: string;
  absCi: string;
  exponent: number;
  maxIter: number;
}

export class PerturbationOrchestrator {
  private worker: Worker;
  private isWorkerBusy = false;
  private pendingWorkerJob: WorkerJob | null = null;
  private currentWorkerJob: WorkerJob | null = null;
  private timeoutId: number | null = null;
  private logTimeoutId: number | null = null;
  private unsubStore: () => void;

  private channels: {
    latency: TelemetryChannel;
    pendingJobs: TelemetryChannel;
  };

  constructor(workerFactory?: () => Worker) {
    const reg = TelemetryRegistry.getInstance();
    this.channels = {
      latency: reg.register({
        id: 'workers.latency',
        label: 'Worker Latency',
        group: 'Workers',
        type: 'analog',
        smoothingAlpha: 0.2,
      }),
      pendingJobs: reg.register({
        id: 'workers.pendingJobCount',
        label: 'Pending Jobs',
        group: 'Workers',
        type: 'analog',
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
  }

  private dispatchPendingWork() {
    if (this.pendingWorkerJob) {
      this.currentWorkerJob = this.pendingWorkerJob;
      this.pendingWorkerJob = null;
      this.isWorkerBusy = true;

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
        maxIterations: this.currentWorkerJob.maxIter,
      });
      this.channels.pendingJobs.push(1);
    } else {
      this.isWorkerBusy = false;
      this.currentWorkerJob = null;
      this.channels.pendingJobs.push(0);
    }
  }

  private handleWorkerMessage(e: MessageEvent) {
    if (e.data.type === 'COMPUTE_RESULT' && e.data.result) {
      if (this.pendingWorkerJob !== null) {
        // User panned while we were waiting, discard obsolete result
        this.dispatchPendingWork();
      } else if (this.currentWorkerJob) {
        const job = this.currentWorkerJob;

        const latency = performance.now() - job.id;
        this.channels.latency.push(latency);
        this.channels.pendingJobs.push(this.pendingWorkerJob ? 1 : 0);

        // Apply state synchronously to avoid tearing
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
            refOrbits: e.data.result,
          };
        });

        this.isWorkerBusy = false;
        this.currentWorkerJob = null;
      }
    }
  }

  private handleStoreChange(state: ViewportState, prevState: ViewportState) {
    if (this.logTimeoutId) window.clearTimeout(this.logTimeoutId);
    this.logTimeoutId = window.setTimeout(() => {
      console.log(
        `📍 Viewport Config - z_anchor: ${state.anchorZr}, ${state.anchorZi} | c_anchor: ${state.anchorCr}, ${state.anchorCi} | zoom: ${state.zoom}`,
      );
    }, 250);

    // Compute new orbits dynamically if deep zooming
    if (state.zoom < 1e-4) {
      if (
        state.deltaCr !== prevState.deltaCr ||
        state.deltaCi !== prevState.deltaCi ||
        state.zoom !== prevState.zoom
      ) {
        if (this.timeoutId) window.clearTimeout(this.timeoutId);
        this.timeoutId = window.setTimeout(() => {
          const absZr = (parseFloat(state.anchorZr) + state.deltaZr).toString();
          const absZi = (parseFloat(state.anchorZi) + state.deltaZi).toString();
          const absCr = (parseFloat(state.anchorCr) + state.deltaCr).toString();
          const absCi = (parseFloat(state.anchorCi) + state.deltaCi).toString();

          const job: WorkerJob = {
            id: performance.now(),
            absZr,
            absZi,
            absCr,
            absCi,
            exponent: state.exponent,
            maxIter: state.maxIter,
          };

          this.pendingWorkerJob = job;
          if (!this.isWorkerBusy) {
            this.dispatchPendingWork();
          }
        }, 150);
      }
    } else {
      if (state.refOrbits !== null) {
        viewportStore.setState({ refOrbits: null });
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
