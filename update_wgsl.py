import re

with open("src/engine/shaders/escape/math_accum.wgsl", "r") as f:
    wgsl = f.read()

# Replace CameraParams
wgsl = re.sub(
    r"struct CameraParams \{[^\}]+\};",
    """struct CameraParams {
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
  jitter_x: f32,
  jitter_y: f32,
  blend_weight: f32,
  render_scale: f32,
  yield_iter_limit: f32,
  is_resume: f32,
  is_final_slice: f32,
  canvas_width: f32,
};""",
    wgsl
)

# Add CheckpointState
if "struct CheckpointState" not in wgsl:
    wgsl = wgsl.replace(
        "@group(0) @binding(0) var<uniform> camera: CameraParams;",
        """struct CheckpointState {
  zx: f32, zy: f32,
  der_x: f32, der_y: f32,
  iter: f32, tia_sum: f32,
  dz_x: f32, dz_y: f32,
};

@group(0) @binding(0) var<uniform> camera: CameraParams;"""
    )

# Replace bindings
wgsl = wgsl.replace(
    "@group(0) @binding(4) var prev_frame: texture_2d<f32>;",
    """@group(0) @binding(4) var readTex: texture_2d<f32>;
@group(0) @binding(5) var<storage, read_write> checkpoint: array<CheckpointState>;"""
)

# continue_mandelbrot_iterations signature
wgsl = wgsl.replace(
    "fn continue_mandelbrot_iterations(start_z: vec2<f32>, start_c: vec2<f32>, start_iter: f32, max_iterations: f32, start_der_x: f32, start_der_y: f32, start_tia: f32) -> vec4<f32> {",
    "fn continue_mandelbrot_iterations(start_z: vec2<f32>, start_c: vec2<f32>, start_iter: f32, max_iterations: f32, start_der_x: f32, start_der_y: f32, start_tia: f32, pixel_idx: u32) -> vec4<f32> {"
)

# Continue_mandelbrot_iterations initialization
wgsl = wgsl.replace(
    """  var x = start_z.x;
  var y = start_z.y;
  var der_x = start_der_x;
  var der_y = start_der_y;
  var iter = start_iter;
  let d = camera.exponent;
  var prev_z_mag = length(vec2<f32>(x, y));
  let c_mag = length(start_c);
  var tia_sum = start_tia;""",
    """  var x = start_z.x;
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
  let c_mag = length(start_c);"""
)

# Replace loop bound in continue_mandelbrot
wgsl = wgsl.replace("while (iter < max_iterations) {", "while (iter < target_iter) {")

# Replace get_escape_data calls in continue
wgsl = wgsl.replace(
    "return get_escape_data(iter, x, y, der_x, der_y, 1.0, tia_sum);",
    """let ret = get_escape_data(iter, x, y, der_x, der_y, 1.0, tia_sum);
      checkpoint[pixel_idx] = CheckpointState(ret.x, ret.y, ret.z, ret.w, -1.0, 0.0, 0.0, 0.0);
      return ret;"""
)
wgsl = wgsl.replace(
    "return vec4<f32>(max_iterations, 0.0, 0.0, 0.0);",
    """let ret = vec4<f32>(max_iterations, 0.0, 0.0, 0.0);
      checkpoint[pixel_idx] = CheckpointState(ret.x, ret.y, ret.z, ret.w, -1.0, 0.0, 0.0, 0.0);
      return ret;"""
)

# Ensure the end of continue_mandelbrot yields if hit target_iter
wgsl = wgsl.replace(
    """    check_mu -= 1.0;
    if (check_mu == 0.0) {
      check_z = vec2<f32>(x, y);
      check_lam *= 2.0;
      check_mu = check_lam;
    }
  }
  let ret = vec4<f32>(max_iterations, 0.0, 0.0, 0.0);
      checkpoint[pixel_idx] = CheckpointState(ret.x, ret.y, ret.z, ret.w, -1.0, 0.0, 0.0, 0.0);
      return ret;
}""",
    """    check_mu -= 1.0;
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
}"""
)


