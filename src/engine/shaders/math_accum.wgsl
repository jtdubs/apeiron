struct CameraParams {
  zr: f32,
  zi: f32,
  cr: f32,
  ci: f32,
  scale: f32,
  aspect: f32,
  max_iter: f32,
  slice_angle: f32,
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

@compute @workgroup_size(1)
fn main_compute(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let idx = global_id.x;
  
  let zr = data_in[idx * 4];
  let zi = data_in[idx * 4 + 1];
  let cr = data_in[idx * 4 + 2];
  let ci = data_in[idx * 4 + 3];
  
  let iter = calculate_mandelbrot_iterations(vec2<f32>(zr, zi), vec2<f32>(cr, ci), camera.max_iter);
  
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
  
  let iter = calculate_mandelbrot_iterations(start_z, start_c, camera.max_iter);
  
  return vec4<f32>(iter, 0.0, 0.0, 1.0);
}
