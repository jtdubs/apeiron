use rust_math::{compute_mandelbrot_internal, refine_reference, layout};

#[test]
fn test_compute_mandelbrot_basic() {
    let points_json = r#"[{"zr": "0", "zi": "0", "cr": "-2", "ci": "0", "exponent": 2.0}]"#;
    let payload = compute_mandelbrot_internal(points_json, 10);
    
    // length of orbit should be 10 * ORBIT_STRIDE
    let orbit = payload.orbit_nodes;
    assert_eq!(orbit.len(), 10 * layout::ORBIT_STRIDE, "Expected orbit length for 10 iterations");
    
    // Metadata
    let meta = payload.metadata;
    assert_eq!(meta.len(), layout::META_STRIDE, "Expected meta length for 1 point");
    
    // The point (-2, 0) starts hitting the cycle (2 -> 2)
    let cycle_found = meta[0];
    assert_eq!(cycle_found, 1.0, "Should have detected a cycle for -2");
}

#[test]
fn test_compute_mandelbrot_escape() {
    let points_json = r#"[{"zr": "0", "zi": "0", "cr": "2", "ci": "2", "exponent": 2.0}]"#;
    let payload = compute_mandelbrot_internal(points_json, 10);
    let meta = payload.metadata;
    
    // c=2, 2 escapes quickly
    let escaped_iter = meta[3];
    assert!(escaped_iter < 10.0, "Should escape before max iterations");
}

#[test]
fn test_bla_generation() {
    let points_json = r#"[{"zr": "0", "zi": "0", "cr": "-0.5", "ci": "0", "exponent": 2.0}]"#;
    let payload = compute_mandelbrot_internal(points_json, 16);
    
    let bla = payload.bla_grid;
    let bla_ds = payload.bla_grid_ds;
    
    let expected_bla_len = 16 * layout::BLA_LEVELS as usize * layout::BLA_NODE_STRIDE as usize;
    assert_eq!(bla.len(), expected_bla_len, "BLA array length mismatch");
    
    let expected_ds_len = 16 * layout::BLA_LEVELS as usize * layout::DSBLA_NODE_STRIDE as usize;
    assert_eq!(bla_ds.len(), expected_ds_len, "DS BLA array length mismatch");
}

#[test]
fn test_refine_reference_nucleus() {
    // -1 is a period 2 nucleus for Mandelbrot
    let refine_result = refine_reference("-1.0", "0.0", 100);
    assert_eq!(refine_result.ref_type(), "nucleus");
    assert_eq!(refine_result.period(), 2);
    
    let cr = refine_result.cr();
    assert!((cr - (-1.0)).abs() < 1e-4, "Should converge to -1.0, got {}", cr);
}

#[test]
fn test_refine_reference_misiurewicz() {
    // -2 is a Misiurewicz point
    let refine_result = refine_reference("-2.0", "0.0", 100);
    assert_eq!(refine_result.ref_type(), "misiurewicz");
    let cr = refine_result.cr();
    assert!((cr - (-2.0)).abs() < 1e-4, "Should converge to -2.0, got {}", cr);
}

#[test]
fn test_compute_mandelbrot_exponent_integer() {
    // Exponent 3.0 path
    let points_json = r#"[{"zr": "0", "zi": "0", "cr": "2", "ci": "0", "exponent": 3.0}]"#;
    let payload = compute_mandelbrot_internal(points_json, 4);
    let orbit = payload.orbit_nodes;
    let x1 = orbit[layout::ORBIT_STRIDE as usize]; // z1 = 0^3 + 2 = 2
    let x2 = orbit[2 * layout::ORBIT_STRIDE as usize]; // z2 = 2^3 + 2 = 10
    assert_eq!(x1, 2.0);
    assert_eq!(x2, 10.0);
    
    // In integer exponent mode > 2, ar goes to 1.0, br goes to 0.0
    let ar2 = orbit[2 * layout::ORBIT_STRIDE as usize + 2]; // ar offset is 2
    let br2 = orbit[2 * layout::ORBIT_STRIDE as usize + 4]; // br offset is 4
    assert_eq!(ar2, 1.0, "ar should be reset to 1.0 for exponent > 2");
    assert_eq!(br2, 0.0, "br should be reset to 0.0 for exponent > 2");
}

#[test]
fn test_compute_mandelbrot_exponent_fract() {
    // Exponent 2.5 path (uses atan2/powf)
    let points_json = r#"[{"zr": "1", "zi": "0", "cr": "0", "ci": "0", "exponent": 2.5}]"#;
    let payload = compute_mandelbrot_internal(points_json, 3);
    let orbit = payload.orbit_nodes;
    // z_0 = 1, z_1 = 1^2.5 + 0 = 1
    let x1 = orbit[layout::ORBIT_STRIDE as usize];
    assert!((x1 - 1.0).abs() < 1e-6, "Fractional exponent mismatch");
    
    let ar1 = orbit[layout::ORBIT_STRIDE as usize + 2];
    assert_eq!(ar1, 1.0, "ar should be reset to 1.0 for non-integer exponent");
}

