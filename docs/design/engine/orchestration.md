# Execution Orchestration

While `core-math.md` defines the pure mathematical algorithms operating inside Rust and WGSL, the **Execution Orchestration** layer defines the JavaScript/TypeScript boundary responsible for scheduling, dispatching, and managing those calculations without blocking the main UI thread.

The orchestration layer acts as the bridge between declarative user intent (e.g., "zoom into this coordinate") and the imperative execution of complex, asynchronous computations.

## 1. Core Components

The orchestration layer primarily consists of the following systems within `src/engine/`:

- **`PerturbationOrchestrator.ts`**: The central coordinator. It maintains the current high-precision positional state and decides _when_ a new reference orbit needs to be calculated versus when the existing orbit can be reused (e.g., perturbation theory).
- **`math-workers/rust.worker.ts`**: The WebWorker boundary. Heavy arbitrary-precision calculations (`f64`, BigFloat arrays) cannot run on the main thread without causing UI stutter. All Rust/WASM executions are routed through this asynchronous worker.
- **`seriesApproximation.ts`**: The TypeScript-side heuristics engine that governs Series Approximation and Bilinear Approximation coefficient application before data is flushed to the GPU.

## 2. The Orchestration Lifecycle

When the user interacts with the fractal, the following asynchronous workflow is executed:

1. **Intent Reception**: The `ApeironViewport` updates the centralized Zustand store, which triggers a state change in the `MathContext`.
2. **Evaluation & Dispatch**: `PerturbationOrchestrator` receives the new `MathContext`. It evaluates the scale and coordinates against the currently cached reference orbit.
   - _Cache Hit_: If the zoom delta is small enough, it falls back to Perturbation offsets.
   - _Cache Miss_: It serializes the precision inputs and dispatches a message to `rust.worker.ts`.
3. **Off-Thread WASM Execution**: The WebWorker invokes the compiled Rust core, generates the Deep Zoom orbit data and coefficient structures, and returns the payloads (ideally via zero-copy transferable ArrayBuffers).
4. **Data Binding**: The Orchestrator hands the calculated high-precision boundaries over to the structures defined in `MemoryLayout.ts`.
5. **Pipeline Trigger**: Finally, it signals the `ProgressiveRenderScheduler` (which governs the Temporal Pipeline) that new reference data is ready on the GPU, resetting the accumulation buffers and dispatching the WebGPU render passes.

## 3. Strict WebWorker Constraints

Because this layer operates heavily with WebWorkers, it strictly adheres to these rules:

- **No Class Instances Over Boundaries**: Complex classes with functional methods cannot cross the `postMessage` barrier. All data moving between the Orchestrator and the WebWorker must be flattened into structured clones or raw `ArrayBuffers`.
- **Headless Deno Parity**: For testing (as defined in `headless-execution.md`), the Orchestrator must not rely on browser-specific Worker polyfills that lack Deno equivalents. Worker initialization uses paths abstract enough to execute concurrently in CI pipelines.
