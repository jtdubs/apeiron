import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, fireEvent, cleanup } from '@testing-library/react';
import { ApeironViewport } from '../ApeironViewport';
import { viewportStore } from '../../stores/viewportStore';
import { renderStore } from '../../stores/renderStore';
import type { RenderFrameDescriptor } from '../../../engine/RenderFrameDescriptor';

// Mock the WebGPU engine initialization since it crashes in JSDOM (no virtual GPU adapter)
const { renderFrameMock, initEngineMock } = vi.hoisted(() => {
  const renderFrameMock = vi.fn();
  return {
    renderFrameMock,
    initEngineMock: vi.fn().mockResolvedValue({
      renderFrame: renderFrameMock,
      resize: vi.fn(),
      getMathPassMs: vi.fn().mockReturnValue(14),
      isIterationTargetMet: vi.fn().mockReturnValue(true),
    }),
  };
});

vi.mock('../../../engine/initEngine', () => ({
  initEngine: initEngineMock,
}));

// Mock the global Worker constructor so the Rust WASM worker never actually
// loads rust_math.js in JSDOM. Without this mock the worker's async import
// fires AFTER the test environment is torn down, producing an
// EnvironmentTeardownError unhandled error in the Vitest pool.
class MockWorker {
  onmessage: ((e: MessageEvent) => void) | null = null;
  onerror: ((e: ErrorEvent) => void) | null = null;
  postMessage = vi.fn();
  terminate = vi.fn();
}
vi.stubGlobal('Worker', MockWorker);

