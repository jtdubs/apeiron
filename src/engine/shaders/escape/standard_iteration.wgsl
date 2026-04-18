// ==========================================
// STANDARD MATH ENGINE & INTERIOR DETECTION
// ==========================================

// Fallback runtime to evaluate the standard sequence directly up to the max_iterations budget.
// Also implements Brent's Algorithm (`check_mu`, `check_lam`) to passively detect fixed cycles
// when deep within chaotic black regions representing the Mandelbrot interior, preventing infinite loops.
fn continue_mandelbrot_iterations(start_z: vec2<f32>, start_c: vec2<f32>, start_iter: f32, max_iterations: f32, start_der_x: f32, start_der_y: f32, start_tia: f32, pixel_idx: u32) -> vec4<f32> {
  var x = start_z.x;
  var y = start_z.y;
  var der_x = start_der_x;
  var der_y = start_der_y;
  var iter = start_iter;
  var tia_sum = start_tia;
  
  // Progressive Rendering Checkpoint Resumption.
  // If the previous frame's render yielded due to frame-time limits (load_checkpoint > 0.5),
  // we bypass initializing the pixel from `start_z` entirely and instantly resume calculus
  // exactly from where the prior GPU pass left off using the checkpoint G-Buffer.
  if (camera.load_checkpoint > 0.5 && checkpoint[pixel_idx].iter > 0.0) {
    x = checkpoint[pixel_idx].zx;
    y = checkpoint[pixel_idx].zy;
    der_x = checkpoint[pixel_idx].der_x;
    der_y = checkpoint[pixel_idx].der_y;
    iter = checkpoint[pixel_idx].iter;
    tia_sum = checkpoint[pixel_idx].tia_sum;
  }
  
  // Synchronizes iterator bounds with the ProgressiveRenderScheduler to allow
  let target_steps = camera.step_limit;
  var steps = 0.0;
  let d = fractal_exponent;
  var prev_z_mag = length(vec2<f32>(x, y));
  let c_mag = length(start_c);
  
  // Period finding constants for Brent's Algorithm limit cycle detection.
  // Stops computation if `z` converges on an infinitely stable internal pattern.
  var check_z = vec2<f32>(x, y);
  var check_lam: f32 = 1.0;
  var check_mu: f32 = 1.0;

  while (iter < max_iterations && steps < target_steps) {
    let mag_sq = x * x + y * y;
    if (!(mag_sq <= 4.0)) {
      let ret = get_escape_data(iter, x, y, der_x, der_y, 1.0, tia_sum);
      checkpoint[pixel_idx] = CheckpointState(ret.x, ret.y, ret.z, ret.w, -1.0, 0.0);
      return ret;
    }
    
    let step_res = step_mandelbrot(vec2<f32>(x, y), start_c, vec2<f32>(der_x, der_y), d);
    let new_x = step_res.x;
    let new_y = step_res.y;
    var new_der_x = step_res.z;
    var new_der_y = step_res.w;
    
    let cur_z_mag = length(vec2<f32>(new_x, new_y));
    if (coloring_mode > 0.5) {
      let n_mag = pow(prev_z_mag, d);
      let den = n_mag + c_mag - abs(n_mag - c_mag);
      if (den > 0.0) {
         tia_sum += (cur_z_mag - abs(n_mag - c_mag)) / den;
      }
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
    steps += 1.0;
    
    let dz = vec2<f32>(x - check_z.x, y - check_z.y);
    if (dot(dz, dz) < 1e-20) {
      let ret = vec4<f32>(max_iterations, 0.0, 0.0, 0.0);
      checkpoint[pixel_idx] = CheckpointState(ret.x, ret.y, ret.z, ret.w, -1.0, 0.0);
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
      checkpoint[pixel_idx] = CheckpointState(ret.x, ret.y, ret.z, ret.w, -1.0, 0.0);
      return ret;
  }
  
  checkpoint[pixel_idx] = CheckpointState(x, y, der_x, der_y, iter, tia_sum);
  completion_flag[0] = 0u;
  return vec4<f32>(-2.0, 0.0, 0.0, 0.0); // Sentinel
}

fn calculate_mandelbrot_iterations(start_z: vec2<f32>, start_c: vec2<f32>, max_iterations: f32, pixel_idx: u32) -> vec4<f32> {
  if (fractal_exponent == 2.0 && start_z.x == 0.0 && start_z.y == 0.0) {
    if (is_interior_analytic(start_c.x, start_c.y)) {
      let ret = vec4<f32>(max_iterations, 0.0, 0.0, 0.0);
      checkpoint[pixel_idx] = CheckpointState(ret.x, ret.y, ret.z, ret.w, -1.0, 0.0);
      return ret;
    }
  }
  return continue_mandelbrot_iterations(start_z, start_c, 0.0, max_iterations, 1.0, 0.0, 0.0, pixel_idx);
}

