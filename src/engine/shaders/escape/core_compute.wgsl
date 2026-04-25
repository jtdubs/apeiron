// #import "./generated/layout.wgsl"
// #import "../math/complex.wgsl"
// #import "../math/polynomial.wgsl"
// #import "../math/double_single.wgsl"
// #import "../math/f64_decode.wgsl"
// #import "./standard_iteration.wgsl"

@id(0) override exponent_branch_mode: f32 = 0.0;
@id(1) override math_compute_mode: u32 = 0u;
@id(2) override coloring_mode: f32 = 0.0;

@group(0) @binding(0) var<uniform> camera: CameraParams;
@group(0) @binding(1) var<storage, read> data_in: array<f32>;
@group(0) @binding(2) var<storage, read_write> data_out: array<f32>;
@group(0) @binding(4) var readTex: texture_2d<f32>;
@group(0) @binding(5) var<storage, read_write> checkpoint: array<CheckpointState>;
@group(0) @binding(6) var<storage, read_write> completion_flag: array<u32>;
@group(0) @binding(7) var g_buffer_out: texture_storage_2d<rgba32float, write>;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};




fn get_debug_color(ret: vec4<f32>, debug_mode: f32, max_iter: f32, scale: f32, skip_iter: f32, cp_iter: f32) -> vec4<f32> {
    if (debug_mode == 1.0) {
        let is_limit = select(0.0, 1.0, ret.x >= max_iter);
        return vec4<f32>(is_limit, 0.0, 1.0 - is_limit, 1.0);
    } else if (debug_mode == 2.0) {
        var col = vec3<f32>(0.2, 0.2, 0.2);
        if (cp_iter > 0.0) { col = vec3<f32>(0.0, 1.0, 0.0); }
        else if (cp_iter < 0.0) { col = vec3<f32>(1.0, 0.0, 0.0); }
        return vec4<f32>(col, 1.0);
    } else if (debug_mode == 3.0) {
        let skip_ratio = clamp(skip_iter / max_iter, 0.0, 1.0);
        return vec4<f32>(skip_ratio, 0.5, 1.0 - skip_ratio, 1.0);
    } else if (debug_mode == 4.0) {
        let strain = clamp(ret.y * scale * 100.0, 0.0, 1.0);
        return vec4<f32>(strain, strain, 0.0, 1.0);
    } else if (debug_mode == 6.0) {
        if (ret.x >= max_iter) {
            return vec4<f32>(1.0, 1.0, 1.0, 1.0); // White: Cycle Return
        } else if (ret.x < -1.0) {
            return vec4<f32>(0.2, 0.2, 0.2, 1.0); // Gray: Yielded
        } else {
            // Encode the exact escape iteration into Red and Green
            let norm_iter = clamp(ret.x / max_iter, 0.0, 1.0);
        }
    }
    return ret;
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
  let res = continue_mandelbrot_iterations(start_z, start_c, 0.0, 100.0, 1.0, 0.0, 0.0, idx, true);
  
  // Write the resulting checkpoint memory out to assert the FSM behaved correctly
  let cp = checkpoint[idx];
  data_out[idx * 4u] = cp.zx_hi;
  data_out[idx * 4u + 1u] = cp.zy_hi;
  data_out[idx * 4u + 2u] = cp.iter;
  data_out[idx * 4u + 3u] = cp.der_x;
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
      let stored_result = vec4<f32>(cp.zx_hi, cp.zy_hi, cp.der_x, cp.der_y);
      var out_val = stored_result;
      
      if (camera.debug_view_mode > 0.5 && camera.debug_view_mode != 5.0) {
          out_val = get_debug_color(stored_result, camera.debug_view_mode, camera.compute_max_iter, camera.scale, camera.skip_iter, cp.iter);
      }
      
      let prev = textureLoad(readTex, coord, 0);
      out_val = mix(prev, out_val, select(1.0, camera.blend_weight, camera.blend_weight > 0.0));
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
  
  var output_color: vec4<f32>;
  if (math_compute_mode == 1u) {
      let start_c_ds = complex_add_ds(
          vec4<f32>(camera.dc_high_x, camera.dc_low_x, camera.dc_high_y, camera.dc_low_y),
          vec4<f32>(uv_mapped.x * cos_theta, 0.0, uv_mapped.y * cos_theta, 0.0)
      );
      let start_z_ds = complex_add_ds(
          vec4<f32>(camera.zr, camera.dz_low_x, camera.zi, camera.dz_low_y),
          vec4<f32>(uv_mapped.x * sin_theta, 0.0, uv_mapped.y * sin_theta, 0.0)
      );
      
      let ret = calculate_mandelbrot_iterations_ds(start_z_ds, start_c_ds, camera.compute_max_iter, pixel_id);
      output_color = ret;
  } else {
      let start_z = vec2<f32>(camera.zr, camera.zi) + uv_mapped * sin_theta;
      let start_c = vec2<f32>(camera.cr, camera.ci) + uv_mapped * cos_theta;
      
      let ret = calculate_mandelbrot_iterations(start_z, start_c, camera.compute_max_iter, pixel_id);
      output_color = ret;
  }
  let ret = output_color;
  
  if (camera.debug_view_mode > 0.5) {
      if (camera.debug_view_mode != 5.0) {
          output_color = get_debug_color(ret, camera.debug_view_mode, camera.compute_max_iter, camera.scale, camera.skip_iter, cp.iter);
      }
      
      // Still allow yielding to not flash black holes
      if (ret.x < -1.0 && camera.debug_view_mode != 6.0 && camera.debug_view_mode != 5.0) {
          if (camera.blend_weight > 0.0) {
              textureStore(g_buffer_out, coord, textureLoad(readTex, coord, 0));
          } else {
              textureStore(g_buffer_out, coord, vec4<f32>(camera.compute_max_iter, 0.0, 0.0, 0.0));
          }
          return;
      }
  } else {
      // Progressive Frame Accumulation
      if (ret.x == -1.0 || ret.x == -2.0) {
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

@compute @workgroup_size(64)
fn unit_test_engine_math(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let idx = global_id.x;
  if (idx * 6u >= arrayLength(&data_in)) {
      return;
  }
  
  let input_z = vec2<f32>(data_in[idx * 6u], data_in[idx * 6u + 1u]);
  let input_c = vec2<f32>(data_in[idx * 6u + 2u], data_in[idx * 6u + 3u]);
  
  let ret = calculate_mandelbrot_iterations(input_z, input_c, camera.compute_max_iter, idx);
  
  data_out[idx * 4u] = ret.x;
  data_out[idx * 4u + 1u] = ret.y;
  data_out[idx * 4u + 2u] = ret.z;
  data_out[idx * 4u + 3u] = ret.w;
}
