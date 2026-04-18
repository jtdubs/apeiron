import initWasm, { compute_mandelbrot } from './wasm/rust_math.js';

export type WorkerInputMessage = {
  id: number;
  type: 'COMPUTE';
  casesJson: string;
  paletteMaxIter: number;
};

export type WorkerOutputMessage = {
  id: number;
  type: 'COMPUTE_RESULT';
  orbit_nodes: Float64Array;
  metadata: Float64Array;
  bla_grid: Float64Array;
};

let wasmInit: Promise<unknown> | null = null;

self.onmessage = async (e: MessageEvent<WorkerInputMessage>) => {
  const { id, type, casesJson, paletteMaxIter } = e.data;

  if (type === 'COMPUTE') {
    if (!wasmInit) {
      wasmInit = initWasm();
    }
    await wasmInit;

    const t0 = performance.now();
    const payload = compute_mandelbrot(casesJson, paletteMaxIter);
    const t1 = performance.now();
    console.log(`[math-core] BLA Tree & Orbit Array compiled in ${(t1 - t0).toFixed(2)}ms`);

    // Explicitly copy the WASM-memory backed array into a native, standalone JS ArrayBuffer.
    const orbit_nodes = new Float64Array(payload.orbit_nodes);
    const metadata = new Float64Array(payload.metadata);
    const bla_grid = new Float64Array(payload.bla_grid);

    // Free the WASM memory pointer
    payload.free();

    // TS sometimes confuses self with Window instead of DedicatedWorkerGlobalScope
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (self as any).postMessage(
      {
        id,
        type: 'COMPUTE_RESULT',
        orbit_nodes,
        metadata,
        bla_grid,
      } as WorkerOutputMessage,
      [orbit_nodes.buffer, metadata.buffer, bla_grid.buffer],
    );
  }
};
