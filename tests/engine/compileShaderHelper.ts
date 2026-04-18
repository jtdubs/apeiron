import fs from 'node:fs';
import path from 'node:path';

export function getCompiledMathShader(): string {
  const read = (p: string) => fs.readFileSync(path.resolve(p), 'utf8');

  return [
    read('./src/engine/shaders/escape/generated/layout.wgsl'),
    read('./src/engine/shaders/escape/generated/layout_accessors.wgsl'),
    read('./src/engine/shaders/math/complex.wgsl'),
    read('./src/engine/shaders/math/polynomial.wgsl'),
    read('./src/engine/shaders/math/double_single.wgsl'),
    read('./src/engine/shaders/math/f64_decode.wgsl'),
    read('./src/engine/shaders/escape/standard_iteration.wgsl'),
    read('./src/engine/shaders/escape/bla_stepper.wgsl'),
    read('./src/engine/shaders/escape/perturbation.wgsl'),
    read('./src/engine/shaders/escape/core_compute.wgsl'),
  ].join('\n\n');
}

export function getResolveShader(): string {
  const read = (p: string) => fs.readFileSync(path.resolve(p), 'utf8');
  return (
    read('./src/engine/shaders/escape/generated/layout.wgsl') +
    '\n' +
    read('./src/engine/shaders/escape/core_render.wgsl')
  );
}
