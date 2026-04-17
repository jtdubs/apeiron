# Apeiron Master Index

Welcome to the Apeiron documentation! This index serves as the entry point for all architectural, design, and operational knowledge driving the project.

## Core Architecture & Engine

- [System Architecture](architecture/system.md): The overarching system design, emphasizing the strict decoupling of the UI from our math and rendering engines.
- [Code Layout & Nomenclature](process/code-layout.md): Physical directory structure and standardized component terminology boundaries.
- [Math Backend Design](design/engine/core-math.md): The native Rust/WASM arbitrary-precision calculation motor and ground-truth data generator.
- [Rendering Engine Design](design/engine/webgpu-passes.md): The headless-capable WebGPU compute and rasterization pipelines (including Distance Estimation and Histogram mapping).
- [Animation Design](backlog/animation.md): The interpolation framework governing cinematic playback and mathematical scale-bridging.
- [State Machine Architecture](design/engine/temporal-pipeline.md): The decoupling of the Temporal Pipeline Execution flow from the declarative mathematical intents and UI snapshots.
- [Progressive Rendering Design](design/engine/temporal-pipeline.md): The performance framework governing multi-frame accumulation (supersampling) and interactive resolution scaling.

## Product & Requirements

- [User Journeys](product/user-journeys.md): Core user personas framing our feature developments, from deep-zoom enthusiasts to algorithmic researchers.
- [Requirements](product/requirements.md): The structural boundaries, strict execution constraints, and architectural tenets Apeiron operates within.

## Frontend & Interfaces

- [Frontend Design](design/interface/react-architecture.md): The React/Vite domain logic, enforcing "Zero-DOM-in-Hot-Path" via Zustand state management.
- [UI Design](design/interface/user-experience.md): Our aesthetic mandate (glassmorphism/dark mode) and standard interface interaction strategies.

## Workflow & Development

- [Development Guide](process/development.md): Rules for local orchestration, NPM usage as the single source of truth, and system tooling.
- [Best Practices](process/best-practices.md): Core coding standards regarding cross-boundary data, FSM execution, shader modularization, and headless WGSL unit testing.
- [Task Management](tasks/template.md): The protocol for tracking, executing, and resolving architectural implementations.
- [Roadmap](roadmap.md): Our strategic, phased sequencing plan.
- [Test Plan & Diagnostics](process/test-plan.md): The execution model outlining headless "Fuzzy" Correctness data-testing against Rust buffers vs strict "Bit-Perfect" WebGPU regressions.
