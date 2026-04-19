use bigdecimal::{BigDecimal, Zero, FromPrimitive};
use std::str::FromStr;
use serde::Deserialize;
use crate::mandelbrot::{compute, MandelbrotOutput};
use crate::reference_tree::ReferenceTree;

#[derive(Deserialize)]
pub struct GlitchPoint {
    pub delta_cr: f64,
    pub delta_ci: f64,
}

pub struct ResolveOutput {
    pub new_cr: String,
    pub new_ci: String,
    pub glitch_dr: f64,
    pub glitch_di: f64,
    pub payload: MandelbrotOutput,
}

pub fn resolve_glitches(
    tree: &mut ReferenceTree,
    current_anchor_id: u32,
    glitches_json: &str,
    max_iterations: u32,
) -> Result<ResolveOutput, String> {
    let glitches: Vec<GlitchPoint> = serde_json::from_str(glitches_json).map_err(|e| e.to_string())?;

    if glitches.is_empty() {
        return Err("No glitches provided".to_string());
    }

    let target = &glitches[0];

    // Get center of current anchor
    let (center_r_str, center_i_str, exponent) = tree.get_node_info(current_anchor_id)
        .ok_or_else(|| "Current anchor not found".to_string())?;

    // Parse
    let center_r = BigDecimal::from_str(&center_r_str).unwrap_or(BigDecimal::zero());
    let center_i = BigDecimal::from_str(&center_i_str).unwrap_or(BigDecimal::zero());

    let dr = BigDecimal::from_f64(target.delta_cr).unwrap_or(BigDecimal::zero());
    let di = BigDecimal::from_f64(target.delta_ci).unwrap_or(BigDecimal::zero());

    let new_cr = (center_r + dr).with_prec(100);
    let new_ci = (center_i + di).with_prec(100);

    let new_cr_str = new_cr.to_string();
    let new_ci_str = new_ci.to_string();

    // Allocate the new reference node
    let new_id = tree.alloc_node(&new_cr_str, &new_ci_str, exponent);

    // Generate standard payload array for the internal runner
    let points_json_payload = format!(
        r#"[{{"zr":"0","zi":"0","cr":"{}","ci":"{}","exponent":{}}}]"#,
        new_cr_str, new_ci_str, exponent
    );

    let payload = compute(&points_json_payload, max_iterations, Some((new_id, tree)))?;

    Ok(ResolveOutput {
        new_cr: new_cr_str,
        new_ci: new_ci_str,
        glitch_dr: target.delta_cr,
        glitch_di: target.delta_ci,
        payload,
    })
}
