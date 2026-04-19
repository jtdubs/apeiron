use bigdecimal::{BigDecimal, Zero, ToPrimitive};
use std::str::FromStr;
use serde::Deserialize;
use crate::complex::BigComplex;
use crate::layout::{BLA_LEVELS, ORBIT_STRIDE, META_STRIDE, BLA_NODE_STRIDE, DSBLA_NODE_STRIDE, BTA_NODE_STRIDE};

const PROXY_EXPLOSION_LIMIT: f64 = 1e25;
const A2_MAG_LIMIT: f64 = 1e20;
const B2_MAG_SQ_LIMIT: f64 = 1e40;

#[derive(Debug, Clone, Copy)]
struct BtaDerivatives {
    ar: f64, ai: f64,
    br: f64, bi: f64,
    cr: f64, ci: f64,
    dr: f64, di: f64,
    er: f64, ei: f64,
    err: f64,
}

impl BtaDerivatives {
    fn invalid() -> Self {
        Self {
            ar: 0.0, ai: 0.0, br: 0.0, bi: 0.0,
            cr: 0.0, ci: 0.0, dr: 0.0, di: 0.0,
            er: 0.0, ei: 0.0, err: f64::INFINITY,
        }
    }
}

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

// Extract orbit computation
fn compute_orbit(
    p: &Point,
    max_iterations: u32,
    tree_context: &mut Option<(u32, &mut crate::reference_tree::ReferenceTree)>,
    is_primary_reference: bool
) -> (Vec<f64>, crate::layout::OrbitMetadata) {
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
    
    let mut a = BigComplex::one();
    let mut b = BigComplex::zero();
    let mut cg = BigComplex::zero();

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
                    tree.push_keyframe(*id, &z.r, &z.i);
                }
            }
        }

        if d == 2.0 {
            let a2 = &a * &a;
            let two_ab = &(&BigComplex::two() * &a) * &b;
            let temp_a = &(&(&BigComplex::two() * &z) * &a) + &BigComplex::one();
            let temp_b = &(&(&BigComplex::two() * &z) * &b) + &a2;
            let temp_cg = &(&(&BigComplex::two() * &z) * &cg) + &two_ab;

            a = temp_a;
            b = temp_b;
            cg = temp_cg;

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
        pad_node.push_to(&mut orbit);
    }
    (orbit, meta)
}