describe('ApeironViewport Orchestration', () => {
  let workerPostMessage: ReturnType<typeof vi.fn>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let workerOnMessage: (e: any) => void;

  beforeEach(() => {
    window.HTMLElement.prototype.setPointerCapture = vi.fn();
    window.HTMLElement.prototype.releasePointerCapture = vi.fn();
    vi.useFakeTimers();

    workerPostMessage = vi.fn();
    window.Worker = vi.fn().mockImplementation(function () {
      const mockWorker = {
        postMessage: workerPostMessage,
        terminate: vi.fn(),
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        set onmessage(fn: (e: any) => void) {
          workerOnMessage = fn;
        },
      };
      return mockWorker;
    }) as unknown as typeof Worker;

    // Reset our zustand store
    viewportStore.setState({
      anchorZr: '0.0',
      anchorZi: '0.0',
      anchorCr: '-0.8',
      anchorCi: '0.156',
      deltaZr: 0,
      deltaZi: 0,
      deltaCr: 0,
      deltaCi: 0,
      zoom: 1.5,
      sliceAngle: 0,
      exponent: 2.0,
      paletteMaxIter: 150,
      refOrbitNodes: null,
      refMetadata: null,
      refBlaGrid: null,
    });
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('triggers WebWorker computation after 150ms debounce on deep zoom pan', async () => {
    render(<ApeironViewport />);

    // 1. Manually sink deep into the fractal to activate state logic (`zoom < 1e-4`)
    act(() => {
      viewportStore.setState({
        zoom: 1e-5,
        deltaCr: 0.001,
        deltaCi: 0.001,
      });
    });

    // Worker hasn't been posted to yet, because of 150ms debounce.
    expect(viewportStore.getState().anchorCr).toBe('-0.8');

    // Advance 140ms
    act(() => {
      vi.advanceTimersByTime(140);
    });

    expect(viewportStore.getState().anchorCr).toBe('-0.8'); // Still waiting

    // Advance the remaining 10ms to trigger the debounce
    act(() => {
      vi.advanceTimersByTime(10);
    });

    // After 150ms, the viewport orchestration fires the worker.
    // It NO LONGER resets the deltas until the worker completes, preventing flicker!
    expect(viewportStore.getState().deltaCr).toBe(0.001);
    expect(workerPostMessage).toHaveBeenCalledTimes(1);

    // Simulate worker returning data
    act(() => {
      workerOnMessage({
        data: {
          type: 'COMPUTE_RESULT',
          orbit_nodes: new Float64Array(10),
          metadata: new Float64Array(10),
          bla_grid: new Float64Array(10),
        },
      });
    });

    // NOW it resets the delta and updates the anchor to match the job
    expect(viewportStore.getState().deltaCr).toBe(0.0);
    const anchorCrValue = parseFloat(viewportStore.getState().anchorCr);
    expect(anchorCrValue).toBeCloseTo(-0.799);
  });

  it('maintains 150ms debounce across continuous rapid panning', async () => {
    act(() => {
      viewportStore.setState({ zoom: 1e-5 });
    });
    render(<ApeironViewport />);

    // Rapid pan simulation (every 50ms)
    for (let i = 0; i < 5; i++) {
      act(() => {
        viewportStore.setState({
          deltaCr: 0.001 * (i + 1),
          deltaCi: 0.001 * (i + 1),
        });
        vi.advanceTimersByTime(50);
      });
      // Anchor should not have reset deltas yet
      expect(viewportStore.getState().deltaCr).not.toBe(0.0);
    }

    // Now advance remaining 150ms
    act(() => {
      vi.advanceTimersByTime(150);
    });

    // After 150ms of silence, it should fire the worker
    expect(workerPostMessage).toHaveBeenCalledTimes(1);
    expect(viewportStore.getState().deltaCr).toBe(0.005);

    // Simulate worker return
    act(() => {
      workerOnMessage({
        data: {
          type: 'COMPUTE_RESULT',
          orbit_nodes: new Float64Array(10),
          metadata: new Float64Array(10),
          bla_grid: new Float64Array(10),
        },
      });
    });

    expect(viewportStore.getState().deltaCr).toBe(0.0);
    const anchorCrValue = parseFloat(viewportStore.getState().anchorCr);
    expect(anchorCrValue).toBeCloseTo(-0.795); // -0.8 + 0.005
  });

  it('bypasses perturbation and clears refOrbits when zooming out past 1e-4', async () => {
    act(() => {
      viewportStore.setState({
        zoom: 1e-5,
        refOrbitNodes: new Float64Array(10),
        refMetadata: new Float64Array(10),
        refBlaGrid: new Float64Array(10),
      });
    });

    render(<ApeironViewport />);
    expect(viewportStore.getState().refOrbitNodes).not.toBeNull();

    act(() => {
      viewportStore.getState().updateViewport(0, 0, 10000, 0); // deltaZoom = 10000 -> zoom becomes 0.1
    });

    // Subscriptions should instantly clear refOrbits to prevent GPU explosion
    expect(viewportStore.getState().refOrbitNodes).toBeNull();
    expect(viewportStore.getState().refMetadata).toBeNull();
    expect(viewportStore.getState().refBlaGrid).toBeNull();
  });

  it('updates sliceAngle constraints during middle-mouse 4D dragging', async () => {
    const { container } = render(<ApeironViewport />);
    const canvas = container.querySelector('canvas')!;

    canvas.getBoundingClientRect = vi
      .fn()
      .mockReturnValue({ left: 0, top: 0, width: 1000, height: 1000 });

    expect(viewportStore.getState().sliceAngle).toBe(0);

    // Simulate middle mouse down
    fireEvent.pointerDown(canvas, {
      pointerId: 1,
      pointerType: 'mouse',
      button: 1,
      clientX: 100,
      clientY: 100,
    });

    act(() => {
      fireEvent.pointerMove(canvas, {
        pointerId: 1,
        pointerType: 'mouse',
        button: 1,
        clientX: 200,
        clientY: 100,
      });
    });

    // Angle should have increased
    const updatedAngle = viewportStore.getState().sliceAngle;
    expect(updatedAngle).toBeGreaterThan(0);

    fireEvent.pointerUp(canvas, { pointerId: 1, pointerType: 'mouse', button: 1 });
  });

  it('handles pinch-to-zoom multi-touch centroid math', async () => {
    const { container } = render(<ApeironViewport />);
    const canvas = container.querySelector('canvas')!;

    // Mock rect
    canvas.getBoundingClientRect = vi
      .fn()
      .mockReturnValue({ left: 0, top: 0, width: 1000, height: 1000 });

    fireEvent.pointerDown(canvas, { pointerId: 1, clientX: 400, clientY: 500 });
    fireEvent.pointerDown(canvas, { pointerId: 2, clientX: 600, clientY: 500 });

    const initialZoom = viewportStore.getState().zoom;

    act(() => {
      // Move pointers further apart (pinch out to zoom in)
      fireEvent.pointerMove(canvas, { pointerId: 1, clientX: 300, clientY: 500 });
      fireEvent.pointerMove(canvas, { pointerId: 2, clientX: 700, clientY: 500 });
    });

    const newZoom = viewportStore.getState().zoom;
    expect(newZoom).toBeLessThan(initialZoom); // Zoomed in

    fireEvent.pointerUp(canvas, { pointerId: 1 });
    fireEvent.pointerUp(canvas, { pointerId: 2 });
  });

  it('forces f32 precision override even while possessing orbits', async () => {
    act(() => {
      viewportStore.setState({
        zoom: 1e-5,
        refOrbitNodes: new Float64Array(10),
        refMetadata: new Float64Array(10),
        refBlaGrid: new Float64Array(10),
      });
      renderStore.setState({
        renderMode: 'f32',
      });
    });

    render(<ApeironViewport />);

    // Flush microtasks to allow abstract initEngine Promise to resolve
    await act(async () => {
      await Promise.resolve();
    });

    // Wait for the renderFrame loop to be called
    act(() => {
      vi.advanceTimersByTime(50); // multiple frames
    });

    expect(renderFrameMock).toHaveBeenCalled();
    // renderFrame now receives a single RenderFrameDescriptor object
    const desc: RenderFrameDescriptor = renderFrameMock.mock.calls[0][0];

    // If 'f32', it combines anchors with deltas directly instead of treating them as purely delta passes.
    // Cr anchor is -0.8, delta is 0.
    expect(desc.context.cr).toBeCloseTo(-0.8);
  });

  it('enforces Latest-Only Buffer to prevent worker queue overlap and flickering', async () => {
    // Start zoomed in to trigger perturbation
    act(() => {
      viewportStore.setState({ zoom: 1e-5 });
    });

    const { unmount } = render(<ApeironViewport />);

    // Trigger pan 1
    act(() => {
      viewportStore.setState({ deltaCr: 0.001 });
      vi.advanceTimersByTime(150); // wait for debounce
    });

    // Worker should have received 1 computation request
    expect(workerPostMessage).toHaveBeenCalledTimes(1);

    // Trigger pan 2 while worker is officially busy (has not returned COMPUTE_RESULT)
    act(() => {
      viewportStore.setState({ deltaCr: 0.002 });
      vi.advanceTimersByTime(150); // wait for debounce
    });

    // Worker should NOT have received a second computation request yet!
    // It is busy processing Epoch 1. It must queue Epoch 2 silently.
    expect(workerPostMessage).toHaveBeenCalledTimes(1);

    // Provide the handshake for Epoch 1
    act(() => {
      workerOnMessage({
        data: {
          type: 'COMPUTE_RESULT',
          orbit_nodes: new Float64Array(10),
          metadata: new Float64Array(10),
          bla_grid: new Float64Array(10),
        },
      });
    });

    // Once Epoch 1 finishes, it discards rendering it and instantly fires Epoch 2
    expect(workerPostMessage).toHaveBeenCalledTimes(2);

    // Provide handshake for Epoch 2
    act(() => {
      workerOnMessage({
        data: {
          type: 'COMPUTE_RESULT',
          orbit_nodes: new Float64Array(10),
          metadata: new Float64Array(10),
          bla_grid: new Float64Array(10),
        },
      });
    });

    // Everything should now be settled at Epoch 2 math
    expect(viewportStore.getState().deltaCr).toBe(0.0);
    expect(parseFloat(viewportStore.getState().anchorCr)).toBeCloseTo(-0.798); // -0.8 + 0.002

    unmount();
  });

  it('resets accumulationCount (blendWeight=0) strictly on geometry change', async () => {
    act(() => {
      viewportStore.setState({ zoom: 1.0, interactionState: 'STATIC', anchorCr: '-0.8' });
    });

    render(<ApeironViewport />);

    await act(async () => {
      await Promise.resolve();
    });

    // Advance 1 frame
    act(() => {
      vi.advanceTimersByTime(16);
    });

    // First frame: accumulationCount=0 → blendWeight=0.0 always (replace prev buffer).
    expect(renderFrameMock).toHaveBeenCalled();
    let desc: RenderFrameDescriptor = renderFrameMock.mock.calls[0][0];
    expect(desc.command.blendWeight).toBe(0.0);

    renderFrameMock.mockClear();

    // Second frame: accumulationCount=1 → blendWeight = 1/2.
    act(() => {
      vi.advanceTimersByTime(16);
    });
    desc = renderFrameMock.mock.calls[0][0];
    expect(desc.command.blendWeight).toBeCloseTo(1.0 / 2);

    renderFrameMock.mockClear();

    // Now change geometry abruptly while STATIC
    act(() => {
      viewportStore.setState({ anchorCr: '-0.5' });
    });

    // Advance 1 frame
    act(() => {
      vi.advanceTimersByTime(16);
    });

    // blendWeight must be 0.0 again — geometry change resets accumulationCount to 0
    desc = renderFrameMock.mock.calls[0][0];
    expect(desc.command.blendWeight).toBe(0.0);
  });
});
