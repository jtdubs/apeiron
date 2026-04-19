struct BlaResult {
  dz: vec2<f32>,
  der: vec2<f32>,
  iter: f32,
  prev_z_mag: f32,
  escaped: bool,
  escape_data: vec4<f32>,
  advanced: bool
}

struct BlaResultDs {
  dz: vec4<f32>,
  der: vec2<f32>,
  iter: f32,
  prev_z_mag: f32,
  escaped: bool,
  escape_data: vec4<f32>,
  advanced: bool
}

// ==========================================
// BIVARIATE LINEAR APPROXIMATION (BLA)
// ==========================================
// When Series Approximation reaches edge error limits, BLA accelerates arbitrary iteration leaps.
// Instead of evaluating individual iterations, we utilize a pre-computed recursive tree of matrices
// (stored in `ref_orbits` layout) to exponentially cross spatial checkpoints (up to 2^15 layers) 
// rapidly skipping thousands of sequential geometric iterations in just a few matrix operations.
fn advance_via_bla(dz_in: vec2<f32>, der_in: vec2<f32>, delta_c: vec2<f32>, start_c: vec2<f32>, iter_in: f32, target_iter: f32, ref_escaped_iter: f32, max_iterations: f32, pixel_idx: u32, tia_sum: f32) -> BlaResult {
    var dz = dz_in;
    var der = der_in;
    var iter = iter_in;
    var advanced_by_bla = false;
    let dz_len_sq = dz.x * dz.x + dz.y * dz.y;
    let dc_len_sq = delta_c.x * delta_c.x + delta_c.y * delta_c.y;
    var prev_z_mag = 0.0;
    
    if (dz_len_sq < 1e-6 && dc_len_sq < 1e-6) {
        for(var l_: i32 = 15; l_ >= 0; l_ -= 1) {
            let l = u32(l_);
            let b_len = f32(1u << l);
            
            if ((iter + b_len) <= target_iter && (iter + b_len) <= camera.ref_max_iter && (iter + b_len) < ref_escaped_iter) {
                let bta_node = get_bta_node(u32(iter), l);
                let target_err = bta_node.err;
                
                if (target_err < 1e20) {
                    let max_delta_sq = max(dz_len_sq, dc_len_sq);
                    let err_factor = target_err * max_delta_sq;
                    
                    // Linearity Check: EL * max(|dz|^2, |dc|^2) < tolerance
                    let pixel_size = camera.scale / camera.canvas_width;
                    var tol_floor = 1e-7;
                    if (math_compute_mode == 2u) { tol_floor = 1e-15; }
                    let static_tolerance = max(tol_floor, pixel_size * 0.1);
                    
                    if (err_factor < static_tolerance) {
                        let dz02 = complex_sq(dz);
                        let dz0dc = complex_mul(dz, delta_c);
                        let dc2 = complex_sq(delta_c);

                        let a_dz = complex_mul(vec2<f32>(bta_node.ar, bta_node.ai), dz);
                        let b_dc = complex_mul(vec2<f32>(bta_node.br, bta_node.bi), delta_c);
                        let c_dz02 = complex_mul(vec2<f32>(bta_node.cr, bta_node.ci), dz02);
                        let d_dz0dc = complex_mul(vec2<f32>(bta_node.dr, bta_node.di), dz0dc);
                        let e_dc2 = complex_mul(vec2<f32>(bta_node.er, bta_node.ei), dc2);
                        
                        let linear_term = complex_add(a_dz, b_dc);
                        let quad_term = complex_add(complex_add(c_dz02, d_dz0dc), e_dc2);

                        // Health check / glitch detection using relative magnitude
                        let quad_mag = quad_term.x * quad_term.x + quad_term.y * quad_term.y;
                        let linear_mag = linear_term.x * linear_term.x + linear_term.y * linear_term.y;
                        
                        // Terminate skip if quadratic term introduces an error larger than tolerance
                        if (quad_mag > 1e-14 * linear_mag) {
                            continue;
                        }

                        let potential_dz = complex_add(linear_term, quad_term);
                        
                        let target_node = get_orbit_node(u32(iter + b_len));
                        
                        // Proxy Collapse Prevention (Zhuoran Test)
                        let curr_z_x = target_node.x + potential_dz.x;
                        let curr_z_y = target_node.y + potential_dz.y;
                        let curr_mag = curr_z_x * curr_z_x + curr_z_y * curr_z_y;
                        
                        let potential_dz_len = potential_dz.x * potential_dz.x + potential_dz.y * potential_dz.y;
                        
                        if ((iter + b_len) > 2.0 && curr_mag < potential_dz_len) {
                           continue;
                        }
                        
                        dz = potential_dz;
                        
                        let new_der = complex_mul(vec2<f32>(bta_node.ar, bta_node.ai), der);
                        var new_der_x = new_der.x;
                        var new_der_y = new_der.y;
                        
                        let der_max = max(abs(new_der_x), abs(new_der_y));
                        if (der_max > 1e18) {
                            let scale = 1e18 / der_max;
                            der.x = new_der_x * scale;
                            der.y = new_der_y * scale;
                        } else {
                            der.x = new_der_x;
                            der.y = new_der_y;
                        }
                        
                        iter += b_len;
                        advanced_by_bla = true;
                        
                        let final_node = get_orbit_node(u32(iter));
                        prev_z_mag = length(vec2<f32>(final_node.x + dz.x, final_node.y + dz.y));
                        break;
                    }
                }
            }
        }
    }
    
    if (advanced_by_bla) {
        let cur_mag = dz.x * dz.x + dz.y * dz.y;
        if (cur_mag > 1000000.0) {
            let ref_final_node = get_orbit_node(u32(iter));
            let final_x = ref_final_node.x + dz.x;
            let final_y = ref_final_node.y + dz.y;
            let ret = get_escape_data(iter, final_x, final_y, der.x, der.y, 0.0, tia_sum);
            checkpoint[pixel_idx] = CheckpointState(ret.x, ret.y, ret.z, ret.w, -1.0, 0.0);
            return BlaResult(dz, der, iter, prev_z_mag, true, ret, true);
        }
        let ref_final_node = get_orbit_node(u32(iter));
        let final_x = ref_final_node.x + dz.x;
        let final_y = ref_final_node.y + dz.y;
        let point_mag = final_x * final_x + final_y * final_y;
        
        if (point_mag > 4.0) {
            let ret = get_escape_data(iter, final_x, final_y, der.x, der.y, 0.0, tia_sum);
            checkpoint[pixel_idx] = CheckpointState(ret.x, ret.y, ret.z, ret.w, -1.0, 0.0);
            return BlaResult(dz, der, iter, prev_z_mag, true, ret, true);
        }
        
        if (iter >= ref_escaped_iter && ref_escaped_iter < max_iterations) {
            let cur_node = get_orbit_node(u32(iter));
            let ret = continue_mandelbrot_iterations(vec2<f32>(cur_node.x + dz.x, cur_node.y + dz.y), start_c, iter, max_iterations, der.x, der.y, tia_sum, pixel_idx, false);
            return BlaResult(dz, der, iter, prev_z_mag, true, ret, true);
        }
        
        return BlaResult(dz, der, iter, prev_z_mag, false, vec4<f32>(0.0), true);
    }
    
    return BlaResult(dz, der, iter, prev_z_mag, false, vec4<f32>(0.0), false);
}

