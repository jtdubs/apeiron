use wasm_bindgen::prelude::*;
use bigdecimal::{BigDecimal, Zero, One};
use std::str::FromStr;
use serde::Deserialize;
use bigdecimal::ToPrimitive;
use bigdecimal::FromPrimitive;

#[path = "generated/layout.rs"]
pub mod layout;
use layout::*;

#[derive(Deserialize)]
pub struct Point {
    pub zr: String,
    pub zi: String,
    pub cr: String,
    pub ci: String,
    pub exponent: Option<f64>,
}

#[wasm_bindgen]
pub struct MathPayload {
    orbit_nodes: js_sys::Float64Array,
    metadata: js_sys::Float64Array,
    bla_grid: js_sys::Float64Array,
    bla_grid_ds: js_sys::Float64Array,
}

#[wasm_bindgen]
impl MathPayload {
    #[wasm_bindgen(getter)]
    pub fn orbit_nodes(&self) -> js_sys::Float64Array {
        self.orbit_nodes.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn metadata(&self) -> js_sys::Float64Array {
        self.metadata.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn bla_grid(&self) -> js_sys::Float64Array {
        self.bla_grid.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn bla_grid_ds(&self) -> js_sys::Float64Array {
        self.bla_grid_ds.clone()
    }
}

fn split_ds(val: f64) -> (f64, f64) {
    let hi = val as f32 as f64;
    let lo = val - hi;
    (hi, lo)
}

pub struct NativeMathPayload {
    pub orbit_nodes: Vec<f64>,
    pub metadata: Vec<f64>,
    pub bla_grid: Vec<f64>,
    pub bla_grid_ds: Vec<f64>,
}

pub fn compute_mandelbrot_internal(points_json: &str, max_iterations: u32) -> NativeMathPayload {
    let points: Vec<Point> = serde_json::from_str(points_json).unwrap_or_else(|_| vec![]);
    
    let floats_per_case = max_iterations as usize * ORBIT_STRIDE;
    let mut orbit_results = Vec::with_capacity(points.len() * floats_per_case);
    let mut meta_results = Vec::with_capacity(points.len() * META_STRIDE);
    let mut bla_results = Vec::with_capacity(points.len() * max_iterations as usize * BLA_LEVELS as usize * BLA_NODE_STRIDE as usize);
    let mut bla_results_ds = Vec::with_capacity(points.len() * max_iterations as usize * BLA_LEVELS as usize * DSBLA_NODE_STRIDE as usize);

    for p in points {
        let mut x = BigDecimal::from_str(&p.zr).unwrap_or(BigDecimal::zero());
        let mut y = BigDecimal::from_str(&p.zi).unwrap_or(BigDecimal::zero());
        let x0 = BigDecimal::from_str(&p.cr).unwrap_or(BigDecimal::zero());
        let y0 = BigDecimal::from_str(&p.ci).unwrap_or(BigDecimal::zero());
        let d = p.exponent.unwrap_or(2.0);

        let mut check_x = x.clone();
        let mut check_y = y.clone();
        let mut check_iter = 1;
        
        // Absolute Taylor Series Derivatives (Never reset)
        let mut ar = BigDecimal::one();
        let mut ai = BigDecimal::zero();
        let mut br = BigDecimal::zero();
        let mut bi = BigDecimal::zero();
        let mut cr = BigDecimal::zero();
        let mut ci = BigDecimal::zero();

        // Limit Cycle Derivative (Reset at check points)
        let mut cycle_der_r = BigDecimal::one();
        let mut cycle_der_i = BigDecimal::zero();

        let mut iter = 0;
        let limit = BigDecimal::from(4);
        let two = BigDecimal::from(2);

        let mut escaped = false;
        let mut cycle_found = false;

        let mut orbit = Vec::with_capacity((max_iterations * 8) as usize);

        while iter < max_iterations {
            let node = crate::layout::ReferenceOrbitNode {
                x: x.to_f64().unwrap_or(0.0),
                y: y.to_f64().unwrap_or(0.0),
                ar: ar.to_f64().unwrap_or(0.0),
                ai: ai.to_f64().unwrap_or(0.0),
                br: br.to_f64().unwrap_or(0.0),
                bi: bi.to_f64().unwrap_or(0.0),
                cr: cr.to_f64().unwrap_or(0.0),
                ci: ci.to_f64().unwrap_or(0.0),
            };
            node.push_to(&mut orbit);

            let x2 = &x * &x;
            let y2 = &y * &y;

            if (&x2 + &y2) > limit {
                escaped = true;
                break;
            }

            if d == 2.0 {
                // Compute A^2
                let a2_r = (&ar * &ar - &ai * &ai).with_prec(100);
                let a2_i = (&two * &ar * &ai).with_prec(100);

                // Compute 2AB
                let ab_r = (&ar * &br - &ai * &bi).with_prec(100);
                let ab_i = (&ar * &bi + &ai * &br).with_prec(100);
                let two_ab_r = (&two * &ab_r).with_prec(100);
                let two_ab_i = (&two * &ab_i).with_prec(100);

                // A_new = 2 * Z * A + 1
                let temp_ar = (&two * (&x * &ar - &y * &ai) + BigDecimal::one()).with_prec(100);
                let temp_ai = (&two * (&x * &ai + &y * &ar)).with_prec(100);

                // B_new = 2 * Z * B + A^2
                let temp_br = (&two * (&x * &br - &y * &bi) + &a2_r).with_prec(100);
                let temp_bi = (&two * (&x * &bi + &y * &br) + &a2_i).with_prec(100);

                // C_new = 2 * Z * C + 2AB
                let temp_cr = (&two * (&x * &cr - &y * &ci) + &two_ab_r).with_prec(100);
                let temp_ci = (&two * (&x * &ci + &y * &cr) + &two_ab_i).with_prec(100);

                ar = temp_ar;
                ai = temp_ai;
                br = temp_br;
                bi = temp_bi;
                cr = temp_cr;
                ci = temp_ci;

                // Update limit cycle derivative (A_cycle)
                let temp_cycle_r = (&two * (&x * &cycle_der_r - &y * &cycle_der_i) + BigDecimal::one()).with_prec(100);
                let temp_cycle_i = (&two * (&x * &cycle_der_i + &y * &cycle_der_r)).with_prec(100);
                cycle_der_r = temp_cycle_r;
                cycle_der_i = temp_cycle_i;

                let new_x = (&x2 - &y2 + &x0).with_prec(100);
                y = (&two * &x * &y + &y0).with_prec(100);
                x = new_x;
            } else if d.fract() == 0.0 && d > 1.0 {
                let count = d as u32;
                let mut temp_x = x.clone();
                let mut temp_y = y.clone();
                let orig_x = x.clone();
                let orig_y = y.clone();
                for _ in 1..count {
                    let next_x = (&temp_x * &orig_x - &temp_y * &orig_y).with_prec(100);
                    let next_y = (&temp_x * &orig_y + &temp_y * &orig_x).with_prec(100);
                    temp_x = next_x;
                    temp_y = next_y;
                }
                x = (temp_x + &x0).with_prec(100);
                y = (temp_y + &y0).with_prec(100);
                
                ar = BigDecimal::one();
                ai = BigDecimal::zero();
                br = BigDecimal::zero();
                bi = BigDecimal::zero();
                cr = BigDecimal::zero();
                ci = BigDecimal::zero();

                cycle_der_r = BigDecimal::one();
                cycle_der_i = BigDecimal::zero();
            } else {
                let x_f = x.to_f64().unwrap_or(0.0);
                let y_f = y.to_f64().unwrap_or(0.0);
                let r = (x_f * x_f + y_f * y_f).sqrt();
                let th = y_f.atan2(x_f);
                let r_pow = r.powf(d);
                let new_x_f = r_pow * (d * th).cos();
                let new_y_f = r_pow * (d * th).sin();
                
                if let (Some(bd_x), Some(bd_y)) = (BigDecimal::from_f64(new_x_f), BigDecimal::from_f64(new_y_f)) {
                    x = (bd_x + &x0).with_prec(100);
                    y = (bd_y + &y0).with_prec(100);
                } else {
                    escaped = true;
                    break;
                }
                
                ar = BigDecimal::one();
                ai = BigDecimal::zero();
                br = BigDecimal::zero();
                bi = BigDecimal::zero();
                cr = BigDecimal::zero();
                ci = BigDecimal::zero();

                cycle_der_r = BigDecimal::one();
                cycle_der_i = BigDecimal::zero();
            }

            if x == check_x && y == check_y {
                cycle_found = true;
                break;
            }

            if iter == check_iter {
                check_x = x.clone();
                check_y = y.clone();
                check_iter *= 2;
                
                cycle_der_r = BigDecimal::one();
                cycle_der_i = BigDecimal::zero();
            }

            iter += 1;
        }

        for v in orbit.iter() {
            orbit_results.push(*v);
        }

        let pushed_values = orbit.len() / ORBIT_STRIDE;
        let remaining = max_iterations as usize - pushed_values;
        let pad_node = crate::layout::ReferenceOrbitNode {
            x: x.to_f64().unwrap_or(0.0),
            y: y.to_f64().unwrap_or(0.0),
            ar: ar.to_f64().unwrap_or(0.0),
            ai: ai.to_f64().unwrap_or(0.0),
            br: br.to_f64().unwrap_or(0.0),
            bi: bi.to_f64().unwrap_or(0.0),
            cr: cr.to_f64().unwrap_or(0.0),
            ci: ci.to_f64().unwrap_or(0.0),
        };
        for _ in 0..remaining {
            pad_node.push_to(&mut orbit_results);
        }

        let meta = crate::layout::OrbitMetadata {
            cycle_found: if cycle_found { 1.0 } else { 0.0 },
            cycle_der_r: cycle_der_r.to_f64().unwrap_or(0.0),
            cycle_der_i: cycle_der_i.to_f64().unwrap_or(0.0),
            escaped_iter: if escaped { iter as f64 } else { max_iterations as f64 },
            abs_zr: p.zr.parse::<f64>().unwrap_or(0.0),
            abs_zi: p.zi.parse::<f64>().unwrap_or(0.0),
            abs_cr: p.cr.parse::<f64>().unwrap_or(0.0),
            abs_ci: p.ci.parse::<f64>().unwrap_or(0.0),
        };
        meta.push_to(&mut meta_results);
        // --- BLA Block Grid Compilation ---
        // We compile a dense uniform matrix of dimensions [max_iterations, MAX_LEVELS]
        // where level L implies a block size of 2^L.
        let max_levels = BLA_LEVELS; 
        
        // First, extract the x, y array from the computed orbit
        let mut blx = vec![0.0f64; max_iterations as usize];
        let mut bly = vec![0.0f64; max_iterations as usize];
        let pushed_values = orbit.len() / ORBIT_STRIDE;
        for i in 0..pushed_values {
            blx[i] = orbit[i * ORBIT_STRIDE];
            bly[i] = orbit[i * ORBIT_STRIDE + 1];
        }

        // DP table for blocks: level -> iter -> block
        // Block is (ar, ai, br, bi, err)
        let mut bla_grid = vec![vec![(0.0f64, 0.0f64, 0.0f64, 0.0f64, 0.0f64); max_iterations as usize]; max_levels];

        // Level 0 (size 1)
        for i in 0..(max_iterations as usize) {
            bla_grid[0][i] = (2.0 * blx[i], 2.0 * bly[i], 1.0, 0.0, 1.0);
        }

        // Higher levels L
        for l in 1..max_levels {
            let step = 1 << (l - 1); // step size of previous level
            let _total_len = 1 << l;
            for i in 0..(max_iterations as usize) {
                if i + step < (max_iterations as usize) {
                    let b1 = bla_grid[l - 1][i];
                    let b2 = bla_grid[l - 1][i + step]; // sibling node

                    let ar = b2.0 * b1.0 - b2.1 * b1.1;
                    let ai = b2.0 * b1.1 + b2.1 * b1.0;

                    let br = b2.0 * b1.2 - b2.1 * b1.3 + b2.2;
                    let bi = b2.0 * b1.3 + b2.1 * b1.2 + b2.3;

                    let a2_mag = (b2.0 * b2.0 + b2.1 * b2.1).sqrt();
                    let a1_mag = (b1.0 * b1.0 + b1.1 * b1.1).sqrt();
                    
                    // proxy error scalar explosion limit
                    let err = a2_mag * b1.4 + b2.4 + (a1_mag + b1.4) * (a1_mag + b1.4);
                    
                    let b2_mag_sq = br * br + bi * bi;
                    if a2_mag > 1e20 || b2_mag_sq > 1e40 || err > 1e25 {
                        bla_grid[l][i] = (0.0, 0.0, 0.0, 0.0, f64::INFINITY);
                    } else {
                        bla_grid[l][i] = (ar, ai, br, bi, err);
                    }
                } else {
                    // Out of bounds, flag invalid with err = INFINITY
                    bla_grid[l][i] = (0.0, 0.0, 0.0, 0.0, f64::INFINITY);
                }
            }
        }

        // Serialize uniform grid: for each iteration, append 16 levels of 8 floats (ar, ai, br, bi, err, pad, pad, pad)
        // 16 * 8 = 128 floats per iteration. Wait, let's keep it tight: 6 floats (ar, ai, br, bi, err, pad)
        // actually 8 floats is ideal for WebGPU vec2<f32> array mapping (16 bytes aligned) -> 6 is not power of 2 sized natively.
        // Let's use 8 floats per level: ar, ai, br, bi, err, len, pad1, pad2
        for i in 0..(max_iterations as usize) {
            for l in 0..max_levels {
                let node = bla_grid[l][i];
                let bn = crate::layout::BLANode {
                    ar: node.0,
                    ai: node.1,
                    br: node.2,
                    bi: node.3,
                    err: node.4,
                    len: (1 << l) as f64,
                    pad1: 0.0,
                    pad2: 0.0,
                };
                bn.push_to(&mut bla_results);

                let (ar_hi, ar_lo) = split_ds(node.0);
                let (ai_hi, ai_lo) = split_ds(node.1);
                let (br_hi, br_lo) = split_ds(node.2);
                let (bi_hi, bi_lo) = split_ds(node.3);

                let ds_bn = crate::layout::DSBLANode {
                    ar_hi, ar_lo, ai_hi, ai_lo,
                    br_hi, br_lo, bi_hi, bi_lo,
                    err: node.4,
                    len: (1 << l) as f64,
                    pad1: 0.0, pad2: 0.0, pad3: 0.0, pad4: 0.0, pad5: 0.0, pad6: 0.0,
                };
                ds_bn.push_to(&mut bla_results_ds);
            }
        }
    }

    NativeMathPayload {
        orbit_nodes: orbit_results,
        metadata: meta_results,
        bla_grid: bla_results,
        bla_grid_ds: bla_results_ds,
    }
}

#[wasm_bindgen]
pub fn compute_mandelbrot(points_json: &str, max_iterations: u32) -> MathPayload {
    let native = compute_mandelbrot_internal(points_json, max_iterations);
    MathPayload {
        orbit_nodes: js_sys::Float64Array::from(&native.orbit_nodes[..]),
        metadata: js_sys::Float64Array::from(&native.metadata[..]),
        bla_grid: js_sys::Float64Array::from(&native.bla_grid[..]),
        bla_grid_ds: js_sys::Float64Array::from(&native.bla_grid_ds[..]),
    }
}

#[wasm_bindgen]
pub struct RefineResult {
    cr: f64,
    ci: f64,
    ref_type: String,
    period: u32,
    pre_period: u32,
}

#[wasm_bindgen]
impl RefineResult {
    #[wasm_bindgen(getter)]
    pub fn cr(&self) -> f64 { self.cr }
    #[wasm_bindgen(getter)]
    pub fn ci(&self) -> f64 { self.ci }
    #[wasm_bindgen(getter)]
    pub fn ref_type(&self) -> String { self.ref_type.clone() }
    #[wasm_bindgen(getter)]
    pub fn period(&self) -> u32 { self.period }
    #[wasm_bindgen(getter)]
    pub fn pre_period(&self) -> u32 { self.pre_period }
}

#[wasm_bindgen]
pub fn refine_reference(cr_str: &str, ci_str: &str, max_iterations: u32) -> RefineResult {
    let mut c_r = BigDecimal::from_str(cr_str).unwrap_or(BigDecimal::zero());
    let mut c_i = BigDecimal::from_str(ci_str).unwrap_or(BigDecimal::zero());

    let limit = BigDecimal::from(4);
    let two = BigDecimal::from(2);

    let mut path_r = Vec::with_capacity(max_iterations as usize + 1);
    let mut path_i = Vec::with_capacity(max_iterations as usize + 1);
    path_r.push(BigDecimal::zero());
    path_i.push(BigDecimal::zero());

    let mut found_type = "unknown".to_string();
    let mut out_period = 0;
    let mut out_pre_period = 0;

    // Use a larger epsilon for attracting cycle detection
    let epsilon = BigDecimal::from_f64(1e-4).unwrap();
    let epsilon_sq = (&epsilon * &epsilon).with_prec(100);
    
    // For Misiurewicz, we only check the first few iterations because it is repelling.
    // If it gets close early, it's Misiurewicz.
    // Otherwise, if it eventually converges, it's an attracting cycle (Nucleus).

    for i in 1..=max_iterations {
        let r = &path_r[i as usize - 1];
        let i_comp = &path_i[i as usize - 1];

        let r2 = (r * r).with_prec(100);
        let i2 = (i_comp * i_comp).with_prec(100);
        if (&r2 + &i2) > limit {
            break;
        }

        let next_r = (&r2 - &i2 + &c_r).with_prec(100);
        let next_i = (&two * r * i_comp + &c_i).with_prec(100);

        let mut mis_found = false;
        // Search backwards to see if we hit a cycle
        for k in 0..(i - 1) {
            let diff_r = &next_r - &path_r[k as usize];
            let diff_i = &next_i - &path_i[k as usize];
            let diff_sq = (&diff_r * &diff_r + &diff_i * &diff_i).with_prec(100);
            
            if diff_sq < epsilon_sq {
                out_period = i - k;
                out_pre_period = k;
                
                // Check if 0 is in the cycle!
                // The cycle is from path[k] to path[i-1].
                let mut min_mag_sq = BigDecimal::from_f64(f64::MAX).unwrap();
                for c_idx in k..i {
                    let c_r = &path_r[c_idx as usize];
                    let c_i = &path_i[c_idx as usize];
                    let c_mag_sq = (c_r * c_r + c_i * c_i).with_prec(100);
                    if c_mag_sq < min_mag_sq {
                        min_mag_sq = c_mag_sq;
                    }
                }
                
                // If the cycle contains a point close to 0, it's a nucleus (attracting cycle)
                // We use a somewhat relaxed threshold since we might not have perfectly converged yet
                let nucleus_threshold = BigDecimal::from_f64(1e-2).unwrap();
                if min_mag_sq < nucleus_threshold {
                    found_type = "nucleus".to_string();
                } else {
                    found_type = "misiurewicz".to_string();
                }
                
                mis_found = true;
                break;
            }
        }

        path_r.push(next_r);
        path_i.push(next_i);

        if mis_found {
            break;
        }
    }

    if found_type == "nucleus" {
        // Newton-Raphson refinement for Nucleus solver
        for _ in 0..20 {
            let mut z_r = BigDecimal::zero();
            let mut z_i = BigDecimal::zero();
            let mut z_der_r = BigDecimal::zero();
            let mut z_der_i = BigDecimal::zero();

            for _ in 0..out_period {
                let new_z_der_r = (&two * (&z_r * &z_der_r - &z_i * &z_der_i) + BigDecimal::one()).with_prec(100);
                let new_z_der_i = (&two * (&z_r * &z_der_i + &z_i * &z_der_r)).with_prec(100);

                let new_z_r = (&z_r * &z_r - &z_i * &z_i + &c_r).with_prec(100);
                let new_z_i = (&two * &z_r * &z_i + &c_i).with_prec(100);

                z_der_r = new_z_der_r;
                z_der_i = new_z_der_i;
                z_r = new_z_r;
                z_i = new_z_i;
            }

            let den = (&z_der_r * &z_der_r + &z_der_i * &z_der_i).with_prec(100);
            if den == BigDecimal::zero() {
                break;
            }

            let num_r = (&z_r * &z_der_r + &z_i * &z_der_i).with_prec(100);
            let num_i = (&z_i * &z_der_r - &z_r * &z_der_i).with_prec(100);

            c_r = (&c_r - (num_r / &den)).with_prec(100);
            c_i = (&c_i - (num_i / &den)).with_prec(100);
            
            // Check convergence
            let z_mag = (&z_r * &z_r + &z_i * &z_i).with_prec(100);
            if z_mag < epsilon_sq {
                break;
            }
        }
    } else if found_type == "misiurewicz" {
        // Newton-Raphson refinement for Misiurewicz solver
        // We use the basic f(c) = z_{k+p}(c) - z_k(c) for simplicity in first pass
        for _ in 0..20 {
            let mut z_r = vec![BigDecimal::zero(); (out_pre_period + out_period + 1) as usize];
            let mut z_i = vec![BigDecimal::zero(); (out_pre_period + out_period + 1) as usize];
            let mut z_der_r = vec![BigDecimal::zero(); (out_pre_period + out_period + 1) as usize];
            let mut z_der_i = vec![BigDecimal::zero(); (out_pre_period + out_period + 1) as usize];

            for j in 0..(out_pre_period + out_period) {
                let idx = j as usize;
                
                let new_z_der_r = (&two * (&z_r[idx] * &z_der_r[idx] - &z_i[idx] * &z_der_i[idx]) + BigDecimal::one()).with_prec(100);
                let new_z_der_i = (&two * (&z_r[idx] * &z_der_i[idx] + &z_i[idx] * &z_der_r[idx])).with_prec(100);

                let new_z_r = (&z_r[idx] * &z_r[idx] - &z_i[idx] * &z_i[idx] + &c_r).with_prec(100);
                let new_z_i = (&two * &z_r[idx] * &z_i[idx] + &c_i).with_prec(100);

                z_der_r[idx + 1] = new_z_der_r;
                z_der_i[idx + 1] = new_z_der_i;
                z_r[idx + 1] = new_z_r;
                z_i[idx + 1] = new_z_i;
            }

            let pk = out_pre_period as usize;
            let pkp = (out_pre_period + out_period) as usize;

            let g_r = (&z_r[pkp] - &z_r[pk]).with_prec(100);
            let g_i = (&z_i[pkp] - &z_i[pk]).with_prec(100);
            let g_der_r = (&z_der_r[pkp] - &z_der_r[pk]).with_prec(100);
            let g_der_i = (&z_der_i[pkp] - &z_der_i[pk]).with_prec(100);
            
            // Calculate h(c) to avoid finding roots of lower periods
            // h(c) = Product_{j=0..(k-1)} [ z_{j+p}(c) - z_j(c) ]
            let mut h_r = BigDecimal::one();
            let mut h_i = BigDecimal::zero();
            let mut h_sum_der_r = BigDecimal::zero();
            let mut h_sum_der_i = BigDecimal::zero();

            for i in 0..pk {
                let diff_r = (&z_r[i + out_period as usize] - &z_r[i]).with_prec(100);
                let diff_i = (&z_i[i + out_period as usize] - &z_i[i]).with_prec(100);
                let diff_der_r = (&z_der_r[i + out_period as usize] - &z_der_r[i]).with_prec(100);
                let diff_der_i = (&z_der_i[i + out_period as usize] - &z_der_i[i]).with_prec(100);

                let new_h_r = (&h_r * &diff_r - &h_i * &diff_i).with_prec(100);
                let new_h_i = (&h_r * &diff_i + &h_i * &diff_r).with_prec(100);
                h_r = new_h_r;
                h_i = new_h_i;

                let diff_den = (&diff_r * &diff_r + &diff_i * &diff_i).with_prec(100);
                if diff_den != BigDecimal::zero() {
                    let div_r = (&diff_der_r * &diff_r + &diff_der_i * &diff_i).with_prec(100);
                    let div_i = (&diff_der_i * &diff_r - &diff_der_r * &diff_i).with_prec(100);
                    h_sum_der_r = (&h_sum_der_r + (div_r / &diff_den)).with_prec(100);
                    h_sum_der_i = (&h_sum_der_i + (div_i / &diff_den)).with_prec(100);
                }
            }

            let h_der_r = (&h_r * &h_sum_der_r - &h_i * &h_sum_der_i).with_prec(100);
            let h_der_i = (&h_r * &h_sum_der_i + &h_i * &h_sum_der_r).with_prec(100);

            let h_mag_sq = (&h_r * &h_r + &h_i * &h_i).with_prec(100);
            if h_mag_sq == BigDecimal::zero() {
                break;
            }
            let f_r = ((&g_r * &h_r + &g_i * &h_i) / &h_mag_sq).with_prec(100);
            let f_i = ((&g_i * &h_r - &g_r * &h_i) / &h_mag_sq).with_prec(100);

            let gder_h_r = (&g_der_r * &h_r - &g_der_i * &h_i).with_prec(100);
            let gder_h_i = (&g_der_r * &h_i + &g_der_i * &h_r).with_prec(100);
            let g_hder_r = (&g_r * &h_der_r - &g_i * &h_der_i).with_prec(100);
            let g_hder_i = (&g_r * &h_der_i + &g_i * &h_der_r).with_prec(100);
            
            let num2_r = (&gder_h_r - &g_hder_r).with_prec(100);
            let num2_i = (&gder_h_i - &g_hder_i).with_prec(100);
            
            let h_sq_r = (&h_r * &h_r - &h_i * &h_i).with_prec(100);
            let h_sq_i = (&two * &h_r * &h_i).with_prec(100);
            
            let h_sq_mag = (&h_sq_r * &h_sq_r + &h_sq_i * &h_sq_i).with_prec(100);
            if h_sq_mag == BigDecimal::zero() {
                break;
            }
            let f_der_r = ((&num2_r * &h_sq_r + &num2_i * &h_sq_i) / &h_sq_mag).with_prec(100);
            let f_der_i = ((&num2_i * &h_sq_r - &num2_r * &h_sq_i) / &h_sq_mag).with_prec(100);

            let fder_mag_sq = (&f_der_r * &f_der_r + &f_der_i * &f_der_i).with_prec(100);
            if fder_mag_sq == BigDecimal::zero() {
                break;
            }
            
            let final_num_r = (&f_r * &f_der_r + &f_i * &f_der_i).with_prec(100);
            let final_num_i = (&f_i * &f_der_r - &f_r * &f_der_i).with_prec(100);

            c_r = (&c_r - (final_num_r / &fder_mag_sq)).with_prec(100);
            c_i = (&c_i - (final_num_i / &fder_mag_sq)).with_prec(100);
        }
    }

    RefineResult {
        cr: c_r.to_f64().unwrap_or(0.0),
        ci: c_i.to_f64().unwrap_or(0.0),
        ref_type: found_type,
        period: out_period,
        pre_period: out_pre_period,
    }
}
