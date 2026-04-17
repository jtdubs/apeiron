---
status: closed
---

# Task 057: Telemetry Registry & Headless Primitives

## Objective

Build the foundational, zero-overhead Data Layer for the telemetry system, implementing the `TelemetryRegistry` and high-performance `RingBuffer` structures to securely store analog and digital timeseries data off the hot path.

## Relevant Design Docs

- [Telemetry Design](../../design/telemetry/architecture.md)
- [Apeiron Best Practices](../../process/best-practices.md)

## Requirements

- **RingBuffer Structure:** Implement a fast, pre-allocated fixed-size array structure (`RingBuffer`) that avoids GC allocations while ingesting 60Hz numeric data.
- **Signal Types:** The repository definitions must clearly differentiate between `analog` (continuous values) and `digital` (discrete enums/booleans) signal types.
- **Registry API:** Provide a `TelemetryRegistry` singleton/service that exposes a `push(id, value)` interface for publishers and a reader interface for UI components.
- **Headless Viability:** The entire telemetry core must be entirely headless, executable in a Node/Deno environment without any DOM dependencies.

## Implementation Plan

1. Create `src/engine/debug/RingBuffer.ts` utilizing `Float32Array` or `Int32Array` for zero-allocation circular buffer handling.
2. Create `src/engine/debug/TelemetryRegistry.ts` that defines `MetricDefinition` and instantiates RingBuffers.
3. Add Exponential Moving Average (EMA) smoothing helpers to the Registry for returning human-readable text properties alongside raw timeseries data.
4. Establish a full headless test suite in `src/engine/__tests__/` to verify ring buffer rolling correctness and FSM data tracking logic.

## Verification Steps

- [ ] Write Node/Deno tests proving RingBuffer handles rollover without losing the array reference or causing memory leaks.
- [ ] Write unit tests validating that EMA math averages correctly over consecutive `push` calls.
- [ ] **Implementation standard:** Have all shared boundaries, extracted math helpers, or state-machine behaviors been strictly validated as headless deterministic units per `docs/process/best-practices.md`?
- [ ] **Documentation Sync:** Did this implementation drift from the original plan? If so, update `docs/design/telemetry/architecture.md` before closing this task.
