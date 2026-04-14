import type { RenderState } from '../ui/stores/renderStore';
import { PassManager } from './PassManager';

export interface ApeironEngine {
  device: GPUDevice;
  adapter: GPUAdapter;
  context: GPUCanvasContext | null;

  renderFrame: (
    zr: number,
    zi: number,
    cr: number,
    ci: number,
    scale: number,
    maxIter: number,
    sliceAngle: number,
    exponent: number,
    interactionState: 'STATIC' | 'INTERACT_SAFE' | 'INTERACT_FAST',
    jitterX: number,
    jitterY: number,
    frameCount: number,
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

  let passManager: PassManager | null = null;

  if (canvas) {
    passManager = new PassManager(
      device,
      canvas.width,
      canvas.height,
      canvasFormat,
      mathShaderCode,
      resolveShaderCode,
    );
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
    interactionState: 'STATIC' | 'INTERACT_SAFE' | 'INTERACT_FAST',
    jitterX: number,
    jitterY: number,
    frameCount: number,
    refOrbits?: Float64Array | null,
    theme?: RenderState,
  ) => {
    if (!context || !passManager || !canvas) return;
    passManager.render(
      context.getCurrentTexture().createView(),
      canvas.width,
      canvas.height,
      zr,
      zi,
      cr,
      ci,
      scale,
      maxIter,
      sliceAngle,
      exponent,
      interactionState,
      jitterX,
      jitterY,
      frameCount,
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
        passManager.initGBuffer(canvas.width, canvas.height);
      }
    }
  };

  return {
    device,
    adapter,
    context,

    renderFrame,
    resize,
  };
}
