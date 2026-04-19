fn unpack_f64_to_f32(raw: vec2<u32>) -> f32 {
    let low = raw.x;
    let high = raw.y;
    let sign = select(1.0, -1.0, (high & 0x80000000u) != 0u);
    let exp_raw = (high >> 20u) & 0x7FFu;
    if (exp_raw == 0u) {
        if ((high & 0xFFFFFu) == 0u && low == 0u) { return 0.0; }
        return 0.0;
    }
    let exp = f32(i32(exp_raw) - 1023);
    let mantissa_high = f32(high & 0xFFFFFu) / 1048576.0; // 2^20
    let mantissa_low = f32(low) / 4503599627370496.0; // 2^52
    let mantissa = 1.0 + mantissa_high + mantissa_low;
    return sign * mantissa * exp2(exp);
}

fn unpack_f64_to_ds(raw: vec2<u32>) -> vec2<f32> {
    let low = raw.x;
    let high = raw.y;
    let sign = select(1.0, -1.0, (high & 0x80000000u) != 0u);
    let exp_raw = (high >> 20u) & 0x7FFu;
    if (exp_raw == 0u) {
        return vec2<f32>(0.0, 0.0);
    }
    let exp = f32(i32(exp_raw) - 1023);
    let mantissa_high = f32(high & 0xFFFFFu) / 1048576.0;
    let high_val = sign * (1.0 + mantissa_high) * exp2(exp);
    let mantissa_low = f32(low) / 4503599627370496.0;
    let low_val = sign * mantissa_low * exp2(exp);
    return vec2<f32>(high_val, low_val);
}

