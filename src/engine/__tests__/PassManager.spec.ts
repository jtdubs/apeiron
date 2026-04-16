import { describe, it, expect } from 'vitest';
import { calculateSkipIter } from '../seriesApproximation';
import { META_STRIDE, FLOATS_PER_ITER } from '../generated/MemoryLayout';

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
