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

  const mathAccumWgslStr =
    layoutWgsl +
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
