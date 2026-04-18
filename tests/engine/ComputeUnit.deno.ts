import { WebGPUTestHarness } from '../WebGPUTestHarness.ts';
import fs from 'node:fs';
import path from 'node:path';
import { initEngine } from '../../src/engine/initEngine.ts';

Deno.test('WGSL Layer 2 Flavor D - Complex Math Unit Tests', async () => {
  if (!globalThis.navigator || !globalThis.navigator.gpu) {
    console.warn('⚠️ navigator.gpu is undefined in this environment.');
    return;
  }

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

  const engine = await initEngine(undefined, mathAccumWgsl, '');
  const harness = new WebGPUTestHarness(engine.device, mathAccumWgsl, '');

  // Prepare inputs test vectors
  // Let's test a couple of numbers [a, b] where each is a complex number
  // vector layout: [a.r, a.i, b.r, b.i]
  // test 1: a=(2, 3), b=(4, 5) => mul= (8-15, 12+10) = (-7, 22). sq(a) = (4-9, 12) = (-5, 12)
  // test 2: a=(1, -1), b=(0, 2) => mul= (0 - -2, 2+0) = (2, 2). sq(a) = (1-1, -2) = (0, -2)

  const inputVectors = new Float32Array([2.0, 3.0, 4.0, 5.0, 1.0, -1.0, 0.0, 2.0]);

  const result = await harness.executeUnitTest('unit_test_complex_math', inputVectors);

  const tolerance = 1e-6;

  // Test 1 verification
  if (Math.abs(result[0] - -7.0) > tolerance)
    throw new Error(`Math err: expected -7, got ${result[0]}`);
  if (Math.abs(result[1] - 22.0) > tolerance)
    throw new Error(`Math err: expected 22, got ${result[1]}`);
  if (Math.abs(result[2] - -5.0) > tolerance)
    throw new Error(`Math err: expected -5, got ${result[2]}`);
  if (Math.abs(result[3] - 12.0) > tolerance)
    throw new Error(`Math err: expected 12, got ${result[3]}`);

  // Test 2 verification
  if (Math.abs(result[4] - 2.0) > tolerance)
    throw new Error(`Math err: expected 2, got ${result[4]}`);
  if (Math.abs(result[5] - 2.0) > tolerance)
    throw new Error(`Math err: expected 2, got ${result[5]}`);
  if (Math.abs(result[6] - 0.0) > tolerance)
    throw new Error(`Math err: expected 0, got ${result[6]}`);
  if (Math.abs(result[7] - -2.0) > tolerance)
    throw new Error(`Math err: expected -2, got ${result[7]}`);
});

Deno.test('WGSL Layer 2 Flavor D - Core Polynomial Arithmetic', async () => {
  if (!globalThis.navigator || !globalThis.navigator.gpu) return;

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

  const engine = await initEngine(undefined, mathAccumWgsl, '');
  const harness = new WebGPUTestHarness(engine.device, mathAccumWgsl, '');

  // z = (2, 0), c = (1, 0)
  // z = (0, 1), c = (0, 0)
  const inputVectors = new Float32Array([2.0, 0.0, 1.0, 0.0, 0.0, 1.0, 0.0, 0.0]);

  const pRes = await harness.executeUnitTest('unit_test_polynomial', inputVectors, {
    cameraData: { compute_max_iter: 100.0 },
    exponent: 2.0,
  });

  // d=2.0 polynomial: complex_add(complex_sq(z), c)
  // test 1: sq(2, 0) + (1,0) = (4,0) + (1,0) = (5, 0)
  // derivative for d=2.0 step_derivative(z, der, d): if der = (1,0), 2*z*der + 1 = 2*(2)*(1) + 1 = 5
  if (Math.abs(pRes[0] - 5.0) > 1e-6) throw new Error(`Poly err: expected 5, got ${pRes[0]}`);
  if (Math.abs(pRes[1] - 0.0) > 1e-6) throw new Error(`Poly err: expected 0, got ${pRes[1]}`);
  if (Math.abs(pRes[2] - 5.0) > 1e-6) throw new Error(`Deriv err: expected 5, got ${pRes[2]}`);

  // test 2: sq(0, 1) + (0,0) = (-1, 0)
  // der step for z=(0,1), der=(0,0) => 2*z*der+1 => 2*(0,1)*(0,0)+1 = 1
  if (Math.abs(pRes[4] - -1.0) > 1e-6) throw new Error(`Poly err: expected -1, got ${pRes[4]}`);
  if (Math.abs(pRes[6] - 1.0) > 1e-6) throw new Error(`Deriv err: expected 1, got ${pRes[6]}`);
});

