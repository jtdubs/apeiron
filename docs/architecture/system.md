# Apeiron High-Level Architecture

Apeiron is a high-performance Web-based fractal explorer. It is architected for mathematical determinism and headless testability, separating complex algorithms from UI rendering.

## 1. Core Principles

- **Strict Decoupling:** Math execution and UI orchestration happen in different systems.
- **Data-Driven Realism:** All visual rendering is derived from physically extracted iteration buffer data, guaranteeing verifiable bounds before pixel color mapping.

## 2. Top-Level Components

For detailed technical implementations of our isolated components, please review their respective design documents:

1. **[Math Backend Design](../design/math-backend.md):** The compiled `<rust-math>` native core. Handles $f64$ emulation, Perturbation reference orbits, and serves as our headless "ground-truth" data generator.
2. **[Rendering Engine Design](../design/rendering-engine.md):** The WebGPU-accelerated Dual Pipeline Engine (`src/engine/`). Handles headless deterministic arrays, Escape-Time shading, and Buddhabrot stochastic scattering.
3. **[Frontend Design](../design/frontend.md):** The React `<ApeironViewport />` and Zustand orchestration layer (`src/ui/`). Handles Keyframe HUDs, WebWorker communication, UI state mapping, and absolutely **zero** hot-path math logic.
4. **[Animation Design](../design/animation.md):** The `useTimelineStore` interpolation engine. Handles logarithmic zoom tweening, precision math handoffs, and UI playback sequences.
5. **[Progressive Rendering Design](../design/progressive-rendering.md):** The Render Quality State Machine. Defines the boundary rules for Temporal Accumulation, rendering frame budgets, and Dynamic Resolution Scaling.
