import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PassManager } from '../PassManager';

describe('PassManager Orchestration', () => {
  let mockDevice: GPUDevice;
  let mockCanvas: HTMLCanvasElement;
  let writeBufferMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    vi.stubGlobal('GPUBufferUsage', {
      UNIFORM: 64,
      COPY_DST: 8,
      STORAGE: 128,
      MAP_READ: 1,
      COPY_SRC: 4,
    });
    vi.stubGlobal('GPUTextureUsage', { RENDER_ATTACHMENT: 16, TEXTURE_BINDING: 4 });

    writeBufferMock = vi.fn();
    mockDevice = {
      createShaderModule: vi.fn().mockReturnValue({}),
      createBuffer: vi.fn().mockReturnValue(Symbol('GPUBuffer')),
      createRenderPipeline: vi.fn().mockReturnValue({
        getBindGroupLayout: vi.fn(),
      }),
      createBindGroup: vi.fn().mockReturnValue(Symbol('GPUBindGroup')),
      createTexture: vi.fn().mockReturnValue({
        createView: vi.fn(),
        destroy: vi.fn(),
      }),
      createCommandEncoder: vi.fn().mockReturnValue({
        beginRenderPass: vi.fn().mockReturnValue({
          setPipeline: vi.fn(),
          setBindGroup: vi.fn(),
          draw: vi.fn(),
          end: vi.fn(),
        }),
        finish: vi.fn(),
      }),
      queue: {
        writeBuffer: writeBufferMock,
        submit: vi.fn(),
      },
    } as unknown as GPUDevice;

    mockCanvas = {
      width: 800,
      height: 600,
    } as unknown as HTMLCanvasElement;
  });

  it('correctly calculates actualRefMaxIter for the uniform buffer from rust refOrbits padding', () => {
    const passManager = new PassManager(
      mockDevice,
      mockCanvas,
      'bgra8unorm',
      '// math shader code',
      '// resolve shader code',
    );

    // Mock Context
    const mockContext = {
      getCurrentTexture: vi.fn().mockReturnValue({
        createView: vi.fn(),
      }),
    };

    // Construct a mock Rust orbit buffer: [maxIter * 2 locations] + [8 trailing metadata floats]
    // Let's say maxIter = 10 explicitly here.
    const expectedMaxIter = 10;
    const rustBufferLength = expectedMaxIter * 2 + 8;
    const refOrbits = new Float64Array(rustBufferLength);

    passManager.render(
      mockContext as unknown as GPUCanvasContext,
      0,
      0,
      -1.0,
      0.0, // zr, zi, cr, ci
      1e-5, // scale
      expectedMaxIter, // requested maxIter
      0, // sliceAngle
      2.0, // exponent
      refOrbits,
      undefined, // theme
    );

    // find the call to writeBuffer for the camera uniforms
    // The camera buffer data is pushed through this.accumPass.uniformsBuffer
    // We can iterate over the calls to `writeBuffer` to find the Float32Array length 12
    const cameraWriteCall = writeBufferMock.mock.calls.find((call) => {
      const data = call[2] as Float32Array;
      // The camera uniform struct consists of 12 floats
      return data instanceof Float32Array && data.length === 12;
    });

    expect(cameraWriteCall).toBeDefined();

    if (!cameraWriteCall) throw new Error('cameraWriteCall not found');
    const cameraData = cameraWriteCall[2] as Float32Array;

    // Based on the shader struct layout in initEngine.ts / PassManager.ts,
    // [0-3]: Coordinates
    // [4]: Scale
    // [5]: AspectRatio
    // [6]: maxIter
    // [7]: sliceAngle
    // [8]: usePerturbation
    // [9]: actualRefMaxIter
    // [10]: exponent
    // [11]: coloringMode

    expect(cameraData[9]).toBe(expectedMaxIter);
  });
});
