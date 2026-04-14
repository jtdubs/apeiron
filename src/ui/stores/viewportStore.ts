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
  zr: number;
  zi: number;
  cr: number;
  ci: number;
  sliceAngle: number;
  zoom: number;
  maxIter: number;
  refOrbits: Float64Array | null;
  setRefOrbits: (orbits: Float64Array | null) => void;
  setViewport: (
    zr: number,
    zi: number,
    cr: number,
    ci: number,
    zoom: number,
    sliceAngle: number,
  ) => void;
  updateViewport: (deltaX: number, deltaY: number, deltaZoom: number, deltaAngle: number) => void;
}

export const viewportStore = createStore<ViewportState>((set) => ({
  zr: 0.0,
  zi: 0.0,
  cr: -0.23020934464237622,
  ci: 0.7163061353118946,
  sliceAngle: 0.0,
  zoom: 0.00008,
  maxIter: calculateMaxIter(0.00008),
  refOrbits: null,

  setRefOrbits: (orbits) => set({ refOrbits: orbits }),

  setViewport: (zr, zi, cr, ci, zoom, sliceAngle) =>
    set({ zr, zi, cr, ci, zoom, sliceAngle, maxIter: calculateMaxIter(zoom) }),

  updateViewport: (deltaX, deltaY, deltaZoom, deltaAngle) =>
    set((state) => {
      let newZoom = state.zoom * deltaZoom;

      if (newZoom < 1e-25) {
        newZoom = 1e-25;
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
        zr: state.zr + deltaX * sinTheta,
        zi: state.zi + deltaY * sinTheta,
        cr: state.cr + deltaX * cosTheta,
        ci: state.ci + deltaY * cosTheta,
        sliceAngle: newAngle,
        zoom: newZoom,
        maxIter: calculateMaxIter(newZoom),
      };
    }),
}));
