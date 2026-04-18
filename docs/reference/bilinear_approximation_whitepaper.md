# Whitepaper: Bivariate Linear Approximation (BLA) for Fractal Perturbation

## Abstract
Bivariate Linear Approximation (BLA) is a sophisticated acceleration technique for deep-zoom fractal rendering. By linearizing the perturbation equations with respect to both the orbit deviation ($\Delta z$) and the parameter difference ($\Delta c$), BLA allows rendering engines to skip thousands of iterations in a single computational step while maintaining mathematical integrity.

## Historical Context
Originally stemming from **K.I. Martin's** 2013 work on Perturbation Theory and Series Approximation (SA), BLA was formally synthesized and introduced to the community by the developer **Zhuoran** in late 2021. It was developed to overcome the limitations of Series Approximation, specifically the inability of SA to handle arbitrary starting points and its tendency to fail near critical points. Key modern implementations include **Claude Heiland-Allen's** *Imagina* and **Kalles Fraktaler**.

## The Problem
Standard Perturbation Theory reduces the precision requirements of fractal rendering but still requires iterative calculation for every pixel. **Series Approximation (SA)** attempted to skip iterations by expanding $\Delta z$ as a power series in $\Delta c$, but SA is mathematically bound to a specific starting point (usually $\Delta z_0 = 0$).

When the orbit of a pixel approaches a critical point (like 0 in the Mandelbrot set) where $|Z_n|$ is small, the linear approximation breaks down—a phenomenon known as **Proxy Collapse**. BLA solves this by allowing for "rebasing" and by providing a bivariate model that can jump from any iteration $n$ to $n+L$.

## Mathematical Mechanics

The core of BLA is the linear model approximating the deviation after $L$ steps:
$$\Delta z_{n+L} \approx A_L \Delta z_n + B_L \Delta c$$

### Non-Holomorphic Extensions (e.g., Burning Ship)
While the complex coefficients $(A, B)$ work for holomorphic formulas like $z^2+c$, non-holomorphic formulas (e.g., Burning Ship $|Re(z)| + i|Im(z)|$) require a bivariate model using $2 \times 2$ real matrices:
$$\begin{bmatrix} \Delta z_r \\ \Delta z_i \end{bmatrix}_{n+L} \approx \mathbf{A}_L \begin{bmatrix} \Delta z_r \\ \Delta z_i \end{bmatrix}_n + \mathbf{B}_L \begin{bmatrix} \Delta c_r \\ \Delta c_i \end{bmatrix}$$
In this case, the combination rules involve matrix multiplication for $\mathbf{A}$ and matrix-vector operations for $\mathbf{B}$. This ensures BLA remains valid for fractals where the derivative is not a single complex number.

### Base Case (Step length $L=1$)
For the Mandelbrot set ($z^2+c$):
- $A_1 = 2 Z_n$
- $B_1 = 1$
- $E_1 = 1$ (Error coefficient for validity tracking)

### Recursive Combination (Doubling)
To combine two pre-calculated segments of lengths $L_1$ and $L_2$:
- $A_{1+2} = A_2 \cdot A_1$
- $B_{1+2} = A_2 \cdot B_1 + B_2$
- $E_{1+2} = |A_2| \cdot E_1 + E_2 + (|A_1| + E_1)^2$ 

*Note: The $E_{1+2}$ formula accounts for the worst-case growth of quadratic error as segments are combined, ensuring the approximation remains conservative.*

## Algorithmic Implementation

### BLA Table Construction (Dense Uniform Grid)
The structure is typically implemented as a dense grid of dimensions `[max_iterations, BLA_LEVELS]`.
1. **Initialize Level 0:** Calculate $A_1, B_1, E_1$ for every step of the reference orbit.
2. **Recursive Combination:** Build each subsequent Level $k$ by combining `grid[k-1][i]` and `grid[k-1][i + 2^(k-1)]`.
3. **Validity Radius (Optional):** Some implementations pre-calculate a radius $r$ bottom-up: $r_{node} = \min(r_{child1}, \frac{r_{child2} - |B_{child1}| \cdot k_c}{|A_{child1}|})$.

### Runtime Jump Logic
For each pixel at iteration $n$:
1. Search the table from the highest level down to 0.
2. **Linearity Check:** $E_L \cdot \max(|\Delta z|^2, |\Delta c|^2) < \text{tolerance}$ (where $\text{tolerance} \approx 10^{-6}$).
3. **Proxy Collapse Prevention (Zhuoran Test):** $|Z_{n+L} + \Delta z_{n+L}| < |\Delta z_{n+L}|$. If this condition is met, the reference has been "swallowed" by the perturbation, and the jump must be rejected.
4. If valid, update $\Delta z = A \Delta z + B \Delta c$ and $n = n + 2^k$.

## Domain Validity & Limitations

### Validity Criteria
A BLA jump is mathematically sound only if it passes both the **Linearity Check** (ensuring the ignored quadratic terms are negligible) and the **Proxy Collapse Check** (ensuring the reference orbit remains representative of the pixel's path).

### Blind Spots & Ejection
BLA is "blind" to the underlying fractal topology; it only operates on the linear coefficients derived from the reference orbit. 
- **Blind Spots:** If a pixel enters a region where $|\Delta z| > |Z_n|$, the linear assumption is fundamentally broken. In these "blind spots," BLA matrices will output corrupted values, leading to rapid divergence or numerical overflow.
- **Ejection Logic:** When the jump logic detects a potential Proxy Collapse, it must **eject** the pixel from the BLA pipeline.
- **Recovery:** Upon ejection, the engine must either fall back to standard per-step perturbation (if the zoom is shallow enough for $f32$ precision) or trigger a **Reference Rebase** (for deep zooms), where a new high-precision reference orbit is calculated for the specific failing region.


### Failure Modes & Diagnostics
- **Blobbing:** Visual "smearing" or loss of detail when the reference orbit is used beyond its radius of convergence.
- **Glitch Bands:** Discontinuities where the linear approximation error exceeds the threshold, often appearing as sharp vertical or horizontal tears.
- **Proxy Collapse:** Total disintegration of the fractal structure, often resulting in solid color blocks or "magenta screens" in hardware implementations.

## Application to Apeiron
In the Apeiron architecture, BLA is implemented as a pre-computation pass on the CPU (Rust) or a specialized Compute Shader. The resulting `BLATable` is stored in a GPU `storage` buffer. 

### Multi-Reference Orchestration
The engine is designed to support a **Multi-Reference Strategy**. When BLA "ejects" a cluster of pixels (indicating a shared glitch zone), the orchestrator identifies the failure region and calculates a new, targeted high-precision reference orbit. A unique BLA tree is then built for this sub-region, allowing the engine to resolve deep-zoom features that a single global reference cannot represent.

## References
1. Martin, K. I. (2013). *SuperFractalThing Maths*. philthompson.me.
2. Zhuoran (2021). *Bivariate Linear Approximation*. FractalForums.org.
3. Heiland-Allen, C. (2021). *Bivariate Linear Approximation Blog*. mathr.co.uk.
4. Munafo, R. P. (2023). *Bivariate Linear Approximation Summary*. mrob.com.
