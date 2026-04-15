import initWasm, { compute_mandelbrot } from './wasm/rust_math.js';

export type WorkerInputMessage = {
  id: number;
  type: 'COMPUTE';
  casesJson: string;
  maxIterations: number;
};

export type WorkerOutputMessage = {
  id: number;
  type: 'COMPUTE_RESULT';
  result: Float64Array;
};

let wasmInit: Promise<unknown> | null = null;

self.onmessage = async (e: MessageEvent<WorkerInputMessage>) => {
  const { id, type, casesJson, maxIterations } = e.data;

  if (type === 'COMPUTE') {
    if (!wasmInit) {
      wasmInit = initWasm();
    }
    await wasmInit;

    const t0 = performance.now();
    const resultData = compute_mandelbrot(casesJson, maxIterations);
    const t1 = performance.now();
    console.log(`[math-core] BLA Tree & Orbit Array compiled in ${(t1 - t0).toFixed(2)}ms`);

    // Explicitly copy the WASM-memory backed array into a native, standalone JS ArrayBuffer.
    // If we don't copy it, structured cloning will fail with a DataCloneError, or transferring it
    // will catastrophically detach the entire WASM memory block.
    const resultCopy = new Float64Array(resultData);

    // TS sometimes confuses self with Window instead of DedicatedWorkerGlobalScope
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (self as any).postMessage(
      {
        id,
        type: 'COMPUTE_RESULT',
        result: resultCopy,
      } as WorkerOutputMessage,
      [resultCopy.buffer], // Safe to transfer since it's a native copy
    );
  }
};
