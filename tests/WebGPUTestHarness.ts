import type { RenderState } from '../src/ui/stores/renderStore.ts';
import { PassManager } from '../src/engine/PassManager.ts';
import type { RenderFrameDescriptor } from '../src/engine/RenderFrameDescriptor.ts';

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
  ): Promise<Float32Array> {
    const computeModule = this.device.createShaderModule({ code: this.mathShaderCode });
    const computePipeline = this.device.createComputePipeline({
      layout: 'auto',
      compute: {
        module: computeModule,
        entryPoint: 'main_compute',
      },
    });

    const inputSize = input.byteLength;
    const computeUnits = input.length / 6;
    const outputSize = computeUnits * 4 * 4;

    const inputStorageBuffer = this.device.createBuffer({
      size: inputSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    this.device.queue.writeBuffer(inputStorageBuffer, 0, input as unknown as BufferSource);

    const outputStorageBuffer = this.device.createBuffer({
      size: outputSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    const stagingBuffer = this.device.createBuffer({
      size: outputSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    const cameraTestBuffer = this.device.createBuffer({
      size: 80,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    const cameraData = new Float32Array([
      0.0, // zr
      0.0, // zi
      0.0, // cr
      0.0, // ci
      1.0, // scale
      1.0, // aspect
      maxIter,
      0.0, // sliceAngle
      usePerturbation ? 1.0 : 0.0,
      maxIter,
      exponent,
      0.0, // coloringMode
      0.0, // jitterX
      0.0, // jitterY
      0.0, // blendWeight (first frame = 0.0, replaces prev buffer)
      1.0, // renderScale
      maxIter, // yieldIterLimit
      0.0, // isResume
      1.0, // isFinalSlice
      1.0, // canvasWidth
    ]);
    this.device.queue.writeBuffer(cameraTestBuffer, 0, cameraData);

    const entries: GPUBindGroupEntry[] = [
      { binding: 0, resource: { buffer: cameraTestBuffer } },
      { binding: 1, resource: { buffer: inputStorageBuffer } },
      { binding: 2, resource: { buffer: outputStorageBuffer } },
    ];

    const checkpointBuffer = this.device.createBuffer({
      size: computeUnits * 32, // CheckpointState is 32 bytes
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    entries.push({ binding: 5, resource: { buffer: checkpointBuffer } });

    let refOrbitsBuffer: GPUBuffer | null = null;
    if (refOrbits) {
      refOrbitsBuffer = this.device.createBuffer({
        size: refOrbits.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      this.device.queue.writeBuffer(
        refOrbitsBuffer,
        0,
        refOrbits.buffer,
        refOrbits.byteOffset,
        refOrbits.byteLength,
      );
      entries.push({ binding: 3, resource: { buffer: refOrbitsBuffer } });
    } else {
      refOrbitsBuffer = this.device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      this.device.queue.writeBuffer(refOrbitsBuffer, 0, new Float32Array([0.0, 0.0, 0.0, 0.0]));
      entries.push({ binding: 3, resource: { buffer: refOrbitsBuffer } });
    }

    const bindGroup = this.device.createBindGroup({
      layout: computePipeline.getBindGroupLayout(0),
      entries,
    });

    const commandEncoder = this.device.createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();
    passEncoder.setPipeline(computePipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.dispatchWorkgroups(computeUnits);
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
    if (refOrbitsBuffer) refOrbitsBuffer.destroy();
    checkpointBuffer.destroy();

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
  ) {
    const desc: RenderFrameDescriptor = {
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
      renderScale: 1.0,
      blendWeight,
      jitterX,
      jitterY,
      yieldIterLimit: maxIter,
      isResume: 0.0,
      isFinalSlice: true,
      advancePingPong: true,
      clearCheckpoint: true,
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