#[test]
fn test_bla_generation_values() {
    // Test base BLA values against reference specs
    let points_json = r#"[{"zr": "1", "zi": "0", "cr": "-0.5", "ci": "0", "exponent": 2.0}]"#;
    // z0 = 1, z1 = 0.5
    let payload = compute_mandelbrot_internal(points_json, 2);
    let orbit = payload.orbit_nodes;
    let z0_x = orbit[0];
    let z0_y = orbit[1];
    
    let bla = payload.bla_grid;
    // Level 0, step 0
    let ar0 = bla[0]; // Offset 0 is ar
    let ai0 = bla[1]; // Offset 1 is ai
    let br0 = bla[2]; // Offset 2 is br
    let bi0 = bla[3]; // Offset 3 is bi
    let err0 = bla[4]; // Offset 4 is err
    
    assert_eq!(ar0, 2.0 * z0_x, "ar should be 2*x at BLA level 0");
    assert_eq!(ai0, 2.0 * z0_y, "ai should be 2*y at BLA level 0");
    assert_eq!(br0, 1.0, "br should be 1.0 at BLA level 0");
    assert_eq!(bi0, 0.0, "bi should be 0.0 at BLA level 0");
    assert_eq!(err0, 1.0, "err should be 1.0 at BLA level 0");
}

#[test]
fn test_bla_ds_split() {
    let points_json = r#"[{"zr": "0", "zi": "0", "cr": "-0.5", "ci": "0", "exponent": 2.0}]"#;
    let payload = compute_mandelbrot_internal(points_json, 4);
    let bla = payload.bla_grid;
    let bla_ds = payload.bla_grid_ds;
    
    // Level 1, iter 0 is the second block pushed for iter 0
    let l1_ar_f64 = bla[layout::BLA_NODE_STRIDE as usize];
    
    let l1_ar_hi = bla_ds[layout::DSBLA_NODE_STRIDE as usize];
    let l1_ar_lo = bla_ds[layout::DSBLA_NODE_STRIDE as usize + 1];
    
    let ds_reconstructed = l1_ar_hi + l1_ar_lo;
    assert!((l1_ar_f64 - ds_reconstructed).abs() < 1e-14, "Double-Single split lost precision");
}

#[test]
fn test_bta_generation_values() {
    // Test base BTA values against analytical Taylor series expansion rules for Mandelbrot
    let points_json = r#"[{"zr": "1", "zi": "0", "cr": "-0.5", "ci": "0", "exponent": 2.0}]"#;
    // z0 = 1, z1 = 0.5
    let payload = compute_mandelbrot_internal(points_json, 2);
    let orbit = payload.orbit_nodes;
    let z0_x = orbit[0];
    let z0_y = orbit[1];
    
    let bta = payload.bta_grid;
    // Level 0, step 0 corresponds to 1 iteration advance
    // The perturbation equation is dz_{n+1} = 2*z_n*dz + dc + dz^2
    // So A = 2*z_n, B = 1, C = 1, D = 0, E = 0
    let ar0 = bta[0]; // Offset 0 is ar
    let ai0 = bta[1]; // Offset 1 is ai
    let br0 = bta[2]; // Offset 2 is br
    let bi0 = bta[3]; // Offset 3 is bi
    let cr0 = bta[4]; // Offset 4 is cr
    let ci0 = bta[5]; // Offset 5 is ci
    let dr0 = bta[6]; // Offset 6 is dr
    let di0 = bta[7]; // Offset 7 is di
    let er0 = bta[8]; // Offset 8 is er
    let ei0 = bta[9]; // Offset 9 is ei
    let err0 = bta[10]; // Offset 10 is err
    
    assert_eq!(ar0, 2.0 * z0_x, "BTA ar should be 2*z0_x at level 0");
    assert_eq!(ai0, 2.0 * z0_y, "BTA ai should be 2*z0_y at level 0");
    assert_eq!(br0, 1.0, "BTA br should be 1.0 at level 0");
    assert_eq!(bi0, 0.0, "BTA bi should be 0.0 at level 0");
    assert_eq!(cr0, 1.0, "BTA cr should be 1.0 at level 0 (coefficient for dz^2)");
    assert_eq!(ci0, 0.0, "BTA ci should be 0.0 at level 0");
    assert_eq!(dr0, 0.0, "BTA dr should be 0.0 at level 0");
    assert_eq!(di0, 0.0, "BTA di should be 0.0 at level 0");
    assert_eq!(er0, 0.0, "BTA er should be 0.0 at level 0");
    assert_eq!(ei0, 0.0, "BTA ei should be 0.0 at level 0");
    assert_eq!(err0, 1.0, "BTA err should be 1.0 at level 0");
}
