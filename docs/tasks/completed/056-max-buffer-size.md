---
status: closed
---

# Task 056: Fix WebGPU Storage Buffer Binding Size Limits on Fullscreen

## Objective

Fix a WebGPU initialization crashing error that occurs when rendering Apeiron in a high-resolution full screen window (e.g. 4K). The error `Binding size 236666880 of [Buffer] is larger than the maximum storage buffer binding size` is fixed by formally requesting `maxStorageBufferBindingSize` and `maxBufferSize` during `requestDevice()`.

## Relevant Design Docs

- [Apeiron Best Practices](../../process/best-practices.md) (Standard boundary/testing rules apply)

## Requirements

- **Limit Elevation:** The `initEngine.ts` adapter logic must request the hardware's maximum `maxStorageBufferBindingSize` and `maxBufferSize` when creating the GPUDevice.
- **Fail Gracefully:** If the hardware limit itself is too small to render at the chosen canvas size, the device logic must allow WebGPU to emit a descriptive error or clamp. But for hardware that _does_ support it (like standard modern GPUs running 4K), we must request the full capability.

## Implementation Plan

1. Modify `src/engine/initEngine.ts`.
2. Inside `adapter.requestDevice`, add `requiredLimits` corresponding to `maxStorageBufferBindingSize` and `maxBufferSize` from `adapter.limits`.

## Verification Steps

- [x] WebGPU limit instantiation is verified visually when entering full screen at UHD.
- [x] **Implementation standard:** Checked boundaries and verified it's isolated to environment setup.
- [x] **Documentation Sync:** Did this implementation drift from the original plan? No logical divergence.
