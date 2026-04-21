use rust_math::mandelbrot;
use std::time::Instant;

#[test]
fn test_perf() {
    let cases = r#"[{"zr":"0","zi":"0","cr":"-1.78643","ci":"0","exponent":2.0}]"#;
    let t0 = Instant::now();
    let res = mandelbrot::compute(cases, 2048, None).unwrap();
    let duration = t0.elapsed();
    println!("Computed in {:?}", duration);
    println!("Orbit len: {}", res.orbit_nodes.len());
}
