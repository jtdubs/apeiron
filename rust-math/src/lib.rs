use wasm_bindgen::prelude::*;
use bigdecimal::BigDecimal;
use std::str::FromStr;
use serde::Deserialize;

#[derive(Deserialize)]
pub struct Point {
    pub x: String,
    pub y: String,
}

#[wasm_bindgen]
pub fn compute_mandelbrot(points_json: &str, max_iterations: u32) -> js_sys::Float32Array {
    let points: Vec<Point> = serde_json::from_str(points_json).unwrap_or_else(|_| vec![]);
    let mut results = Vec::with_capacity(points.len() * 2);

    for p in points {
        let x0: f64 = p.x.parse().unwrap_or(0.0);
        let y0: f64 = p.y.parse().unwrap_or(0.0);

        let mut x = 0.0;
        let mut y = 0.0;

        let mut iter = 0;
        let limit = 4.0;

        while iter < max_iterations {
            let x2 = x * x;
            let y2 = y * y;

            if x2 + y2 > limit {
                let log_z: f64 = 0.5 * f64::ln(x2 + y2);
                let smooth_iter: f64 = (iter as f64) + 1.0 - f64::log2(log_z);
                // We use float array as output, so we can replace iter entirely with smoothed value for testing!
                results.push(smooth_iter as f32);
                results.push(1.0);
                break;
            }

            let new_x = x2 - y2 + x0;
            y = 2.0 * x * y + y0;
            x = new_x;

            iter += 1;
        }

        if iter == max_iterations {
            results.push(iter as f32);
            results.push(0.0);
        }
    }

    js_sys::Float32Array::from(&results[..])
}
