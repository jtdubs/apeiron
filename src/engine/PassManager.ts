import type { RenderFrameDescriptor } from './RenderFrameDescriptor';
import {
  ORBIT_STRIDE,
  CameraParams_SIZE,
  packCameraParams,
  packResolveUniforms,
  ReferenceOrbitNode_SIZE,
  OrbitMetadata_SIZE,
  BLANode_SIZE,
  DSBLANode_SIZE,
  BtaNode_SIZE,
  ResolveUniforms_SIZE,
  ResolveUniforms_BYTE_OFFSET_MAX_ITER,
  ResolveUniforms_BYTE_OFFSET_PALETTE_MAX_ITER,
} from './generated/MemoryLayout';

// ─── AccumulationPass ────────────────────────────────────────────────────────

export class AccumulationPass {
  private device: GPUDevice;
  private mathModule: GPUShaderModule;
  private pipelineCache: Map<string, GPUComputePipeline | Promise<GPUComputePipeline>>;
  public uniformsBuffer: GPUBuffer;
  private dummyRefOrbitNodesBuffer: GPUBuffer;
  private dummyRefBlaGridBuffer: GPUBuffer;
  private dummyRefBlaGridDsBuffer: GPUBuffer;
  private dummyRefBtaGridBuffer: GPUBuffer;
  private dummyRefMetadataBuffer: GPUBuffer;

