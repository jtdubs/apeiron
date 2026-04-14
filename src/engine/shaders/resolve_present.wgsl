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
  pad4: f32,
  color_density: f32,
  color_phase: f32,
  pad7: f32,
  pad8: f32,
};

@group(1) @binding(0) var<uniform> params: ResolveUniforms;

fn palette_func(t: f32, a: vec3<f32>, b: vec3<f32>, c: vec3<f32>, d: vec3<f32>) -> vec3<f32> {
  return a + b * cos(6.28318530718 * (c * t + d));
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  // Use exact pixel coordinates to load from the G-Buffer
  let coord = vec2<i32>(floor(in.position.xy));
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
    if (params.pad4 > 0.5) {
      t = iter; // TIA is theoretically returned directly bounded by [0, 1] mapped per iteration.
    } else {
      t = iter / params.max_iter;
    }
    
    // We scale t slightly so colors cycle nicely
    let base_color = palette_func(t * params.color_density + params.color_phase, params.a.xyz, params.b.xyz, params.c.xyz, params.d.xyz);
    
    let N = normalize(vec3<f32>(nx, ny, params.height_scale));
    
    let az = radians(params.light_azimuth);
    let el = radians(params.light_elevation);
    let L = normalize(vec3<f32>(cos(az)*cos(el), sin(az)*cos(el), sin(el)));
    
    let V = vec3<f32>(0.0, 0.0, 1.0);
    
    let diff = max(dot(N, L), 0.0) * params.diffuse;
    
    let H = normalize(L + V);
    let spec = pow(max(dot(N, H), 0.0), params.shininess);
    
    let final_col = base_color * (params.ambient + diff) + vec3<f32>(spec);
    
    return vec4<f32>(clamp(final_col, vec3<f32>(0.0), vec3<f32>(1.0)), 1.0);
  }
}
