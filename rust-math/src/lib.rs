use wasm_bindgen::prelude::*;

pub mod glitch;
pub mod complex;
pub mod mandelbrot;
pub mod reference_tree;
pub mod solvers;

#[path = "generated/layout.rs"]
pub mod layout;

#[wasm_bindgen]
pub struct MandelbrotOutput {
    orbit_nodes: js_sys::Float64Array,
    metadata: js_sys::Float64Array,
    bla_grid_ds: js_sys::Float64Array,
    bta_grid: js_sys::Float64Array,
}

impl From<crate::mandelbrot::MandelbrotOutput> for MandelbrotOutput {
    fn from(native: crate::mandelbrot::MandelbrotOutput) -> Self {
        MandelbrotOutput {
            orbit_nodes: js_sys::Float64Array::from(&native.orbit_nodes[..]),
            metadata: js_sys::Float64Array::from(&native.metadata[..]),
            bla_grid_ds: js_sys::Float64Array::from(&native.bla_grid_ds[..]),
            bta_grid: js_sys::Float64Array::from(&native.bta_grid[..]),
        }
    }
}

#[wasm_bindgen]
impl MandelbrotOutput {
    #[wasm_bindgen(getter)]
    pub fn orbit_nodes(&self) -> js_sys::Float64Array {
        self.orbit_nodes.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn metadata(&self) -> js_sys::Float64Array {
        self.metadata.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn bla_grid_ds(&self) -> js_sys::Float64Array {
        self.bla_grid_ds.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn bta_grid(&self) -> js_sys::Float64Array {
        self.bta_grid.clone()
    }
}


#[wasm_bindgen]
pub struct RefineOutput {
    cr: String,
    ci: String,
    ref_type: String,
    period: u32,
    pre_period: u32,
}

impl From<crate::solvers::RefineOutput> for RefineOutput {
    fn from(native: crate::solvers::RefineOutput) -> Self {
        RefineOutput {
            cr: native.cr,
            ci: native.ci,
            ref_type: native.ref_type,
            period: native.period,
            pre_period: native.pre_period,
        }
    }
}

#[wasm_bindgen]
impl RefineOutput {
    #[wasm_bindgen(getter)]
    pub fn cr(&self) -> String {
        self.cr.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn ci(&self) -> String {
        self.ci.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn ref_type(&self) -> String {
        self.ref_type.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn period(&self) -> u32 {
        self.period
    }
    #[wasm_bindgen(getter)]
    pub fn pre_period(&self) -> u32 {
        self.pre_period
    }
}

#[wasm_bindgen]
pub fn refine_reference(cr_str: &str, ci_str: &str, max_iterations: u32) -> RefineOutput {
    solvers::refine_reference(cr_str, ci_str, max_iterations).into()
}

#[wasm_bindgen]
pub struct RebaseOutput {
    zr: String,
    zi: String,
    cr: String,
    ci: String,
}

impl From<crate::solvers::NativeRebaseOutput> for RebaseOutput {
    fn from(native: crate::solvers::NativeRebaseOutput) -> Self {
        RebaseOutput {
            zr: native.zr,
            zi: native.zi,
            cr: native.cr,
            ci: native.ci,
        }
    }
}

#[wasm_bindgen]
impl RebaseOutput {
    #[wasm_bindgen(getter)]
    pub fn zr(&self) -> String { self.zr.clone() }
    #[wasm_bindgen(getter)]
    pub fn zi(&self) -> String { self.zi.clone() }
    #[wasm_bindgen(getter)]
    pub fn cr(&self) -> String { self.cr.clone() }
    #[wasm_bindgen(getter)]
    pub fn ci(&self) -> String { self.ci.clone() }
}

#[wasm_bindgen]
#[allow(clippy::too_many_arguments)]
pub fn rebase_origin(
    zr_str: &str,
    zi_str: &str,
    cr_str: &str,
    ci_str: &str,
    dzr: f64,
    dzi: f64,
    dcr: f64,
    dci: f64,
) -> RebaseOutput {
    solvers::rebase_origin(zr_str, zi_str, cr_str, ci_str, dzr, dzi, dcr, dci).into()
}

#[wasm_bindgen]
pub fn compute_payload(
    tree: &mut crate::reference_tree::ReferenceTree,
    node_id: u32,
    points_json: &str,
    max_iterations: u32,
) -> Result<MandelbrotOutput, JsValue> {
    match mandelbrot::compute(points_json, max_iterations, Some((node_id, tree))) {
        Ok(native) => Ok(native.into()),
        Err(e) => Err(JsValue::from_str(&e)),
    }
}

#[wasm_bindgen]
pub struct ResolveOutput {
    new_cr: String,
    new_ci: String,
    glitch_dr: f64,
    glitch_di: f64,
    orbit_nodes: js_sys::Float64Array,
    metadata: js_sys::Float64Array,
    bla_grid_ds: js_sys::Float64Array,
    bta_grid: js_sys::Float64Array,
}

impl From<crate::glitch::ResolveOutput> for ResolveOutput {
    fn from(native: crate::glitch::ResolveOutput) -> Self {
        ResolveOutput {
            new_cr: native.new_cr,
            new_ci: native.new_ci,
            glitch_dr: native.glitch_dr,
            glitch_di: native.glitch_di,
            orbit_nodes: js_sys::Float64Array::from(&native.payload.orbit_nodes[..]),
            metadata: js_sys::Float64Array::from(&native.payload.metadata[..]),
            bla_grid_ds: js_sys::Float64Array::from(&native.payload.bla_grid_ds[..]),
            bta_grid: js_sys::Float64Array::from(&native.payload.bta_grid[..]),
        }
    }
}

#[wasm_bindgen]
impl ResolveOutput {
    #[wasm_bindgen(getter)]
    pub fn new_cr(&self) -> String {
        self.new_cr.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn new_ci(&self) -> String {
        self.new_ci.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn glitch_dr(&self) -> f64 {
        self.glitch_dr
    }
    #[wasm_bindgen(getter)]
    pub fn glitch_di(&self) -> f64 {
        self.glitch_di
    }
    #[wasm_bindgen(getter)]
    pub fn orbit_nodes(&self) -> js_sys::Float64Array {
        self.orbit_nodes.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn metadata(&self) -> js_sys::Float64Array {
        self.metadata.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn bla_grid_ds(&self) -> js_sys::Float64Array {
        self.bla_grid_ds.clone()
    }
    #[wasm_bindgen(getter)]
    pub fn bta_grid(&self) -> js_sys::Float64Array {
        self.bta_grid.clone()
    }
}

#[wasm_bindgen]
pub fn resolve_glitches(
    tree: &mut crate::reference_tree::ReferenceTree,
    current_anchor_id: u32,
    glitches_json: &str,
    max_iterations: u32,
) -> Result<ResolveOutput, JsValue> {
    match glitch::resolve_glitches(tree, current_anchor_id, glitches_json, max_iterations) {
        Ok(native) => Ok(native.into()),
        Err(e) => Err(JsValue::from_str(&e)),
    }
}
