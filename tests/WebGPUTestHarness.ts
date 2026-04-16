import type { RenderState } from '../src/ui/stores/renderStore.ts';
import { PassManager } from '../src/engine/PassManager.ts';
import type { RenderFrameDescriptor } from '../src/engine/RenderFrameDescriptor.ts';
import { CameraParams, packCameraParams } from '../src/engine/generated/MemoryLayout.ts';

export class WebGPUTestHarness {
  constructor(
    private device: GPUDevice,
    private mathShaderCode: string,
    private resolveShaderCode: string,
  ) {}

  public async executeTestCompute(
    input: Float32Array,
    refOrbits?: Float64Array,
    maxIter: number = 100,
    usePerturbation: boolean = true,
    exponent: number = 2.0,
    skipIter: number = 0.0,
  ): Promise<Float32Array> {
    return this.executeUnitTest(
      'main_compute',
      input,
      {
        cameraData: {
          scale: 1.0,
          aspect: 1.0,
          render_scale: 1.0,
          canvas_width: 1.0,
          yield_iter_limit: maxIter,
          ref_max_iter: maxIter,
          max_iter: maxIter,
          use_perturbation: usePerturbation ? 1.0 : 0.0,
          exponent: exponent,
          skip_iter: skipIter,
        },
        refOrbits: refOrbits,
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
      refOrbits?: Float64Array;
      checkpointData?: Float32Array;
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
      max_iter: 100.0,
      ref_max_iter: 100.0,
      exponent: 2.0,
      render_scale: 1.0,
      yield_iter_limit: 100.0,
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

    // Some WGSL functions require the reference orbit `binding 3` during tests indirectly (like SA and BLA)
    let refOrbitsActualBuffer: GPUBuffer | null = null;
    if (
      (entryPoint === 'unit_test_sa_init' ||
        entryPoint === 'unit_test_bla_advance' ||
        entryPoint === 'main_compute') &&
      options.refOrbits
    ) {
      const refArray = options.refOrbits;
      refOrbitsActualBuffer = this.device.createBuffer({
        size: refArray.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      this.device.queue.writeBuffer(
        refOrbitsActualBuffer,
        0,
        refArray.buffer,
        refArray.byteOffset,
        refArray.byteLength,
      );
    } else {
      refOrbitsActualBuffer = this.device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      this.device.queue.writeBuffer(
        refOrbitsActualBuffer,
        0,
        new Float32Array([0.0, 0.0, 0.0, 0.0]),
      );
    }

    const entries: GPUBindGroupEntry[] = [
      { binding: 1, resource: { buffer: inputStorageBuffer } },
      { binding: 2, resource: { buffer: outputStorageBuffer } },
    ];

    // Auto layout parsing logic
    if (entryPoint === 'unit_test_polynomial') {
      entries.push({ binding: 0, resource: { buffer: cameraTestBuffer } });
    } else if (entryPoint === 'unit_test_state_resume') {
      entries.push({ binding: 0, resource: { buffer: cameraTestBuffer } });
      entries.push({ binding: 5, resource: { buffer: checkpointBuffer } });
    } else if (entryPoint === 'unit_test_sa_init' || entryPoint === 'unit_test_bla_advance') {
      entries.push({ binding: 0, resource: { buffer: cameraTestBuffer } });
      entries.push({ binding: 3, resource: { buffer: refOrbitsActualBuffer } });
      entries.push({ binding: 5, resource: { buffer: checkpointBuffer } });
    } else if (entryPoint === 'main_compute') {
      entries.push({ binding: 0, resource: { buffer: cameraTestBuffer } });
      entries.push({ binding: 3, resource: { buffer: refOrbitsActualBuffer } });
      entries.push({ binding: 5, resource: { buffer: checkpointBuffer } });
    }

    const bindGroup = this.device.createBindGroup({
      layout: computePipeline.getBindGroupLayout(0),
      entries,
    });

    const commandEncoder = this.device.createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();
    passEncoder.setPipeline(computePipeline);
    passEncoder.setBindGroup(0, bindGroup);
    const workgroupDivisor = entryPoint === 'main_compute' ? 1 : 64;
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
    refOrbitsActualBuffer.destroy();

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

  constructor(
    private device: GPUDevice,
    private width: number,
    private height: number,
    mathShaderCode: string,
    resolveShaderCode: string,
  ) {
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

  public renderFrame(
    zr: number,
    zi: number,
    cr: number,
    ci: number,
    zoom: number,
    maxIter: number,
    sliceAngle: number,
    exponent: number,
    blendWeight: number = 0.0,
    jitterX: number = 0.0,
    jitterY: number = 0.0,
    refOrbits?: Float64Array | null,
    theme?: RenderState,
    yieldIterLimit?: number,
  ) {
    const desc: RenderFrameDescriptor = {
      context: {
        zr,
        zi,
        cr,
        ci,
        zoom,
        maxIter,
        trueMaxIter: maxIter,
        sliceAngle,
        exponent,
        refOrbits: refOrbits ?? null,
        skipIter: 0,
      },
      command: {
        renderScale: 1.0,
        blendWeight,
        jitterX,
        jitterY,
        yieldIterLimit: yieldIterLimit ?? maxIter,
        loadCheckpoint: false,
        advancePingPong: true,
        clearCheckpoint: true,
      },
      theme: theme ?? ({} as RenderState),
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
    const buffer = await this.readTextureBytes(this.targetTexture, 4);
    return new Uint8Array(buffer);
  }

  public async readGBuffer(): Promise<Float32Array> {
    // Flush the queue to ensure pm.render commands are fully submitted
    this.device.queue.submit([]);

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
