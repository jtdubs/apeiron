# Task 067: Advanced Rebasing Strategies

**Status:** Researching
**Topic:** Integrating Zhuoran's Automatic Rebasing with Chained Reference Trees.

## Objective

Design a robust system for detecting linear approximation failure and transitioning between nested reference orbits.

## Research Goals

- [ ] **Detection:** Formalize "Zhuoran's Test" ($|Z_{n+L} + \Delta z_{n+L}| < |\Delta z_{n+L}|$) for early-out glitch detection.
- [ ] **Orchestration:** Design a "Reference Chain" data structure to manage nested minibrot references.
- [ ] **Ejection Logic:** Define how pixels are "handed off" from a failing parent reference to a more accurate child reference.

## References

- Zhuoran (2021). "Bivariate Linear Approximation".
- NanoMB2 (knighty) implementation of Chained Rebasing.
