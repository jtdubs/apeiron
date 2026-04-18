/// <reference types="@webgpu/types" />
import type { RenderState } from '../src/ui/stores/renderStore.ts';
import { PassManager } from '../src/engine/PassManager.ts';
import type {
  RenderFrameDescriptor,
  MathContext,
  ExecutionCommand,
} from '../src/engine/RenderFrameDescriptor.ts';
import type { CameraParams } from '../src/engine/generated/MemoryLayout.ts';
import { packCameraParams } from '../src/engine/generated/MemoryLayout.ts';

export class WebGPUTestHarness {
  private device: GPUDevice;
  private mathShaderCode: string;
  private resolveShaderCode: string;

  constructor(device: GPUDevice, mathShaderCode: string, resolveShaderCode: string) {
    this.device = device;
    this.mathShaderCode = mathShaderCode;
    this.resolveShaderCode = resolveShaderCode;
  }

  public async executeTestCompute(
    input: Float32Array,
    refOrbitNodes?: Float64Array,
    refMetadata?: Float64Array,
    refBlaGrid?: Float64Array,
    maxIter: number = 100,
    usePerturbation: boolean = true,
    exponent: number = 2.0,
  ): Promise<Float32Array> {
    return this.executeUnitTest(
      'unit_test_engine_math',
      input,
      {
        cameraData: {
          scale: 1.0,
          aspect: 1.0,
          render_scale: 1.0,
          canvas_width: 1.0,
          step_limit: maxIter,
          ref_max_iter: maxIter,
          compute_max_iter: maxIter,
          skip_iter: 0.0,
        },
        refOrbitNodes,
        refMetadata,
        refBlaGrid,
        exponent: exponent,
        usePerturbation: usePerturbation ? 1.0 : 0.0,
      },
      6,
      4,
    );
  }