# calculate_mandelbrot_iterations signature
wgsl = wgsl.replace(
    "fn calculate_mandelbrot_iterations(start_z: vec2<f32>, start_c: vec2<f32>, max_iterations: f32) -> vec4<f32> {",
    "fn calculate_mandelbrot_iterations(start_z: vec2<f32>, start_c: vec2<f32>, max_iterations: f32, pixel_idx: u32) -> vec4<f32> {"
)
wgsl = wgsl.replace(
    "return continue_mandelbrot_iterations(start_z, start_c, 0.0, max_iterations, 1.0, 0.0, 0.0);",
    "return continue_mandelbrot_iterations(start_z, start_c, 0.0, max_iterations, 1.0, 0.0, 0.0, pixel_idx);"
)
wgsl = wgsl.replace(
    """  if (camera.exponent == 2.0 && start_z.x == 0.0 && start_z.y == 0.0) {
    if (is_interior_analytic(start_c.x, start_c.y)) {
      let ret = vec4<f32>(max_iterations, 0.0, 0.0, 0.0);
      checkpoint[pixel_idx] = CheckpointState(ret.x, ret.y, ret.z, ret.w, -1.0, 0.0, 0.0, 0.0);
      return ret;
    }
  }""",
    """  if (camera.exponent == 2.0 && start_z.x == 0.0 && start_z.y == 0.0) {
    if (is_interior_analytic(start_c.x, start_c.y)) {
      let ret = vec4<f32>(max_iterations, 0.0, 0.0, 0.0);
      checkpoint[pixel_idx] = CheckpointState(ret.x, ret.y, ret.z, ret.w, -1.0, 0.0, 0.0, 0.0);
      return ret;
    }
  }"""
)


# calculate_perturbation signature
wgsl = wgsl.replace(
    "fn calculate_perturbation(start_z: vec2<f32>, start_c: vec2<f32>, delta_z: vec2<f32>, delta_c: vec2<f32>, ref_offset: u32, max_iterations: f32, ref_cycle: f32, ref_escaped_iter: f32) -> vec4<f32> {",
    "fn calculate_perturbation(start_z: vec2<f32>, start_c: vec2<f32>, delta_z: vec2<f32>, delta_c: vec2<f32>, ref_offset: u32, max_iterations: f32, ref_cycle: f32, ref_escaped_iter: f32, pixel_idx: u32) -> vec4<f32> {"
)

wgsl = wgsl.replace(
    """  if (ref_cycle == 1.0 && delta_c.x == 0.0 && delta_c.y == 0.0 && delta_z.x == 0.0 && delta_z.y == 0.0) {
     let ret = vec4<f32>(max_iterations, 0.0, 0.0, 0.0);
      checkpoint[pixel_idx] = CheckpointState(ret.x, ret.y, ret.z, ret.w, -1.0, 0.0, 0.0, 0.0);
      return ret;
  }
  
  var dz = delta_z;
  var iter = 0.0;
  var der_x = 1.0;
  var der_y = 0.0;
  
  let initial_x = unpack_f64_to_f32(ref_orbits[ref_offset]) + dz.x;
  let initial_y = unpack_f64_to_f32(ref_orbits[ref_offset + 1u]) + dz.y;
  var prev_z_mag = length(vec2<f32>(initial_x, initial_y));
  let c_mag = length(start_c);
  var tia_sum = 0.0;
  
  if (initial_x * initial_x + initial_y * initial_y > 4.0) {
    let ret = get_escape_data(iter, initial_x, initial_y, der_x, der_y, 1.0, tia_sum);
      checkpoint[pixel_idx] = CheckpointState(ret.x, ret.y, ret.z, ret.w, -1.0, 0.0, 0.0, 0.0);
      return ret;
  }

  while (iter < max_iterations) {""",
    """  if (ref_cycle == 1.0 && delta_c.x == 0.0 && delta_c.y == 0.0 && delta_z.x == 0.0 && delta_z.y == 0.0) {
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
     
     let initial_x_resume = unpack_f64_to_f32(ref_orbits[ref_offset + u32(iter)*2u]) + dz.x;
     let initial_y_resume = unpack_f64_to_f32(ref_orbits[ref_offset + u32(iter)*2u + 1u]) + dz.y;
     prev_z_mag = length(vec2<f32>(initial_x_resume, initial_y_resume));
  } else {
     let initial_x = unpack_f64_to_f32(ref_orbits[ref_offset]) + dz.x;
     let initial_y = unpack_f64_to_f32(ref_orbits[ref_offset + 1u]) + dz.y;
     prev_z_mag = length(vec2<f32>(initial_x, initial_y));
     if (initial_x * initial_x + initial_y * initial_y > 4.0) {
        let ret = get_escape_data(iter, initial_x, initial_y, der_x, der_y, 1.0, tia_sum);
        checkpoint[pixel_idx] = CheckpointState(ret.x, ret.y, ret.z, ret.w, -1.0, 0.0, 0.0, 0.0);
        return ret;
     }
  }

  let c_mag = length(start_c);
  let target_iter = min(max_iterations, iter + camera.yield_iter_limit);

  while (iter < target_iter) {"""
)

