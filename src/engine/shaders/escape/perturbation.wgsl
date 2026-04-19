struct PerturbationInit {
  dz: vec2<f32>,
  der: vec2<f32>,
  iter: f32,
  prev_z_mag: f32,
  tia_sum: f32,
  escaped: bool,
  escape_data: vec4<f32>
}

// ==========================================
// PERTURBATION INITIALIZATION
// ==========================================
// Orchestrates optimal starting parameter selection. If midway through a progressive render,
// this resumes the `pixel_idx` from the previously stored accumulation checkpoint.
// Otherwise, initiates Series Approximation jumps to skip identically flat inner-fractal orbits.
fn init_perturbation_state(delta_z: vec2<f32>, delta_c: vec2<f32>, pixel_idx: u32) -> PerturbationInit {
  var dz = delta_z;
  var iter = 0.0;
  var der = vec2<f32>(1.0, 0.0);
  var prev_z_mag = 0.0;
  var tia_sum = 0.0;
  
  // 1. Progressive Rendering Checkpoint Resumption.
  // Resumes previous execution states from the G-Buffer instead of initializing brand new deltas.
  if (camera.load_checkpoint > 0.5 && checkpoint[pixel_idx].iter > 0.0) {
      dz.x = checkpoint[pixel_idx].zx;
      dz.y = checkpoint[pixel_idx].zy;
      iter = checkpoint[pixel_idx].iter;
      der.x = checkpoint[pixel_idx].der_x;
      der.y = checkpoint[pixel_idx].der_y;
      tia_sum = checkpoint[pixel_idx].tia_sum;
      
      let node = get_orbit_node(u32(iter));
      prev_z_mag = length(vec2<f32>(node.x + dz.x, node.y + dz.y));
  } else if (camera.skip_iter > 0.0) {
      iter = camera.skip_iter;
      let skip = u32(iter);
      
      let node = get_orbit_node(skip);
      let ar = node.ar; let ai = node.ai;
      let br = node.br; let bi = node.bi;
      let cr = node.cr; let ci = node.ci;
      
      let a_dc = complex_mul(vec2<f32>(ar, ai), delta_c);
      let dc2 = complex_sq(delta_c);
      let b_dc2 = complex_mul(vec2<f32>(br, bi), dc2);
      let dc3 = complex_mul(dc2, delta_c);
      let c_dc3 = complex_mul(vec2<f32>(cr, ci), dc3);
      
      dz = complex_add(complex_add(a_dc, b_dc2), c_dc3);
      der = vec2<f32>(ar, ai);
      
      let initial_x = node.x + dz.x;
      let initial_y = node.y + dz.y;
      prev_z_mag = length(vec2<f32>(initial_x, initial_y));
      
      if (initial_x * initial_x + initial_y * initial_y > 4.0) {
         let ret = get_escape_data(iter, initial_x, initial_y, der.x, der.y, 1.0, tia_sum);
         checkpoint[pixel_idx] = CheckpointState(ret.x, ret.y, ret.z, ret.w, -1.0, 0.0);
         return PerturbationInit(dz, der, iter, prev_z_mag, tia_sum, true, ret);
      }
  } else {
     let node = get_orbit_node(0u);
     let initial_x = node.x + dz.x;
     let initial_y = node.y + dz.y;
     prev_z_mag = length(vec2<f32>(initial_x, initial_y));
     if (!(initial_x * initial_x + initial_y * initial_y <= 4.0)) {
        let ret = get_escape_data(iter, initial_x, initial_y, der.x, der.y, 1.0, tia_sum);
        checkpoint[pixel_idx] = CheckpointState(ret.x, ret.y, ret.z, ret.w, -1.0, 0.0);
        return PerturbationInit(dz, der, iter, prev_z_mag, tia_sum, true, ret);
     }
  }
  
  return PerturbationInit(dz, der, iter, prev_z_mag, tia_sum, false, vec4<f32>(0.0));
}

