import { RingBuffer } from './RingBuffer';

export type SignalType = 'analog' | 'digital' | 'text';

export interface MetricDefinition {
  id: string;
  label: string;
  group: string;
  type: SignalType;
  /** Alpha factor for the Exponential Moving Average used in readable text overlays */
  smoothingAlpha?: number;
  minBound?: number;
  maxBound?: number;
}

export interface TelemetryChannel {
  /** High performance execution pipeline push (modifies RingBuffer directly without map lookups) */
  push: (value: number) => void;
}

interface InternalChannelData {
  buffer: RingBuffer;
  push: (value: number) => void;
  getEma: () => number;
}

export class TelemetryRegistry {
  private static instance: TelemetryRegistry | null = null;

  private metrics = new Map<string, MetricDefinition>();
  private channels = new Map<string, InternalChannelData>();

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
   * Defines a metric and allocates its fixed-width RingBuffer.
   * Returns a lightweight TelemetryChannel struct containing a highly optimized closure that pushes raw data directly into the allocated memory.
   */
  public register(def: MetricDefinition, capacity: number = 600): TelemetryChannel {
    if (this.metrics.has(def.id)) {
      // Hot-reload failsafe. If system re-registers, return the exact same live closure hook
      return { push: this.channels.get(def.id)!.push };
    }

    const buffer = new RingBuffer(capacity);
    let ema = 0;

    const push = (value: number) => {
      buffer.push(value);
      if (typeof def.smoothingAlpha === 'number') {
        if (buffer.getCount() === 1) {
          ema = value;
        } else {
          ema = def.smoothingAlpha * value + (1 - def.smoothingAlpha) * ema;
        }
      }
    };

    this.metrics.set(def.id, def);
    this.channels.set(def.id, { buffer, push, getEma: () => ema });

    return { push };
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
        return channel.getEma();
      }
    }
    return this.getLatest(id);
  }

  public getAllRegisteredIds(): string[] {
    return Array.from(this.metrics.keys());
  }
}
