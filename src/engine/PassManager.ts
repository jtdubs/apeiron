import type { RenderState } from '../ui/stores/renderStore';

export class AccumulationPass {
  private device: GPUDevice;
  private mathPipeline: GPURenderPipeline;
  public uniformsBuffer: GPUBuffer;
  private dummyRefOrbitsBuffer: GPUBuffer;

  constructor(device: GPUDevice, mathShaderCode: string) {
    this.device = device;
    const mathModule = device.createShaderModule({ code: mathShaderCode });

    this.uniformsBuffer = device.createBuffer({
      size: 48, // 12 floats
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

  public getBindGroup(activeRefOrbitsBuffer: GPUBuffer | null): GPUBindGroup {
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
      ],
    });
  }

  public execute(
    commandEncoder: GPUCommandEncoder,
    gBufferView: GPUTextureView,
    bindGroup: GPUBindGroup,
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
    });
    mathPass.setPipeline(this.mathPipeline);
    mathPass.setBindGroup(0, bindGroup);
    mathPass.draw(6);
    mathPass.end();
  }
}

export class PresentationPass {
  private device: GPUDevice;
  private resolvePipeline: GPURenderPipeline;
  public paletteUniformsBuffer: GPUBuffer;
  private bindGroup1: GPUBindGroup;

