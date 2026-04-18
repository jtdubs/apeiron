# Whitepaper: Bivariate Taylor Approximation (BTA) for Fractal Perturbation

**Abstract:** Bivariate Taylor Approximation (BTA) is a high-performance acceleration technique for fractal perturbation algorithms. By modeling the evolution of pixel orbits as a higher-order bivariate polynomial, BTA allows for "skipping" millions of iterations in constant time. This whitepaper details the mathematical derivation of 1st, 2nd, and 3rd-order coefficients, recursive doubling rules for exponential skipping, and optimal implementation strategies for WebGPU.

## 1. Historical Context
The development of BTA represents the third generation of Mandelbrot acceleration:
1.  **Series Approximation (SA):** (c. 2013, K.I. Martin) Introduced univariate Taylor series in $\Delta c$ to skip early iterations.
2.  **Bivariate Linear Approximation (BLA):** (c. 2021, Zhuoran/Heiland-Allen) Introduced bivariate linear models ($A \Delta z + B \Delta c$) to allow skipping after "rebasing" events.
3.  **Bivariate Taylor Approximation (BTA):** The current state-of-the-art, extending BLA with quadratic and cubic terms to significantly increase the "skip radius" and maintain accuracy at extreme zoom depths ($>10^{1000}$).

## 2. The Problem
In deep-zoom perturbation, we calculate a pixel's orbit $z$ relative to a reference orbit $Z$: $\Delta z = z - Z$. 
Standard univariate Series Approximation assumes $\Delta z_0 = 0$. However, modern engines use **Rebasing**, where we switch reference orbits mid-calculation. This results in a non-zero $\Delta z_{start}$. 

Linear BLA handles non-zero $\Delta z_{start}$ but diverges quickly as the quadratic term $\Delta z^2$ in the Mandelbrot formula ($z_{n+1} = z_n^2 + c$) accumulates. BTA solves this by explicitly tracking these non-linear terms.

## 3. Mathematical Mechanics

