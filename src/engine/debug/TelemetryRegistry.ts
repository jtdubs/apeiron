import { RingBuffer } from './RingBuffer';

export type SignalType = 'analog' | 'digital' | 'text' | 'enum';
export type RetentionPolicy = 'latch' | 'lapse';

export interface MetricDefinition {
  id: string;
  label: string;
  group: string;
  type: SignalType;
  retention: RetentionPolicy;
  lapseValue?: number; // e.g., 0 or NaN used when a 'lapse' metric is inactive
  /** Alpha factor for the Exponential Moving Average used in readable text overlays */
  smoothingAlpha?: number;
  minBound?: number;
  maxBound?: number;
  enumValues?: Record<number, string>;
}

export interface TelemetryChannel {
  /** High performance execution pipeline hook. Bypasses Maps and writes directly to Typed Arrays. */
  set: (value: number) => void;
}

interface InternalChannelData {
  buffer: RingBuffer;
  ema: number;
}

export class TelemetryRegistry {
  private static instance: TelemetryRegistry | null = null;

  private metrics = new Map<string, MetricDefinition>();
  private channels = new Map<string, InternalChannelData>();

  // High performance lockstep arrays
  private activeTransients = new Float64Array(256);
  private transientFlags = new Uint8Array(256);
  private lastLatchedValues = new Float64Array(256);

  private indexToDef = new Map<number, MetricDefinition>();
  private indexToInternal = new Map<number, InternalChannelData>();
  private idToIndex = new Map<string, number>();
  private nextIndex = 0;

  private constructor() {}

  public static getInstance(): TelemetryRegistry {
    if (!TelemetryRegistry.instance) {
      TelemetryRegistry.instance = new TelemetryRegistry();
    }
    return TelemetryRegistry.instance;
  }

  public static resetInstanceForTesting(): void {
    TelemetryRegistry.instance = new TelemetryRegistry();
  }

  /**
   * Defines a metric and returns a lightweight closure that writes directly to contiguous memory,
   * completely avoiding Map lookups on the hot path.
   */
  public register(def: MetricDefinition, capacity: number = 600): TelemetryChannel {
    if (this.metrics.has(def.id)) {
      const idx = this.idToIndex.get(def.id)!;
      return {
        set: (val: number) => {
          this.activeTransients[idx] = val;
          this.transientFlags[idx] = 1;
        },
      };
    }

    const index = this.nextIndex++;
    this.idToIndex.set(def.id, index);
    this.indexToDef.set(index, def);

    const internalData: InternalChannelData = { buffer: new RingBuffer(capacity), ema: 0 };

    this.metrics.set(def.id, def);
    this.channels.set(def.id, internalData);
    this.indexToInternal.set(index, internalData);

    if (def.retention === 'latch') {
      this.lastLatchedValues[index] = def.lapseValue ?? 0;
    }

    return {
      set: (val: number) => {
        this.activeTransients[index] = val;
        this.transientFlags[index] = 1;
      },
    };
  }

  /**
   * Legacy string-based setting just in case it's needed from slow paths.
   */
  public set(id: string, value: number): void {
    const idx = this.idToIndex.get(id);
    if (idx !== undefined) {
      this.activeTransients[idx] = value;
      this.transientFlags[idx] = 1;
    }
  }

  /**
   * Resets the transient bitmask at the start of the render frame loop.
   */
  public beginFrame(): void {
    this.transientFlags.fill(0);
  }

  /**
   * Explicit execution boundary. Unpacks active arrays into historical RingBuffers.
   */
  public commitFrame(): void {
    for (let i = 0; i < this.nextIndex; i++) {
      const def = this.indexToDef.get(i)!;
      const channel = this.indexToInternal.get(i)!;

      let valToWrite: number;
      const isTransientSet = this.transientFlags[i] === 1;

      if (isTransientSet) {
        valToWrite = this.activeTransients[i];
        if (def.retention === 'latch') {
          this.lastLatchedValues[i] = valToWrite;
        }
      } else {
        if (def.retention === 'latch') {
          const latchVal = this.lastLatchedValues[i];
          valToWrite = Number.isNaN(latchVal) ? (def.lapseValue ?? NaN) : latchVal;
        } else {
          valToWrite = def.lapseValue ?? NaN;
        }
      }

      channel.buffer.push(valToWrite);

      if (typeof def.smoothingAlpha === 'number' && !Number.isNaN(valToWrite)) {
        const cBuffer = channel.buffer;
        if (cBuffer.getCount() === 1) {
          channel.ema = valToWrite;
        } else {
          channel.ema = def.smoothingAlpha * valToWrite + (1 - def.smoothingAlpha) * channel.ema;
        }
      }
    }
  }

  public getBuffer(id: string): RingBuffer | undefined {
    return this.channels.get(id)?.buffer;
  }

  public getDefinition(id: string): MetricDefinition | undefined {
    return this.metrics.get(id);
  }

  public getLatest(id: string): number {
    const buffer = this.getBuffer(id);
    if (!buffer || buffer.getCount() === 0) return 0;

    const idx = (buffer.getHeadIndex() - 1 + buffer.getCapacity()) % buffer.getCapacity();
    return buffer.getRawBuffer()[idx];
  }

  public getEma(id: string): number {
    const channel = this.channels.get(id);
    if (channel && channel.buffer.getCount() > 0) {
      const def = this.metrics.get(id);
      if (def && typeof def.smoothingAlpha === 'number') {
        return channel.ema;
      }
    }
    return this.getLatest(id);
  }

  public getAllRegisteredIds(): string[] {
    return Array.from(this.metrics.keys());
  }
}
