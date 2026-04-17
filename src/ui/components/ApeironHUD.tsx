import React, { useState, useEffect } from 'react';
import { useStore } from 'zustand';
import { useShallow } from 'zustand/react/shallow';
import { viewportStore } from '../stores/viewportStore';
import type { ViewportState } from '../stores/viewportStore';
import { ScrubbableNumber } from './ScrubbableNumber';
import { ApeironSettingsPanel } from './ApeironSettingsPanel';
import './ApeironHUD.css';

const getAbs = (
  state: Pick<
    ViewportState,
    | 'anchorZr'
    | 'anchorZi'
    | 'anchorCr'
    | 'anchorCi'
    | 'deltaZr'
    | 'deltaZi'
    | 'deltaCr'
    | 'deltaCi'
  >,
) => [
  parseFloat(state.anchorZr) + state.deltaZr,
  parseFloat(state.anchorZi) + state.deltaZi,
  parseFloat(state.anchorCr) + state.deltaCr,
  parseFloat(state.anchorCi) + state.deltaCi,
];

const setAnchors = (
  state: Pick<ViewportState, 'setAnchorsAndDeltas' | 'sliceAngle' | 'exponent'>,
  zr: number,
  zi: number,
  cr: number,
  ci: number,
  zoom: number,
) => {
  state.setAnchorsAndDeltas(
    zr.toString(),
    zi.toString(),
    cr.toString(),
    ci.toString(),
    0.0,
    0.0,
    0.0,
    0.0,
    zoom,
    state.sliceAngle,
    state.exponent,
  );
};

const HUDCoordinates = () => {
  const state = useStore(
    viewportStore,
    useShallow((s) => ({
      anchorZr: s.anchorZr,
      anchorZi: s.anchorZi,
      anchorCr: s.anchorCr,
      anchorCi: s.anchorCi,
      deltaZr: s.deltaZr,
      deltaZi: s.deltaZi,
      deltaCr: s.deltaCr,
      deltaCi: s.deltaCi,
      zoom: s.zoom,
      sliceAngle: s.sliceAngle,
      exponent: s.exponent,
      setAnchorsAndDeltas: s.setAnchorsAndDeltas,
    })),
  );

  const renderCoordinate = (x: number, y: number, prefix: string, isC: boolean) => {
    const onChangeRe = (val: number) => {
      const [absZr, absZi, absCr, absCi] = getAbs(state);
      if (isC) setAnchors(state, absZr, absZi, val, absCi, state.zoom);
      else setAnchors(state, val, absZi, absCr, absCi, state.zoom);
    };

    const onChangeIm = (val: number) => {
      const [absZr, absZi, absCr, absCi] = getAbs(state);
      if (isC) setAnchors(state, absZr, absZi, absCr, val, state.zoom);
      else setAnchors(state, absZr, val, absCr, absCi, state.zoom);
    };

    return (
      <span style={{ display: 'flex', alignItems: 'center' }}>
        <span style={{ color: '#888', marginRight: '8px', width: '60px' }}>{prefix}</span>({' '}
        <ScrubbableNumber
          value={x}
          onChange={onChangeRe}
          step={0.005}
          format={(v) => v.toFixed(6)}
          onInteractionStart={() => viewportStore.getState().setInteractionState('INTERACT_SAFE')}
          onInteractionEnd={() => viewportStore.getState().setInteractionState('STATIC')}
        />
        <span style={{ margin: '0 4px' }}>{y >= 0 ? '+' : '-'}</span>
        <ScrubbableNumber
          value={y}
          onChange={onChangeIm}
          step={0.005}
          format={(v) => Math.abs(v).toFixed(6)}
          onInteractionStart={() => viewportStore.getState().setInteractionState('INTERACT_SAFE')}
          onInteractionEnd={() => viewportStore.getState().setInteractionState('STATIC')}
        />
        i )
      </span>
    );
  };

  return (
    <div className="hud-coordinates">
      {renderCoordinate(
        parseFloat(state.anchorCr) + state.deltaCr,
        parseFloat(state.anchorCi) + state.deltaCi,
        'Focus C:',
        true,
      )}
      {renderCoordinate(
        parseFloat(state.anchorZr) + state.deltaZr,
        parseFloat(state.anchorZi) + state.deltaZi,
        'Focus Z:',
        false,
      )}
      <span style={{ display: 'flex', alignItems: 'center' }}>
        <span style={{ color: '#888', marginRight: '8px', width: '60px' }}>Zoom:</span>
        <ScrubbableNumber
          value={state.zoom}
          onChange={(val) => {
            const [absZr, absZi, absCr, absCi] = getAbs(state);
            setAnchors(state, absZr, absZi, absCr, absCi, val);
          }}
          step={0.01}
          isLogScale={true}
          format={(v) => `${v.toExponential(2)}`}
          onInteractionStart={() => viewportStore.getState().setInteractionState('INTERACT_SAFE')}
          onInteractionEnd={() => viewportStore.getState().setInteractionState('STATIC')}
        />
      </span>
    </div>
  );
};

