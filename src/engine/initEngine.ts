export interface ApeironEngine {
  device: GPUDevice;
  adapter: GPUAdapter;
  context: GPUCanvasContext | null;
  executeTestCompute: (input: Float32Array) => Promise<Float32Array>;
  renderFrame: () => void;
  resize: () => void;
}

export async function initEngine(canvas?: HTMLCanvasElement): Promise<ApeironEngine> {
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

  // Basic compute shader for Task 002 (Headless regression)
  const computeShaderCode = `
    @group(0) @binding(0) var<storage, read_write> data: array<f32>;
    
    @compute @workgroup_size(1)
    fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
      let idx = global_id.x;
      data[idx] = data[idx] * 2.0;
    }
  `;

  const computeModule = device.createShaderModule({ code: computeShaderCode });
  const computePipeline = device.createComputePipeline({
    layout: 'auto',
    compute: {
      module: computeModule,
      entryPoint: 'main',
    },
  });

  const executeTestCompute = async (input: Float32Array): Promise<Float32Array> => {
    const bufferSize = input.byteLength;
    const storageBuffer = device.createBuffer({
      size: bufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(storageBuffer, 0, input);

    const stagingBuffer = device.createBuffer({
      size: bufferSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    const bindGroup = device.createBindGroup({
      layout: computePipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: { buffer: storageBuffer } }],
    });

    const commandEncoder = device.createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();
    passEncoder.setPipeline(computePipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.dispatchWorkgroups(input.length);
    passEncoder.end();

    commandEncoder.copyBufferToBuffer(storageBuffer, 0, stagingBuffer, 0, bufferSize);
    device.queue.submit([commandEncoder.finish()]);

    await stagingBuffer.mapAsync(GPUMapMode.READ);
    const arrayBuffer = stagingBuffer.getMappedRange();
    const result = new Float32Array(arrayBuffer.slice(0));
    stagingBuffer.unmap();
    storageBuffer.destroy();
    stagingBuffer.destroy();

    return result;
  };

  // Render pipeline for Canvas test (Task 004)
  const renderShaderCode = `
    @vertex
    fn vs_main(@builtin(vertex_index) VertexIndex : u32) -> @builtin(position) vec4<f32> {
      var pos = array<vec2<f32>, 6>(
        vec2<f32>(-1.0, -1.0), vec2<f32>( 1.0, -1.0), vec2<f32>(-1.0,  1.0),
        vec2<f32>(-1.0,  1.0), vec2<f32>( 1.0, -1.0), vec2<f32>( 1.0,  1.0)
      );
      return vec4<f32>(pos[VertexIndex], 0.0, 1.0);
    }

    @fragment
    fn fs_main(@builtin(position) coord: vec4<f32>) -> @location(0) vec4<f32> {
      // Create a nice gradient based on viewport coordinates
      let x = coord.x / 1000.0;
      let y = coord.y / 1000.0;
      return vec4<f32>(x, y, 0.5, 1.0);
    }
  `;

  const renderModule = device.createShaderModule({ code: renderShaderCode });
  let renderPipeline: GPURenderPipeline | null = null;

  if (canvas) {
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
  }

  const renderFrame = () => {
    if (!context || !renderPipeline) return;

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
