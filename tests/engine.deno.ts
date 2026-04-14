/* eslint-disable @typescript-eslint/ban-ts-comment */
/* eslint-disable @typescript-eslint/no-explicit-any */
// @ts-nocheck
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { initEngine } from '../src/engine/initEngine.ts';
import { WebGPUTestHarness } from './WebGPUTestHarness.ts';
import { WorkerInputMessage, WorkerOutputMessage } from '../src/engine/math-workers/rust.worker.ts';

interface SharedState {
  engine: any;
  harness: WebGPUTestHarness;
  groundTruth: Float64Array;
  offsetsGroundTruth: Float64Array;
  alignedRefOrbits: Float64Array;
  clusterCases: any[];
  inputs: Float32Array;
  perturbGpuResult: Float32Array;
  f32GpuResult: Float32Array;
  rawCases: any[];
}

let sharedStatePromise: Promise<SharedState | null> | null = null;

async function initSharedState(): Promise<SharedState | null> {
  if (sharedStatePromise) return sharedStatePromise;

  sharedStatePromise = (async () => {
    if (!globalThis.navigator || !globalThis.navigator.gpu) {
      console.warn('⚠️ navigator.gpu is undefined in this environment.');
      return null;
    }

    const workerPath = path.resolve('./src/engine/math-workers/rust.worker.ts');
    const worker = new Worker(new URL(`file://${workerPath}`).href, { type: 'module' });

    const casesPath = path.resolve('./tests/cases.json');
    const casesJson = fs.readFileSync(casesPath, 'utf8');

    const groundTruth = await new Promise<Float64Array>((resolve, reject) => {
      worker.onmessage = (e: MessageEvent<WorkerOutputMessage>) => {
        if (e.data.type === 'COMPUTE_RESULT') resolve(e.data.result);
      };
      worker.onerror = (e) => reject(e);
      worker.postMessage({
        id: 1,
        type: 'COMPUTE',
        casesJson,
        maxIterations: 100,
      } as WorkerInputMessage);
    });
    worker.terminate();

    const mathAccumWgsl = fs.readFileSync(
      path.resolve('./src/engine/shaders/escape/math_accum.wgsl'),
      'utf8',
    );
    const resolveWgsl = fs.readFileSync(
      path.resolve('./src/engine/shaders/escape/resolve_present.wgsl'),
      'utf8',
    );

    const engine = await initEngine(undefined, mathAccumWgsl, resolveWgsl);
    const harness = new WebGPUTestHarness(engine.device, mathAccumWgsl, resolveWgsl);

    const rawCases = JSON.parse(casesJson);
    const clusterCases: any[] = [];
    for (const c of rawCases) {
      const zr = parseFloat(c.zr);
      const zi = parseFloat(c.zi);
      const cr = parseFloat(c.cr);
      const ci = parseFloat(c.ci);
      const exponent = c.exponent !== undefined ? parseFloat(c.exponent) : 2.0;

      clusterCases.push({ zr, zi, cr, ci, dc_r: 0.0, dc_i: 0.0, exponent });
      clusterCases.push({ zr, zi, cr: cr + 1e-6, ci: ci + 1e-6, dc_r: 1e-6, dc_i: 1e-6, exponent });
      clusterCases.push({
        zr,
        zi,
        cr: cr - 1e-6,
        ci: ci - 1e-6,
        dc_r: -1e-6,
        dc_i: -1e-6,
        exponent,
      });
      clusterCases.push({
        zr,
        zi,
        cr: cr + 2e-15,
        ci: ci - 2e-15,
        dc_r: 2e-15,
        dc_i: -2e-15,
        exponent,
      });
      clusterCases.push({
        zr,
        zi,
        cr: cr - 2e-15,
        ci: ci + 2e-15,
        dc_r: -2e-15,
        dc_i: 2e-15,
        exponent,
      });
      clusterCases.push({ zr, zi, cr: cr + 0.05, ci: ci + 0.05, dc_r: 0.05, dc_i: 0.05, exponent });
    }

    const inputs = new Float32Array(clusterCases.length * 6);
    for (let i = 0; i < clusterCases.length; i++) {
      inputs[i * 6] = clusterCases[i].zr;
      inputs[i * 6 + 1] = clusterCases[i].zi;
      inputs[i * 6 + 2] = clusterCases[i].cr;
      inputs[i * 6 + 3] = clusterCases[i].ci;
      inputs[i * 6 + 4] = clusterCases[i].dc_r;
      inputs[i * 6 + 5] = clusterCases[i].dc_i;
    }

    const offsetsJson = JSON.stringify(
      clusterCases.map((c) => ({
        zr: c.zr.toString(),
        zi: c.zi.toString(),
        cr: c.cr.toString(),
        ci: c.ci.toString(),
        exponent: c.exponent,
      })),
    );

    const offsetsGroundTruth = await new Promise<Float64Array>((resolve, reject) => {
      const localWorker = new Worker(new URL(`file://${workerPath}`).href, { type: 'module' });
      localWorker.onmessage = (e: MessageEvent<WorkerOutputMessage>) => {
        if (e.data.type === 'COMPUTE_RESULT') {
          resolve(e.data.result);
          localWorker.terminate();
        }
      };
      localWorker.onerror = (e) => reject(e);
      localWorker.postMessage({
        id: 2,
        type: 'COMPUTE',
        casesJson: offsetsJson,
        maxIterations: 100,
      } as WorkerInputMessage);
    });

    const blockSize = 100 * 2 + 8;
    const variantsPerCase = 6;
    const alignedRefOrbits = new Float64Array(clusterCases.length * blockSize);
    for (let c = 0; c < rawCases.length; c++) {
      for (let variant = 0; variant < variantsPerCase; variant++) {
        const clusterIdx = c * variantsPerCase + variant;
        const srcStart = c * blockSize;
        alignedRefOrbits.set(
          groundTruth.subarray(srcStart, srcStart + blockSize),
          clusterIdx * blockSize,
        );
      }
    }

    const perturbGpuResult = new Float32Array(clusterCases.length * 4);
    const f32GpuResult = new Float32Array(clusterCases.length * 4);

    let currentExp = clusterCases[0].exponent;
    let expStartIdx = 0;

    for (let i = 0; i <= clusterCases.length; i++) {
      if (i === clusterCases.length || clusterCases[i].exponent !== currentExp) {
        const batchInputs = inputs.subarray(expStartIdx * 6, i * 6);
        const batchRefOrbits = alignedRefOrbits.subarray(expStartIdx * blockSize, i * blockSize);

        const pRes = await harness.executeTestCompute(
          batchInputs,
          batchRefOrbits,
          100,
          true,
          currentExp,
        );
        const fRes = await harness.executeTestCompute(
          batchInputs,
          undefined,
          100,
          false,
          currentExp,
        );

        perturbGpuResult.set(pRes, expStartIdx * 4);
        f32GpuResult.set(fRes, expStartIdx * 4);

        if (i < clusterCases.length) {
          currentExp = clusterCases[i].exponent;
          expStartIdx = i;
        }
      }
    }

    return {
      engine,
      harness,
      groundTruth,
      offsetsGroundTruth,
      alignedRefOrbits,
      clusterCases,
      inputs,
      perturbGpuResult,
      f32GpuResult,
      rawCases,
    };
  })();

  return sharedStatePromise;
}

