export interface ApeironEngine {
  device: GPUDevice;
  adapter: GPUAdapter;
  context: GPUCanvasContext | null;
  executeTestCompute: (input: Float32Array, refOrbits?: Float64Array) => Promise<Float32Array>;
  renderFrame: (
    zr: number,
    zi: number,
    cr: number,
    ci: number,
    scale: number,
    maxIter: number,
    sliceAngle: number,
    refOrbits?: Float64Array | null,
    theme?: {
      precisionMode?: string;
      paletteA: [number, number, number];
      paletteB: [number, number, number];
      paletteC: [number, number, number];
      paletteD: [number, number, number];
    },
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
      size: 48, // 12 floats!
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    // [zr, zi, cr, ci, scale, aspect, maxIter, sliceAngle, use_perturbation, pad, pad, pad]
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
      0.0,
      0.0,
    ]);
    device.queue.writeBuffer(cameraTestBuffer, 0, cameraData);

    const entries: GPUBindGroupEntry[] = [
      { binding: 0, resource: { buffer: cameraTestBuffer } },
      { binding: 1, resource: { buffer: inputStorageBuffer } },
      { binding: 2, resource: { buffer: outputStorageBuffer } },
    ];

    let refOrbitsBuffer: GPUBuffer | null = null;
    if (refOrbits) {
      const refOrbitsF32 = new Float32Array(refOrbits);
      refOrbitsBuffer = device.createBuffer({
        size: refOrbitsF32.byteLength,
        usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
      });
      device.queue.writeBuffer(refOrbitsBuffer, 0, refOrbitsF32);
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

  // Render pipelines for Canvas
  let mathPipeline: GPURenderPipeline | null = null;
  let resolvePipeline: GPURenderPipeline | null = null;

  let uniformsBuffer: GPUBuffer | null = null;
  let mathBindGroup: GPUBindGroup | null = null;

  let gBufferTexture: GPUTexture | null = null;
  let resolveBindGroup0: GPUBindGroup | null = null;

  let paletteUniformsBuffer: GPUBuffer | null = null;
  let resolveBindGroup1: GPUBindGroup | null = null;

  // Track Math State correctly
  let needsMathUpdate = true;
  let lastCameraState = '';
  let lastThemeState = '';

  const initGBuffer = () => {
    if (!canvas || !resolvePipeline) return;

    if (gBufferTexture) {
      gBufferTexture.destroy();
    }

    gBufferTexture = device.createTexture({
      size: [canvas.width, canvas.height, 1],
      format: 'rgba32float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });

    resolveBindGroup0 = device.createBindGroup({
      layout: resolvePipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: gBufferTexture.createView() }],
    });

    needsMathUpdate = true;
  };

  let dummyRefOrbitsBuffer: GPUBuffer | null = null;
  if (canvas) {
    dummyRefOrbitsBuffer = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(dummyRefOrbitsBuffer, 0, new Float32Array([0.0, 0.0, 0.0, 0.0]));

    const mathModule = device.createShaderModule({ code: mathShaderCode });
    const resolveModule = device.createShaderModule({ code: resolveShaderCode });

    uniformsBuffer = device.createBuffer({
      size: 48, // 12 floats
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    paletteUniformsBuffer = device.createBuffer({
      size: 80, // 4 * vec4 (16 bytes each) = 64. plus max_iter float + 3 pads -> 80 bytes
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // Default 'neon' theme vectors.
    const paletteData = new Float32Array([
      0.5,
      0.5,
      0.5,
      0.0, // a
      0.5,
      0.5,
      0.5,
      0.0, // b
      1.0,
      1.0,
      1.0,
      0.0, // c
      0.0,
      0.33,
      0.67,
      0.0, // d
      100.0,
      0.0,
      0.0,
      0.0, // max_iter + padding
    ]);
    device.queue.writeBuffer(paletteUniformsBuffer, 0, paletteData);

    mathPipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: mathModule,
        entryPoint: 'vs_main',
      },
      fragment: {
        module: mathModule,
        entryPoint: 'fs_main',
        targets: [{ format: 'rgba32float' }],
      },
      primitive: {
        topology: 'triangle-list',
      },
    });

    mathBindGroup = device.createBindGroup({
      layout: mathPipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniformsBuffer } },
        { binding: 3, resource: { buffer: dummyRefOrbitsBuffer } },
      ],
    });

    resolvePipeline = device.createRenderPipeline({
      layout: 'auto',
      vertex: {
        module: resolveModule,
        entryPoint: 'vs_main',
      },
      fragment: {
        module: resolveModule,
        entryPoint: 'fs_main',
        targets: [{ format: canvasFormat }],
      },
      primitive: {
        topology: 'triangle-list',
      },
    });

    resolveBindGroup1 = device.createBindGroup({
      layout: resolvePipeline.getBindGroupLayout(1),
      entries: [{ binding: 0, resource: { buffer: paletteUniformsBuffer } }],
    });

    initGBuffer();
  }

  // Ref orbit tracking inside the engine
  let activeRefOrbitsBuffer: GPUBuffer | null = null;
  let hasValidActiveRefOrbits = false;

  const renderFrame = (
    zr: number,
    zi: number,
    cr: number,
    ci: number,
    scale: number,
    maxIter: number,
    sliceAngle: number,
    refOrbits?: Float64Array | null,
    theme?: {
      precisionMode?: string;
      paletteA: [number, number, number];
      paletteB: [number, number, number];
      paletteC: [number, number, number];
      paletteD: [number, number, number];
    },
  ) => {
    if (!context || !mathPipeline || !resolvePipeline || !gBufferTexture) return;

    const aspectRatio = canvas!.width / canvas!.height;

    let refOrbitsSwapped = false;
    if (refOrbits !== undefined) {
      if (refOrbits) {
        if (activeRefOrbitsBuffer) activeRefOrbitsBuffer.destroy();
        const refF32 = new Float32Array(refOrbits);
        activeRefOrbitsBuffer = device.createBuffer({
          size: refF32.byteLength,
          usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        device.queue.writeBuffer(activeRefOrbitsBuffer, 0, refF32);
        hasValidActiveRefOrbits = true;
        refOrbitsSwapped = true;
      } else if (hasValidActiveRefOrbits) {
        if (activeRefOrbitsBuffer) activeRefOrbitsBuffer.destroy();
        activeRefOrbitsBuffer = null;
        hasValidActiveRefOrbits = false;
        refOrbitsSwapped = true;
      }
    }

    if (refOrbitsSwapped) {
      mathBindGroup = device.createBindGroup({
        layout: mathPipeline.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: uniformsBuffer! } },
          {
            binding: 3,
            resource: {
              buffer: hasValidActiveRefOrbits ? activeRefOrbitsBuffer! : dummyRefOrbitsBuffer!,
            },
          },
        ],
      });
      needsMathUpdate = true;
    }

    let actualRefMaxIter = maxIter;
    if (hasValidActiveRefOrbits && refOrbits) {
      actualRefMaxIter = (refOrbits.length - 4) / 2;
    }

    let usePerturbationAllowed = true;
    if (theme && theme.precisionMode === 'f32') {
      usePerturbationAllowed = false;
    }
    const usePerturbation = hasValidActiveRefOrbits && usePerturbationAllowed ? 1.0 : 0.0;
    const camState = `${zr},${zi},${cr},${ci},${scale},${aspectRatio},${maxIter},${sliceAngle},${usePerturbation},${actualRefMaxIter}`;

    if (camState !== lastCameraState) {
      needsMathUpdate = true;
      lastCameraState = camState;

      const cameraData = new Float32Array([
        zr,
        zi,
        cr,
        ci,
        scale,
        aspectRatio,
        maxIter,
        sliceAngle,
        usePerturbation,
        actualRefMaxIter,
        0.0,
        0.0,
      ]);
      device.queue.writeBuffer(uniformsBuffer!, 0, cameraData);

      const paletteMaxIter = hasValidActiveRefOrbits ? actualRefMaxIter : maxIter;
      device.queue.writeBuffer(paletteUniformsBuffer!, 64, new Float32Array([paletteMaxIter]));
    }

    const themeString = theme
      ? JSON.stringify([theme.paletteA, theme.paletteB, theme.paletteC, theme.paletteD])
      : '';
    if (themeString !== lastThemeState && theme) {
      lastThemeState = themeString;
      const paletteData = new Float32Array([
        ...theme.paletteA,
        0.0,
        ...theme.paletteB,
        0.0,
        ...theme.paletteC,
        0.0,
        ...theme.paletteD,
        0.0,
      ]);
      device.queue.writeBuffer(paletteUniformsBuffer!, 0, paletteData);
    }

    const commandEncoder = device.createCommandEncoder();

    if (needsMathUpdate) {
      const mathPass = commandEncoder.beginRenderPass({
        colorAttachments: [
          {
            view: gBufferTexture.createView(),
            clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
            loadOp: 'clear',
            storeOp: 'store',
          },
        ],
      });
      mathPass.setPipeline(mathPipeline);
      mathPass.setBindGroup(0, mathBindGroup!);
      mathPass.draw(6);
      mathPass.end();

      needsMathUpdate = false;
    }

    const textureView = context.getCurrentTexture().createView();
    const resolvePass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: textureView,
          clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    resolvePass.setPipeline(resolvePipeline);
    resolvePass.setBindGroup(0, resolveBindGroup0!);
    resolvePass.setBindGroup(1, resolveBindGroup1!);
    resolvePass.draw(6);
    resolvePass.end();

    device.queue.submit([commandEncoder.finish()]);
  };

  const resize = () => {
    if (context && canvas) {
      context.configure({
        device,
        format: canvasFormat,
        alphaMode: 'opaque',
      });
      initGBuffer();
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
