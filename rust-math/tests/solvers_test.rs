use rust_math::refine_reference;

#[test]
fn test_refine_reference_nucleus() {
    // -1 is a period 2 nucleus for Mandelbrot
    let refine_result = refine_reference("-1.0", "0.0", 100);
    assert_eq!(refine_result.ref_type(), "nucleus");
    assert_eq!(refine_result.period(), 2);
    
    let cr = refine_result.cr().parse::<f64>().unwrap_or(0.0);
    assert!((cr - (-1.0)).abs() < 1e-4, "Should converge to -1.0, got {}", cr);
}

#[test]
fn test_refine_reference_misiurewicz() {
    // -2 is a Misiurewicz point
    let refine_result = refine_reference("-2.0", "0.0", 100);
    assert_eq!(refine_result.ref_type(), "misiurewicz");
    let cr = refine_result.cr().parse::<f64>().unwrap_or(0.0);
    assert!((cr - (-2.0)).abs() < 1e-4, "Should converge to -2.0, got {}", cr);
}

#[test]
fn test_refine_reference_unknown() {
    // A point that escapes and is neither nucleus nor misiurewicz
    let refine_result = refine_reference("2.0", "2.0", 10);
    assert_eq!(refine_result.ref_type(), "unknown");
}
