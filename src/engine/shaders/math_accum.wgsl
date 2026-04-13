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
  pad1: f32,
  pad2: f32,
  pad3: f32,
};

@group(0) @binding(0) var<uniform> camera: CameraParams;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

fn calculate_mandelbrot_iterations(start_z: vec2<f32>, start_c: vec2<f32>, max_iterations: f32) -> f32 {
  var x = start_z.x;
  var y = start_z.y;
  var iter = 0.0;

  while (iter < max_iterations) {
    let x2 = x * x;
    let y2 = y * y;
    if (x2 + y2 > 4.0) {
      let log_z = 0.5 * log(x2 + y2);
      let smooth_iter = iter + 1.0 - log2(log_z);
      return smooth_iter;
    }
    let new_x = x2 - y2 + start_c.x;
    y = 2.0 * x * y + start_c.y;
    x = new_x;
    iter += 1.0;
  }
  return iter;
}

@group(0) @binding(1) var<storage, read> data_in: array<f32>;
@group(0) @binding(2) var<storage, read_write> data_out: array<f32>;
@group(0) @binding(3) var<storage, read> ref_orbits: array<f32>;

fn calculate_perturbation(start_c: vec2<f32>, ref_c: vec2<f32>, ref_offset: u32, max_iterations: f32, ref_cycle: f32, ref_escaped_iter: f32) -> f32 {
  let delta_c = start_c - ref_c;
  
  // We intentionally do NOT short circuit if delta_c == 0.0 
  // because we want the smooth iteration (log) coloring logic to apply 
  // uniformly via the proxy calculation at the end of the orbit.
  if (ref_cycle == 1.0 && delta_c.x == 0.0 && delta_c.y == 0.0) {
     return max_iterations;
  }
  
  var dz = vec2<f32>(0.0, 0.0);
  var iter = 0.0;
  
  while (iter < max_iterations) {
    let zx = ref_orbits[ref_offset + u32(iter) * 2u];
    let zy = ref_orbits[ref_offset + u32(iter) * 2u + 1u];
    
    let dz2_x = dz.x * dz.x - dz.y * dz.y;
    let dz2_y = 2.0 * dz.x * dz.y;
    
    let two_z_dz_x = 2.0 * (zx * dz.x - zy * dz.y);
    let two_z_dz_y = 2.0 * (zx * dz.y + zy * dz.x);
    
    dz = vec2<f32>(two_z_dz_x + dz2_x + delta_c.x, two_z_dz_y + dz2_y + delta_c.y);
    
    let cur_x = zx + dz.x;
    let cur_y = zy + dz.y;
    
    if (cur_x * cur_x + cur_y * cur_y > 4.0) {
      let log_z = 0.5 * log(cur_x * cur_x + cur_y * cur_y);
      let smooth_iter = iter + 1.0 - log2(log_z);
      return smooth_iter;
    }
    
    iter += 1.0;
    
    // Fallback: If we far exceed the reference orbit's bounds (e.g. proxy failure),
    // break and return iter. Give it a buffer of +10 iterations to allow natural pixel escape.
    if (iter > ref_escaped_iter + 10.0 && ref_escaped_iter < max_iterations) {
      break;
    }
  }
  return iter;
}

fn execute_engine_math(start_z: vec2<f32>, start_c: vec2<f32>, ref_c: vec2<f32>, ref_offset: u32) -> f32 {
  if (camera.use_perturbation > 0.5) {
     let floats_per_case = u32(camera.max_iter) * 2u + 4u;
     let cycle = ref_orbits[ref_offset + u32(camera.max_iter) * 2u];
     let ref_escaped_iter = ref_orbits[ref_offset + u32(camera.max_iter) * 2u + 3u];
     return calculate_perturbation(start_c, ref_c, ref_offset, camera.max_iter, cycle, ref_escaped_iter);
  } else {
     return calculate_mandelbrot_iterations(start_z, start_c, camera.max_iter);
  }
}

@compute @workgroup_size(1)
fn main_compute(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let idx = global_id.x;
  
  let start_z = vec2<f32>(data_in[idx * 4], data_in[idx * 4 + 1]);
  let start_c = vec2<f32>(data_in[idx * 4 + 2], data_in[idx * 4 + 3]);
  
  let floats_per_case = u32(camera.max_iter) * 2u + 4u;
  let ref_offset = idx * floats_per_case;

  let iter = execute_engine_math(start_z, start_c, start_c, ref_offset);
  
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
  // Map our unit viewport rect (-1 to +1) to the actual math bounds.
  let uv_mapped = vec2<f32>(in.uv.x * camera.scale * camera.aspect, in.uv.y * camera.scale);
  
  let cos_theta = cos(camera.slice_angle);
  let sin_theta = sin(camera.slice_angle);
  
  let start_z = vec2<f32>(camera.zr, camera.zi) + uv_mapped * sin_theta;
  let start_c = vec2<f32>(camera.cr, camera.ci) + uv_mapped * cos_theta;
  let ref_c   = vec2<f32>(camera.cr, camera.ci);
  
  let iter = execute_engine_math(start_z, start_c, ref_c, 0u);
  
  return vec4<f32>(iter, 0.0, 0.0, 1.0);
}
