// ==========================================
// CORE COMPLEX ALGEBRA
// ==========================================
// Simulates arithmetic for Complex numbers Z = a + bi through vec2(real, imaginary),
// as WGSL has no native representation for non-euclidean imaginary components.
fn complex_mul(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
  return vec2<f32>(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x);
}

fn complex_add(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
  return vec2<f32>(a.x + b.x, a.y + b.y);
}

fn complex_sub(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
  return vec2<f32>(a.x - b.x, a.y - b.y);
}

fn complex_sq(a: vec2<f32>) -> vec2<f32> {
  return vec2<f32>(a.x * a.x - a.y * a.y, 2.0 * a.x * a.y);
}

fn complex_div(a: vec2<f32>, b: vec2<f32>) -> vec2<f32> {
  let den = b.x * b.x + b.y * b.y;
  return vec2<f32>((a.x * b.x + a.y * b.y) / den, (a.y * b.x - a.x * b.y) / den);
}

fn complex_abs_sq(a: vec2<f32>) -> f32 {
  return a.x * a.x + a.y * a.y;
}

