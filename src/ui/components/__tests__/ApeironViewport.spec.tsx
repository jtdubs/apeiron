import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, act } from '@testing-library/react';
import { ApeironViewport } from '../ApeironViewport';
import { viewportStore } from '../../stores/viewportStore';

// Mock the WebGPU engine initialization since it crashes in JSDOM (no virtual GPU adapter)
vi.mock('../../../engine/initEngine', () => ({
  initEngine: vi.fn().mockResolvedValue({
    renderFrame: vi.fn(),
    resize: vi.fn(),
  }),
}));

describe('ApeironViewport WebWorker Orchestration', () => {
  beforeEach(() => {
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
});
