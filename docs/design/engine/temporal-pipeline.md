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

# Progressive Rendering & Performance Design

To maintain a fluid, zero-latency UI while yielding mathematically pristine, heavily anti-aliased fractal images, Apeiron utilizes a dynamic progressive rendering pipeline. This document defines the methodologies evaluated, the chosen state-machine architecture, and the cross-layer boundary requirements necessary to execute it.

## 1. Options Evaluation

The challenge involves calculating millions of iterations per pixel without exceeding a `16.6ms` frame budget during UI interaction.

1. **Dynamic Resolution Scaling (DRS)**
   - _Behavior:_ Modifies the internal compute buffer resolution to a fraction of the viewport (e.g. 50%), then upscales visually.
   - _Verdict:_ Necessary as a fallback for ultra-punishing parameter boundaries ($>10^{300}$), but visually "soft" during panning.
2. **Sparse Pixel / Checkerboarding**
   - _Behavior:_ Renders a fraction of the pixels sequentially across multiple frames.
   - _Verdict:_ Rejected. Produces harsh ghosting/tearing during camera movement across fractal coordinate planes.
3. **Multi-Frame Accumulation (Temporal Supersampling)**
   - _Behavior:_ Renders $100\%$ scale but only $1$ math-sample per pixel continuously. When movement ceases, it applies sub-pixel offsets and averages the result mathematically over several frames.
   - _Verdict:_ The ideal solution. Fluid when in motion, crisp when stationary.

## 2. The Render Quality State Machine

Apeiron combines DRS, Accumulation, and **Asynchronous Orchestration** into a holistic state machine to maintain 60fps under punishing computational loads.

### State: `ACCUMULATING` (The Temporal Supersampling Pivot)

- **Trigger:** The fractal has fully finished calculating its depth geometry (signaled via GPU), but the user is stationary.
- **Execution:** WebGPU mathematically jitters the coordinate inputs incrementally. It compounds these into a ping-pong buffer. Once the accumulation limit ($~64$ frames) is reached, standard rendering halts to eliminate GPU/battery drain, leaving a pristine anti-aliased image.

### State: `INTERACT` (The Extrapolation Pivot)

- **Trigger:** The user pans/zooms actively.
- **Execution:** Operations drop to 1-sample-per-pixel and flush the accumulation buffer. To maintain 60fps, the FSM employs **Adaptive Dynamic Resolution Scaling (ADRS)**, reading live GPU macro-benchmarks (`lastMathPassMs`) to dynamically step the `renderScale` (down to 25%) and the `maxIter` cap based on computational load. Concurrently, a request for a _new_ Reference Orbit is posted to the asynchronous Rust Web Worker.

### State: `DEEPENING` (The Decoupled Compute Pivot)

- **Trigger:** The user stablizes movement, but the heavy deep-zoom geometry requires more iterations than can fit in a single 16.6ms frame.
- **Execution:** Operations execute chunks of computation defined by a non-blocking frame budget (`stepLimit`). WebGPU saves cross-frame memory into a `Checkpoint Buffer`, continuing calculation exactly where the previous frame ended, until the mathematical evaluation limit (`computeMaxIter`) is reached.

## 3. Asynchronous Orchestration Protocol (The Latest-Only Buffer)

To guarantee the UI never fundamentally locks up during continuous mouse panning, we must enforce a strict one-job limit on the Rust Web Worker queue. If we fire a Web Worker request on every $60$fps pointer event, the worker queue will explode and create a massive resolution delay.

To solve this, the orchestrator acts as a **Latest-Only Dispatch Buffer**:

1. **The First Move:** When the user initiates a pan, the UI checks the Worker state. It is `IDLE`. The UI dispatches the coordinates (Epoch 1) and locks the worker to `BUSY`.
2. **The Continuous Movement:** The user continues panning rapidly (e.g., generating Epochs 2 through 15). Because the worker is `BUSY`, the UI **does not** post messages to it. WebGPU transitions into `INTERACT_FAST` (rendering scaled 2D textures at 60fps). The UI silently queues _only_ the most recent coordinate event into a singular holding variable (`pendingRequest = Epoch 15`).
3. **The Yield:** The Rust Worker finishes Epoch 1 and posts the data back to the main thread.
4. **The Resolution & Discard:** The UI receives Epoch 1. It checks the active user state:
   - _Is the user still panning?_ Yes, the active trailing state is Epoch 15.
   - _Action:_ The UI **discards** the mathematical render data from Epoch 1 entirely (avoiding a jarring visual pop-in). It immediately grabs the freshest coordinate sitting in the holding variable (`Epoch 15`), clears the holding variable, and dispatches Epoch 15 to the worker.

This logic guarantees the Rust calculations are never separated from the UI state by more than a single calculation cycle, maintaining UI fluidity infinitely regardless of how wildly or continuously the user scrubs the map.

## 4. Execution Budget Decoupling & Telemetry

To eliminate lag during deep, interior-heavy fractal exploration, the system enforces a strict quality budget utilizing asynchronous memory flags and relies on GPU telemetry for tuning.

### Deterministic Execution Boundaries (`stepLimit`)

To ensure smooth 60fps bounds without sacrificing mathematically exact geometry bounds, the FSM isolates frame budgets from analytical depths:

- **Asynchronous Chunking:** During `DEEPENING`, the system provides a fixed processing chunk (`stepLimit`) to the fragment kernel. The shader computes forward strictly up to this limit.
- **`completion_flag` Hardware Signaling:** When the entire buffer successfully finishes parsing the mathematical iteration limits without breaking early, the GPU writes directly to an `atomic<u32>` buffer mapped via `mapAsync` promises. The CPU reads this asynchronous pipeline flag seamlessly to know when to gracefully transition the FSM into `ACCUMULATING`.
- **Zero-DOM Execution Guarantee:** The frame execution yields deterministic math regardless of how small the chunk slices are, keeping logic purely independent of timing or screen FPS fluctuations.

### GPU Frame-Time Telemetry

`PassManager` integrates asynchronous WebGPU `TimestampQuery` infrastructure surrounding the mathematical accumulation pass.

- Bounding the math execution with GPU timers provides a rolling, non-blocking measure of precise kernel execution times.
- These metric points are surfaced to the React UI via a `showPerfHUD` toggle, ensuring that optimization tuning is driven by objective telemetry rather than subjective perception.

## 5. Impact on Architectural Boundaries

Executing this requires clear, isolated boundaries across our three top-level components:

### A. Frontend Layer (React/Zustand)

- **Role:** Input detection and debouncing.
- **Impact:** The UI layer handles pointer events and active zooming. It must expose a reactive `AppState.isInteracting` boolean in the Zustand store. It is responsible for the $150\text{ms}$ trailing timeout that triggers the `STATIC` fallback. It must never manipulate the raw WebGPU cycle.

### B. Math Backend (Rust/WASM)

- **Role:** Sub-pixel jitter handling.
- **Impact:** The Math layer calculates the reference orbits. Since the Render Engine handles accumulation via sub-pixel offset mapping, the Math logic must be built to support receiving a `[offsetX, offsetY]` vector uniform. This allows it to physically shift the starting $Z$ calculation by fractions of a pixel width during the `STATIC` cycle.

### C. Rendering Engine (WebGPU)

- **Role:** Ping-pong accumulation and buffer management.
- **Impact:** Must maintain at least two separate texture/buffer bindings: `Buffer A` (Previous Frame) and `Buffer B` (Current Render). In the `STATIC` state, the shader logic must execute: `Buffer B = mix(Buffer A, new_math_sample, 1.0 / frame_count)`. It must seamlessly swap these bind groups without blocking the main thread.
