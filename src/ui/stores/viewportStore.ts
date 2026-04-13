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
  x: number;
  y: number;
  zoom: number;
  maxIter: number;
  setViewport: (x: number, y: number, zoom: number) => void;
  updateViewport: (deltaX: number, deltaY: number, deltaZoom: number) => void;
}

export const viewportStore = createStore<ViewportState>((set) => ({
  x: -0.5,
  y: 0.0,
  zoom: 2.0,
  maxIter: 100, // starting value for scale 2.0

  setViewport: (x, y, zoom) => set({ x, y, zoom, maxIter: calculateMaxIter(zoom) }),

  updateViewport: (deltaX, deltaY, deltaZoom) =>
    set((state) => {
      let newZoom = state.zoom * deltaZoom;

      if (newZoom < 1e-5) {
        newZoom = 1e-5;
      }
      if (newZoom > 5.0) {
        newZoom = 5.0; // Don't zoom too far out
      }

      return {
        x: state.x + deltaX,
        y: state.y + deltaY,
        zoom: newZoom,
        maxIter: calculateMaxIter(newZoom),
      };
    }),
}));
