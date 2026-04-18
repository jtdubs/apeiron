---
status: closed
---

# Task 076: Adopt WESL (WebGPU Shader Module System)

## Objective

Replace the fragile, manual `.join('\n\n')` string concatenation of WGSL shaders in `ApeironViewport.tsx` and `compileShaderHelper.ts` with a formal WGSL module bundler. The goal is to integrate `wesl` (or formalize the existing `resolveImports` parser into a robust WESL-like bundler) as an `npm run build:shaders` stage that fully supports native dependency resolution before the code hits the browser or Deno environments.

## Relevant Design Docs

- `docs/best-practices.md`
- `AGENTS.md` (Mandates NPM Orchestration and headless Testing parity)

## Requirements

- **Unified Compilation**: The Web application (Vite) and the Headless Harness (Deno) must consume the exact same bundled WGSL artifact (e.g., `src/engine/generated/core_compute.bundled.wgsl`).
- **Zero Runtime Build Overhead**: The browser should not parse or assemble `// #import` strings during runtime rendering.
- **HMR Preservation**: The developer loop (Vite hot module replacement) must not be visibly degraded; `vite.config.ts` must trigger the bundler automatically when a `.wgsl` file changes.

## Implementation Plan

1. Create a `scripts/bundleShaders.ts` (either wrapping `wesl-packager` / `wesl-link` or using a deterministic `#import` linker) to resolve the module graph for `core_compute.wgsl` and `core_render.wgsl`.
2. Output bundled artifacts (e.g. `core_compute.bundled.wgsl`).
3. Update `package.json` with a `build:shaders` script and hook it into the `build:deps` lifecycle.
4. Update `ApeironViewport.tsx` to import the single bundled `.wgsl?raw` file rather than building the array manually.
5. Update `compileShaderHelper.ts` to read the single bundled file.
6. Expand `vite.config.ts` (which currently tracks `rust-math`) to watch `src/engine/shaders/**/*.wgsl` and automatically invoke the `build:shaders` compilation on save.

## Verification Steps

- [x] Execute `npm run test:engine` to ensure the Deno Math Kernels successfully compile the bundled WGSL and headless tests continue to pass.
- [x] Run `npm run dev`, load the WebGPU canvas, and verify no console validation errors occur.
- [x] Verify that saving a `math/*.wgsl` file correctly triggers Vite HMR and updates the shader.
