import type { RenderFrameDescriptor } from './RenderFrameDescriptor';
import {
  META_STRIDE,
  FLOATS_PER_ITER,
  packCameraParams,
  packResolveUniforms,
} from './generated/MemoryLayout';

// ─── AccumulationPass ────────────────────────────────────────────────────────

export class AccumulationPass {
  private device: GPUDevice;
  private mathModule: GPUShaderModule;
  private pipelineCache: Map<string, GPUComputePipeline | Promise<GPUComputePipeline>>;
  public uniformsBuffer: GPUBuffer;
  private dummyRefOrbitsBuffer: GPUBuffer;

  constructor(device: GPUDevice, mathShaderCode: string) {
    this.device = device;
    this.mathModule = device.createShaderModule({ code: mathShaderCode });
    this.pipelineCache = new Map();

    this.uniformsBuffer = device.createBuffer({
      size: 96, // 24 floats × 4 bytes (CameraParams)
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.dummyRefOrbitsBuffer = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.dummyRefOrbitsBuffer, 0, new Float32Array([0.0, 0.0, 0.0, 0.0]));
  }

  public initBackgroundCache() {
    for (let exp = 1; exp <= 8; exp++) {
      for (const pert of [0.0, 1.0]) {
        for (const col of [0.0, 1.0, 2.0]) {
          this.getPipeline(exp, pert, col);
        }
      }
    }
  }

  public getPipeline(
    exponent: number,
    usePerturbation: number,
    coloringMode: number,
  ): GPUComputePipeline | null {
    const key = `${exponent}_${usePerturbation}_${coloringMode}`;
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
            0: exponent,
            1: usePerturbation,
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
    activeRefOrbitsBuffer: GPUBuffer | null,
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
            buffer: activeRefOrbitsBuffer ? activeRefOrbitsBuffer : this.dummyRefOrbitsBuffer,
          },
        },
        { binding: 4, resource: prevFrameView },
        { binding: 5, resource: { buffer: checkpointBuffer } },
        { binding: 6, resource: { buffer: completionFlagBuffer } },
        { binding: 7, resource: targetView },
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
    resolvePass.setPipeline(this.resolvePipeline);
    resolvePass.setBindGroup(0, bindGroup0);
    resolvePass.setBindGroup(1, this.bindGroup1);
    resolvePass.draw(6);
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

  private activeRefOrbitsBuffer: GPUBuffer | null = null;
  private hasValidActiveRefOrbits = false;
  private lastRefOrbits: Float64Array | null | undefined = undefined;

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
    if (desc.context.refOrbits !== undefined && desc.context.refOrbits !== this.lastRefOrbits) {
      if (desc.context.refOrbits) {
        if (this.activeRefOrbitsBuffer) this.activeRefOrbitsBuffer.destroy();
        this.activeRefOrbitsBuffer = this.device.createBuffer({
          size: desc.context.refOrbits.byteLength,
          usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(
          this.activeRefOrbitsBuffer,
          0,
          desc.context.refOrbits.buffer,
          desc.context.refOrbits.byteOffset,
          desc.context.refOrbits.byteLength,
        );
        this.hasValidActiveRefOrbits = true;
      } else if (this.hasValidActiveRefOrbits) {
        if (this.activeRefOrbitsBuffer) this.activeRefOrbitsBuffer.destroy();
        this.activeRefOrbitsBuffer = null;
        this.hasValidActiveRefOrbits = false;
      }
      this.lastRefOrbits = desc.context.refOrbits;
    }

    // ── Camera uniforms ──────────────────────────────────────────────────────
    // Written every frame — the RAF loop only calls render() when needed, so
    // we skip the camState string-diff and always upload the current values.
    const actualRefMaxIter =
      this.hasValidActiveRefOrbits && desc.context.refOrbits
        ? (desc.context.refOrbits.length - META_STRIDE) / FLOATS_PER_ITER
        : desc.context.computeMaxIter;
    const paletteMaxIter = this.hasValidActiveRefOrbits
      ? actualRefMaxIter
      : desc.context.computeMaxIter;

    const usePerturbationAllowed = desc.theme?.precisionMode !== 'f32';
    const usePerturbation = this.hasValidActiveRefOrbits && usePerturbationAllowed ? 1.0 : 0.0;

    const cameraData = packCameraParams({
      zr: desc.context.zr,
      zi: desc.context.zi,
      cr: desc.context.cr,
      ci: desc.context.ci,
      scale: desc.context.zoom,
      aspect: aspectRatio,
      compute_max_iter: desc.context.computeMaxIter,
      slice_angle: desc.context.sliceAngle,
      ref_max_iter: actualRefMaxIter,
      pad_c: 0.0,
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
        paletteData = new Float32Array(32);
        paletteData[12] = paletteMaxIter;
        paletteData[31] = desc.context.paletteMaxIter;
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
      64,
      new Float32Array([paletteMaxIter]).buffer as ArrayBuffer,
    );
    this.device.queue.writeBuffer(
      this.presentPass.paletteUniformsBuffer,
      124,
      new Float32Array([desc.context.paletteMaxIter]).buffer as ArrayBuffer,
    );

    // Write render_scale to its dedicated uniform buffer (group 0, binding 1 of the resolve pass).
    // This must be written every frame so the resolve shader always has the correct scale.
    this.device.queue.writeBuffer(
      this.presentPass.renderScaleBuffer,
      0,
      new Float32Array([desc.command.renderScale]).buffer as ArrayBuffer,
    );

    // ── GPU command submission ───────────────────────────────────────────────
    const commandEncoder = this.device.createCommandEncoder();

    const coloringModeConst =
      desc.theme?.coloringMode === 'stripe'
        ? 1.0
        : desc.theme?.coloringMode === 'banded'
          ? 2.0
          : 0.0;
    const accumPipeline = this.accumPass.getPipeline(
      desc.context.exponent,
      usePerturbation,
      coloringModeConst,
    );

    if (!accumPipeline) {
      // Pipeline is still compiling async, yield accumulation to prevent stutter
      const latestTex = this.pingPongTargetIsB ? this.gBufferTextureB : this.gBufferTextureA;
      const resolveBindGroup0 = this.presentPass.getBindGroup0(latestTex!.createView());
      this.presentPass.execute(commandEncoder, targetView, resolveBindGroup0);
      this.device.queue.submit([commandEncoder.finish()]);
      return;
    }

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
      this.activeRefOrbitsBuffer,
      readTex!.createView(),
      this.checkpointBuffer!,
      this.completionFlagBuffer!,
      writeTex!.createView(),
    );

    // Initialize completion flag to 1 (true) before the pass
    this.device.queue.writeBuffer(this.completionFlagBuffer!, 0, new Uint32Array([1]));

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
  }
}
