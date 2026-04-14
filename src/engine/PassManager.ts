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
      size: 64, // 16 floats
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

import { buildCameraUniforms, buildPaletteUniforms } from './uniforms';

export class PassManager {
  private device: GPUDevice;
  private width: number;
  private height: number;

  private accumPass: AccumulationPass;
  private presentPass: PresentationPass;

  private gBufferTextureA: GPUTexture | null = null;
  private gBufferTextureB: GPUTexture | null = null;
  private pingPongTargetIsB = false;

  private resolveBindGroup0: GPUBindGroup | null = null;
  private activeRefOrbitsBuffer: GPUBuffer | null = null;

  private needsMathUpdate = true;
  private lastCameraState = '';
  private lastThemeVersion = -1;
  private hasValidActiveRefOrbits = false;
  private lastRefOrbits: Float64Array | null | undefined = undefined;

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
    this.pingPongTargetIsB = false;

    this.needsMathUpdate = true;
  }

  public getActiveGBuffer(): GPUTexture | null {
    return this.pingPongTargetIsB ? this.gBufferTextureB : this.gBufferTextureA;
  }

  public render(
    targetView: GPUTextureView,
    width: number,
    height: number,
    zr: number,
    zi: number,
    cr: number,
    ci: number,
    scale: number,
    maxIter: number,
    sliceAngle: number,
    exponent: number,
    interactionState: 'STATIC' | 'INTERACT_SAFE' | 'INTERACT_FAST' = 'INTERACT_SAFE',
    jitterX: number = 0.0,
    jitterY: number = 0.0,
    frameCount: number = 1.0,
    refOrbits?: Float64Array | null,
    theme?: RenderState,
  ) {
    if (width !== this.width || height !== this.height) {
      this.initGBuffer(width, height);
    }
    if (!this.gBufferTextureA || !this.gBufferTextureB) return;

    const aspectRatio = width / height;

    let refOrbitsSwapped = false;
    if (refOrbits !== undefined && refOrbits !== this.lastRefOrbits) {
      if (refOrbits) {
        if (this.activeRefOrbitsBuffer) this.activeRefOrbitsBuffer.destroy();
        this.activeRefOrbitsBuffer = this.device.createBuffer({
          size: refOrbits.byteLength,
          usage: GPUBufferUsage.STORAGE | GPUBufferUsage.COPY_DST,
        });
        this.device.queue.writeBuffer(
          this.activeRefOrbitsBuffer,
          0,
          refOrbits.buffer,
          refOrbits.byteOffset,
          refOrbits.byteLength,
        );
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
      this.needsMathUpdate = true;
    }

    const actualRefMaxIter =
      this.hasValidActiveRefOrbits && refOrbits ? (refOrbits.length - 8) / 2 : maxIter;
    const paletteMaxIter = this.hasValidActiveRefOrbits ? actualRefMaxIter : maxIter;

    const usePerturbationAllowed = !(theme && theme.precisionMode === 'f32');
    const usePerturbation = this.hasValidActiveRefOrbits && usePerturbationAllowed ? 1.0 : 0.0;

    const camState = `${zr},${zi},${cr},${ci},${scale},${aspectRatio},${maxIter},${sliceAngle},${usePerturbation},${actualRefMaxIter},${exponent},${jitterX},${jitterY},${frameCount}`;

    if (camState !== this.lastCameraState) {
      this.needsMathUpdate = true;
      this.lastCameraState = camState;

      const cameraData = buildCameraUniforms(
        zr,
        zi,
        cr,
        ci,
        scale,
        aspectRatio,
        maxIter,
        sliceAngle,
        exponent,
        jitterX,
        jitterY,
        frameCount,
        this.hasValidActiveRefOrbits,
        refOrbits ? refOrbits.length : undefined,
        theme,
      );
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

      const paletteData = buildPaletteUniforms(theme, paletteMaxIter);
      this.device.queue.writeBuffer(this.presentPass.paletteUniformsBuffer, 0, paletteData);
    }

    const commandEncoder = this.device.createCommandEncoder();

    if (this.needsMathUpdate || interactionState === 'STATIC') {
      this.pingPongTargetIsB = !this.pingPongTargetIsB;
      const writeTex = this.pingPongTargetIsB ? this.gBufferTextureB : this.gBufferTextureA;
      const readTex = this.pingPongTargetIsB ? this.gBufferTextureA : this.gBufferTextureB;

      const currentBindGroup = this.accumPass.getBindGroup(
        this.activeRefOrbitsBuffer,
        readTex.createView(),
      );

      this.accumPass.execute(commandEncoder, writeTex.createView(), currentBindGroup);
      this.needsMathUpdate = false;
    }

    const latestTex = this.pingPongTargetIsB ? this.gBufferTextureB : this.gBufferTextureA;
    this.resolveBindGroup0 = this.presentPass.getBindGroup0(latestTex.createView());
    this.presentPass.execute(commandEncoder, targetView, this.resolveBindGroup0);

    this.device.queue.submit([commandEncoder.finish()]);
  }
}
