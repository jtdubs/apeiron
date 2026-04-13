import React, { useEffect, useRef } from 'react';
import { initEngine } from '../../engine/initEngine';
import type { ApeironEngine } from '../../engine/initEngine';

import mandelbrotWgsl from '../../engine/shaders/mandelbrot_f32.wgsl?raw';
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
    let lastX = 0;
    let lastY = 0;

    const onPointerDown = (e: PointerEvent) => {
      isDragging = true;
      lastX = e.clientX;
      lastY = e.clientY;
      canvas.setPointerCapture(e.pointerId);
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isDragging) return;
      const dx = e.clientX - lastX;
      const dy = e.clientY - lastY;
      lastX = e.clientX;
      lastY = e.clientY;

      const rect = canvas.getBoundingClientRect();
      const { zoom } = viewportStore.getState();

      // Calculate math delta.
      // UV width spans from -1.0 to 1.0 (total length 2.0)
      // UV height spans from -1.0 to 1.0 (total length 2.0)
      // X calculation:
      const mathDx = -2.0 * (dx / rect.width) * zoom * (rect.width / rect.height);

      // Y calculation:
      // WebGPU clip space Y points UP, but DOM mouse events Y points DOWN.
      // To drag visually, camera panning must follow the correct positive/negative shifts.
      const mathDy = 2.0 * (dy / rect.height) * zoom;

      viewportStore.getState().updateViewport(mathDx, mathDy, 1.0);
    };

    const onPointerUp = (e: PointerEvent) => {
      isDragging = false;
      canvas.releasePointerCapture(e.pointerId);
    };

    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      // Zoom into the center of the viewport currently
      const deltaZoom = e.deltaY > 0 ? 1.05 : 0.95;
      viewportStore.getState().updateViewport(0, 0, deltaZoom);
    };

    canvas.addEventListener('pointerdown', onPointerDown);
    canvas.addEventListener('pointermove', onPointerMove);
    canvas.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('pointercancel', onPointerUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });

    const initialize = async () => {
      try {
        const engine = await initEngine(canvas, mandelbrotWgsl);
        if (!isMounted) return;
        engineRef.current = engine;

        const loop = () => {
          if (!isMounted) return;
          const { x, y, zoom, maxIter } = viewportStore.getState();
          engine.renderFrame(x, y, zoom, maxIter);
          requestRef.current = requestAnimationFrame(loop);
        };
        requestRef.current = requestAnimationFrame(loop);
      } catch (err) {
        console.error('Failed to initialize WebGPU engine:', err);
      }
    };

    initialize();

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
