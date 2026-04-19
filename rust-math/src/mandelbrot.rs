use bigdecimal::{BigDecimal, Zero, One, ToPrimitive, FromPrimitive};
use std::str::FromStr;
use serde::Deserialize;
use crate::complex::BigComplex;
use crate::layout::{BLA_LEVELS, ORBIT_STRIDE, META_STRIDE, BLA_NODE_STRIDE, DSBLA_NODE_STRIDE, BTA_NODE_STRIDE};

fn split_ds(val: f64) -> (f64, f64) {
    let hi = val as f32 as f64;
    let lo = val - hi;
    (hi, lo)
}

#[derive(Deserialize)]
pub struct Point {
    pub cr: String,
    pub ci: String,
    pub zr: String,
    pub zi: String,
    pub exponent: Option<f64>,
}

pub struct MandelbrotOutput {
    pub orbit_nodes: Vec<f64>,
    pub metadata: Vec<f64>,
    pub bla_grid_ds: Vec<f64>,
    pub bta_grid: Vec<f64>,
}

pub fn compute(
    points_json: &str, 
    max_iterations: u32,
    mut tree_context: Option<(u32, &mut crate::reference_tree::ReferenceTree)>
) -> MandelbrotOutput {
    let points: Vec<Point> = serde_json::from_str(points_json).unwrap_or_else(|_| vec![]);
    
    let floats_per_case = max_iterations as usize * ORBIT_STRIDE;
    let mut orbit_results = Vec::with_capacity(points.len() * floats_per_case);
    let mut meta_results = Vec::with_capacity(points.len() * META_STRIDE);
    let mut bla_results = Vec::with_capacity(points.len() * max_iterations as usize * BLA_LEVELS as usize * BLA_NODE_STRIDE as usize);
    let mut bla_results_ds = Vec::with_capacity(points.len() * max_iterations as usize * BLA_LEVELS as usize * DSBLA_NODE_STRIDE as usize);
    let mut bta_results = Vec::with_capacity(points.len() * max_iterations as usize * BLA_LEVELS as usize * BTA_NODE_STRIDE as usize);

    let mut point_idx = 0;
    for p in points {
        let is_primary_reference = point_idx == 0;
        point_idx += 1;
        let mut z = BigComplex::new(
            BigDecimal::from_str(&p.zr).unwrap_or(BigDecimal::zero()),
            BigDecimal::from_str(&p.zi).unwrap_or(BigDecimal::zero())
        );
        let c = BigComplex::new(
            BigDecimal::from_str(&p.cr).unwrap_or(BigDecimal::zero()),
            BigDecimal::from_str(&p.ci).unwrap_or(BigDecimal::zero())
        );
        let d = p.exponent.unwrap_or(2.0);

        let mut check_x = z.r.clone();
        let mut check_y = z.i.clone();
        let mut check_iter = 1;
        
        // Absolute Taylor Series Derivatives (Never reset)
        let mut a = BigComplex::one();
        let mut b = BigComplex::zero();
        let mut cg = BigComplex::zero();

        // Limit Cycle Derivative (Reset at check points)
        let mut cycle_der = BigComplex::one();

        let mut iter = 0;
        let limit = BigDecimal::from(4);

        let mut escaped = false;
        let mut cycle_found = false;

        let mut orbit = Vec::with_capacity((max_iterations * 8) as usize);

        while iter < max_iterations {
            let node = crate::layout::ReferenceOrbitNode {
                x: z.r.to_f64().unwrap_or(0.0),
                y: z.i.to_f64().unwrap_or(0.0),
                ar: a.r.to_f64().unwrap_or(0.0),
                ai: a.i.to_f64().unwrap_or(0.0),
                br: b.r.to_f64().unwrap_or(0.0),
                bi: b.i.to_f64().unwrap_or(0.0),
                cr: cg.r.to_f64().unwrap_or(0.0),
                ci: cg.i.to_f64().unwrap_or(0.0),
            };
            node.push_to(&mut orbit);

            if z.norm_sq() > limit {
                escaped = true;
                break;
            }

            if is_primary_reference {
                if let Some((id, ref mut tree)) = tree_context {
                    if iter % 1000 == 0 { // KEYFRAME_STRIDE
                        tree.push_keyframe(id, &z.r, &z.i);
                    }
                }
            }

            if d == 2.0 {
                // Compute A^2
                let a2 = &a * &a;

                // Compute 2AB
                let two_ab = &(&BigComplex::two() * &a) * &b;

                // A_new = 2 * Z * A + 1
                let temp_a = &(&(&BigComplex::two() * &z) * &a) + &BigComplex::one();

                // B_new = 2 * Z * B + A^2
                let temp_b = &(&(&BigComplex::two() * &z) * &b) + &a2;

                // C_new = 2 * Z * C + 2AB
                let temp_cg = &(&(&BigComplex::two() * &z) * &cg) + &two_ab;

                a = temp_a;
                b = temp_b;
                cg = temp_cg;

                // Update limit cycle derivative (A_cycle)
                cycle_der = &(&(&BigComplex::two() * &z) * &cycle_der) + &BigComplex::one();

                z = &(&z * &z) + &c;
            } else if d.fract() == 0.0 && d > 1.0 {
                let count = d as u32;
                let mut temp_z = z.clone();
                for _ in 1..count {
                    temp_z = &temp_z * &z;
                }
                z = &temp_z + &c;
                
                a = BigComplex::one();
                b = BigComplex::zero();
                cg = BigComplex::zero();
                cycle_der = BigComplex::one();
            } else {
                let x_f = z.r.to_f64().unwrap_or(0.0);
                let y_f = z.i.to_f64().unwrap_or(0.0);
                let r = (x_f * x_f + y_f * y_f).sqrt();
                let th = y_f.atan2(x_f);
                let r_pow = r.powf(d);
                let new_x_f = r_pow * (d * th).cos();
                let new_y_f = r_pow * (d * th).sin();
                
                z = &BigComplex::from_f64(new_x_f, new_y_f) + &c;
                
                a = BigComplex::one();
                b = BigComplex::zero();
                cg = BigComplex::zero();
                cycle_der = BigComplex::one();
            }

            if z.r == check_x && z.i == check_y {
                cycle_found = true;
                break;
            }

            if iter == check_iter {
                check_x = z.r.clone();
                check_y = z.i.clone();
                check_iter *= 2;
                
                cycle_der = BigComplex::one();
            }

            iter += 1;
        }

        for v in orbit.iter() {
            orbit_results.push(*v);
        }

        let pushed_values = orbit.len() / ORBIT_STRIDE;
        let remaining = max_iterations as usize - pushed_values;
        let pad_node = crate::layout::ReferenceOrbitNode {
            x: z.r.to_f64().unwrap_or(0.0),
            y: z.i.to_f64().unwrap_or(0.0),
            ar: a.r.to_f64().unwrap_or(0.0),
            ai: a.i.to_f64().unwrap_or(0.0),
            br: b.r.to_f64().unwrap_or(0.0),
            bi: b.i.to_f64().unwrap_or(0.0),
            cr: cg.r.to_f64().unwrap_or(0.0),
            ci: cg.i.to_f64().unwrap_or(0.0),
        };
        for _ in 0..remaining {
            pad_node.push_to(&mut orbit_results);
        }

        let meta = crate::layout::OrbitMetadata {
            cycle_found: if cycle_found { 1.0 } else { 0.0 },
            cycle_der_r: cycle_der.r.to_f64().unwrap_or(0.0),
            cycle_der_i: cycle_der.i.to_f64().unwrap_or(0.0),
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
        // BTA Block is (ar, ai, br, bi, cr, ci, dr, di, er, ei, err)
        let mut bta_grid = vec![vec![(0.0f64, 0.0f64, 0.0f64, 0.0f64, 0.0f64, 0.0f64, 0.0f64, 0.0f64, 0.0f64, 0.0f64, 0.0f64); max_iterations as usize]; max_levels];

        // Level 0 (size 1)
        for i in 0..(max_iterations as usize) {
            bla_grid[0][i] = (2.0 * blx[i], 2.0 * bly[i], 1.0, 0.0, 1.0);
            bta_grid[0][i] = (2.0 * blx[i], 2.0 * bly[i], 1.0, 0.0, 1.0, 0.0, 0.0, 0.0, 0.0, 0.0, 1.0);
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

                    // --- BTA Doubling ---
                    let bt1 = bta_grid[l - 1][i];
                    let bt2 = bta_grid[l - 1][i + step];
                    
                    let a1 = (bt1.0, bt1.1);
                    let b1_c = (bt1.2, bt1.3);
                    let c1 = (bt1.4, bt1.5);
                    let d1 = (bt1.6, bt1.7);
                    let e1 = (bt1.8, bt1.9);
                    
                    let a2 = (bt2.0, bt2.1);
                    let b2_c = (bt2.2, bt2.3);
                    let c2 = (bt2.4, bt2.5);
                    let d2 = (bt2.6, bt2.7);
                    let e2 = (bt2.8, bt2.9);
                    
                    let cmul = |x: (f64, f64), y: (f64, f64)| -> (f64, f64) {
                        (x.0 * y.0 - x.1 * y.1, x.0 * y.1 + x.1 * y.0)
                    };
                    let cadd = |x: (f64, f64), y: (f64, f64)| -> (f64, f64) {
                        (x.0 + y.0, x.1 + y.1)
                    };
                    let csq = |x: (f64, f64)| -> (f64, f64) {
                        (x.0 * x.0 - x.1 * x.1, 2.0 * x.0 * x.1)
                    };
                    
                    // A_c = A_2 A_1
                    let ac = cmul(a2, a1);
                    // B_c = A_2 B_1 + B_2
                    let bc = cadd(cmul(a2, b1_c), b2_c);
                    // C_c = A_2 C_1 + C_2 A_1^2
                    let cc = cadd(cmul(a2, c1), cmul(c2, csq(a1)));
                    // D_c = A_2 D_1 + 2 C_2 A_1 B_1 + D_2 A_1
                    let tmp1 = cmul(a2, d1);
                    let tmp2 = cmul(cmul((2.0, 0.0), c2), cmul(a1, b1_c));
                    let tmp3 = cmul(d2, a1);
                    let dc = cadd(cadd(tmp1, tmp2), tmp3);
                    // E_c = A_2 E_1 + C_2 B_1^2 + D_2 B_1 + E_2
                    let etmp1 = cmul(a2, e1);
                    let etmp2 = cmul(c2, csq(b1_c));
                    let etmp3 = cmul(d2, b1_c);
                    let ec = cadd(cadd(cadd(etmp1, etmp2), etmp3), e2);
                    
                    if a2_mag > 1e20 || b2_mag_sq > 1e40 || err > 1e25 {
                        bta_grid[l][i] = (0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, f64::INFINITY);
                    } else {
                        bta_grid[l][i] = (ac.0, ac.1, bc.0, bc.1, cc.0, cc.1, dc.0, dc.1, ec.0, ec.1, err);
                    }
                } else {
                    // Out of bounds, flag invalid with err = INFINITY
                    bla_grid[l][i] = (0.0, 0.0, 0.0, 0.0, f64::INFINITY);
                    bta_grid[l][i] = (0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, 0.0, f64::INFINITY);
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

                let bta_n = bta_grid[l][i];
                let bta_out = crate::layout::BtaNode {
                    ar: bta_n.0, ai: bta_n.1,
                    br: bta_n.2, bi: bta_n.3,
                    cr: bta_n.4, ci: bta_n.5,
                    dr: bta_n.6, di: bta_n.7,
                    er: bta_n.8, ei: bta_n.9,
                    err: bta_n.10,
                    len: (1 << l) as f64,
                    pad1: 0.0, pad2: 0.0, pad3: 0.0, pad4: 0.0,
                };
                bta_out.push_to(&mut bta_results);
            }
        }
    }

    MandelbrotOutput {
        orbit_nodes: orbit_results,
        metadata: meta_results,
        bla_grid_ds: bla_results_ds,
        bta_grid: bta_results,
    }
}
