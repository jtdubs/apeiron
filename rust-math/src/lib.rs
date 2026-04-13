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
        let x0 = BigDecimal::from_str(&p.x).unwrap_or(BigDecimal::from(0));
        let y0 = BigDecimal::from_str(&p.y).unwrap_or(BigDecimal::from(0));

        let mut x = BigDecimal::from(0);
        let mut y = BigDecimal::from(0);

        let mut iter = 0;
        let limit = BigDecimal::from(4);

        while iter < max_iterations {
            let x2 = x.clone() * x.clone();
            let y2 = y.clone() * y.clone();

            if x2.clone() + y2.clone() > limit {
                break;
            }

            let new_x = x2 - y2 + x0.clone();
            y = BigDecimal::from(2) * x * y + y0.clone();
            x = new_x;

            iter += 1;
        }

        results.push(iter as f32);
        results.push(if iter < max_iterations { 1.0 } else { 0.0 });
    }

    js_sys::Float32Array::from(&results[..])
}
