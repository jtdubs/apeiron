import { createStore } from 'zustand/vanilla';
import { persist } from 'zustand/middleware';

export const THEMES = {
  monochrome: {
    a: [0.5, 0.5, 0.5] as [number, number, number],
    b: [0.5, 0.5, 0.5] as [number, number, number],
    c: [1.0, 1.0, 1.0] as [number, number, number],
    d: [0.0, 0.0, 0.0] as [number, number, number],
  },
  midnight: {
    a: [0.5, 0.5, 0.5] as [number, number, number],
    b: [0.5, 0.5, 0.5] as [number, number, number],
    c: [1.0, 1.0, 1.0] as [number, number, number],
    d: [0.0, 0.1, 0.2] as [number, number, number],
  },
  neon: {
    a: [0.1, 0.2, 0.4] as [number, number, number],
    b: [0.9, 0.8, 0.6] as [number, number, number],
    c: [1.0, 1.0, 1.0] as [number, number, number],
    d: [0.3, 0.2, 0.2] as [number, number, number],
  },
  fiery: {
    a: [0.5, 0.5, 0.5] as [number, number, number],
    b: [0.5, 0.5, 0.5] as [number, number, number],
    c: [1.0, 0.7, 0.4] as [number, number, number],
    d: [0.0, 0.15, 0.2] as [number, number, number],
  },
  watermelon: {
    a: [0.5, 0.5, 0.5] as [number, number, number],
    b: [0.5, 0.5, 0.5] as [number, number, number],
    c: [1.0, 1.0, 1.0] as [number, number, number],
    d: [0.0, 0.33, 0.67] as [number, number, number],
  },
  cyberpunk: {
    a: [0.5, 0.5, 0.5] as [number, number, number],
    b: [0.5, 0.5, 0.5] as [number, number, number],
    c: [2.0, 1.0, 0.0] as [number, number, number],
    d: [0.5, 0.2, 0.25] as [number, number, number],
  },
};

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
  renderMode: 'auto' | 'f32' | 'f32_perturbation' | 'f64_perturbation';
  coloringMode: 'iteration' | 'stripe' | 'banded';
  surfaceMode: 'off' | '3d-topography' | 'soft-glow' | 'contours';
  setRenderMode: (mode: 'auto' | 'f32' | 'f32_perturbation' | 'f64_perturbation') => void;
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

export const renderStore = createStore<RenderState>()(
  persist(
    (set) => ({
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

      renderMode: 'auto',
      coloringMode: 'iteration',
      surfaceMode: '3d-topography',
      glowFalloff: 20.0,
      glowScatter: 1.0,
      contourFrequency: 20.0,
      contourThickness: 0.8,
      colorDensity: 3.0,
      colorPhase: 0.0,
      setRenderMode: (mode) =>
        set((state) => ({ renderMode: mode, themeVersion: state.themeVersion + 1 })),
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
    }),
    {
      name: 'apeiron-render-store',
      // Ensure functions aren't persisted and non-serializable states are handled
    },
  ),
);
