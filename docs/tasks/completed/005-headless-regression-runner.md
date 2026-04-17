---
status: closed
---

# Task 005: Create Automated Headless Regression Runner

## Objective

Build the Node/Deno orchestration script capable of seamlessly executing the complete integration test between the WASM ground-truth module and the headless WebGPU engine.

## Relevant Design Docs

- [Test Plan & Debugging Methodology](../../process/test-plan.md)
- [Development Guide](../../process/development.md)

## Requirements

- **Unified Test Script:** Create a simple test runner operable entirely from the CI or command line (e.g. `npm run test:engine`).
- **Data-First Matching:** The script must extract the arbitrary precision test array from the WASM math core (Task 003), feed identical inputs to the Headless WebGPU Engine (Task 002), and extract the corresponding `Float32Array`.
- **Fuzzy Tolerance Matching:** Implement an assertion parser capable of evaluating array values strictly within an established floating-point arithmetic tolerance.
- **Hardware Agnosticism:** Script explicitly gracefully skips or fails loudly if the underlying headless environment completely lacks WebGPU acceleration resources (like `dawn.node`).

## Implementation Plan

1. Provision the local `tests/` directory with a test initialization script (using Node/Deno).
2. Wire logic to invoke the WASM component to generate the ground truth.
3. Wire logic to start the headless WebGPU engine and render to a StorageBuffer.
4. Execute array mathematical comparisons via loops or standard assertion libraries asserting equality across tolerances.
5. Surface pass/fail metadata dynamically to the CLI.

## Verification Steps

- [ ] Command `npm run test:engine` executes strictly headlessly.
- [ ] The test demonstrates passing equivalence for basic arithmetic validation mapping.
- [ ] The runner outputs definitive failure if mathematical tolerance diverges intentionally.
- [ ] **Documentation Sync:** Did this implementation drift from the original plan? If so, update `docs/process/test-plan.md` before closing this task.
