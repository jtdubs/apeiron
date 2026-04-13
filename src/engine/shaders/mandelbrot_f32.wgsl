struct CameraParams {
  center: vec2<f32>,
  scale: f32,
  aspect: f32,
  max_iter: f32,
  pad1: f32,
  pad2: f32,
  pad3: f32, // Padding to 32 bytes (must be multiple of 16)
};

@group(0) @binding(0) var<uniform> camera: CameraParams;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

fn calculate_mandelbrot_iterations(x0: f32, y0: f32, max_iterations: f32) -> f32 {
  var x = 0.0;
  var y = 0.0;
  var iter = 0.0;

  while (iter < max_iterations) {
    let x2 = x * x;
    let y2 = y * y;
    if (x2 + y2 > 4.0) {
      // Smooth Iteration
      // length(z) = sqrt(x2 + y2)
      // ln(length(z)) = 0.5 * log(x2 + y2)
      let log_z = 0.5 * log(x2 + y2);
      let smooth_iter = iter + 1.0 - log2(log_z);
      return smooth_iter;
    }
    let new_x = x2 - y2 + x0;
    y = 2.0 * x * y + y0;
    x = new_x;
    iter += 1.0;
  }
  return iter;
}

@group(0) @binding(1) var<storage, read_write> data: array<f32>;

@compute @workgroup_size(1)
fn main_compute(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let idx = global_id.x;
  
  let x0 = data[idx * 2];
  let y0 = data[idx * 2 + 1];
  
  let iter = calculate_mandelbrot_iterations(x0, y0, camera.max_iter);
  
  data[idx * 2] = iter;
  if (iter < camera.max_iter) {
    data[idx * 2 + 1] = 1.0;
  } else {
    data[idx * 2 + 1] = 0.0;
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
  // UV naturally maps from -1.0 to 1.0
  out.uv = pos[VertexIndex];
  return out;
}

// Cosine palette function: a + b * cos(2.0 * PI * (c * t + d))
fn palette(t: f32, a: vec3<f32>, b: vec3<f32>, c: vec3<f32>, d: vec3<f32>) -> vec3<f32> {
  return a + b * cos(6.28318530718 * (c * t + d));
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  // Map our unit viewport rect (-1 to +1) to the actual math bounds.
  // We use the aspect ratio strictly on the X axis to correct non-square screen shapes.
  let x0 = in.uv.x * camera.scale * camera.aspect + camera.center.x;
  let y0 = in.uv.y * camera.scale + camera.center.y;
  
  let iter = calculate_mandelbrot_iterations(x0, y0, camera.max_iter);
  
  if (iter >= camera.max_iter) {
    // Inside the set (Black)
    return vec4<f32>(0.0, 0.0, 0.0, 1.0);
  } else {
    // Outside the set (Cosine Palette based on smooth iterations)
    // t varies smoothly based on iterations
    let t = iter / camera.max_iter;
    
    // A standard, visually pleasing blue/orange cosine palette
    let a = vec3<f32>(0.5, 0.5, 0.5);
    let b = vec3<f32>(0.5, 0.5, 0.5);
    let c = vec3<f32>(1.0, 1.0, 1.0);
    let d = vec3<f32>(0.00, 0.33, 0.67);
    
    // We scale t slightly so colors cycle nicely
    let col = palette(t * 3.0, a, b, c, d);
    return vec4<f32>(col, 1.0);
  }
}
