use std::collections::HashMap;
use std::str::FromStr;
use bigdecimal::{BigDecimal, ToPrimitive};
use wasm_bindgen::prelude::*;
use crate::complex::{Complex64, BigComplex};

pub struct ReferenceNode {
    pub id: u32,
    pub center: BigComplex,
    pub exponent: f64,
    pub keyframes: Vec<BigComplex>, 
    pub tick: u64,
}

const KEYFRAME_STRIDE: usize = 1000;

#[wasm_bindgen]
pub struct ReferenceTree {
    nodes: HashMap<u32, ReferenceNode>,
    next_id: u32,
    global_tick: u64,
    capacity: usize,
}

#[wasm_bindgen]
impl ReferenceTree {
    #[wasm_bindgen(constructor)]
    pub fn new() -> ReferenceTree {
        ReferenceTree {
            nodes: HashMap::new(),
            next_id: 1, // 0 is reserved or standard
            global_tick: 0,
            capacity: 16,
        }
    }

    pub fn alloc_node(&mut self, cr: &str, ci: &str, exponent: f64) -> u32 {
        if self.nodes.len() >= self.capacity {
            let mut oldest_id = 0;
            let mut oldest_tick = u64::MAX;
            for (&id, node) in self.nodes.iter() {
                if node.tick < oldest_tick {
                    oldest_tick = node.tick;
                    oldest_id = id;
                }
            }
            if oldest_id != 0 {
                self.nodes.remove(&oldest_id);
            }
        }

        let id = self.next_id;
        self.next_id += 1;
        self.global_tick += 1;
        self.nodes.insert(id, ReferenceNode {
            id,
            center: BigComplex {
                r: BigDecimal::from_str(cr).unwrap_or(bigdecimal::BigDecimal::from(0)),
                i: BigDecimal::from_str(ci).unwrap_or(bigdecimal::BigDecimal::from(0)),
            },
            exponent,
            keyframes: Vec::new(),
            tick: self.global_tick,
        });
        id
    }


}

impl ReferenceTree {
    pub fn transform_delta(
        &mut self,
        from_id: u32,
        to_id: u32,
        delta_r: f64,
        delta_i: f64,
        iter_from: usize,
        iter_to: usize,
    ) -> Complex64 {
        self.global_tick += 1;
        if let Some(to_node) = self.nodes.get_mut(&to_id) {
            to_node.tick = self.global_tick;
        }
        
        let mut diff_r = 0.0;
        let mut diff_i = 0.0;
        let mut valid = false;
        
        if let (Some(from), Some(to)) = (self.nodes.get(&from_id), self.nodes.get(&to_id)) {
            if let (Ok(za), Ok(zb)) = (self.get_z_at(from, iter_from), self.get_z_at(to, iter_to)) {
                // Subtraction in high precision prevents bits dropping
                diff_r = (&za.r - &zb.r).to_f64().unwrap_or(0.0);
                diff_i = (&za.i - &zb.i).to_f64().unwrap_or(0.0);
                valid = true;
            }
        }
        
        if valid {
            return Complex64 {
                r: delta_r + diff_r,
                i: delta_i + diff_i,
            };
        }
        
        Complex64 { r: delta_r, i: delta_i }
    }

    pub fn update_dc(&mut self, pixel_cr: &str, pixel_ci: &str, to_id: u32) -> Complex64 {
        self.global_tick += 1;
        if let Some(to) = self.nodes.get_mut(&to_id) {
            to.tick = self.global_tick;
            
            let p_cr = BigDecimal::from_str(pixel_cr).unwrap_or(bigdecimal::BigDecimal::from(0));
            let p_ci = BigDecimal::from_str(pixel_ci).unwrap_or(bigdecimal::BigDecimal::from(0));

            let diff_r = (&p_cr - &to.center.r).to_f64().unwrap_or(0.0);
            let diff_i = (&p_ci - &to.center.i).to_f64().unwrap_or(0.0);
            return Complex64 {
                r: diff_r,
                i: diff_i,
            };
        }
        Complex64 { r: 0.0, i: 0.0 }
    }

