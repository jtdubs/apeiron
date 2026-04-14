import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act, fireEvent } from '@testing-library/react';
import { ApeironViewport } from '../ApeironViewport';
import { viewportStore } from '../../stores/viewportStore';
import { renderStore } from '../../stores/renderStore';

// Mock the WebGPU engine initialization since it crashes in JSDOM (no virtual GPU adapter)
const { renderFrameMock, initEngineMock } = vi.hoisted(() => {
  const renderFrameMock = vi.fn();
  return {
    renderFrameMock,
    initEngineMock: vi.fn().mockResolvedValue({
      renderFrame: renderFrameMock,
      resize: vi.fn(),
    }),
  };
});

vi.mock('../../../engine/initEngine', () => ({
  initEngine: initEngineMock,
}));

describe('ApeironViewport Orchestration', () => {
  beforeEach(() => {
    window.HTMLElement.prototype.setPointerCapture = vi.fn();
    window.HTMLElement.prototype.releasePointerCapture = vi.fn();
    vi.useFakeTimers();
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
      maxIter: 150,
      refOrbits: null,
    });
  });

  afterEach(() => {
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

    // After 150ms, the viewport orchestration resets the deltas back to 0
    // and adjusts the string anchors based on `parseFloat() + delta` -> `-0.8 + 0.001 = -0.799`
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

    // After 150ms of silence, it should reset deltas
    expect(viewportStore.getState().deltaCr).toBe(0.0);
    const anchorCrValue = parseFloat(viewportStore.getState().anchorCr);
    expect(anchorCrValue).toBeCloseTo(-0.795); // -0.8 + 0.005
  });

  it('bypasses perturbation and clears refOrbits when zooming out past 1e-4', async () => {
    act(() => {
      viewportStore.setState({
        zoom: 1e-5,
        refOrbits: new Float64Array(10),
      });
    });

    render(<ApeironViewport />);
    expect(viewportStore.getState().refOrbits).not.toBeNull();

    act(() => {
      viewportStore.getState().updateViewport(0, 0, 10000, 0); // deltaZoom = 10000 -> zoom becomes 0.1
    });

    // Subscriptions should instantly clear refOrbits to prevent GPU explosion
    expect(viewportStore.getState().refOrbits).toBeNull();
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
        refOrbits: new Float64Array(10),
      });
      renderStore.setState({
        precisionMode: 'f32',
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
    const args = renderFrameMock.mock.calls[0];

    // If 'f32', it combines anchors with deltas directly instead of treating them as purely delta passes.
    // Cr anchor is -0.8, delta is 0.
    expect(args[2]).toBeCloseTo(-0.8);
  });

  it('resets frameCount to 1.0 strictly without skipping a frame when geometry changes', async () => {
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

    // Initial render should be frame 1.0
    expect(renderFrameMock).toHaveBeenCalled();
    let args = renderFrameMock.mock.calls[0];
    let passedFrameCount = args[11]; // index 11 is frameCount
    expect(passedFrameCount).toBe(1.0);

    renderFrameMock.mockClear();

    // Advance to next frame, should be accumulated as 2.0
    act(() => {
      vi.advanceTimersByTime(16);
    });
    args = renderFrameMock.mock.calls[0];
    passedFrameCount = args[11];
    expect(passedFrameCount).toBe(2.0);

    renderFrameMock.mockClear();

    // Now change geometry abruptly while STATIC
    act(() => {
      viewportStore.setState({ anchorCr: '-0.5' });
    });

    // Advance 1 frame
    act(() => {
      vi.advanceTimersByTime(16);
    });

    // It should have reset strictly back to 1.0 for the first frame of new geometry!
    args = renderFrameMock.mock.calls[0];
    passedFrameCount = args[11];
    expect(passedFrameCount).toBe(1.0);
  });
});