wgsl = wgsl.replace(
    "return get_escape_data(iter, cur_x, cur_y, der_x, der_y, 2.0, tia_sum);",
    """let ret = get_escape_data(iter, cur_x, cur_y, der_x, der_y, 2.0, tia_sum);
      checkpoint[pixel_idx] = CheckpointState(ret.x, ret.y, ret.z, ret.w, -1.0, 0.0, 0.0, 0.0);
      return ret;"""
)

wgsl = wgsl.replace(
    "return continue_mandelbrot_iterations(vec2<f32>(cur_x, cur_y), start_c, iter, max_iterations, der_x, der_y, tia_sum);",
    "return continue_mandelbrot_iterations(vec2<f32>(cur_x, cur_y), start_c, iter, max_iterations, der_x, der_y, tia_sum, pixel_idx);"
)

wgsl = wgsl.replace(
    """    if (iter >= ref_escaped_iter && ref_escaped_iter < max_iterations) {
      return continue_mandelbrot_iterations(vec2<f32>(cur_x, cur_y), start_c, iter, max_iterations, der_x, der_y, tia_sum, pixel_idx);
    }
  }
  let ret = vec4<f32>(max_iterations, 0.0, 0.0, 0.0);
      checkpoint[pixel_idx] = CheckpointState(ret.x, ret.y, ret.z, ret.w, -1.0, 0.0, 0.0, 0.0);
      return ret;
}""",
    """    if (iter >= ref_escaped_iter && ref_escaped_iter < max_iterations) {
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
}"""
)


# execute_engine_math
wgsl = wgsl.replace(
    "fn execute_engine_math(start_z: vec2<f32>, start_c: vec2<f32>, delta_z: vec2<f32>, delta_c: vec2<f32>, ref_offset: u32) -> vec4<f32> {",
    "fn execute_engine_math(start_z: vec2<f32>, start_c: vec2<f32>, delta_z: vec2<f32>, delta_c: vec2<f32>, ref_offset: u32, pixel_idx: u32) -> vec4<f32> {"
)

wgsl = wgsl.replace(
    """  if (camera.use_perturbation > 0.5) {
     let floats_per_case = u32(camera.ref_max_iter) * 2u + 8u;
     let cycle = unpack_f64_to_f32(ref_orbits[ref_offset + u32(camera.ref_max_iter) * 2u]);
     let ref_escaped_iter = unpack_f64_to_f32(ref_orbits[ref_offset + u32(camera.ref_max_iter) * 2u + 3u]);
     return calculate_perturbation(start_z, start_c, delta_z, delta_c, ref_offset, camera.ref_max_iter, cycle, ref_escaped_iter);
  } else {
     return calculate_mandelbrot_iterations(start_z, start_c, camera.max_iter);
  }""",
    """  if (camera.use_perturbation > 0.5) {
     let floats_per_case = u32(camera.ref_max_iter) * 2u + 8u;
     let cycle = unpack_f64_to_f32(ref_orbits[ref_offset + u32(camera.ref_max_iter) * 2u]);
     let ref_escaped_iter = unpack_f64_to_f32(ref_orbits[ref_offset + u32(camera.ref_max_iter) * 2u + 3u]);
     
     if (camera.is_resume > 0.5 && checkpoint[pixel_idx].iter > 0.0 && checkpoint[pixel_idx].iter >= ref_escaped_iter && ref_escaped_iter < camera.max_iter) {
         return continue_mandelbrot_iterations(vec2<f32>(0.0,0.0), start_c, 0.0, camera.max_iter, 1.0, 0.0, 0.0, pixel_idx);
     }
     
     return calculate_perturbation(start_z, start_c, delta_z, delta_c, ref_offset, camera.ref_max_iter, cycle, ref_escaped_iter, pixel_idx);
  } else {
     return calculate_mandelbrot_iterations(start_z, start_c, camera.max_iter, pixel_idx);
  }"""
)


# main_compute
wgsl = wgsl.replace(
    "let ret = execute_engine_math(input_z, input_c, delta_z, delta_c, ref_offset);",
    "let ret = execute_engine_math(input_z, input_c, delta_z, delta_c, ref_offset, idx);"
)


