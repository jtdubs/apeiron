# Apeiron Master Index

Welcome to the Apeiron documentation! This index serves as the entry point for all architectural, design, and operational knowledge driving the project.

## Core Architecture & Engine

- [System Architecture](architecture/system.md): The overarching system design, emphasizing the strict decoupling of the UI from our math and rendering engines.
- [Data Boundaries & Memory Layout](architecture/data-boundaries.md): The schemas and serialization rules managing the zero-copy bridges between Rust, TS, and WebGPU.
- [Headless Execution](architecture/headless-execution.md): The DOM-isolation rules and WebGPU dependency injection patterns enabling Deno testing.
- [Code Layout & Nomenclature](process/code-layout.md): Physical directory structure and standardized component terminology boundaries.
- [Core Math & Algorithms](design/engine/core-math.md): The native Rust/WASM arbitrary-precision calculation motor and ground-truth data generator.
- [Execution Orchestration](design/engine/orchestration.md): The JS layer bridging WebWorkers and scheduling fractal evaluations.
- [Temporal Pipeline & FSM](design/engine/temporal-pipeline.md): The performance framework governing multi-frame accumulation (supersampling) and interactive resolution scaling.
- [WebGPU Passes](design/engine/webgpu-passes.md): The headless-capable WebGPU compute and rasterization pipelines.
- [Telemetry Architecture](design/telemetry/architecture.md): The zero-overhead metric accumulation and dashboarding system.
- [Animation Design](backlog/animation.md): (Backlogged) The interpolation framework governing cinematic playback.

## Product & Requirements

- [User Journeys](product/user-journeys.md): Core user personas framing our feature developments, from deep-zoom enthusiasts to algorithmic researchers.
- [Requirements](product/requirements.md): The structural boundaries, strict execution constraints, and architectural tenets Apeiron operates within.

## Frontend & Interfaces

- [React Architecture](design/interface/react-architecture.md): The React/Vite domain logic, enforcing "Zero-DOM-in-Hot-Path" via Zustand state management.
- [User Experience & Visuals](design/interface/user-experience.md): Our aesthetic mandate (glassmorphism/dark mode) and standard interface interaction strategies.

## Workflow & Development

- [Architecture Decision Records (ADRs)](adr/0001-record-architecture-decisions.md): The mutable historic record of major technological pivots.
- [Development Guide](process/development.md): Rules for local orchestration, NPM usage as the single source of truth, and system tooling.
- [Best Practices](process/best-practices.md): Core coding standards regarding cross-boundary data, FSM execution, shader modularization, and headless WGSL unit testing.
- [Task Management](tasks/template.md): The protocol for tracking, executing, and resolving architectural implementations.
- [Roadmap](roadmap.md): Our strategic, phased sequencing plan.
- [Test Plan & Diagnostics](process/test-plan.md): The execution model outlining headless "Fuzzy" Correctness data-testing against Rust buffers vs strict "Bit-Perfect" WebGPU regressions.
