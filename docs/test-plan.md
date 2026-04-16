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

### Flavor C: Presentation Integration Testing

- **Goal:** Verify that UI configuration (color palettes, shading models, coordinate bounds) correctly filters through the `PassManager` to generate stable pixels without WebGPU rendering artifacts.
- **Methodology:** We decouple rendering dependencies (`HTMLCanvasElement`) and run the full 2-pass sequence (`compute` + `resolve`) targeting offscreen textures. Output buffers are scanned explicitly for `NaN`-derived colors (e.g. solid Magenta) or visual collapses.
- **Tolerance:** Explicit fault logic. Render must NOT contain known error markers.

### Flavor D: Isolated WGSL Unit Tests

- **Goal:** Prove the mathematical fidelity of pure WGSL helper functions (e.g., `complex_mul`, `complex_sq`) independently of the full algorithmic pipeline.
- **Methodology:** Use alternate `@compute` entry points (following a strict `@compute fn unit_test_...` naming convention). Feed `test_in` standard buffers containing known operands and assert against `test_out` buffers outputting the discrete results.
- **Tolerance:** Pure strict equality matching JS logic verification; mathematically deterministic headless testing.

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

## 5. Test-Driven Bug Resolution Protocol

Across all application layers, any identified bug or rendering glitch must be resolved using the following strict test-driven workflow:

1. **Document:** Ensure the bug is detailed comprehensively in a `docs/tasks/` file.
2. **Research:** Review the implementation and relevant design documentation (e.g., `math-backend-design.md`, `rendering-engine-design.md`) to isolate the theoretical root causes (state machines, WebGPU float tolerances, worker starvation, etc.).
3. **Reproduce via Test:** Create a deterministic test case that specifically detects the bug and fails under the current implementation. **Crucially, do not modify application source code during this step.** Whether it requires a new ground-truth entry in `tests/cases.json`, a new array validation in `engine.deno.ts`, or a UI state mock in Vitest, the test must capture the faulty state without altering application mechanics.
4. **Fix and Validate:** Once a test definitively fails because of the documented bug, implement the patch in the application code. Iterate on the source code until the isolated test case succeeds, validating the resolution.

For visual or mathematical glitches specifically, trace this path:

- Extract the coordinate inputs into a new entry in `tests/cases.json`.
- Have the Rust generator compile the exact mathematical ground-truth ArrayBuffer (or analyze for expected out-of-bounds metrics like `NaN`/`Infinity`).
- Debug the WGSL pipeline and validate headlessly until mathematical parity is achieved and the test passes.
- Save the passing WGSL array baseline to prevent future regressions via Layer 2 "Flavor B" regression checks.