  constructor(device: GPUDevice, mathShaderCode: string) {
    this.device = device;
    this.mathModule = device.createShaderModule({ code: mathShaderCode });
    this.pipelineCache = new Map();

    this.uniformsBuffer = device.createBuffer({
      size: CameraParams_SIZE * 4,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.dummyRefOrbitNodesBuffer = device.createBuffer({
      size: ReferenceOrbitNode_SIZE * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(
      this.dummyRefOrbitNodesBuffer,
      0,
      new Float32Array(ReferenceOrbitNode_SIZE),
    );

    this.dummyRefMetadataBuffer = device.createBuffer({
      size: OrbitMetadata_SIZE * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.dummyRefMetadataBuffer, 0, new Float32Array(OrbitMetadata_SIZE));

    this.dummyRefBlaGridBuffer = device.createBuffer({
      size: BLANode_SIZE * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.dummyRefBlaGridBuffer, 0, new Float32Array(BLANode_SIZE));

    this.dummyRefBlaGridDsBuffer = device.createBuffer({
      size: DSBLANode_SIZE * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.dummyRefBlaGridDsBuffer, 0, new Float32Array(DSBLANode_SIZE));

    this.dummyRefBtaGridBuffer = device.createBuffer({
      size: BtaNode_SIZE * 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.dummyRefBtaGridBuffer, 0, new Float32Array(BtaNode_SIZE));
  }

  public initBackgroundCache() {
    for (let exp = 0; exp <= 2; exp++) {
      for (const pert of [0.0, 1.0]) {
        for (const col of [0.0, 1.0, 2.0]) {
          this.getPipeline(exp, pert, col);
        }
      }
    }
  }

  public getPipeline(
    exponentBranchMode: number,
    mathComputeMode: number,
    coloringMode: number,
  ): GPUComputePipeline | null {
    const key = `${exponentBranchMode}_${mathComputeMode}_${coloringMode}`;
    const cached = this.pipelineCache.get(key);

    if (cached) {
      if (cached instanceof Promise) return null;
      return cached;
    }

    const promise = this.device
      .createComputePipelineAsync({
        layout: 'auto',
        compute: {
          module: this.mathModule,
          entryPoint: 'main_compute',
          constants: {
            0: exponentBranchMode,
            1: mathComputeMode,
            2: coloringMode,
          },
        },
      })
      .then((pipeline) => {
        this.pipelineCache.set(key, pipeline);
        return pipeline;
      })
      .catch((err) => {
        console.error('Pipeline compilation failed:', err);
        this.pipelineCache.delete(key);
        throw err;
      });

    this.pipelineCache.set(key, promise);
    return null;
  }

  public getBindGroup(
    pipeline: GPUComputePipeline,
    activeRefOrbitNodesBuffer: GPUBuffer | null,
    activeRefMetadataBuffer: GPUBuffer | null,

    activeRefBlaGridDsBuffer: GPUBuffer | null,
    activeRefBtaGridBuffer: GPUBuffer | null,
    glitchBuffer: GPUBuffer,
    prevFrameView: GPUTextureView,
    checkpointBuffer: GPUBuffer,
    completionFlagBuffer: GPUBuffer,
    targetView: GPUTextureView,
  ): GPUBindGroup {
    return this.device.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: this.uniformsBuffer } },
        {
          binding: 3,
          resource: {
            buffer: activeRefOrbitNodesBuffer
              ? activeRefOrbitNodesBuffer
              : this.dummyRefOrbitNodesBuffer,
          },
        },
        { binding: 4, resource: prevFrameView },
        { binding: 5, resource: { buffer: checkpointBuffer } },
        { binding: 6, resource: { buffer: completionFlagBuffer } },
        { binding: 7, resource: targetView },
        {
          binding: 8,
          resource: {
            buffer: activeRefMetadataBuffer ? activeRefMetadataBuffer : this.dummyRefMetadataBuffer,
          },
        },

        {
          binding: 10,
          resource: {
            buffer: activeRefBlaGridDsBuffer
              ? activeRefBlaGridDsBuffer
              : this.dummyRefBlaGridDsBuffer,
          },
        },
        {
          binding: 11,
          resource: {
            buffer: activeRefBtaGridBuffer ? activeRefBtaGridBuffer : this.dummyRefBtaGridBuffer,
          },
        },
        {
          binding: 12,
          resource: {
            buffer: glitchBuffer,
          },
        },
      ],
    });
  }

  public execute(
    commandEncoder: GPUCommandEncoder,
    pipeline: GPUComputePipeline,
    bindGroup: GPUBindGroup,
    renderWidth: number,
    renderHeight: number,
    queryActive?: boolean,
    querySet?: GPUQuerySet | null,
  ) {
    const mathPass = commandEncoder.beginComputePass({
      ...(queryActive && querySet
        ? {
            timestampWrites: {
              querySet: querySet,
              beginningOfPassWriteIndex: 0,
              endOfPassWriteIndex: 1,
            },
          }
        : {}),
    });
    mathPass.setPipeline(pipeline);
    mathPass.setBindGroup(0, bindGroup);
    mathPass.dispatchWorkgroups(Math.ceil(renderWidth / 16), Math.ceil(renderHeight / 16));
    mathPass.end();
  }
}

// ─── PresentationPass ────────────────────────────────────────────────────────

export class PresentationPass {
  private device: GPUDevice;
  private resolvePipeline: GPURenderPipeline;
  public paletteUniformsBuffer: GPUBuffer;
  /** Dedicated 16-byte uniform buffer for render_scale (group 0, binding 1 in the resolve shader). */
  public renderScaleBuffer: GPUBuffer;
  private bindGroup1: GPUBindGroup;

  constructor(device: GPUDevice, resolveShaderCode: string, canvasFormat: GPUTextureFormat) {
    this.device = device;
    const resolveModule = device.createShaderModule({ code: resolveShaderCode });

    this.paletteUniformsBuffer = device.createBuffer({
      size: 128, // 32 floats × 4 bytes (ResolveUniforms)
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    // 16-byte buffer (min uniform size) holding a single f32 render_scale at offset 0.
    // The resolve shader reads it via CameraScaleParams at @group(0) @binding(1).
    this.renderScaleBuffer = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });
    // Default: full resolution (STATIC).
    device.queue.writeBuffer(this.renderScaleBuffer, 0, new Float32Array([1.0, 0.0, 0.0, 0.0]));

    this.resolvePipeline = device.createRenderPipeline({
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

    this.bindGroup1 = device.createBindGroup({
      layout: this.resolvePipeline.getBindGroupLayout(1),
      entries: [{ binding: 0, resource: { buffer: this.paletteUniformsBuffer } }],
    });
  }

  /**
   * Build bind group 0 for the resolve pass.
   * Binding 0: G-buffer texture view.
   * Binding 1: renderScaleBuffer — a dedicated 16-byte uniform holding render_scale at offset 0.
   */
  public getBindGroup0(gBufferView: GPUTextureView): GPUBindGroup {
    return this.device.createBindGroup({
      layout: this.resolvePipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: gBufferView },
        { binding: 1, resource: { buffer: this.renderScaleBuffer } },
      ],
    });
  }

  public execute(
    commandEncoder: GPUCommandEncoder,
    targetView: GPUTextureView,
    bindGroup0: GPUBindGroup,
    skipDraw = false,
  ) {
    const resolvePass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: targetView,
          clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
    });
    if (!skipDraw) {
      resolvePass.setPipeline(this.resolvePipeline);
      resolvePass.setBindGroup(0, bindGroup0);
      resolvePass.setBindGroup(1, this.bindGroup1);
      resolvePass.draw(6);
    }
    resolvePass.end();
  }
}

// ─── PassManager ─────────────────────────────────────────────────────────────

export class PassManager {
  private device: GPUDevice;
  private width: number;
  private height: number;

