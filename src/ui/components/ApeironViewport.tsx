import React, { useEffect, useRef } from 'react';
import { initEngine } from '../../engine/initEngine';
import type { ApeironEngine } from '../../engine/initEngine';
import type { RenderFrameDescriptor } from '../../engine/RenderFrameDescriptor';

import mathAccumWgsl from '../../engine/shaders/escape/math_accum.wgsl?raw';
import resolvePresentWgsl from '../../engine/shaders/escape/resolve_present.wgsl?raw';
import { viewportStore, calculateMaxIter } from '../stores/viewportStore';
import { renderStore } from '../stores/renderStore';
import { IterationBudgetController } from '../../engine/IterationBudgetController';

export const ApeironViewport: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const hudRef = useRef<HTMLDivElement>(null);
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

        // ── Accumulation state machine ──────────────────────────────────────
        // accumulationCount tracks how many consecutive frames have been
        // accumulated for the current static geometry. It resets to 0 whenever
        // geometry changes or the mode transitions to INTERACT.
        //   count == 0 → first frame, blendWeight = 0.0 (replace prev buffer)
        //   count >= 1 → Nth frame,  blendWeight = 1/count (temporal blend)
        // The engine receives blendWeight directly — no frameCount arithmetic.
        let accumulationCount = 0;
        let deepeningTotalIter = 0;
        const budgetController = new IterationBudgetController(14);
        let cycleJitterX = 0;
        let cycleJitterY = 0;
        let lastDesc: RenderFrameDescriptor | null = null;
        let lastCanvasSizeVersion = -1;

        const INTERACT_ITER_FRACTION = 0.33;
        const INTERACT_ITER_FLOOR = calculateMaxIter(1.0);

        const loop = () => {
          if (!isMounted) return;
          const state = viewportStore.getState();
          const theme = renderStore.getState();

          const isPerturb = state.refOrbits !== null && theme.precisionMode !== 'f32';

          const zr = isPerturb ? state.deltaZr : parseFloat(state.anchorZr) + state.deltaZr;
          const zi = isPerturb ? state.deltaZi : parseFloat(state.anchorZi) + state.deltaZi;
          const cr = isPerturb ? state.deltaCr : parseFloat(state.anchorCr) + state.deltaCr;
          const ci = isPerturb ? state.deltaCi : parseFloat(state.anchorCi) + state.deltaCi;

          // Snapshot of interaction state for deterministic early-return & cache invalidation
          const isInteractingSnapshot = state.interactionState !== 'STATIC';
          const renderDpr = window.devicePixelRatio || 1;
          const snapshotRenderScale = isInteractingSnapshot ? 1.0 / renderDpr : 1.0;

          // Detect geometry changes (anything that requires a fresh accumulation).
          const geometryChanged =
            !lastDesc ||
            lastDesc.zr !== zr ||
            lastDesc.zi !== zi ||
            lastDesc.cr !== cr ||
            lastDesc.ci !== ci ||
            lastDesc.zoom !== state.zoom ||
            lastDesc.sliceAngle !== state.sliceAngle ||
            lastDesc.exponent !== state.exponent ||
            lastDesc.maxIter !== state.maxIter || // We store state.maxIter in lastDesc.maxIter for accurate caching
            lastDesc.refOrbits !== state.refOrbits ||
            lastDesc.theme.themeVersion !== theme.themeVersion ||
            lastDesc.renderScale !== snapshotRenderScale ||
            lastCanvasSizeVersion !== canvasSizeVersion;

          if (geometryChanged || isInteractingSnapshot) {
            accumulationCount = 0;
            deepeningTotalIter = 0;
            budgetController.reset();
            cycleJitterX = 0;
            cycleJitterY = 0;
          }

          const MAX_ACCUM_FRAMES = 64;
          if (!isInteractingSnapshot && accumulationCount >= MAX_ACCUM_FRAMES) {
            requestRef.current = requestAnimationFrame(loop);
            return;
          }

          const currentInteractionState = viewportStore.getState().interactionState;
          const isInteracting = currentInteractionState !== 'STATIC';
          const renderScale = isInteracting ? 1.0 / renderDpr : 1.0;

          const effectiveMaxIter = isInteracting
            ? Math.max(INTERACT_ITER_FLOOR, Math.floor(state.maxIter * INTERACT_ITER_FRACTION))
            : state.maxIter;

          const isFirstSlice = deepeningTotalIter === 0;
          const mathPassMs = engine.getMathPassMs();
          const rawBudget = budgetController.update(
            mathPassMs !== -1 ? mathPassMs : 14,
            isFirstSlice,
          );
          const yieldIterLimit = Math.min(effectiveMaxIter - deepeningTotalIter, rawBudget);

          const advancePingPong = isFirstSlice;
          const clearCheckpoint = isFirstSlice && accumulationCount > 0;
          const isDeepeningComplete = deepeningTotalIter + yieldIterLimit >= effectiveMaxIter;
          const isFinalSlice = isDeepeningComplete;

          const blendWeight =
            accumulationCount > 0 ? 1.0 / (accumulationCount + 1) : 0.0;

          const isResume = accumulationCount > 0 || deepeningTotalIter > 0 ? 1.0 : 0.0;

          if (advancePingPong && !isInteracting && accumulationCount > 0) {
            cycleJitterX = (Math.random() - 0.5) * (2.0 / canvas.width);
            cycleJitterY = (Math.random() - 0.5) * (2.0 / canvas.height);
          }

          const desc: RenderFrameDescriptor = {
            zr,
            zi,
            cr,
            ci,
            zoom: state.zoom,
            maxIter: effectiveMaxIter,
            trueMaxIter: state.maxIter,
            sliceAngle: state.sliceAngle,
            exponent: state.exponent,
            refOrbits: state.refOrbits,
            renderScale,
            blendWeight,
            jitterX: cycleJitterX,
            jitterY: cycleJitterY,
            yieldIterLimit,
            isResume,
            isFinalSlice,
            advancePingPong,
            clearCheckpoint,
            theme,
          };

          engine.renderFrame(desc);

          const hudDeepenNumerator = deepeningTotalIter + yieldIterLimit;

          deepeningTotalIter += yieldIterLimit;
          if (isDeepeningComplete) {
            deepeningTotalIter = 0;
            accumulationCount++;
          }

          if (hudRef.current) {
            if (theme.showPerfHUD) {
              hudRef.current.style.display = 'block';
              const ms = engine.getMathPassMs();
              const modeStr = isInteracting
                ? 'INTERACT'
                : isFinalSlice
                  ? 'ACCUMULATING'
                  : 'DEEPENING';
              const msStr = ms !== -1 ? ms.toFixed(2) : '---';
              const deepenPct = Math.round((hudDeepenNumerator / effectiveMaxIter) * 100);

              hudRef.current.innerHTML = `
Mode:    ${modeStr}<br>
GPU:     ${msStr} ms<br>
Budget:  ${budgetController.getBudget()} iter/frame<br>
Slice:   ${yieldIterLimit} iters (this pass)<br>
Deepen:  ${deepenPct}% (${hudDeepenNumerator} / ${effectiveMaxIter})<br>
Accum:   ${accumulationCount} / ${MAX_ACCUM_FRAMES}
              `.trim();
            } else {
              hudRef.current.style.display = 'none';
            }
          }

          // Store true maxIter in cache for geometry validation, not effectiveMaxIter
          lastDesc = { ...desc, maxIter: state.maxIter, renderScale: snapshotRenderScale };
          lastCanvasSizeVersion = canvasSizeVersion;

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
    <>
      <canvas
        ref={canvasRef}
        style={{
          width: '100vw',
          height: '100vh',
          display: 'block',
          touchAction: 'none',
        }}
      />
      <div
        ref={hudRef}
        style={{
          position: 'absolute',
          bottom: 10,
          left: 10,
          background: 'rgba(0,0,0,0.5)',
          color: '#0f0',
          padding: '4px 8px',
          fontFamily: 'monospace',
          display: 'none',
          pointerEvents: 'none',
          zIndex: 9999,
        }}
      />
    </>
  );
};
