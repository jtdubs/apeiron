import type { RenderState } from '../ui/stores/renderStore';
import { PassManager } from './PassManager';

export interface ApeironEngine {
  device: GPUDevice;
  adapter: GPUAdapter;
  context: GPUCanvasContext | null;
  executeTestCompute: (
    input: Float32Array,
    refOrbits?: Float64Array,
    maxIter?: number,
    usePerturbation?: boolean,
    exponent?: number,
  ) => Promise<Float32Array>;
  renderFrame: (
    zr: number,
    zi: number,
    cr: number,
    ci: number,
    scale: number,
    maxIter: number,
    sliceAngle: number,
    exponent: number,
    refOrbits?: Float64Array | null,
    theme?: RenderState,
  ) => void;
  resize: () => void;
}

export async function initEngine(
  canvas?: HTMLCanvasElement,
  mathShaderCode: string = '',
  resolveShaderCode: string = '',
): Promise<ApeironEngine> {
  if (!navigator.gpu) {
    throw new Error('WebGPU is not supported in this environment');
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw new Error('Failed to acquire WebGPU adapter. Hardware may not support WebGPU.');
  }

  const device = await adapter.requestDevice();

  let context: GPUCanvasContext | null = null;
  const canvasFormat: GPUTextureFormat = navigator.gpu.getPreferredCanvasFormat();

  if (canvas) {
    context = canvas.getContext('webgpu') as GPUCanvasContext;
    if (!context) {
      throw new Error('Failed to get webgpu context from canvas');
    }
    context.configure({
      device,
      format: canvasFormat,
      alphaMode: 'opaque',
    });
  }

  // Compute pipeline for Headless Math Verification
  const computeModule = device.createShaderModule({ code: mathShaderCode });
  const computePipeline = device.createComputePipeline({
    layout: 'auto',
    compute: {
      module: computeModule,
      entryPoint: 'main_compute',
    },
  });

  const executeTestCompute = async (
    input: Float32Array,
    refOrbits?: Float64Array,
    maxIter: number = 100,
    usePerturbation: boolean = true,
    exponent: number = 2.0,
  ): Promise<Float32Array> => {
    // Input is interleaved points: [zr, zi, target_cr, target_ci, delta_r, delta_i]
    // Output is interleaved bounds: [iter, escaped]
    const inputSize = input.byteLength;
    const computeUnits = input.length / 6;
    const outputSize = computeUnits * 2 * 4; // 2 floats output per compute unit, * 4 bytes

    // Separate Input Buffer
    const inputStorageBuffer = device.createBuffer({
      size: inputSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(inputStorageBuffer, 0, input as unknown as BufferSource);

    // Separate Output Buffer
    const outputStorageBuffer = device.createBuffer({
      size: outputSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC,
    });

    const stagingBuffer = device.createBuffer({
      size: outputSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    const cameraTestBuffer = device.createBuffer({
      size: 48, // 12 floats!
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    // [zr, zi, cr, ci, scale, aspect, maxIter, sliceAngle, use_perturbation, ref_max_iter, exponent, pad]
    const cameraData = new Float32Array([
      0.0,
      0.0,
      0.0,
      0.0,
      1.0,
      1.0,
      maxIter,
      0.0,
      usePerturbation ? 1.0 : 0.0,
      maxIter,
      exponent,
      0.0, // coloringMode in test
    ]);
    device.queue.writeBuffer(cameraTestBuffer, 0, cameraData);

    const entries: GPUBindGroupEntry[] = [
      { binding: 0, resource: { buffer: cameraTestBuffer } },
      { binding: 1, resource: { buffer: inputStorageBuffer } },
      { binding: 2, resource: { buffer: outputStorageBuffer } },
    ];

    let refOrbitsBuffer: GPUBuffer | null = null;
    if (refOrbits) {
      refOrbitsBuffer = device.createBuffer({
        size: refOrbits.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(refOrbitsBuffer, 0, refOrbits.buffer, refOrbits.byteOffset, refOrbits.byteLength);
      entries.push({ binding: 3, resource: { buffer: refOrbitsBuffer } });
    } else {
      refOrbitsBuffer = device.createBuffer({
        size: 16,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(refOrbitsBuffer, 0, new Float32Array([0.0, 0.0, 0.0, 0.0]));
      entries.push({ binding: 3, resource: { buffer: refOrbitsBuffer } });
    }

    const bindGroup = device.createBindGroup({
      layout: computePipeline.getBindGroupLayout(0),
      entries,
    });

    const commandEncoder = device.createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();
    passEncoder.setPipeline(computePipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.dispatchWorkgroups(computeUnits);
    passEncoder.end();

    commandEncoder.copyBufferToBuffer(outputStorageBuffer, 0, stagingBuffer, 0, outputSize);
    device.queue.submit([commandEncoder.finish()]);

    await stagingBuffer.mapAsync(GPUMapMode.READ);
    const arrayBuffer = stagingBuffer.getMappedRange();
    const result = new Float32Array(arrayBuffer.slice(0));
    stagingBuffer.unmap();
    inputStorageBuffer.destroy();
    outputStorageBuffer.destroy();
    stagingBuffer.destroy();
    cameraTestBuffer.destroy();
    if (refOrbitsBuffer) refOrbitsBuffer.destroy();

    return result;
  };

  let passManager: PassManager | null = null;

  if (canvas) {
    passManager = new PassManager(device, canvas, canvasFormat, mathShaderCode, resolveShaderCode);
  }

  const renderFrame = (
    zr: number,
    zi: number,
    cr: number,
    ci: number,
    scale: number,
    maxIter: number,
    sliceAngle: number,
    exponent: number,
    refOrbits?: Float64Array | null,
    theme?: RenderState,
  ) => {
    if (!context || !passManager) return;
    passManager.render(
      context,
      zr,
      zi,
      cr,
      ci,
      scale,
      maxIter,
      sliceAngle,
      exponent,
      refOrbits,
      theme,
    );
  };

  const resize = () => {
    if (context && canvas) {
      context.configure({
        device,
        format: canvasFormat,
        alphaMode: 'opaque',
      });
      if (passManager) {
        passManager.initGBuffer();
      }
    }
  };

  return {
    device,
    adapter,
    context,
    executeTestCompute,
    renderFrame,
    resize,
  };
}
