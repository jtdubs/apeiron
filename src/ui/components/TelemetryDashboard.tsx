import React, { useRef, useEffect, useState } from 'react';
import { useStore } from 'zustand';
import { viewportStore } from '../stores/viewportStore';
import { TelemetryRegistry } from '../../engine/debug/TelemetryRegistry';
import { TelemetryRenderer, type IBufferSnapshot } from '../../engine/debug/TelemetryRenderer';
import './TelemetryDashboard.css';

const COLORS = [
  '#00ffcc', // teal
  '#ff00cc', // pink
  '#ccff00', // yellow-green
  '#00ccff', // sky blue
  '#ffcc00', // yellow-orange
  '#cc00ff', // purple
];

export const TelemetryDashboard: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<TelemetryRenderer | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const scrollInnerRef = useRef<HTMLDivElement>(null);

  const viewportState = useStore(viewportStore);
  const isOpen = viewportState.isTelemetryOpen;
  const setIsOpen = viewportState.setIsTelemetryOpen;
  const [isPaused, setIsPaused] = useState(false);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [panelHeight, setPanelHeight] = useState(350);
  const resizeRef = useRef({ isResizing: false });
  const zoomXRef = useRef(1.0);
  const panXRef = useRef(0.0);
  const [cursorAge, setCursorAge] = useState<number | null>(null);
  const STORAGE_KEY = 'apeiron_telemetry_signals';
  const [activeSignals, setActiveSignals] = useState<string[]>(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        // fallback
      }
    }
    return ['engine.framerate', 'webgpu.renderms', 'engine.fsm'];
  });

  const [isSidebarVisible, setIsSidebarVisible] = useState(() => activeSignals.length === 0);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(activeSignals));
  }, [activeSignals]);

  const [displayValues, setDisplayValues] = useState<Record<string, number>>({});
  const frozenSnapshotsRef = useRef<Map<string, IBufferSnapshot> | null>(null);
  const latestCursorValuesRef = useRef<Record<string, number>>({});

  const panningRef = useRef({ isDown: false, startX: 0, startPan: 0 });
  const isScrolling = useRef(false);
  const ignoreScrollEvent = useRef(false);
  const scrollTimeout = useRef<number | null>(null);

  useEffect(() => {
    const interval = setInterval(() => {
      if (cursorAge !== null) {
        setDisplayValues({ ...latestCursorValuesRef.current });
      } else if (!isPaused) {
        const reg = TelemetryRegistry.getInstance();
        const data: Record<string, number> = {};
        activeSignals.forEach((id) => {
          data[id] = reg.getEma(id);
        });
        setDisplayValues(data);
      }
    }, 100);
    return () => clearInterval(interval);
  }, [cursorAge, isPaused, activeSignals]);

  useEffect(() => {
    if (!isOpen || !canvasRef.current || !containerRef.current) return;

    const canvas = canvasRef.current;
    rendererRef.current = new TelemetryRenderer(canvas);

    let animationId: number;
    let isActive = true;
    let lastRenderKey = '';

    const renderLoop = () => {
      if (!isActive) return;
      if (rendererRef.current) {
        const expectedHeight =
          activeSignals.length * rendererRef.current.laneHeight + rendererRef.current.headerHeight;
        let didResize = false;
        if (canvas.height !== expectedHeight) {
          canvas.height = expectedHeight;
          rendererRef.current.resize(canvas.width, canvas.height);
          didResize = true;
        }

        const firstBuf =
          activeSignals.length > 0
            ? TelemetryRegistry.getInstance().getBuffer(activeSignals[0])
            : null;
        const currentHead = firstBuf ? firstBuf.getHeadIndex() : 0;
        const currentCount = firstBuf ? firstBuf.getCount() : 0;

        const currentRenderKey = `${currentHead}:${currentCount}:${zoomXRef.current}:${panXRef.current}:${cursorAge}:${isPaused}:${canvas.width}`;

        if (scrollContainerRef.current && scrollInnerRef.current) {
          const fakeWidth = zoomXRef.current * 100;
          const targetWidth = `${fakeWidth}%`;
          if (scrollInnerRef.current.style.width !== targetWidth) {
            scrollInnerRef.current.style.width = targetWidth;
          }
          if (!isScrolling.current) {
            const maxScroll =
              scrollContainerRef.current.scrollWidth - scrollContainerRef.current.clientWidth;
            const targetScroll = (1.0 - panXRef.current) * maxScroll;
            if (Math.abs(scrollContainerRef.current.scrollLeft - targetScroll) > 1) {
              ignoreScrollEvent.current = true;
              scrollContainerRef.current.scrollLeft = targetScroll;
            }
          }
        }

        if (didResize || currentRenderKey !== lastRenderKey) {
          const vals = rendererRef.current.render(
            activeSignals,
            TelemetryRegistry.getInstance(),
            zoomXRef.current,
            panXRef.current,
            frozenSnapshotsRef.current,
            cursorAge,
          );
          latestCursorValuesRef.current = vals;
          lastRenderKey = currentRenderKey;
        }
      }
      animationId = requestAnimationFrame(renderLoop);
    };

    rectUpdate();
    renderLoop();

    const resizeObserver = new ResizeObserver(() => rectUpdate());
    resizeObserver.observe(containerRef.current);

    function rectUpdate() {
      if (!canvas || !containerRef.current || !rendererRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      if (canvas.width !== Math.max(1, rect.width)) {
        rendererRef.current.resize(rect.width, canvas.height);
      }
    }

    return () => {
      isActive = false;
      cancelAnimationFrame(animationId);
      resizeObserver.disconnect();
    };
  }, [isOpen, activeSignals, cursorAge, isPaused]);

  useEffect(() => {
    const handleMove = (e: PointerEvent) => {
      if (!resizeRef.current.isResizing) return;
      // The dashboard expands upwards from the bottom, so higher Y meaning lower physical height
      const newHeight = window.innerHeight - e.clientY;
      const minHeight = 120; // 1 lane (60) + grids (20) + header (30)
      const maxHeight = window.innerHeight - 50;
      setPanelHeight(Math.max(minHeight, Math.min(newHeight, maxHeight)));
      e.preventDefault();
    };
    const handleUp = () => {
      if (resizeRef.current.isResizing) {
        resizeRef.current.isResizing = false;
        document.body.style.cursor = '';
      }
    };

    window.addEventListener('pointermove', handleMove);
    window.addEventListener('pointerup', handleUp);
    return () => {
      window.removeEventListener('pointermove', handleMove);
      window.removeEventListener('pointerup', handleUp);
    };
  }, []);

  useEffect(() => {
    if (isPaused) {
      const snapshots = new Map<string, IBufferSnapshot>();
      const reg = TelemetryRegistry.getInstance();
      for (const id of activeSignals) {
        const buf = reg.getBuffer(id);
        if (buf) {
          snapshots.set(id, {
            rawBuffer: buf.getRawBuffer().slice(),
            count: buf.getCount(),
            capacity: buf.getCapacity(),
            headIndex: buf.getHeadIndex(),
          });
        }
      }
      frozenSnapshotsRef.current = snapshots;
    } else {
      frozenSnapshotsRef.current = null;
    }
  }, [isPaused, activeSignals]);

  const onScroll = (e: React.UIEvent<HTMLDivElement>) => {
    if (ignoreScrollEvent.current) {
      ignoreScrollEvent.current = false;
      return;
    }
    isScrolling.current = true;
    if (scrollTimeout.current) clearTimeout(scrollTimeout.current);
    scrollTimeout.current = setTimeout(() => {
      isScrolling.current = false;
    }, 100);

    const maxScroll = e.currentTarget.scrollWidth - e.currentTarget.clientWidth;
    if (maxScroll > 0) {
      panXRef.current = Math.max(0, Math.min(1.0, 1.0 - e.currentTarget.scrollLeft / maxScroll));
    } else {
      panXRef.current = 0;
    }
  };

  const onPointerDown = (e: React.PointerEvent) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (e.button === 0 && !e.shiftKey) {
      panningRef.current = { isDown: true, startX: e.clientX, startPan: panXRef.current };
      (e.target as HTMLElement).setPointerCapture(e.pointerId);
    }
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (panningRef.current.isDown && canvasRef.current) {
      const dx = e.clientX - panningRef.current.startX;
      const panDelta = dx / canvasRef.current.width / zoomXRef.current;
      panXRef.current = Math.max(0, Math.min(1.0, panningRef.current.startPan + panDelta));
    }
  };

  const onPointerUp = (e: React.PointerEvent) => {
    let wasClick = false;
    if (panningRef.current.isDown) {
      panningRef.current.isDown = false;
      const target = e.target as HTMLElement;
      if (target.hasPointerCapture && target.hasPointerCapture(e.pointerId)) {
        target.releasePointerCapture(e.pointerId);
      }
      if (Math.abs(e.clientX - panningRef.current.startX) < 5) {
        wasClick = true;
      }
    } else if (Math.abs(e.clientX - (panningRef.current.startX || e.clientX)) < 5) {
      wasClick = true;
    }

    if (wasClick) {
      const rect = canvasRef.current?.getBoundingClientRect();
      if (rect) {
        const pixelX = e.clientX - rect.left;
        const width = canvasRef.current!.width;
        const firstBuf =
          activeSignals.length > 0
            ? TelemetryRegistry.getInstance().getBuffer(activeSignals[0])
            : null;
        const capacity =
          frozenSnapshotsRef.current?.get(activeSignals[0] || '')?.capacity ||
          firstBuf?.getCapacity() ||
          600;
        const maxPoints = Math.max(1, Math.floor(capacity / zoomXRef.current));
        const maxOffset = Math.max(0, capacity - maxPoints + 1);
        const startPointOffset = Math.floor(panXRef.current * maxOffset);

        const i = Math.floor((1 - pixelX / width) * Math.max(1, maxPoints - 1));
        setCursorAge(Math.max(0, Math.min(capacity - 1, i + startPointOffset)));
      }
    }
  };

  const onWheel = (e: React.WheelEvent) => {
    if (e.deltaY !== 0 && canvasRef.current) {
      const rect = canvasRef.current.getBoundingClientRect();
      const pixelX = e.clientX - rect.left;
      const width = canvasRef.current.width;

      const firstBuf =
        activeSignals.length > 0
          ? TelemetryRegistry.getInstance().getBuffer(activeSignals[0])
          : null;
      const capacity =
        frozenSnapshotsRef.current?.get(activeSignals[0] || '')?.capacity ||
        firstBuf?.getCapacity() ||
        600;

      const oldZoomX = zoomXRef.current;
      const oldMaxPoints = Math.max(1, Math.floor(capacity / oldZoomX));
      const oldMaxOffset = Math.max(0, capacity - oldMaxPoints + 1);
      const oldStartPointOffset = panXRef.current * oldMaxOffset;

      const anchorProportion = 1.0 - pixelX / width;
      const iAnchorOld = anchorProportion * Math.max(0, oldMaxPoints - 1);
      const anchorAge = oldStartPointOffset + iAnchorOld;

      // Maximum zoom allows viewing exactly 10 frames across the grid, meaning 1 frame per grid line.
      const maxZoom = Math.max(10.0, capacity / 10.0);
      const zoomFactor = e.deltaY > 0 ? 0.9 : 1.1;
      const newZoomX = Math.max(1.0, Math.min(maxZoom, oldZoomX * zoomFactor));

      if (newZoomX !== oldZoomX) {
        zoomXRef.current = newZoomX;
        const newMaxPoints = Math.max(1, Math.floor(capacity / newZoomX));
        const iAnchorNew = anchorProportion * Math.max(0, newMaxPoints - 1);

        let newStartPointOffset = anchorAge - iAnchorNew;
        const newMaxOffset = Math.max(0, capacity - newMaxPoints + 1);

        if (newMaxOffset > 0) {
          newStartPointOffset = Math.max(0, Math.min(newMaxOffset, newStartPointOffset));
          panXRef.current = Math.max(0, Math.min(1.0, newStartPointOffset / newMaxOffset));
        } else {
          panXRef.current = 0;
        }
      }
    }
  };

  if (!isOpen) {
    return null;
  }

  const allSignals = TelemetryRegistry.getInstance().getAllRegisteredIds();
  const groups: Record<string, string[]> = {};
  allSignals.forEach((id) => {
    const group = TelemetryRegistry.getInstance().getDefinition(id)?.group || 'Other';
    if (!groups[group]) groups[group] = [];
    groups[group].push(id);
  });

  const toggleSignal = (id: string) => {
    if (activeSignals.includes(id)) {
      setActiveSignals(activeSignals.filter((s) => s !== id));
    } else {
      setActiveSignals([...activeSignals, id]);
    }
  };

  const moveCursor = (type: 'start' | 'end' | 'prev' | 'next') => {
    if (!canvasRef.current) return;
    const firstBuf =
      activeSignals.length > 0 ? TelemetryRegistry.getInstance().getBuffer(activeSignals[0]) : null;
    const capacity =
      frozenSnapshotsRef.current?.get(activeSignals[0] || '')?.capacity ||
      firstBuf?.getCapacity() ||
      600;

    setCursorAge((prev) => {
      let nextAge = prev;
      if (prev === null) {
        if (type === 'start') nextAge = capacity - 1;
        else if (type === 'end') nextAge = 0;
        else nextAge = Math.floor(capacity / 2);
      } else {
        if (type === 'start') nextAge = capacity - 1;
        else if (type === 'end') nextAge = 0;
        else if (type === 'prev') nextAge = Math.min(capacity - 1, prev + 1);
        else if (type === 'next') nextAge = Math.max(0, prev - 1);
      }

      if (nextAge !== null) {
        const maxPoints = Math.max(1, Math.floor(capacity / zoomXRef.current));
        const maxOffset = Math.max(0, capacity - maxPoints + 1);
        let startPointOffset = Math.floor(panXRef.current * maxOffset);

        if (nextAge < startPointOffset) {
          startPointOffset = nextAge;
        } else if (nextAge >= startPointOffset + maxPoints - 1) {
          // Ensure the cursor bounds is actually visible on screen by having its trailing boundary inside maxPoints - 2
          startPointOffset = Math.max(0, nextAge - Math.max(1, maxPoints - 2));
        }

        if (maxOffset > 0) {
          panXRef.current = Math.max(0, Math.min(1.0, startPointOffset / maxOffset));
        }
      }

      return nextAge;
    });
  };

  const setPreset = (preset: string) => {
    if (preset === 'perf') setActiveSignals(['engine.framerate', 'webgpu.renderms']);
    if (preset === 'fsm')
      setActiveSignals(['engine.fsm', 'engine.budget.current', 'engine.sa.skipDepth']);
    if (preset === 'workers')
      setActiveSignals([
        'workers.dispatchedJobId',
        'workers.activeJobId',
        'workers.pendingJobCount',
      ]);
  };

  const copyStateToClipboard = () => {
    const stateSnapshot = {
      anchor_z: [viewportState.anchorZr, viewportState.anchorZi],
      anchor_c: [viewportState.anchorCr, viewportState.anchorCi],
      delta_z: [viewportState.deltaZr, viewportState.deltaZi],
      delta_c: [viewportState.deltaCr, viewportState.deltaCi],
      zoom: viewportState.zoom,
      sliceAngle: viewportState.sliceAngle,
      exponent: viewportState.exponent,
    };
    navigator.clipboard
      .writeText(JSON.stringify(stateSnapshot, null, 2))
      .then(() => console.log('Debug state copied to clipboard!'))
      .catch((err) => console.error('Failed to copy state: ', err));
  };

  const exportTrace = () => {
    const reg = TelemetryRegistry.getInstance();
    const ids = reg.getAllRegisteredIds();
    if (ids.length === 0) return;

    // All metrics share the same lockstep capacity, so the first buffer safely represents the system's runtime
    const maxCount = reg.getBuffer(ids[0])?.getCount() || 0;

    if (maxCount === 0) return;

    // Walk backwards from oldest age to newest age so the array is chronological
    const frames = [];
    for (let age = maxCount - 1; age >= 0; age--) {
      const frameData: Record<string, number> = {};
      let hasData = false;
      for (const id of ids) {
        const buf = reg.getBuffer(id);
        if (buf && age < buf.getCount()) {
          const phys = (buf.getHeadIndex() - 1 - age + buf.getCapacity()) % buf.getCapacity();
          frameData[id] = buf.getRawBuffer()[phys];
          hasData = true;
        }
      }
      if (hasData) frames.push(frameData);
    }

    const blob = new Blob([JSON.stringify(frames, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `apeiron_telemetry_${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="telemetry-dashboard-wrapper">
      <div className="telemetry-dashboard" style={{ height: `${panelHeight}px` }}>
        <div
          className="telemetry-resize-handle"
          onPointerDown={(e) => {
            e.preventDefault();
            resizeRef.current.isResizing = true;
            document.body.style.cursor = 'ns-resize';
          }}
        />
        <div className="telemetry-header">
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              onClick={() => setIsSidebarVisible(!isSidebarVisible)}
              style={{ fontSize: '20px', padding: '2px 8px' }}
              title="Toggle Signal Tree"
            >
              ☰
            </button>
            <h3 style={{ margin: 0, paddingRight: '16px' }}>Telemetry</h3>
            <select
              value={viewportState.debugViewMode}
              onChange={(e) => viewportState.setDebugViewMode(Number(e.target.value))}
              style={{
                background: '#222',
                color: '#fff',
                border: '1px solid #444',
                borderRadius: '4px',
                padding: '2px 8px',
                fontSize: '12px',
              }}
            >
              <option value={0}>No Shader Overlay</option>
              <option value={1}>Show Limit Cycles</option>
              <option value={2}>Show Checkpoints</option>
              <option value={3}>Show BLA Nodes</option>
              <option value={4}>Interpolation Strain</option>
              <option value={5}>BLA Validation Diff (Slow)</option>
              <option value={6}>Perturbation Failure Mode</option>
            </select>
          </div>
          <div style={{ display: 'flex', gap: '16px', alignItems: 'center' }}>
            {cursorAge !== null && (
              <div
                style={{
                  display: 'flex',
                  gap: '4px',
                  background: '#222',
                  padding: '2px 8px',
                  borderRadius: '4px',
                  alignItems: 'center',
                }}
              >
                <button onClick={() => moveCursor('start')} title="Oldest Frame (Start)">
                  |◀
                </button>
                <button onClick={() => moveCursor('prev')} title="Previous Frame (Older)">
                  ◀
                </button>
                <button onClick={() => moveCursor('next')} title="Next Frame (Newer)">
                  ▶
                </button>
                <button onClick={() => moveCursor('end')} title="Newest Frame (Head)">
                  ▶|
                </button>
                <button onClick={() => setCursorAge(null)} style={{ marginLeft: '8px' }}>
                  ✕ CLEAR
                </button>
              </div>
            )}
            <button
              onClick={() => setIsPaused(!isPaused)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '30px',
                height: '30px',
                padding: 0,
                color: isPaused ? '#ef4444' : '#3b82f6',
                fontSize: '20px',
              }}
              title={isPaused ? 'Resume Live Capture' : 'Freeze Capture'}
            >
              {isPaused ? '⏺' : '⏸'}
            </button>
            <button
              onClick={copyStateToClipboard}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '30px',
                height: '30px',
                padding: 0,
              }}
              title="Copy Debug State to Clipboard"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
            </button>
            <button
              onClick={exportTrace}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '30px',
                height: '30px',
                padding: 0,
              }}
              title="Export JSON Trace"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                <polyline points="7 10 12 15 17 10" />
                <line x1="12" y1="15" x2="12" y2="3" />
              </svg>
            </button>
            <button
              onClick={() => setIsOpen(false)}
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                width: '30px',
                height: '30px',
                padding: 0,
                fontSize: '20px',
              }}
              title="Close Telemetry Dashboard"
            >
              ✕
            </button>
          </div>
        </div>

        <div className="telemetry-body">
          {/* Signal Search Tree */}
          {isSidebarVisible && (
            <div className="telemetry-sidebar">
              <div className="telemetry-sidebar-group">
                <div className="telemetry-sidebar-group-title">Presets</div>
                <div className="telemetry-sidebar-item" onDoubleClick={() => setPreset('perf')}>
                  Performance
                </div>
                <div className="telemetry-sidebar-item" onDoubleClick={() => setPreset('fsm')}>
                  FSM Debug
                </div>
                <div className="telemetry-sidebar-item" onDoubleClick={() => setPreset('workers')}>
                  Workers
                </div>
              </div>

              {Object.keys(groups)
                .sort()
                .map((group) => (
                  <div key={group} className="telemetry-sidebar-group">
                    <div className="telemetry-sidebar-group-title">{group}</div>
                    {groups[group].map((s) => {
                      const isActive = activeSignals.includes(s);
                      return (
                        <div
                          key={s}
                          className={`telemetry-sidebar-item ${isActive ? 'active' : ''}`}
                          onDoubleClick={() => toggleSignal(s)}
                        >
                          {TelemetryRegistry.getInstance().getDefinition(s)?.label || s}
                        </div>
                      );
                    })}
                  </div>
                ))}
            </div>
          )}

          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
            <div className="telemetry-workspace" style={{ flex: 1 }}>
              <div className="telemetry-workspace-scroll-container">
                {/* Readout Column Aligned with Canvas Lanes */}
                <div className="telemetry-values-col">
                  <div style={{ height: '20px', borderBottom: '1px solid #333' }}></div>
                  {activeSignals.map((id, idx) => {
                    const def = TelemetryRegistry.getInstance().getDefinition(id);
                    const val = displayValues[id];
                    const displayVal =
                      def?.type === 'enum' && def.enumValues && val !== undefined && val !== null
                        ? def.enumValues[val] || val.toString()
                        : typeof val === 'number'
                          ? Number.isInteger(val)
                            ? val.toString()
                            : val.toFixed(2)
                          : typeof val === 'string'
                            ? val
                            : '0';
                    const color = COLORS[idx % COLORS.length];

                    return (
                      <div
                        key={`readout-${id}`}
                        className="telemetry-signal-row"
                        draggable
                        onDragStart={(e) => {
                          setDraggedIdx(idx);
                          e.dataTransfer.effectAllowed = 'move';
                        }}
                        onDragOver={(e) => {
                          e.preventDefault();
                          if (draggedIdx === null || draggedIdx === idx) return;
                          const newSignals = [...activeSignals];
                          const item = newSignals.splice(draggedIdx, 1)[0];
                          newSignals.splice(idx, 0, item);
                          setActiveSignals(newSignals);
                          setDraggedIdx(idx);
                        }}
                        onDragEnd={() => setDraggedIdx(null)}
                        style={{
                          height: '60px',
                          borderLeft: `4px solid ${color}`,
                          opacity: draggedIdx === idx ? 0.3 : 1,
                          cursor: 'grab',
                        }}
                      >
                        <button
                          className="telemetry-signal-remove"
                          onClick={() => toggleSignal(id)}
                          onPointerDown={(e) => e.stopPropagation()}
                        >
                          ✕
                        </button>
                        <div className="telemetry-signal-name" title={def?.label || id}>
                          <div style={{ fontWeight: 'bold' }}>{def?.label || id}</div>
                          <div style={{ fontSize: '10px', opacity: 0.6 }}>
                            {def?.type || 'analog'}
                          </div>
                        </div>
                        <div className="telemetry-signal-val" style={{ color: color }}>
                          {displayVal}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div
                  className="telemetry-canvas-container"
                  ref={containerRef}
                  onPointerDown={onPointerDown}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  onPointerCancel={onPointerUp}
                  onWheel={onWheel}
                >
                  <canvas ref={canvasRef} className="telemetry-canvas" />
                </div>
              </div>
            </div>

            {/* Scrollbar Dock */}
            <div style={{ height: '12px', background: '#111', display: 'flex' }}>
              <div style={{ width: '250px', flexShrink: 0, borderRight: '1px solid #333' }}></div>
              <div
                ref={scrollContainerRef}
                onScroll={onScroll}
                className="telemetry-h-scrollbar"
                style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden' }}
              >
                <div ref={scrollInnerRef} style={{ height: '1px' }}></div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
