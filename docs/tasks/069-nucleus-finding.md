# Task 069: Newton-Raphson Nucleus Finding

**Status:** Researching
**Topic:** Optimizing reference orbit selection via root-finding.

## Objective
Implement an automated "Reference Optimizer" that snaps the reference coordinate to the nearest minibrot nucleus.

## Research Goals
- [ ] Implement the Newton-Raphson iteration for $f^n(c) = 0$.
- [ ] Determine the optimal period $n$ for the current viewport to guide the solver.
- [ ] Analyze the impact on BLA skip efficiency when using optimized vs. unoptimized references.

## References
- Claude Heiland-Allen: "Mandelbook" section on Nuclei finding.
- FractalForums: "Automatic Period Detection and Nucleus Finding".
