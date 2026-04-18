# Whitepaper: Rebasing Strategies & Chained Reference Orbits

## 1. Abstract

Rebasing is a mathematical technique used in fractal perturbation rendering to circumvent the "zero-crossing" problem, where pixel orbits approach a critical point and cause numerical instability. This whitepaper details the proactive mechanisms for resetting the iteration count and transferring delta values through **Reference Chains**. We explore "Relative Error Sensing" triggers, the mechanics of **Reference Tree** traversal, and the "FloatExp" format for extreme zoom depths.

## 2. Historical Context

The necessity for rebasing was identified as explorers reached the limits of standard perturbation theory. While K.I. Martin's original perturbation solved the precision issue for much of the set, deep zooms into certain regions (especially those approaching critical points) resulted in persistent glitches. Developers like **Zhuoran** and **Claude Heiland-Allen** formalized "proactive rebasing" and "chained references" as a way to maintain a hierarchy of high-precision anchors, effectively allowing for "infinite" zoom.

## 3. The Problem: The Zero-Crossing Glitch & Reference Exhaustion

In perturbation, the delta orbit $\delta_n$ is calculated relative to a reference $Z_n$.

1. **Zero-Crossing:** If the pixel orbit $z_n = Z_n + \delta_n$ approaches a critical point (e.g., $0+0i$), the relative error $|\delta_n| / |Z_n|$ explodes.
2. **Reference Exhaustion:** Even with a perfect starting point (Nucleus), a single reference has a finite "radius of validity." Once a zoom dives deeper than the local structure's scale, the original reference becomes too "distant" in parameter space.

## 4. Mathematical Mechanics

### The Rebasing Trigger (Zhuoran's Tip)

A rebase event is triggered when the pixel orbit's distance to the origin is smaller than its distance to the current reference orbit:
$$\text{Condition: } |Z_m + \delta_n| < |\delta_n|$$

### Chained Reference Transformation

When switching from **Reference A** (at iteration $n$) to **Reference B** (at iteration $m$), the delta $\delta$ and parameter offset $\Delta c$ must be transformed:

- **Delta Shift:** $\delta_B = \delta_A + (Z_{A,n} - Z_{B,m})$
- **Coordinate Shift:** $\Delta c_B = c - C_B = \Delta c_A + (C_A - C_B)$

### The Reference Tree

In extreme deep zooms ($10^{-1000}+$ or $10^{-1,000,000}+$ with FloatExp), the engine maintains a tree of high-precision references. Each rebase traverses this tree to find the node that minimizes the magnitude of the resulting delta.

## 5. Algorithmic Implementation

### The Chained Iteration State Machine

The core loop must prioritize BLA (Bivariate Linear Approximation) skips while monitoring for rebase events across the chain:

1.  **Check BLA:** If $|\delta| < r$, apply the precomputed BLA skip for the _current_ reference node.
2.  **Regular Step:** If BLA is invalid, perform a standard perturbation step.
3.  **Monitor Rebase:** During each regular step, evaluate the rebase condition.
4.  **Reference Shift:** If a rebase occurs, identify the target reference in the tree, perform the **Chained Transformation**, and reset the iteration count to the target's entry point.

### FloatExp (Floating Point Exponent)

For zooms beyond $10^{-300}$, FloatExp decomposes the number into a normalized mantissa and a separate integer exponent ($z = M \times 10^E$), allowing for arbitrary range.

## 6. Domain Validity & Limitations

- **Catastrophic Cancellation:** Precision can be lost during the chained transfer $\delta_A + (Z_{A,n} - Z_{B,m})$ if the terms are nearly equal and opposite.
- **Reference Management:** Maintaining a tree of orbits requires significant memory and high-precision precomputation.

## 7. Failure Modes & Diagnostics

- **Cycle Loops:** Improper tree traversal can cause a pixel to loop between references.
- **Precision Floor:** When $(C_A - C_B)$ is smaller than the delta's mantissa epsilon, the coordinate shift becomes lossy.

## 8. Application to Apeiron

Apeiron implements **Reference Chains** via:

1.  **Rust Reference Tree:** A hierarchical manager for high-precision orbits.
2.  **Chained Transformation Kernels:** GPU routines that handle the shift between reference nodes in the chain.
3.  **Dynamic BLA Switching:** Swaps BLA lookup tables in real-time based on the current chain position.

## 9. References

1. **Zhuoran**, _Another solution to perturbation glitches_, FractalForums, 2021.
2. **Claude Heiland-Allen**, _Deep Zoom (2024)_, mathr.co.uk.
3. **Claude Heiland-Allen**, _Deep zoom theory and practice (again)_, mathr.co.uk, 2022.
4. **Wikibooks**, _Fractals/Computer graphic techniques/2D/Mandelbrot set/Perturbation theory_.
