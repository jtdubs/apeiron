import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import initWasm, { compute_mandelbrot } from '../src/engine/math-workers/wasm/rust_math.js';
import { initEngine } from '../src/engine/initEngine.ts';

async function main() {
  console.log('--- Apeiron Headless Regression Runner ---');

  // 1. Initialize WASM math core
  console.log('Initializing WASM Math Core...');
  const wasmPath = path.resolve('./src/engine/math-workers/wasm/rust_math_bg.wasm');
  const wasmBuffer = fs.readFileSync(wasmPath);
  await initWasm({ module_or_path: wasmBuffer });
  console.log('WASM Math Core loaded successfully.');

  // 2. Load Test Cases
  const casesPath = path.resolve('./tests/cases.json');
  const casesJson = fs.readFileSync(casesPath, 'utf8');

  // 3. Generate Ground Truth from WASM
  console.log('Generating Arbitrary Precision Ground Truth...');
  const groundTruth = compute_mandelbrot(casesJson, 100);
  console.log('Ground Truth Output:', groundTruth);

  // 4. Initialize WebGPU Engine
  console.log('Initializing WebGPU Engine...');
  if (!globalThis.navigator || !globalThis.navigator.gpu) {
    console.warn('⚠️ navigator.gpu is undefined in this environment.');
    console.warn('Hardware Agnosticism: Gracefully skipping physical WebGPU assertion.');
    console.warn('To run fully, install a WebGPU node polyfill like `dawn.node` or run in Deno.');
    process.exit(0);
  }

  try {
    const mandelbrotWgsl = fs.readFileSync(
      path.resolve('./src/engine/shaders/mandelbrot_f32.wgsl'),
      'utf8',
    );
    const engine = await initEngine(undefined, mandelbrotWgsl);
    console.log('WebGPU Context established.');

    // Parse the input cases for WebGPU
    const cases = JSON.parse(casesJson);
    const inputs = new Float32Array(cases.length * 2);
    for (let i = 0; i < cases.length; i++) {
      inputs[i * 2] = parseFloat(cases[i].x);
      inputs[i * 2 + 1] = parseFloat(cases[i].y);
    }

    // 5. Run WebGPU Compute
    console.log('Executing WebGPU Compute pass...');
    const gpuResult = await engine.executeTestCompute(inputs);
    console.log('WebGPU Result:', gpuResult);

    // 6. Fuzzy Match Tolerance Checker
    let passed = true;
    for (let i = 0; i < groundTruth.length; i++) {
      const expected = groundTruth[i];
      const actual = gpuResult[i];
      const tolerance = 0.0001; // Fuzzy precision tolerance
      if (Math.abs(expected - actual) > tolerance) {
        console.error(`❌ Mismatch at index ${i}: Expected ~${expected}, got ${actual}`);
        passed = false;
      }
    }

    if (!passed) {
      console.error('❌ FAIL: Arrays diverge beyond acceptable float limits.');
      process.exit(1);
    }

    console.log(
      '✅ PASS: WebGPU Compute Array matches mathematical expectations within tolerance.',
    );

    // 7. Flavor B: Bit-Perfect Regression Tester
    const cachePath = path.resolve('./tests/artifacts/cached_gpu_result.json');
    if (!fs.existsSync(path.resolve('./tests/artifacts'))) {
      fs.mkdirSync(path.resolve('./tests/artifacts'), { recursive: true });
    }

    if (process.env.UPDATE_SNAPSHOTS === 'true' || !fs.existsSync(cachePath)) {
      console.log('📝 Writing GPU output to regression cache (Flavor B setup)...');
      fs.writeFileSync(cachePath, JSON.stringify(Array.from(gpuResult), null, 2));
      console.log('✅ PASS: Snapshots created. Run `test:engine` without update flag to verify.');
      process.exit(0);
    } else {
      console.log('🔍 Validating Flavor B: Bit-Perfect Regression Match...');
      const cachedStr = fs.readFileSync(cachePath, 'utf8');
      const cachedArr = JSON.parse(cachedStr);
      let bitPerfect = true;

      if (cachedArr.length !== gpuResult.length) {
        console.error('❌ FAIL: Size of cached result does not match GPU result.');
        bitPerfect = false;
      } else {
        for (let i = 0; i < cachedArr.length; i++) {
          if (cachedArr[i] !== gpuResult[i]) {
            console.error(
              `❌ REGRESSION at index ${i}: Cached ${cachedArr[i]}, but GPU computed ${gpuResult[i]}`,
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
