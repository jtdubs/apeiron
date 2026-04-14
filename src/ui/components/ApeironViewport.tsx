import React, { useEffect, useRef } from 'react';
import { initEngine } from '../../engine/initEngine';
import type { ApeironEngine } from '../../engine/initEngine';

import mathAccumWgsl from '../../engine/shaders/escape/math_accum.wgsl?raw';
import resolvePresentWgsl from '../../engine/shaders/escape/resolve_present.wgsl?raw';
import { viewportStore } from '../stores/viewportStore';
import { renderStore } from '../stores/renderStore';

export const ApeironViewport: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ApeironEngine | null>(null);
  const requestRef = useRef<number | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let isMounted = true;
    let isDragging = false;
    let isMiddleDragging = false;
    let lastX = 0;
    let lastY = 0;

    const onPointerDown = (e: PointerEvent) => {
      if (e.button === 1 || e.shiftKey || e.altKey || e.ctrlKey) {
        isMiddleDragging = true;
      } else {
        isDragging = true;
      }
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging && !isMiddleDragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;

      const rect = canvas.getBoundingClientRect();
      const { zoom } = viewportStore.getState();

      if (isMiddleDragging) {
        const angleDelta = (dx / rect.width) * Math.PI;
        viewportStore.getState().updateViewport(0, 0, 1.0, angleDelta);
      } else {
        const mathDx = -2.0 * (dx / rect.width) * zoom * (rect.width / rect.height);
        const mathDy = 2.0 * (dy / rect.height) * zoom;
        viewportStore.getState().updateViewport(mathDx, mathDy, 1.0, 0.0);
      }
    };

    const onPointerUp = (e: PointerEvent) => {
      isDragging = false;
      isMiddleDragging = false;
      canvas.releasePointerCapture(e.pointerId);
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const { zoom } = viewportStore.getState();
      const deltaZoom = Math.pow(10, e.deltaY > 0 ? 0.1 : -0.1);

      const rect = canvas.getBoundingClientRect();
      const ndcX = ((e.clientX - rect.left) / rect.width) * 2.0 - 1.0;
      const ndcY = -(((e.clientY - rect.top) / rect.height) * 2.0 - 1.0);

      const aspect = rect.width / rect.height;
      const mathDx = ndcX * zoom * aspect * (1.0 - deltaZoom);
      const mathDy = ndcY * zoom * (1.0 - deltaZoom);

      viewportStore.getState().updateViewport(mathDx, mathDy, deltaZoom, 0.0);
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    const initialize = async () => {
      try {
        const engine = await initEngine(canvas, mathAccumWgsl, resolvePresentWgsl);
        if (!isMounted) return;
        engineRef.current = engine;

        const loop = () => {
          if (!isMounted) return;
          const state = viewportStore.getState();
          const theme = renderStore.getState();

          const isPerturb = state.refOrbits !== null && theme.precisionMode !== 'f32';

          const passZr = isPerturb ? state.deltaZr : parseFloat(state.anchorZr) + state.deltaZr;
          const passZi = isPerturb ? state.deltaZi : parseFloat(state.anchorZi) + state.deltaZi;
          const passCr = isPerturb ? state.deltaCr : parseFloat(state.anchorCr) + state.deltaCr;
          const passCi = isPerturb ? state.deltaCi : parseFloat(state.anchorCi) + state.deltaCi;

          engine.renderFrame(
            passZr,
            passZi,
            passCr,
            passCi,
            state.zoom,
            state.maxIter,
            state.sliceAngle,
            state.exponent,
            state.refOrbits,
            theme,
          );
          requestRef.current = requestAnimationFrame(loop);
        };
        requestRef.current = requestAnimationFrame(loop);
      } catch (err) {
        console.error('Failed to initialize WebGPU engine:', err);
      }
    };

    initialize();

    // Perturbation Web Worker Orchestration
    const worker = new Worker(
      new URL('../../engine/math-workers/rust.worker.ts', import.meta.url),
      {
        type: 'module',
      },
    );

    worker.onmessage = (e: MessageEvent) => {
      if (e.data.type === 'COMPUTE_RESULT' && e.data.result) {
        viewportStore.getState().setRefOrbits(e.data.result);
      }
    };

    let timeoutId: number | null = null;
    let logTimeoutId: number | null = null;
    const unsub = viewportStore.subscribe((state, prevState) => {
      if (logTimeoutId) clearTimeout(logTimeoutId);
      logTimeoutId = window.setTimeout(() => {
        console.log(
          `📍 Viewport Config - zr: ${state.zr}, zi: ${state.zi}, cr: ${state.cr}, ci: ${state.ci}, zoom: ${state.zoom}`,
        );
      }, 250);

      // We only compute new orbits if we are deep zooming
      if (state.zoom < 1e-4) {
        if (
          state.deltaCr !== prevState.deltaCr ||
          state.deltaCi !== prevState.deltaCi ||
          state.zoom !== prevState.zoom
        ) {
          if (timeoutId) clearTimeout(timeoutId);
          timeoutId = window.setTimeout(() => {
            // Recenter: JS gives the exact absolute float until Rust BigFloat addition is fully implemented
            const absZr = (parseFloat(state.anchorZr) + state.deltaZr).toString();
            const absZi = (parseFloat(state.anchorZi) + state.deltaZi).toString();
            const absCr = (parseFloat(state.anchorCr) + state.deltaCr).toString();
            const absCi = (parseFloat(state.anchorCi) + state.deltaCi).toString();

            const casesJson = JSON.stringify([
              {
                zr: absZr,
                zi: absZi,
                cr: absCr,
                ci: absCi,
                exponent: state.exponent,
              },
            ]);
            worker.postMessage({
              id: Date.now(),
              type: 'COMPUTE',
              casesJson,
              maxIterations: state.maxIter,
            });

            // Accept the new center
            viewportStore
              .getState()
              .setAnchorsAndDeltas(
                absZr,
                absZi,
                absCr,
                absCi,
                0.0,
                0.0,
                0.0,
                0.0,
                state.zoom,
                state.sliceAngle,
                state.exponent,
              );
          }, 150); // 150ms debounce
        }
      } else {
        if (state.refOrbits !== null) {
          viewportStore.getState().setRefOrbits(null);
        }
      }
    });

    const resizeObserver = new ResizeObserver((entries) => {
      if (!canvas) return;
      for (const entry of entries) {
        if (entry.target === canvas) {
          // Adjust internal canvas resolution to match physical pixels
          const dpr = window.devicePixelRatio || 1;
          const rect = canvas.getBoundingClientRect();
          canvas.width = rect.width * dpr;
          canvas.height = rect.height * dpr;

          if (engineRef.current) {
            engineRef.current.resize();
          }
        }
      }
    });

    resizeObserver.observe(canvas);

    return () => {
      isMounted = false;
      if (requestRef.current) {
        cancelAnimationFrame(requestRef.current);
      }
      unsub();
      if (timeoutId) clearTimeout(timeoutId);
      if (logTimeoutId) clearTimeout(logTimeoutId);
      worker.terminate();
      resizeObserver.disconnect();
      canvas.removeEventListener('pointerdown', onPointerDown);
      canvas.removeEventListener('pointermove', onPointerMove);
      canvas.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('pointercancel', onPointerUp);
      canvas.removeEventListener('wheel', onWheel);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{
        width: '100vw',
        height: '100vh',
        display: 'block',
      }}
    />
  );
};