Deno.test('Fuzzy Match Tolerance Checker (against Ground Truth)', async () => {
  const state = await initSharedState();
  if (!state) return;

  const { clusterCases, offsetsGroundTruth, perturbGpuResult, f32GpuResult } = state;
  let passed = true;
  const max_iterations = 100;
  const blockSizeG = max_iterations * 2 + 8;

  for (let i = 0; i < clusterCases.length; i++) {
    const start = i * blockSizeG;
    const rustEscapeIterOffset = start + blockSizeG - 5;
    const expectedIter = offsetsGroundTruth[rustEscapeIterOffset];

    const perturbIter = perturbGpuResult[i * 4];
    const pDe = perturbGpuResult[i * 4 + 1];
    const pNx = perturbGpuResult[i * 4 + 2];
    const pNy = perturbGpuResult[i * 4 + 3];

    const f32Iter = f32GpuResult[i * 4];
    const tolerance = 1.0;

    if (Number.isNaN(pDe) || !Number.isFinite(pDe)) {
      console.error(`❌ Mismatch at point ${i}: DE is NaN or Infinity: ${pDe}`);
      passed = false;
    }
    if (Number.isNaN(pNx) || !Number.isFinite(pNy)) {
      console.error(`❌ Mismatch at point ${i}: Normals are NaN or Infinity: ${pNx}, ${pNy}`);
      passed = false;
    }

    if (Math.abs(expectedIter - Math.floor(perturbIter)) > tolerance) {
      console.error(
        `❌ Mismatch at point ${i}: Expected ~${expectedIter}, got Perturbation WebGPU ${perturbIter}`,
      );
      passed = false;
    }

    if (i < 4 * 6) {
      if (Math.abs(expectedIter - Math.floor(f32Iter)) > tolerance) {
        console.error(
          `❌ Mismatch at shallow point ${i}: Expected ~${expectedIter}, got F32 WebGPU ${f32Iter}`,
        );
        passed = false;
      }
    }
  }

  if (!passed) {
    throw new Error('Arrays diverge beyond acceptable float limits.');
  }
});

