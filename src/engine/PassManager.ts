import type { RenderFrameDescriptor } from './RenderFrameDescriptor';
import { buildCameraUniforms, buildPaletteUniforms } from './uniforms';

// ─── AccumulationPass ────────────────────────────────────────────────────────

export class AccumulationPass {
  private device: GPUDevice;
  private mathPipeline: GPURenderPipeline;
  public uniformsBuffer: GPUBuffer;
  private dummyRefOrbitsBuffer: GPUBuffer;

  constructor(device: GPUDevice, mathShaderCode: string) {
    this.device = device;
    const mathModule = device.createShaderModule({ code: mathShaderCode });

    this.uniformsBuffer = device.createBuffer({
      size: 96, // 24 floats × 4 bytes (CameraParams)
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

    this.dummyRefOrbitsBuffer = device.createBuffer({
      size: 16,
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
    });
    device.queue.writeBuffer(this.dummyRefOrbitsBuffer, 0, new Float32Array([0.0, 0.0, 0.0, 0.0]));

    this.mathPipeline = device.createRenderPipeline({
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
  }

  public getBindGroup(
    activeRefOrbitsBuffer: GPUBuffer | null,
    prevFrameView: GPUTextureView,
    checkpointBuffer: GPUBuffer,
  ): GPUBindGroup {
    return this.device.createBindGroup({
      layout: this.mathPipeline.getBindGroupLayout(0),
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
      ],
    });
  }

  public execute(
    commandEncoder: GPUCommandEncoder,
    gBufferView: GPUTextureView,
    bindGroup: GPUBindGroup,
    renderWidth: number,
    renderHeight: number,
    queryActive?: boolean,
    querySet?: GPUQuerySet | null,
  ) {
    const mathPass = commandEncoder.beginRenderPass({
      colorAttachments: [
        {
          view: gBufferView,
          clearValue: { r: 0.0, g: 0.0, b: 0.0, a: 1.0 },
          loadOp: 'clear',
          storeOp: 'store',
        },
      ],
      ...(queryActive && querySet
        ? {
            timestampWrites: {
              querySet: querySet,
              beginningOfPassWriteIndex: 0,
              endOfPassWriteIndex: 1,
            },
          }
        : {}),
    } as GPURenderPassDescriptor);
    mathPass.setPipeline(this.mathPipeline);
    mathPass.setBindGroup(0, bindGroup);
    // Constrain rasterization to the DRS sub-rect. The resolve pass upscales
    // this region to fill the full canvas via the render_scale UV remap.
    mathPass.setViewport(0, 0, renderWidth, renderHeight, 0, 1);
    mathPass.setScissorRect(0, 0, renderWidth, renderHeight);
    mathPass.draw(6);
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

  public get lastMathPassMs(): number {
    return this._lastMathPassMs;
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
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    };

    this.gBufferTextureA = this.device.createTexture(desc);
    this.gBufferTextureB = this.device.createTexture(desc);

    if (this.checkpointBuffer) this.checkpointBuffer.destroy();
    this.checkpointBuffer = this.device.createBuffer({
      size: this.width * this.height * 32, // 32 bytes per pixel
      usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
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
    const renderWidth = Math.max(1, Math.floor(width * desc.renderScale));
    const renderHeight = Math.max(1, Math.floor(height * desc.renderScale));

    // ── Ref orbits ───────────────────────────────────────────────────────────
    if (desc.refOrbits !== undefined && desc.refOrbits !== this.lastRefOrbits) {
      if (desc.refOrbits) {
        if (this.activeRefOrbitsBuffer) this.activeRefOrbitsBuffer.destroy();
        this.activeRefOrbitsBuffer = this.device.createBuffer({
          size: desc.refOrbits.byteLength,
          usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(
          this.activeRefOrbitsBuffer,
          0,
          desc.refOrbits.buffer,
          desc.refOrbits.byteOffset,
          desc.refOrbits.byteLength,
        );
        this.hasValidActiveRefOrbits = true;
      } else if (this.hasValidActiveRefOrbits) {
        if (this.activeRefOrbitsBuffer) this.activeRefOrbitsBuffer.destroy();
        this.activeRefOrbitsBuffer = null;
        this.hasValidActiveRefOrbits = false;
      }
      this.lastRefOrbits = desc.refOrbits;
    }

    // ── Camera uniforms ──────────────────────────────────────────────────────
    // Written every frame — the RAF loop only calls render() when needed, so
    // we skip the camState string-diff and always upload the current values.
    const actualRefMaxIter =
      this.hasValidActiveRefOrbits && desc.refOrbits
        ? (desc.refOrbits.length - 8) / 136
        : desc.maxIter;
    const paletteMaxIter = this.hasValidActiveRefOrbits ? actualRefMaxIter : desc.maxIter;

    const cameraData = buildCameraUniforms(
      desc.zr,
      desc.zi,
      desc.cr,
      desc.ci,
      desc.zoom,
      aspectRatio,
      desc.maxIter,
      desc.sliceAngle,
      desc.exponent,
      desc.jitterX,
      desc.jitterY,
      desc.blendWeight,
      this.hasValidActiveRefOrbits,
      desc.refOrbits ? desc.refOrbits.length : undefined,
      desc.renderScale,
      desc.yieldIterLimit,
      desc.isResume,
      desc.isFinalSlice,
      width,
      desc.skipIter,
      desc.theme,
    );
    this.device.queue.writeBuffer(this.accumPass.uniformsBuffer, 0, cameraData);

    // ── Palette/resolve uniforms (only on theme change) ──────────────────────
    const themeVersion = desc.theme?.themeVersion ?? -1;
    if (themeVersion !== this.lastThemeVersion) {
      this.lastThemeVersion = themeVersion;
      const paletteData = buildPaletteUniforms(desc.theme, paletteMaxIter, desc.trueMaxIter);
      this.device.queue.writeBuffer(this.presentPass.paletteUniformsBuffer, 0, paletteData);
    }
    // Keep paletteMaxIter in sync even when theme version hasn't changed
    // (e.g. refOrbits length changed but theme stayed the same).
    this.device.queue.writeBuffer(
      this.presentPass.paletteUniformsBuffer,
      64,
      new Float32Array([paletteMaxIter]),
    );
    this.device.queue.writeBuffer(
      this.presentPass.paletteUniformsBuffer,
      124,
      new Float32Array([desc.trueMaxIter]),
    );

    // Write render_scale to its dedicated uniform buffer (group 0, binding 1 of the resolve pass).
    // This must be written every frame so the resolve shader always has the correct scale.
    this.device.queue.writeBuffer(
      this.presentPass.renderScaleBuffer,
      0,
      new Float32Array([desc.renderScale]),
    );

    // ── GPU command submission ───────────────────────────────────────────────
    const commandEncoder = this.device.createCommandEncoder();

    if (desc.clearCheckpoint && this.checkpointBuffer) {
      commandEncoder.clearBuffer(this.checkpointBuffer);
    }

    // Deno WebGPU stub or some browsers might report the feature but lack the function
    const queryActive = this.querySet !== null && this.isQueryReady;

    if (desc.advancePingPong) {
      this.pingPongTargetIsB = !this.pingPongTargetIsB;
    }
    const writeTex = this.pingPongTargetIsB ? this.gBufferTextureB : this.gBufferTextureA;
    const readTex = this.pingPongTargetIsB ? this.gBufferTextureA : this.gBufferTextureB;

    const accumBindGroup = this.accumPass.getBindGroup(
      this.activeRefOrbitsBuffer,
      readTex!.createView(),
      this.checkpointBuffer!,
    );
    this.accumPass.execute(
      commandEncoder,
      writeTex!.createView(),
      accumBindGroup,
      renderWidth,
      renderHeight,
      queryActive,
      this.querySet,
    );

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
  }
}
