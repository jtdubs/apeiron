import {
  ORBIT_STRIDE,
  unpackReferenceOrbitNode,
  type ReferenceOrbitNode,
} from './generated/MemoryLayout';

export function calculateSkipIter(
  refOrbitNodes: Float64Array | null,
  zoom: number,
  deltaCr: number,
  deltaCi: number,
  width: number,
  height: number,
  sliceAngle: number,
  precisionMode: string,
): number {
  if (Math.abs(Math.sin(sliceAngle)) >= 1e-6 || !refOrbitNodes || precisionMode === 'f32') {
    return 0;
  }

  const aspect = width / height;
  const dcr_max = zoom * aspect + Math.abs(deltaCr);
  const dci_max = zoom + Math.abs(deltaCi);
  const dc_mag = Math.sqrt(dcr_max * dcr_max + dci_max * dci_max);
  const dc_mag_3 = dc_mag * dc_mag * dc_mag;

  const refLength = refOrbitNodes.length / ORBIT_STRIDE;

  let skipIter = 0;
  const node: ReferenceOrbitNode = {};

  for (let i = 0; i < refLength; i++) {
    unpackReferenceOrbitNode(refOrbitNodes, i, node);

    const cr = node.cr!;
    const ci = node.ci!;
    const c_mag = Math.sqrt(cr * cr + ci * ci);
    const error = c_mag * dc_mag_3;

    const ar = node.ar!;
    const ai = node.ai!;
    const a_mag = Math.sqrt(ar * ar + ai * ai);

    // 1e-6 target for WebGPU f32 stability, and cap absolute approximation magnitude.
    if (error > 1e-6 || a_mag * dc_mag > 1e-3) {
      break;
    }
    skipIter = i;
  }

  return skipIter;
}
