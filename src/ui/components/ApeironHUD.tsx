import React, { useState } from 'react';
import { useStore } from 'zustand';
import { viewportStore } from '../stores/viewportStore';
import { ScrubbableNumber } from './ScrubbableNumber';
import { ApeironSettingsPanel } from './ApeironSettingsPanel';
import './ApeironHUD.css';

export const ApeironHUD: React.FC = () => {
  const state = useStore(viewportStore);
  const [isMobileExpanded, setIsMobileExpanded] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  const setSliceAngle = (angle: number) => {
    state.setViewport(state.zr, state.zi, state.cr, state.ci, state.zoom, angle, state.exponent);
  };

  const setAnchors = (zr: number, zi: number, cr: number, ci: number, zoom: number) => {
    state.setViewport(zr, zi, cr, ci, zoom, state.sliceAngle, state.exponent);
  };

  const renderCoordinate = (x: number, y: number, prefix: string, isC: boolean) => {
    const onChangeRe = (val: number) => {
      if (isC) setAnchors(state.zr, state.zi, val, state.ci, state.zoom);
      else setAnchors(val, state.zi, state.cr, state.ci, state.zoom);
    };

    const onChangeIm = (val: number) => {
      if (isC) setAnchors(state.zr, state.zi, state.cr, val, state.zoom);
      else setAnchors(state.zr, val, state.cr, state.ci, state.zoom);
    };

    return (
      <span style={{ display: 'flex', alignItems: 'center' }}>
        <span style={{ color: '#888', marginRight: '8px', width: '60px' }}>{prefix}</span>({' '}
        <ScrubbableNumber
          value={x}
          onChange={onChangeRe}
          step={0.005}
          format={(v) => v.toFixed(6)}
        />
        <span style={{ margin: '0 4px' }}>{y >= 0 ? '+' : '-'}</span>
        <ScrubbableNumber
          value={y}
          onChange={onChangeIm}
          step={0.005}
          format={(v) => Math.abs(v).toFixed(6)}
        />
        i )
      </span>
    );
  };

  return (
    <div className={`hud-container ${isMobileExpanded ? 'is-expanded' : ''}`}>
      <div className="hud-panel">
        <div className="hud-mobile-divider" />

        {/* View Plane Lens / Crossfader */}
        <div className="hud-lens">
          <div className="hud-lens-controls">
            <div className="hud-lens-labels">
              <button
                onClick={() => {
                  state.setViewport(0.0, 0.0, -0.8, 0.156, 1.5, 0, state.exponent);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  color: state.sliceAngle < 0.1 ? '#fff' : '#888',
                  transition: 'color 0.2s',
                  fontSize: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                  fontWeight: state.sliceAngle < 0.1 ? 600 : 400,
                }}
              >
                C-Plane
              </button>
              <button
                onClick={() => {
                  state.setViewport(0.0, 0.0, -0.8, 0.156, 1.5, Math.PI / 2, state.exponent);
                }}
                style={{
                  background: 'none',
                  border: 'none',
                  padding: 0,
                  cursor: 'pointer',
                  color: state.sliceAngle > Math.PI / 2 - 0.1 ? '#fff' : '#888',
                  transition: 'color 0.2s',
                  fontSize: '10px',
                  textTransform: 'uppercase',
                  letterSpacing: '1px',
                  fontWeight: state.sliceAngle > Math.PI / 2 - 0.1 ? 600 : 400,
                }}
              >
                Z-Plane
              </button>
            </div>
            <div
              style={{
                position: 'relative',
                width: '100%',
                height: '24px',
                display: 'flex',
                alignItems: 'center',
                cursor: 'grab',
                touchAction: 'none',
              }}
              onPointerDown={(e) => {
                const target = e.currentTarget;
                target.setPointerCapture(e.pointerId);
                const rect = target.getBoundingClientRect();
                const updateAngle = (clientX: number) => {
                  let ratio = (clientX - rect.left) / rect.width;
                  ratio = Math.max(0, Math.min(1, ratio));
                  setSliceAngle(ratio * (Math.PI / 2));
                };
                updateAngle(e.clientX);
                target.style.cursor = 'grabbing';

                const onMove = (ev: PointerEvent) => updateAngle(ev.clientX);
                const onUp = (ev: PointerEvent) => {
                  target.style.cursor = 'grab';
                  try {
                    target.releasePointerCapture(ev.pointerId);
                  } catch {
                    /* ignore */
                  }
                  window.removeEventListener('pointermove', onMove);
                  window.removeEventListener('pointerup', onUp);
                  window.removeEventListener('pointercancel', onUp);
                };
                window.addEventListener('pointermove', onMove);
                window.addEventListener('pointerup', onUp);
                window.addEventListener('pointercancel', onUp);
              }}
            >
              <div
                style={{
                  position: 'absolute',
                  width: '100%',
                  height: '4px',
                  backgroundColor: 'rgba(255,255,255,0.1)',
                  borderRadius: '2px',
                  pointerEvents: 'none',
                }}
              />
              <div
                style={{
                  position: 'absolute',
                  left: `${(state.sliceAngle / (Math.PI / 2)) * 100}%`,
                  top: '50%',
                  transform: 'translate(-50%, -50%)',
                  width: '12px',
                  height: '12px',
                  backgroundColor: '#4f46e5',
                  borderRadius: '50%',
                  boxShadow: '0 0 8px rgba(79,70,229,0.8)',
                  pointerEvents: 'none',
                }}
              />
            </div>
          </div>
        </div>

        {/* Core Equation */}
        <div className="hud-mobile-bottom-row">
          <div className="hud-equation" style={{ flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', alignItems: 'center' }}>
              <span>
                z<sub style={{ fontSize: '10px' }}>n+1</sub>
              </span>
              <span style={{ margin: '0 6px' }}>=</span>
              <span>
                z<sub style={{ fontSize: '10px' }}>n</sub>
              </span>
              <sup
                style={{
                  marginLeft: '2px',
                  marginRight: '6px',
                  fontSize: '12px',
                  position: 'relative',
                  top: '-0.4em',
                }}
              >
                <ScrubbableNumber
                  value={state.exponent}
                  onChange={(val) => {
                    const clamped = Math.max(1.0, Math.min(6.0, val));
                    state.setViewport(
                      state.zr,
                      state.zi,
                      state.cr,
                      state.ci,
                      state.zoom,
                      state.sliceAngle,
                      clamped,
                    );
                  }}
                  step={0.5}
                  format={(v) => v.toFixed(1)}
                />
              </sup>
              <span> + c</span>
            </div>
          </div>

          <div className="hud-coordinates">
            {renderCoordinate(state.cr, state.ci, 'Focus C:', true)}
            {renderCoordinate(state.zr, state.zi, 'Focus Z:', false)}
            <span style={{ display: 'flex', alignItems: 'center' }}>
              <span style={{ color: '#888', marginRight: '8px', width: '60px' }}>Zoom:</span>
              <ScrubbableNumber
                value={state.zoom}
                onChange={(val) => setAnchors(state.zr, state.zi, state.cr, state.ci, val)}
                step={0.01}
                isLogScale={true}
                format={(v) => `${v.toExponential(2)}`}
              />
            </span>
          </div>
        </div>

        {/* Action Buttons for Mobile & Settings */}
        <div className="hud-actions">
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="hud-icon-btn"
            style={{ fontSize: '16px' }}
          >
            {showSettings ? '✕' : '⚙'}
          </button>

          <button
            onClick={() => setIsMobileExpanded(!isMobileExpanded)}
            className="hud-icon-btn hud-mobile-only"
            style={{ fontSize: '12px' }}
          >
            {isMobileExpanded ? '▼' : '▲'}
          </button>
        </div>
      </div>

      {showSettings && <ApeironSettingsPanel />}
    </div>
  );
};
