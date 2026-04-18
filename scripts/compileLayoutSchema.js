import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execSync } from 'child_process';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const schemaPath = path.join(__dirname, '../schema/MemoryLayout.json');
const SCHEMA = JSON.parse(fs.readFileSync(schemaPath, 'utf8'));

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
    let tsOffsets = '';

    for (const f of sDef.fields) {
      tsProps += `  ${f.name}?: ${tsType(f)};\n`;
      wgslFields += `  ${f.name}: ${f.type},\n`;
      rustFields += `    pub ${rustFieldName(f.name)}: ${rustType(f)},\n`;

      tsOffsets += `export const ${sName}_OFFSET_${f.name.toUpperCase()} = ${curOffset};\n`;
      tsOffsets += `export const ${sName}_BYTE_OFFSET_${f.name.toUpperCase()} = ${curOffset * 4};\n`;

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
    tsInterfaces += `export const ${sName}_SIZE = ${structSize};\n`;
    tsInterfaces += `${tsOffsets}\n`;

    let tsUnpackerBody = '';
    let _unpOffset = 0;
    for (const f of sDef.fields) {
      if (f.type === 'vec4<f32>') {
        tsUnpackerBody += `  out.${f.name} = [buffer[base_offset + ${_unpOffset}], buffer[base_offset + ${_unpOffset + 1}], buffer[base_offset + ${_unpOffset + 2}], buffer[base_offset + ${_unpOffset + 3}]];\n`;
      } else {
        tsUnpackerBody += `  out.${f.name} = buffer[base_offset + ${_unpOffset}];\n`;
      }
      _unpOffset += tsLength(f);
    }

    tsPackers += `export function pack${sName}(obj: ${sName}): Float32Array {\n${tsPackerBody}  return arr;\n}\n\n`;
    tsPackers += `export function unpack${sName}(buffer: Float32Array | Float64Array, index: number, out: ${sName}) {\n  const base_offset = index * ${sName}_SIZE;\n${tsUnpackerBody}}\n\n`;

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
      wgslAccessors += `fn get_orbit_node(iter: u32) -> ReferenceOrbitNode {\n  let base_index = iter * ORBIT_STRIDE;\n  return ReferenceOrbitNode(\n${body}\n  );\n}\n\n`;
    }
    if (sName === 'OrbitMetadata') {
      let body = '';
      for (let i = 0; i < structSize; i++) {
        body += `${i > 0 ? ',\n    ' : '    '}unpack_f64_to_f32(orbit_metadata[base_index + ${i}u])`;
      }
      wgslAccessors += `fn get_orbit_metadata() -> OrbitMetadata {\n  let base_index = 0u;\n  return OrbitMetadata(\n${body}\n  );\n}\n\n`;
    }
    if (sName === 'BLANode') {
      let body = '';
      for (let i = 0; i < structSize; i++) {
        body += `${i > 0 ? ',\n    ' : '    '}unpack_f64_to_f32(bla_grid[node_idx + ${i}u])`;
      }
      wgslAccessors += `fn get_bla_node(iter: u32, level: u32) -> BLANode {\n  let node_idx = (iter * BLA_LEVELS + level) * BLA_NODE_STRIDE;\n  return BLANode(\n${body}\n  );\n}\n\n`;
    }
    if (sName === 'DSBLANode') {
      let body = '';
      for (let i = 0; i < structSize; i++) {
        body += `${i > 0 ? ',\n    ' : '    '}unpack_f64_to_f32(dsbla_grid[node_idx + ${i}u])`;
      }
      wgslAccessors += `fn get_dsbla_node(iter: u32, level: u32) -> DSBLANode {\n  let node_idx = (iter * BLA_LEVELS + level) * DSBLA_NODE_STRIDE;\n  return DSBLANode(\n${body}\n  );\n}\n\n`;
    }
    if (sName === 'BtaNode') {
      let body = '';
      for (let i = 0; i < structSize; i++) {
        body += `${i > 0 ? ',\n    ' : '    '}unpack_f64_to_f32(bta_grid[node_idx + ${i}u])`;
      }
      wgslAccessors += `fn get_bta_node(iter: u32, level: u32) -> BtaNode {\n  let node_idx = (iter * BLA_LEVELS + level) * BTA_NODE_STRIDE;\n  return BtaNode(\n${body}\n  );\n}\n\n`;
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
