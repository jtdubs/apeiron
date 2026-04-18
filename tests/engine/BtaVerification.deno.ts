import { initEngine } from '../../src/engine/initEngine.ts';
import { WebGPUTestHarness } from '../WebGPUTestHarness.ts';
import path from 'node:path';
import { getCompiledMathShader, getResolveShader } from './compileShaderHelper.ts';

async function runBtaVerification() {
  const mathAccumWgsl = getCompiledMathShader();
  const resolveWgslStr = getResolveShader();

  const workerPath = path.resolve('./src/engine/math-workers/rust.worker.ts');
  const worker = new Worker(new URL(`file://${workerPath}`).href, { type: 'module' });

  // A coordinate that doesn't escape too fast
  const cr = -0.75;
  const ci = 0.1;

  const casesJson = JSON.stringify([
    {
      zr: '0',
      zi: '0',
      cr: cr.toString(),
      ci: ci.toString(),
      exponent: 2.0,
    },
  ]);

  const groundTruth = await new Promise<{
    orbit_nodes: Float64Array;
    metadata: Float64Array;
    bla_grid: Float64Array;
    bla_grid_ds: Float64Array;
    bta_grid: Float64Array;
  }>((resolve, reject) => {
    worker.onmessage = (e) => {
      if (e.data.type === 'COMPUTE_RESULT') resolve(e.data);
    };
    worker.onerror = reject;
    worker.postMessage({
      id: 1,
      type: 'COMPUTE',
      casesJson,
      paletteMaxIter: 2048,
    });
  });
  worker.terminate();

  const engine = await initEngine(undefined, mathAccumWgsl, resolveWgslStr);
  const harness = new WebGPUTestHarness(engine.device, mathAccumWgsl, resolveWgslStr);

  const testStride = 8;
  const singleInput = new Float32Array([
    0.0,
    0.0, // start z (dz_in)
    0.0, // iter_in
    1.5e-6,
    1.5e-6, // delta_c
    cr,
    ci, // start_c
    2048.0, // target_iter
  ]);

  const engineInput = new Float32Array([
    0.0,
    0.0, // start z
    cr,
    ci, // start c
    1.5e-6,
    1.5e-6, // delta_c
  ]);

  console.log('--- BTA Verification: Mathematical Validation ---');
  console.log(`Target: cr=${cr}, ci=${ci}`);

  const sanity = await harness.executeUnitTest(
    'unit_test_complex_math',
    new Float32Array([1.0, 2.0, 3.0, 4.0]),
    {},
    4,
    4,
  );
  console.log(`Sanity Check: ${sanity}`);

  // Test Mode 0: f32 Standard
  const resF32 = await harness.executeTestCompute(
    engineInput,
    undefined,
    undefined,
    undefined,
    undefined,
    2048,
    false,
    2.0,
  );
  console.log(`\nMode 0 (f32 Standard):`);
  console.log(`Result array:`, resF32);

  // Test BTA explicit advance
  const resBta = await harness.executeUnitTest(
    'unit_test_bla_advance',
    singleInput,
    {
      cameraData: {
        scale: 1.0,
        aspect: 1.0,
        render_scale: 1.0,
        canvas_width: 1.0,
        step_limit: 2048,
        compute_max_iter: 2048,
        ref_max_iter: groundTruth.metadata[3] || 2048,
        skip_iter: 0,
      },
      refOrbitNodes: groundTruth.orbit_nodes,
      refMetadata: groundTruth.metadata,
      refBlaGridDs: groundTruth.bla_grid_ds,
      refBtaGrid: groundTruth.bta_grid,
      exponent: 2.0,
      usePerturbation: 1.0,
    },
    testStride,
    4,
  );

  console.log(`\nBTA Skip Vector:`);
  console.log(`Result array:`, resBta);
  console.log(`Advanced Iterations: ${resBta[2]}`);
  console.log(`Advanced Boolean: ${resBta[3]}`);

  if (resBta[3] === 0.0) {
    console.error('FAIL: BTA Engine did not trigger a skip.');
    Deno.exit(1);
  }
}

runBtaVerification()
  .then(() => {
    console.log('\nBTA Verification complete. Exiting.');
    Deno.exit(0);
  })
  .catch((e) => {
    console.error('Fatal Test Error:', e);
    Deno.exit(1);
  });
