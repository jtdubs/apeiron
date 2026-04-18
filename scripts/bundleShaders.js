import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

function bundleWGSL(entryPath) {
  const seen = new Set();

  function resolveImports(code, basePath) {
    const importRegex = /\/\/\s*#import\s+["']([^"']+)["']/g;

    return code.replace(importRegex, (match, importPath) => {
      const fullPath = path.resolve(basePath, importPath);

      if (seen.has(fullPath)) {
        return `// [Already imported: ${importPath}]`;
      }
      seen.add(fullPath);

      try {
        const importedCode = fs.readFileSync(fullPath, 'utf8');
        // Recursively resolve imports
        return `// --- Start Import: ${importPath} ---\n${resolveImports(importedCode, path.dirname(fullPath))}\n// --- End Import: ${importPath} ---`;
      } catch (e) {
        console.error(`Failed to resolve import: ${importPath} at ${fullPath}`);
        return match;
      }
    });
  }

  const entryCode = fs.readFileSync(entryPath, 'utf8');
  seen.add(path.resolve(entryPath));
  return resolveImports(entryCode, path.dirname(entryPath));
}

const SHADER_DIR = path.join(__dirname, '../src/engine/shaders');
const OUTPUT_DIR = path.join(__dirname, '../src/engine/generated');

if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

const computeEntry = path.join(SHADER_DIR, 'escape/core_compute.wgsl');
const renderEntry = path.join(SHADER_DIR, 'escape/core_render.wgsl');

console.log('Bundling WGSL Shaders...');

const computeBundled = bundleWGSL(computeEntry);
const renderBundled = bundleWGSL(renderEntry);

fs.writeFileSync(path.join(OUTPUT_DIR, 'core_compute.bundled.wgsl'), computeBundled);
fs.writeFileSync(path.join(OUTPUT_DIR, 'core_render.bundled.wgsl'), renderBundled);

console.log('✅ Shaders successfully bundled.');
