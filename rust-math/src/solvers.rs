use bigdecimal::{BigDecimal, Zero, FromPrimitive};
use std::str::FromStr;
use bigdecimal::ToPrimitive;
use crate::complex::BigComplex;

pub struct RefineOutput {
    pub cr: f64,
    pub ci: f64,
    pub ref_type: String,
    pub period: u32,
    pub pre_period: u32,
}

pub fn refine_reference(cr_str: &str, ci_str: &str, max_iterations: u32) -> RefineOutput {
    let mut c = BigComplex::new(
        BigDecimal::from_str(cr_str).unwrap_or(BigDecimal::zero()),
        BigDecimal::from_str(ci_str).unwrap_or(BigDecimal::zero()),
    );

    let limit = BigDecimal::from(4);
    let mut path = Vec::with_capacity(max_iterations as usize + 1);
    path.push(BigComplex::zero());

    let mut found_type = "unknown".to_string();
    let mut out_period = 0;
    let mut out_pre_period = 0;

    let epsilon = BigDecimal::from_f64(1e-4).unwrap();
    let epsilon_sq = (&epsilon * &epsilon).with_prec(100);
    
    for i in 1..=max_iterations {
        let z = &path[i as usize - 1];
        if z.norm_sq() > limit {
            break;
        }

        let next_z = &(&(z * z) + &c);

        let mut mis_found = false;
        for k in 0..(i - 1) {
            let diff = &(next_z - &path[k as usize]);
            if diff.norm_sq() < epsilon_sq {
                out_period = i - k;
                out_pre_period = k;
                
                let mut min_mag_sq = BigDecimal::from_f64(f64::MAX).unwrap();
                for c_idx in k..i {
                    let c_mag_sq = path[c_idx as usize].norm_sq();
                    if c_mag_sq < min_mag_sq {
                        min_mag_sq = c_mag_sq;
                    }
                }
                
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

        path.push(next_z.clone());

        if mis_found {
            break;
        }
    }

    if found_type == "nucleus" {
        for _ in 0..20 {
            let mut z = BigComplex::zero();
            let mut z_der = BigComplex::zero();

            for _ in 0..out_period {
                let new_z_der = &(&(&BigComplex::two() * &z) * &z_der) + &BigComplex::one();
                let new_z = &(&z * &z) + &c;
                z_der = new_z_der;
                z = new_z;
            }

            if z_der.norm_sq() == BigDecimal::zero() {
                break;
            }

            c = &c - &(&z / &z_der);
            
            if z.norm_sq() < epsilon_sq {
                break;
            }
        }
    } else if found_type == "misiurewicz" {
        for _ in 0..20 {
            let mut z = vec![BigComplex::zero(); (out_pre_period + out_period + 1) as usize];
            let mut z_der = vec![BigComplex::zero(); (out_pre_period + out_period + 1) as usize];

            for j in 0..(out_pre_period + out_period) {
                let idx = j as usize;
                z_der[idx + 1] = &(&(&BigComplex::two() * &z[idx]) * &z_der[idx]) + &BigComplex::one();
                z[idx + 1] = &(&z[idx] * &z[idx]) + &c;
            }

            let pk = out_pre_period as usize;
            let pkp = (out_pre_period + out_period) as usize;

            let g = &z[pkp] - &z[pk];
            let g_der = &z_der[pkp] - &z_der[pk];
            
            let mut h = BigComplex::one();
            let mut h_sum_der = BigComplex::zero();

            for i in 0..pk {
                let diff = &z[i + out_period as usize] - &z[i];
                let diff_der = &z_der[i + out_period as usize] - &z_der[i];

                h = &h * &diff;

                if diff.norm_sq() != BigDecimal::zero() {
                    h_sum_der = &h_sum_der + &(&diff_der / &diff);
                }
            }

            let h_der = &h * &h_sum_der;

            if h.norm_sq() == BigDecimal::zero() {
                break;
            }
            let f = &g / &h;
            let f_der = &(&(&g_der * &h) - &(&g * &h_der)) / &(&h * &h);

            if f_der.norm_sq() == BigDecimal::zero() {
                break;
            }

            c = &c - &(&f / &f_der);
        }
    }

    RefineOutput {
        cr: c.r.to_f64().unwrap_or(0.0),
        ci: c.i.to_f64().unwrap_or(0.0),
        ref_type: found_type,
        period: out_period,
        pre_period: out_pre_period,
    }
}