    pub fn find_best_anchor(&mut self, cr: &str, ci: &str, max_radius: f64) -> i32 {
        let p_cr = BigDecimal::from_str(cr).unwrap_or(bigdecimal::BigDecimal::from(0));
        let p_ci = BigDecimal::from_str(ci).unwrap_or(bigdecimal::BigDecimal::from(0));
        
        let mut best_id = -1;
        let mut min_dist_sq = max_radius * max_radius; // Early reject bound

        for (&id, node) in self.nodes.iter() {
            let diff_r = (&p_cr - &node.center.r).to_f64().unwrap_or(f64::MAX);
            let diff_i = (&p_ci - &node.center.i).to_f64().unwrap_or(f64::MAX);
            let dist_sq = diff_r * diff_r + diff_i * diff_i;
            
            if dist_sq < min_dist_sq {
                min_dist_sq = dist_sq;
                best_id = id as i32;
            }
        }

        if best_id >= 0 {
            self.global_tick += 1;
            if let Some(node) = self.nodes.get_mut(&(best_id as u32)) {
                node.tick = self.global_tick;
            }
        }
        
        best_id
    }

    /// Test helper method: Intentionally public for tests/ evaluation
    #[doc(hidden)]
    pub fn push_mock_orbit(&mut self, id: u32, iter: usize, r: &str, i: &str) {
        if let Some(node) = self.nodes.get_mut(&id) {
            if iter % KEYFRAME_STRIDE == 0 {
                node.keyframes.push(BigComplex {
                    r: BigDecimal::from_str(r).unwrap_or(bigdecimal::BigDecimal::from(0)),
                    i: BigDecimal::from_str(i).unwrap_or(bigdecimal::BigDecimal::from(0)),
                });
            }
        }
    }
    
    pub fn push_keyframe(&mut self, id: u32, x: &BigDecimal, y: &BigDecimal) {
        if let Some(node) = self.nodes.get_mut(&id) {
            node.keyframes.push(BigComplex {
                r: x.clone(),
                i: y.clone(),
            });
        }
    }

    pub(crate) fn get_z_at(&self, node: &ReferenceNode, target_iter: usize) -> Result<BigComplex, String> {
        let kf_index = target_iter / KEYFRAME_STRIDE;
        if kf_index >= node.keyframes.len() {
            return Err("Iteration out of cached bounds".to_string());
        }
        
        let start_kf = &node.keyframes[kf_index];
        let mut x = start_kf.r.clone();
        let mut y = start_kf.i.clone();
        let c_r = &node.center.r;
        let c_i = &node.center.i;
        let d = node.exponent;
        
        let steps = target_iter % KEYFRAME_STRIDE;
        let two = BigDecimal::from(2);
        
        for _ in 0..steps {
            if d == 2.0 {
                let new_x = (&x * &x - &y * &y + c_r).with_prec(100);
                y = (&two * &x * &y + c_i).with_prec(100);
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
                x = (temp_x + c_r).with_prec(100);
                y = (temp_y + c_i).with_prec(100);
            } else {
                use bigdecimal::FromPrimitive;
                let x_f = x.to_f64().unwrap_or(0.0);
                let y_f = y.to_f64().unwrap_or(0.0);
                let r = (x_f * x_f + y_f * y_f).sqrt();
                let th = y_f.atan2(x_f);
                let r_pow = r.powf(d);
                let new_x_f = r_pow * (d * th).cos();
                let new_y_f = r_pow * (d * th).sin();
                
                if let (Some(bd_x), Some(bd_y)) = (BigDecimal::from_f64(new_x_f), BigDecimal::from_f64(new_y_f)) {
                    x = (bd_x + c_r).with_prec(100);
                    y = (bd_y + c_i).with_prec(100);
                } else {
                    return Err("Failed to step fractional exponent".to_string());
                }
            }
        }
        
        Ok(BigComplex { r: x, i: y })
    }

    pub(crate) fn get_node_info(&self, id: u32) -> Option<(String, String, f64)> {
        self.nodes.get(&id).map(|n| (n.center.r.to_string(), n.center.i.to_string(), n.exponent))
    }
}

