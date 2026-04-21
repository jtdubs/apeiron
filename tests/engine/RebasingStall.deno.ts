import { PerturbationOrchestrator } from '../../src/engine/PerturbationOrchestrator.ts';
import { viewportStore } from '../../src/ui/stores/viewportStore.ts';
import path from 'node:path';

// Mock window for Deno
// eslint-disable-next-line @typescript-eslint/no-explicit-any
(globalThis as any).window = globalThis;

async function runTest() {
  console.log('--- Rebasing Stall Verification ---');

  // We construct a worker purely to watch its message turnaround time.
  const workerPath = path.resolve('./src/engine/math-workers/rust.worker.ts');

  // We'll mock the worker for the Orchestrator, but really run the real worker code
  const workerFactory = () => {
    return new Worker(new URL(`file://${workerPath}`).href, { type: 'module' });
  };

  const orchestrator = new PerturbationOrchestrator(workerFactory);

  console.log('\n[TEST 1] Testing f32 to f32p Transition Wait Time');

  const cr = -1.78643;
  const ci = 0.0;

  // Simulate zoom = 1.05e-4
  viewportStore.setState({
    anchorZr: '0',
    anchorZi: '0',
    anchorCr: '0', // The UI usually starts anchor at 0
    anchorCi: '0',
    deltaZr: 0,
    deltaZi: 0,
    deltaCr: cr,
    deltaCi: ci,
    zoom: 1.05e-4,
    paletteMaxIter: 2048,
    exponent: 2.0,
  });

  // Wait briefly to let the orchestrator settle from initial startup (debounced)
  await new Promise((resolve) => setTimeout(resolve, 500));

  // Verify it's idle
  if (viewportStore.getState().isWorkerBusy) {
    console.log('Worker is inexplicably busy before precision crossover.');
  }

  console.log(`Setting zoom to 9.95e-5 to cross threshold and trigger REBASING_WAIT`);
  const t0 = performance.now();

  // State change triggers orchestrator to dispatch REFINE_REFERENCE
  viewportStore.setState({
    zoom: 9.95e-5,
  });

  // Wait for the worker to become busy (debounce is 150ms)
  await new Promise((resolve) => setTimeout(resolve, 200));

  if (!viewportStore.getState().isWorkerBusy) {
    console.error('FAIL: Orchestrator did not enter busy state.');
    Deno.exit(1);
  }

  // Poll until it finishes
  while (viewportStore.getState().isWorkerBusy) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    const elapsed = performance.now() - t0;
    if (elapsed > 5000) {
      console.error(`FAIL: Worker has stalled for >5000ms! Bug reproduced.`);
      Deno.exit(1);
    }
  }

  const t1 = performance.now();
  console.log(`Worker completed transitioning in ${(t1 - t0).toFixed(2)}ms`);

  const resultingState = viewportStore.getState();
  console.log(`New Anchor: `);
  console.log(`Cr: ${resultingState.anchorCr}`);
  console.log(`Ci: ${resultingState.anchorCi}`);

  orchestrator.destroy();
}

runTest()
  .then(() => {
    console.log('\nVerification complete. Exiting.');
    Deno.exit(0);
  })
  .catch((e) => {
    console.error('Fatal Test Error:', e);
    Deno.exit(1);
  });
