import { createStore } from 'zustand/vanilla';

export interface ThemeState {
  // palettes: a, b, c, d
  paletteA: [number, number, number];
  paletteB: [number, number, number];
  paletteC: [number, number, number];
  paletteD: [number, number, number];

  // lighting config
  lightAzimuth: number;
  lightElevation: number;
  diffuse: number;
  shininess: number;

  // modes
  precisionMode: 'f32' | 'perturbation';
  setPrecisionMode: (mode: 'f32' | 'perturbation') => void;

  setPalette: (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    d: [number, number, number],
  ) => void;
  setLighting: (azimuth: number, elevation: number, diffuse: number, shininess: number) => void;
}

export const themeStore = createStore<ThemeState>((set) => ({
  // Default 'neon'
  paletteA: [0.5, 0.5, 0.5],
  paletteB: [0.5, 0.5, 0.5],
  paletteC: [1.0, 1.0, 1.0],
  paletteD: [0.0, 0.33, 0.67],

  lightAzimuth: 45.0,
  lightElevation: 45.0,
  diffuse: 1.0,
  shininess: 32.0,

  precisionMode: 'perturbation',
  setPrecisionMode: (mode) => set({ precisionMode: mode }),

  setPalette: (a, b, c, d) => set({ paletteA: a, paletteB: b, paletteC: c, paletteD: d }),
  setLighting: (azimuth, elevation, diffuse, shininess) =>
    set({ lightAzimuth: azimuth, lightElevation: elevation, diffuse, shininess }),
}));
