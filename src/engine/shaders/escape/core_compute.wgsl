// #import "./generated/layout.wgsl"
// #import "./generated/layout_accessors.wgsl"
// #import "../math/complex.wgsl"
// #import "../math/polynomial.wgsl"
// #import "../math/double_single.wgsl"
// #import "../math/f64_decode.wgsl"
// #import "./standard_iteration.wgsl"
// #import "./bla_stepper.wgsl"
// #import "./perturbation.wgsl"

@id(0) override exponent_branch_mode: f32 = 0.0;
@id(1) override math_compute_mode: u32 = 0u;
@id(2) override coloring_mode: f32 = 0.0;

@group(0) @binding(0) var<uniform> camera: CameraParams;
@group(0) @binding(1) var<storage, read> data_in: array<f32>;
@group(0) @binding(2) var<storage, read_write> data_out: array<f32>;
@group(0) @binding(3) var<storage, read> ref_orbits: array<vec2<u32>>;
@group(0) @binding(4) var readTex: texture_2d<f32>;
@group(0) @binding(5) var<storage, read_write> checkpoint: array<CheckpointState>;
@group(0) @binding(6) var<storage, read_write> completion_flag: array<u32>;
@group(0) @binding(7) var g_buffer_out: texture_storage_2d<rgba32float, write>;
@group(0) @binding(8) var<storage, read> orbit_metadata: array<vec2<u32>>;
@group(0) @binding(9) var<storage, read> bla_grid: array<vec2<u32>>;
@group(0) @binding(10) var<storage, read> dsbla_grid: array<vec2<u32>>;
@group(0) @binding(11) var<storage, read> bta_grid: array<vec2<u32>>;

struct GlitchReadbackBuffer {
  count: atomic<u32>,
  records: array<GlitchRecord>
}
@group(0) @binding(12) var<storage, read_write> glitch_readback: GlitchReadbackBuffer;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

fn execute_engine_math(start_z: vec2<f32>, start_c: vec2<f32>, delta_z: vec2<f32>, delta_c: vec2<f32>, pixel_idx: u32, enable_bla: bool) -> vec4<f32> {
  if (math_compute_mode > 0u) {
     let orbit_meta = get_orbit_metadata();
     let cycle = orbit_meta.cycle_found;
     let ref_escaped_iter = orbit_meta.escaped_iter;
     
     // Progressive Render Perturbation Exhaustion.
     // If we are resuming a previously paused progressive pixel (`load_checkpoint` is active),
     // AND the paused pixel had already iterated deeply past the *reference orbit's* escape point,
     // we can no longer perturb! We must forcefully push the pixel into the standard fallback engine to finish.
     if (camera.load_checkpoint > 0.5 && checkpoint[pixel_idx].iter > 0.0 && checkpoint[pixel_idx].iter >= ref_escaped_iter && ref_escaped_iter < camera.compute_max_iter) {
         return continue_mandelbrot_iterations(vec2<f32>(0.0,0.0), start_c, 0.0, camera.compute_max_iter, 1.0, 0.0, 0.0, pixel_idx);
     }
     
     return calculate_perturbation(start_z, start_c, delta_z, delta_c, camera.ref_max_iter, cycle, ref_escaped_iter, pixel_idx, enable_bla);
  } else {
     return calculate_mandelbrot_iterations(start_z, start_c, camera.compute_max_iter, pixel_idx);
  }
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
  let sa = init_perturbation_state(vec2<f32>(dz_x, dz_y), vec2<f32>(dc_x, dc_y), idx);
  
  data_out[idx * 4u] = sa.dz.x;
  data_out[idx * 4u + 1u] = sa.dz.y;
  data_out[idx * 4u + 2u] = sa.der.x;
  data_out[idx * 4u + 3u] = sa.der.y;
}

@compute @workgroup_size(64)
fn unit_test_bla_advance(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let idx = global_id.x;
  if (idx * 8u >= arrayLength(&data_in)) {
      return;
  }
  let dz_in = vec2<f32>(data_in[idx * 8u], data_in[idx * 8u + 1u]);
  let iter_in = data_in[idx * 8u + 2u];
  
  let delta_c = vec2<f32>(data_in[idx * 8u + 3u], data_in[idx * 8u + 4u]);
  let start_c = vec2<f32>(data_in[idx * 8u + 5u], data_in[idx * 8u + 6u]);
  let target_iter = data_in[idx * 8u + 7u];
  
  let der_in = vec2<f32>(1.0, 0.0);
  
  let bla = advance_via_bla(dz_in, der_in, delta_c, start_c, iter_in, target_iter, camera.ref_max_iter, camera.compute_max_iter, idx, 0.0);
  
  data_out[idx * 4u] = bla.dz.x;
  data_out[idx * 4u + 1u] = bla.dz.y;
  data_out[idx * 4u + 2u] = bla.iter;
  
  // We can write testing values instead of just advanced
  if (!bla.advanced) {
      let bta_node = get_bta_node(0u, 15u);
      data_out[idx * 4u + 3u] = bta_node.err;
  } else {
      data_out[idx * 4u + 3u] = -1.0;
  }
}

