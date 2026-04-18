# Task 069: Newton-Raphson Nucleus Finding

**Status:** Completed (Research Phase)
**Topic:** Optimizing reference orbit selection via root-finding.

## Objective

Implement an automated "Reference Optimizer" that snaps the reference coordinate to the nearest minibrot nucleus.

## Research Findings

- **Whitepaper:** [docs/reference/reference_orbit_whitepaper.md](docs/reference/reference_orbit_whitepaper.md)
- **Math Core:** [docs/tasks/math_core_references.md](docs/tasks/math_core_references.md)
- **Implementation Strategy:** [docs/tasks/engineering_translation.md](docs/tasks/engineering_translation.md)

## Goals Reached

- [x] Implement the Newton-Raphson iteration for $f^n(c) = 0$.
- [x] Determine the optimal period $n$ for the current viewport to guide the solver (Atom Domain Search).
- [x] Analyze the impact on BLA skip efficiency when using optimized vs. unoptimized references. (Covered in whitepaper: Optimized references extend orbit longevity and minimize glitches).

## References

- Claude Heiland-Allen: "Mandelbook" section on Nuclei finding.
- FractalForums: "Automatic Period Detection and Nucleus Finding".