fn advance_via_bla_ds(dz_in: vec4<f32>, der_in: vec2<f32>, delta_c: vec4<f32>, start_c: vec2<f32>, iter_in: f32, target_iter: f32, ref_escaped_iter: f32, max_iterations: f32, pixel_idx: u32, tia_sum: f32) -> BlaResultDs {
    var dz = dz_in; // vec4<f32>
    var dz_f32 = vec2<f32>(dz.x, dz.z);
    let delta_c_f32 = vec2<f32>(delta_c.x, delta_c.z);
    var der = der_in;
    var iter = iter_in;
    var advanced_by_bla = false;
    let dz_len_sq = dz.x * dz.x + dz.z * dz.z; // High part only for checks
    let dc_len_sq = delta_c.x * delta_c.x + delta_c.z * delta_c.z; // High part only for checks
    var prev_z_mag = 0.0;
    
    if (dz_len_sq < 1e-6 && dc_len_sq < 1e-6) {
        for(var l_: i32 = 15; l_ >= 0; l_ -= 1) {
            let l = u32(l_);
            let b_len = f32(1u << l);
            
            if ((iter + b_len) <= target_iter && (iter + b_len) <= camera.ref_max_iter && (iter + b_len) < ref_escaped_iter) {
                let bn = get_dsbla_node(u32(iter), l);
                let target_err = bn.err;
                
                if (target_err < 1e20) {
                    let max_delta_sq = max(dz_len_sq, dc_len_sq);
                    let err_factor = target_err * max_delta_sq;
                    
                    // Linearity Check: EL * max(|dz|^2, |dc|^2) < tolerance
                    // Stricter tolerance for Double-Single Math
                    let pixel_size = camera.scale / camera.canvas_width;
                    let static_tolerance = max(1e-14, pixel_size * 0.1);
                    
                    if (err_factor < static_tolerance) {
                        let a_ds = vec4<f32>(bn.ar_hi, bn.ar_lo, bn.ai_hi, bn.ai_lo);
                        let b_ds = vec4<f32>(bn.br_hi, bn.br_lo, bn.bi_hi, bn.bi_lo);
                        
                        let a_dz = complex_mul_ds(a_ds, dz);
                        let b_dc = complex_mul_ds(b_ds, delta_c);
                        let potential_dz = complex_add_ds(a_dz, b_dc);
                        let potential_dz_f32 = vec2<f32>(potential_dz.x, potential_dz.z);
                        
                        let target_node = get_orbit_node(u32(iter + b_len));
                        
                        // Proxy Collapse Prevention (Zhuoran Test) using High precision components
                        let curr_z_x = target_node.x + potential_dz.x;
                        let curr_z_y = target_node.y + potential_dz.z;
                        let curr_mag = curr_z_x * curr_z_x + curr_z_y * curr_z_y;
                        
                        let potential_dz_len = potential_dz.x * potential_dz.x + potential_dz.z * potential_dz.z;
                        
                        if ((iter + b_len) > 2.0 && curr_mag < potential_dz_len) {
                           continue;
                        }
                        
                        dz = potential_dz;
                        dz_f32 = potential_dz_f32;
                        
                        let new_der = complex_mul(vec2<f32>(bn.ar_hi, bn.ai_hi), der);
                        var new_der_x = new_der.x;
                        var new_der_y = new_der.y;
                        
                        let der_max = max(abs(new_der_x), abs(new_der_y));
                        if (der_max > 1e18) {
                            let scale = 1e18 / der_max;
                            der.x = new_der_x * scale;
                            der.y = new_der_y * scale;
                        } else {
                            der.x = new_der_x;
                            der.y = new_der_y;
                        }
                        
                        iter += b_len;
                        advanced_by_bla = true;
                        
                        let final_node = get_orbit_node(u32(iter));
                        prev_z_mag = length(vec2<f32>(final_node.x + dz.x, final_node.y + dz.z));
                        break;
                    }
                }
            }
        }
    }
    
    if (advanced_by_bla) {
        let cur_mag = dz_f32.x * dz_f32.x + dz_f32.y * dz_f32.y;
        if (cur_mag > 1000000.0) {
            let ref_final_node = get_orbit_node(u32(iter));
            let final_x = ref_final_node.x + dz_f32.x;
            let final_y = ref_final_node.y + dz_f32.y;
            let ret = get_escape_data(iter, final_x, final_y, der.x, der.y, 0.0, tia_sum);
            checkpoint[pixel_idx] = CheckpointState(ret.x, ret.y, ret.z, ret.w, -1.0, 0.0);
            return BlaResultDs(dz, der, iter, prev_z_mag, true, ret, true);
        }
        let ref_final_node = get_orbit_node(u32(iter));
        let final_x = ref_final_node.x + dz_f32.x;
        let final_y = ref_final_node.y + dz_f32.y;
        let point_mag = final_x * final_x + final_y * final_y;
        
        if (point_mag > 4.0) {
            let ret = get_escape_data(iter, final_x, final_y, der.x, der.y, 0.0, tia_sum);
            checkpoint[pixel_idx] = CheckpointState(ret.x, ret.y, ret.z, ret.w, -1.0, 0.0);
            return BlaResultDs(dz, der, iter, prev_z_mag, true, ret, true);
        }
        
        if (iter >= ref_escaped_iter && ref_escaped_iter < max_iterations) {
            let cur_node = get_orbit_node(u32(iter));
            let ret = continue_mandelbrot_iterations(vec2<f32>(cur_node.x + dz_f32.x, cur_node.y + dz_f32.y), start_c, iter, max_iterations, der.x, der.y, tia_sum, pixel_idx, false);
            return BlaResultDs(dz, der, iter, prev_z_mag, true, ret, true);
        }
        
        return BlaResultDs(dz, der, iter, prev_z_mag, false, vec4<f32>(0.0), true);
    }
    
    return BlaResultDs(dz, der, iter, prev_z_mag, false, vec4<f32>(0.0), false);
}

