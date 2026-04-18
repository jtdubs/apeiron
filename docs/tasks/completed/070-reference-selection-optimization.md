---
status: closed
---

# Task 070: Reference Selection Optimization

## Objective

Implement an automated, dual-mode Reference Optimizer that selects and refines the mathematically "best" coordinate for perturbation rendering. The system must support both Nucleus (bulb center) and Misiurewicz (spiral/filament center) refinement.

## Relevant Design Docs

- [Singular Points Whitepaper](../reference/singular_points_reference_selection.md)
- [Apeiron Best Practices](../process/best-practices.md)

## Requirements

### 1. Rust WASM Solvers

- [x] Implement `NucleusSolver` in `rust-math`:
  - Newton-Raphson refinement for $z_p(c) = 0$.
  - Recursive derivative tracking for $z'_p$.
- [x] Implement `MisiurewiczSolver` in `rust-math`:
  - Refined Newton-Raphson objective function to prevent pre-period collapse.
  - Simultaneous tracking of pre-periodic and periodic orbit/derivative components.
- [x] Implement `PeriodDetector`:
  - Atom Domain search (monitoring $|z_n|$).
  - Misiurewicz Domain search (monitoring $|z_n - z_i|$).

### 2. TypeScript Orchestration

- [x] Update `PerturbationOrchestrator` to execute the detection-refinement pipeline.
- [x] Implement the "Snapping" logic: sample viewport center -> detect type -> refine -> set reference.
- [x] Add support for "Re-referencing" triggered by GPU glitch feedback.

### 3. GPU Glitch Feedback

- [ ] *Deferred to Task 071* Update WebGPU shaders to detect bits-of-precision loss.
- [ ] *Deferred to Task 071* Implement a readback buffer for glitch coordinates to trigger asynchronous re-optimization.

## Implementation Plan

### Nucleus Solver Interface (Rust)

```rust
struct NucleusSolver {
    precision_bits: u32,
    max_steps: usize,
    tolerance: BigFloat, // e.g. 10^-precision
}

impl NucleusSolver {
    /// Refines a guess c into a nucleus of period p
    pub fn find_nucleus(&self, guess: BigComplex, period: usize) -> Result<BigComplex, SolverError> {
        let mut c = guess;
        for _ in 0..self.max_steps {
            let (z, z_der) = self.iterate_with_derivative(&c, period);

            if z.norm() < self.tolerance {
                return Ok(c);
            }

            // Newton step: c = c - z / z_der
            c = c - (z / z_der);
        }
        Err(SolverError::DidNotConverge)
    }

    fn iterate_with_derivative(&self, c: &BigComplex, period: usize) -> (BigComplex, BigComplex) {
        let mut z = BigComplex::zero();
        let mut z_der = BigComplex::zero();

        for _ in 0..period {
            z_der = (z.clone() * 2.0) * z_der + 1.0;
            z = z.clone() * z.clone() + c;
        }
        (z, z_der)
    }
}
```

### Misiurewicz Solver Interface (Rust)

```rust
impl MisiurewiczSolver {
    /// Refines c into a Misiurewicz point of type (k, p)
    pub fn find_misiurewicz(&self, guess: BigComplex, k: usize, p: usize) -> Result<BigComplex, SolverError> {
        let mut c = guess;
        for _ in 0..self.max_steps {
            let (f, f_der) = self.eval_refined_objective(&c, k, p);
            if f.norm() < self.tolerance {
                return Ok(c);
            }
            c = c - (f / f_der);
        }
        Err(SolverError::DidNotConverge)
    }

    fn eval_refined_objective(&self, c: &BigComplex, k: usize, p: usize) -> (BigComplex, BigComplex) {
        let mut z = vec![BigComplex::zero(); k + p + 1];
        let mut z_der = vec![BigComplex::zero(); k + p + 1];

        for i in 0..(k + p) {
            z_der[i+1] = (z[i].clone() * 2.0) * z_der[i].clone() + 1.0;
            z[i+1] = z[i].clone() * z[i].clone() + c;
        }

        let g = z[k+p].clone() - z[k].clone();
        let g_der = z_der[k+p].clone() - z_der[k].clone();

        let mut h = BigComplex::one();
        let mut h_sum_der = BigComplex::zero();

        for i in 0..k {
            let diff = z[i+p].clone() - z[i].clone();
            let diff_der = z_der[i+p].clone() - z_der[i].clone();
            h = h * diff.clone();
            h_sum_der = h_sum_der + (diff_der / diff);
        }

        let h_der = h.clone() * h_sum_der;
        let f = g.clone() / h.clone();
        let f_der = (g_der * h.clone() - g.clone() * h_der) / (h.clone() * h.clone());

        (f, f_der)
    }
}
```

### Strategic Orchestration (TypeScript)

1. **Sample:** Sample viewport center.
2. **Detect Type:**
   - If $|z_n| \to 0$: Periodic (Nucleus). Target: $z_p = 0$.
   - If $|z_n - z_i| \to 0$: Pre-periodic (Misiurewicz). Target: $z_{k+p} = z_k$.
3. **Refine:** Call the appropriate solver.
4. **Finalize:** Use the refined coordinate as the high-precision reference.

## Verification Steps

- [x] Write a headless Deno test that feeds a target coordinate into `rust-math`. Verify that the NucleusSolver converges to the known mathematical center instead of the naive starting point.
- [ ] *Deferred* Add a headless test for the WGSL glitch detection output buffer.
- [x] **Implementation standard:** Have all shared boundaries, extracted math helpers, or state-machine behaviors been strictly validated as headless deterministic units per `docs/process/best-practices.md`?
- [x] **Documentation Sync:** Update `docs/reference/singular_points_reference_selection.md` with any constraints discovered during implementation before closing this task.
