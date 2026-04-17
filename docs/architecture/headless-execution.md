# Headless Execution & Test Parity

Apeiron prioritizes **Deterministic Data Verification** over purely perceptual visual regression. To achieve this, the core rendering pipeline must be capable of running identically in a headless `Deno` test environment as it does in a `Vite/React` browser environment.

## 1. Subsystem Isolation

Any TS logic existing in `src/engine/` is completely isolated from the Browser DOM.

- **NO** `window.`, `document.`, or `canvas` queries are allowed inside the engine.
- **NO** implicit `requestAnimationFrame`. If the FSM requires a tick, the tick must be abstracted as a driver dependency.

## 2. Dependency Injection for WebGPU

To achieve headless parity, our WebGPU abstractions must accept an injected `GPUAdapter` and `GPUDevice`. In the browser, this is fulfilled by `navigator.gpu.requestAdapter()`. In the tests, it is fulfilled by Deno's native `navigator.gpu` implementation.

This dependency injection pattern is the primary defense mechanism allowing for automated CI tests of complex shader mathematics without failing due to a lack of a physical browser Canvas element.

## 3. Worker Emulation

WebWorkers are heavily used by the math orchestrator (`src/engine/math-workers/rust.worker.ts`). When testing under Deno, we rely on Deno's Web Worker API implementation. Testing paths that touch these workers must be structured asynchronously and explicitly avoid browser-only `postMessage` polyfills.
