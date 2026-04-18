import { initEngine } from '../../src/engine/initEngine.ts';
import { WebGPUTestHarness } from '../WebGPUTestHarness.ts';
import fs from 'node:fs';
import path from 'node:path';

async function runPhase4Test() {
  const layoutWgsl = fs.readFileSync(
    path.resolve('./src/engine/shaders/escape/generated/layout.wgsl'),
    'utf8',
  );
  const layoutAccessorsWgsl = fs.readFileSync(
    path.resolve('./src/engine/shaders/escape/generated/layout_accessors.wgsl'),
    'utf8',
  );
  const dsMathWgsl = fs.readFileSync(
    path.resolve('./src/engine/shaders/math/ds_math.wgsl'),
    'utf8',
  );

  const mathAccumWgslStr =
    layoutWgsl +
    '\n' +
    dsMathWgsl +
    '\n' +
    fs.readFileSync(path.resolve('./src/engine/shaders/escape/math_accum.wgsl'), 'utf8');
  const mathAccumWgsl = mathAccumWgslStr.replace(
    'fn unpack_f64_to_f32',
    layoutAccessorsWgsl + '\nfn unpack_f64_to_f32',
  );
  const resolveWgslStr =
    layoutWgsl +
    '\n' +
    fs.readFileSync(path.resolve('./src/engine/shaders/escape/resolve_present.wgsl'), 'utf8');

  // We don't bother initializing the WASM worker here, we just want to test how the shader reacts
  // without a reference orbit, or with a mock reference orbit. But we need a reference orbit to see the f32p vs f64p!
  // Let's spawn the rust worker and generate the actual reference orbit for the user's coordinate.

  const workerPath = path.resolve('./src/engine/math-workers/rust.worker.ts');
  const worker = new Worker(new URL(`file://${workerPath}`).href, { type: 'module' });

  // User's URL state
  const cr = -1.8621439897930427;
  const ci = -0.00001151021584659067;
  const zoom = 0.00004743416490252601;

  const casesJson = JSON.stringify([
    {
      zr: "0",
      zi: "0",
      cr: cr.toString(),
      ci: ci.toString(),
      exponent: 2.0,
    },
  ]);

  const groundTruth = await new Promise<{
    orbit_nodes: Float64Array;
    metadata: Float64Array;
    bla_grid: Float64Array;
  }>((resolve, reject) => {
    worker.onmessage = (e) => {
      if (e.data.type === 'COMPUTE_RESULT') resolve(e.data);
    };
    worker.onerror = reject;
    worker.postMessage({
      id: 1,
      type: 'COMPUTE',
      casesJson,
      paletteMaxIter: 1000, // A typical max_iteration value
    });
  });
  worker.terminate();

  const engine = await initEngine(undefined, mathAccumWgsl, resolveWgslStr);
  const harness = new WebGPUTestHarness(engine.device, mathAccumWgsl, resolveWgslStr);

  // Instead of testing a cluster, we just test the exact pixel (or slight offset)
  // Let's offset `delta_c` perfectly by 0, ensuring we trace the direct reference orbit
  const singleInput = new Float32Array([
    0.0,
    0.0, // start z
    cr,
    ci, // start c (for f32 fallback)
    4.5e-5,
    4.5e-5, // delta_c (edge of viewport)
  ]);

  console.log('--- Phase 4: Headless Mathematical Validation ---');
  console.log(`Target: cr=${cr}, ci=${ci}, zoom=${zoom}`);
  console.log(
    `Reference Orbit Bounds: Node Length = ${groundTruth.orbit_nodes.length / 8}, Escaped Iter = ${groundTruth.metadata[3]}`,
  );

  // Test Mode 0: f32 Standard
  const resF32 = await harness.executeTestCompute(
    singleInput,
    undefined,
    undefined,
    undefined,
    1000,
    false,
    2.0,
  );
  console.log(`\nMode 0 (f32 Standard):`);
  console.log(`Result Sentinel/Iter: ${resF32[0]}`);

  // Test Mode 1: f32 Perturbation
  const resF32P = await harness.executeUnitTest('unit_test_engine_math', singleInput, {
    cameraData: {
      scale: 1.0,
      aspect: 1.0,
      render_scale: 1.0,
      canvas_width: 1.0,
      step_limit: 1000,
      compute_max_iter: 1000,
      ref_max_iter: 1000,
      skip_iter: 0,
    },
    refOrbitNodes: groundTruth.orbit_nodes,
    refMetadata: groundTruth.metadata,
    refBlaGrid: groundTruth.bla_grid,
    exponent: 2.0,
    usePerturbation: 1.0,
  });
  console.log(`\nMode 1 (f32_perturbation):`);
  console.log(`Result Sentinel/Iter: ${resF32P[0]}`);

  // Test Mode 2: f64 Perturbation
  const resF64P = await harness.executeUnitTest('unit_test_engine_math', singleInput, {
    cameraData: {
      scale: 1.0,
      aspect: 1.0,
      render_scale: 1.0,
      canvas_width: 1.0,
      step_limit: 1000,
      compute_max_iter: 1000,
      ref_max_iter: 1000,
      skip_iter: 0,
    },
    refOrbitNodes: groundTruth.orbit_nodes,
    refMetadata: groundTruth.metadata,
    refBlaGrid: groundTruth.bla_grid,
    exponent: 2.0,
    usePerturbation: 2.0,
  });
  console.log(`\nMode 2 (f64_perturbation):`);
  console.log(`Result Sentinel/Iter: ${resF64P[0]}`);
}

runPhase4Test()
  .then(() => {
    console.log('\nHeadless validation complete. Exiting.');
    Deno.exit(0);
  })
  .catch((e) => {
    console.error('Fatal Test Error:', e);
    Deno.exit(1);
  });
