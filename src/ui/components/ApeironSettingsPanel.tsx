import React from 'react';
import { useStore } from 'zustand';
import { themeStore } from '../stores/themeStore';
import { ScrubbableNumber } from './ScrubbableNumber';

const THEMES = {
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

export const ApeironSettingsPanel: React.FC = () => {
  const state = useStore(themeStore);

  return (
    <div className="hud-settings-panel">
      <h2
        style={{
          margin: '0 0 16px 0',
          fontSize: '14px',
          fontWeight: 600,
          textTransform: 'uppercase',
          letterSpacing: '1px',
          borderBottom: '1px solid rgba(255,255,255,0.1)',
          paddingBottom: '8px',
        }}
      >
        Render Controls
      </h2>

      {/* Coloring Modes */}
      <div style={{ marginBottom: 16 }}>
        <div
          style={{
            fontSize: '11px',
            color: '#94a3b8',
            marginBottom: 6,
            textTransform: 'uppercase',
          }}
        >
          Coloring Mode
        </div>
        <select
          value={state.coloringMode}
          onChange={(e) => state.setColoringMode(e.target.value as 'iteration' | 'stripe')}
          style={{
            width: '100%',
            background: 'rgba(0,0,0,0.3)',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.2)',
            padding: '6px 8px',
            borderRadius: 4,
            outline: 'none',
          }}
        >
          <option value="iteration">Continuous Escape Time</option>
          <option value="banded">Banded (Integer Steps)</option>
          <option value="stripe">Triangle Inequality Average (Stripe)</option>
        </select>
      </div>

      <div style={{ marginBottom: 12 }}>
        <ScrubbableNumber
          label="Color Density"
          value={state.colorDensity}
          onChange={(val) => state.setColorDensity(val)}
          min={0.1}
          max={100.0}
          step={0.1}
          sensitivity={0.1}
        />
      </div>
      <div style={{ marginBottom: 16 }}>
        <ScrubbableNumber
          label="Color Phase"
          value={state.colorPhase}
          onChange={(val) => state.setColorPhase(val)}
          step={0.1}
          sensitivity={0.05}
        />
      </div>

      {/* Precision Modes */}
      <div style={{ marginBottom: 16 }}>
        <div
          style={{
            fontSize: '11px',
            color: '#94a3b8',
            marginBottom: 6,
            textTransform: 'uppercase',
          }}
        >
          Math Precision
        </div>
        <select
          value={state.precisionMode}
          onChange={(e) => state.setPrecisionMode(e.target.value as 'f32' | 'perturbation')}
          style={{
            width: '100%',
            background: 'rgba(0,0,0,0.3)',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.2)',
            padding: '6px 8px',
            borderRadius: 4,
            outline: 'none',
          }}
        >
          <option value="perturbation">Perturbation (Deep Zoom)</option>
          <option value="f32">Native F32 (Fast)</option>
        </select>
      </div>

      {/* Palette Selector */}
      <div style={{ marginBottom: 16 }}>
        <div
          style={{
            fontSize: '11px',
            color: '#94a3b8',
            marginBottom: 6,
            textTransform: 'uppercase',
          }}
        >
          Theme Palette
        </div>
        <select
          onChange={(e) => {
            const theme = THEMES[e.target.value as keyof typeof THEMES];
            if (theme) state.setPalette(theme.a, theme.b, theme.c, theme.d);
          }}
          style={{
            width: '100%',
            background: 'rgba(0,0,0,0.3)',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.2)',
            padding: '6px 8px',
            borderRadius: 4,
            outline: 'none',
          }}
        >
          <option value="monochrome">Monochrome</option>
          <option value="midnight">Midnight</option>
          <option value="neon">Neon</option>
          <option value="fiery">Fiery</option>
          <option value="watermelon">Watermelon</option>
          <option value="cyberpunk">Cyberpunk</option>
        </select>
      </div>

      {/* Surface Configuration */}
      <div style={{ marginBottom: 16 }}>
        <div
          style={{
            fontSize: '11px',
            color: '#94a3b8',
            marginBottom: 6,
            textTransform: 'uppercase',
          }}
        >
          Surface Mode
        </div>
        <select
          value={state.surfaceMode}
          onChange={(e) =>
            state.setSurfaceMode(
              e.target.value as 'off' | '3d-topography' | 'soft-glow' | 'contours',
            )
          }
          style={{
            width: '100%',
            background: 'rgba(0,0,0,0.3)',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.2)',
            padding: '6px 8px',
            borderRadius: 4,
            outline: 'none',
            marginBottom: '16px',
          }}
        >
          <option value="off">Off (Flat Color)</option>
          <option value="3d-topography">3D Topography</option>
          <option value="soft-glow">Soft Glow</option>
          <option value="contours">Contours</option>
        </select>

        {state.surfaceMode === '3d-topography' && (
          <>
            <div
              style={{
                fontSize: '11px',
                color: '#94a3b8',
                marginBottom: 6,
                textTransform: 'uppercase',
              }}
            >
              Surface Lighting
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 4,
                fontSize: '12px',
              }}
            >
              <span>Azimuth</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                <ScrubbableNumber
                  value={state.lightAzimuth}
                  onChange={(v) =>
                    state.setLighting(
                      v,
                      state.lightElevation,
                      state.diffuse,
                      state.shininess,
                      state.heightScale,
                      state.ambient,
                    )
                  }
                  step={5}
                  min={0}
                  max={360}
                />
                <span>°</span>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 4,
                fontSize: '12px',
              }}
            >
              <span>Elevation</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '2px' }}>
                <ScrubbableNumber
                  value={state.lightElevation}
                  onChange={(v) =>
                    state.setLighting(
                      state.lightAzimuth,
                      v,
                      state.diffuse,
                      state.shininess,
                      state.heightScale,
                      state.ambient,
                    )
                  }
                  step={5}
                  min={0}
                  max={360}
                />
                <span>°</span>
              </div>
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 4,
                fontSize: '12px',
              }}
            >
              <span>Diffuse</span>
              <ScrubbableNumber
                value={state.diffuse}
                onChange={(v) =>
                  state.setLighting(
                    state.lightAzimuth,
                    state.lightElevation,
                    v,
                    state.shininess,
                    state.heightScale,
                    state.ambient,
                  )
                }
                step={0.1}
                min={0}
                max={2.0}
              />
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '12px',
              }}
            >
              <span>Shininess</span>
              <ScrubbableNumber
                value={state.shininess}
                onChange={(v) =>
                  state.setLighting(
                    state.lightAzimuth,
                    state.lightElevation,
                    state.diffuse,
                    v,
                    state.heightScale,
                    state.ambient,
                  )
                }
                step={0.01}
                min={1}
                max={128}
                isLogScale={true}
                format={(v) => v.toFixed(1)}
              />
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 4,
                fontSize: '12px',
              }}
            >
              <span>Height Scale</span>
              <ScrubbableNumber
                value={state.heightScale}
                onChange={(v) =>
                  state.setLighting(
                    state.lightAzimuth,
                    state.lightElevation,
                    state.diffuse,
                    state.shininess,
                    v,
                    state.ambient,
                  )
                }
                step={0.01}
                min={0}
                max={1.0}
              />
            </div>

            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                fontSize: '12px',
              }}
            >
              <span>Ambient</span>
              <ScrubbableNumber
                value={state.ambient}
                onChange={(v) =>
                  state.setLighting(
                    state.lightAzimuth,
                    state.lightElevation,
                    state.diffuse,
                    state.shininess,
                    state.heightScale,
                    v,
                  )
                }
                step={0.05}
                min={0}
                max={1.0}
              />
            </div>
          </>
        )}

        {state.surfaceMode === 'soft-glow' && (
          <>
            <div
              style={{
                fontSize: '11px',
                color: '#94a3b8',
                marginBottom: 6,
                textTransform: 'uppercase',
              }}
            >
              Glow Settings
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 4,
                fontSize: '12px',
              }}
            >
              <span>Falloff</span>
              <ScrubbableNumber
                value={state.glowFalloff}
                onChange={state.setGlowFalloff}
                step={0.1}
                min={0.1}
                max={100}
                isLogScale={true}
              />
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 4,
                fontSize: '12px',
              }}
            >
              <span>Scatter</span>
              <ScrubbableNumber
                value={state.glowScatter}
                onChange={state.setGlowScatter}
                step={0.05}
                min={0}
                max={10}
              />
            </div>
          </>
        )}

        {state.surfaceMode === 'contours' && (
          <>
            <div
              style={{
                fontSize: '11px',
                color: '#94a3b8',
                marginBottom: 6,
                textTransform: 'uppercase',
              }}
            >
              Contour Settings
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 4,
                fontSize: '12px',
              }}
            >
              <span>Frequency</span>
              <ScrubbableNumber
                value={state.contourFrequency}
                onChange={state.setContourFrequency}
                step={0.1}
                min={0.1}
                max={1000}
                isLogScale={true}
              />
            </div>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: 4,
                fontSize: '12px',
              }}
            >
              <span>Thickness</span>
              <ScrubbableNumber
                value={state.contourThickness}
                onChange={state.setContourThickness}
                step={0.01}
                min={0}
                max={1}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
};
