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

    const result = compute_mandelbrot(casesJson, maxIterations);

    // The result from compute_mandelbrot is a js_sys::Float64Array.
    // wasm-bindgen handles copying this data into the JS heap, meaning we
    // do not need to call .free() as the JS Garbage Collector manages it.

    self.postMessage(
      {
        id,
        type: 'COMPUTE_RESULT',
        result,
      } as WorkerOutputMessage,
      [result.buffer],
    );
  }
};