@compute @workgroup_size(16, 16)
fn main_compute(@builtin(global_invocation_id) global_id: vec3<u32>) {
  if (global_id.x >= u32(camera.drs_width) || global_id.y >= u32(camera.drs_height)) {
    return;
  }
  let coord = vec2<i32>(global_id.xy);
  let pixel_id = u32(coord.y) * u32(camera.canvas_width) + u32(coord.x);
  var cp = checkpoint[pixel_id];
  
  // Terminal Resolving during Progressive Rendering.
  if (cp.iter < 0.0 && camera.load_checkpoint > 0.5) {
      let stored_result = vec4<f32>(cp.zx, cp.zy, cp.der_x, cp.der_y);
      let prev = textureLoad(readTex, coord, 0);
      let out_val = mix(prev, stored_result, select(1.0, camera.blend_weight, camera.blend_weight > 0.0));
      textureStore(g_buffer_out, coord, out_val);
      return;
  }

  let uv_x = (f32(global_id.x) + 0.5) / camera.drs_width * 2.0 - 1.0;
  let uv_y = 1.0 - (f32(global_id.y) + 0.5) / camera.drs_height * 2.0;

  let uv_mapped = vec2<f32>((uv_x + camera.jitter_x) * camera.scale * camera.aspect, (uv_y + camera.jitter_y) * camera.scale);
  
  let cos_theta = cos(camera.slice_angle);
  let sin_theta = sin(camera.slice_angle);
  
  let delta_z = vec2<f32>(camera.zr, camera.zi) + uv_mapped * sin_theta;
  let delta_c = vec2<f32>(camera.cr, camera.ci) + uv_mapped * cos_theta;
  
  let orbit_meta = get_orbit_metadata();
  let abs_zr = orbit_meta.abs_zr;
  let abs_zi = orbit_meta.abs_zi;
  let abs_cr = orbit_meta.abs_cr;
  let abs_ci = orbit_meta.abs_ci;
  
  let start_z = select(vec2<f32>(camera.zr, camera.zi) + uv_mapped * sin_theta, vec2<f32>(abs_zr, abs_zi) + delta_z, math_compute_mode > 0u);
  let start_c = select(vec2<f32>(camera.cr, camera.ci) + uv_mapped * cos_theta, vec2<f32>(abs_cr, abs_ci) + delta_c, math_compute_mode > 0u);
  var output_color: vec4<f32>;
  
  if (camera.debug_view_mode == 5.0 && math_compute_mode > 0u) {
      // 100% Synchronous Dual-Path BLA Diff rendering logic
      let cp_original = checkpoint[pixel_id];
      let ret_bla = execute_engine_math(start_z, start_c, delta_z, delta_c, pixel_id, true);
      checkpoint[pixel_id] = cp_original; // Restore to guarantee standard path has exact same origin context
      
      // We pass start_z and start_c (which already correctly include abs_zr/abs_cr reference anchor offsets)
      // directly to calculate_mandelbrot_iterations to simulate exact f32 ground truth geometry.
      let ret_std = calculate_mandelbrot_iterations(start_z, start_c, camera.compute_max_iter, pixel_id);
      checkpoint[pixel_id] = cp_original; // Destroy both states to prevent progressive accumulation side-effects
      
      var diff_col = vec3<f32>(0.0, 0.0, 0.5); // Default to Dark Blue
      if (ret_bla.x >= camera.compute_max_iter || ret_std.x >= camera.compute_max_iter) {
          diff_col = vec3<f32>(0.0, 0.0, 0.5); // Interior -> Dark Blue
      } else if (ret_bla.x > 0.0 && ret_std.x > 0.0) {
          let diff = abs(ret_bla.x - ret_std.x);
          diff_col = vec3<f32>(clamp(diff * 100.0, 0.0, 1.0), 0.0, 0.0); // Drift -> Red Heatmap
      } else if (ret_bla.x > 0.0 || ret_std.x > 0.0) {
          diff_col = vec3<f32>(1.0, 1.0, 0.0); // Escape Mismatch -> Solid Yellow
      }
      
      // Directly render to the output buffer, totally bypassing the progressive pipeline
      textureStore(g_buffer_out, coord, vec4<f32>(diff_col, 1.0));
      return;
  }
  
  let ret = execute_engine_math(start_z, start_c, delta_z, delta_c, pixel_id, true);
  output_color = ret;
  
  if (camera.debug_view_mode > 0.5) {
      if (camera.debug_view_mode == 1.0) {
          let is_limit = select(0.0, 1.0, ret.x >= camera.compute_max_iter);
          output_color = vec4<f32>(is_limit, 0.0, 1.0 - is_limit, 1.0);
      } else if (camera.debug_view_mode == 2.0) {
          var col = vec3<f32>(0.2, 0.2, 0.2);
          if (cp.iter > 0.0) { col = vec3<f32>(0.0, 1.0, 0.0); }
          else if (cp.iter < 0.0) { col = vec3<f32>(1.0, 0.0, 0.0); }
          output_color = vec4<f32>(col, 1.0);
      } else if (camera.debug_view_mode == 3.0) {
          let skip_ratio = clamp(camera.skip_iter / camera.compute_max_iter, 0.0, 1.0);
          output_color = vec4<f32>(skip_ratio, 0.5, 1.0 - skip_ratio, 1.0);
      } else if (camera.debug_view_mode == 4.0) {
          let strain = clamp(ret.y * camera.scale * 100.0, 0.0, 1.0);
          output_color = vec4<f32>(strain, strain, 0.0, 1.0);
      }
      
      // Still allow yielding to not flash black holes
      if (ret.x < -1.0) {
          if (camera.blend_weight > 0.0) {
              textureStore(g_buffer_out, coord, textureLoad(readTex, coord, 0));
          } else {
              textureStore(g_buffer_out, coord, vec4<f32>(camera.compute_max_iter, 0.0, 0.0, 0.0));
          }
          return;
      }
  } else {
      if (ret.x == -4.0) {
          textureStore(g_buffer_out, coord, vec4<f32>(1.0, 0.0, 0.0, 1.0));
          return;
      }
      if (ret.x == -5.0 || ret.x != ret.x || ret.y != ret.y) {
          textureStore(g_buffer_out, coord, vec4<f32>(1.0, 0.0, 1.0, 1.0));
          return;
      }
      if (ret.x == -6.0) {
          textureStore(g_buffer_out, coord, vec4<f32>(1.0, 0.5, 0.0, 1.0));
          return;
      }
      
      // Progressive Frame Accumulation
      if (ret.x < -1.0) {
          if (camera.blend_weight > 0.0) {
              textureStore(g_buffer_out, coord, textureLoad(readTex, coord, 0));
          } else {
              textureStore(g_buffer_out, coord, vec4<f32>(camera.compute_max_iter, 0.0, 0.0, 0.0));
          }
          return;
      }
      
      if (camera.blend_weight > 0.0) {
          let prev = textureLoad(readTex, coord, 0);
          output_color = mix(prev, output_color, camera.blend_weight);
      }
  }
  
  textureStore(g_buffer_out, coord, output_color);
}

