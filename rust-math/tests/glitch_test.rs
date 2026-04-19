use rust_math::glitch::resolve_glitches;
use rust_math::reference_tree::ReferenceTree;

#[test]
fn test_resolve_glitches_empty() {
    let mut tree = ReferenceTree::new();
    let current_anchor_id = tree.alloc_node("0.0", "0.0", 2.0);
    
    let result = resolve_glitches(&mut tree, current_anchor_id, "[]", 100);
    assert!(result.is_err(), "Should fail on empty glitches array");
}

#[test]
fn test_resolve_glitches_success() {
    let mut tree = ReferenceTree::new();
    let current_anchor_id = tree.alloc_node("-1.0", "0.0", 2.0);
    
    // delta_cr/di are standard floats because they represent standard f64 offsets
    let glitches_json = r#"[{"delta_cr": 0.5, "delta_ci": -0.25}]"#;
    
    let result = resolve_glitches(&mut tree, current_anchor_id, glitches_json, 10);
    assert!(result.is_ok(), "Should resolve glitches successfully");
    
    let output = result.unwrap();
    
    // Expected new c is -1.0 + 0.5 = -0.5, and 0.0 + (-0.25) = -0.25
    assert_eq!(output.new_cr.parse::<f64>().unwrap(), -0.5);
    assert_eq!(output.new_ci.parse::<f64>().unwrap(), -0.25);
    assert_eq!(output.glitch_dr, 0.5);
    assert_eq!(output.glitch_di, -0.25);
    
    // Check that a new node was created in the tree, making it the best anchor for -0.5, -0.25
    let best_anchor = tree.find_best_anchor("-0.5", "-0.25", 0.1);
    assert!(best_anchor > 0, "Should have found the newly created anchor");
}

#[test]
fn test_resolve_glitches_invalid_anchor() {
    let mut tree = ReferenceTree::new();
    let glitches_json = r#"[{"delta_cr": 0.5, "delta_ci": -0.25}]"#;
    
    let result = resolve_glitches(&mut tree, 999, glitches_json, 10);
    assert!(result.is_err(), "Should fail on non-existent anchor");
}

#[test]
fn test_resolve_glitches_invalid_json() {
    let mut tree = ReferenceTree::new();
    let current_anchor_id = tree.alloc_node("-1.0", "0.0", 2.0);
    
    let glitches_json = r#"[{invalid}]"#;
    let result = resolve_glitches(&mut tree, current_anchor_id, glitches_json, 10);
    assert!(result.is_err(), "Should fail on invalid JSON");
}
