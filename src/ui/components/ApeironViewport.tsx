import React, { useEffect, useRef } from 'react';
import { initEngine } from '../../engine/initEngine';
import type { ApeironEngine } from '../../engine/initEngine';
// Import removed

import mathAccumWgsl from '../../engine/shaders/escape/math_accum.wgsl?raw';
import resolvePresentWgsl from '../../engine/shaders/escape/resolve_present.wgsl?raw';
import layoutWgsl from '../../engine/shaders/escape/generated/layout.wgsl?raw';
import layoutAccessorsWgsl from '../../engine/shaders/escape/generated/layout_accessors.wgsl?raw';
import { viewportStore } from '../stores/viewportStore';
import { renderStore } from '../stores/renderStore';
import { ProgressiveRenderScheduler } from '../../engine/ProgressiveRenderScheduler';
import { buildMathContext } from '../stores/mathContextAdapter';
import { PerturbationOrchestrator } from '../../engine/PerturbationOrchestrator';

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
        const engine = await initEngine(
          canvas,
          mathAccumWgsl,
          resolvePresentWgsl,
          layoutWgsl,
          layoutAccessorsWgsl,
        );
        if (!isMounted) return;
        engineRef.current = engine;

        // ── Render Orchestration Loop ───────────────────────────────────────
        const scheduler = new ProgressiveRenderScheduler();
        const loop = () => {
          if (!isMounted) return;
          const state = viewportStore.getState();
          const theme = renderStore.getState();

          const isInteracting = state.interactionState !== 'STATIC';
          const renderDpr = window.devicePixelRatio || 1;
          const snapshotRenderScale = isInteracting ? 1.0 / renderDpr : 1.0;

          const context = buildMathContext(state, theme, canvas?.width ?? 0, canvas?.height ?? 0);

          const command = scheduler.update(
            context,
            isInteracting,
            canvasSizeVersion,
            theme.themeVersion,
            snapshotRenderScale,
            canvas?.width ?? 1,
            canvas?.height ?? 1,
            engine.getMathPassMs(),
          );

          if (!command) {
            requestRef.current = requestAnimationFrame(loop);
            return;
          }

          engine.renderFrame({ context, command, theme });

          const hudDeepenNumerator = scheduler.getDeepeningTotalIter() + command.yieldIterLimit;
          scheduler.notifySliceComplete(command);

          if (hudRef.current) {
            // eslint-disable-next-line no-constant-condition
            if (true) {
              hudRef.current.style.display = 'block';
              const ms = engine.getMathPassMs();
              const modeStr = scheduler.getPipelineMode(isInteracting);
              const msStr = ms !== -1 ? ms.toFixed(2) : '---';
              const deepenPct = Math.round((hudDeepenNumerator / context.maxIter) * 100);

              hudRef.current.innerHTML = `
Mode:    ${modeStr}<br>
GPU:     ${msStr} ms<br>
Budget:  ${scheduler.getBudget()} iter/frame<br>
Slice:   ${command.yieldIterLimit} iters (this pass)<br>
Deepen:  ${deepenPct}% (${hudDeepenNumerator} / ${context.maxIter})<br>
SA Skip: ${context.skipIter}<br>
Accum:   ${scheduler.getAccumulationCount()} / 64
              `.trim();
            } else {
              // @ts-expect-error Typescript ref narrowing bug in this config
              if (hudRef.current != null) hudRef.current.style.display = 'none';
            }
          }

          // Store true maxIter in cache for geometry validation, not effectiveMaxIter
          requestRef.current = requestAnimationFrame(loop);
        };
        requestRef.current = requestAnimationFrame(loop);
      } catch (err) {
        console.error('Failed to initialize WebGPU engine:', err);
      }
    };

    initialize();

    const orchestrator = new PerturbationOrchestrator();

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
      if (wheelTimeoutId) window.clearTimeout(wheelTimeoutId);
      orchestrator.destroy();
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