  constructor(device: GPUDevice, resolveShaderCode: string, canvasFormat: GPUTextureFormat) {
    this.device = device;
    const resolveModule = device.createShaderModule({ code: resolveShaderCode });

    this.paletteUniformsBuffer = device.createBuffer({
      size: 128, // 32 floats
      usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
    });

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

  public getBindGroup0(gBufferView: GPUTextureView): GPUBindGroup {
    return this.device.createBindGroup({
      layout: this.resolvePipeline.getBindGroupLayout(0),
      entries: [{ binding: 0, resource: gBufferView }],
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

export class PassManager {
  private device: GPUDevice;
  private canvas: HTMLCanvasElement;

  private accumPass: AccumulationPass;
  private presentPass: PresentationPass;

  private gBufferTexture: GPUTexture | null = null;
  private resolveBindGroup0: GPUBindGroup | null = null;
  private currentBindGroup0: GPUBindGroup | null = null;
  private activeRefOrbitsBuffer: GPUBuffer | null = null;

  private needsMathUpdate = true;
  private lastCameraState = '';
  private lastThemeVersion = -1;
  private hasValidActiveRefOrbits = false;
  private lastRefOrbits: Float64Array | null | undefined = undefined;

  constructor(
    device: GPUDevice,
    canvas: HTMLCanvasElement,
    canvasFormat: GPUTextureFormat,
    mathShaderCode: string,
    resolveShaderCode: string,
  ) {
    this.device = device;
    this.canvas = canvas;

    this.accumPass = new AccumulationPass(device, mathShaderCode);
    this.presentPass = new PresentationPass(device, resolveShaderCode, canvasFormat);
    this.currentBindGroup0 = this.accumPass.getBindGroup(null);

    this.initGBuffer();
  }

  public initGBuffer() {
    if (this.gBufferTexture) {
      this.gBufferTexture.destroy();
    }

    this.gBufferTexture = this.device.createTexture({
      size: [this.canvas.width, this.canvas.height, 1],
      format: 'rgba32float',
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    });

    this.resolveBindGroup0 = this.presentPass.getBindGroup0(this.gBufferTexture.createView());
    this.needsMathUpdate = true;
  }

  public render(
    context: GPUCanvasContext,
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
  ) {
    if (!this.gBufferTexture || !this.resolveBindGroup0) return;

    const aspectRatio = this.canvas.width / this.canvas.height;

    let refOrbitsSwapped = false;
    if (refOrbits !== undefined && refOrbits !== this.lastRefOrbits) {
      if (refOrbits) {
        if (this.activeRefOrbitsBuffer) this.activeRefOrbitsBuffer.destroy();
        const refF32 = new Float32Array(refOrbits);
        this.activeRefOrbitsBuffer = this.device.createBuffer({
          size: refF32.byteLength,
          usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(this.activeRefOrbitsBuffer, 0, refF32);
        this.hasValidActiveRefOrbits = true;
        refOrbitsSwapped = true;
      } else if (this.hasValidActiveRefOrbits) {
        if (this.activeRefOrbitsBuffer) this.activeRefOrbitsBuffer.destroy();
        this.activeRefOrbitsBuffer = null;
        this.hasValidActiveRefOrbits = false;
        refOrbitsSwapped = true;
      }
      this.lastRefOrbits = refOrbits;
    }

    if (refOrbitsSwapped) {
      this.currentBindGroup0 = this.accumPass.getBindGroup(this.activeRefOrbitsBuffer);
      this.needsMathUpdate = true;
    }

    let actualRefMaxIter = maxIter;
    if (this.hasValidActiveRefOrbits && refOrbits) {
      actualRefMaxIter = (refOrbits.length - 4) / 2;
    }

    let usePerturbationAllowed = true;
    if (theme && theme.precisionMode === 'f32') {
      usePerturbationAllowed = false;
    }
    const usePerturbation = this.hasValidActiveRefOrbits && usePerturbationAllowed ? 1.0 : 0.0;
    const camState = `${zr},${zi},${cr},${ci},${scale},${aspectRatio},${maxIter},${sliceAngle},${usePerturbation},${actualRefMaxIter},${exponent}`;
    const paletteMaxIter = this.hasValidActiveRefOrbits ? actualRefMaxIter : maxIter;

    if (camState !== this.lastCameraState) {
      this.needsMathUpdate = true;
      this.lastCameraState = camState;

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
        exponent,
        theme?.coloringMode === 'stripe' ? 1.0 : theme?.coloringMode === 'banded' ? 2.0 : 0.0,
      ]);
      this.device.queue.writeBuffer(this.accumPass.uniformsBuffer, 0, cameraData);

      this.device.queue.writeBuffer(
        this.presentPass.paletteUniformsBuffer,
        64,
        new Float32Array([paletteMaxIter]),
      );
    }

    const themeVersion = theme?.themeVersion ?? -1;
    if (themeVersion !== this.lastThemeVersion && theme) {
      this.lastThemeVersion = themeVersion;
      let surfaceParamA = 1.0;
      let surfaceParamB = 1.0;
      if (theme.surfaceMode === 'soft-glow') {
        surfaceParamA = theme.glowFalloff ?? 20.0;
        surfaceParamB = theme.glowScatter ?? 1.0;
      } else if (theme.surfaceMode === 'contours') {
        surfaceParamA = theme.contourFrequency ?? 20.0;
        surfaceParamB = theme.contourThickness ?? 0.8;
      }

      const paletteData = new Float32Array([
        ...theme.paletteA,
        0.0, // pad
        ...theme.paletteB,
        0.0,
        ...theme.paletteC,
        0.0,
        ...theme.paletteD,
        0.0,
        paletteMaxIter, // properly populated during theme full-buffer rewrite
        theme.lightAzimuth,
        theme.lightElevation,
        theme.diffuse,
        theme.shininess,
        theme.heightScale,
        theme.ambient,
        theme.coloringMode === 'stripe' ? 1.0 : theme.coloringMode === 'banded' ? 2.0 : 0.0,
        theme.colorDensity ?? 3.0,
        theme.colorPhase ?? 0.0,
        theme.surfaceMode === 'off'
          ? 0.0
          : theme.surfaceMode === 'soft-glow'
            ? 2.0
            : theme.surfaceMode === 'contours'
              ? 3.0
              : 1.0,
        surfaceParamA,
        surfaceParamB,
        0.0, // pad
      ]);
      this.device.queue.writeBuffer(this.presentPass.paletteUniformsBuffer, 0, paletteData);
    }

    const commandEncoder = this.device.createCommandEncoder();

    if (this.needsMathUpdate && this.currentBindGroup0) {
      this.accumPass.execute(
        commandEncoder,
        this.gBufferTexture.createView(),
        this.currentBindGroup0,
      );
      this.needsMathUpdate = false;
    }

    const textureView = context.getCurrentTexture().createView();
    this.presentPass.execute(commandEncoder, textureView, this.resolveBindGroup0);

    this.device.queue.submit([commandEncoder.finish()]);
  }
}
