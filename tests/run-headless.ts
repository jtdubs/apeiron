import fs from 'fs';
import path from 'path';
import initWasm, { compute_mandelbrot } from '../src/engine/math-workers/wasm/rust_math.js';
import { initEngine } from '../src/engine/initEngine.js';

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
    const engine = await initEngine();
    console.log('WebGPU Context established.');

    // Since our WebGPU shader in initEngine.ts just multiplies by 2.0 (for task 002 test),
    // and Mandelbrot generates [iter, escaped] pairs,
    // we will just test the fuzzy math tolerance on a basic input matching the shader.
    // Replace this with actual shader output when WebGPU implements Mandelbrot.

    // 5. Run WebGPU Compute
    console.log('Executing WebGPU Compute pass...');
    // We send the ground truth data as input just to test the WebGPU buffer loop
    const gpuResult = await engine.executeTestCompute(groundTruth);
    console.log('WebGPU Result:', gpuResult);

    // 6. Fuzzy Match Tolerance Checker
    let passed = true;
    for (let i = 0; i < groundTruth.length; i++) {
      const expected = groundTruth[i] * 2.0; // Our basic shader multiplies by 2.0
      const actual = gpuResult[i];
      const tolerance = 0.0001; // Fuzzy precision tolerance
      if (Math.abs(expected - actual) > tolerance) {
        console.error(`❌ Mismatch at index ${i}: Expected ~${expected}, got ${actual}`);
        passed = false;
      }
    }

    if (passed) {
      console.log(
        '✅ PASS: WebGPU Compute Array matches mathematical expectations within tolerance.',
      );
      process.exit(0);
    } else {
      console.error('❌ FAIL: Arrays diverge beyond acceptable float limits.');
      process.exit(1);
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
