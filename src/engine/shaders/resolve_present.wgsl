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

struct PaletteUniforms {
  a: vec4<f32>,
  b: vec4<f32>,
  c: vec4<f32>,
  d: vec4<f32>,
  max_iter: f32, // to calculate t
};

@group(1) @binding(0) var<uniform> palette: PaletteUniforms;

fn palette_func(t: f32, a: vec3<f32>, b: vec3<f32>, c: vec3<f32>, d: vec3<f32>) -> vec3<f32> {
  return a + b * cos(6.28318530718 * (c * t + d));
}

@fragment
fn fs_main(in: VertexOutput) -> @location(0) vec4<f32> {
  // Use exact pixel coordinates to load from the G-Buffer
  let coord = vec2<i32>(floor(in.position.xy));
  let tex_color = textureLoad(g_buffer, coord, 0);
  let iter = tex_color.r;

  if (iter >= palette.max_iter) {
    // Inside the set (Black)
    return vec4<f32>(0.0, 0.0, 0.0, 1.0);
  } else {
    // Outside the set (Cosine Palette based on smooth iterations)
    let t = iter / palette.max_iter;
    
    // We scale t slightly so colors cycle nicely
    let col = palette_func(t * 3.0, palette.a.xyz, palette.b.xyz, palette.c.xyz, palette.d.xyz);
    return vec4<f32>(col, 1.0);
  }
}
