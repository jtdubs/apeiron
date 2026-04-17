# Apeiron Telemetry & Debugging System Design

## 1. Problem Statement

The telemetry subsystem provides critical visibility into the mathematically intensive rendering core. However, an unmanaged telemetry approach introduces severe architectural flaws:

1. **Temporal Drift:** Independent event streams (e.g., worker message callbacks vs `requestAnimationFrame` vs WebGPU callbacks) arrive asynchronously. If metrics are pushed independently, the timeline tears, making it impossible to correlate causality (e.g., did worker latency spike _before_ or _after_ the FSM transitioned?).
2. **Hot-Path Overhead:** Doing `Map.set("engine.fps", val)` or triggering `setInterval` tracing closures thousands of times across various components introduces significant string-mapping latency, unnecessary GC pressure, and polling overhead right when the engine needs all available resources to draw the frame.
3. **Implicit State:** If a producer stops pushing a metric (e.g., worker queue empties), does the UI render `0`, hold the last value indefinitely, or draw empty space? These implicit rules cause false readings in analysis.

## 2. Lockstep Frame-Series Architecture

To solve this while adhering strictly to Apeiron's "Zero React in Hot Paths" mandate, the telemetry system is built as a highly structured, lockstep subsystem governed globally by the main render loop.

### 2.1 The Data Layer: `TelemetryRegistry`

The registry acts as a centralized struct-of-arrays manager. Instead of async event pushing, all telemetry strictly advances at the `requestAnimationFrame` boundary.

```typescript
type SignalType = 'analog' | 'digital' | 'text' | 'enum';
type RetentionPolicy = 'latch' | 'lapse';

interface MetricDefinition {
  id: string; // e.g. "engine.framerate"
  label: string; // e.g. "Overall FPS"
  group: string; // e.g. "Performance"
  type: SignalType;
  retention: RetentionPolicy;
  lapseValue?: number; // Value to use when metric is not set (defaults to NaN)
  smoothingAlpha?: number; // Configurable EMA smoothing factor
}

export interface TelemetryChannel {
  /** High performance zero-allocation memory write */
  set: (value: number) => void;
}
```

### 2.2 Retention Semantics: Latch vs Lapse

Because we operate in lockstep, every signal must emit exactly _one_ value per frame. How we handle components that _don't_ emit data during a frame defines our semantics:

- **Lapse (Event/Transient):** Used for instantaneous occurrences. If the producer doesn't call `.set()` this frame, the value defaults to `lapseValue` (usually `NaN`, which the UI renders as a break in the line, or `0` for an instantaneous trigger).
  - _Example: `workers.dispatchedJobId` occurs exactly on the frame the worker is dispatched._
- **Latch (Stateful/Carry-Over):** Used for continuous states. If the producer doesn't call `.set()` this frame, the registry automatically carries over the value from the previous frame.
  - _Example: `workers.activeJobId` stays latched to the ID of the rendering orbit until the job resolves, or `engine.fsm` mode remains in `INTERACT`._

### 2.3 Memory-Mapped Closures (Zero Allocations)

To completely eliminate `Map` string lookups and GC allocations on the hot path, `reg.register()` returns a dedicated `TelemetryChannel` closure.

Internally, the `TelemetryRegistry` maintains two flat memory regions:

1. `Float64Array`: Contains the active values collected this frame via index bounds.
2. `Uint8Array`: A bitmask tracking which metrics were explicitly set this frame.

When an engine component executes, it uses the closure to directly index and write the value into memory (`this.activeTransients[idx] = val; this.transientFlags[idx] = 1;`). It contains absolutely zero branching or string lookup logic.

### 2.4 The Execution Boundary

The main `ApeironViewport` drives the registry explicitly around its FSM tick:

```typescript
// 1. Reset the bitmask and prepare for accumulation
registry.beginFrame();

// 2. Drive the FSM. Any component might write metrics here.
const command = scheduler.update(...);
engine.renderFrame(...);

// 3. Unpack bitmasks, apply Latch/Lapse policies, and push values into the RingBuffer history.
registry.commitFrame();
```

## 3. The Visualization Layer: DX & GTKWave

1. **Throttled React Polling:** The React UI (`<TelemetryDashboard />`) uses `useInterval` hooks to poll string-based EMA readouts to prevent 60FPS DOM thrashing.
2. **Logic-Analyzer Drawing:** Short-circuited `<canvas>` rendering overlays high-density buffers similar to simulation analyzers like GTKWave:
   - **Analog Waveforms:** Traditional continuous interpolation.
   - **Digital Waveforms:** Non-interpolating step functions. Lines jump instantaneously without sloped connections, rendering state changes like `engine.fsm` perfectly vertically.
3. **Time-Base Scrubbing:** The dashboard supports horizontal scroll wheel navigation to pan perfectly backwards in time across the buffer history, freezing trace capture automatically.

### 3.1 Time Base, Scrubbing & Trace Capture

Taking inspiration from hardware oscilloscopes and logic analyzers, continuous 60fps data feeds can quickly overwrite transient events. The telemetry UI must provide time-axis controls to analyze the Ring Buffer history:

1. **Pause / Trace Capture:** A toggle that "Freezes" the UI. This temporarily detaches the `TelemetryRenderer` from the live head of the Ring Buffer, freezing the historical window on the screen for analysis, while the engine safely continues computing underneath.
2. **Zoom and Pan:** While the trace is captured/paused, developers can zoom in (scaling the X-axis) to inspect an individual 16ms frame boundary, and pan left/right across the captured buffer to find perfectly aligned digital state changes and analog spikes.
3. **Oscilloscope Triggers (Planned):** Support for programmatic triggers (e.g., "Pause trace automatically when `webgpu.renderms > 25ms`" or "when `engine.fsm` leaves `ACCUMULATING`"). This allows the developer to catch rare edge-case bugs without needing superhuman reflexes to manually slam the pause button.

By synchronizing `latch`/`lapse` data on explicit `commitFrame` boundaries, the UI visualizes perfect temporal correlations (e.g., aligning an analog latency graph seamlessly underneath a digital FSM enum trace) guaranteeing absolute causality tracking.