  public async executeUnitTest(
    entryPoint: string,
    input: Float32Array,
    options: {
      cameraData?: CameraParams;
      refOrbitNodes?: Float64Array;
      refMetadata?: Float64Array;
      refBlaGrid?: Float64Array;
      checkpointData?: Float32Array;
      exponent?: number;
      usePerturbation?: number;
    } = {},
    inputStride: number = 4,
    outputStride: number = 4,
  ): Promise<Float32Array> {
    const computeModule = this.device.createShaderModule({ code: this.mathShaderCode });
    const computePipeline = this.device.createComputePipeline({
      layout: 'auto',
      compute: {
        module: computeModule,
        entryPoint: entryPoint,
        constants: {
          0: options.exponent ?? 2.0,
          1: options.usePerturbation ?? 1.0,
        },
      },
    });

    const inputSize = input.byteLength;
    const computeUnits = input.length / inputStride;
    const outputSize = computeUnits * outputStride * 4;

    const inputStorageBuffer = this.device.createBuffer({
      size: inputSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(inputStorageBuffer, 0, input as unknown as BufferSource);

    const outputStorageBuffer = this.device.createBuffer({
      size: outputSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });

    const stagingBuffer = this.device.createBuffer({
      size: outputSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    const cameraTestBuffer = this.device.createBuffer({
      size: 96,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Standard mock camera fallback
    const cameraFallback: CameraParams = {
      scale: 1.0,
      aspect: 1.0,
      compute_max_iter: 100.0,
      ref_max_iter: 100.0,
      render_scale: 1.0,
      step_limit: 100.0,
      canvas_width: 1.0,
    };

    const packedCamera = packCameraParams(options.cameraData ?? cameraFallback);
    this.device.queue.writeBuffer(cameraTestBuffer, 0, packedCamera);

    const checkpointBuffer = this.device.createBuffer({
      size: Math.max(computeUnits * 32, 32),
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    // Pre-seed checkpoint buffer for testing FSM continuation
    let mockCheckpoint = options.checkpointData;
    if (!mockCheckpoint) {
      mockCheckpoint = new Float32Array(Math.max(computeUnits * 8, 8));
      for (let i = 0; i < computeUnits; i++) {
        mockCheckpoint[i * 8] = input[i * inputStride]; // zx
        mockCheckpoint[i * 8 + 1] = input[i * inputStride + 1]; // zy
        mockCheckpoint[i * 8 + 2] = 1.0; // der_x
        mockCheckpoint[i * 8 + 3] = 0.0; // der_y
        let iterVal = 0;
        if (inputStride >= 3) {
          iterVal = input[i * inputStride + 2];
        }
        mockCheckpoint[i * 8 + 4] = iterVal; // iter
        mockCheckpoint[i * 8 + 5] = 0.0; // tia
        mockCheckpoint[i * 8 + 6] = 0.0;
        mockCheckpoint[i * 8 + 7] = 0.0;
      }
    }
    this.device.queue.writeBuffer(checkpointBuffer, 0, mockCheckpoint);

    let refOrbitNodesBuffer: GPUBuffer | null = null;
    let refMetadataBuffer: GPUBuffer | null = null;
    let refBlaGridBuffer: GPUBuffer | null = null;

    const createRefBuffer = (data: Float64Array | undefined) => {
      if (data) {
        const buf = this.device.createBuffer({
          size: data.byteLength,
          usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(buf, 0, data.buffer, data.byteOffset, data.byteLength);
        return buf;
      }
      const buf = this.device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      this.device.queue.writeBuffer(buf, 0, new Float32Array([0.0, 0.0, 0.0, 0.0]));
      return buf;
    };

    if (
      entryPoint === 'unit_test_sa_init' ||
      entryPoint === 'unit_test_bla_advance' ||
      entryPoint === 'unit_test_engine_math'
    ) {
      refOrbitNodesBuffer = createRefBuffer(options.refOrbitNodes);
      refMetadataBuffer = createRefBuffer(options.refMetadata);
      refBlaGridBuffer = createRefBuffer(options.refBlaGrid);
    } else {
      refOrbitNodesBuffer = createRefBuffer(undefined);
      refMetadataBuffer = createRefBuffer(undefined);
      refBlaGridBuffer = createRefBuffer(undefined);
    }

    const completionFlagBuffer = this.device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(completionFlagBuffer, 0, new Uint32Array([1]));

    const entries: GPUBindGroupEntry[] = [
      { binding: 1, resource: { buffer: inputStorageBuffer } },
      { binding: 2, resource: { buffer: outputStorageBuffer } },
    ];

    // Auto layout parsing logic
    if (entryPoint === 'unit_test_state_resume') {
      entries.push({ binding: 0, resource: { buffer: cameraTestBuffer } });
      entries.push({ binding: 5, resource: { buffer: checkpointBuffer } });
      entries.push({ binding: 6, resource: { buffer: completionFlagBuffer } });
    } else if (entryPoint === 'unit_test_sa_init' || entryPoint === 'unit_test_bla_advance') {
      entries.push({ binding: 0, resource: { buffer: cameraTestBuffer } });
      entries.push({ binding: 3, resource: { buffer: refOrbitNodesBuffer } });
      entries.push({ binding: 5, resource: { buffer: checkpointBuffer } });
      if (entryPoint === 'unit_test_bla_advance') {
        entries.push({ binding: 8, resource: { buffer: refMetadataBuffer } });
        entries.push({ binding: 9, resource: { buffer: refBlaGridBuffer } });
      }
    } else if (entryPoint === 'unit_test_engine_math') {
      entries.push({ binding: 0, resource: { buffer: cameraTestBuffer } });
      entries.push({ binding: 3, resource: { buffer: refOrbitNodesBuffer } });
      entries.push({ binding: 5, resource: { buffer: checkpointBuffer } });
      entries.push({ binding: 6, resource: { buffer: completionFlagBuffer } });
      entries.push({ binding: 8, resource: { buffer: refMetadataBuffer } });
      entries.push({ binding: 9, resource: { buffer: refBlaGridBuffer } });
    }

    const bindGroup = this.device.createBindGroup({
      layout: computePipeline.getBindGroupLayout(0),
      entries,
    });

    const commandEncoder = this.device.createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();
    passEncoder.setPipeline(computePipeline);
    passEncoder.setBindGroup(0, bindGroup);
    const workgroupDivisor = entryPoint === 'unit_test_engine_math' ? 1 : 64;
    passEncoder.dispatchWorkgroups(Math.ceil(computeUnits / workgroupDivisor));
    passEncoder.end();

    commandEncoder.copyBufferToBuffer(outputStorageBuffer, 0, stagingBuffer, 0, outputSize);
    this.device.queue.submit([commandEncoder.finish()]);

    await stagingBuffer.mapAsync(GPUMapMode.READ);
    const arrayBuffer = stagingBuffer.getMappedRange();
    const result = new Float32Array(arrayBuffer.slice(0));
    stagingBuffer.unmap();
    inputStorageBuffer.destroy();
    outputStorageBuffer.destroy();
    stagingBuffer.destroy();
    cameraTestBuffer.destroy();
    checkpointBuffer.destroy();
    completionFlagBuffer.destroy();
    refOrbitNodesBuffer.destroy();
    refMetadataBuffer.destroy();
    refBlaGridBuffer.destroy();

    return result;
  }

  public createSession(width: number, height: number): TestRenderSession {
    return new TestRenderSession(
      this.device,
      width,
      height,
      this.mathShaderCode,
      this.resolveShaderCode,
    );
  }
}

export class TestRenderSession {
  private pm: PassManager;
  private targetTexture: GPUTexture;
  private targetView: GPUTextureView;

  private device: GPUDevice;
  private width: number;
  private height: number;

  constructor(
    device: GPUDevice,
    width: number,
    height: number,
    mathShaderCode: string,
    resolveShaderCode: string,
  ) {
    this.device = device;
    this.width = width;
    this.height = height;
    const renderFormat: GPUTextureFormat = 'rgba8unorm';
    this.pm = new PassManager(
      device,
      width,
      height,
      renderFormat,
      mathShaderCode,
      resolveShaderCode,
    );
    this.targetTexture = device.createTexture({
      size: [width, height, 1],
      format: renderFormat,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.COPY_SRC,
    });
    this.targetView = this.targetTexture.createView();
  }

  public renderFrame(options: {
    context?: Partial<MathContext>;
    command?: Partial<ExecutionCommand>;
    theme?: Partial<RenderState>;
  }) {
    const desc: RenderFrameDescriptor = {
      context: {
        zr: 0,
        zi: 0,
        cr: 0,
        ci: 0,
        zoom: 1,
        computeMaxIter: 100,
        paletteMaxIter: 100,
        sliceAngle: 0,
        exponent: 2,
        refOrbitNodes: null,
        refMetadata: null,
        refBlaGrid: null,
        effectiveMathMode: 0,
        skipIter: 0,
        debugViewMode: 0,
        ...options.context,
      },
      command: {
        renderScale: 1.0,
        blendWeight: 0.0,
        jitterX: 0.0,
        jitterY: 0.0,
        stepLimit: 100,
        loadCheckpoint: false,
        advancePingPong: true,
        clearCheckpoint: true,
        ...options.command,
      },
      theme: (options.theme ?? {}) as RenderState,
    };
    this.pm.render(this.targetView, this.width, this.height, desc);
  }

  private async readTextureBytes(texture: GPUTexture, bytesPerPixel: number): Promise<ArrayBuffer> {
    const bytesPerRow = Math.ceil((this.width * bytesPerPixel) / 256) * 256;
    const bufferSize = bytesPerRow * this.height;

    const readBuffer = this.device.createBuffer({
      size: bufferSize,
      usage: GPUBufferUsage.COPY_DST | GPUBufferUsage.MAP_READ,
    });

    const commandEncoder = this.device.createCommandEncoder();
    commandEncoder.copyTextureToBuffer({ texture }, { buffer: readBuffer, bytesPerRow }, [
      this.width,
      this.height,
      1,
    ]);
    this.device.queue.submit([commandEncoder.finish()]);

    await readBuffer.mapAsync(GPUMapMode.READ);
    const arrayBuffer = readBuffer.getMappedRange();

    const packedBytes = new Uint8Array(this.width * this.height * bytesPerPixel);
    const mappedBytes = new Uint8Array(arrayBuffer);
    for (let y = 0; y < this.height; y++) {
      packedBytes.set(
        mappedBytes.subarray(y * bytesPerRow, y * bytesPerRow + this.width * bytesPerPixel),
        y * this.width * bytesPerPixel,
      );
    }

    readBuffer.unmap();
    return packedBytes.buffer;
  }

  public async readResolved(): Promise<Uint8Array> {
    if (this.pm.latestMapPromise) {
      await this.pm.latestMapPromise;
    }
    const buffer = await this.readTextureBytes(this.targetTexture, 4);
    return new Uint8Array(buffer);
  }

  public async readGBuffer(): Promise<Float32Array> {
    // Flush the queue to ensure pm.render commands are fully submitted
    this.device.queue.submit([]);

    if (this.pm.latestMapPromise) {
      await this.pm.latestMapPromise;
    }

    const gBuffer = this.pm.getActiveGBuffer();
    if (!gBuffer) throw new Error('No active G-Buffer');

    // G-Buffer is a 4-channel 32-bit float texture (16 bytes per pixel)
    const buffer = await this.readTextureBytes(gBuffer, 16);
    return new Float32Array(buffer);
  }

  public destroy() {
    this.targetTexture.destroy();
  }
}
