# Apeiron Code Layout & Nomenclature

This document outlines the physical directory layout and component naming conventions used to build Apeiron, enforcing strict architectural boundaries.

## 1. Top-Level Directory Layout

Apeiron utilizes a codebase structure that strictly segregates native WebAssembly computation, headless orchestration, and React-based UI.

```text
apeiron/
├── package.json          (Root orchestrator/Husky configuration)
├── vite.config.ts
├── tsconfig.json
│
├── rust-math/
│   ├── Cargo.toml        (Compiles via wasm-pack to target Node/Web)
│   ├── src/
│   │   ├── lib.rs        (WASM bindings and exposed JS traits)
│   │   ├── precision/    (Emulated f64, arbitrary precision BigFloats)
│   │   └── algorithms/   (Perturbation theory, Series Approximation)
│
├── src/                  (The Frontend & Headless JS Orchestration Layer)
│   ├── ui/               (React, Zustand, and DOM Components)
│   ├── engine/           (The 100% pure TypeScript & WebGPU Render API)
│   └── util/             (Shared helpers, Base64 State serialization)
│
├── tests/                (Headless Data-matching execution)
│   ├── run-headless.ts   (Deno/Node headless test orchestrator)
│   ├── cases.json        (The master regression lockfile of test coordinates)
│   └── artifacts/        (Cached WebGPU Float32Array buffers for strict regressions)
│
└── docs/                 (The existing architecture notes and tasks)
    └── tasks/
```

## 2. Vocabulary & Naming

### A. The Engine Layer (`src/engine/`)

This is the core WebGPU API. It must be absolutely independent of React, DOM events, and `@types/react`.

- **`createFractalEngine(canvas?)`**: Encapsulates WebGPU SwapChain creation, or spins up a pure memory buffer if omitted (Headless mode).
- **`/shaders/` Subsystem:**
  - **Dual Pipelines**: By design, we separate standard shaders from scatter arrays.
  - **`/shaders/escape/`**: `escape-compute.wgsl` and `distance-render.wgsl` (Standard escape time algorithms).
  - **`/shaders/stochastic/`**: `scatter-compute.wgsl` and `density-map.wgsl` (Buddhabrot accumulation).
- **`/math-workers/` Subsystem**: Holds the `.worker.ts` wrappers that instantiate the `rust-math` WASM blob off the main thread to prevent JS blocking during Deep Zoom calculations.
- **`PassManager` (Accumulation)**: Orchestrates `AccumulationPass` and `PresentationPass` buffer pipelines natively inside the GPU for Progressive Rendering features like temporal supersampling.

### B. The UI Layer (`src/ui/`)

This is the React frontend. It mounts the engine, captures mouse events, and renders the HUD overlay.

- **`<ApeironViewport />`**: The single core React component that mounts the physical canvas, intercepts native pointer events (`onPointerMove`), and funnels telemetry away from React and into the global store.
- **State Management (`/ui/stores/`)**:
  - `useViewportStore`: Holds $x, y, z$, zoom magnification, and active coordinate limits.
  - `useRenderStore`: Holds config parameters for coloring modes, active shaders, and engine capabilities.
  - `useTimelineStore`: Holds Array of Waypoints and governs log-based camera interpolation for real-time playback.
- **HUD Components (`/ui/components/hud/`)**:
  - Standard UI panel blocks: `<ViewportCrossfader />`, `<ColorModeSelector />`, `<WaypointDeck />`, `<TimelineScrubber />`.