  private accumPass: AccumulationPass;
  private presentPass: PresentationPass;

  private gBufferTextureA: GPUTexture | null = null;
  private gBufferTextureB: GPUTexture | null = null;
  private checkpointBuffer: GPUBuffer | null = null;
  private pingPongTargetIsB = false;

  private activeRefOrbitNodesBuffer: GPUBuffer | null = null;
  private activeRefMetadataBuffer: GPUBuffer | null = null;
  private activeRefBlaGridBuffer: GPUBuffer | null = null;
  private activeRefBlaGridDsBuffer: GPUBuffer | null = null;
  private activeRefBtaGridBuffer: GPUBuffer | null = null;
  private hasValidActiveRefOrbits = false;
  private lastRefOrbitNodes: Float64Array | null | undefined = undefined;

  // Version counters replace string-based diffing.
  // Incremented externally via invalidate() when a genuine re-render is needed.
  private lastThemeVersion = -1;

  private querySet: GPUQuerySet | null = null;
  private resolveBuffer: GPUBuffer | null = null;
  private stagingBuffer: GPUBuffer | null = null;
  private isQueryReady = true;
  private _lastMathPassMs = -1;

  private completionFlagBuffer: GPUBuffer | null = null;
  private completionStagingBuffer: GPUBuffer | null = null;
  private _isIterationTargetMet = false;
  private _isCompletionQueryPending = false;

  private glitchBuffer: GPUBuffer | null = null;
  private glitchStagingBuffer: GPUBuffer | null = null;
  private _isGlitchQueryPending = false;
  public onGlitchesDetected?: (glitches: { x: number; y: number }[]) => void;

  private _hasEverAccumulated = false;
  public latestMapPromise: Promise<void> | null = null;

  public get lastMathPassMs(): number {
    return this._lastMathPassMs;
  }

  public get isIterationTargetMet(): boolean {
    return this._isIterationTargetMet;
  }