# fs_main
wgsl = wgsl.replace(
    """@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  let uv_mapped = vec2<f32>((in.uv.x + camera.jitter_x) * camera.scale * camera.aspect, (in.uv.y + camera.jitter_y) * camera.scale);
  
  let cos_theta = cos(camera.slice_angle);
  let sin_theta = sin(camera.slice_angle);
  
  let delta_z = vec2<f32>(camera.zr, camera.zi) + uv_mapped * sin_theta;
  let delta_c = vec2<f32>(camera.cr, camera.ci) + uv_mapped * cos_theta;
  
  let ref_end = u32(camera.ref_max_iter) * 2u;
  let abs_zr = unpack_f64_to_f32(ref_orbits[ref_end + 4u]);
  let abs_zi = unpack_f64_to_f32(ref_orbits[ref_end + 5u]);
  let abs_cr = unpack_f64_to_f32(ref_orbits[ref_end + 6u]);
  let abs_ci = unpack_f64_to_f32(ref_orbits[ref_end + 7u]);
  
  let start_z = select(vec2<f32>(camera.zr, camera.zi) + uv_mapped * sin_theta, vec2<f32>(abs_zr, abs_zi) + delta_z, camera.use_perturbation > 0.5);
  let start_c = select(vec2<f32>(camera.cr, camera.ci) + uv_mapped * cos_theta, vec2<f32>(abs_cr, abs_ci) + delta_c, camera.use_perturbation > 0.5);
  
  let ret = execute_engine_math(start_z, start_c, delta_z, delta_c, 0u);

  // blend_weight == 0.0  → replace prev buffer (first frame / INTERACT)
  // blend_weight == 1/N  → mix(prev, current, 1/N) for Nth accumulated frame
  // select() avoids sampling prev_frame at all when no blending is needed.
  let prev = select(ret, textureLoad(prev_frame, vec2<i32>(in.position.xy), 0), camera.blend_weight > 0.0);
  return mix(prev, ret, select(1.0, camera.blend_weight, camera.blend_weight > 0.0));
}""",
    """@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  let pixel_id = u32(in.position.y) * u32(camera.canvas_width) + u32(in.position.x);
  let coord = vec2<i32>(in.position.xy);
  var cp = checkpoint[pixel_id];
  
  if (camera.is_final_slice < 0.5) {
      if (cp.iter < 0.0 && camera.is_resume > 0.5) {
          return textureLoad(readTex, coord, 0); 
      }
  } else {
      if (cp.iter < 0.0 && camera.is_resume > 0.5) {
          let stored_result = vec4<f32>(cp.zx, cp.zy, cp.der_x, cp.der_y);
          let prev = textureLoad(readTex, coord, 0);
          return mix(prev, stored_result, select(1.0, camera.blend_weight, camera.blend_weight > 0.0));
      }
  }

  let uv_mapped = vec2<f32>((in.uv.x + camera.jitter_x) * camera.scale * camera.aspect, (in.uv.y + camera.jitter_y) * camera.scale);
  
  let cos_theta = cos(camera.slice_angle);
  let sin_theta = sin(camera.slice_angle);
  
  let delta_z = vec2<f32>(camera.zr, camera.zi) + uv_mapped * sin_theta;
  let delta_c = vec2<f32>(camera.cr, camera.ci) + uv_mapped * cos_theta;
  
  let ref_end = u32(camera.ref_max_iter) * 2u;
  let abs_zr = unpack_f64_to_f32(ref_orbits[ref_end + 4u]);
  let abs_zi = unpack_f64_to_f32(ref_orbits[ref_end + 5u]);
  let abs_cr = unpack_f64_to_f32(ref_orbits[ref_end + 6u]);
  let abs_ci = unpack_f64_to_f32(ref_orbits[ref_end + 7u]);
  
  let start_z = select(vec2<f32>(camera.zr, camera.zi) + uv_mapped * sin_theta, vec2<f32>(abs_zr, abs_zi) + delta_z, camera.use_perturbation > 0.5);
  let start_c = select(vec2<f32>(camera.cr, camera.ci) + uv_mapped * cos_theta, vec2<f32>(abs_cr, abs_ci) + delta_c, camera.use_perturbation > 0.5);
  
  let ret = execute_engine_math(start_z, start_c, delta_z, delta_c, 0u, pixel_id);
  
  if (ret.x < -1.0) {
      if (camera.is_resume > 0.5) {
          return textureLoad(readTex, coord, 0);
      } else {
          return vec4<f32>(0.0);
      }
  }
  
  if (camera.is_final_slice > 0.5) {
      let prev = textureLoad(readTex, coord, 0);
      return mix(prev, ret, select(1.0, camera.blend_weight, camera.blend_weight > 0.0));
  } else {
      return ret;
  }
}"""
)

with open("src/engine/shaders/escape/math_accum.wgsl", "w") as f:
    f.write(wgsl)

print("Done")
