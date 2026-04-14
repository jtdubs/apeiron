struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
};

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

@group(0) @binding(0) var g_buffer: texture_2d<f32>;

// Minimal view into the camera uniform to read render_scale without
// duplicating the full CameraParams layout here.
struct CameraScaleParams { render_scale: f32 };
@group(0) @binding(1) var<uniform> camera_scale: CameraScaleParams;

struct ResolveUniforms {
  a: vec4<f32>,
  b: vec4<f32>,
  c: vec4<f32>,
  d: vec4<f32>,
  max_iter: f32,
  light_azimuth: f32,
  light_elevation: f32,
  diffuse: f32,
  shininess: f32,
  height_scale: f32,
  ambient: f32,
  coloring_mode: f32,
  color_density: f32,
  color_phase: f32,
  surface_mode: f32,
  surface_param_a: f32,
  surface_param_b: f32,
  // pad field removed — render_scale is now in camera_scale (group 0 binding 1)
  pad: f32,
};

@group(1) @binding(0) var<uniform> params: ResolveUniforms;

fn palette_func(t: f32, a: vec3<f32>, b: vec3<f32>, c: vec3<f32>, d: vec3<f32>) -> vec3<f32> {
  return a + b * cos(6.28318530718 * (c * t + d));
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  // Remap fragment position into G-Buffer sub-rect texel space.
  // When render_scale < 1.0 (INTERACT), this stretches the low-res
  // quadrant to fill the full canvas. When render_scale == 1.0 (STATIC)
  // this is a no-op (multiply by 1.0). render_scale comes from the shared
  // camera uniform (group 0 binding 1) — not from the palette buffer.
  let coord = vec2<i32>(floor(in.position.xy * camera_scale.render_scale));
  let tex_color = textureLoad(g_buffer, coord, 0);
  let iter = tex_color.r;
  let de = tex_color.g;
  let nx = tex_color.b;
  let ny = tex_color.a;

  if (iter >= params.max_iter) {
    // Inside the set (Black)
    return vec4<f32>(0.0, 0.0, 0.0, 1.0);
  } else {
    var t: f32;
    if (params.coloring_mode > 1.5) {
      t = floor(iter) / params.max_iter; // Banded
    } else if (params.coloring_mode > 0.5) {
      t = iter; // TIA is directly bounded
    } else {
      t = iter / params.max_iter; // Continuous
    }
    
    // We scale t slightly so colors cycle nicely
    let base_color = palette_func(t * params.color_density + params.color_phase, params.a.xyz, params.b.xyz, params.c.xyz, params.d.xyz);
    
    var final_col = base_color;
    
    if (params.surface_mode == 1.0) {
      let N = normalize(vec3<f32>(nx, ny, params.height_scale));
      let az = radians(params.light_azimuth);
      let el = radians(params.light_elevation);
      let L = normalize(vec3<f32>(cos(az)*cos(el), sin(az)*cos(el), sin(el)));
      let V = vec3<f32>(0.0, 0.0, 1.0);
      let diff = max(dot(N, L), 0.0) * params.diffuse;
      let H = normalize(L + V);
      let spec = pow(max(dot(N, H), 0.0), params.shininess);
      final_col = base_color * (params.ambient + diff) + vec3<f32>(spec);
    } else if (params.surface_mode == 2.0) {
      // Soft Glow
      // param_a = glow falloff, param_b = glow scatter/intensity
      let glow = clamp(pow(de * params.surface_param_a, 0.5), 0.0, 1.0);
      final_col = base_color * (params.ambient + glow * params.surface_param_b);
    } else if (params.surface_mode == 3.0) {
      // Contours
      // param_a = contour frequency, param_b = contour thickness
      let contour = fract(de * params.surface_param_a);
      let edge = step(params.surface_param_b, contour);
      final_col = base_color * (params.ambient + 1.0) * (1.0 - edge * 0.5);
    } else {
      // Off
      final_col = base_color;
    }
    
    // Smoothly fade out the absolute boundary to Black to prevent sub-pixel accumulation artifacts
    let edge_fade = clamp(params.max_iter - iter, 0.0, 1.0);
    final_col *= edge_fade;
    
    return vec4<f32>(clamp(final_col, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
  }
}
