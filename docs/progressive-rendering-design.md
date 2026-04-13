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

### State: `STATIC` (The Accumulation Pivot)

- **Trigger:** A debounce threshold ($~150\text{ms}$) expires after the last user-driven coordinate mutation.
- **Execution:** WebGPU spins up multi-frame accumulation. Over the next $X$ frames, it mathematically jitters the coordinate inputs incrementally. It compounds these into a ping-pong buffer. Once the accumulation limit ($~64$ frames) is reached, standard rendering halts to eliminate GPU/battery drain.

### State: `INTERACT_SAFE` (The Extrapolation Pivot)

- **Trigger:** The user pans/zooms actively, but stays within a safe scalar radius of the current mathematical Perturbation Reference Orbit.
- **Execution:** Operations drop to 1-sample-per-pixel and flush the accumulation buffer. WebGPU continues calculating geometry using the _previous_ Reference Orbit, mathematically applying the new mouse coordinate deltas. A request for a _new_ Reference Orbit is concurrently posted to the asynchronous Rust Web Worker.

### State: `INTERACT_FAST` (The 2D Fallback Pivot)

- **Trigger:** Aggressive zooming or panning pushes the coordinate camera outside the mathematical limits of the current Reference Orbit before the Web Worker can reply.
- **Execution:** WebGPU suspends executing new math to avoid floating-point black-noise. Instead:
  - **Zoom**: The most recent WebGPU texture is dynamically scaled (2D stretched).
  - **Pan**: The texture physically slides, leaving a solid "Void" mask (or sampling from an offscreen coarse history buffer) to clearly signal unrendered geometry.
- **Recovery Handshake:** Once the Rust Web Worker returns the new orbit, its **Epoch ID** is validated against the active interaction cycle state. Upon handshake, the system instantly snaps back to `INTERACT_SAFE` resolving the exact geometry.

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

## 4. Impact on Architectural Boundaries

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
