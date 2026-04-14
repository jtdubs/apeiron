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
  heightScale: number;
  ambient: number;

  // modes
  precisionMode: 'f32' | 'perturbation';
  coloringMode: 'iteration' | 'stripe';
  setPrecisionMode: (mode: 'f32' | 'perturbation') => void;
  setColoringMode: (mode: 'iteration' | 'stripe') => void;

  // coloring
  colorDensity: number;
  colorPhase: number;
  setColorDensity: (val: number) => void;
  setColorPhase: (val: number) => void;

  setPalette: (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    d: [number, number, number],
  ) => void;
  setLighting: (
    azimuth: number,
    elevation: number,
    diffuse: number,
    shininess: number,
    heightScale: number,
    ambient: number,
  ) => void;
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
  heightScale: 0.1,
  ambient: 0.2,

  precisionMode: 'perturbation',
  coloringMode: 'iteration',
  colorDensity: 3.0,
  colorPhase: 0.0,
  setPrecisionMode: (mode) => set({ precisionMode: mode }),
  setColoringMode: (mode) => set({ coloringMode: mode }),
  setColorDensity: (val) => set({ colorDensity: val }),
  setColorPhase: (val) => set({ colorPhase: val }),

  setPalette: (a, b, c, d) => set({ paletteA: a, paletteB: b, paletteC: c, paletteD: d }),
  setLighting: (azimuth, elevation, diffuse, shininess, heightScale, ambient) =>
    set({
      lightAzimuth: azimuth,
      lightElevation: elevation,
      diffuse,
      shininess,
      heightScale,
      ambient,
    }),
}));
