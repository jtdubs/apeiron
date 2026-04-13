import { createStore } from 'zustand/vanilla';

// Dynamic calculation based on log10 of scale.
// scale = 2.0 -> zoom out. zoom 1e-5 -> highly zoomed in.
export function calculateMaxIter(zoom: number): number {
  if (zoom >= 1.0) return 100;
  // zoom = 0.1 -> log10 is -1. 100 + 100 = 200.
  // zoom = 1e-5 -> log10 is -5. 100 + 500 = 600.
  return Math.floor(100 - Math.log10(zoom) * 100);
}

export interface ViewportState {
  zr: number;
  zi: number;
  cr: number;
  ci: number;
  sliceAngle: number;
  zoom: number;
  maxIter: number;
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
  cr: -0.5,
  ci: 0.0,
  sliceAngle: 0.0,
  zoom: 2.0,
  maxIter: 100, // starting value for scale 2.0

  setViewport: (zr, zi, cr, ci, zoom, sliceAngle) =>
    set({ zr, zi, cr, ci, zoom, sliceAngle, maxIter: calculateMaxIter(zoom) }),

  updateViewport: (deltaX, deltaY, deltaZoom, deltaAngle) =>
    set((state) => {
      let newZoom = state.zoom * deltaZoom;

      if (newZoom < 1e-5) {
        newZoom = 1e-5;
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
