use rust_math::reference_tree::{ReferenceTree, BigComplex};
use std::str::FromStr;
use bigdecimal::BigDecimal;
use bigdecimal::ToPrimitive;

#[test]
fn test_chained_transformation_precision() {
    let mut tree = ReferenceTree::new();
    
    // 1. Mock the reference nodes (e.g. from 10^-15 and 10^-16 ranges)
    let node_a_id = tree.alloc_node("-1.75", "0.0", 2.0);
    tree.push_mock_orbit(node_a_id, 0, "0.1234567890123456789", "0.9876543210987654321"); // iter 0

    let node_b_id = tree.alloc_node("-1.7500000000000001", "0.0000000000000001", 2.0);
    tree.push_mock_orbit(node_b_id, 0, "0.1234567890123456780", "0.9876543210987654320"); // iter 0

    // 2. The actual target pixel coordinate (very deep zoom)
    let pixel_c_r = BigDecimal::from_str("-1.7500000000000001000000000000005").unwrap();
    let pixel_c_i = BigDecimal::from_str("0.0000000000000001000000000000005").unwrap();
    let pixel_z_r = BigDecimal::from_str("0.123456789012345678099999999").unwrap();
    let pixel_z_i = BigDecimal::from_str("0.987654321098765432099999999").unwrap();

    // 3. Compute delta_A natively (what the shader tracked prior to glitch)
    let z_a_r = BigDecimal::from_str("0.1234567890123456789").unwrap();
    let z_a_i = BigDecimal::from_str("0.9876543210987654321").unwrap();
    
    let dz_a_r = (&pixel_z_r - &z_a_r).to_f64().unwrap();
    let dz_a_i = (&pixel_z_i - &z_a_i).to_f64().unwrap();

    // 4. Perform chained transformation
    let delta_b_shifted = tree.transform_delta(node_a_id, node_b_id, dz_a_r, dz_a_i, 0, 0);

    // 5. Compute ground truth
    let z_b_r = BigDecimal::from_str("0.1234567890123456780").unwrap();
    let z_b_i = BigDecimal::from_str("0.9876543210987654320").unwrap();
    let expected_dz_b_r = (&pixel_z_r - &z_b_r).to_f64().unwrap();
    let expected_dz_b_i = (&pixel_z_i - &z_b_i).to_f64().unwrap();

    // 6. Assert parity
    assert!((delta_b_shifted.r - expected_dz_b_r).abs() < 1e-25, 
        "Transformed delta_B (real) deviates! Expected {}, got {}", expected_dz_b_r, delta_b_shifted.r);
    assert!((delta_b_shifted.i - expected_dz_b_i).abs() < 1e-25, 
        "Transformed delta_B (imag) deviates! Expected {}, got {}", expected_dz_b_i, delta_b_shifted.i);

    // 7. Verify Coordinate shift (Delta C)
    let c_b_r = BigDecimal::from_str("-1.7500000000000001").unwrap();
    let c_b_i = BigDecimal::from_str("0.0000000000000001").unwrap();
    let expected_dc_r = (&pixel_c_r - &c_b_r).to_f64().unwrap();
    let expected_dc_i = (&pixel_c_i - &c_b_i).to_f64().unwrap();

    let dc_shifted = tree.update_dc("-1.7500000000000001000000000000005", "0.0000000000000001000000000000005", node_b_id);

    assert!((dc_shifted.r - expected_dc_r).abs() < 1e-25, "Transformed DC (real) deviates");
    assert!((dc_shifted.i - expected_dc_i).abs() < 1e-25, "Transformed DC (imag) deviates");
}
