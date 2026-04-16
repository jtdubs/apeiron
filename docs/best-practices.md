# Apeiron Code Organization & Testability Best Practices

Based on the architectural refinements established during the engine and shader refactoring phases (Tasks 051-054), all future development on Apeiron MUST adhere to the following best practices regarding data boundaries, state management, shader organization, and testability.

## 1. Single Source of Truth (SSOT) for Cross-Boundary Data (cf. Task 051)

**The Problem**: "Magic numbers" (e.g., offsets or strides like `8` or `136`) cause silent data alignment drift and memory corruption across language boundaries (TypeScript -> Rust (WASM) -> WebGPU (WGSL)).

**The Practice**: All shared buffer layouts, strides, and offsets MUST be defined in a centralized conceptual schema (e.g., `src/engine/MemoryLayout.ts`).

**Enforcement**:

- **TypeScript**: The layout file is the root source of truth. All TS iteration counts and view bounds must be derived dynamically from these numbers.
- **Rust (WASM)**: WebAssembly memory generation MUST dynamically integrate these constants at build time (or rely on a shared extraction process), avoiding hardcoded sizes.
- **WebGPU (WGSL)**: Shaders must strictly avoid manual inner-stride numeric offsets (e.g., `arr[base_index + 4u]`). Instead, the TS engine must dynamically prepend these layout constants to the WGSL script upon string instantiation (e.g., `const ORBIT_STRIDE: u32 = 8u;`). Extract complex layouts into strongly-typed WGSL struct getters (e.g., `fn get_orbit_node(base_index)`) guaranteeing safety in the arithmetic loops.

## 2. Decoupling Intent from Execution via State Machines (cf. Task 052)

**The Problem**: Allowing UI side-effects, implicit boolean flags, or primitive `requestAnimationFrame` closures to define how math executes creates an untestable, tangled loop that causes visual desyncs.

**The Practice**: The temporal execution cycle MUST be isolated within a formalized, deterministic Finite State Machine (FSM).

**Enforcement**:

- **Math vs. Command Separation**: Structures traversing boundaries must be split. The system accepts a declarative `MathContext` (the mathematical parameters) and explicitly outputs an imperative `ExecutionCommand` (actionable steps for the GPU pipeline).
- **Stateless UI Loops**: The UI solely bridges immutable snapshots of the viewport state into the FSM, and relays the resulting `ExecutionCommand` to WebGPU.
- **Deterministic Testing**: Because the FSM (e.g., `ProgressiveRenderScheduler`) is purely deterministic TypeScript lacking side effects, it MUST be comprehensively covered by headless state-transition unit tests.

## 3. Shader Modularization and Algebraic Extraction (cf. Task 053)

**The Problem**: Monolithic `@compute` entry points bury critical mathematical invariants under complex control flow, making the shaders unreadable and deeply nested arithmetic error-prone.

**The Practice**: WGSL shader code must be aggressively functionally modularized, mirroring clean CPU-side programming models.

**Enforcement**:

- **Abstract the Primitives**: Raw complex arithmetic must be universally abstracted into a library of helpers (e.g., `complex_pow`, `complex_sq`, `complex_mul`). Structural equations must read cleanly algorithmically, rather than unrolling algebraically in the hot path.
- **Extract Divergent Logic**: Complex branch fallbacks (e.g., Bilinear Approximation progression) or phase initialization checks must be pulled out of main iteration loops into autonomous functions with clear, testable bounds.

## 4. Compute Shader Unit Testing via Alternate Entry Points (cf. Task 054)

**The Problem**: Attempting to verify math optimizations or edge case regressions through visual pixel-diffing of entirely rendered fractal images is flaky, opaque, and slow.

**The Practice**: Internal math functions and isolated WGSL algorithmic paths MUST be unit-tested directly, independently of the visual graphics pipeline.

**Enforcement**:

- **Alternate Entry Points**: Implement specific `@compute` entry points purely for testing purposes within the shader (e.g., `@compute fn unit_test_xyz(...)`).
- **Data-Driven Assertions**: The testing mechanism must use headless hooks to bind dedicated `test_in` and `test_out` ArrayBuffers exclusively for these entry points.
- **CI Enforcement**: The Deno/headless `npm run test:engine` suite must dispatch known vectors to these compute functions and execute strict TypeScript assertions on the returning data, guaranteeing math stability before pixels are ever painted.
