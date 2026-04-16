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

// ==========================================
// CORE COMPLEX ALGEBRA
// ==========================================
// Simulates arithmetic for Complex numbers Z = a + bi through vec2(real, imaginary),
// as WGSL has no native representation for non-euclidean imaginary components.
fn complex_mul(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
  return vec2<f32>(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

fn complex_add(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
  return vec2<f32>(a.x + b.x, a.y + b.y);
}

fn complex_sub(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
  return vec2<f32>(a.x - b.x, a.y - b.y);
}

fn complex_sq(a: vec2<f32>) -> vec2<f32> {
  return vec2<f32>(a.x * a.x - a.y * a.y, 2.0 * a.x * a.y);
}

fn complex_div(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
  let den = b.x * b.x + b.y * b.y;
  return vec2<f32>((a.x * b.x + a.y * b.y) / den, (a.y * b.x - a.x * b.y) / den);
}

fn complex_abs_sq(a: vec2<f32>) -> f32 {
  return a.x * a.x + a.y * a.y;
}

// ==========================================
// FRACTAL POLYNOMIAL ITERATORS
// ==========================================

// Evaluates the Mandelbrot spatial derivative:  z_der = d * z^(d-1) * z_der + 1
// Necessary for Distance Estimation which measures distance mapping distortion to trace boundary edges.
fn step_derivative(z: vec2<f32>, der: vec2<f32>, d: f32) -> vec2<f32> {
  if (d == 2.0) {
      let der_sq = 2.0 * complex_mul(z, der);
      return vec2<f32>(der_sq.x + 1.0, der_sq.y);
  }
  let r = length(z);
  let th = atan2(z.y, z.x);
  let r_pow_dm1 = d * pow(r, d - 1.0);
  let dx_z = r_pow_dm1 * cos((d - 1.0) * th);
  let dy_z = r_pow_dm1 * sin((d - 1.0) * th);
  let der_mul = complex_mul(vec2<f32>(dx_z, dy_z), der);
  return vec2<f32>(der_mul.x + 1.0, der_mul.y);
}

// Evaluates polynomial geometric progression: z = z^d + c
// Uses discrete branches to skip heavy trigonometric functions (`atan2`, `pow`) via binomial
// expansion if exponent `d` is exactly `2.0` or a whole integer.
fn step_polynomial(z: vec2<f32>, c: vec2<f32>, d: f32) -> vec2<f32> {
    if (d == 2.0) {
        return complex_add(complex_sq(z), c);
    } else if (d == floor(d) && d > 1.0) {
        var z_temp = z;
        for(var i: f32 = 1.0; i < d; i += 1.0) {
            z_temp = complex_mul(z_temp, z);
        }
        return complex_add(z_temp, c);
    } else {
        let r = length(z);
        let th = atan2(z.y, z.x);
        let r_pow = pow(r, d);
        return vec2<f32>(r_pow * cos(d * th) + c.x, r_pow * sin(d * th) + c.y);
    }
}

fn step_mandelbrot(z: vec2<f32>, c: vec2<f32>, der: vec2<f32>, d: f32) -> vec4<f32> {
    let new_z = step_polynomial(z, c, d);
    let new_der = step_derivative(z, der, d);
    return vec4<f32>(new_z.x, new_z.y, new_der.x, new_der.y);
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
  
  // Triangle Inequality Average (TIA) / Stripe Average Rendering.
  // Instead of smoothing by logarithmic potential (smooth_iter), if coloring_mode is enabled,
  // we yield the normalized bounded mathematical integrals accumulated during polynomial looping.
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
  // temporal supersampling and checkpoint yielding for interactive framerates.
  let target_iter = min(max_iterations, iter + camera.yield_iter_limit);
  let d = camera.exponent;
  var prev_z_mag = length(vec2<f32>(x, y));
  let c_mag = length(start_c);
  
  // Period finding constants for Brent's Algorithm limit cycle detection.
  // Stops computation if `z` converges on an infinitely stable internal pattern.
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
    
    let step_res = step_mandelbrot(vec2<f32>(x, y), start_c, vec2<f32>(der_x, der_y), d);
    let new_x = step_res.x;
    let new_y = step_res.y;
    var new_der_x = step_res.z;
    var new_der_y = step_res.w;
    
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

struct BlaResult {
  dz: vec2<f32>,
  der: vec2<f32>,
  iter: f32,
  prev_z_mag: f32,
  escaped: bool,
  escape_data: vec4<f32>,
  advanced: bool
}

// ==========================================
// BILINEAR APPROXIMATION (BLA)
// ==========================================
// When Series Approximation reaches edge error limits, BLA accelerates arbitrary iteration leaps.
// Instead of evaluating individual iterations, we utilize a pre-computed recursive tree of matrices
// (stored in `ref_orbits` layout) to exponentially cross spatial checkpoints (up to 2^15 layers) 
// rapidly skipping thousands of sequential geometric iterations in just a few matrix operations.
fn advance_via_bla(dz_in: vec2<f32>, der_in: vec2<f32>, delta_c: vec2<f32>, start_c: vec2<f32>, iter_in: f32, target_iter: f32, ref_offset: u32, ref_escaped_iter: f32, max_iterations: f32, pixel_idx: u32, tia_sum: f32) -> BlaResult {
    var dz = dz_in;
    var der = der_in;
    var iter = iter_in;
    var advanced_by_bla = false;
    let bla_offset = ref_offset + u32(camera.ref_max_iter) * ORBIT_STRIDE + META_STRIDE;
    let dz_len_sq = dz.x * dz.x + dz.y * dz.y;
    let dc_len_sq = delta_c.x * delta_c.x + delta_c.y * delta_c.y;
    var prev_z_mag = 0.0;
    
    if (dz_len_sq < 1e-6 && dc_len_sq < 1e-6) {
        for(var l_: i32 = 15; l_ >= 0; l_ -= 1) {
            let l = u32(l_);
            let b_len = f32(1u << l);
            
            if ((iter + b_len) <= target_iter && (iter + b_len) <= camera.ref_max_iter && (iter + b_len) < ref_escaped_iter) {
                let bla_node = get_bla_node(bla_offset, u32(iter), l);
                let target_err = bla_node.err;
                
                if (target_err < 1e20) {
                    let max_delta_sq = max(dz_len_sq, dc_len_sq);
                    let err_factor = target_err * max_delta_sq;
                    if (err_factor < 1e-9) {
                        let ar = bla_node.ar; let ai = bla_node.ai;
                        let br = bla_node.br; let bi = bla_node.bi;
                        
                        let a_dz = complex_mul(vec2<f32>(ar, ai), dz);
                        let b_dc = complex_mul(vec2<f32>(br, bi), delta_c);
                        dz = complex_add(a_dz, b_dc);
                        
                        let new_der = complex_mul(vec2<f32>(ar, ai), der);
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
                        
                        let final_node = get_orbit_node(ref_offset + u32(iter) * ORBIT_STRIDE);
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
            let ret = vec4<f32>(max_iterations, 0.0, 0.0, 0.0);
            checkpoint[pixel_idx] = CheckpointState(ret.x, ret.y, ret.z, ret.w, -1.0, 0.0, 0.0, 0.0);
            return BlaResult(dz, der, iter, prev_z_mag, true, ret, true);
        }
        let ref_final_node = get_orbit_node(ref_offset + u32(iter) * ORBIT_STRIDE);
        let final_x = ref_final_node.x + dz.x;
        let final_y = ref_final_node.y + dz.y;
        let point_mag = final_x * final_x + final_y * final_y;
        
        if (point_mag > 4.0) {
            let ret = get_escape_data(iter, final_x, final_y, der.x, der.y, 0.0, tia_sum);
            checkpoint[pixel_idx] = CheckpointState(ret.x, ret.y, ret.z, ret.w, -1.0, 0.0, 0.0, 0.0);
            return BlaResult(dz, der, iter, prev_z_mag, true, ret, true);
        }
        
        if (iter >= ref_escaped_iter && ref_escaped_iter < max_iterations) {
            let cur_node = get_orbit_node(ref_offset + u32(iter) * ORBIT_STRIDE);
            let ret = continue_mandelbrot_iterations(vec2<f32>(cur_node.x + dz.x, cur_node.y + dz.y), start_c, iter, max_iterations, der.x, der.y, tia_sum, pixel_idx);
            return BlaResult(dz, der, iter, prev_z_mag, true, ret, true);
        }
        
        return BlaResult(dz, der, iter, prev_z_mag, false, vec4<f32>(0.0), true);
    }
    
    return BlaResult(dz, der, iter, prev_z_mag, false, vec4<f32>(0.0), false);
}

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
fn init_perturbation_state(delta_z: vec2<f32>, delta_c: vec2<f32>, ref_offset: u32, pixel_idx: u32) -> PerturbationInit {
  var dz = delta_z;
  var iter = 0.0;
  var der = vec2<f32>(1.0, 0.0);
  var prev_z_mag = 0.0;
  var tia_sum = 0.0;
  
  // 1. Progressive Rendering Checkpoint Resumption.
  // Resumes previous execution states from the G-Buffer instead of initializing brand new deltas.
  if (camera.load_checkpoint > 0.5 && checkpoint[pixel_idx].iter > 0.0) {
      dz.x = checkpoint[pixel_idx].dz_x;
      dz.y = checkpoint[pixel_idx].dz_y;
      iter = checkpoint[pixel_idx].iter;
      der.x = checkpoint[pixel_idx].der_x;
      der.y = checkpoint[pixel_idx].der_y;
      tia_sum = checkpoint[pixel_idx].tia_sum;
      
      let node = get_orbit_node(ref_offset + u32(iter) * ORBIT_STRIDE);
      prev_z_mag = length(vec2<f32>(node.x + dz.x, node.y + dz.y));
  } else if (camera.skip_iter > 0.0) {
      iter = camera.skip_iter;
      let skip = u32(iter);
      
      let node = get_orbit_node(ref_offset + skip * ORBIT_STRIDE);
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
         checkpoint[pixel_idx] = CheckpointState(ret.x, ret.y, ret.z, ret.w, -1.0, 0.0, 0.0, 0.0);
         return PerturbationInit(dz, der, iter, prev_z_mag, tia_sum, true, ret);
      }
  } else {
     let node = get_orbit_node(ref_offset);
     let initial_x = node.x + dz.x;
     let initial_y = node.y + dz.y;
     prev_z_mag = length(vec2<f32>(initial_x, initial_y));
     if (!(initial_x * initial_x + initial_y * initial_y <= 4.0)) {
        let ret = get_escape_data(iter, initial_x, initial_y, der.x, der.y, 1.0, tia_sum);
        checkpoint[pixel_idx] = CheckpointState(ret.x, ret.y, ret.z, ret.w, -1.0, 0.0, 0.0, 0.0);
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
fn calculate_perturbation(start_z: vec2<f32>, start_c: vec2<f32>, delta_z: vec2<f32>, delta_c: vec2<f32>, ref_offset: u32, max_iterations: f32, ref_cycle: f32, ref_escaped_iter: f32, pixel_idx: u32) -> vec4<f32> {
  if (ref_cycle == 1.0 && delta_c.x == 0.0 && delta_c.y == 0.0 && delta_z.x == 0.0 && delta_z.y == 0.0) {
     let ret = vec4<f32>(max_iterations, 0.0, 0.0, 0.0);
      checkpoint[pixel_idx] = CheckpointState(ret.x, ret.y, ret.z, ret.w, -1.0, 0.0, 0.0, 0.0);
      return ret;
  }
  
  let init_state = init_perturbation_state(delta_z, delta_c, ref_offset, pixel_idx);
  if (init_state.escaped) {
      return init_state.escape_data;
  }
  
  var dz = init_state.dz;
  var iter = init_state.iter;
  var der_x = init_state.der.x;
  var der_y = init_state.der.y;
  var prev_z_mag = init_state.prev_z_mag;
  var tia_sum = init_state.tia_sum;

  let c_mag = length(start_c);

  // Synchronizes iterator bounds with the ProgressiveRenderScheduler to allow
  // temporal supersampling and checkpoint yielding for interactive framerates.
  let target_iter = min(max_iterations, iter + camera.yield_iter_limit);

  while (iter < target_iter) {
    if (camera.exponent == 2.0) {
        let bla_res = advance_via_bla(dz, vec2<f32>(der_x, der_y), delta_c, start_c, iter, target_iter, ref_offset, ref_escaped_iter, max_iterations, pixel_idx, tia_sum);
        if (bla_res.advanced) {
            if (bla_res.escaped) {
                return bla_res.escape_data;
            }
            dz = bla_res.dz;
            der_x = bla_res.der.x;
            der_y = bla_res.der.y;
            iter = bla_res.iter;
            prev_z_mag = bla_res.prev_z_mag;
            continue;
        }
    }

    let ref_node = get_orbit_node(ref_offset + u32(iter) * ORBIT_STRIDE);
    let zx = ref_node.x;
    let zy = ref_node.y;
    
    var dz_next: vec2<f32>;
    let d = camera.exponent;
    if (d == 2.0) {
      let dz2 = complex_sq(dz);
      let two_z_dz = 2.0 * complex_mul(vec2<f32>(zx, zy), dz);
      dz_next = complex_add(complex_add(two_z_dz, dz2), delta_c);
    } else {
      let cur_z_next = step_polynomial(vec2<f32>(zx, zy) + dz, vec2<f32>(0.0, 0.0), d);
      let ref_next = step_polynomial(vec2<f32>(zx, zy), vec2<f32>(0.0, 0.0), d);
      dz_next = cur_z_next - ref_next + delta_c;
    }
    
    let cur_x_for_der = zx + dz.x;
    let new_der = step_derivative(vec2<f32>(zx + dz.x, zy + dz.y), vec2<f32>(der_x, der_y), d);
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
     
     // Progressive Render Perturbation Exhaustion.
     // If we are resuming a previously paused progressive pixel (`load_checkpoint` is active),
     // AND the paused pixel had already iterated deeply past the *reference orbit's* escape point,
     // we can no longer perturb! We must forcefully push the pixel into the standard fallback engine to finish.
     if (camera.load_checkpoint > 0.5 && checkpoint[pixel_idx].iter > 0.0 && checkpoint[pixel_idx].iter >= ref_escaped_iter && ref_escaped_iter < camera.max_iter) {
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

@compute @workgroup_size(64)
fn unit_test_complex_math(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let idx = global_id.x;
  if (idx * 4u >= arrayLength(&data_in)) {
      return;
  }
  
  let a = vec2<f32>(data_in[idx * 4u], data_in[idx * 4u + 1u]);
  let b = vec2<f32>(data_in[idx * 4u + 2u], data_in[idx * 4u + 3u]);
  
  let mul_res = complex_mul(a, b);
  let sq_res = complex_sq(a);
  
  data_out[idx * 4u] = mul_res.x;
  data_out[idx * 4u + 1u] = mul_res.y;
  data_out[idx * 4u + 2u] = sq_res.x;
  data_out[idx * 4u + 3u] = sq_res.y;
}

@compute @workgroup_size(64)
fn unit_test_polynomial(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let idx = global_id.x;
  if (idx * 4u >= arrayLength(&data_in)) {
      return;
  }
  
  let z = vec2<f32>(data_in[idx * 4u], data_in[idx * 4u + 1u]);
  let c_val = vec2<f32>(data_in[idx * 4u + 2u], data_in[idx * 4u + 3u]);
  
  let d = camera.exponent;
  let p_res = step_polynomial(z, c_val, d);
  let der_res = step_derivative(z, c_val, d); // Note: feeding c_val as dummy 'der' for testing
  
  data_out[idx * 4u] = p_res.x;
  data_out[idx * 4u + 1u] = p_res.y;
  data_out[idx * 4u + 2u] = der_res.x;
  data_out[idx * 4u + 3u] = der_res.y;
}

@compute @workgroup_size(64)
fn unit_test_state_resume(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let idx = global_id.x;
  if (idx * 4u >= arrayLength(&data_in)) {
      return;
  }
  
  // Test how the engine consumes CheckpointState correctly during progressive continuation
  let zx = data_in[idx * 4u];
  let zy = data_in[idx * 4u + 1u];
  let it = data_in[idx * 4u + 2u];
  
  // Inject mock checkpoint data mathematically (via code to bypass binding issues if testing)
  // Let's actually use the checkpoint buffer. If camera.load_checkpoint > 0.5, we should resume.
  // We'll write to checkpoint, or we'll just run continue_mandelbrot_iterations for 2 steps.
  let start_z = vec2<f32>(0.0, 0.0);
  let start_c = vec2<f32>(zx, zy);
  
  // Execute just 2 iterations from whatever state is in checkpoint
  let res = continue_mandelbrot_iterations(start_z, start_c, 0.0, 100.0, 1.0, 0.0, 0.0, idx);
  
  // Write the resulting checkpoint memory out to assert the FSM behaved correctly
  let cp = checkpoint[idx];
  data_out[idx * 4u] = cp.zx;
  data_out[idx * 4u + 1u] = cp.zy;
  data_out[idx * 4u + 2u] = cp.iter;
  data_out[idx * 4u + 3u] = cp.der_x;
}

@compute @workgroup_size(64)
fn unit_test_sa_init(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let idx = global_id.x;
  if (idx * 4u >= arrayLength(&data_in)) {
      return;
  }
  
  // Test how Series Approximation calculates starting jumps
  let dz_x = data_in[idx * 4u];
  let dz_y = data_in[idx * 4u + 1u];
  let dc_x = data_in[idx * 4u + 2u];
  let dc_y = data_in[idx * 4u + 3u];
  
  // For unit tests, assume reference orbit starts at offset 0
  let sa = init_perturbation_state(vec2<f32>(dz_x, dz_y), vec2<f32>(dc_x, dc_y), 0u, idx);
  
  data_out[idx * 4u] = sa.dz.x;
  data_out[idx * 4u + 1u] = sa.dz.y;
  data_out[idx * 4u + 2u] = sa.der.x;
  data_out[idx * 4u + 3u] = sa.der.y;
}

@compute @workgroup_size(64)
fn unit_test_bla_advance(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let idx = global_id.x;
  if (idx * 4u >= arrayLength(&data_in)) {
      return;
  }
  
  let dz_in = vec2<f32>(data_in[idx * 4u], data_in[idx * 4u + 1u]);
  let iter_in = data_in[idx * 4u + 2u];
  
  // We mock a tiny delta C
  let delta_c = vec2<f32>(1e-15, 1e-15);
  let der_in = vec2<f32>(1.0, 0.0);
  let start_c = vec2<f32>(-1.748, 0.0);
  
  let bla = advance_via_bla(dz_in, der_in, delta_c, start_c, iter_in, 100.0, 0u, 1000.0, 1000.0, idx, 0.0);
  
  data_out[idx * 4u] = bla.dz.x;
  data_out[idx * 4u + 1u] = bla.dz.y;
  data_out[idx * 4u + 2u] = bla.iter;
  data_out[idx * 4u + 3u] = select(0.0, 1.0, bla.advanced);
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
  
  // Terminal Resolving during Progressive Rendering.
  // `cp.iter = -1.0` is the sentinel value mathematically asserting this pixel has escaped completely.
  // During accumulating frames (`load_checkpoint`), we don't clear or wipe the accumulator for these pixels.
  // We simply copy their terminal stored pixel output natively into the ping-pong compositor.
  if (cp.iter < 0.0 && camera.load_checkpoint > 0.5) {
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
