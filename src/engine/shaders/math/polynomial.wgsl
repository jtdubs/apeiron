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
  let p = max(fractal_exponent, 2.0);
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
  if (coloring_mode > 0.5) {
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

