import { createStore } from 'zustand/vanilla';

export interface RenderState {
  // palettes: a, b, c, d
  paletteA: [number, number, number];
  paletteB: [number, number, number];
  paletteC: [number, number, number];
  paletteD: [number, number, number];
  paletteName: string;

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

  themeVersion: number;

  setPalette: (
    a: [number, number, number],
    b: [number, number, number],
    c: [number, number, number],
    d: [number, number, number],
    name?: string,
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

export const renderStore = createStore<RenderState>((set) => ({
  themeVersion: 0,
  // Default 'neon'
  paletteA: [0.5, 0.5, 0.5],
  paletteB: [0.5, 0.5, 0.5],
  paletteC: [1.0, 1.0, 1.0],
  paletteD: [0.0, 0.33, 0.67],
  paletteName: 'watermelon',

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
  setPrecisionMode: (mode) =>
    set((state) => ({ precisionMode: mode, themeVersion: state.themeVersion + 1 })),
  setColoringMode: (mode) =>
    set((state) => ({ coloringMode: mode, themeVersion: state.themeVersion + 1 })),
  setSurfaceMode: (mode) =>
    set((state) => ({ surfaceMode: mode, themeVersion: state.themeVersion + 1 })),
  setGlowFalloff: (val) =>
    set((state) => ({ glowFalloff: val, themeVersion: state.themeVersion + 1 })),
  setGlowScatter: (val) =>
    set((state) => ({ glowScatter: val, themeVersion: state.themeVersion + 1 })),
  setContourFrequency: (val) =>
    set((state) => ({ contourFrequency: val, themeVersion: state.themeVersion + 1 })),
  setContourThickness: (val) =>
    set((state) => ({ contourThickness: val, themeVersion: state.themeVersion + 1 })),
  setColorDensity: (val) =>
    set((state) => ({ colorDensity: val, themeVersion: state.themeVersion + 1 })),
  setColorPhase: (val) =>
    set((state) => ({ colorPhase: val, themeVersion: state.themeVersion + 1 })),

  setPalette: (a, b, c, d, name) =>
    set((state) => ({
      paletteA: a,
      paletteB: b,
      paletteC: c,
      paletteD: d,
      ...(name && { paletteName: name }),
      themeVersion: state.themeVersion + 1,
    })),
  setLighting: (azimuth, elevation, diffuse, shininess, heightScale, ambient) =>
    set((state) => ({
      lightAzimuth: azimuth,
      lightElevation: elevation,
      diffuse,
      shininess,
      heightScale,
      ambient,
      themeVersion: state.themeVersion + 1,
    })),
}));
