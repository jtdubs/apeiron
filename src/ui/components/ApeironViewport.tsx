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
    const activePointers = new Map<number, { x: number; y: number }>();
    let isMiddleMouseDragging = false;
    let lastCentroid = { x: 0, y: 0 };
    let lastDistance = 0;
    let wheelTimeoutId: number | null = null;
    let cssWidth = window.innerWidth;
    let cssHeight = window.innerHeight;
    let canvasSizeVersion = 0;

    // Set canvas to full native resolution immediately on mount.
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.max(1, Math.floor(cssWidth * dpr));
    canvas.height = Math.max(1, Math.floor(cssHeight * dpr));

    const getPointersMetrics = () => {
      if (activePointers.size === 0) return null;
      let cx = 0;
      let cy = 0;
      for (const p of activePointers.values()) {
        cx += p.x;
        cy += p.y;
      }
      cx /= activePointers.size;
      cy /= activePointers.size;

      let distance = 0;
      if (activePointers.size === 2) {
        const pts = Array.from(activePointers.values());
        distance = Math.hypot(pts[1].x - pts[0].x, pts[1].y - pts[0].y);
      }
      return { cx, cy, distance };
    };

    const onPointerDown = (e: PointerEvent) => {
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
      const metrics = getPointersMetrics();
      if (metrics) {
        lastCentroid = { x: metrics.cx, y: metrics.cy };
        lastDistance = metrics.distance;
      }
      if (e.pointerType === 'mouse' && (e.button === 1 || e.shiftKey || e.altKey || e.ctrlKey)) {
        isMiddleMouseDragging = true;
      }
      viewportStore.getState().setInteractionState('INTERACT_SAFE');
      canvas.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!activePointers.has(e.pointerId)) return;
      activePointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

      const metrics = getPointersMetrics();
      if (!metrics) return;

      const dx = metrics.cx - lastCentroid.x;
      const dy = metrics.cy - lastCentroid.y;

      const rect = canvas.getBoundingClientRect();
      const { zoom } = viewportStore.getState();

      if (activePointers.size === 2) {
        const distDelta = metrics.distance - lastDistance;
        const zoomFactor = Math.pow(0.995, distDelta);

        const ndcX = ((metrics.cx - rect.left) / rect.width) * 2.0 - 1.0;
        const ndcY = -(((metrics.cy - rect.top) / rect.height) * 2.0 - 1.0);
        const aspect = rect.width / rect.height;

        const mathDx = ndcX * zoom * aspect * (1.0 - zoomFactor);
        const mathDy = ndcY * zoom * (1.0 - zoomFactor);

        const sliceAngleDelta = (dx / rect.width) * Math.PI;

        viewportStore.getState().updateViewport(mathDx, mathDy, zoomFactor, sliceAngleDelta);
      } else if (isMiddleMouseDragging) {
        const sliceAngleDelta = (dx / rect.width) * Math.PI;
        viewportStore.getState().updateViewport(0, 0, 1.0, sliceAngleDelta);
      } else if (activePointers.size === 1) {
        const mathDx = -2.0 * (dx / rect.width) * zoom * (rect.width / rect.height);
        const mathDy = 2.0 * (dy / rect.height) * zoom;
        viewportStore.getState().updateViewport(mathDx, mathDy, 1.0, 0.0);
      }

      lastCentroid = { x: metrics.cx, y: metrics.cy };
      lastDistance = metrics.distance;
    };

    const onPointerUp = (e: PointerEvent) => {
      activePointers.delete(e.pointerId);
      const metrics = getPointersMetrics();
      if (metrics) {
        lastCentroid = { x: metrics.cx, y: metrics.cy };
        lastDistance = metrics.distance;
      }
      if (activePointers.size === 0) {
        viewportStore.getState().setInteractionState('STATIC');
      }
      if (e.pointerType === 'mouse') {
        isMiddleMouseDragging = false;
      }
      try {
        canvas.releasePointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }
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

      viewportStore.getState().setInteractionState('INTERACT_SAFE');
      if (wheelTimeoutId) window.clearTimeout(wheelTimeoutId);
      wheelTimeoutId = window.setTimeout(() => {
        viewportStore.getState().setInteractionState('STATIC');
      }, 150);

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
        let lastRenderStateKey = '';
        let lastBaseGeometryKey = '';
        let frameCount = 1.0;

        const loop = () => {
          if (!isMounted) return;
          const state = viewportStore.getState();
          const theme = renderStore.getState();

          const isPerturb = state.refOrbits !== null && theme.precisionMode !== 'f32';

          const passZr = isPerturb ? state.deltaZr : parseFloat(state.anchorZr) + state.deltaZr;
          const passZi = isPerturb ? state.deltaZi : parseFloat(state.anchorZi) + state.deltaZi;
          const passCr = isPerturb ? state.deltaCr : parseFloat(state.anchorCr) + state.deltaCr;
          const passCi = isPerturb ? state.deltaCi : parseFloat(state.anchorCi) + state.deltaCi;

          // DRS: scale the render resolution without touching the canvas.
          // Canvas stays at full devicePixelRatio. During INTERACT we render
          // into a sub-rect and upscale via the resolve shader. No GPU surface resize.
          const renderDpr = window.devicePixelRatio || 1;
          const renderScale = state.interactionState === 'STATIC' ? 1.0 : 1.0 / renderDpr;

          const baseGeometryKey = `${passZr},${passZi},${passCr},${passCi},${state.zoom},${state.sliceAngle},${state.exponent},${state.maxIter},${state.refOrbits !== null},${theme.themeVersion},${canvasSizeVersion}`;
          if (baseGeometryKey !== lastBaseGeometryKey) {
            frameCount = 1.0;
            lastBaseGeometryKey = baseGeometryKey;
          }

          const renderStateKey = `${baseGeometryKey},${state.interactionState},${renderScale},${frameCount}`;

          if (
            renderStateKey !== lastRenderStateKey ||
            (state.interactionState === 'STATIC' && frameCount <= 64.0)
          ) {
            let jitterX = 0.0;
            let jitterY = 0.0;

            if (state.interactionState === 'STATIC') {
              if (frameCount > 1.0 && frameCount <= 64.0) {
                // Sub-pixel jitter: range [-1/width, 1/width] in UV space
                // Use full canvas dimensions since STATIC always renders at renderScale 1.0.
                jitterX = (Math.random() - 0.5) * (2.0 / canvas.width);
                jitterY = (Math.random() - 0.5) * (2.0 / canvas.height);
              }
              frameCount = Math.min(frameCount + 1.0, 65.0);
            } else {
              frameCount = 1.0;
            }

            // INTERACT frames always pass frameCount=1.0 so the accumulation shader
            // never blends the full-res STATIC prev_frame into the low-res sub-rect.
            // (OLD code relied on the canvas resize changing baseGeometryKey to reset
            // frameCount before capture; that side effect is gone with zero-resize DRS.)
            const passFrameCount = state.interactionState === 'STATIC' ? frameCount - 1.0 : 1.0;

            engine.renderFrame(
              passZr,
              passZi,
              passCr,
              passCi,
              state.zoom,
              state.maxIter,
              state.sliceAngle,
              state.exponent,
              state.interactionState,
              jitterX,
              jitterY,
              passFrameCount,
              renderScale,
              state.refOrbits,
              theme,
            );
            lastRenderStateKey = renderStateKey;
          }
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

    interface WorkerJob {
      id: number;
      absZr: string;
      absZi: string;
      absCr: string;
      absCi: string;
      exponent: number;
      maxIter: number;
    }
    let isWorkerBusy = false;
    let pendingWorkerJob: WorkerJob | null = null;
    let currentWorkerJob: WorkerJob | null = null;

    const dispatchPendingWork = () => {
      if (pendingWorkerJob) {
        currentWorkerJob = pendingWorkerJob;
        pendingWorkerJob = null;
        isWorkerBusy = true;

        const casesJson = JSON.stringify([
          {
            zr: currentWorkerJob.absZr,
            zi: currentWorkerJob.absZi,
            cr: currentWorkerJob.absCr,
            ci: currentWorkerJob.absCi,
            exponent: currentWorkerJob.exponent,
          },
        ]);
        worker.postMessage({
          id: currentWorkerJob.id,
          type: 'COMPUTE',
          casesJson,
          maxIterations: currentWorkerJob.maxIter,
        });
      } else {
        isWorkerBusy = false;
        currentWorkerJob = null;
      }
    };

    worker.onmessage = (e: MessageEvent) => {
      if (e.data.type === 'COMPUTE_RESULT' && e.data.result) {
        // Did the user pan while we were waiting?
        if (pendingWorkerJob !== null) {
          // Discard the obsolete result, dispatch the pending work immediately
          dispatchPendingWork();
        } else if (currentWorkerJob) {
          const job = currentWorkerJob;

          // Apply state synchronously to avoid tearing/flickering
          viewportStore.setState((state) => {
            // Need to deduce how much the user has panned *since* this job was queued
            // To do that, we find the absolute physical coordinate right now:
            const currentAbsoluteCr = parseFloat(state.anchorCr) + state.deltaCr;
            const currentAbsoluteCi = parseFloat(state.anchorCi) + state.deltaCi;
            const currentAbsoluteZr = parseFloat(state.anchorZr) + state.deltaZr;
            const currentAbsoluteZi = parseFloat(state.anchorZi) + state.deltaZi;

            // Our new anchor will be the one the worker just finished
            const newDeltaCr = currentAbsoluteCr - parseFloat(job.absCr);
            const newDeltaCi = currentAbsoluteCi - parseFloat(job.absCi);
            const newDeltaZr = currentAbsoluteZr - parseFloat(job.absZr);
            const newDeltaZi = currentAbsoluteZi - parseFloat(job.absZi);

            return {
              anchorZr: job.absZr,
              anchorZi: job.absZi,
              anchorCr: job.absCr,
              anchorCi: job.absCi,
              deltaZr: newDeltaZr,
              deltaZi: newDeltaZi,
              deltaCr: newDeltaCr,
              deltaCi: newDeltaCi,
              zoom: state.zoom, // don't clobber active zoom
              sliceAngle: state.sliceAngle,
              exponent: state.exponent,
              maxIter: state.maxIter,
              refOrbits: e.data.result,
            };
          });

          isWorkerBusy = false;
          currentWorkerJob = null;
        }
      }
    };

    let timeoutId: number | null = null;
    let logTimeoutId: number | null = null;
    const unsub = viewportStore.subscribe((state, prevState) => {
      if (logTimeoutId) clearTimeout(logTimeoutId);
      logTimeoutId = window.setTimeout(() => {
        console.log(
          `📍 Viewport Config - z_anchor: ${state.anchorZr}, ${state.anchorZi} | c_anchor: ${state.anchorCr}, ${state.anchorCi} | zoom: ${state.zoom}`,
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

            const job = {
              id: Date.now(),
              absZr,
              absZi,
              absCr,
              absCi,
              exponent: state.exponent,
              maxIter: state.maxIter,
            };

            if (isWorkerBusy) {
              pendingWorkerJob = job;
            } else {
              pendingWorkerJob = job;
              dispatchPendingWork();
            }
          }, 150); // 150ms debounce
        }
      } else {
        if (state.refOrbits !== null) {
          viewportStore.setState({ refOrbits: null });
        }
      }
    });

    const resizeObserver = new ResizeObserver((entries) => {
      if (!canvas) return;
      for (const entry of entries) {
        if (entry.target === canvas) {
          const rect = canvas.getBoundingClientRect();
          cssWidth = rect.width;
          cssHeight = rect.height;
          // Resize canvas to new native resolution and rebuild G-Buffers.
          const newDpr = window.devicePixelRatio || 1;
          canvas.width = Math.max(1, Math.floor(cssWidth * newDpr));
          canvas.height = Math.max(1, Math.floor(cssHeight * newDpr));
          engineRef.current?.resize();
          canvasSizeVersion++;
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
      if (wheelTimeoutId) window.clearTimeout(wheelTimeoutId);
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
        touchAction: 'none',
      }}
    />
  );
};
