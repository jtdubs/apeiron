import React, { useEffect, useRef } from 'react';
import { initEngine } from '../../engine/initEngine';
import type { ApeironEngine } from '../../engine/initEngine';

import mathAccumWgsl from '../../engine/shaders/math_accum.wgsl?raw';
import resolvePresentWgsl from '../../engine/shaders/resolve_present.wgsl?raw';
import { viewportStore } from '../stores/viewportStore';

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
        // Rotate 4D Slice based on horizontal mouse movement
        // We'll map full screen width to a 90 degree rotation (PI/2)
        const angleDelta = (dx / rect.width) * (Math.PI / 2);
        viewportStore.getState().updateViewport(0, 0, 1.0, angleDelta);
      } else {
        // Calculate math delta for regular panning
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
      // Zoom into the center of the viewport currently
      const deltaZoom = e.deltaY > 0 ? 1.05 : 0.95;
      viewportStore.getState().updateViewport(0, 0, deltaZoom, 0.0);
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
          const { zr, zi, cr, ci, zoom, maxIter, sliceAngle, refOrbits } = viewportStore.getState();
          engine.renderFrame(zr, zi, cr, ci, zoom, maxIter, sliceAngle, refOrbits);
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
        // If position or zoom changed, debounce and ask for a new anchor array
        if (
          state.cr !== prevState.cr ||
          state.ci !== prevState.ci ||
          state.zoom !== prevState.zoom
        ) {
          if (timeoutId) clearTimeout(timeoutId);
          timeoutId = window.setTimeout(() => {
            const casesJson = JSON.stringify([
              {
                zr: state.zr.toString(),
                zi: state.zi.toString(),
                cr: state.cr.toString(),
                ci: state.ci.toString(),
              },
            ]);
            worker.postMessage({
              id: Date.now(),
              type: 'COMPUTE',
              casesJson,
              maxIterations: state.maxIter,
            });
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
