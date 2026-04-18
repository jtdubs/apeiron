import fs from 'node:fs';
import path from 'node:path';

export function getCompiledMathShader(): string {
  return fs.readFileSync(path.resolve('./src/engine/generated/core_compute.bundled.wgsl'), 'utf8');
}

export function getResolveShader(): string {
  return fs.readFileSync(path.resolve('./src/engine/generated/core_render.bundled.wgsl'), 'utf8');
}
