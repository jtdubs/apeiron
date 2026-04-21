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
      type: 'COMPUTE_REBASE';
      anchorZr: string;
      anchorZi: string;
      anchorCr: string;
      anchorCi: string;
      deltaZr: number;
      deltaZi: number;
      deltaCr: number;
      deltaCi: number;
      exponent: number;
      paletteMaxIter: number;
    }
  | {
      id: number;
      type: 'REFINE_REFERENCE';
      cr: string;
      ci: string;
      dcr: number;
      dci: number;
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
      type: 'COMPUTE_REBASE_RESULT';
      abs_zr: string;
      abs_zi: string;
      abs_cr: string;
      abs_ci: string;
      orbit_nodes: Float64Array;
      metadata: Float64Array;
      bla_grid_ds: Float64Array;
      bta_grid: Float64Array;
    }
  | {
      id: number;
      type: 'REFINE_RESULT';
      cr: string;
      ci: string;
      refType: string;
      period: number;
      pre_period: number;
      offset_cr: number;
      offset_ci: number;
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
      reference_tree_flat: Float64Array;
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

    const orbit_nodes = new Float64Array(payload.orbit_nodes);
    const metadata = new Float64Array(payload.metadata);
    const bla_grid_ds = new Float64Array(payload.bla_grid_ds);
    const bta_grid = new Float64Array(payload.bta_grid);

    payload.free();

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
  } else if (msg.type === 'COMPUTE_REBASE') {
    if (!wasmInit) {
      wasmInit = initWasm();
    }
    await wasmInit;

    if (!referenceTree) {
      const { ReferenceTree } = await import('./wasm/rust_math.js');
      referenceTree = new ReferenceTree();
    }

    const { compute_payload, rebase_origin } = await import('./wasm/rust_math.js');

    const t0_rebase = performance.now();
    const rebase_result = rebase_origin(
      msg.anchorZr,
      msg.anchorZi,
      msg.anchorCr,
      msg.anchorCi,
      msg.deltaZr,
      msg.deltaZi,
      msg.deltaCr,
      msg.deltaCi,
    );
    const absZr = rebase_result.zr;
    const absZi = rebase_result.zi;
    const absCr = rebase_result.cr;
    const absCi = rebase_result.ci;
    rebase_result.free();
    const t1_rebase = performance.now();
    console.log(`[math-core] Origin rebasing completed in ${(t1_rebase - t0_rebase).toFixed(2)}ms`);

    const casesJson = JSON.stringify([
      {
        zr: absZr,
        zi: absZi,
        cr: absCr,
        ci: absCi,
        exponent: msg.exponent,
      },
    ]);

    currentAnchorId = referenceTree.alloc_node(absCr, absCi, msg.exponent || 2.0);

    const t0 = performance.now();
    const payload = compute_payload(referenceTree, currentAnchorId, casesJson, msg.paletteMaxIter);
    const t1 = performance.now();
    console.log(`[math-core] BLA Tree & Orbit Array compiled in ${(t1 - t0).toFixed(2)}ms`);

    const orbit_nodes = new Float64Array(payload.orbit_nodes);
    const metadata = new Float64Array(payload.metadata);
    const bla_grid_ds = new Float64Array(payload.bla_grid_ds);
    const bta_grid = new Float64Array(payload.bta_grid);

    payload.free();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (self as any).postMessage(
      {
        id: e.data.id,
        type: 'COMPUTE_REBASE_RESULT',
        abs_zr: absZr,
        abs_zi: absZi,
        abs_cr: absCr,
        abs_ci: absCi,
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

    const { rebase_origin } = await import('./wasm/rust_math.js');
    const rebase_result = rebase_origin(
      '0',
      '0',
      e.data.cr,
      e.data.ci,
      0.0,
      0.0,
      e.data.dcr,
      e.data.dci,
    );

    const t0 = performance.now();
    const result = refine_reference(rebase_result.cr, rebase_result.ci, e.data.max_iterations);
    const t1 = performance.now();
    console.log(`[math-core] Reference refined in ${(t1 - t0).toFixed(2)}ms`);

    rebase_result.free();

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (self as any).postMessage({
      id: e.data.id,
      type: 'REFINE_RESULT',
      cr: result.cr,
      ci: result.ci,
      refType: result.ref_type,
      period: result.period,
      pre_period: result.pre_period,
      offset_cr: result.offset_cr,
      offset_ci: result.offset_ci,
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
    const reference_tree_flat = new Float64Array(payload.reference_tree);

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
        reference_tree_flat,
      } as WorkerOutputMessage,
      [
        orbit_nodes.buffer,
        metadata.buffer,
        bla_grid_ds.buffer,
        bta_grid.buffer,
        reference_tree_flat.buffer,
      ],
    );
  }
};
