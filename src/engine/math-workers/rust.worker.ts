import initWasm, { refine_reference } from './wasm/rust_math.js';

export type WorkerInputMessage =
  | {
      id: number;
      type: 'COMPUTE';
      casesJson: string;
      paletteMaxIter: number;
    }
  | {
      id: number;
      type: 'REFINE_REFERENCE';
      cr: string;
      ci: string;
      max_iterations: number;
    }
  | {
      id: number;
      type: 'RESOLVE_GLITCHES';
      glitches: { delta_cr: number; delta_ci: number }[];
      paletteMaxIter: number;
    };

export type WorkerOutputMessage =
  | {
      id: number;
      type: 'COMPUTE_RESULT';
      orbit_nodes: Float64Array;
      metadata: Float64Array;
      bla_grid_ds: Float64Array;
      bta_grid: Float64Array;
    }
  | {
      id: number;
      type: 'REFINE_RESULT';
      cr: number;
      ci: number;
      refType: string;
      period: number;
      pre_period: number;
    }
  | {
      id: number;
      type: 'RESOLVE_GLITCHES_RESULT';
      new_cr: string;
      new_ci: string;
      glitch_dr: number;
      glitch_di: number;
      orbit_nodes: Float64Array;
      metadata: Float64Array;
      bla_grid_ds: Float64Array;
      bta_grid: Float64Array;
    };

let wasmInit: Promise<unknown> | null = null;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
let referenceTree: any = null;
let currentAnchorId: number = 0;

self.onmessage = async (e: MessageEvent<WorkerInputMessage>) => {
  const msg = e.data;

  if (msg.type === 'COMPUTE') {
    if (!wasmInit) {
      wasmInit = initWasm();
    }
    await wasmInit;

    // A hack to access initWasm.ReferenceTree via window without explicit import name
    if (!referenceTree) {
      const { ReferenceTree } = await import('./wasm/rust_math.js');
      referenceTree = new ReferenceTree();
    }

    const { compute_payload } = await import('./wasm/rust_math.js');

    const cases = JSON.parse(msg.casesJson);
    if (cases.length > 0) {
      currentAnchorId = referenceTree.alloc_node(
        cases[0].cr,
        cases[0].ci,
        cases[0].exponent || 2.0,
      );
    }

    const t0 = performance.now();
    const payload = compute_payload(
      referenceTree,
      currentAnchorId,
      msg.casesJson,
      msg.paletteMaxIter,
    );
    const t1 = performance.now();
    console.log(`[math-core] BLA Tree & Orbit Array compiled in ${(t1 - t0).toFixed(2)}ms`);

    // Explicitly copy the WASM-memory backed array into a native, standalone JS ArrayBuffer.
    const orbit_nodes = new Float64Array(payload.orbit_nodes);
    const metadata = new Float64Array(payload.metadata);
    const bla_grid_ds = new Float64Array(payload.bla_grid_ds);
    const bta_grid = new Float64Array(payload.bta_grid);

    // Free the WASM memory pointer
    payload.free();

    // TS sometimes confuses self with Window instead of DedicatedWorkerGlobalScope
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (self as any).postMessage(
      {
        id: e.data.id,
        type: 'COMPUTE_RESULT',
        orbit_nodes,
        metadata,
        bla_grid_ds,
        bta_grid,
      } as WorkerOutputMessage,
      [orbit_nodes.buffer, metadata.buffer, bla_grid_ds.buffer, bta_grid.buffer],
    );
  } else if (e.data.type === 'REFINE_REFERENCE') {
    if (!wasmInit) {
      wasmInit = initWasm();
    }
    await wasmInit;

    const t0 = performance.now();
    const result = refine_reference(e.data.cr, e.data.ci, e.data.max_iterations);
    const t1 = performance.now();
    console.log(`[math-core] Reference refined in ${(t1 - t0).toFixed(2)}ms`);

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (self as any).postMessage({
      id: e.data.id,
      type: 'REFINE_RESULT',
      cr: result.cr,
      ci: result.ci,
      refType: result.ref_type,
      period: result.period,
      pre_period: result.pre_period,
    } as WorkerOutputMessage);

    result.free();
  } else if (e.data.type === 'RESOLVE_GLITCHES') {
    if (!wasmInit) {
      wasmInit = initWasm();
    }
    await wasmInit;

    if (!referenceTree) {
      const { ReferenceTree } = await import('./wasm/rust_math.js');
      referenceTree = new ReferenceTree();
    }

    const { resolve_glitches } = await import('./wasm/rust_math.js');

    const t0 = performance.now();
    // Use the TS engine state parameter `paletteMaxIter` as the reference max iter
    const payload = resolve_glitches(
      referenceTree,
      currentAnchorId,
      JSON.stringify(e.data.glitches),
      e.data.paletteMaxIter,
    );
    const t1 = performance.now();
    console.log(`[math-core] Resolution Glitches compiled in ${(t1 - t0).toFixed(2)}ms`);

    // Explicitly copy WASM-memory
    const orbit_nodes = new Float64Array(payload.orbit_nodes);
    const metadata = new Float64Array(payload.metadata);
    const bla_grid_ds = new Float64Array(payload.bla_grid_ds);
    const bta_grid = new Float64Array(payload.bta_grid);

    const new_cr = payload.new_cr;
    const new_ci = payload.new_ci;
    const glitch_dr = payload.glitch_dr;
    const glitch_di = payload.glitch_di;

    payload.free();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (self as any).postMessage(
      {
        id: e.data.id,
        type: 'RESOLVE_GLITCHES_RESULT',
        new_cr,
        new_ci,
        glitch_dr,
        glitch_di,
        orbit_nodes,
        metadata,
        bla_grid_ds,
        bta_grid,
      } as WorkerOutputMessage,
      [orbit_nodes.buffer, metadata.buffer, bla_grid_ds.buffer, bta_grid.buffer],
    );
  }
};
