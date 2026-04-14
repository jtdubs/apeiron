# Apeiron Test Plan & Debugging Methodology

## 1. Overview and Core Philosophy

Rendering fractals using perturbation theory and complex UI state machines introduces multiple potential failure points: arbitrary precision truncation across Web Workers, floating-point GPU limits, and asynchronous queue starvation.

To resolve these deterministically, Apeiron explicitly separates testing by stack layer. We avoid perceptual image diffing (e.g. `pixelmatch` on PNGs) because multi-sampling (MSAA) generates false positives. All testing operates _headlessly_, enforcing rigid data constraints before ever summoning a pixel.

## 2. Layer 1: Math Core (Rust/WASM)

The native Rust backend acts as our unassailable mathematical ground truth. It executes entirely independently of WebGPU or React states.

- **Goal:** Provide pristine arbitrary-precision data for downstream boundary tests.
- **Methodology:** Ground truth test cases live in `tests/cases.json`. The Rust worker natively iterates these bounding boxes using pure `BigFloat` precision. Instead of outputting `.png` images, it dumps binary ArrayBuffers containing the accurately resolved `[Iteration, EscapedAt]` pair for each coordinate matrix. Let this be committed as artifacts (`tests/artifacts/truth_case_01.json`).

## 3. Layer 2: Render Engine (WebGPU)

The WebGPU engine is tested headlessly (`npm run test:engine`) using Deno to validate Shader execution against the Rust ground truth. We employ two flavors of Data-First testing:

### Flavor A: Correctness Testing (Fuzzy Comparison)

- **Goal:** Prove the fast WGSL shader math adequately approximates the true mathematical fractal.
- **Methodology:** We compare the output buffer generated headlessly by WebGPU against the Rust ground-truth arrays. We validate sub-pixel offsets ($\Delta c$ clusters) instead of single anchor points.
- **Tolerance:** WebGPU natively uses rigid `f32` floats. Epsilon tolerances (Fuzzy Matching) are allowed to cover normal bounds deviations at extreme depths.

### Flavor B: Regression Testing (Bit-Perfect Comparison)

- **Goal:** Ensure refactors and engine updates do not silently break previously mapped behavior.
- **Methodology:** Compare the WGSL buffer generated _today_ against a cached WGSL array buffer generated _last week_.
- **Tolerance:** Strict Bit-Perfect absolute equality. If deterministic shader math shifts, it throws an error.

### Headless Execution Adapter Requirements

Because CI environments lack physical GPUs, test runner initialization MUST include an explicit hardware check via `navigator.gpu.requestAdapter()`. The Deno orchestration script explicitly passes `--unstable-webgpu` to securely leverage SwiftShader software rasterization before compiling and running `.wgsl` cases.

## 4. Layer 3: Frontend UI & Worker Orchestration

The outermost layer relies on React, Zustand, and a Web Worker (communicating back to Layer 1) to operate the Render Quality State Machine without freezing the UI. This is validated via `npm run test:ui`.

- **Goal:** Ensure the "Latest-Only Dispatch Buffer" never spams the WASM worker, and UI rendering states pivot fluidly between `STATIC`, `INTERACT_SAFE`, and `INTERACT_FAST`.
- **Methodology:** We utilize **Vitest + `@vitest/web-worker`** layered over JSDOM.
- **Implementation:**
  1. The WebGPU context (`initEngine`) is strictly mocked out.
  2. The actual Rust Web Worker class is natively intercepted and executed in real-time by `@vitest/web-worker`, granting full validation of `postMessage` data-passing strings and absolute deltas.
  3. We apply `vi.useFakeTimers()` inside isolated hooks to guarantee exact debounce timings (e.g., verifying rendering falls back to `STATIC` _exactly_ 150ms after the last user pan).

## 5. Recommended Debugging Workflow

1. **State Machine UI error:** Add a `react-testing-library` verification to `src/ui/components/__tests__/` relying on `vi.advanceTimersByTime`.
2. **Visual Fractal glitch identified:** The coordinate inputs are extracted into a new entry in `tests/cases.json`.
3. The Rust generator compiles the exact mathematical ground-truth ArrayBuffer.
4. The WGSL shader is debugged and continuously validated against Flavor A until the epsilon error bounds pass.
5. The passing WGSL array is cached to prevent future regressions via Flavor B tests.
