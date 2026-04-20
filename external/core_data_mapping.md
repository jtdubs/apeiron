# External Math Archetypes & Core Data Structures (Phase 2)

This document contains findings from inspecting the baseline data structures, memory layouts, and grids of external open-source engines (`fraktaler-3`, `mighty-mandel`, and `Fractalshades`) as they compare to Apeiron's architecture documented in Phase 1. 

## 1. Fraktaler-3 (CPU-Bounds Structure)

`fraktaler-3` fundamentally depends on the C++ compiler's standard library and templates, making it an archetype for **CPU-bound Arbitrary Precision computations**.

- **BLA Tables:** Defined as `blasR2<real>`. It leverages `std::vector<std::vector<blaR2<real>>> b` to house the matrices, effectively using an array of lists of structs. 
- **The Struct (`bla.h`):** The BLA coefficients are represented cleanly:
  ```cpp
  template <typename real> struct blaR2 {
    mat2<real> A, B;
    real r2;
    count_t l;
  };
  ```
- **Comparison to Apeiron:** Unlike Apeiron, which inherently operates under WebGPU constraints and must therefore flatten `vec2<u32>` into sequential contiguous block buffers, `fraktaler-3` relies directly on the CPU's ability to navigate nested memory arrays dynamically.

## 2. Fractalshades (Python/Numba JIT Structure)

`Fractalshades` relies entirely on a high-level scripting logic layer backed by a JIT-compiled numeric payload solver.

- **BLA Tables:** Evaluated inside `perturbation.py` by `numba_make_BLA()`. 
- **The Grids:** Fractalshades completely unrolls struct objects into disjoint primitive NumPy arrays to maximize JIT compilation speed via `numba`:
  - `M_bla`: Primitive complex array housing $A$ and $B$ coefficients.
  - `r_bla`: Primitive array of validity radii.
  - `stages_bla`: Array of integer keys for skipping.
- **Comparison to Apeiron:** Apeiron achieves structure-of-arrays memory via SSBOs that can be accessed uniformly, whereas Fractalshades handles the breakdown logically inside Python before emitting flat math into bytecode.

## 3. mighty-mandel (GPU Layout Structure)

Like Apeiron, `mightymandel` delegates calculations to the GPU via shaders, but organizes its iteration bounds differently.

- **Execution Context:** Utilizes Shader Storage Buffer Objects (SSBOs) accessed via `layout(std430)`. 
- **The Iteration State (`fp32_step_compute.glsl`):** 
  ```glsl
  layout(std430, binding = 3) buffer b_state {
          restrict uvec4 state[];
  };
  ```
- **Data Packing:** Track records (`zx, zy`) are serialized dynamically into the `uvec4` tuple at runtime via `floatBitsToUint()`. 
- **Comparison to Apeiron:** Instead of keeping dedicated arrays for different structs (e.g., Apeiron's `ref_orbits: array<vec2<u32>, checkpoint: array<CheckpointState>`), Mightymandel effectively packs coordinate bounds, limits, and pixel indexes into tightly constrained uniform vectors. However, the limitation of this setup is less inherent flexibility for variable-sized data matrices like extended Double-Single configurations compared to Apeiron’s decoupled memory blocks.
