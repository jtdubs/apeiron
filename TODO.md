WebGPU Performance Tips

- Workgroup Tiling: Use @workgroup_size(16, 16) to process $256$ pixels at a time. This allows you to use Workgroup Shared Memory to cache the reference orbit data so you aren't hitting the Global Storage Buffer for every single iteration of every single pixel.
- Early Exit: Use workgroupBarrier() to check if all pixels in a tile have escaped. If they have, the entire workgroup can terminate early, saving massive amounts of power and time.

Overcoming FP32 Limits with "Float-Float"

- Even for the "low precision" perturbation, 32-bit floats will fail very quickly. You should implement Double-Single (DS) arithmetic in your WGSL code. This treats two f32 values as a single number to give you roughly 48 bits of significand.