  constructor(
    device: GPUDevice,
    width: number,
    height: number,
    canvasFormat: GPUTextureFormat,
    mathShaderCode: string,
    resolveShaderCode: string,
  ) {
    this.device = device;
    this.width = width;
    this.height = height;

    this.accumPass = new AccumulationPass(device, mathShaderCode);
    this.accumPass.initBackgroundCache();

    this.presentPass = new PresentationPass(device, resolveShaderCode, canvasFormat);

    if (device.features.has('timestamp-query')) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const isDeno = typeof (globalThis as any).Deno !== 'undefined';
      if (!isDeno) {
        try {
          this.querySet = device.createQuerySet({ type: 'timestamp', count: 2 });
          this.resolveBuffer = device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.QUERY_RESOLVE | GPUBufferUsage.COPY_SRC,
          });
          this.stagingBuffer = device.createBuffer({
            size: 16,
            usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
          });
        } catch (err) {
          console.warn('Failed to initialize timestamp query: ', err);
        }
      }
    }

    this.initGBuffer(this.width, this.height);
  }

  public initGBuffer(width: number, height: number) {
    this.width = width;
    this.height = height;

    if (this.gBufferTextureA) this.gBufferTextureA.destroy();
    if (this.gBufferTextureB) this.gBufferTextureB.destroy();

    const desc: GPUTextureDescriptor = {
      size: [this.width, this.height, 1],
      format: 'rgba32float',
      usage:
        GPUTextureUsage.RENDER_ATTACHMENT |
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.STORAGE_BINDING,
    };

    this.gBufferTextureA = this.device.createTexture(desc);
    this.gBufferTextureB = this.device.createTexture(desc);

    if (this.checkpointBuffer) this.checkpointBuffer.destroy();
    this.checkpointBuffer = this.device.createBuffer({
      size: this.width * this.height * 24, // 24 bytes per pixel
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });

    if (this.completionFlagBuffer) this.completionFlagBuffer.destroy();
    this.completionFlagBuffer = this.device.createBuffer({
      size: 4,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });

    if (this.completionStagingBuffer) this.completionStagingBuffer.destroy();
    this.completionStagingBuffer = this.device.createBuffer({
      size: 4,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    if (this.glitchBuffer) this.glitchBuffer.destroy();
    this.glitchBuffer = this.device.createBuffer({
      size: 516, // 4 bytes for count + 64 * 8 bytes for GlitchRecord
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST | GPUBufferUsage.COPY_SRC,
    });

    if (this.glitchStagingBuffer) this.glitchStagingBuffer.destroy();
    this.glitchStagingBuffer = this.device.createBuffer({
      size: 516,
      usage: GPUBufferUsage.MAP_READ | GPUBufferUsage.COPY_DST,
    });

    this.pingPongTargetIsB = false;
  }

  public getActiveGBuffer(): GPUTexture | null {
    return this.pingPongTargetIsB ? this.gBufferTextureB : this.gBufferTextureA;
  }

  /**
   * Render one frame using the provided descriptor.
   *
   * The descriptor is the single source of truth for everything the engine
   * needs to know about this frame. No string diffing, no implicit internal
   * state beyond the GPU buffers themselves.
   *
   * Callers (i.e. the RAF loop in ApeironViewport) are responsible for:
   *   - Computing blendWeight (0.0 = replace, 1/N for Nth accumulated frame)
   *   - Deciding whether to call render() at all (skip if nothing changed)
   *   - Resetting their accumulation counter on geometry/mode transitions
   */
  public render(
    targetView: GPUTextureView,
    width: number,
    height: number,
    desc: RenderFrameDescriptor,
  ) {
    if (!this.gBufferTextureA || !this.gBufferTextureB) return;

    const aspectRatio = width / height;
    const renderWidth = Math.max(1, Math.floor(width * desc.command.renderScale));
    const renderHeight = Math.max(1, Math.floor(height * desc.command.renderScale));

    // ── Ref orbits ───────────────────────────────────────────────────────────
    if (
      desc.context.refOrbitNodes !== undefined &&
      desc.context.refOrbitNodes !== this.lastRefOrbitNodes
    ) {
      if (desc.context.refOrbitNodes) {
        if (this.activeRefOrbitNodesBuffer) this.activeRefOrbitNodesBuffer.destroy();
        this.activeRefOrbitNodesBuffer = this.device.createBuffer({
          size: desc.context.refOrbitNodes.byteLength,
          usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(
          this.activeRefOrbitNodesBuffer,
          0,
          desc.context.refOrbitNodes.buffer,
          desc.context.refOrbitNodes.byteOffset,
          desc.context.refOrbitNodes.byteLength,
        );

        if (this.activeRefMetadataBuffer) this.activeRefMetadataBuffer.destroy();
        this.activeRefMetadataBuffer = this.device.createBuffer({
          size: desc.context.refMetadata!.byteLength,
          usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(
          this.activeRefMetadataBuffer,
          0,
          desc.context.refMetadata!.buffer,
          desc.context.refMetadata!.byteOffset,
          desc.context.refMetadata!.byteLength,
        );

        if (this.activeRefBlaGridDsBuffer) this.activeRefBlaGridDsBuffer.destroy();
        this.activeRefBlaGridDsBuffer = this.device.createBuffer({
          size: desc.context.refBlaGridDs!.byteLength,
          usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(
          this.activeRefBlaGridDsBuffer,
          0,
          desc.context.refBlaGridDs!.buffer,
          desc.context.refBlaGridDs!.byteOffset,
          desc.context.refBlaGridDs!.byteLength,
        );

        if (this.activeRefBtaGridBuffer) this.activeRefBtaGridBuffer.destroy();
        this.activeRefBtaGridBuffer = this.device.createBuffer({
          size: desc.context.refBtaGrid!.byteLength,
          usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(
          this.activeRefBtaGridBuffer,
          0,
          desc.context.refBtaGrid!.buffer,
          desc.context.refBtaGrid!.byteOffset,
          desc.context.refBtaGrid!.byteLength,
        );

        this.hasValidActiveRefOrbits = true;
      } else if (this.hasValidActiveRefOrbits) {
        if (this.activeRefOrbitNodesBuffer) this.activeRefOrbitNodesBuffer.destroy();
        this.activeRefOrbitNodesBuffer = null;
        if (this.activeRefMetadataBuffer) this.activeRefMetadataBuffer.destroy();
        this.activeRefMetadataBuffer = null;
        if (this.activeRefBlaGridBuffer) this.activeRefBlaGridBuffer.destroy();
        this.activeRefBlaGridBuffer = null;
        if (this.activeRefBlaGridDsBuffer) this.activeRefBlaGridDsBuffer.destroy();
        this.activeRefBlaGridDsBuffer = null;
        if (this.activeRefBtaGridBuffer) this.activeRefBtaGridBuffer.destroy();
        this.activeRefBtaGridBuffer = null;
        this.hasValidActiveRefOrbits = false;
      }
      this.lastRefOrbitNodes = desc.context.refOrbitNodes;
    }

    // ── Camera uniforms ──────────────────────────────────────────────────────
    // Written every frame — the RAF loop only calls render() when needed, so
    // we skip the camState string-diff and always upload the current values.
    const actualRefMaxIter =
      this.hasValidActiveRefOrbits && desc.context.refOrbitNodes
        ? desc.context.refOrbitNodes.length / ORBIT_STRIDE
        : desc.context.computeMaxIter;
    const paletteMaxIter = this.hasValidActiveRefOrbits
      ? actualRefMaxIter
      : desc.context.computeMaxIter;

    const mathComputeMode = desc.context.effectiveMathMode;

    const splitF64 = (a: number) => {
      const hi = Math.fround(a);
      const lo = Math.fround(a - hi);
      return [hi, lo];
    };

    // Split the f64 camera center to retain deep-zoom precision on the GPU
    const [dc_high_x, dc_low_x] = splitF64(desc.context.cr);
    const [dc_high_y, dc_low_y] = splitF64(desc.context.ci);

    const cameraData = packCameraParams({
      exponent: desc.context.exponent,
      zr: desc.context.zr,
      zi: desc.context.zi,
      cr: desc.context.cr,
      ci: desc.context.ci,
      dc_high_x,
      dc_high_y,
      dc_low_x,
      dc_low_y,
      scale: desc.context.zoom,
      aspect: aspectRatio,
      compute_max_iter: desc.context.computeMaxIter,
      slice_angle: desc.context.sliceAngle,
      ref_max_iter: actualRefMaxIter,
      jitter_x: desc.command.jitterX,
      jitter_y: desc.command.jitterY,
      blend_weight: desc.command.blendWeight,
      render_scale: desc.command.renderScale,
      step_limit: desc.command.stepLimit,
      load_checkpoint: desc.command.loadCheckpoint ? 1.0 : 0.0,
      debug_view_mode: desc.context.debugViewMode,
      canvas_width: width,
      skip_iter: desc.context.skipIter,
      drs_width: renderWidth,
      drs_height: renderHeight,
    });
    this.device.queue.writeBuffer(
      this.accumPass.uniformsBuffer,
      0,
      cameraData.buffer as ArrayBuffer,
    );

    // ── Palette/resolve uniforms (only on theme change) ──────────────────────
    const themeVersion = desc.theme?.themeVersion ?? -1;
    if (themeVersion !== this.lastThemeVersion) {
      this.lastThemeVersion = themeVersion;

      let paletteData: Float32Array;
      if (!desc.theme) {
        paletteData = new Float32Array(ResolveUniforms_SIZE);
        paletteData[ResolveUniforms_BYTE_OFFSET_MAX_ITER / 4] = paletteMaxIter;
        paletteData[ResolveUniforms_BYTE_OFFSET_PALETTE_MAX_ITER / 4] = desc.context.paletteMaxIter;
      } else {
        const t = desc.theme;
        let surfaceParamA = 1.0;
        let surfaceParamB = 1.0;
        if (t.surfaceMode === 'soft-glow') {
          surfaceParamA = t.glowFalloff ?? 20.0;
          surfaceParamB = t.glowScatter ?? 1.0;
        } else if (t.surfaceMode === 'contours') {
          surfaceParamA = t.contourFrequency ?? 20.0;
          surfaceParamB = t.contourThickness ?? 0.8;
        }

        paletteData = packResolveUniforms({
          a: [t.paletteA?.[0] ?? 0, t.paletteA?.[1] ?? 0, t.paletteA?.[2] ?? 0, 0.0],
          b: [t.paletteB?.[0] ?? 0, t.paletteB?.[1] ?? 0, t.paletteB?.[2] ?? 0, 0.0],
          c: [t.paletteC?.[0] ?? 0, t.paletteC?.[1] ?? 0, t.paletteC?.[2] ?? 0, 0.0],
          d: [t.paletteD?.[0] ?? 0, t.paletteD?.[1] ?? 0, t.paletteD?.[2] ?? 0, 0.0],
          max_iter: paletteMaxIter,
          light_azimuth: t.lightAzimuth ?? 0,
          light_elevation: t.lightElevation ?? 0,
          diffuse: t.diffuse ?? 0,
          shininess: t.shininess ?? 0,
          height_scale: t.heightScale ?? 0,
          ambient: t.ambient ?? 0,
          coloring_mode:
            t.coloringMode === 'stripe' ? 1.0 : t.coloringMode === 'banded' ? 2.0 : 0.0,
          color_density: t.colorDensity ?? 3.0,
          color_phase: t.colorPhase ?? 0.0,
          surface_mode:
            t.surfaceMode === 'off'
              ? 0.0
              : t.surfaceMode === 'soft-glow'
                ? 2.0
                : t.surfaceMode === 'contours'
                  ? 3.0
                  : 1.0,
          surface_param_a: surfaceParamA,
          surface_param_b: surfaceParamB,
          palette_max_iter: desc.context.paletteMaxIter,
        });
      }
      this.device.queue.writeBuffer(
        this.presentPass.paletteUniformsBuffer,
        0,
        paletteData.buffer as ArrayBuffer,
      );
    }
    // Keep paletteMaxIter in sync even when theme version hasn't changed
    // (e.g. refOrbits length changed but theme stayed the same).
    this.device.queue.writeBuffer(
      this.presentPass.paletteUniformsBuffer,
      ResolveUniforms_BYTE_OFFSET_MAX_ITER,
      new Float32Array([paletteMaxIter]).buffer as ArrayBuffer,
    );
    this.device.queue.writeBuffer(
      this.presentPass.paletteUniformsBuffer,
      ResolveUniforms_BYTE_OFFSET_PALETTE_MAX_ITER,
      new Float32Array([desc.context.paletteMaxIter]).buffer as ArrayBuffer,
    );

    // Write render_scale and debug_view_mode to its dedicated uniform buffer (group 0, binding 1 of the resolve pass).
    // This must be written every frame so the resolve shader always has the correct values.
    this.device.queue.writeBuffer(
      this.presentPass.renderScaleBuffer,
      0,
      new Float32Array([desc.command.renderScale, desc.context.debugViewMode, 0.0, 0.0])
        .buffer as ArrayBuffer,
    );

    // ── GPU command submission ───────────────────────────────────────────────
    const commandEncoder = this.device.createCommandEncoder();

    const coloringModeConst =
      desc.theme?.coloringMode === 'stripe'
        ? 1.0
        : desc.theme?.coloringMode === 'banded'
          ? 2.0
          : 0.0;
    let exponentBranchMode = 0.0;
    if (desc.context.exponent === 2.0) {
      exponentBranchMode = 1.0;
    } else if (Number.isInteger(desc.context.exponent) && desc.context.exponent > 1.0) {
      exponentBranchMode = 2.0;
    }
    const accumPipeline = this.accumPass.getPipeline(
      exponentBranchMode,
      mathComputeMode,
      coloringModeConst,
    );

    if (!accumPipeline) {
      // Pipeline is still compiling async, yield accumulation to prevent stutter
      const latestTex = this.pingPongTargetIsB ? this.gBufferTextureB : this.gBufferTextureA;
      const resolveBindGroup0 = this.presentPass.getBindGroup0(latestTex!.createView());
      this.presentPass.execute(
        commandEncoder,
        targetView,
        resolveBindGroup0,
        !this._hasEverAccumulated,
      );
      this.device.queue.submit([commandEncoder.finish()]);
      return;
    }

    this._hasEverAccumulated = true;

    if (desc.command.clearCheckpoint && this.checkpointBuffer) {
      commandEncoder.clearBuffer(this.checkpointBuffer);
      this._isIterationTargetMet = false;
    }

    // Deno WebGPU stub or some browsers might report the feature but lack the function
    const queryActive = this.querySet !== null && this.isQueryReady;

    if (desc.command.advancePingPong) {
      this.pingPongTargetIsB = !this.pingPongTargetIsB;
    }
    const writeTex = this.pingPongTargetIsB ? this.gBufferTextureB : this.gBufferTextureA;
    const readTex = this.pingPongTargetIsB ? this.gBufferTextureA : this.gBufferTextureB;

    const accumBindGroup = this.accumPass.getBindGroup(
      accumPipeline,
      this.activeRefOrbitNodesBuffer,
      this.activeRefMetadataBuffer,

      this.activeRefBlaGridDsBuffer,
      this.activeRefBtaGridBuffer,
      this.glitchBuffer!,
      readTex!.createView(),
      this.checkpointBuffer!,
      this.completionFlagBuffer!,
      writeTex!.createView(),
    );

    // Initialize completion flag to 1 (true) before the pass
    this.device.queue.writeBuffer(this.completionFlagBuffer!, 0, new Uint32Array([1]));
    // Clear the glitch readback count to 0. (offset 0, 4 bytes)
    this.device.queue.writeBuffer(this.glitchBuffer!, 0, new Uint32Array([0]));

    this.accumPass.execute(
      commandEncoder,
      accumPipeline,
      accumBindGroup,
      renderWidth,
      renderHeight,
      queryActive,
      this.querySet,
    );

    if (!this._isCompletionQueryPending) {
      commandEncoder.copyBufferToBuffer(
        this.completionFlagBuffer!,
        0,
        this.completionStagingBuffer!,
        0,
        4,
      );
    }
    if (!this._isGlitchQueryPending) {
      commandEncoder.copyBufferToBuffer(this.glitchBuffer!, 0, this.glitchStagingBuffer!, 0, 516);
    }

    if (queryActive) {
      commandEncoder.resolveQuerySet(this.querySet!, 0, 2, this.resolveBuffer!, 0);
      commandEncoder.copyBufferToBuffer(this.resolveBuffer!, 0, this.stagingBuffer!, 0, 16);
      this.isQueryReady = false;
    }

    // Resolve pass: bind group 0 uses the dedicated renderScaleBuffer at binding 1
    // so the resolve shader reads render_scale at offset 0 of that buffer.
    const latestTex = this.pingPongTargetIsB ? this.gBufferTextureB : this.gBufferTextureA;
    const resolveBindGroup0 = this.presentPass.getBindGroup0(latestTex!.createView());
    this.presentPass.execute(commandEncoder, targetView, resolveBindGroup0);

    this.device.queue.submit([commandEncoder.finish()]);

    if (queryActive) {
      this.device.queue
        .onSubmittedWorkDone()
        .then(() => {
          this.stagingBuffer!.mapAsync(GPUMapMode.READ)
            .then(() => {
              const arrayBuffer = this.stagingBuffer!.getMappedRange();
              const view = new BigInt64Array(arrayBuffer);
              const time = Number(view[1] - view[0]);
              this._lastMathPassMs = time / 1000000.0;
              this.stagingBuffer!.unmap();
              this.isQueryReady = true;
            })
            .catch(() => {
              this.isQueryReady = true;
            });
        })
        .catch(() => {
          this.isQueryReady = true;
        });
    }

    if (!this._isCompletionQueryPending) {
      this._isCompletionQueryPending = true;
      this.device.queue
        .onSubmittedWorkDone()
        .then(() => {
          if (this.completionStagingBuffer!.mapState === 'unmapped') {
            this.latestMapPromise = this.completionStagingBuffer!.mapAsync(GPUMapMode.READ)
              .then(() => {
                const arr = new Uint32Array(this.completionStagingBuffer!.getMappedRange());
                this._isIterationTargetMet = arr[0] === 1;
                this.completionStagingBuffer!.unmap();
                this._isCompletionQueryPending = false;
              })
              .catch(() => {
                this._isCompletionQueryPending = false;
              });
          } else {
            this._isCompletionQueryPending = false;
          }
        })
        .catch(() => {
          this._isCompletionQueryPending = false;
        });
    }

    if (!this._isGlitchQueryPending) {
      this._isGlitchQueryPending = true;
      this.device.queue
        .onSubmittedWorkDone()
        .then(() => {
          if (this.glitchStagingBuffer!.mapState === 'unmapped') {
            this.glitchStagingBuffer!.mapAsync(GPUMapMode.READ)
              .then(() => {
                const arr = new Uint32Array(this.glitchStagingBuffer!.getMappedRange());
                const count = Math.min(arr[0], 64);
                if (count > 0) {
                  const glitches: { x: number; y: number }[] = [];
                  for (let i = 0; i < count; i++) {
                    glitches.push({ x: arr[1 + i * 2], y: arr[2 + i * 2] });
                  }
                  if (this.onGlitchesDetected) {
                    this.onGlitchesDetected(glitches);
                  }
                }
                this.glitchStagingBuffer!.unmap();
                this._isGlitchQueryPending = false;
              })
              .catch(() => {
                this._isGlitchQueryPending = false;
              });
          } else {
            this._isGlitchQueryPending = false;
          }
        })
        .catch(() => {
          this._isGlitchQueryPending = false;
        });
    }
  }
}