fn compile_bla_grids(
    orbit: &[f64],
    max_iterations: usize,
    max_levels: usize,
    bla_results: &mut Vec<f64>,
    bla_results_ds: &mut Vec<f64>,
    bta_results: &mut Vec<f64>,
) {
    let mut blx = vec![0.0f64; max_iterations];
    let mut bly = vec![0.0f64; max_iterations];
    // Since orbit is padded to max_iterations, we can just read it safely
    for i in 0..max_iterations {
        blx[i] = orbit[i * ORBIT_STRIDE];
        bly[i] = orbit[i * ORBIT_STRIDE + 1];
    }

    let mut bla_grid = vec![(0.0f64, 0.0f64, 0.0f64, 0.0f64, 0.0f64); max_iterations * max_levels];
    let mut bta_grid = vec![BtaDerivatives::invalid(); max_iterations * max_levels];

    for i in 0..max_iterations {
        let idx = i; // level 0 offset is just i
        bla_grid[idx] = (2.0 * blx[i], 2.0 * bly[i], 1.0, 0.0, 1.0);
        bta_grid[idx] = BtaDerivatives {
            ar: 2.0 * blx[i], ai: 2.0 * bly[i],
            br: 1.0, bi: 0.0,
            cr: 1.0, ci: 0.0,
            dr: 0.0, di: 0.0,
            er: 0.0, ei: 0.0, err: 1.0
        };
    }

    for l in 1..max_levels {
        let step = 1 << (l - 1);
        let level_offset = l * max_iterations;
        let prev_level_offset = (l - 1) * max_iterations;

        for i in 0..max_iterations {
            if i + step < max_iterations {
                let b1 = bla_grid[prev_level_offset + i];
                let b2 = bla_grid[prev_level_offset + i + step];

                let ar = b2.0 * b1.0 - b2.1 * b1.1;
                let ai = b2.0 * b1.1 + b2.1 * b1.0;

                let br = b2.0 * b1.2 - b2.1 * b1.3 + b2.2;
                let bi = b2.0 * b1.3 + b2.1 * b1.2 + b2.3;

                let a2_mag = (b2.0 * b2.0 + b2.1 * b2.1).sqrt();
                let a1_mag = (b1.0 * b1.0 + b1.1 * b1.1).sqrt();
                
                let err = a2_mag * b1.4 + b2.4 + (a1_mag + b1.4) * (a1_mag + b1.4);
                
                let b2_mag_sq = br * br + bi * bi;
                if a2_mag > A2_MAG_LIMIT || b2_mag_sq > B2_MAG_SQ_LIMIT || err > PROXY_EXPLOSION_LIMIT {
                    bla_grid[level_offset + i] = (0.0, 0.0, 0.0, 0.0, f64::INFINITY);
                } else {
                    bla_grid[level_offset + i] = (ar, ai, br, bi, err);
                }

                let bt1 = bta_grid[prev_level_offset + i];
                let bt2 = bta_grid[prev_level_offset + i + step];
                
                let a1 = (bt1.ar, bt1.ai);
                let b1_c = (bt1.br, bt1.bi);
                let c1 = (bt1.cr, bt1.ci);
                let d1 = (bt1.dr, bt1.di);
                let e1 = (bt1.er, bt1.ei);
                
                let a2 = (bt2.ar, bt2.ai);
                let b2_c = (bt2.br, bt2.bi);
                let c2 = (bt2.cr, bt2.ci);
                let d2 = (bt2.dr, bt2.di);
                let e2 = (bt2.er, bt2.ei);
                
                let cmul = |x: (f64, f64), y: (f64, f64)| -> (f64, f64) {
                    (x.0 * y.0 - x.1 * y.1, x.0 * y.1 + x.1 * y.0)
                };
                let cadd = |x: (f64, f64), y: (f64, f64)| -> (f64, f64) {
                    (x.0 + y.0, x.1 + y.1)
                };
                let csq = |x: (f64, f64)| -> (f64, f64) {
                    (x.0 * x.0 - x.1 * x.1, 2.0 * x.0 * x.1)
                };
                
                let ac = cmul(a2, a1);
                let bc = cadd(cmul(a2, b1_c), b2_c);
                let cc = cadd(cmul(a2, c1), cmul(c2, csq(a1)));
                
                let tmp1 = cmul(a2, d1);
                let tmp2 = cmul(cmul((2.0, 0.0), c2), cmul(a1, b1_c));
                let tmp3 = cmul(d2, a1);
                let dc = cadd(cadd(tmp1, tmp2), tmp3);
                
                let etmp1 = cmul(a2, e1);
                let etmp2 = cmul(c2, csq(b1_c));
                let etmp3 = cmul(d2, b1_c);
                let ec = cadd(cadd(cadd(etmp1, etmp2), etmp3), e2);
                
                if a2_mag > A2_MAG_LIMIT || b2_mag_sq > B2_MAG_SQ_LIMIT || err > PROXY_EXPLOSION_LIMIT {
                    bta_grid[level_offset + i] = BtaDerivatives::invalid();
                } else {
                    bta_grid[level_offset + i] = BtaDerivatives {
                        ar: ac.0, ai: ac.1, br: bc.0, bi: bc.1,
                        cr: cc.0, ci: cc.1, dr: dc.0, di: dc.1,
                        er: ec.0, ei: ec.1, err,
                    };
                }
            } else {
                bla_grid[level_offset + i] = (0.0, 0.0, 0.0, 0.0, f64::INFINITY);
                bta_grid[level_offset + i] = BtaDerivatives::invalid();
            }
        }
    }

    for i in 0..max_iterations {
        for l in 0..max_levels {
            let idx = l * max_iterations + i;
            let node = bla_grid[idx];
            
            let bn = crate::layout::BLANode {
                ar: node.0, ai: node.1,
                br: node.2, bi: node.3,
                err: node.4,
                len: (1 << l) as f64,
                pad1: 0.0, pad2: 0.0,
            };
            bn.push_to(bla_results);

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
            ds_bn.push_to(bla_results_ds);

            let bta_n = bta_grid[idx];
            let bta_out = crate::layout::BtaNode {
                ar: bta_n.ar, ai: bta_n.ai,
                br: bta_n.br, bi: bta_n.bi,
                cr: bta_n.cr, ci: bta_n.ci,
                dr: bta_n.dr, di: bta_n.di,
                er: bta_n.er, ei: bta_n.ei,
                err: bta_n.err,
                len: (1 << l) as f64,
                pad1: 0.0, pad2: 0.0, pad3: 0.0, pad4: 0.0,
            };
            bta_out.push_to(bta_results);
        }
    }
}

/// Executes an orbit path based on the chosen precision/exponent parameters
/// and returns the derived output channels and grids required by WebGPU.
pub fn compute(
    points_json: &str, 
    max_iterations: u32,
    tree_context: Option<(u32, &mut crate::reference_tree::ReferenceTree)>
) -> Result<MandelbrotOutput, String> {
    let points: Vec<Point> = serde_json::from_str(points_json)
        .map_err(|e| format!("Failed to parse points JSON {}", e))?;
    
    let mut orbit_results = Vec::with_capacity(points.len() * max_iterations as usize * ORBIT_STRIDE);
    let mut meta_results = Vec::with_capacity(points.len() * META_STRIDE);
    let mut bla_results = Vec::with_capacity(points.len() * max_iterations as usize * BLA_LEVELS * BLA_NODE_STRIDE);
    let mut bla_results_ds = Vec::with_capacity(points.len() * max_iterations as usize * BLA_LEVELS * DSBLA_NODE_STRIDE);
    let mut bta_results = Vec::with_capacity(points.len() * max_iterations as usize * BLA_LEVELS * BTA_NODE_STRIDE);

    let mut tree_context_mut = tree_context;

    for (point_idx, p) in points.into_iter().enumerate() {
        let is_primary_reference = point_idx == 0;
        
        let (orbit, meta) = compute_orbit(&p, max_iterations, &mut tree_context_mut, is_primary_reference);
        for v in orbit.iter() {
            orbit_results.push(*v);
        }
        meta.push_to(&mut meta_results);

        compile_bla_grids(
            &orbit, 
            max_iterations as usize, 
            BLA_LEVELS, 
            &mut bla_results, 
            &mut bla_results_ds, 
            &mut bta_results
        );
    }

    Ok(MandelbrotOutput {
        orbit_nodes: orbit_results,
        metadata: meta_results,
        bla_grid_ds: bla_results_ds,
        bta_grid: bta_results,
    })
}