@compute @workgroup_size(1)
fn unit_test_engine_math(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let idx = global_id.x;
  if (idx * 6u >= arrayLength(&data_in)) {
      return;
  }
  
  let input_z = vec2<f32>(data_in[idx * 6u], data_in[idx * 6u + 1u]);
  let input_c = vec2<f32>(data_in[idx * 6u + 2u], data_in[idx * 6u + 3u]);
  let delta_c = vec2<f32>(data_in[idx * 6u + 4u], data_in[idx * 6u + 5u]);
  let delta_z = vec2<f32>(0.0, 0.0);
  
  let ret = execute_engine_math(input_z, input_c, delta_z, delta_c, idx, true);
  
  data_out[idx * 4u] = ret.x;
  data_out[idx * 4u + 1u] = ret.y;
  data_out[idx * 4u + 2u] = ret.z;
  data_out[idx * 4u + 3u] = ret.w;
}

@compute @workgroup_size(64)
fn unit_test_ds_math(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let idx = global_id.x;
  if (idx * 4u >= arrayLength(&data_in)) {
      return;
  }
  
  let a = vec2<f32>(data_in[idx * 4u], data_in[idx * 4u + 1u]);
  let b = vec2<f32>(data_in[idx * 4u + 2u], data_in[idx * 4u + 3u]);
  
  let sum_res = ds_add(a, b);
  let mul_res = ds_mul(a, b);
  
  data_out[idx * 4u] = sum_res.x;
  data_out[idx * 4u + 1u] = sum_res.y;
  data_out[idx * 4u + 2u] = mul_res.x;
  data_out[idx * 4u + 3u] = mul_res.y;
}
