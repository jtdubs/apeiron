# Apeiron Telemetry & Debugging System Design

## 1. Problem Statement

The current debugging HUD located inside `ApeironViewport.tsx` suffers from several architectural and usability issues:

1. **Flickering & Readability:** It updates purely instantaneous values every frame, making it impossible to read volatile metrics like GPU pass times or FSM iteration budgets unless the system is perfectly cold.
2. **Tight Coupling:** The React component manually interrogates `ProgressiveRenderScheduler`, `PerturbationOrchestrator`, and `ApeironEngine` instances. This violates separation of concerns.
3. **Rigidity:** Adding a single new property requires expanding custom strings inside the `requestAnimationFrame` loop and modifying the DOM `innerHTML`.
4. **Lack of Historical Context:** There is no ability to detect transient spikes, memory leaks over time, or WebWorker queuing issues because we do not track time-series data.

## 2. Proposed Architecture

To solve this while adhering strictly to Apeiron's "Zero React in Hot Paths" mandate, the telemetry system should be built as a standalone subsystem split into a **Data Layer** (Registry) and a **Visualization Layer** (Canvas Overlay).

### 2.1 The Data Layer: `TelemetryRegistry`

We will introduce a globally accessible (or engine-injected) `TelemetryRegistry`. It acts as a PubSub/Storage mechanism that owns high-performance **Ring Buffers**.

```typescript
type SignalType = 'analog' | 'digital' | 'text';

interface MetricDefinition {
  id: string; // e.g. "engine.framerate"
  label: string; // e.g. "Overall FPS"
  group: string; // e.g. "Performance", "WebGPU", "Workers"
  type: SignalType;
  smoothingAlpha?: number; // Configurable EMA smoothing factor for text readouts
  minBound?: number; // For time-series: fixed bottom of graph (e.g., 0)
  maxBound?: number; // For time-series: fixed top of graph
}

// Conceptual Interface
class TelemetryRegistry {
  public register(def: MetricDefinition): void;

  // Fire-and-forget push from anywhere in the codebase
  public push(id: string, value: number | string): void;

  // Read access for the visualizer
  public getBuffer(id: string): RingBuffer;
  public getLatest(id: string): number | string;
}
```

### 2.2 Producer Integration (Extensibility)

Instead of the Viewport "Pulling" data, the Engine components "Push" data to the Registry as a side effect of their normal operation:

- `IterationBudgetController`: Pushes `engine.budget.current` whenever it is evaluated.
- `PerturbationOrchestrator`: Calculates Rust WASM round-trip time and pushes `workers.latency`. It also pushes `workers.pendingJobCount`.
- `ProgressiveRenderScheduler`: Pushes the current FSM execution state as an enumeration (Interact vs Accumulate).
- `ApeironEngine`: Uses WebGPU timestamp queries or `performance.now()` to push `webgpu.renderms`.

### 2.3 The Visualization Layer: Real UI Integration

Because the **Data Layer** safely buffers the metrics out of the hot path, we do not have to inherently cripple our UI development. We can achieve a fully featured, "real UI" integration using standard React components while preserving FSM performance.

1. **Throttled React Polling for Text/Layouts:** The React UI (e.g., `<TelemetryDashboard />`) can use a `useInterval` hook (or throttled subscriptions) to poll the latest smoothed values at a human-readable pace (e.g., 4 to 10 FPS). This allows us to build standard, beautiful React components for the menus, grids, and values without thrashing the DOM at 60 FPS.
2. **Logic-Analyzer Style Drawing for Sparklines:** The small, localized `<canvas>` refs inside standard React layouts will draw high-density buffers in two distinct styles, modeled after simulation analyzer platforms like GTKWave:
   - **Analog Waveforms:** For continuous, time-varying values (e.g., FPS, GPU ms). Rendered as traditional connected line or area graphs.
   - **Digital Waveforms:** For discrete values (booleans, enums like the FSM `INTERACT` vs `ACCUMULATING` state). Rendered as non-interpolating step-functions (flat sustained lines that snap instantly to the new value on state changes), optionally filled with distinct state-colors.
3. **Temporal Correlation:** By explicitly supporting both formats, developers can visually stack the timeline. A transient spike in the "Analog" webworker backlog can be visually aligned perfectly against the "Digital" moment the Panning Engine state snapped.

### 2.4 Dev Experience & UI Aesthetics

- **Visual Aesthetic:** The system matches Apeiron's premium look: blurred dark backgrounds, clear text, and distinct, vibrant signal lines.
- **Dynamic Signal Selection:** Instead of rigid categorized tabs that prevent cross-domain correlation, the UI provides a searchable tree or list of all registered data points. Developers can selectively "Add to View", assembling a custom dashboard of waveforms tailored entirely to their specific debugging task (e.g., tracking a spike in `webgpu.renderms` directly alongside `engine.fsm` state).
- **View Presets:** To accelerate common debugging workflows, the system will support pre-configured presets (e.g., "Performance Base", "FSM Deep Dive", "Worker Triage") that instantly populate the viewer with highly correlated metric groups.

### 2.5 Time Base & Trace Capture

Taking inspiration from hardware oscilloscopes and logic analyzers, continuous 60fps data feeds can quickly overwrite transient events. The telemetry UI must provide time-axis controls to analyze the Ring Buffer history:

1. **Pause / Trace Capture:** A toggle that "Freezes" the UI. This temporarily detaches the `TelemetryRenderer` from the live head of the Ring Buffer, freezing the historical window on the screen for analysis, while the engine safely continues computing underneath.
2. **Zoom and Pan:** While the trace is captured/paused, developers can zoom in (scaling the X-axis) to inspect an individual 16ms frame boundary, and pan left/right across the captured buffer to find perfectly aligned digital state changes and analog spikes.
3. **Oscilloscope Triggers:** Support for programmatic triggers (e.g., "Pause trace automatically when `webgpu.renderms > 25ms`" or "when `engine.fsm` leaves `ACCUMULATING`"). This allows the developer to catch rare edge-case bugs without needing superhuman reflexes.

## 3. Recommended Metric Candidates

We can incrementally track anything with this architecture. Initial targets:

**System & Engine:**

- Overall FPS
- GPU Frame Time ($\Delta$t)
- Canvas resolution scale (adaptive scaling tracking)

**WebGPU Pipelines:**

- Accumulator Pass (ms) - Time required for the heavy Math Compute pass.
- Resolve Pass (ms) - Time required for the 60fps lighting/presentation Shader.

**WebWorkers & Parallelism:**

- Pending Jobs in queue
- Round-trip Latency against the Rust WASM module

**Engine FSM (ProgressiveRenderScheduler):**

- `yieldIterLimit` (The dynamic PID budget constraint)
- SA Skip Depth vs Total Iterations required for a pixel fragment
- Current Render Phase (INTERACT, DEEPENING, ACCUMULATING)

## 4. Implementation Phasing

1. **Phase 1:** Build the `RingBuffer` and `TelemetryRegistry` primitives. Integrate them into `initEngine.ts` or as a top-level singleton.
2. **Phase 2:** Instrument the existing classes to push to the registry, decoupling them.
3. **Phase 3:** Write `TelemetryRenderer.ts` (Canvas 2D API) to natively draw EMA text and basic sparklines.
4. **Phase 4:** Wrap the renderer in a pretty `ApeironTelemetryUI.tsx` floating glassmorphic container and replace the old `hudRef` approach in `ApeironViewport`.
