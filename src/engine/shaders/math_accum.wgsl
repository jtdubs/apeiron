struct CameraParams {
  zr: f32,
  zi: f32,
  cr: f32,
  ci: f32,
  scale: f32,
  aspect: f32,
  max_iter: f32,
  slice_angle: f32,
  use_perturbation: f32,
  ref_max_iter: f32,
  exponent: f32,
  coloring_mode: f32,
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

fn continue_mandelbrot_iterations(start_z: vec2<f32>, start_c: vec2<f32>, start_iter: f32, max_iterations: f32, start_der_x: f32, start_der_y: f32, start_tia: f32) -> vec4<f32> {
  var x = start_z.x;
  var y = start_z.y;
  var der_x = start_der_x;
  var der_y = start_der_y;
  var iter = start_iter;
  let d = camera.exponent;
  var prev_z_mag = length(vec2<f32>(x, y));
  let c_mag = length(start_c);
  var tia_sum = start_tia;

  while (iter < max_iterations) {
    let mag_sq = x * x + y * y;
    if (mag_sq > 4.0) {
      return get_escape_data(iter, x, y, der_x, der_y, 1.0, tia_sum);
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
    
    x = new_x;
    y = new_y;
    der_x = new_der_x;
    der_y = new_der_y;
    iter += 1.0;
  }
  return vec4<f32>(max_iterations, 0.0, 0.0, 0.0);
}

fn calculate_mandelbrot_iterations(start_z: vec2<f32>, start_c: vec2<f32>, max_iterations: f32) -> vec4<f32> {
  return continue_mandelbrot_iterations(start_z, start_c, 0.0, max_iterations, 1.0, 0.0, 0.0);
}

@group(0) @binding(1) var<storage, read> data_in: array<f32>;
@group(0) @binding(2) var<storage, read_write> data_out: array<f32>;
@group(0) @binding(3) var<storage, read> ref_orbits: array<f32>;

fn calculate_perturbation(start_z: vec2<f32>, start_c: vec2<f32>, delta_z: vec2<f32>, delta_c: vec2<f32>, ref_offset: u32, max_iterations: f32, ref_cycle: f32, ref_escaped_iter: f32) -> vec4<f32> {
  if (ref_cycle == 1.0 && delta_c.x == 0.0 && delta_c.y == 0.0 && delta_z.x == 0.0 && delta_z.y == 0.0) {
     return vec4<f32>(max_iterations, 0.0, 0.0, 0.0);
  }
  
  var dz = delta_z;
  var iter = 0.0;
  var der_x = 1.0;
  var der_y = 0.0;
  
  let initial_x = ref_orbits[ref_offset] + dz.x;
  let initial_y = ref_orbits[ref_offset + 1u] + dz.y;
  var prev_z_mag = length(vec2<f32>(initial_x, initial_y));
  let c_mag = length(start_c);
  var tia_sum = 0.0;
  
  if (initial_x * initial_x + initial_y * initial_y > 4.0) {
    return get_escape_data(iter, initial_x, initial_y, der_x, der_y, 1.0, tia_sum);
  }

  while (iter < max_iterations) {
    let zx = ref_orbits[ref_offset + u32(iter) * 2u];
    let zy = ref_orbits[ref_offset + u32(iter) * 2u + 1u];
    
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
    der_x = new_der_x;
    der_y = new_der_y;

    dz = dz_next;
    
    let next_zx = ref_orbits[ref_offset + u32(iter + 1.0) * 2u];
    let next_zy = ref_orbits[ref_offset + u32(iter + 1.0) * 2u + 1u];
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
    
    if (cur_mag > 1000000.0) {
      return vec4<f32>(max_iterations, 0.0, 0.0, 0.0);
    }
    
    if (cur_mag > 4.0) {
      return get_escape_data(iter, cur_x, cur_y, der_x, der_y, 2.0, tia_sum);
    }
    
    iter += 1.0;
    
    if (iter >= ref_escaped_iter && ref_escaped_iter < max_iterations) {
      return continue_mandelbrot_iterations(vec2<f32>(cur_x, cur_y), start_c, iter, max_iterations, der_x, der_y, tia_sum);
    }
  }
  return vec4<f32>(max_iterations, 0.0, 0.0, 0.0);
}

fn execute_engine_math(start_z: vec2<f32>, start_c: vec2<f32>, delta_z: vec2<f32>, delta_c: vec2<f32>, ref_offset: u32) -> vec4<f32> {
  if (camera.use_perturbation > 0.5) {
     let floats_per_case = u32(camera.ref_max_iter) * 2u + 4u;
     let cycle = ref_orbits[ref_offset + u32(camera.ref_max_iter) * 2u];
     let ref_escaped_iter = ref_orbits[ref_offset + u32(camera.ref_max_iter) * 2u + 3u];
     return calculate_perturbation(start_z, start_c, delta_z, delta_c, ref_offset, camera.ref_max_iter, cycle, ref_escaped_iter);
  } else {
     return calculate_mandelbrot_iterations(start_z, start_c, camera.max_iter);
  }
}

@compute @workgroup_size(1)
fn main_compute(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let idx = global_id.x;
  
  let input_z = vec2<f32>(data_in[idx * 6u], data_in[idx * 6u + 1u]);
  let input_c = vec2<f32>(data_in[idx * 6u + 2u], data_in[idx * 6u + 3u]);
  let delta_c = vec2<f32>(data_in[idx * 6u + 4u], data_in[idx * 6u + 5u]);
  let delta_z = vec2<f32>(0.0, 0.0);
  
  let floats_per_case = u32(camera.ref_max_iter) * 2u + 4u;
  let ref_offset = idx * floats_per_case;

  let ret = execute_engine_math(input_z, input_c, delta_z, delta_c, ref_offset);
  let iter = ret.x;
  
  data_out[idx * 2] = iter;
  if (iter < camera.max_iter) {
    data_out[idx * 2 + 1] = 1.0;
  } else {
    data_out[idx * 2 + 1] = 0.0;
  }
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
  let uv_mapped = vec2<f32>(in.uv.x * camera.scale * camera.aspect, in.uv.y * camera.scale);
  
  let cos_theta = cos(camera.slice_angle);
  let sin_theta = sin(camera.slice_angle);
  
  let delta_z = vec2<f32>(camera.zr, camera.zi) + uv_mapped * sin_theta;
  let delta_c = vec2<f32>(camera.cr, camera.ci) + uv_mapped * cos_theta;
  
  let start_z = select(vec2<f32>(camera.zr, camera.zi) + uv_mapped * sin_theta, delta_z, camera.use_perturbation > 0.5);
  let start_c = select(vec2<f32>(camera.cr, camera.ci) + uv_mapped * cos_theta, delta_c, camera.use_perturbation > 0.5);
  
  let ret = execute_engine_math(start_z, start_c, delta_z, delta_c, 0u);
  
  return ret;
}