### 3.1 The Bivariate Expansion
The perturbation $\Delta z_n$ (the difference between a pixel's orbit and the reference orbit $Z_n$) is represented as a bivariate polynomial in $\Delta z_0$ (initial state perturbation) and $\Delta c$ (parameter perturbation).

$$\Delta z_n \approx \sum_{j+k \le \text{Order}} \text{Coeff}_{j,k,n} \cdot \Delta z_0^j \Delta c^k$$

For a 3rd-order expansion:
$$\Delta z_n \approx A_n \Delta z_0 + B_n \Delta c + C_n \Delta z_0^2 + D_n \Delta z_0 \Delta c + E_n \Delta c^2 + F_n \Delta z_0^3 + G_n \Delta z_0^2 \Delta c + H_n \Delta z_0 \Delta c^2 + I_n \Delta c^3$$

### 3.2 Per-Iteration Recurrence ($n \to n+1$)
The coefficients are updated per-iteration of the reference orbit $Z_n$.

#### 1st Order (Linear)
- $A_{n+1} = 2 Z_n A_n$
- $B_{n+1} = 2 Z_n B_n + 1$
- *Initial ($n=0$):* $A_0 = 1, B_0 = 0$

#### 2nd Order (Quadratic)
- $C_{n+1} = 2 Z_n C_n + A_n^2$
- $D_{n+1} = 2 Z_n D_n + 2 A_n B_n$
- $E_{n+1} = 2 Z_n E_n + B_n^2$
- *Initial ($n=0$):* $C_0 = 0, D_0 = 0, E_0 = 0$

#### 3rd Order (Cubic)
- $F_{n+1} = 2 Z_n F_n + 2 A_n C_n$
- $G_{n+1} = 2 Z_n G_n + 2 A_n D_n + 2 B_n C_n$
- $H_{n+1} = 2 Z_n H_n + 2 A_n E_n + 2 B_n D_n$
- $I_{n+1} = 2 Z_n I_n + 2 B_n E_n$
- *Initial ($n=0$):* $F_0 = 0, G_0 = 0, H_0 = 0, I_0 = 0$

### 3.3 Composition (Doubling) Rules
To skip $2^k$ iterations, we compose two segments of $n$ iterations. Let Segment 1 have coefficients subscripted with `1` and Segment 2 with `2`.
The combined coefficients (Subscript `c`) are derived from:
$$\Delta z_{2n} = \text{Poly}_2(\text{Poly}_1(\Delta z_0, \Delta c), \Delta c)$$

#### Combined 1st Order
- $A_c = A_2 A_1$
- $B_c = A_2 B_1 + B_2$

#### Combined 2nd Order
- $C_c = A_2 C_1 + C_2 A_1^2$
- $D_c = A_2 D_1 + 2 C_2 A_1 B_1 + D_2 A_1$
- $E_c = A_2 E_1 + C_2 B_1^2 + D_2 B_1 + E_2$

#### Combined 3rd Order (Partial)
- $F_c = A_2 F_1 + 2 C_2 A_1 C_1 + F_2 A_1^3$
- $G_c = A_2 G_1 + 2 C_2 (A_1 D_1 + B_1 C_1) + D_2 C_1 + G_2 A_1^2 + 3 F_2 A_1^2 B_1$ (Approximate)
- *Note: Full derivation of 3rd order composition is $O(N^3)$ and often truncated in practical implementations.*

### 3.4 Error Estimation & Thresholds
The approximation is valid as long as the higher-order terms remain significantly smaller than the lower-order terms.
Specifically for 2nd order:
$$\frac{| C_n \Delta z_0^2 + D_n \Delta z_0 \Delta c + E_n \Delta c^2 |}{| A_n \Delta z_0 + B_n \Delta c |} < \text{Threshold}$$
Where the Threshold is typically $10^{-7}$ for f32 or $10^{-14}$ for f64.

## 4. Algorithmic Implementation (WebGPU)

### 4.1 Register Pressure & Occupancy Analysis
The choice of approximation order is a trade-off between "skip distance" and GPU occupancy. For WebGPU, maintaining low register pressure is critical for performance across diverse hardware.

| Order | Complex Coeffs | Float Count | Register Impact | Evaluation Cost |
| :--- | :--- | :--- | :--- | :--- |
| **BLA (1st)** | 2 | 4 | Very Low (~8) | 2 C-Muls |
| **BTA (2nd)** | 5 | 10 | Low (~20) | 8 C-Muls |
| **BTA (3rd)** | 9 | 18 | Medium (~36) | 18 C-Muls |

**The "Sweet Spot":** **2nd-order BTA** is the optimal choice for Apeiron. It provides quadratic convergence (allowing significantly larger jumps than BLA) while keeping register pressure low enough (~20-24 VGPRs) to maintain high occupancy on mobile and integrated GPUs.

### 4.2 Evaluation Flow
In the `perturbation.wgsl` shader, the skip is evaluated by calculating the polynomial:
1.  Retrieve BTA coefficients from SSBO based on current iteration.
2.  Precompute $\Delta z_0^2, \Delta z_0 \Delta c, \Delta c^2$.
3.  Compute $\Delta z_{new}$ via 5 complex multiplications and 4 complex additions.

### 4.3 Integration with Rebasing & Reference Trees
BTA is uniquely suited for **Rebasing**. In standard Series Approximation (univariate), a rebasing event (switching to a new reference point $Z'$) requires starting a new skip from $\Delta z' = 0$, effectively discarding accumulated iteration progress. 

Because BTA is bivariate, it can accept the non-zero $\Delta z' = z - Z'$ as the initial state perturbation ($\Delta z_0$). This allows the engine to continue skipping iterations seamlessly even after a reference change, which is a critical requirement for deep-zoom "Reference Tree" architectures.

### 4.4 Accuracy & Glitch Detection
The approximation is "healthy" while the quadratic terms remain small relative to the linear terms:
$$\frac{|C \Delta z_0^2 + D \Delta z_0 \Delta c + E \Delta c^2|}{|A \Delta z_0 + B \Delta c|} < \text{Threshold}$$
If this threshold is exceeded (indicating the non-linear dynamics of the fractal boundary are dominating), the shader terminates the skip and falls back to standard per-pixel iteration.

## 5. Domain Validity & Limitations
- **Validity:** BTA remains mathematically sound as long as the orbit remains in the "linearizable" region of the reference. Near the boundary of the Mandelbrot set (the "hairs"), the approximation diverges more rapidly.
- **Precision:** While coefficients can be computed in double precision on the host, they are effectively evaluated in single precision (f32) on the GPU. This limits individual skip lengths but is compensated for by the BTA doubling logic.

## 6. Failure Modes
- **Proxy Collapse:** If the skip is too large, the approximation "collapses" to the reference orbit, causing solid color blobs (glitches).
- **Precision Floor:** At zooms beyond $10^{15}$, f32 evaluation of BTA will fail without higher-precision emulation (e.g., Double-Single).

## 7. Application to Apeiron
BTA will be integrated into the `PerturbationOrchestrator`. The Rust-based math core will precompute BTA tables for every reference orbit in the Reference Tree, and the WebGPU pipeline will utilize these tables to accelerate rendering by orders of magnitude.

## 8. References
1. Zhuoran, "Bivariate Linear Approximation (BLA)", FractalForums Thread 4353.
2. Claude Heiland-Allen, "Simpler Series Approximation", mathr.co.uk (2016).
3. K.I. Martin, "SuperFractalThing Implementation Notes", GitHub.
