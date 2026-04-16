import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Recursively find and process imports (rudimentary custom preprocessor)
function resolveImports(code: string, basePath: string): string {
  // Matches `// #import "relative/path.wgsl"`
  const importRegex = /\/\/\s*#import\s+["']([^"']+)["']/g;
  return code.replace(importRegex, (match, importPath) => {
    const fullPath = path.resolve(basePath, importPath);
    try {
      const importedCode = fs.readFileSync(fullPath, 'utf8');
      return resolveImports(importedCode, path.dirname(fullPath)); // Recursive import resolution
    } catch {
      console.error(`Failed to resolve import: ${importPath} at ${fullPath}`);
      return match;
    }
  });
}

async function lintWgsl() {
  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    console.error('No GPU adapter found for linting.');
    process.exit(1);
  }
  const device = await adapter.requestDevice();

  const shadersToLint = [
    path.join(__dirname, '../src/engine/shaders/escape/math_accum.wgsl'),
    path.join(__dirname, '../src/engine/shaders/escape/resolve_present.wgsl'),
  ];

  let hasErrors = false;

  for (const fullPath of shadersToLint) {
    const code = fs.readFileSync(fullPath, 'utf8');
    const resolvedCode = resolveImports(code, path.dirname(fullPath));

    device.pushErrorScope('validation');
    const module = device.createShaderModule({ code: resolvedCode });
    const info = await module.getCompilationInfo();
    const error = await device.popErrorScope();

    if (error || info.messages.length > 0) {
      for (const msg of info.messages) {
        if (msg.type === 'error') {
          console.error(
            `[❌ Error] ${path.basename(fullPath)}:${msg.lineNum}:${msg.linePos} - ${msg.message}`,
          );
          hasErrors = true;
        } else if (msg.type === 'warning') {
          console.warn(
            `[⚠️ Warning] ${path.basename(fullPath)}:${msg.lineNum}:${msg.linePos} - ${msg.message}`,
          );
        }
      }
    } else {
      console.log(`[✅ OK] ${path.basename(fullPath)} passed validation.`);
    }
  }

  if (hasErrors) {
    console.error('\nWGSL Linting Failed.');
    process.exit(1);
  }
}

lintWgsl().catch(console.error);
