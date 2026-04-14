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
  coloringMode: 'iteration' | 'stripe' | 'banded';
  surfaceMode: 'off' | '3d-topography' | 'soft-glow' | 'contours';
  setPrecisionMode: (mode: 'f32' | 'perturbation') => void;
  setColoringMode: (mode: 'iteration' | 'stripe' | 'banded') => void;
  setSurfaceMode: (mode: 'off' | '3d-topography' | 'soft-glow' | 'contours') => void;

  // surface tweaks
  glowFalloff: number;
  glowScatter: number;
  contourFrequency: number;
  contourThickness: number;
  setGlowFalloff: (val: number) => void;
  setGlowScatter: (val: number) => void;
  setContourFrequency: (val: number) => void;
  setContourThickness: (val: number) => void;

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
  surfaceMode: '3d-topography',
  glowFalloff: 20.0,
  glowScatter: 1.0,
  contourFrequency: 20.0,
  contourThickness: 0.8,
  colorDensity: 3.0,
  colorPhase: 0.0,
  setPrecisionMode: (mode) => set({ precisionMode: mode }),
  setColoringMode: (mode) => set({ coloringMode: mode }),
  setSurfaceMode: (mode) => set({ surfaceMode: mode }),
  setGlowFalloff: (val) => set({ glowFalloff: val }),
  setGlowScatter: (val) => set({ glowScatter: val }),
  setContourFrequency: (val) => set({ contourFrequency: val }),
  setContourThickness: (val) => set({ contourThickness: val }),
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
