use wasm_bindgen::prelude::*;
use bigdecimal::{BigDecimal, Zero, One};
use std::str::FromStr;
use serde::Deserialize;
use bigdecimal::ToPrimitive;
use bigdecimal::FromPrimitive;

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
    
    // Each point yields: (max_iterations) * 8 floats for the orbit (x, y, ar, ai, br, bi, cr, ci)
    // PLUS 8 metadata floats: [cycle_found, der_r, der_i, iter/escape, abs_zr, abs_zi, abs_cr, abs_ci]
    let mut results = Vec::with_capacity(points.len() * ((max_iterations as usize * 8) + 8));

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
            orbit.push(x.to_f64().unwrap_or(0.0));
            orbit.push(y.to_f64().unwrap_or(0.0));
            orbit.push(ar.to_f64().unwrap_or(0.0));
            orbit.push(ai.to_f64().unwrap_or(0.0));
            orbit.push(br.to_f64().unwrap_or(0.0));
            orbit.push(bi.to_f64().unwrap_or(0.0));
            orbit.push(cr.to_f64().unwrap_or(0.0));
            orbit.push(ci.to_f64().unwrap_or(0.0));

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

        let pushed_values = orbit.len() / 8;
        let remaining = max_iterations as usize - pushed_values;
        for _ in 0..remaining {
            results.push(x.to_f64().unwrap_or(0.0));
            results.push(y.to_f64().unwrap_or(0.0));
            results.push(ar.to_f64().unwrap_or(0.0));
            results.push(ai.to_f64().unwrap_or(0.0));
            results.push(br.to_f64().unwrap_or(0.0));
            results.push(bi.to_f64().unwrap_or(0.0));
            results.push(cr.to_f64().unwrap_or(0.0));
            results.push(ci.to_f64().unwrap_or(0.0));
        }

        results.push(if cycle_found { 1.0 } else { 0.0 });
        results.push(cycle_der_r.to_f64().unwrap_or(0.0));
        results.push(cycle_der_i.to_f64().unwrap_or(0.0));
        results.push(if escaped { iter as f64 } else { max_iterations as f64 });
        
        // Append absolute tracking metadata to be retrieved cleanly by WebGPU without JS Float parsing
        results.push(p.zr.parse::<f64>().unwrap_or(0.0));
        results.push(p.zi.parse::<f64>().unwrap_or(0.0));
        results.push(p.cr.parse::<f64>().unwrap_or(0.0));
        results.push(p.ci.parse::<f64>().unwrap_or(0.0));
    }

    js_sys::Float64Array::from(&results[..])
}
