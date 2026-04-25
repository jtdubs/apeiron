// Double-Single (DS) Arithmetic Implementation
// Provides ~48-bit emulated floating-point precision on hardware constrained to 32-bit floats.

// DSFloat: vec2<f32> where x is the high-order magnitude, and y is the low-order error remainder.
alias DSFloat = vec2<f32>;

// DSComplex: vec4<f32> where x=RealHigh, y=RealLow, z=ImagHigh, w=ImagLow
alias DSComplex = vec4<f32>;

// Helper to convert standard f32 to DSFloat
fn f32_to_ds(a: f32) -> DSFloat {
    return vec2<f32>(a, 0.0);
}

// Helper to convert standard vec2<f32> to DSComplex
fn complex_f32_to_ds(a: vec2<f32>) -> DSComplex {
    return vec4<f32>(a.x, 0.0, a.y, 0.0);
}

// Helper to get approx float squared magnitude
fn complex_abs_sq_ds(a: DSComplex) -> f32 {
    return a.x * a.x + a.z * a.z;
}

// -----------------------------------------------------
// Dekker/Veltkamp Split and Core Algebra
// -----------------------------------------------------
fn split_f32(a: f32) -> vec2<f32> {
    let c = opaque_f32(8193.0 * a);
    let c_minus_a = opaque_f32(c - a);
    let a_hi = opaque_f32(c - c_minus_a);
    let a_lo = opaque_f32(a - a_hi);
    return vec2<f32>(a_hi, a_lo);
}

// -----------------------------------------------------
// Mathematical Operations
// -----------------------------------------------------

fn opaque_f32(v: f32) -> f32 {
    // Force the compiler to evaluate this into a register by creating a dependency
    // on a uniform value that it cannot resolve at compile time.
    // This breaks algebraic fast-math optimizations (like (a+b)-a = b)
    // which otherwise completely destroy double-single error recovery.
    var ret = v;
    if (camera.skip_iter < -100.0) {
        ret += 1.0;
    }
    return ret;
}

fn ds_add(a: DSFloat, b: DSFloat) -> DSFloat {
    let t1 = opaque_f32(a.x + b.x);
    let e = opaque_f32(t1 - a.x);
    let term1 = opaque_f32(b.x - e);
    let t1_minus_e = opaque_f32(t1 - e);
    let term2 = opaque_f32(a.x - t1_minus_e);
    let t2 = term1 + term2 + a.y + b.y;
    let hi = opaque_f32(t1 + t2);
    let lo = t2 - opaque_f32(hi - t1);
    return vec2<f32>(hi, lo);
}

fn ds_sub(a: DSFloat, b: DSFloat) -> DSFloat {
    let t1 = opaque_f32(a.x - b.x);
    let e = opaque_f32(t1 - a.x);
    let term1 = opaque_f32(-b.x - e);
    let t1_minus_e = opaque_f32(t1 - e);
    let term2 = opaque_f32(a.x - t1_minus_e);
    let t2 = term1 + term2 + a.y - b.y;
    let hi = opaque_f32(t1 + t2);
    let lo = t2 - opaque_f32(hi - t1);
    return vec2<f32>(hi, lo);
}

fn ds_mul(a: DSFloat, b: DSFloat) -> DSFloat {
    let p = opaque_f32(a.x * b.x);
    
    // Dekker's product to find exact error of a.x * b.x
    // Avoids fma() which is often non-fused or emulated as (a*b)+c on some WebGPU drivers,
    // which would result in err = 0.0 and completely break double-single precision.
    let a_s = split_f32(a.x);
    let b_s = split_f32(b.x);
    
    let p1 = opaque_f32(a_s.x * b_s.x);
    let p2 = opaque_f32(a_s.x * b_s.y);
    let p3 = opaque_f32(a_s.y * b_s.x);
    let p4 = opaque_f32(a_s.y * b_s.y);
    
    let e1 = opaque_f32(p1 - p);
    let e2 = opaque_f32(e1 + p2);
    let e3 = opaque_f32(e2 + p3);
    let err = opaque_f32(e3 + p4);
    
    let err2 = err + a.x * b.y + a.y * b.x;
    let hi = opaque_f32(p + err2);
    let lo = err2 - opaque_f32(hi - p);
    return vec2<f32>(hi, lo);
}

// -----------------------------------------------------
// Complex Mathematical Operations
// -----------------------------------------------------
fn complex_add_ds(a: DSComplex, b: DSComplex) -> DSComplex {
    let real = ds_add(a.xy, b.xy);
    let imag = ds_add(a.zw, b.zw);
    return vec4<f32>(real.x, real.y, imag.x, imag.y);
}

fn complex_sub_ds(a: DSComplex, b: DSComplex) -> DSComplex {
    let real = ds_sub(a.xy, b.xy);
    let imag = ds_sub(a.zw, b.zw);
    return vec4<f32>(real.x, real.y, imag.x, imag.y);
}

fn complex_mul_ds(a: DSComplex, b: DSComplex) -> DSComplex {
    // (a.r + i a.i) * (b.r + i b.i)
    // = (a.r * b.r - a.i * b.i) + i (a.r * b.i + a.i * b.r)
    let ar_br = ds_mul(a.xy, b.xy);
    let ai_bi = ds_mul(a.zw, b.zw);
    let ar_bi = ds_mul(a.xy, b.zw);
    let ai_br = ds_mul(a.zw, b.xy);
    
    let real = ds_sub(ar_br, ai_bi);
    let imag = ds_add(ar_bi, ai_br);
    return vec4<f32>(real.x, real.y, imag.x, imag.y);
}

fn complex_sq_ds(a: DSComplex) -> DSComplex {
    // (a.r^2 - a.i^2) + i (2 * a.r * a.i)
    let ar_ar = ds_mul(a.xy, a.xy);
    let ai_ai = ds_mul(a.zw, a.zw);
    let real = ds_sub(ar_ar, ai_ai);
    
    let ar_ai = ds_mul(a.xy, a.zw);
    let imag = ds_add(ar_ai, ar_ai);
    
    return vec4<f32>(real.x, real.y, imag.x, imag.y);
}
