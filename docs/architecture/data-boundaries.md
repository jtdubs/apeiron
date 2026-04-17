# Data Boundaries & Memory Layout

Apeiron is a structurally hybrid application heavily relying on zero-copy data strategies and strict struct-matching to facilitate high-speed interop between:

1. **Rust (WASM)**: Arbitrary-precision math workers.
2. **TypeScript / JavaScript**: The main UI formatting and orchestrating engine.
3. **WebGPU (WGSL)**: The headless hardware rendering and parallel processing engine.

Because we operate in these three realms, hardcoded byte offsets and magic numbers are fundamentally disallowed.

## Single Source of Truth (SSOT)

To prevent misaligned byte-reads or WebGPU validation crashes, all cross-boundary structures must be derived from a Single Source of Truth.

The `src/engine/generated/MemoryLayout.ts` file acts as the ultimate schema.

- **Rust**: Uses `wasm-bindgen` and strictly defined structures decorated with `#[repr(C)]`.
- **TypeScript**: Consumes auto-generated offset mappings and `Float32Array`/`Uint32Array` overlays to build ArrayBuffers matching the Rust C-schemas.
- **WebGPU**: The compute shader bindings map exactly to the TS ArrayBuffer structures using `std140` or `std430` layout rules.

## Rule 1: No Arbitrary Alignment

All structs intended for crossing the bridge must explicitly account for WGSL padding rules. If a `vec3<f32>` is sent to the GPU, TypeScript must pad it with a trailing `f32` (16-byte alignment), and Rust must serialize it accordingly. Do not rely on implicit TS packing.

## Rule 2: Float64 Emulation Safety

When precision dips beyond `10^5`, we fall back to emulated `f64` in WebGPU (`vec2<f32>`). The memory layout mapping must explicitly identify these data types so that TypeScript constructs the hi/lo byte blocks correctly before flushing to the GPU `StorageBuffer`.

## Rule 3: Zero DOM in Hot Paths

Data arrays constructed for the hot orchestration loops (like passing Orbit data between Rust and WGSL) must never touch React state. It must stay in raw typed Arrays (`Float64Array`, etc.) and be injected synchronously to WebWorker channels or WebGPU ring buffers.
