use wasm_bindgen::prelude::*;
use bigdecimal::{BigDecimal, Zero, One};
use std::str::FromStr;
use serde::Deserialize;
use bigdecimal::ToPrimitive;

#[derive(Deserialize)]
pub struct Point {
    pub zr: String,
    pub zi: String,
    pub cr: String,
    pub ci: String,
}

#[wasm_bindgen]
pub fn compute_mandelbrot(points_json: &str, max_iterations: u32) -> js_sys::Float64Array {
    let points: Vec<Point> = serde_json::from_str(points_json).unwrap_or_else(|_| vec![]);
    
    // Each point yields: (max_iterations) * 2 floats for the orbit
    // PLUS 4 metadata floats: [cycle_found, der_r, der_i, iter/escape]
    let mut results = Vec::with_capacity(points.len() * ((max_iterations as usize * 2) + 4));

    for p in points {
        let mut x = BigDecimal::from_str(&p.zr).unwrap_or(BigDecimal::zero());
        let mut y = BigDecimal::from_str(&p.zi).unwrap_or(BigDecimal::zero());
        let x0 = BigDecimal::from_str(&p.cr).unwrap_or(BigDecimal::zero());
        let y0 = BigDecimal::from_str(&p.ci).unwrap_or(BigDecimal::zero());

        let mut check_x = x.clone();
        let mut check_y = y.clone();
        let mut check_iter = 1;
        let mut der_r = BigDecimal::one();
        let mut der_i = BigDecimal::zero();

        let mut iter = 0;
        let limit = BigDecimal::from(4);
        let two = BigDecimal::from(2);

        let mut escaped = false;
        let mut cycle_found = false;

        let mut orbit = Vec::with_capacity((max_iterations * 2) as usize);

        while iter < max_iterations {
            orbit.push(x.to_f64().unwrap_or(0.0));
            orbit.push(y.to_f64().unwrap_or(0.0));

            let x2 = &x * &x;
            let y2 = &y * &y;

            if (&x2 + &y2) > limit {
                escaped = true;
                break;
            }

            let temp_der_r = (&two * (&x * &der_r - &y * &der_i) + BigDecimal::one()).with_prec(100); 
            let temp_der_i = (&two * (&x * &der_i + &y * &der_r)).with_prec(100);
            der_r = temp_der_r;
            der_i = temp_der_i;

            let new_x = (&x2 - &y2 + &x0).with_prec(100);
            y = (&two * &x * &y + &y0).with_prec(100);
            x = new_x;

            if x == check_x && y == check_y {
                cycle_found = true;
                break;
            }

            if iter == check_iter {
                check_x = x.clone();
                check_y = y.clone();
                check_iter *= 2;
                der_r = BigDecimal::one();
                der_i = BigDecimal::zero();
            }

            iter += 1;
        }

        for v in orbit.iter() {
            results.push(*v);
        }

        let pushed_pairs = orbit.len() / 2;
        let remaining = max_iterations as usize - pushed_pairs;
        for _ in 0..remaining {
            results.push(x.to_f64().unwrap_or(0.0));
            results.push(y.to_f64().unwrap_or(0.0));
        }

        results.push(if cycle_found { 1.0 } else { 0.0 });
        results.push(der_r.to_f64().unwrap_or(0.0));
        results.push(der_i.to_f64().unwrap_or(0.0));
        results.push(if escaped { iter as f64 } else { max_iterations as f64 });
    }

    js_sys::Float64Array::from(&results[..])
}
