export interface ApeironEngine {
  device: GPUDevice;
  adapter: GPUAdapter;
  context: GPUCanvasContext | null;
  executeTestCompute: (input: Float32Array) => Promise<Float32Array>;
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
  if (canvas) {
    context = canvas.getContext('webgpu') as GPUCanvasContext;
    if (!context) {
      throw new Error('Failed to get webgpu context from canvas');
    }
    const canvasFormat = navigator.gpu.getPreferredCanvasFormat();
    context.configure({
      device,
      format: canvasFormat,
      alphaMode: 'opaque',
    });
  }

  // Basic compute shader to satisfy headless regression testing (Task 002)
  const computeShaderCode = `
    @group(0) @binding(0) var<storage, read_write> data: array<f32>;
    
    @compute @workgroup_size(1)
    fn main(@builtin(global_invocation_id) global_id: vec3<u32>) {
      let idx = global_id.x;
      // Simple pass-through multiplication test
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
    // 1. Create a storage buffer to hold the input/output data
    const bufferSize = input.byteLength;
    const storageBuffer = device.createBuffer({
      size: bufferSize,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_SRC | GPUBufferUsage.COPY_DST,
    });

    device.queue.writeBuffer(storageBuffer, 0, input);

    // 2. Create a read-back buffer mapping
    const stagingBuffer = device.createBuffer({
      size: bufferSize,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    const bindGroup = device.createBindGroup({
      layout: computePipeline.getBindGroupLayout(0),
      entries: [
        {
          binding: 0,
          resource: { buffer: storageBuffer },
        },
      ],
    });

    const commandEncoder = device.createCommandEncoder();
    const passEncoder = commandEncoder.beginComputePass();
    passEncoder.setPipeline(computePipeline);
    passEncoder.setBindGroup(0, bindGroup);
    passEncoder.dispatchWorkgroups(input.length);
    passEncoder.end();

    // Copy to staging buffer
    commandEncoder.copyBufferToBuffer(storageBuffer, 0, stagingBuffer, 0, bufferSize);
    device.queue.submit([commandEncoder.finish()]);

    await stagingBuffer.mapAsync(GPUMapMode.READ);
    const arrayBuffer = stagingBuffer.getMappedRange();
    const result = new Float32Array(arrayBuffer.slice(0));
    stagingBuffer.unmap();

    // Cleanup
    storageBuffer.destroy();
    stagingBuffer.destroy();

    return result;
  };

  return {
    device,
    adapter,
    context,
    executeTestCompute,
  };
}
