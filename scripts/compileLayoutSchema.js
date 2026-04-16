import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const SCHEMA = {
  constants: {
    ORBIT_STRIDE: { value: 8, type: 'u32' },
    META_STRIDE: { value: 8, type: 'u32' },
    BLA_LEVELS: { value: 16, type: 'u32' },
    BLA_NODE_STRIDE: { value: 8, type: 'u32' },
  },
  structs: {
    ReferenceOrbitNode: {
      description: 'Stores mathematical state of reference orbits for perturbation',
      fields: [
        { name: 'x', type: 'f32' },
        { name: 'y', type: 'f32' },
        { name: 'ar', type: 'f32' },
        { name: 'ai', type: 'f32' },
        { name: 'br', type: 'f32' },
        { name: 'bi', type: 'f32' },
        { name: 'cr', type: 'f32' },
        { name: 'ci', type: 'f32' },
      ],
    },
    OrbitMetadata: {
      fields: [
        { name: 'cycle_found', type: 'f32' },
        { name: 'cycle_der_r', type: 'f32' },
        { name: 'cycle_der_i', type: 'f32' },
        { name: 'escaped_iter', type: 'f32' },
        { name: 'abs_zr', type: 'f32' },
        { name: 'abs_zi', type: 'f32' },
        { name: 'abs_cr', type: 'f32' },
        { name: 'abs_ci', type: 'f32' },
      ],
    },
    BLANode: {
      fields: [
        { name: 'ar', type: 'f32' },
        { name: 'ai', type: 'f32' },
        { name: 'br', type: 'f32' },
        { name: 'bi', type: 'f32' },
        { name: 'err', type: 'f32' },
        { name: 'len', type: 'f32' },
        { name: 'pad1', type: 'f32' },
        { name: 'pad2', type: 'f32' },
      ],
    },
    CameraParams: {
      fields: [
        { name: 'zr', type: 'f32' },
        { name: 'zi', type: 'f32' },
        { name: 'cr', type: 'f32' },
        { name: 'ci', type: 'f32' },
        { name: 'scale', type: 'f32' },
        { name: 'aspect', type: 'f32' },
        { name: 'max_iter', type: 'f32' },
        { name: 'slice_angle', type: 'f32' },
        { name: 'use_perturbation', type: 'f32' },
        { name: 'ref_max_iter', type: 'f32' },
        { name: 'exponent', type: 'f32' },
        { name: 'coloring_mode', type: 'f32' },
        { name: 'jitter_x', type: 'f32' },
        { name: 'jitter_y', type: 'f32' },
        { name: 'blend_weight', type: 'f32' },
        { name: 'render_scale', type: 'f32' },
        { name: 'yield_iter_limit', type: 'f32' },
        { name: 'is_resume', type: 'f32' },
        { name: 'is_final_slice', type: 'f32' },
        { name: 'canvas_width', type: 'f32' },
        { name: 'skip_iter', type: 'f32' },
        { name: 'pad1', type: 'f32' },
        { name: 'pad2', type: 'f32' },
        { name: 'pad3', type: 'f32' },
      ],
    },
    ResolveUniforms: {
      fields: [
        { name: 'a', type: 'vec4<f32>' },
        { name: 'b', type: 'vec4<f32>' },
        { name: 'c', type: 'vec4<f32>' },
        { name: 'd', type: 'vec4<f32>' },
        { name: 'max_iter', type: 'f32' },
        { name: 'light_azimuth', type: 'f32' },
        { name: 'light_elevation', type: 'f32' },
        { name: 'diffuse', type: 'f32' },
        { name: 'shininess', type: 'f32' },
        { name: 'height_scale', type: 'f32' },
        { name: 'ambient', type: 'f32' },
        { name: 'coloring_mode', type: 'f32' },
        { name: 'color_density', type: 'f32' },
        { name: 'color_phase', type: 'f32' },
        { name: 'surface_mode', type: 'f32' },
        { name: 'surface_param_a', type: 'f32' },
        { name: 'surface_param_b', type: 'f32' },
        { name: 'true_max_iter', type: 'f32' },
        { name: 'pad1', type: 'f32' },
        { name: 'pad2', type: 'f32' },
      ],
    },
  },
};

const RUST_RESERVED = ['type', 'yield', 'loop', 'break'];