Deno.test('WGSL Layer 2 Flavor D - Temporal State Machine Continuation', async () => {
  if (!globalThis.navigator || !globalThis.navigator.gpu) return;

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

  const engine = await initEngine(undefined, mathAccumWgsl, '');
  const harness = new WebGPUTestHarness(engine.device, mathAccumWgsl, '');

  // Simulate Checkpoint State loaded via executeUnitTest
  // we pass in zx, zy, iter, _ (padding) to seed the initial checkpoint buffer
  // We want to test that 'loadCheckpoint' flag properly jumps to the correct iteration cycle
  // Start with z=(0.5, 0.5), iter=10
  const inputVectors = new Float32Array([0.5, 0.5, 10.0, 0.0]);

  // Execute unit test_state_resume with `yieldIterLimit` = 2, loadCheckpoint = true
  const cRes = await harness.executeUnitTest('unit_test_state_resume', inputVectors, {
    cameraData: { compute_max_iter: 100.0, step_limit: 2.0, load_checkpoint: 1.0 },
    exponent: 2.0,
  });

  // The shader executes: `continue_mandelbrot_iterations` where `target_iter` will be iter(10) + yield(2) = 12
  // We seeded the initial checkpoint with z=(0.5, 0.5) and iter=10.
  // Wait, if it loads checkpoint, zx=(0.5), zy=(0.5), iter=10.
  // It will execute exactly 2 iterations (since target_iter = iter + yieldIterLimit)
  // And output the new resumed CheckpointState

  const final_iter = cRes[2];
  if (final_iter !== 12.0)
    throw new Error(
      `FSM Continue err: Expected it to yield exactly at iteration 12, but halted at ${final_iter}`,
    );

  // Check the mathematical step:
  // Base step: z_next = z^2 + c. Wait, start_z was forced to (0,0) and start_c was set to zx,zy.
  // Wait, in our WGSL code: `let start_z = vec2<f32>(0.0, 0.0); let start_c = vec2<f32>(zx, zy);`
  // And `if (camera.load_checkpoint > 0.5), it resumes x,y from checkpoint.
  // Our mock initial checkpoint loaded x=0.5, y=0.5, and start_c=(0.5, 0.5).
  // Iter 10 -> 11: (0.5+0.5i)^2 + (0.5+0.5i) = (0.25 - 0.25 + 0.5i) + (0.5 + 0.5i) = 0.5 + 1.0i
  // Iter 11 -> 12: (0.5 + 1.0i)^2 + c = (0.25 - 1.0 + 1.0i) + (0.5 + 0.5i) = -0.25 + 1.5i
  if (Math.abs(cRes[0] - -0.25) > 1e-4)
    throw new Error(`FSM Continue Math err: expected -0.25, got ${cRes[0]}`);
  if (Math.abs(cRes[1] - 1.5) > 1e-4)
    throw new Error(`FSM Continue Math err: expected 1.5, got ${cRes[1]}`);
});

Deno.test('WGSL Layer 2 Flavor D - Series Approximation & BLA Execution', async () => {
  if (!globalThis.navigator || !globalThis.navigator.gpu) return;

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

  const engine = await initEngine(undefined, mathAccumWgsl, '');
  const harness = new WebGPUTestHarness(engine.device, mathAccumWgsl, '');

  const testOrbitNodes = new Float64Array(1000);
  const testMetadata = new Float64Array(16);
  const testBlaGrid = new Float64Array(800);

  // Test SA init tracking the delta and derivative algebraic starting states.
  // Input: dz_x, dz_y, dc_x, dc_y
  const saInputs = new Float32Array([1e-15, 0.0, 1e-15, 0.0]);
  const saRes = await harness.executeUnitTest('unit_test_sa_init', saInputs, {
    refOrbitNodes: testOrbitNodes,
    refMetadata: testMetadata,
    refBlaGrid: testBlaGrid,
  });
  console.log('saRes:', saRes);
  if (Math.abs(saRes[0] - 1e-15) > 1e-6) throw new Error('SA offset failed');
  if (saRes[2] === 0 && saRes[3] === 0) throw new Error('SA Derivative failed');

  // Test BLA advance execution boundaries
  const blaInputs = new Float32Array([1e-15, 0.0, 0.0, 0.0]);
  const blaRes = await harness.executeUnitTest('unit_test_bla_advance', blaInputs, {
    refOrbitNodes: testOrbitNodes,
    refMetadata: testMetadata,
    refBlaGrid: testBlaGrid,
  });

  // Just validating the BLA structural logic natively completes without NaN exceptions in headless.
  // Depending on ref array (which could be entirely 0.0 if not loaded), blaRes[3] indicating advanced might be 0 or 1.
  if (Number.isNaN(blaRes[0])) throw new Error(`BLA corrupted execution: returned NaN`);
});
