import { viewportStore } from '../ui/stores/viewportStore';
import { renderStore, THEMES } from '../ui/stores/renderStore';

let syncTimeout: number | null = null;
let isInitializing = false;

// We use short keys to compress the base64 string
export interface SerializedState {
  v: {
    azr: string;
    azi: string;
    acr: string;
    aci: string;
    dzr: number;
    dzi: number;
    dcr: number;
    dci: number;
    z: number;
    sa: number;
    e: number;
  };
  r: {
    pn: string;
    pm: 'f32' | 'perturbation';
    cm: 'iteration' | 'stripe' | 'banded';
    sm: 'off' | '3d-topography' | 'soft-glow' | 'contours';
    gf: number;
    gs: number;
    cf: number;
    ct: number;
    cd: number;
    cp: number;
    la: number;
    le: number;
    d: number;
    s: number;
    hs: number;
    a: number;
  };
}

export function serializeState(): string {
  const v = viewportStore.getState();
  const r = renderStore.getState();

  const state: SerializedState = {
    v: {
      azr: v.anchorZr,
      azi: v.anchorZi,
      acr: v.anchorCr,
      aci: v.anchorCi,
      dzr: v.deltaZr,
      dzi: v.deltaZi,
      dcr: v.deltaCr,
      dci: v.deltaCi,
      z: v.zoom,
      sa: v.sliceAngle,
      e: v.exponent,
    },
    r: {
      pn: r.paletteName,
      pm: r.precisionMode,
      cm: r.coloringMode,
      sm: r.surfaceMode,
      gf: r.glowFalloff,
      gs: r.glowScatter,
      cf: r.contourFrequency,
      ct: r.contourThickness,
      cd: r.colorDensity,
      cp: r.colorPhase,
      la: r.lightAzimuth,
      le: r.lightElevation,
      d: r.diffuse,
      s: r.shininess,
      hs: r.heightScale,
      a: r.ambient,
    },
  };

  return btoa(JSON.stringify(state));
}

export function deserializeState(hash: string): boolean {
  try {
    const raw = hash.replace(/^#/, '');
    if (!raw) return false;

    const jsonStr = atob(raw);
    const state = JSON.parse(jsonStr) as SerializedState;

    isInitializing = true;

    if (state.v) {
      viewportStore
        .getState()
        .setAnchorsAndDeltas(
          state.v.azr,
          state.v.azi,
          state.v.acr,
          state.v.aci,
          state.v.dzr,
          state.v.dzi,
          state.v.dcr,
          state.v.dci,
          state.v.z,
          state.v.sa,
          state.v.e,
        );
    }

    if (state.r) {
      const rs = renderStore.getState();
      if (state.r.pm) rs.setPrecisionMode(state.r.pm);
      if (state.r.cm) rs.setColoringMode(state.r.cm);
      if (state.r.sm) rs.setSurfaceMode(state.r.sm);
      if (state.r.gf !== undefined) rs.setGlowFalloff(state.r.gf);
      if (state.r.gs !== undefined) rs.setGlowScatter(state.r.gs);
      if (state.r.cf !== undefined) rs.setContourFrequency(state.r.cf);
      if (state.r.ct !== undefined) rs.setContourThickness(state.r.ct);
      if (state.r.cd !== undefined) rs.setColorDensity(state.r.cd);
      if (state.r.cp !== undefined) rs.setColorPhase(state.r.cp);

      if (state.r.la !== undefined) {
        rs.setLighting(state.r.la, state.r.le, state.r.d, state.r.s, state.r.hs, state.r.a);
      }

      if (state.r.pn) {
        const theme = THEMES[state.r.pn as keyof typeof THEMES];
        if (theme) {
          rs.setPalette(theme.a, theme.b, theme.c, theme.d, state.r.pn);
        }
      }
    }

    isInitializing = false;
    return true;
  } catch (e) {
    console.error('Failed to deserialize URL state', e);
    isInitializing = false;
    return false;
  }
}

export function initUrlSync() {
  if (typeof window === 'undefined') return;

  // Initial read
  if (window.location.hash) {
    deserializeState(window.location.hash);
  }

  // Set up listeners for subsequent updates
  const syncFunc = () => {
    if (isInitializing) return;

    if (syncTimeout !== null) {
      window.clearTimeout(syncTimeout);
    }

    syncTimeout = window.setTimeout(() => {
      const hash = serializeState();
      window.history.replaceState(null, '', '#' + hash);
    }, 500);
  };

  viewportStore.subscribe(syncFunc);
  renderStore.subscribe(syncFunc);
}