Deno.test(
  'Validating derivative stability under Deep Zoom (No Magenta Glitch) (maxIter > 128)',
  async () => {
    const state = await initSharedState();
    if (!state) return;

    const { harness } = state;
    const deepInput = new Float32Array([0.0, 0.0, -1.748, 0.0, 1e-15, 1e-15]);
    const res = await harness.executeTestCompute(deepInput, undefined, 500, false, 2.0);
    const de = res[1];
    const nx = res[2];
    const ny = res[3];

    if (Number.isNaN(de) || !Number.isFinite(de) || Number.isNaN(nx) || !Number.isFinite(nx)) {
      throw new Error(`Shader NaN/Infinity Exploit Triggered: de=${de}, nx=${nx}, ny=${ny}`);
    }

    const renderSession = harness.createSession(2, 2);
    renderSession.renderFrame(0.0, 0.0, -1.748, 0.0, 1e-15, 500, 0.0, 2.0, 'INTERACT_SAFE');
    const renderOutput = await renderSession.readResolved();
    renderSession.destroy();

    let isMagenta = true;
    for (let i = 0; i < renderOutput.length; i += 4) {
      if (
        renderOutput[i] !== 255 ||
        renderOutput[i + 1] !== 0 ||
        renderOutput[i + 2] !== 255 ||
        renderOutput[i + 3] !== 255
      ) {
        isMagenta = false;
        break;
      }
    }
    if (isMagenta) {
      throw new Error('Full-screen Magenta Glitch Detected');
    }
  },
);

Deno.test('Validating Progressive Rendering Temporal Accumulation (Ping-Pong Buffer)', async () => {
  const state = await initSharedState();
  if (!state) return;

  const { harness } = state;
  const width = 2;
  const height = 2;
  const j1 = { jitterX: 0.1, jitterY: -0.1, frameCount: 1.0 };
  const j2 = { jitterX: -0.2, jitterY: 0.3, frameCount: 2.0 };

  const sessionA = harness.createSession(width, height);
  sessionA.renderFrame(
    0.0,
    0.0,
    -1.748,
    0.0,
    1.0,
    100,
    0.0,
    2.0,
    'STATIC',
    j1.jitterX,
    j1.jitterY,
    1.0,
  );
  const frameA = await sessionA.readGBuffer();
  sessionA.destroy();

  const sessionB = harness.createSession(width, height);
  sessionB.renderFrame(
    0.0,
    0.0,
    -1.748,
    0.0,
    1.0,
    100,
    0.0,
    2.0,
    'STATIC',
    j2.jitterX,
    j2.jitterY,
    1.0,
  );
  const frameB = await sessionB.readGBuffer();
  sessionB.destroy();

  const sessionAccum = harness.createSession(width, height);
  sessionAccum.renderFrame(
    0.0,
    0.0,
    -1.748,
    0.0,
    1.0,
    100,
    0.0,
    2.0,
    'STATIC',
    j1.jitterX,
    j1.jitterY,
    1.0,
  );
  sessionAccum.renderFrame(
    0.0,
    0.0,
    -1.748,
    0.0,
    1.0,
    100,
    0.0,
    2.0,
    'STATIC',
    j2.jitterX,
    j2.jitterY,
    2.0,
  );
  const accumAB = await sessionAccum.readGBuffer();
  sessionAccum.destroy();

  let accumPassed = true;
  for (let i = 0; i < frameA.length; i++) {
    const expectedMathMean = (frameA[i] + frameB[i]) / 2.0;
    const diff = Math.abs(accumAB[i] - expectedMathMean);
    if (diff > 1e-4) {
      console.error(
        `❌ FAIL: Temporal Accumulation mismatched at float array index ${i}. Expected: ${expectedMathMean}, Got: ${accumAB[i]}`,
      );
      accumPassed = false;
    }
  }
  if (!accumPassed)
    throw new Error('Temporal Accumulation failed exact mathematical mean evaluation.');
});

