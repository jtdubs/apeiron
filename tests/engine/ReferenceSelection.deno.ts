// @ts-expect-error: Deno standard library URL resolution is intentionally allowed in Deno tests
import { assertAlmostEquals } from 'https://deno.land/std@0.220.0/assert/mod.ts';
import path from 'node:path';

Deno.test('Rust Math - Singular Points Reference Selection', async () => {
  // We'll spin up the worker to talk to the Rust WASM module
  const workerPath = path.resolve('./src/engine/math-workers/rust.worker.ts');
  const worker = new Worker(new URL(`file://${workerPath}`).href, { type: 'module' });

  // A known period-3 bulb (nucleus is approximately cr: -0.12, ci: 0.74)
  // The exact center is around -0.12256116... + 0.74486176... i.
  // We will start with a naive guess and see if it refines it.
  const cr = -0.12;
  const ci = 0.74;

  const result = await new Promise<{
    cr: number;
    ci: number;
    refType: string; // 'nucleus' or 'misiurewicz'
    period: number;
    pre_period: number;
  }>((resolve, reject) => {
    worker.onmessage = (e) => {
      if (e.data.type === 'REFINE_RESULT') resolve(e.data);
    };
    worker.onerror = reject;
    worker.postMessage({
      id: 1,
      type: 'REFINE_REFERENCE',
      cr: cr.toString(),
      ci: ci.toString(),
      max_iterations: 1000,
    });
  });

  worker.terminate();

  console.log('Refined Result:', result);

  // The true nucleus of the period 3 bulb: roughly -0.122561166 + 0.744861766i
  assertAlmostEquals(result.cr, -0.122561166, 1e-6);
  assertAlmostEquals(result.ci, 0.744861766, 1e-6);
  if (result.refType !== 'nucleus') throw new Error('Expected to find a nucleus');
  if (result.period !== 3) throw new Error(`Expected period 3, got ${result.period}`);
});
