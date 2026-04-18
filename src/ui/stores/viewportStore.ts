import { createStore } from 'zustand/vanilla';

// Dynamic calculation based on log10 of scale.
// scale = 2.0 -> zoom out. zoom 1e-5 -> highly zoomed in.
export function calculateMaxIter(zoom: number): number {
  if (zoom >= 1.0) return 150;

  // A much steeper ramp for iterations to ensure deep-zoom structures
  // resolve completely into their "hairs" rather than capping out early.
  // zoom = 0.1 (1e-1) -> log10 is -1. 150 + 300 = 450.
  // zoom = 1e-5 -> log10 is -5. 150 + 1500 = 1650.
  const iterations = Math.floor(150 - Math.log10(zoom) * 300);

  return Math.min(iterations, 20000); // hard cap just to prevent OS TDRs
}

export interface ViewportState {
  anchorZr: string;
  anchorZi: string;
  anchorCr: string;
  anchorCi: string;

  deltaZr: number;
  deltaZi: number;
  deltaCr: number;
  deltaCi: number;

  sliceAngle: number;
  zoom: number;
  exponent: number;
  paletteMaxIter: number;
  refOrbitNodes: Float64Array | null;
  refMetadata: Float64Array | null;
  refBlaGrid: Float64Array | null;
  interactionState: 'STATIC' | 'INTERACT_SAFE' | 'INTERACT_FAST';
  debugViewMode: number;
  isTelemetryOpen: boolean;

  setRefBuffers: (
    orbitNodes: Float64Array | null,
    metadata: Float64Array | null,
    blaGrid: Float64Array | null,
  ) => void;
  setInteractionState: (state: 'STATIC' | 'INTERACT_SAFE' | 'INTERACT_FAST') => void;
  setDebugViewMode: (mode: number) => void;
  setIsTelemetryOpen: (isOpen: boolean) => void;
  setAnchorsAndDeltas: (
    azr: string,
    azi: string,
    acr: string,
    aci: string,
    dzr: number,
    dzi: number,
    dcr: number,
    dci: number,
    zoom: number,
    sliceAngle: number,
    exponent: number,
  ) => void;
  updateViewport: (deltaX: number, deltaY: number, deltaZoom: number, deltaAngle: number) => void;
}

export const viewportStore = createStore<ViewportState>((set) => ({
  anchorZr: '0.0',
  anchorZi: '0.0',
  anchorCr: '-0.8',
  anchorCi: '0.156',

  deltaZr: 0.0,
  deltaZi: 0.0,
  deltaCr: 0.0,
  deltaCi: 0.0,

  sliceAngle: 0.0,
  zoom: 1.5,
  exponent: 2.0,
  paletteMaxIter: calculateMaxIter(1.5),
  refOrbitNodes: null,
  refMetadata: null,
  refBlaGrid: null,
  interactionState: 'STATIC',
  debugViewMode: 0,
  isTelemetryOpen:
    typeof window !== 'undefined' && localStorage.getItem('apeiron_telemetry_open') === 'true',

  setRefBuffers: (orbitNodes, metadata, blaGrid) =>
    set({ refOrbitNodes: orbitNodes, refMetadata: metadata, refBlaGrid: blaGrid }),
  setInteractionState: (interactionState) => set({ interactionState }),
  setDebugViewMode: (debugViewMode) => set({ debugViewMode }),
  setIsTelemetryOpen: (isTelemetryOpen) => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('apeiron_telemetry_open', String(isTelemetryOpen));
    }
    set({ isTelemetryOpen });
  },

  setAnchorsAndDeltas: (azr, azi, acr, aci, dzr, dzi, dcr, dci, zoom, sliceAngle, exponent) =>
    set({
      anchorZr: azr,
      anchorZi: azi,
      anchorCr: acr,
      anchorCi: aci,
      deltaZr: dzr,
      deltaZi: dzi,
      deltaCr: dcr,
      deltaCi: dci,
      zoom,
      sliceAngle,
      exponent,
      paletteMaxIter: calculateMaxIter(zoom),
    }),

  updateViewport: (deltaX, deltaY, deltaZoom, deltaAngle) =>
    set((state) => {
      let newZoom = state.zoom * deltaZoom;

      if (newZoom < 1e-45) {
        newZoom = 1e-45;
      }
      if (newZoom > 5.0) {
        newZoom = 5.0; // Don't zoom too far out
      }

      let newAngle = state.sliceAngle + deltaAngle;
      if (newAngle < 0.0) newAngle = 0.0;
      if (newAngle > Math.PI / 2) newAngle = Math.PI / 2;

      // When panning, we apply the delta vector along the current slice plane
      const cosTheta = Math.cos(newAngle);
      const sinTheta = Math.sin(newAngle);

      return {
        deltaZr: state.deltaZr + deltaX * sinTheta,
        deltaZi: state.deltaZi + deltaY * sinTheta,
        deltaCr: state.deltaCr + deltaX * cosTheta,
        deltaCi: state.deltaCi + deltaY * cosTheta,
        sliceAngle: newAngle,
        zoom: newZoom,
        paletteMaxIter: calculateMaxIter(newZoom),
      };
    }),
}));