Deno.test('Validating Inner-Fractal Black Hole Accumulation Stability', async () => {
  const state = await initSharedState();
  if (!state) return;

  const { harness } = state;
  const width = 1;
  const height = 1;
  const frames = [];
  for (let i = 1; i <= 64; i++) {
    frames.push({ jitterX: 0.1, jitterY: -0.1, frameCount: i });
  }

  const session = harness.createSession(width, height);
  for (const frame of frames) {
    session.renderFrame(
      0.0,
      0.0,
      0.0,
      0.0,
      1.0,
      100,
      0.0,
      2.0,
      'STATIC',
      frame.jitterX,
      frame.jitterY,
      frame.frameCount,
    );
  }
  const blackHoleAccum = await session.readResolved();
  session.destroy();

  const r = blackHoleAccum[0];
  const g = blackHoleAccum[1];
  const b = blackHoleAccum[2];
  const a = blackHoleAccum[3];

  if (r !== 0 || g !== 0 || b !== 0 || a !== 255) {
    throw new Error(`Inner Fractal black hole accumulation failed: rgba(${r}, ${g}, ${b}, ${a})`);
  }
});

Deno.test('Validating Bit-Perfect Regression Match', async () => {
  const state = await initSharedState();
  if (!state) return;

  const { perturbGpuResult, f32GpuResult } = state;
  const cachePathPerturb = path.resolve('./tests/artifacts/cached_gpu_result_perturb.json');
  const cachePathF32 = path.resolve('./tests/artifacts/cached_gpu_result_f32.json');

  if (!fs.existsSync(path.resolve('./tests/artifacts'))) {
    fs.mkdirSync(path.resolve('./tests/artifacts'), { recursive: true });
  }

  if (process.env.UPDATE_SNAPSHOTS === 'true' || !fs.existsSync(cachePathPerturb)) {
    fs.writeFileSync(cachePathPerturb, JSON.stringify(Array.from(perturbGpuResult), null, 2));
    fs.writeFileSync(cachePathF32, JSON.stringify(Array.from(f32GpuResult), null, 2));
    console.log('✅ Snapshots created.');
  } else {
    const cachedPerturbStr = fs.readFileSync(cachePathPerturb, 'utf8');
    const cachedPerturbArr = JSON.parse(cachedPerturbStr);
    let bitPerfect = true;

    if (cachedPerturbArr.length !== perturbGpuResult.length) {
      console.error('❌ FAIL: Size of cached Perturb result does not match GPU result.');
      bitPerfect = false;
    } else {
      for (let i = 0; i < cachedPerturbArr.length; i++) {
        if (cachedPerturbArr[i] !== perturbGpuResult[i]) {
          console.error(
            `❌ REGRESSION Perturb at index ${i}: Cached ${cachedPerturbArr[i]}, GPU ${perturbGpuResult[i]}`,
          );
          bitPerfect = false;
        }
      }
    }

    const cachedF32Str = fs.readFileSync(cachePathF32, 'utf8');
    const cachedF32Arr = JSON.parse(cachedF32Str);

    if (cachedF32Arr.length !== f32GpuResult.length) {
      console.error('❌ FAIL: Size of cached F32 result does not match GPU result.');
      bitPerfect = false;
    } else {
      for (let i = 0; i < cachedF32Arr.length; i++) {
        if (cachedF32Arr[i] !== f32GpuResult[i]) {
          console.error(
            `❌ REGRESSION F32 at index ${i}: Cached ${cachedF32Arr[i]}, GPU ${f32GpuResult[i]}`,
          );
          bitPerfect = false;
        }
      }
    }

    if (!bitPerfect) {
      throw new Error('Bit-Perfect Regression Failed.');
    }
  }
});
