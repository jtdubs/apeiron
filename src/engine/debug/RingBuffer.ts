export class RingBuffer {
  private buffer: Float32Array;
  private capacity: number;
  private head: number = 0;
  private tail: number = 0;
  private count: number = 0;

  constructor(capacity: number) {
    this.capacity = capacity;
    this.buffer = new Float32Array(capacity);
  }

  public push(value: number): void {
    this.buffer[this.head] = value;
    this.head = (this.head + 1) % this.capacity;
    if (this.count < this.capacity) {
      this.count++;
    } else {
      this.tail = (this.tail + 1) % this.capacity;
    }
  }

  /**
   * Returns a copied array of the buffer's contents ordered historically from oldest to newest.
   * Useful for charting.
   */
  public toArray(): Float32Array {
    const result = new Float32Array(this.count);
    if (this.count === 0) return result;

    if (this.count < this.capacity) {
      result.set(this.buffer.subarray(0, this.count));
    } else {
      result.set(this.buffer.subarray(this.tail, this.capacity), 0);
      result.set(this.buffer.subarray(0, this.head), this.capacity - this.tail);
    }
    return result;
  }

  /**
   * Direct underlying access, required for high-performance direct reads
   * against the raw typed array.
   */
  public getRawBuffer(): Float32Array {
    return this.buffer;
  }

  public getHeadIndex(): number {
    return this.head;
  }

  public getTailIndex(): number {
    return this.tail;
  }

  public getCount(): number {
    return this.count;
  }

  public getCapacity(): number {
    return this.capacity;
  }
}
