# State Machine Architecture

## The Problem

Apeiron's rendering pipeline juggles three interlocking state machines to deliver progressive, interactive deep-zoom rendering:

1. **Interaction Machine:** The UI input state (`STATIC` vs `INTERACT_SAFE` vs `INTERACT_FAST`).
2. **Precision Machine:** The mathematical path evaluated (`f32` vs `f64 perturbation` vs `Series Approximation skipping`).
3. **Temporal Pipeline Machine:** The progressive rendering cycle across frames (`INVALIDATED` → `DEEPENING` → `ACCUMULATING` → `RESOLVED`).

Historically, these mechanics have been implicitly derived via localized booleans (e.g., checking if `refOrbits != null` to trigger perturbation) and manually tracking localized cycle counters (`accumulationCount`, `deepeningTotalIter`) inside the `ApeironViewport.tsx` render loop closure.

This tight coupling made the codebase brittle, resulting in massive "dirty-checking" arrays that attempted to implicitly deduce when a transition occurred (e.g. `lastDesc.zr !== zr || lastDesc.maxIter !== state.maxIter`).

## The Solution

To resolve this, we enforce a strict separation between **Declarative Mathematical Intent** and **Imperative Execution Flow** by introducing explicit state machines and immutable configurations.

### 1. Viewport Epochs (Immutable Math Intent)

Instead of manually identifying dirty parameters across individual geometry variables, the global UI state (via `viewportStore`) must generate an immutable `ViewEpoch` (or snapshot) describing the exact mathematical intent of the current frame (coordinates, exponents, precision bounds).

A new epoch is generated on any structural transformation (camera translation, parameter mutation) but is specifically _not_ generated during purely temporal steps (like spatial jittering for supersampling). This makes transition checking a simple `O(1)` object-identity or shallow comparison.

### 2. Temporal Pipeline Finite State Machine (FSM)

The isolated `requestAnimationFrame` loop must be stripped of its internal temporal counters. Instead, an explicit, testable class (acting as the FSM) tracks execution progress through the following discrete stages:

- **`INVALIDATED`**: Triggers when `currentViewEpoch !== lastViewEpoch` (or when user interaction starts). Outputs explicit signals to the GPU to clear the multi-frame accumulation history and wipe the execution checkpoint buffers. Transitions to `DEEPENING`.
- **`DEEPENING`**: Emits chunked iteration limits (`yieldIterLimit`) against the `CheckpointState` buffer. The UI never freezes because the chunking guarantees a 16.6ms slice. Loops until the mathematical boundary (`maxIter`) limit is fully accumulated into the G-Buffer.
- **`ACCUMULATING`**: Initiates sub-pixel jitter arrays. Accumulation frames are recursively sent to the GPU to blend aliased borders. Runs until the temporal multisampling cap is reached.
- **`RESOLVED`**: Terminal state. All iteration limits have been resolved and spatial multisampling is finished. Safely suspends WebGPU commands to drop power consumption to zero.

### 3. Context vs Command Boundary

The monolithic `RenderFrameDescriptor` is bifurcated into two distinct structural interfaces that define the barrier between the DOM logic and the WebGPU context:

- **`MathContext` (The World):** The declarative state. It defines the exact viewable parameters (the 4D topological slice, zoom offsets, and Rust `refOrbit` bounds).
- **`ExecutionCommand` (The Engine):** The imperative instruction set calculated by the Temporal FSM for the active frame. This acts as raw GPU orchestration instructions (e.g., `clearCheckpoint: true`, `blendWeight: 0.125`, `advancePingPong: false`).

### 4. Synergy with the Interaction Machine

The original Interaction frontend states (`STATIC` vs `INTERACT_SAFE` vs `INTERACT_FAST`) are **not obsolete**, but their architectural role is uniquely constrained to configuring the domain logic:

- The Interaction state is managed exclusively by the UI event listeners to track user intent.
- It dictates the _contents_ of the `ViewEpoch` that is generated. For example, during `INTERACT_FAST`, the store guarantees the outgoing `ViewEpoch` has a heavily reduced `maxIter` budget and a `renderScale` $< 1.0$ (triggering Dynamic Resolution Scaling).
- By actively panning/zooming, the Interaction Machine pumps out a high-frequency stream of mutated `ViewEpoch` objects (e.g., $60$ per second).
- The Temporal FSM blindly observes this stream of disparate epochs and mechanically reacts by holding itself in the `INVALIDATED` $\rightarrow$ `DEEPENING` phase (never advancing, dropping all accumulation data).
- Once the Interaction Machine returns to `STATIC`, the epochs stop changing, and the Temporal FSM automatically proceeds to resolve and beautifully supersample the final frame.

### 5. Extensibility: Telemetry and Adaptive DRS

Because we have severed the imperative execution variables from the declarative math variables, the pipeline is perfectly positioned for advanced performance controllers like Adaptive Dynamic Resolution Scaling (ADRS) or dynamic Iteration Budgeting.

- In the future, the `Temporal Pipeline FSM` can be injected with the WebGPU `TimestampQuery` telemetry (e.g., `lastFrameRunTimeMs`).
- If the telemetry detects the GPU is unable to maintain $16.6\text{ms}$ during `INTERACT` mode, the FSM can autonomously throttle the `ExecutionCommand.renderScale` parameter (e.g., dropping from $0.5$ to $0.25$) or reduce the `yieldIterLimit`.
- Crucially, because `renderScale` exists entirely inside the `ExecutionCommand` scope, the FSM regulates the engine's payload on-the-fly _without ever mutating_ the `MathContext` or notifying the React UI.
- The UI retains mathematically perfect coordinates, while the GPU scales dynamically beneath it to maintain fluidity.

### 6. Asynchronous WebWorker Synchronization

A critical complexity in Apeiron is managing the lagging Rust calculations for perturbation Reference Orbits against a continuous stream of fast UI `pan` and `zoom` deltas.

Under the new architecture, the WebWorker heavily leverages the immutable `ViewEpoch` boundary to eliminate race conditions:

1. **Side-Effect Boundary:** The dispatcher that calculates and fires requests to the WebWorker sits strictly in the React/Zustand logic layer, observing the continuous `interaction` stream.
2. **Immutable Mathematics:** When the user pans, the `MathContext` captures the active `anchor` and the drifting `deltas`. When the delayed Rust worker finally returns the new reference orbit, the React layer calculates the _residual delta_ (where the user has panned _since_ the worker request was fired) and dispatches a unified update to the store.
3. **Implicit Reconciliation:** This dispatch simply produces a brand new `ViewEpoch` containing the exact, mathematically synchronized `anchor`, `residual_delta`, and new `refOrbits` buffer.
4. **FSM Reaction:** The `Temporal Pipeline FSM` observes this new `ViewEpoch`. Because the epoch hash has changed, the FSM organically transitions to `INVALIDATED` and rebuilds the image geometry using the pristine `MathContext`.

The complexity of orchestrating the lagging Worker is entirely decoupled from the rendering loop. WebGPU renders whatever valid `MathContext` it has until a brand new synchronized epoch replaces it.