// ==========================================
// ARBITRARY PRECISION RUNTIME (PERTURBATION)
// ==========================================
// Orchestrates the Arbitrary Precision deep-zoom runtime. Rather than iterating pure `z`, 
// we track a `delta_z` against a mathematically perfect `ref_node` computed historically on the CPU.
// Employs both SA and BLA to efficiently skip identical depths down into extreme macro scales (>1e30 magnification).
fn calculate_perturbation(start_z: vec2<f32>, start_c: vec2<f32>, delta_z: vec2<f32>, delta_c: vec2<f32>, max_iterations: f32, ref_cycle: f32, ref_escaped_iter: f32, pixel_idx: u32, enable_bla: bool) -> vec4<f32> {
  if (ref_cycle == 1.0 && delta_c.x == 0.0 && delta_c.y == 0.0 && delta_z.x == 0.0 && delta_z.y == 0.0) {
     let ret = vec4<f32>(max_iterations, 0.0, 0.0, 0.0);
      checkpoint[pixel_idx] = CheckpointState(ret.x, ret.y, ret.z, ret.w, -1.0, 0.0);
      return ret;
  }
  
  let init_state = init_perturbation_state(delta_z, delta_c, pixel_idx);
  if (init_state.escaped) {
      return init_state.escape_data;
  }
  
  var dz = init_state.dz;
  var iter = init_state.iter;
  var der_x = init_state.der.x;
  var der_y = init_state.der.y;
  var prev_z_mag = init_state.prev_z_mag;
  var tia_sum = init_state.tia_sum;

  // Initialize parallel high-precision state
  var dz_ds = complex_f32_to_ds(dz);
  
  let ds_center = vec4<f32>(camera.dc_high_x, camera.dc_low_x, camera.dc_high_y, camera.dc_low_y);
  let uv_rot_x = delta_c.x - camera.cr;
  let uv_rot_y = delta_c.y - camera.ci;
  let dc_ds = complex_add_ds(ds_center, vec4<f32>(uv_rot_x, 0.0, uv_rot_y, 0.0));

  let c_mag = length(start_c);

  // Synchronizes iterator bounds with the ProgressiveRenderScheduler to allow
  // temporal supersampling and checkpoint yielding for interactive framerates.
  // In Debug View Mode 5.0, we force entirely synchronous loop execution to 
  // trace the full BLA/Standard paths head-to-head without progressive state corruption.
  let target_steps = select(camera.step_limit, camera.compute_max_iter, camera.debug_view_mode == 5.0);
  var steps = 0.0;

  while (iter < max_iterations && steps < target_steps) {
    if (exponent_branch_mode == 1.0 && math_compute_mode < 2u && enable_bla) {
        let bla_res = advance_via_bla(dz, vec2<f32>(der_x, der_y), delta_c, start_c, iter, max_iterations, ref_escaped_iter, max_iterations, pixel_idx, tia_sum);
        if (bla_res.advanced) {
            if (bla_res.escaped) {
                return bla_res.escape_data;
            }
            dz = bla_res.dz;
            der_x = bla_res.der.x;
            der_y = bla_res.der.y;
            iter = bla_res.iter;
            prev_z_mag = bla_res.prev_z_mag;
            steps += 1.0;
            continue;
        }
    }

    let ref_node = get_orbit_node(u32(iter));
    let zx = ref_node.x;
    let zy = ref_node.y;
    
    var dz_next: vec2<f32>;
    let d = camera.exponent;
    
    // Switch to Double-Single Emulated precision natively when math_compute_mode == 2
    if (math_compute_mode == 2u) {
        if (exponent_branch_mode == 1.0) {
            let bla_res = advance_via_bla_ds(dz_ds, vec2<f32>(der_x, der_y), dc_ds, start_c, iter, max_iterations, ref_escaped_iter, max_iterations, pixel_idx, tia_sum);
            if (bla_res.advanced) {
                if (bla_res.escaped) {
                    return bla_res.escape_data;
                }
                dz_ds = bla_res.dz;
                der_x = bla_res.der.x;
                der_y = bla_res.der.y;
                iter = bla_res.iter;
                prev_z_mag = bla_res.prev_z_mag;
                steps += 1.0;
                dz = vec2<f32>(dz_ds.x, dz_ds.z);
                continue;
            }
        }
    
        let base_index = u32(iter) * ORBIT_STRIDE;
        let zx_ds = unpack_f64_to_ds(ref_orbits[base_index + 0u]);
        let zy_ds = unpack_f64_to_ds(ref_orbits[base_index + 1u]);
        let z_ds = vec4<f32>(zx_ds.x, zx_ds.y, zy_ds.x, zy_ds.y);
        
        let dz2_ds = complex_sq_ds(dz_ds);
        let two_z_dz_ds = complex_mul_ds(complex_f32_to_ds(vec2<f32>(2.0, 0.0)), complex_mul_ds(z_ds, dz_ds));
        let dz_next_ds = complex_add_ds(complex_add_ds(two_z_dz_ds, dz2_ds), dc_ds);
        
        dz_ds = dz_next_ds;
        
        // Return to f32 for storage/next iteration context calculation, but maintain dz_ds
        // dz_next_ds.xy are the High bits of Real and Imaginary (DSComplex is x:RealHi, y:RealLo, z:ImagHi, w:ImagLo)
        dz_next = vec2<f32>(dz_ds.x, dz_ds.z);
    } else {
        if (d == 2.0) {
          let dz2 = complex_sq(dz);
          let two_z_dz = 2.0 * complex_mul(vec2<f32>(zx, zy), dz);
          dz_next = complex_add(complex_add(two_z_dz, dz2), delta_c);
        } else {
          let cur_z_next = step_polynomial(vec2<f32>(zx, zy) + dz, vec2<f32>(0.0, 0.0), d);
          let ref_next = step_polynomial(vec2<f32>(zx, zy), vec2<f32>(0.0, 0.0), d);
          dz_next = cur_z_next - ref_next + delta_c;
        }
    }
    
    let cur_x_for_der = zx + dz.x;
    let new_der = step_derivative(vec2<f32>(zx + dz_next.x, zy + dz_next.y), vec2<f32>(der_x, der_y), d);
    var new_der_x = new_der.x;
    var new_der_y = new_der.y;
    let new_der_max = max(abs(new_der_x), abs(new_der_y));
    if (new_der_max > 1e18) {
       let scale = 1e18 / new_der_max;
       new_der_x *= scale;
       new_der_y *= scale;
    }
    der_x = new_der_x;
    der_y = new_der_y;

    dz = dz_next;
    
    let next_node = get_orbit_node(u32(iter + 1.0));
    let next_zx = next_node.x;
    let next_zy = next_node.y;
    let cur_x = next_zx + dz.x;
    let cur_y = next_zy + dz.y;
    let cur_z_mag = length(vec2<f32>(cur_x, cur_y));
    
    // --- Proxy Collapse Detection (Rebase Trigger) ---
    let p_mag = cur_x * cur_x + cur_y * cur_y; // |Z_m + dz|^2
    let dz_mag = dz.x * dz.x + dz.y * dz.y;    // |dz|^2
    // Mantissa exhaustion fallback
    let mantissa_exhausted = (abs(next_zx) + abs(dz.x) == abs(next_zx)) && (abs(next_zy) + abs(dz.y) == abs(next_zy));
    
    if (p_mag < dz_mag || mantissa_exhausted) {
        let glitched_idx = atomicAdd(&glitch_readback.count, 1u);
        if (glitched_idx < MAX_GLITCHES) {
            let px = pixel_idx % u32(camera.canvas_width);
            let py = pixel_idx / u32(camera.canvas_width);
            glitch_readback.records[glitched_idx] = GlitchRecord(px, py);
        }
        
        let ret = vec4<f32>(-6.0, iter, dz.x, dz.y);
        checkpoint[pixel_idx] = CheckpointState(ret.x, ret.y, ret.z, ret.w, -1.0, 0.0);
        return ret;
    }
    
    if (cur_x != cur_x || cur_y != cur_y || dz.x != dz.x || dz_next.x != dz_next.x) {
      let ret = vec4<f32>(-5.0, 0.0, 0.0, 0.0);
      checkpoint[pixel_idx] = CheckpointState(ret.x, ret.y, ret.z, ret.w, -1.0, 0.0);
      return ret;
    }

    let ref_mag = next_zx * next_zx + next_zy * next_zy;
    if (iter > 2.0 && (dz.x * dz.x + dz.y * dz.y) > ref_mag) {
       return continue_mandelbrot_iterations(vec2<f32>(cur_x, cur_y), start_c, iter, max_iterations, der_x, der_y, tia_sum, pixel_idx);
    }

    if (coloring_mode > 0.5) {
      let n_mag = pow(prev_z_mag, d);
      let den = n_mag + c_mag - abs(n_mag - c_mag);
      if (den > 0.0) {
         tia_sum += (cur_z_mag - abs(n_mag - c_mag)) / den;
      }
    }
    prev_z_mag = cur_z_mag;
    
    let cur_mag = cur_x * cur_x + cur_y * cur_y;
    
    // Prevent GPU NaN bombs by ensuring bailout catches Invalid calculations
    if (!(cur_mag <= 4.0)) {
      let ret = get_escape_data(iter, cur_x, cur_y, der_x, der_y, 2.0, tia_sum);
      checkpoint[pixel_idx] = CheckpointState(ret.x, ret.y, ret.z, ret.w, -1.0, 0.0);
      return ret;
    }
    
    iter += 1.0;
    steps += 1.0;
    
    if (iter >= ref_escaped_iter && ref_escaped_iter < max_iterations) {
      return continue_mandelbrot_iterations(vec2<f32>(cur_x, cur_y), start_c, iter, max_iterations, der_x, der_y, tia_sum, pixel_idx);
    }
  }
  
  if (iter >= max_iterations) {
      let ret = vec4<f32>(max_iterations, 0.0, 0.0, 0.0);
      checkpoint[pixel_idx] = CheckpointState(ret.x, ret.y, ret.z, ret.w, -1.0, 0.0);
      return ret;
  }
  
  checkpoint[pixel_idx] = CheckpointState(dz.x, dz.y, der_x, der_y, iter, tia_sum);
  completion_flag[0] = 0u;
  return vec4<f32>(-2.0, 0.0, 0.0, 0.0);
}

