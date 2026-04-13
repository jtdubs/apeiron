# Math Backend Design

## 1. Core Paradigm

The Math Backend is the mathematical ground-truth generator for Apeiron. To achieve deep-zoom capabilities ($>10^{15}$) without experiencing JavaScript Garbage Collection stutter or `f32` truncation glitches, all core logic is separated into a high-performance native library.

## 2. Component: Rust WASM Core (`math-core`)

The standard `Number` in JS is limited to 64-bit IEEE-754 floats. We compile Rust arbitrary precision math into WebAssembly for our central calculations.

**Goals:**

- Eliminate JavaScript object creation in the hot loop (e.g. `Decimal.js` instances).
- Calculate long iteration chains iteratively to create Reference Orbits for Perturbation theory.
- Provide a deterministic, purely logical ground-truth array of iteration limits to serve as the baseline for our Headless Data-Tests.

**Implementation Rules:**

- **Origin Rebasing (Floating Origin):** Receives the UI's anchor `String` and panning `f64` deltas. It drops into Rust BigFloat/GMP execution inside the Web Worker to calculate the absolute new spatial anchor, returning the new coordinate string to the UI.
- **Reference Orbit Offloading:** Returns a raw `Float64Array` mapping the Perturbation Reference Orbit, which is efficiently written to the VRAM context using an explicit `device.queue.writeBuffer()` operation to prevent deep-copy lockups or `mapAsync` overhead in the render pipeline.
- **Explicit WASM Memory Deallocation:** Because the JavaScript Garbage Collector cannot access or track memory allocated inside the WebAssembly linear memory heap, the JS orchestrator MUST explicitly execute `.free()` on the returned `wasm-bindgen` memory object immediately after pushing the array to WebGPU VRAM. Failure to explicitly free these massive orbit arrays will result in catastrophic heap leaks during continuous user panning.

## 3. Emulated Precision & Perturbation

Apeiron shifts complexity in tiers:

1. **$f32$ Level:** Standard 32-bit float rendering.
2. **$f64$ Level:** Emulated double-precision (double-single arithmetic) directly inside WebGPU shaders.
3. **Perturbation Theory:** Once bounds shrink below $f64$ precision limits, the `math-core` worker calculates a single ultra-precise coordinate orbit. The WebGPU shader then calculates the $f32$ pixel-level _difference_ from that reference orbit.

## 4. Advanced Math Future-Proofing

The math core should be architectured to eventually support **Bilinear Approximation (BLA)** and **Series Approximation (SA)**, effectively computing mathematical polynomials to skip millions of unnecessary iterations on complex deep zooms.
