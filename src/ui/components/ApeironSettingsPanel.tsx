import React from 'react';
import { useStore } from 'zustand';
import { renderStore, THEMES } from '../stores/renderStore';
import { ScrubbableNumber } from './ScrubbableNumber';

export const ApeironSettingsPanel: React.FC = () => {
  const state = useStore(renderStore);

  return (
    <div className="hud-settings-panel">
      <h2 className="hud-settings-header">Render Controls</h2>

      {/* Precision Modes */}
      <div className="hud-settings-section">
        <div className="hud-settings-label">Math Precision</div>
        <select
          value={state.precisionMode}
          onChange={(e) => state.setPrecisionMode(e.target.value as 'f32' | 'perturbation')}
          className="hud-settings-select"
          style={{ marginBottom: 12 }}
        >
          <option value="perturbation">Auto-Hybrid (F32 ➔ Perturbation)</option>
          <option value="f32">Strict Native F32 (Macro Only)</option>
        </select>
      </div>

      {/* Theme Pipeline */}
      <div className="hud-settings-section">
        <div className="hud-settings-label">Color Palette</div>
        <select
          value={state.paletteName}
          onChange={(e) => {
            const key = e.target.value as keyof typeof THEMES;
            const theme = THEMES[key];
            if (theme) state.setPalette(theme.a, theme.b, theme.c, theme.d, key);
          }}
          className="hud-settings-select"
          style={{ marginBottom: 12 }}
        >
          <option value="monochrome">Monochrome</option>
          <option value="midnight">Midnight</option>
          <option value="neon">Neon</option>
          <option value="fiery">Fiery</option>
          <option value="watermelon">Watermelon</option>
          <option value="cyberpunk">Cyberpunk</option>
        </select>

        <div className="hud-settings-label">Mapping Mode</div>
        <select
          value={state.coloringMode}
          onChange={(e) =>
            state.setColoringMode(e.target.value as 'iteration' | 'stripe' | 'banded')
          }
          className="hud-settings-select"
          style={{ marginBottom: 8 }}
        >
          <option value="iteration">Continuous Escape Time</option>
          <option value="banded">Banded (Integer Steps)</option>
          <option value="stripe">Triangle Inequality Average (Stripe)</option>
        </select>

        <div className="hud-settings-flex-row">
          <span>Frequency</span>
          <ScrubbableNumber
            value={state.colorDensity}
            onChange={(val) => state.setColorDensity(val)}
            min={0.1}
            max={100.0}
            step={0.1}
            isLogScale={true}
          />
        </div>
        <div className="hud-settings-flex-row">
          <span>Phase Offset</span>
          <ScrubbableNumber
            value={state.colorPhase}
            onChange={(val) => state.setColorPhase(val)}
            step={0.1}
          />
        </div>
      </div>

      {/* Surface Configuration */}
      <div className="hud-settings-section">
        <div className="hud-settings-label">Surface Mode</div>
        <select
          value={state.surfaceMode}
          onChange={(e) =>
            state.setSurfaceMode(
              e.target.value as 'off' | '3d-topography' | 'soft-glow' | 'contours',
            )
          }
          className="hud-settings-select"
          style={{ marginBottom: 16 }}
        >
          <option value="off">Off (Flat Color)</option>
          <option value="3d-topography">3D Topography</option>
          <option value="soft-glow">Soft Glow</option>
          <option value="contours">Contours</option>
        </select>

        {state.surfaceMode === '3d-topography' && (
          <>
            <div className="hud-settings-label">Surface Lighting</div>

            <div className="hud-settings-flex-row">
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

            <div className="hud-settings-flex-row">
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

            <div className="hud-settings-flex-row">
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

            <div className="hud-settings-flex-row">
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

            <div className="hud-settings-flex-row">
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

            <div className="hud-settings-flex-row">
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
            <div className="hud-settings-label">Glow Settings</div>
            <div className="hud-settings-flex-row">
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
            <div className="hud-settings-flex-row">
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
            <div className="hud-settings-label">Contour Settings</div>
            <div className="hud-settings-flex-row">
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
            <div className="hud-settings-flex-row">
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

      <div className="hud-settings-section">
        <div className="hud-settings-label">Debug</div>
        <div className="hud-settings-flex-row">
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
            <input
              type="checkbox"
              checked={state.showPerfHUD}
              onChange={(e) => state.setShowPerfHUD(e.target.checked)}
            />
            <span>Show GPU Frame Time</span>
          </label>
        </div>
      </div>
    </div>
  );
};