function tsType(f) {
  if (f.type === 'f32' || f.type === 'u32') return 'number';
  if (f.type === 'vec4<f32>') return '[number, number, number, number]';
  return 'any';
}

function rustType(f) {
  if (f.type === 'f32') return 'f64';
  if (f.type === 'u32') return 'u32';
  if (f.type === 'vec4<f32>') return '[f64; 4]';
  return f.type;
}

function rustFieldName(name) {
  if (RUST_RESERVED.includes(name)) return name + '_';
  return name;
}

function tsLength(f) {
  if (f.type === 'vec4<f32>') return 4;
  return 1;
}

function generate() {
  let constsTs = '';
  let constsWgsl = '';
  let constsRs = '';
  let tsInterfaces = '';
  let tsPackers = '';
  let wgslStructs = '';
  let wgslAccessors = '';
  let rustStructs = '';

  const FLOATS_PER_ITER =
    SCHEMA.constants.ORBIT_STRIDE.value +
    SCHEMA.constants.BLA_LEVELS.value * SCHEMA.constants.BLA_NODE_STRIDE.value;
  SCHEMA.constants.FLOATS_PER_ITER = { value: FLOATS_PER_ITER, type: 'u32' };

  for (const [k, v] of Object.entries(SCHEMA.constants)) {
    constsTs += `export const ${k} = ${v.value};\n`;
    constsWgsl += `const ${k}: ${v.type} = ${v.value}u;\n`;
    constsRs += `pub const ${k}: usize = ${v.value};\n`;
  }

  for (const [sName, sDef] of Object.entries(SCHEMA.structs)) {
    let tsProps = '';
    let wgslFields = '';
    let rustFields = '';

    let structSize = 0;
    let tsPackerBody = `  const arr = new Float32Array(${sName}_SIZE);\n`;
    let curOffset = 0;

    for (const f of sDef.fields) {
      tsProps += `  ${f.name}?: ${tsType(f)};\n`;
      wgslFields += `  ${f.name}: ${f.type},\n`;
      rustFields += `    pub ${rustFieldName(f.name)}: ${rustType(f)},\n`;

      if (f.type === 'vec4<f32>') {
        tsPackerBody += `  if (obj.${f.name}) { arr[${curOffset}] = obj.${f.name}[0]; arr[${curOffset + 1}] = obj.${f.name}[1]; arr[${curOffset + 2}] = obj.${f.name}[2]; arr[${curOffset + 3}] = obj.${f.name}[3]; }\n`;
      } else {
        tsPackerBody += `  if (obj.${f.name} !== undefined) arr[${curOffset}] = obj.${f.name};\n`;
      }

      const len = tsLength(f);
      structSize += len;
      curOffset += len;
    }

    tsInterfaces += `export interface ${sName} {\n${tsProps}}\n`;
    tsInterfaces += `export const ${sName}_SIZE = ${structSize};\n\n`;

    let tsUnpackerBody = '';
    let _unpOffset = 0;
    for (const f of sDef.fields) {
      if (f.type === 'vec4<f32>') {
        tsUnpackerBody += `  out.${f.name} = [buffer[offset + ${_unpOffset}], buffer[offset + ${_unpOffset + 1}], buffer[offset + ${_unpOffset + 2}], buffer[offset + ${_unpOffset + 3}]];\n`;
      } else {
        tsUnpackerBody += `  out.${f.name} = buffer[offset + ${_unpOffset}];\n`;
      }
      _unpOffset += tsLength(f);
    }

    tsPackers += `export function pack${sName}(obj: ${sName}): Float32Array {\n${tsPackerBody}  return arr;\n}\n\n`;
    tsPackers += `export function unpack${sName}(buffer: Float32Array | Float64Array, offset: number, out: ${sName}) {\n${tsUnpackerBody}}\n\n`;

    wgslStructs += `struct ${sName} {\n${wgslFields}}\n\n`;
    rustStructs += `#[repr(C)]\n#[derive(Debug, Clone, Copy)]\npub struct ${sName} {\n${rustFields}}\n\n`;

    // Add Rust serialization helper
    let rustPushFields = '';
    for (const f of sDef.fields) {
      if (f.type === 'vec4<f32>') {
        rustPushFields += `        vec.push(self.${rustFieldName(f.name)}[0] as f64);\n        vec.push(self.${rustFieldName(f.name)}[1] as f64);\n        vec.push(self.${rustFieldName(f.name)}[2] as f64);\n        vec.push(self.${rustFieldName(f.name)}[3] as f64);\n`;
      } else {
        rustPushFields += `        vec.push(self.${rustFieldName(f.name)} as f64);\n`;
      }
    }
    rustStructs += `impl ${sName} {\n    pub fn push_to(&self, vec: &mut Vec<f64>) {\n${rustPushFields}    }\n}\n\n`;

    // specialized wgsl accessors for storage buffers
    if (sName === 'ReferenceOrbitNode') {
      let body = '';
      for (let i = 0; i < structSize; i++) {
        body += `${i > 0 ? ',\n    ' : '    '}unpack_f64_to_f32(ref_orbits[base_index + ${i}u])`;
      }
      wgslAccessors += `fn get_orbit_node(base_index: u32) -> ReferenceOrbitNode {\n  return ReferenceOrbitNode(\n${body}\n  );\n}\n\n`;
    }
    if (sName === 'OrbitMetadata') {
      let body = '';
      for (let i = 0; i < structSize; i++) {
        body += `${i > 0 ? ',\n    ' : '    '}unpack_f64_to_f32(ref_orbits[base_index + ${i}u])`;
      }
      wgslAccessors += `fn get_orbit_metadata(ref_offset: u32, max_iter: u32) -> OrbitMetadata {\n  let base_index = ref_offset + (max_iter * ORBIT_STRIDE);\n  return OrbitMetadata(\n${body}\n  );\n}\n\n`;
    }
    if (sName === 'BLANode') {
      let body = '';
      for (let i = 0; i < structSize; i++) {
        body += `${i > 0 ? ',\n    ' : '    '}unpack_f64_to_f32(ref_orbits[node_idx + ${i}u])`;
      }
      wgslAccessors += `fn get_bla_node(bla_offset: u32, iter: u32, level: u32) -> BLANode {\n  let node_idx = bla_offset + (iter * BLA_LEVELS + level) * BLA_NODE_STRIDE;\n  return BLANode(\n${body}\n  );\n}\n\n`;
    }
  }

  const tsOutput = `// --- AUTOGENERATED MEMORY LAYOUT ---
// Do not edit this file directly. Update scripts/compileLayoutSchema.js and rebuild.

${constsTs}
${tsInterfaces}
${tsPackers}
`;

  const wgslLayoutOutput = `// --- AUTOGENERATED MEMORY LAYOUT SCHEMA ---
// Do not edit this file directly. Update scripts/compileLayoutSchema.js and rebuild.

${constsWgsl}
${wgslStructs}
`;

  const wgslAccessorsOutput = `// --- AUTOGENERATED WGSL ACCESSORS ---
// Do not edit this file directly. Update scripts/compileLayoutSchema.js and rebuild.

${wgslAccessors}
`;

  const rustOutput = `// --- AUTOGENERATED MEMORY LAYOUT ---
// Do not edit this file directly. Update scripts/compileLayoutSchema.js and rebuild.

${constsRs}
${rustStructs}
`;

  const tsDir = path.join(__dirname, '../src/engine/generated');
  const wgslDir = path.join(__dirname, '../src/engine/shaders/escape/generated');
  const rustDir = path.join(__dirname, '../rust-math/src/generated');

  fs.mkdirSync(tsDir, { recursive: true });
  fs.mkdirSync(wgslDir, { recursive: true });
  fs.mkdirSync(rustDir, { recursive: true });

  const tsFile = path.join(tsDir, 'MemoryLayout.ts');
  const wgslLayoutFile = path.join(wgslDir, 'layout.wgsl');
  const wgslAccessorsFile = path.join(wgslDir, 'layout_accessors.wgsl');
  const rustFile = path.join(rustDir, 'layout.rs');

  fs.writeFileSync(tsFile, tsOutput);
  fs.writeFileSync(wgslLayoutFile, wgslLayoutOutput);
  fs.writeFileSync(wgslAccessorsFile, wgslAccessorsOutput);
  fs.writeFileSync(rustFile, rustOutput);
  console.log('Memory schemas updated.');

  try {
    console.log('Running formatters...');
    execSync(`npx prettier --write "${tsFile}"`, { stdio: 'inherit' });
    execSync(`rustfmt "${rustFile}"`, { stdio: 'inherit' });
  } catch (err) {
    console.error('Failed to run formatters:', err.message);
  }
}

generate();
