---
status: closed
---

# Task 090: Comparative Analysis of External Fractal Math Engines

## Objective

Systematically locate, analyze, and understand the implementation of acceleration algorithms (SA, BLA, BTA, Rebasing, Glitch Detection) within prominent external open-source engines, comparing their architectural choices against Apeiron's current baseline.

## Relevant Design Docs

- [Apeiron Reference Docs](../docs/reference/bilinear_approximation_whitepaper.md)
- [Apeiron Best Practices](../docs/best-practices.md)
- [External References Readme](./README.md)
- [Apeiron State Summary](./apeiron_state_summary.md)

## Requirements

- **Context Preservation:** The analysis must be chunked into specific, domain-scoped phases so as not to overwhelm LLM context windows or human working memory.
- **Goal-Oriented Browsing:** Do not review rendering/UI layers of external tools; limit analysis strictly to the mathematical kernels, compute shading, and precision boundary bridging.
- **Traceable Documentation:** Findings must be progressively documented and linked back to Apeiron's own architecture, mapping direct comparisons (e.g., "Apeiron does X in `f32p`, while Fraktaler 3 handles it natively in C++ via approach Y").

## Implementation Plan

To tackle the massive codebase size in `external/` without context exhaustion, we will execute the analysis in the following chunked sequence:

### Phase 1: Establish The Apeiron Baseline
1. Audit and summarize Apeiron's current primary math structures (e.g., our BLA grid shape, Double-Single (DS) `f32p` buffers, glitch detection heuristics, and rebasing mechanisms).
2. Create an isolated artifact ([`apeiron_state_summary.md`](./apeiron_state_summary.md)) to serve as the baseline against which external projects will be judged.

### Phase 2: Analyze Core Data Structures (The "Blueprint" Phase)
Focus purely on how memory, caching, and grids are structured in the external repos before looking at execution math.
1. `fraktaler-3` & `Fractalshades`: Search for their BLA/BTA tree data structures and reference orbit memory allocations. How do they store coefficients across levels?
2. `mightymandel`: Review the GPU buffer layouts and precision splitting struct definitions.
3. **Output:** A comparative mapping of data structures.

### Phase 3: Deep Dive - Branch Prediction & Math Shaders
Focus strictly on the execution path (Shaders & JIT kernels).
1. Isolate the core Mandelbrot iteration loop or compute shaders in `mightymandel` and `deep-fractal` (WebGL).
2. Compare their Double-Single or emulated `f64` math implementations directly against Apeiron's `core_compute.wgsl`. Are they skipping iterations differently? How do they structure their thread groups?
3. **Output:** Potential optimizations to our shader logic.

### Phase 4: Deep Dive - Glitch Ejection & Rebasing
Focus purely on failure modes and resilience.
1. Look into `fraktaler-2` (Kalles Fraktaler 2+) and `fraktaler-3` to find the exact logical conditionals that trigger a "Proxy Collapse" or "Glitch". 
2. Analyze how those tools orchestrate a "Reference Rebase" when the approximation breaks down. 
3. Compare their thresholds and bailout logic to Apeiron's implementations.
4. **Output:** Refinement plan for Apeiron's glitch detection.

### Phase 5: Synthesis Document
1. Aggregate the findings across these chunks into a final `mathematical_improvements.md` whitepaper.
2. Outline specific, actionable tasks to port valuable techniques over to the Apeiron engine.

## Verification Steps

- [x] Complete Phase 1: Baseline documentation artifact created.
- [x] Complete Phase 2: External data structures mapped.
- [x] Complete Phase 3: Math and shader loops analyzed.
- [x] Complete Phase 4: Glitch and rebasing logic extracted.
- [x] Complete Phase 5: Synthesis document created with actionable engineering tasks.