const HUDEquation = () => {
  const exponent = useStore(viewportStore, (s) => s.exponent);
  const setAnchorsAndDeltas = useStore(viewportStore, (s) => s.setAnchorsAndDeltas);

  const onChange = (val: number) => {
    const clamped = Math.max(1.0, Math.min(6.0, val));
    const s = viewportStore.getState();
    setAnchorsAndDeltas(
      s.anchorZr,
      s.anchorZi,
      s.anchorCr,
      s.anchorCi,
      s.deltaZr,
      s.deltaZi,
      s.deltaCr,
      s.deltaCi,
      s.zoom,
      s.sliceAngle,
      clamped,
    );
  };

  return (
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
            value={exponent}
            onChange={onChange}
            step={0.5}
            format={(v) => v.toFixed(1)}
            onInteractionStart={() => viewportStore.getState().setInteractionState('INTERACT_SAFE')}
            onInteractionEnd={() => viewportStore.getState().setInteractionState('STATIC')}
          />
        </sup>
        <span> + c</span>
      </div>
    </div>
  );
};

const HUDLens = () => {
  const sliceAngle = useStore(viewportStore, (s) => s.sliceAngle);
  const setAnchorsAndDeltas = useStore(viewportStore, (s) => s.setAnchorsAndDeltas);

  const setSliceAngle = (angle: number) => {
    const s = viewportStore.getState();
    setAnchorsAndDeltas(
      s.anchorZr,
      s.anchorZi,
      s.anchorCr,
      s.anchorCi,
      s.deltaZr,
      s.deltaZi,
      s.deltaCr,
      s.deltaCi,
      s.zoom,
      angle,
      s.exponent,
    );
  };

  const toCPlane = () => {
    const s = viewportStore.getState();
    setAnchorsAndDeltas('0.0', '0.0', '-0.8', '0.156', 0.0, 0.0, 0.0, 0.0, 1.5, 0, s.exponent);
  };

  const toZPlane = () => {
    const s = viewportStore.getState();
    setAnchorsAndDeltas(
      '0.0',
      '0.0',
      '-0.8',
      '0.156',
      0.0,
      0.0,
      0.0,
      0.0,
      1.5,
      Math.PI / 2,
      s.exponent,
    );
  };

  return (
    <div className="hud-lens">
      <div className="hud-lens-controls">
        <div className="hud-lens-labels">
          <button
            onClick={toCPlane}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              color: sliceAngle < 0.1 ? '#fff' : '#888',
              transition: 'color 0.2s',
              fontSize: '10px',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              fontWeight: sliceAngle < 0.1 ? 600 : 400,
            }}
          >
            C-Plane
          </button>
          <button
            onClick={toZPlane}
            style={{
              background: 'none',
              border: 'none',
              padding: 0,
              cursor: 'pointer',
              color: sliceAngle > Math.PI / 2 - 0.1 ? '#fff' : '#888',
              transition: 'color 0.2s',
              fontSize: '10px',
              textTransform: 'uppercase',
              letterSpacing: '1px',
              fontWeight: sliceAngle > Math.PI / 2 - 0.1 ? 600 : 400,
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
            viewportStore.getState().setInteractionState('INTERACT_SAFE');

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
              viewportStore.getState().setInteractionState('STATIC');
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
              left: `${(sliceAngle / (Math.PI / 2)) * 100}%`,
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
  );
};

export const ApeironHUD: React.FC = () => {
  const [isMobileExpanded, setIsMobileExpanded] = useState(false);
  const [showSettings, setShowSettings] = useState(false);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'F10') {
        e.preventDefault();
        const state = viewportStore.getState();
        state.setIsTelemetryOpen(!state.isTelemetryOpen);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  return (
    <div className={`hud-container ${isMobileExpanded ? 'is-expanded' : ''}`}>
      <div className="hud-panel">
        <div className="hud-mobile-divider" />
        <HUDLens />
        <div className="hud-mobile-bottom-row">
          <HUDEquation />
          <HUDCoordinates />
        </div>

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

      {showSettings && <ApeironSettingsPanel onClose={() => setShowSettings(false)} />}
    </div>
  );
};
