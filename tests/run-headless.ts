import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { initEngine } from '../src/engine/initEngine.ts';
import { WorkerInputMessage, WorkerOutputMessage } from '../src/engine/math-workers/rust.worker.ts';

async function main() {
  console.log('--- Apeiron Headless Regression Runner ---');

  // 1. Initialize WASM math core via Worker
  console.log('Initializing WASM Math Core Worker...');

  // Create worker using path relative to current module (for Deno)
  const workerPath = path.resolve('./src/engine/math-workers/rust.worker.ts');
  // Deno requires the actual file specifier for worker
  const worker = new Worker(new URL(`file://${workerPath}`).href, { type: 'module' });

  // 2. Load Test Cases
  const casesPath = path.resolve('./tests/cases.json');
  const casesJson = fs.readFileSync(casesPath, 'utf8');

  // 3. Generate Ground Truth from WASM Worker
  console.log('Generating Arbitrary Precision Ground Truth via Worker...');
  const groundTruth = await new Promise<Float64Array>((resolve, reject) => {
    worker.onmessage = (e: MessageEvent<WorkerOutputMessage>) => {
      if (e.data.type === 'COMPUTE_RESULT') {
        resolve(e.data.result);
      }
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

  console.log('Ground Truth Output length:', groundTruth.length);

  // 4. Initialize WebGPU Engine
  console.log('Initializing WebGPU Engine...');
  if (!globalThis.navigator || !globalThis.navigator.gpu) {
    console.warn('⚠️ navigator.gpu is undefined in this environment.');
    console.warn('Hardware Agnosticism: Gracefully skipping physical WebGPU assertion.');
    console.warn('To run fully, install a WebGPU node polyfill like `dawn.node` or run in Deno.');
    process.exit(0);
  }

  try {
    const mathAccumWgsl = fs.readFileSync(
      path.resolve('./src/engine/shaders/math_accum.wgsl'),
      'utf8',
    );
    const engine = await initEngine(undefined, mathAccumWgsl, '');
    console.log('WebGPU Context established.');

    // Parse the input cases for WebGPU
    const cases = JSON.parse(casesJson);
    const inputs = new Float32Array(cases.length * 4);
    for (let i = 0; i < cases.length; i++) {
      inputs[i * 4] = parseFloat(cases[i].zr);
      inputs[i * 4 + 1] = parseFloat(cases[i].zi);
      inputs[i * 4 + 2] = parseFloat(cases[i].cr);
      inputs[i * 4 + 3] = parseFloat(cases[i].ci);
    }

    // 5. Run WebGPU Compute
    console.log('Executing WebGPU Compute pass (Perturbation Math)...');
    const perturbGpuResult = await engine.executeTestCompute(inputs, groundTruth, 100, true);

    console.log('Executing WebGPU Compute pass (F32 Base Math)...');
    const f32GpuResult = await engine.executeTestCompute(inputs, undefined, 100, false);

    // 6. Fuzzy Match Tolerance Checker (against Ground Truth)
    let passed = true;
    const max_iterations = 100;
    const blockSize = max_iterations * 2 + 4;

    for (let i = 0; i < cases.length; i++) {
      const start = i * blockSize;
      const rustEscapeIterOffset = start + blockSize - 1;
      const expectedIter = groundTruth[rustEscapeIterOffset];
      const cycle_found = groundTruth[start + blockSize - 4];
      const der_r = groundTruth[start + blockSize - 3];
      const der_i = groundTruth[start + blockSize - 2];

      console.log(
        `Point ${i}: expectedIter=${expectedIter}, cycle=${cycle_found}, der=${der_r}, ${der_i}`,
      );
      const perturbIter = perturbGpuResult[i * 2];
      const f32Iter = f32GpuResult[i * 2];

      const tolerance = 1.0;

      // Perturbation MUST match ALL zoom depths
      if (Math.abs(expectedIter - Math.floor(perturbIter)) > tolerance) {
        console.error(
          `❌ Mismatch at point ${i}: Expected ~${expectedIter}, got Perturbation WebGPU ${perturbIter}`,
        );
        passed = false;
      }

      // F32 Base Math is strictly limited. It only matches indices 0-3 (shallow roots).
      if (i < 4) {
        if (Math.abs(expectedIter - Math.floor(f32Iter)) > tolerance) {
          console.error(
            `❌ Mismatch at shallow point ${i}: Expected ~${expectedIter}, got F32 WebGPU ${f32Iter}`,
          );
          passed = false;
        }
      }
    }

    if (!passed) {
      console.error('❌ FAIL: Arrays diverge beyond acceptable float limits.');
      process.exit(1);
    }

    console.log('✅ PASS: Both pipelines accurately matched mathematical boundaries.');

    // 7. Flavor B: Bit-Perfect Regression Tester
    const cachePathPerturb = path.resolve('./tests/artifacts/cached_gpu_result_perturb.json');
    const cachePathF32 = path.resolve('./tests/artifacts/cached_gpu_result_f32.json');
    if (!fs.existsSync(path.resolve('./tests/artifacts'))) {
      fs.mkdirSync(path.resolve('./tests/artifacts'), { recursive: true });
    }

    if (process.env.UPDATE_SNAPSHOTS === 'true' || !fs.existsSync(cachePathPerturb)) {
      console.log('📝 Writing GPU outputs to regression cache...');
      fs.writeFileSync(cachePathPerturb, JSON.stringify(Array.from(perturbGpuResult), null, 2));
      fs.writeFileSync(cachePathF32, JSON.stringify(Array.from(f32GpuResult), null, 2));
      console.log('✅ PASS: Snapshots created. Run `test:engine` without update flag to verify.');
      process.exit(0);
    } else {
      console.log('🔍 Validating Bit-Perfect Regression Match...');
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
      if (bitPerfect) {
        console.log('✅ PASS: WebGPU Result is Bit-Perfect with cached regression data.');
        process.exit(0);
      } else {
        console.error('❌ FAIL: Bit-Perfect Regression Failed.');
        process.exit(1);
      }
    }
  } catch (err: unknown) {
    if (
      err instanceof Error &&
      err.message &&
      err.message.includes('Hardware may not support WebGPU')
    ) {
      console.warn('⚠️ WebGPU Adapter failed to initialize. Gracefully skipping.');
      process.exit(0);
    }
    console.error('Fatal Test Execution Error:', err);
    process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
