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
pub fn compute_mandelbrot(points_json: &str, max_iterations: u32) -> js_sys::Float64Array {
    let points: Vec<Point> = serde_json::from_str(points_json).unwrap_or_else(|_| vec![]);
    
    // Vector packing format relies on strongly typed constants inside layout.rs
    // which represent ORBIT_STRIDE, META_STRIDE, BLA_LEVELS, BLA_NODE_STRIDE.
    let floats_per_case = (max_iterations as usize * FLOATS_PER_ITER) + META_STRIDE;
    let mut results = Vec::with_capacity(points.len() * floats_per_case);

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
            results.push(*v);
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
            pad_node.push_to(&mut results);
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
        meta.push_to(&mut results);
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
                bn.push_to(&mut results);
            }
        }
    }

    js_sys::Float64Array::from(&results[..])
}
