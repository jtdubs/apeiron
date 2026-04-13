export interface ApeironEngine {
  device: GPUDevice;
  adapter: GPUAdapter;
  context: GPUCanvasContext | null;
  executeTestCompute: (input: Float32Array) => Promise<Float32Array>;
  renderFrame: (
    zr: number,
    zi: number,
    cr: number,
    ci: number,
    scale: number,
    maxIter: number,
    sliceAngle: number,
  ) => void;
  resize: () => void;
}

export async function initEngine(
  canvas?: HTMLCanvasElement,
  shaderCode?: string,
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

  // Load the standalone WGSL file
  const mandelbrotShaderCode = shaderCode ?? '';

  // Compute pipeline for Headless Math Verification
  const computeModule = device.createShaderModule({ code: mandelbrotShaderCode });
  const computePipeline = device.createComputePipeline({
    layout: 'auto',
    compute: {
      module: computeModule,
      entryPoint: 'main_compute',
    },
  });

  const executeTestCompute = async (
    input: Float32Array,
    maxIter: number = 100,
  ): Promise<Float32Array> => {
    // Input is interleaved points: [zr, zi, cr, ci, ...]
    // Output is interleaved bounds: [iter, escaped, ...]
    const inputSize = input.byteLength;
    const outputSize = (input.length / 4) * 2 * 4; // 2 floats output per 4 floats input, * 4 bytes

    // Separate Input Buffer
    const inputStorageBuffer = device.createBuffer({
      size: inputSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(inputStorageBuffer, 0, input);

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
      size: 32, // 8 floats
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    // [zr, zi, cr, ci, scale, aspect, maxIter, sliceAngle]
    const cameraData = new Float32Array([0.0, 0.0, 0.0, 0.0, 1.0, 1.0, maxIter, 0.0]);
    device.queue.writeBuffer(cameraTestBuffer, 0, cameraData);

    const bindGroup = device.createBindGroup({
      layout: computePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: cameraTestBuffer } },
        { binding: 1, resource: { buffer: inputStorageBuffer } },
        { binding: 2, resource: { buffer: outputStorageBuffer } },
      ],
    });

    const commandEncoder = device.createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();
    passEncoder.setPipeline(computePipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.dispatchWorkgroups(input.length / 4);
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

    return result;
  };

  // Render pipeline for Canvas
  const renderModule = device.createShaderModule({ code: mandelbrotShaderCode });
  let renderPipeline: GPURenderPipeline | null = null;
  let uniformsBuffer: GPUBuffer | null = null;
  let renderBindGroup: GPUBindGroup | null = null;

  if (canvas) {
    uniformsBuffer = device.createBuffer({
      size: 32, // vec2<f32>, f32, f32, f32 + 3 pads -> 32 bytes
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    // Wait for the renderFrame call to write buffer values

    renderPipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: renderModule,
        entryPoint: 'vs_main',
      },
      fragment: {
        module: renderModule,
        entryPoint: 'fs_main',
        targets: [{ format: canvasFormat }],
      },
      primitive: {
        topology: 'triangle-list',
      },
    });

    renderBindGroup = device.createBindGroup({
      layout: renderPipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: uniformsBuffer } }],
    });
  }

  const renderFrame = (
    zr: number,
    zi: number,
    cr: number,
    ci: number,
    scale: number,
    maxIter: number,
    sliceAngle: number,
  ) => {
    if (!context || !renderPipeline) return;

    if (uniformsBuffer && canvas) {
      const aspectRatio = canvas.width / canvas.height;
      const cameraData = new Float32Array([
        zr,
        zi,
        cr,
        ci,
        scale,
        aspectRatio,
        maxIter,
        sliceAngle,
      ]);
      device.queue.writeBuffer(uniformsBuffer, 0, cameraData);
    }

    const commandEncoder = device.createCommandEncoder();
    const textureView = context.getCurrentTexture().createView();

    const passEncoder = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: textureView,
          clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });

    passEncoder.setPipeline(renderPipeline);
    if (renderBindGroup) {
      passEncoder.setBindGroup(0, renderBindGroup);
    }
    passEncoder.draw(6); // Draw the hardcoded quad
    passEncoder.end();

    device.queue.submit([commandEncoder.finish()]);
  };

  const resize = () => {
    if (context && canvas) {
      context.configure({
        device,
        format: canvasFormat,
        alphaMode: 'opaque',
      });
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
