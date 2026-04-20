use bigdecimal::{BigDecimal, Zero, FromPrimitive, ToPrimitive};
use std::str::FromStr;
use serde::Deserialize;
use crate::mandelbrot::{compute, MandelbrotOutput};
use crate::reference_tree::ReferenceTree;
use crate::solvers::refine_reference;

#[derive(Deserialize, Clone)]
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
    pub reference_tree: Vec<f64>,
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

    let max_refs = crate::layout::MAX_REFERENCES;
    
    // K-Means clustering algorithm to reduce N patches -> MAX_REFERENCES centroids
    let mut centroids = Vec::new();
    let mut bounding_radii = Vec::new();
    
    if glitches.len() <= max_refs {
        for g in &glitches {
            centroids.push((g.delta_cr, g.delta_ci));
            bounding_radii.push(0.0); // No radius needed if exact point
        }
    } else {
        // Initialize centroids uniformly across the dataset
        let step = glitches.len() / max_refs;
        for i in 0..max_refs {
            centroids.push((glitches[i * step].delta_cr, glitches[i * step].delta_ci));
        }

        let mut counts = vec![0; max_refs];

        for _ in 0..10 { // 10 iterations is generally sufficient for distinct patches
            let mut new_centroids = vec![(0.0, 0.0); max_refs];
            counts.fill(0);

            for p in &glitches {
                let mut min_dist_sq = f64::MAX;
                let mut best_k = 0;
                for (i, c) in centroids.iter().enumerate() {
                    let dx = p.delta_cr - c.0;
                    let dy = p.delta_ci - c.1;
                    let dist_sq = dx*dx + dy*dy;
                    if dist_sq < min_dist_sq {
                        min_dist_sq = dist_sq;
                        best_k = i;
                    }
                }
                new_centroids[best_k].0 += p.delta_cr;
                new_centroids[best_k].1 += p.delta_ci;
                counts[best_k] += 1;
            }

            for i in 0..max_refs {
                if counts[i] > 0 {
                    centroids[i].0 = new_centroids[i].0 / counts[i] as f64;
                    centroids[i].1 = new_centroids[i].1 / counts[i] as f64;
                }
            }
        }

        // Calculate a bounding radius for each distinct cluster
        bounding_radii.resize(max_refs, 0.0);
        for p in &glitches {
            let mut min_dist_sq = f64::MAX;
            let mut best_k = 0;
            for (i, c) in centroids.iter().enumerate() {
                if counts[i] == 0 { continue; }
                let dx = p.delta_cr - c.0;
                let dy = p.delta_ci - c.1;
                let dist_sq = dx*dx + dy*dy;
                if dist_sq < min_dist_sq {
                    min_dist_sq = dist_sq;
                    best_k = i;
                }
            }
            if min_dist_sq.sqrt() > bounding_radii[best_k] {
                bounding_radii[best_k] = min_dist_sq.sqrt();
            }
        }
        
        // Filter out empty centroids and pair with radii (padded by 1.5x to ensure overlaps catch stray paths)
        let filtered: Vec<((f64, f64), f64)> = centroids.into_iter().enumerate()
            .filter(|(i, _)| counts[*i] > 0)
            .map(|(i, c)| (c, bounding_radii[i] * 1.5))
            .collect();
            
        centroids = filtered.iter().map(|f| f.0).collect();
        bounding_radii = filtered.iter().map(|f| f.1).collect();
    }

    let (center_r_str, center_i_str, exponent) = tree.get_node_info(current_anchor_id)
        .ok_or_else(|| "Current anchor not found".to_string())?;

    let center_r = BigDecimal::from_str(&center_r_str).unwrap_or(BigDecimal::zero());
    let center_i = BigDecimal::from_str(&center_i_str).unwrap_or(BigDecimal::zero());

    let mut total_orbit_nodes = Vec::new();
    let mut total_metadata = Vec::new();
    let mut total_bla_ds = Vec::new();
    let mut total_bta = Vec::new();
    
    let mut reference_tree_flat = Vec::new();
    let count = centroids.len() as f64;
    reference_tree_flat.push(count);

    let mut first_new_cr = String::new();
    let mut first_new_ci = String::new();
    let mut first_glitch_dr = 0.0;
    let mut first_glitch_di = 0.0;

    let mut current_buffer_offset = 0;

    for (i, (cx, cy)) in centroids.iter().enumerate() {
        let dr = BigDecimal::from_f64(*cx).unwrap_or(BigDecimal::zero());
        let di = BigDecimal::from_f64(*cy).unwrap_or(BigDecimal::zero());

        let new_cr = (&center_r + &dr).with_prec(100);
        let new_ci = (&center_i + &di).with_prec(100);

        let refined = refine_reference(&new_cr.to_string(), &new_ci.to_string(), max_iterations);
        
        let new_id = tree.alloc_node(&refined.cr, &refined.ci, exponent);

        let points_json_payload = format!(
            r#"[{{"zr":"0","zi":"0","cr":"{}","ci":"{}","exponent":{}}}]"#,
            refined.cr, refined.ci, exponent
        );

        let payload = compute(&points_json_payload, max_iterations, Some((new_id, tree)))?;
        
        let final_cr = BigDecimal::from_str(&refined.cr).unwrap_or(BigDecimal::zero());
        let final_ci = BigDecimal::from_str(&refined.ci).unwrap_or(BigDecimal::zero());
        let diff_r = &final_cr - &center_r;
        let diff_i = &final_ci - &center_i;
        
        let offset_r = diff_r.to_f64().unwrap_or(0.0);
        let offset_i = diff_i.to_f64().unwrap_or(0.0);
        let bounding_radius = bounding_radii[i];
        let orbit_len = (payload.orbit_nodes.len() / crate::layout::ORBIT_STRIDE) as u32;
        
        // Apeiron natively uses dual-float emulation but here the offset fits into single f32s for spatial bounding lookups
        let node = crate::layout::ReferenceNode {
            origin_x_hi: offset_r,
            origin_x_lo: 0.0,
            origin_y_hi: offset_i,
            origin_y_lo: 0.0,
            bounding_radius,
            buffer_offset: current_buffer_offset,
            ref_length: orbit_len,
            pad1: 0,
        };
        node.push_to(&mut reference_tree_flat);

        if i == 0 {
            first_new_cr = refined.cr.clone();
            first_new_ci = refined.ci.clone();
            first_glitch_dr = *cx;
            first_glitch_di = *cy;
        }

        total_orbit_nodes.extend_from_slice(&payload.orbit_nodes);
        total_metadata.extend_from_slice(&payload.metadata);
        total_bla_ds.extend_from_slice(&payload.bla_grid_ds);
        total_bta.extend_from_slice(&payload.bta_grid);

        current_buffer_offset += orbit_len;
    }

    Ok(ResolveOutput {
        new_cr: first_new_cr,
        new_ci: first_new_ci,
        glitch_dr: first_glitch_dr,
        glitch_di: first_glitch_di,
        payload: MandelbrotOutput {
            orbit_nodes: total_orbit_nodes,
            metadata: total_metadata,
            bla_grid_ds: total_bla_ds,
            bta_grid: total_bta,
        },
        reference_tree: reference_tree_flat,
    })
}
