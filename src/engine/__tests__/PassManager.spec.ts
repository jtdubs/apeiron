import { describe, it, expect, vi } from 'vitest';
import { calculateSkipIter } from '../seriesApproximation';
import { META_STRIDE, FLOATS_PER_ITER } from '../generated/MemoryLayout';
import { AccumulationPass } from '../PassManager';

globalThis.GPUBufferUsage = {
  UNIFORM: 64,
  COPY_DST: 8,
  STORAGE: 128,
} as unknown as typeof GPUBufferUsage;

const createMockDevice = () => {
  return {
    createShaderModule: vi.fn().mockReturnValue({}),
    createBuffer: vi.fn().mockReturnValue({}),
    queue: {
      writeBuffer: vi.fn(),
    },
    createComputePipelineAsync: vi
      .fn()
      .mockImplementation(() => Promise.resolve({ getBindGroupLayout: vi.fn() })),
    createBindGroup: vi.fn(),
  } as unknown as GPUDevice;
};

describe('AccumulationPass Pipeline Caching', () => {
  it('creates a compute pipeline when fetched with new constants', async () => {
    const device = createMockDevice();
    const pass = new AccumulationPass(device, 'mock code');

    expect(pass.getPipeline(2.0, 1.0, 0.0)).toBeNull();

    expect(device.createComputePipelineAsync).toHaveBeenCalledTimes(1);
    expect(device.createComputePipelineAsync).toHaveBeenCalledWith({
      layout: 'auto',
      compute: {
        module: expect.anything(),
        entryPoint: 'main_compute',
        constants: { 0: 2.0, 1: 1.0, 2: 0.0 },
      },
    });
  });

  it('returns a cached pipeline when fetched repeatedly with the same constants', async () => {
    const device = createMockDevice();
    const pass = new AccumulationPass(device, 'mock code');

    pass.getPipeline(2.0, 0.0, 0.0);
    await Promise.resolve(); // Flush microtasks to allow promise to resolve

    const pipeline1 = pass.getPipeline(2.0, 0.0, 0.0);
    const pipeline2 = pass.getPipeline(2.0, 0.0, 0.0);

    expect(pipeline1).toBeTruthy();
    expect(pipeline1).toBe(pipeline2);
    expect(device.createComputePipelineAsync).toHaveBeenCalledTimes(1);
  });

  it('creates distinct pipelines for different constants without bleeding', async () => {
    const device = createMockDevice();
    const pass = new AccumulationPass(device, 'mock code');

    pass.getPipeline(2.0, 1.0, 0.0);
    pass.getPipeline(3.0, 1.0, 0.0);
    pass.getPipeline(2.0, 0.0, 0.0);

    await Promise.resolve();

    const pipeline1 = pass.getPipeline(2.0, 1.0, 0.0);
    const pipeline2 = pass.getPipeline(3.0, 1.0, 0.0);
    const pipeline3 = pass.getPipeline(2.0, 0.0, 0.0);

    expect(device.createComputePipelineAsync).toHaveBeenCalledTimes(3);
    expect(pipeline1).not.toBe(pipeline2);
    expect(pipeline1).not.toBe(pipeline3);
  });
});

describe('PassManager Pure Function Uniform Building', () => {
  describe('Series Approximation Math Tracker', () => {
    it('returns 0 when precisionMode is f32', () => {
      const refOrbits = new Float64Array(808);
      expect(calculateSkipIter(refOrbits, 1e-5, 0, 0, 1024, 768, 0, 'f32')).toBe(0);
    });

    it('returns 0 when sliceAngle implies Julia/cross-plane panning', () => {
      const refOrbits = new Float64Array(808);
      expect(calculateSkipIter(refOrbits, 1e-5, 0, 0, 1024, 768, Math.PI / 4, 'perturbation')).toBe(
        0,
      );
    });

    it('correctly calculates the mathematical skip limit against simulated trajectory bounds', () => {
      const iterCount = 100;
      const floatsPerCase = 136;
      const refOrbits = new Float64Array(iterCount * floatsPerCase + META_STRIDE);

      for (let i = 0; i < iterCount; i++) {
        refOrbits[META_STRIDE + i * FLOATS_PER_ITER + 2] = 1.0;
        refOrbits[META_STRIDE + i * FLOATS_PER_ITER + 3] = 0.0;
        refOrbits[META_STRIDE + i * FLOATS_PER_ITER + 6] = i >= 19 ? 1e15 : 0.0;
        refOrbits[META_STRIDE + i * FLOATS_PER_ITER + 7] = 0.0;
      }

      const skip = calculateSkipIter(refOrbits, 1e-5, 0, 0, 1000, 1000, 0, 'perturbation');
      expect(skip).toBe(18);
    });
  });
});
