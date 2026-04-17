import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { PerturbationOrchestrator } from '../PerturbationOrchestrator';
import { viewportStore, type ViewportState } from '../../ui/stores/viewportStore';

describe('PerturbationOrchestrator', () => {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockWorker: any;
  let orchestrator: PerturbationOrchestrator;
  let storedListener: ((state: ViewportState, prevState: ViewportState) => void) | null = null;

  beforeEach(() => {
    vi.useFakeTimers();

    mockWorker = {
      postMessage: vi.fn(),
      onmessage: null,
      terminate: vi.fn(),
    };

    // spy on subscribe to manually trigger it
    vi.spyOn(viewportStore, 'subscribe').mockImplementation((listener) => {
      storedListener = listener;
      return vi.fn(); // return unsub
    });

    vi.spyOn(viewportStore, 'setState');

    orchestrator = new PerturbationOrchestrator(() => mockWorker);
  });

  afterEach(() => {
    orchestrator.destroy();
    vi.restoreAllMocks();
  });

  it('initializes and subscribes to viewport store', () => {
    expect(viewportStore.subscribe).toHaveBeenCalled();
    expect(mockWorker.onmessage).not.toBeNull();
  });

  it('does not dispatch work if zoom is shallow', () => {
    if (storedListener) {
      storedListener(
        { zoom: 1.0 } as unknown as ViewportState,
        { zoom: 1.0 } as unknown as ViewportState,
      );
    }
    vi.advanceTimersByTime(200);
    expect(mockWorker.postMessage).not.toHaveBeenCalled();
  });

  it('dispatches work after debouncing deep zoom pans', () => {
    if (storedListener) {
      const state = {
        zoom: 1e-5,
        deltaCr: 0.1,
        anchorCr: '-1.0',
        anchorCi: '0.0',
        anchorZr: '0.0',
        anchorZi: '0.0',
        deltaCi: 0.0,
        deltaZr: 0.0,
        deltaZi: 0.0,
        paletteMaxIter: 500,
        exponent: 2,
      } as unknown as ViewportState;

      // Simulate multiple fast panning events
      storedListener(state, { ...state, deltaCr: 0.05 } as unknown as ViewportState);
      vi.advanceTimersByTime(50);
      storedListener({ ...state, deltaCr: 0.2 } as unknown as ViewportState, state);
      vi.advanceTimersByTime(50);
      storedListener(
        { ...state, deltaCr: 0.3 } as unknown as ViewportState,
        { ...state, deltaCr: 0.2 } as unknown as ViewportState,
      );
    }

    // Total elapsed 100ms. Hasn't hit the 150ms debounce
    expect(mockWorker.postMessage).not.toHaveBeenCalled();

    // Advance past debounce
    vi.advanceTimersByTime(160);

    expect(mockWorker.postMessage).toHaveBeenCalledTimes(1);

    // Check payload
    const payload = mockWorker.postMessage.mock.calls[0][0];
    expect(payload.type).toBe('COMPUTE');
    expect(payload.paletteMaxIter).toBe(500);
    const parsed = JSON.parse(payload.casesJson)[0];
    expect(parsed.cr).toBe('-0.7'); // -1.0 + 0.3
  });

  it('queues pending work if worker is currently busy', () => {
    if (storedListener) {
      const state = {
        zoom: 1e-5,
        deltaCr: 0.1,
        anchorCr: '-1.0',
        anchorCi: '0.0',
        anchorZr: '0.0',
        anchorZi: '0.0',
        deltaCi: 0.0,
        deltaZr: 0.0,
        deltaZi: 0.0,
        paletteMaxIter: 500,
        exponent: 2,
      } as unknown as ViewportState;
      // First pan
      storedListener(state, { ...state, deltaCr: 0.05 } as unknown as ViewportState);
      vi.advanceTimersByTime(160); // dispatches
      expect(mockWorker.postMessage).toHaveBeenCalledTimes(1);

      // Second pan while busy
      storedListener({ ...state, deltaCr: 0.5 } as unknown as ViewportState, state);
      vi.advanceTimersByTime(160); // should queue, but NOT dispatch

      expect(mockWorker.postMessage).toHaveBeenCalledTimes(1);

      // Finish first computation
      mockWorker.onmessage({
        data: { type: 'COMPUTE_RESULT', result: new Float64Array(1) },
      });

      // It immediately dispatches the pending queue!
      expect(mockWorker.postMessage).toHaveBeenCalledTimes(2);

      // The pending payload handles the latest cr: 0.5
      const payload2 = mockWorker.postMessage.mock.calls[1][0];
      const parsed2 = JSON.parse(payload2.casesJson)[0];
      expect(parsed2.cr).toBe('-0.5'); // -1.0 + 0.5
    }
  });

  it('applies result and deduces relative physical offset coordinates correctly', () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let mockViewportStoreSetStateOutput: any = undefined;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.spyOn(viewportStore, 'setState').mockImplementation((fn: any) => {
      if (typeof fn === 'function') {
        mockViewportStoreSetStateOutput = fn({
          anchorCr: '-1.0',
          anchorCi: '0.5',
          anchorZr: '0.0',
          anchorZi: '0.0',
          deltaCr: 0.1, // So user is AT -0.9
          deltaCi: 0.0,
          deltaZr: 0.0,
          deltaZi: 0.0,
          zoom: 1e-5,
        } as ViewportState);
      }
    });

    if (storedListener) {
      const state = {
        zoom: 1e-5,
        deltaCr: -0.5, // Let's say user WAS at -1.5 when this fired
        anchorCr: '-1.0',
        anchorCi: '0.5',
        anchorZr: '0.0',
        anchorZi: '0.0',
        deltaCi: 0.0,
        deltaZr: 0.0,
        deltaZi: 0.0,
        paletteMaxIter: 500,
        exponent: 2,
      } as unknown as ViewportState;

      storedListener(state, { ...state, deltaCr: -0.4 } as unknown as ViewportState);
      vi.advanceTimersByTime(160);
    }

    // Finish computation
    const fakeOrbits = new Float64Array([42]);
    mockWorker.onmessage({
      data: { type: 'COMPUTE_RESULT', result: fakeOrbits },
    });

    expect(viewportStore.setState).toHaveBeenCalled();
    // The NEW anchor should be the one the worker processed cleanly: -1.5
    expect(mockViewportStoreSetStateOutput.anchorCr).toBe('-1.5');
    // And since the user is CURRENTLY at -0.9 (from our fake store state above),
    // the NEW delta should be -0.9 - (-1.5) = +0.6!
    expect(mockViewportStoreSetStateOutput.deltaCr).toBeCloseTo(0.6);
    expect(mockViewportStoreSetStateOutput.refOrbits).toBe(fakeOrbits);
  });
});
