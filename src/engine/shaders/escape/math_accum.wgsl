// #import "./generated/layout.wgsl"
// #import "./generated/layout_accessors.wgsl"

struct CheckpointState {
  zx: f32, zy: f32,
  der_x: f32, der_y: f32,
  iter: f32, tia_sum: f32,
  dz_x: f32, dz_y: f32,
};

@group(0) @binding(0) var<uniform> camera: CameraParams;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

fn complex_mul(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
  return vec2<f32>(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

fn get_escape_data(iter: f32, zx: f32, zy: f32, der_x: f32, der_y: f32, offset: f32, tia_sum: f32) -> vec4<f32> {
  let mag_sq = zx * zx + zy * zy;
  let log_z = 0.5 * log(mag_sq);
  let p = max(camera.exponent, 2.0);
  let smooth_iter = iter + offset - log2(log_z) / log2(p);
  
  let mag = sqrt(mag_sq);
  let der_mag = sqrt(der_x * der_x + der_y * der_y);
  var de = 0.0;
  var nx = 0.0;
  var ny = 0.0;
  if (der_mag > 0.0) {
      // Normalize mathematical distance into scale-invariant screen-space distance
      de = (0.5 * log(mag) * mag / der_mag) / camera.scale;
      let nx_norm = (zx * der_x + zy * der_y) / (der_mag * der_mag);
      let ny_norm = (zy * der_x - zx * der_y) / (der_mag * der_mag);
      let len_n = sqrt(nx_norm * nx_norm + ny_norm * ny_norm);
      if (len_n > 0.0) {
          nx = nx_norm / len_n;
          ny = ny_norm / len_n;
      }
  }
  
  var ret_x = smooth_iter;
  if (camera.coloring_mode > 0.5) {
     let exact_iter = max(1.0, iter + offset);
     ret_x = tia_sum / exact_iter;
  }
  return vec4<f32>(ret_x, de, nx, ny);
}

fn is_interior_analytic(cr: f32, ci: f32) -> bool {
  let q = (cr - 0.25) * (cr - 0.25) + ci * ci;
  if (q * (q + (cr - 0.25)) < 0.25 * ci * ci) { return true; } // cardioid
  let br = cr + 1.0;
  if (br * br + ci * ci < 0.0625) { return true; }             // period-2 bulb
  return false;
}

fn continue_mandelbrot_iterations(start_z: vec2<f32>, start_c: vec2<f32>, start_iter: f32, max_iterations: f32, start_der_x: f32, start_der_y: f32, start_tia: f32, pixel_idx: u32) -> vec4<f32> {
  var x = start_z.x;
  var y = start_z.y;
  var der_x = start_der_x;
  var der_y = start_der_y;
  var iter = start_iter;
  var tia_sum = start_tia;
  
  if (camera.is_resume > 0.5 && checkpoint[pixel_idx].iter > 0.0) {
    x = checkpoint[pixel_idx].zx;
    y = checkpoint[pixel_idx].zy;
    der_x = checkpoint[pixel_idx].der_x;
    der_y = checkpoint[pixel_idx].der_y;
    iter = checkpoint[pixel_idx].iter;
    tia_sum = checkpoint[pixel_idx].tia_sum;
  }
  
  let target_iter = min(max_iterations, iter + camera.yield_iter_limit);
  let d = camera.exponent;
  var prev_z_mag = length(vec2<f32>(x, y));
  let c_mag = length(start_c);
  
  var check_z = vec2<f32>(x, y);
  var check_lam: f32 = 1.0;
  var check_mu: f32 = 1.0;

  while (iter < target_iter) {
    let mag_sq = x * x + y * y;
    if (!(mag_sq <= 4.0)) {
      let ret = get_escape_data(iter, x, y, der_x, der_y, 1.0, tia_sum);
      checkpoint[pixel_idx] = CheckpointState(ret.x, ret.y, ret.z, ret.w, -1.0, 0.0, 0.0, 0.0);
      return ret;
    }
    
    var new_x: f32;
    var new_y: f32;
    var new_der_x = 1.0;
    var new_der_y = 0.0;
    
    if (d == 2.0) {
      new_x = x * x - y * y + start_c.x;
      new_y = 2.0 * x * y + start_c.y;
      new_der_x = 2.0 * (x * der_x - y * der_y) + 1.0;
      new_der_y = 2.0 * (x * der_y + y * der_x);
    } else if (d == floor(d) && d > 1.0) {
      var z_temp = vec2<f32>(x, y);
      let z_orig = z_temp;
      for(var i: f32 = 1.0; i < d; i += 1.0) {
         z_temp = complex_mul(z_temp, z_orig);
      }
      new_x = z_temp.x + start_c.x;
      new_y = z_temp.y + start_c.y;
      
      let r = length(z_orig);
      let th = atan2(z_orig.y, z_orig.x);
      let r_pow_dm1 = d * pow(r, d - 1.0);
      let dx_z = r_pow_dm1 * cos((d - 1.0) * th);
      let dy_z = r_pow_dm1 * sin((d - 1.0) * th);
      new_der_x = dx_z * der_x - dy_z * der_y + 1.0;
      new_der_y = dx_z * der_y + dy_z * der_x;
    } else {
      let r = length(vec2<f32>(x, y));
      let th = atan2(y, x);
      let r_pow = pow(r, d);
      new_x = r_pow * cos(d * th) + start_c.x;
      new_y = r_pow * sin(d * th) + start_c.y;
      
      let r_pow_dm1 = d * pow(r, d - 1.0);
      let dx_z = r_pow_dm1 * cos((d - 1.0) * th);
      let dy_z = r_pow_dm1 * sin((d - 1.0) * th);
      new_der_x = dx_z * der_x - dy_z * der_y + 1.0;
      new_der_y = dx_z * der_y + dy_z * der_x;
    }
    
    let cur_z_mag = length(vec2<f32>(new_x, new_y));
    let n_mag = pow(prev_z_mag, d);
    let den = n_mag + c_mag - abs(n_mag - c_mag);
    if (den > 0.0) {
       tia_sum += (cur_z_mag - abs(n_mag - c_mag)) / den;
    }
    prev_z_mag = cur_z_mag;
    
    let new_der_max = max(abs(new_der_x), abs(new_der_y));
    if (new_der_max > 1e18) {
       let scale = 1e18 / new_der_max;
       new_der_x *= scale;
       new_der_y *= scale;
    }
    
    x = new_x;
    y = new_y;
    der_x = new_der_x;
    der_y = new_der_y;
    iter += 1.0;
    
    let dz = vec2<f32>(x - check_z.x, y - check_z.y);
    if (dot(dz, dz) < 1e-20) {
      let ret = vec4<f32>(max_iterations, 0.0, 0.0, 0.0);
      checkpoint[pixel_idx] = CheckpointState(ret.x, ret.y, ret.z, ret.w, -1.0, 0.0, 0.0, 0.0);
      return ret;
    }
    
    check_mu -= 1.0;
    if (check_mu == 0.0) {
      check_z = vec2<f32>(x, y);
      check_lam *= 2.0;
      check_mu = check_lam;
    }
  }
  
  if (iter >= max_iterations) {
      let ret = vec4<f32>(max_iterations, 0.0, 0.0, 0.0);
      checkpoint[pixel_idx] = CheckpointState(ret.x, ret.y, ret.z, ret.w, -1.0, 0.0, 0.0, 0.0);
      return ret;
  }
  
  checkpoint[pixel_idx] = CheckpointState(x, y, der_x, der_y, iter, tia_sum, 0.0, 0.0);
  return vec4<f32>(-2.0, 0.0, 0.0, 0.0); // Sentinel
}

fn calculate_mandelbrot_iterations(start_z: vec2<f32>, start_c: vec2<f32>, max_iterations: f32, pixel_idx: u32) -> vec4<f32> {
  if (camera.exponent == 2.0 && start_z.x == 0.0 && start_z.y == 0.0) {
    if (is_interior_analytic(start_c.x, start_c.y)) {
      let ret = vec4<f32>(max_iterations, 0.0, 0.0, 0.0);
      checkpoint[pixel_idx] = CheckpointState(ret.x, ret.y, ret.z, ret.w, -1.0, 0.0, 0.0, 0.0);
      return ret;
    }
  }
  return continue_mandelbrot_iterations(start_z, start_c, 0.0, max_iterations, 1.0, 0.0, 0.0, pixel_idx);
}

@group(0) @binding(1) var<storage, read> data_in: array<f32>;
@group(0) @binding(2) var<storage, read_write> data_out: array<f32>;
@group(0) @binding(3) var<storage, read> ref_orbits: array<vec2<u32>>;
@group(0) @binding(4) var readTex: texture_2d<f32>;
@group(0) @binding(5) var<storage, read_write> checkpoint: array<CheckpointState>;

fn unpack_f64_to_f32(raw: vec2<u32>) -> f32 {
    let low = raw.x;
    let high = raw.y;
    let sign = select(1.0, -1.0, (high & 0x80000000u) != 0u);
    let exp_raw = (high >> 20u) & 0x7FFu;
    if (exp_raw == 0u) {
        if ((high & 0xFFFFFu) == 0u && low == 0u) { return 0.0; }
        return 0.0;
    }
    let exp = f32(i32(exp_raw) - 1023);
    let mantissa_high = f32(high & 0xFFFFFu) / 1048576.0; // 2^20
    let mantissa_low = f32(low) / 4503599627370496.0; // 2^52
    let mantissa = 1.0 + mantissa_high + mantissa_low;
    return sign * mantissa * exp2(exp);
}

fn calculate_perturbation(start_z: vec2<f32>, start_c: vec2<f32>, delta_z: vec2<f32>, delta_c: vec2<f32>, ref_offset: u32, max_iterations: f32, ref_cycle: f32, ref_escaped_iter: f32, pixel_idx: u32) -> vec4<f32> {
  if (ref_cycle == 1.0 && delta_c.x == 0.0 && delta_c.y == 0.0 && delta_z.x == 0.0 && delta_z.y == 0.0) {
     let ret = vec4<f32>(max_iterations, 0.0, 0.0, 0.0);
      checkpoint[pixel_idx] = CheckpointState(ret.x, ret.y, ret.z, ret.w, -1.0, 0.0, 0.0, 0.0);
      return ret;
  }
  
  var dz = delta_z;
  var iter = 0.0;
  var der_x = 1.0;
  var der_y = 0.0;
  var prev_z_mag = 0.0;
  var tia_sum = 0.0;
  
  if (camera.is_resume > 0.5 && checkpoint[pixel_idx].iter > 0.0) {
     dz.x = checkpoint[pixel_idx].dz_x;
     dz.y = checkpoint[pixel_idx].dz_y;
     iter = checkpoint[pixel_idx].iter;
     der_x = checkpoint[pixel_idx].der_x;
     der_y = checkpoint[pixel_idx].der_y;
     tia_sum = checkpoint[pixel_idx].tia_sum;
     
     let node = get_orbit_node(ref_offset + u32(iter) * ORBIT_STRIDE);
     let initial_x_resume = node.x + dz.x;
     let initial_y_resume = node.y + dz.y;
     prev_z_mag = length(vec2<f32>(initial_x_resume, initial_y_resume));
  } else if (camera.skip_iter > 0.0) {
      iter = camera.skip_iter;
      let skip = u32(iter);
      
      let node = get_orbit_node(ref_offset + skip * ORBIT_STRIDE);
      let ar = node.ar;
      let ai = node.ai;
      let br = node.br;
      let bi = node.bi;
      let cr = node.cr;
      let ci = node.ci;
      
      let dcx = delta_c.x;
      let dcy = delta_c.y;
      
      let a_dc_x = ar * dcx - ai * dcy;
      let a_dc_y = ar * dcy + ai * dcx;
      
      let dc2_x = dcx * dcx - dcy * dcy;
      let dc2_y = 2.0 * dcx * dcy;
      
      let b_dc2_x = br * dc2_x - bi * dc2_y;
      let b_dc2_y = br * dc2_y + bi * dc2_x;
      
      let dc3_x = dc2_x * dcx - dc2_y * dcy;
      let dc3_y = dc2_x * dcy + dc2_y * dcx;
      
      let c_dc3_x = cr * dc3_x - ci * dc3_y;
      let c_dc3_y = cr * dc3_y + ci * dc3_x;
      
      dz = vec2<f32>(a_dc_x + b_dc2_x + c_dc3_x, a_dc_y + b_dc2_y + c_dc3_y);
      
      der_x = ar;
      der_y = ai;
      
      let initial_x = node.x + dz.x;
      let initial_y = node.y + dz.y;
      prev_z_mag = length(vec2<f32>(initial_x, initial_y));
      
      if (initial_x * initial_x + initial_y * initial_y > 4.0) {
         let ret = get_escape_data(iter, initial_x, initial_y, der_x, der_y, 1.0, tia_sum);
         checkpoint[pixel_idx] = CheckpointState(ret.x, ret.y, ret.z, ret.w, -1.0, 0.0, 0.0, 0.0);
         return ret;
      }
  } else {
     let node = get_orbit_node(ref_offset);
     let initial_x = node.x + dz.x;
     let initial_y = node.y + dz.y;
     prev_z_mag = length(vec2<f32>(initial_x, initial_y));
     if (!(initial_x * initial_x + initial_y * initial_y <= 4.0)) {
        let ret = get_escape_data(iter, initial_x, initial_y, der_x, der_y, 1.0, tia_sum);
        checkpoint[pixel_idx] = CheckpointState(ret.x, ret.y, ret.z, ret.w, -1.0, 0.0, 0.0, 0.0);
        return ret;
     }
  }

  let c_mag = length(start_c);
  let target_iter = min(max_iterations, iter + camera.yield_iter_limit);

  while (iter < target_iter) {
    if (camera.exponent == 2.0) {
        var advanced_by_bla = false;
        let bla_offset = ref_offset + u32(camera.ref_max_iter) * ORBIT_STRIDE + META_STRIDE;
        let dz_len_sq = dz.x * dz.x + dz.y * dz.y;
        let dc_len_sq = delta_c.x * delta_c.x + delta_c.y * delta_c.y;
        
        if (dz_len_sq < 1e-6 && dc_len_sq < 1e-6) {
            for(var l_: i32 = 15; l_ >= 0; l_ -= 1) {
               let l = u32(l_);
           let b_len = f32(1u << l);
           
           if ((iter + b_len) <= target_iter && (iter + b_len) <= camera.ref_max_iter && (iter + b_len) < ref_escaped_iter) {
              let bla_node = get_bla_node(bla_offset, u32(iter), l);
              let target_err = bla_node.err;
              
              if (target_err < 1e20) {
                  let max_delta_sq = max(dz_len_sq, delta_c.x * delta_c.x + delta_c.y * delta_c.y);
                  let err_factor = target_err * max_delta_sq;
                  if (err_factor < 1e-9) {
                     let ar = bla_node.ar;
                     let ai = bla_node.ai;
                     let br = bla_node.br;
                     let bi = bla_node.bi;
                     
                     let a_dz_x = ar * dz.x - ai * dz.y;
                     let a_dz_y = ar * dz.y + ai * dz.x;
                     let b_dc_x = br * delta_c.x - bi * delta_c.y;
                     let b_dc_y = br * delta_c.y + bi * delta_c.x;
                     dz = vec2<f32>(a_dz_x + b_dc_x, a_dz_y + b_dc_y);
                     
                     let new_der_x = ar * der_x - ai * der_y;
                     let new_der_y = ar * der_y + ai * der_x;
                     // re-normalize derivative limits smoothly to prevent overflow
                     let der_max = max(abs(new_der_x), abs(new_der_y));
                     if (der_max > 1e18) {
                        let scale = 1e18 / der_max;
                        der_x = new_der_x * scale;
                        der_y = new_der_y * scale;
                     } else {
                        der_x = new_der_x;
                        der_y = new_der_y;
                     }
                     
                     iter += b_len;
                     advanced_by_bla = true;
                     
                     let final_node = get_orbit_node(ref_offset + u32(iter) * ORBIT_STRIDE);
                     let final_z_x = final_node.x + dz.x;
                     let final_z_y = final_node.y + dz.y;
                     prev_z_mag = length(vec2<f32>(final_z_x, final_z_y));
                     
                     break;
                  }
              }
           }
        }
        }
        
        if (advanced_by_bla) {
            let cur_mag = dz.x * dz.x + dz.y * dz.y;
            if (cur_mag > 1000000.0) {
              let ret = vec4<f32>(max_iterations, 0.0, 0.0, 0.0);
              checkpoint[pixel_idx] = CheckpointState(ret.x, ret.y, ret.z, ret.w, -1.0, 0.0, 0.0, 0.0);
              return ret;
            }
            let ref_final_node = get_orbit_node(ref_offset + u32(iter) * ORBIT_STRIDE);
            let ref_final_x = ref_final_node.x;
            let ref_final_y = ref_final_node.y;
            let final_x = ref_final_x + dz.x;
            let final_y = ref_final_y + dz.y;
            let point_mag = final_x * final_x + final_y * final_y;
            
            if (point_mag > 4.0) {
              let ret = get_escape_data(iter, final_x, final_y, der_x, der_y, 0.0, tia_sum);
              checkpoint[pixel_idx] = CheckpointState(ret.x, ret.y, ret.z, ret.w, -1.0, 0.0, 0.0, 0.0);
              return ret;
            }
            
            // if we escaped iteration completely safely via BLA jumps
            if (iter >= ref_escaped_iter && ref_escaped_iter < max_iterations) {
               let cur_node = get_orbit_node(ref_offset + u32(iter) * ORBIT_STRIDE);
               let cur_x_c = cur_node.x + dz.x;
               let cur_y_c = cur_node.y + dz.y;
               return continue_mandelbrot_iterations(vec2<f32>(cur_x_c, cur_y_c), start_c, iter, max_iterations, der_x, der_y, tia_sum, pixel_idx);
            }
            
            continue;
        }
    }

    let ref_node = get_orbit_node(ref_offset + u32(iter) * ORBIT_STRIDE);
    let zx = ref_node.x;
    let zy = ref_node.y;
    
    var dz_next: vec2<f32>;
    let d = camera.exponent;
    if (d == 2.0) {
      let dz2_x = dz.x * dz.x - dz.y * dz.y;
      let dz2_y = 2.0 * dz.x * dz.y;
      let two_z_dz_x = 2.0 * (zx * dz.x - zy * dz.y);
      let two_z_dz_y = 2.0 * (zx * dz.y + zy * dz.x);
      dz_next = vec2<f32>(two_z_dz_x + dz2_x + delta_c.x, two_z_dz_y + dz2_y + delta_c.y);
    } else if (d == floor(d) && d > 1.0) {
      var cur_val = vec2<f32>(zx, zy) + dz;
      var cur_z_next = cur_val;
      for(var i: f32 = 1.0; i < d; i += 1.0) {
          cur_z_next = complex_mul(cur_z_next, cur_val);
      }
      var ref_val = vec2<f32>(zx, zy);
      var ref_next = ref_val;
      for(var i: f32 = 1.0; i < d; i += 1.0) {
          ref_next = complex_mul(ref_next, ref_val);
      }
      dz_next = cur_z_next - ref_next + delta_c;
    } else {
      let cur_z = vec2<f32>(zx, zy) + dz;
      let r_cur = length(cur_z);
      let th_cur = atan2(cur_z.y, cur_z.x);
      let r_pow_cur = pow(r_cur, d);
      let cur_z_next = vec2<f32>(r_pow_cur * cos(d * th_cur), r_pow_cur * sin(d * th_cur));
      
      let ref_z = vec2<f32>(zx, zy);
      let r_ref = length(ref_z);
      let th_ref = atan2(ref_z.y, ref_z.x);
      let r_pow_ref = pow(r_ref, d);
      let ref_z_next = vec2<f32>(r_pow_ref * cos(d * th_ref), r_pow_ref * sin(d * th_ref));

      dz_next = cur_z_next - ref_z_next + delta_c;
    }
    
    let cur_x_for_der = zx + dz.x;
    let cur_y_for_der = zy + dz.y;
    var new_der_x = 1.0;
    var new_der_y = 0.0;
    if (d == 2.0) {
      new_der_x = 2.0 * (cur_x_for_der * der_x - cur_y_for_der * der_y) + 1.0;
      new_der_y = 2.0 * (cur_x_for_der * der_y + cur_y_for_der * der_x);
    } else {
      let r = length(vec2<f32>(cur_x_for_der, cur_y_for_der));
      let th = atan2(cur_y_for_der, cur_x_for_der);
      let r_pow_dm1 = d * pow(r, d - 1.0);
      let dx_z = r_pow_dm1 * cos((d - 1.0) * th);
      let dy_z = r_pow_dm1 * sin((d - 1.0) * th);
      new_der_x = dx_z * der_x - dy_z * der_y + 1.0;
      new_der_y = dx_z * der_y + dy_z * der_x;
    }
    let new_der_max = max(abs(new_der_x), abs(new_der_y));
    if (new_der_max > 1e18) {
       let scale = 1e18 / new_der_max;
       new_der_x *= scale;
       new_der_y *= scale;
    }
    der_x = new_der_x;
    der_y = new_der_y;

    dz = dz_next;
    
    let next_node = get_orbit_node(ref_offset + u32(iter + 1.0) * ORBIT_STRIDE);
    let next_zx = next_node.x;
    let next_zy = next_node.y;
    let cur_x = next_zx + dz.x;
    let cur_y = next_zy + dz.y;
    
    let cur_z_mag = length(vec2<f32>(cur_x, cur_y));
    let n_mag = pow(prev_z_mag, d);
    let den = n_mag + c_mag - abs(n_mag - c_mag);
    if (den > 0.0) {
       tia_sum += (cur_z_mag - abs(n_mag - c_mag)) / den;
    }
    prev_z_mag = cur_z_mag;
    
    let cur_mag = cur_x * cur_x + cur_y * cur_y;
    
    // Prevent GPU NaN bombs by ensuring bailout catches Invalid calculations
    if (!(cur_mag <= 4.0)) {
      let ret = get_escape_data(iter, cur_x, cur_y, der_x, der_y, 2.0, tia_sum);
      checkpoint[pixel_idx] = CheckpointState(ret.x, ret.y, ret.z, ret.w, -1.0, 0.0, 0.0, 0.0);
      return ret;
    }
    
    iter += 1.0;
    
    if (iter >= ref_escaped_iter && ref_escaped_iter < max_iterations) {
      return continue_mandelbrot_iterations(vec2<f32>(cur_x, cur_y), start_c, iter, max_iterations, der_x, der_y, tia_sum, pixel_idx);
    }
  }
  
  if (iter >= max_iterations) {
      let ret = vec4<f32>(max_iterations, 0.0, 0.0, 0.0);
      checkpoint[pixel_idx] = CheckpointState(ret.x, ret.y, ret.z, ret.w, -1.0, 0.0, 0.0, 0.0);
      return ret;
  }
  
  checkpoint[pixel_idx] = CheckpointState(0.0, 0.0, der_x, der_y, iter, tia_sum, dz.x, dz.y);
  return vec4<f32>(-2.0, 0.0, 0.0, 0.0);
}

fn execute_engine_math(start_z: vec2<f32>, start_c: vec2<f32>, delta_z: vec2<f32>, delta_c: vec2<f32>, ref_offset: u32, pixel_idx: u32) -> vec4<f32> {
  if (camera.use_perturbation > 0.5) {
     let floats_per_case = u32(camera.ref_max_iter) * FLOATS_PER_ITER + META_STRIDE;
     let orbit_meta = get_orbit_metadata(ref_offset, u32(camera.ref_max_iter));
     let cycle = orbit_meta.cycle_found;
     let ref_escaped_iter = orbit_meta.escaped_iter;
     
     if (camera.is_resume > 0.5 && checkpoint[pixel_idx].iter > 0.0 && checkpoint[pixel_idx].iter >= ref_escaped_iter && ref_escaped_iter < camera.max_iter) {
         return continue_mandelbrot_iterations(vec2<f32>(0.0,0.0), start_c, 0.0, camera.max_iter, 1.0, 0.0, 0.0, pixel_idx);
     }
     
     return calculate_perturbation(start_z, start_c, delta_z, delta_c, ref_offset, camera.ref_max_iter, cycle, ref_escaped_iter, pixel_idx);
  } else {
     return calculate_mandelbrot_iterations(start_z, start_c, camera.max_iter, pixel_idx);
  }
}

@compute @workgroup_size(1)
fn main_compute(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let idx = global_id.x;
  
  let input_z = vec2<f32>(data_in[idx * 6u], data_in[idx * 6u + 1u]);
  let input_c = vec2<f32>(data_in[idx * 6u + 2u], data_in[idx * 6u + 3u]);
  let delta_c = vec2<f32>(data_in[idx * 6u + 4u], data_in[idx * 6u + 5u]);
  let delta_z = vec2<f32>(0.0, 0.0);
  
  let floats_per_case = u32(camera.ref_max_iter) * FLOATS_PER_ITER + META_STRIDE;
  let ref_offset = idx * floats_per_case;

  let ret = execute_engine_math(input_z, input_c, delta_z, delta_c, ref_offset, idx);
  
  data_out[idx * 4u] = ret.x;
  data_out[idx * 4u + 1u] = ret.y;
  data_out[idx * 4u + 2u] = ret.z;
  data_out[idx * 4u + 3u] = ret.w;
}

@vertex
fn vs_main(@builtin(vertex_index) VertexIndex : u32) -> VertexOutput {
  var pos = array<vec2<f32>, 6>(
    vec2<f32>(-1.0, -1.0), vec2<f32>( 1.0, -1.0), vec2<f32>(-1.0,  1.0),
    vec2<f32>(-1.0,  1.0), vec2<f32>( 1.0, -1.0), vec2<f32>( 1.0,  1.0)
  );
  var out: VertexOutput;
  out.position = vec4<f32>(pos[VertexIndex], 0.0, 1.0);
  out.uv = pos[VertexIndex];
  return out;
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  let pixel_id = u32(in.position.y) * u32(camera.canvas_width) + u32(in.position.x);
  let coord = vec2<i32>(in.position.xy);
  var cp = checkpoint[pixel_id];
  
  if (cp.iter < 0.0 && camera.is_resume > 0.5) {
      let stored_result = vec4<f32>(cp.zx, cp.zy, cp.der_x, cp.der_y);
      let prev = textureLoad(readTex, coord, 0);
      return mix(prev, stored_result, select(1.0, camera.blend_weight, camera.blend_weight > 0.0));
  }

  let uv_mapped = vec2<f32>((in.uv.x + camera.jitter_x) * camera.scale * camera.aspect, (in.uv.y + camera.jitter_y) * camera.scale);
  
  let cos_theta = cos(camera.slice_angle);
  let sin_theta = sin(camera.slice_angle);
  
  let delta_z = vec2<f32>(camera.zr, camera.zi) + uv_mapped * sin_theta;
  let delta_c = vec2<f32>(camera.cr, camera.ci) + uv_mapped * cos_theta;
  
  let orbit_meta = get_orbit_metadata(0u, u32(camera.ref_max_iter));
  let abs_zr = orbit_meta.abs_zr;
  let abs_zi = orbit_meta.abs_zi;
  let abs_cr = orbit_meta.abs_cr;
  let abs_ci = orbit_meta.abs_ci;
  
  let start_z = select(vec2<f32>(camera.zr, camera.zi) + uv_mapped * sin_theta, vec2<f32>(abs_zr, abs_zi) + delta_z, camera.use_perturbation > 0.5);
  let start_c = select(vec2<f32>(camera.cr, camera.ci) + uv_mapped * cos_theta, vec2<f32>(abs_cr, abs_ci) + delta_c, camera.use_perturbation > 0.5);
  
  let ret = execute_engine_math(start_z, start_c, delta_z, delta_c, 0u, pixel_id);
  
  if (ret.x < -1.0) {
      if (camera.blend_weight > 0.0) {
          return textureLoad(readTex, coord, 0);
      } else {
          // Unresolved yield pixels should default to interior black, not palette baseline!
          return vec4<f32>(camera.max_iter, 0.0, 0.0, 0.0);
      }
  }
  
  let prev = textureLoad(readTex, coord, 0);
  return mix(prev, ret, select(1.0, camera.blend_weight, camera.blend_weight > 0.0));
}
