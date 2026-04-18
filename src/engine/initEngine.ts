import type { RenderFrameDescriptor } from './RenderFrameDescriptor';
import { PassManager } from './PassManager';

export interface ApeironEngine {
  device: GPUDevice;
  adapter: GPUAdapter;
  context: GPUCanvasContext | null;

  renderFrame: (desc: RenderFrameDescriptor) => void;
  resize: () => void;
  getMathPassMs: () => number;
  isIterationTargetMet: () => boolean;
}

export async function initEngine(
  canvas?: HTMLCanvasElement,
  compiledMathShaderCode: string = '',
  resolveShaderCode: string = '',
): Promise<ApeironEngine> {
  if (!navigator.gpu) {
    throw new Error('WebGPU is not supported in this environment');
  }

  const adapter = await navigator.gpu.requestAdapter();
  if (!adapter) {
    throw new Error('Failed to acquire WebGPU adapter. Hardware may not support WebGPU.');
  }

  const requiredFeatures: GPUFeatureName[] = [];
  if (adapter.features.has('timestamp-query')) {
    requiredFeatures.push('timestamp-query');
  }

  const device = await adapter.requestDevice({
    requiredFeatures,
    requiredLimits: {
      maxStorageBufferBindingSize: adapter.limits.maxStorageBufferBindingSize,
      maxBufferSize: adapter.limits.maxBufferSize,
    },
  });

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
      compiledMathShaderCode,
      resolveShaderCode,
    );
  }

  const renderFrame = (desc: RenderFrameDescriptor) => {
    if (!context || !passManager || !canvas) return;
    passManager.render(context.getCurrentTexture().createView(), canvas.width, canvas.height, desc);
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

  const getMathPassMs = () => {
    return passManager ? passManager.lastMathPassMs : -1;
  };

  const isIterationTargetMet = () => {
    return passManager ? passManager.isIterationTargetMet : false;
  };

  return {
    device,
    adapter,
    context,

    renderFrame,
    resize,
    getMathPassMs,
    isIterationTargetMet,
  };
}
