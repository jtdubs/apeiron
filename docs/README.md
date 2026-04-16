# Apeiron Master Index

Welcome to the Apeiron documentation! This index serves as the entry point for all architectural, design, and operational knowledge driving the project.

## Core Architecture & Engine

- [System Architecture](system-architecture.md): The overarching system design, emphasizing the strict decoupling of the UI from our math and rendering engines.
- [Code Layout & Nomenclature](code-layout.md): Physical directory structure and standardized component terminology boundaries.
- [Math Backend Design](math-backend-design.md): The native Rust/WASM arbitrary-precision calculation motor and ground-truth data generator.
- [Rendering Engine Design](rendering-engine-design.md): The headless-capable WebGPU compute and rasterization pipelines (including Distance Estimation and Histogram mapping).
- [Animation Design](animation-design.md): The interpolation framework governing cinematic playback and mathematical scale-bridging.
- [State Machine Architecture](state-machine-architecture.md): The decoupling of the Temporal Pipeline Execution flow from the declarative mathematical intents and UI snapshots.
- [Progressive Rendering Design](progressive-rendering-design.md): The performance framework governing multi-frame accumulation (supersampling) and interactive resolution scaling.

## Product & Requirements

- [User Journeys](user-journeys.md): Core user personas framing our feature developments, from deep-zoom enthusiasts to algorithmic researchers.
- [Requirements](requirements.md): The structural boundaries, strict execution constraints, and architectural tenets Apeiron operates within.

## Frontend & Interfaces

- [Frontend Design](frontend-design.md): The React/Vite domain logic, enforcing "Zero-DOM-in-Hot-Path" via Zustand state management.
- [UI Design](ui-design.md): Our aesthetic mandate (glassmorphism/dark mode) and standard interface interaction strategies.

## Workflow & Development

- [Development Guide](development.md): Rules for local orchestration, NPM usage as the single source of truth, and system tooling.
- [Best Practices](best-practices.md): Core coding standards regarding cross-boundary data, FSM execution, shader modularization, and headless WGSL unit testing.
- [Task Management](tasks/template.md): The protocol for tracking, executing, and resolving architectural implementations.
- [Roadmap](roadmap.md): Our strategic, phased sequencing plan.
- [Test Plan & Diagnostics](test-plan.md): The execution model outlining headless "Fuzzy" Correctness data-testing against Rust buffers vs strict "Bit-Perfect" WebGPU regressions.
