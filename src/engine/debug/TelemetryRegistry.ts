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

export class TelemetryRegistry {
  private static instance: TelemetryRegistry | null = null;

  private metrics = new Map<string, MetricDefinition>();
  private buffers = new Map<string, RingBuffer>();
  private emaValues = new Map<string, number>();

  private constructor() {}

  public static getInstance(): TelemetryRegistry {
    if (!TelemetryRegistry.instance) {
      TelemetryRegistry.instance = new TelemetryRegistry();
    }
    return TelemetryRegistry.instance;
  }

  // Necessary for isolating test environments since this acts as a global FSM
  public static resetInstanceForTesting(): void {
    TelemetryRegistry.instance = new TelemetryRegistry();
  }

  /**
   * Defines a metric and allocates its fixed-width RingBuffer for capturing.
   */
  public register(def: MetricDefinition, capacity: number = 600): void {
    if (!this.metrics.has(def.id)) {
      this.metrics.set(def.id, def);
      this.buffers.set(def.id, new RingBuffer(capacity));
      if (def.smoothingAlpha !== undefined) {
        this.emaValues.set(def.id, 0);
      }
    }
  }

  /**
   * The primary hot-path API. Must run extremely fast.
   */
  public push(id: string, value: number): void {
    const buffer = this.buffers.get(id);
    if (!buffer) return;

    buffer.push(value);

    // Track EMA inline if requested
    const def = this.metrics.get(id);
    if (def && typeof def.smoothingAlpha === 'number') {
      const currentEma = this.emaValues.get(id) ?? 0;
      if (currentEma === 0 && buffer.getCount() === 1) {
        // Seed the EMA directly on the very first frame
        this.emaValues.set(id, value);
      } else {
        const newEma = def.smoothingAlpha * value + (1 - def.smoothingAlpha) * currentEma;
        this.emaValues.set(id, newEma);
      }
    }
  }

  public getBuffer(id: string): RingBuffer | undefined {
    return this.buffers.get(id);
  }

  public getDefinition(id: string): MetricDefinition | undefined {
    return this.metrics.get(id);
  }

  public getLatest(id: string): number {
    const buffer = this.buffers.get(id);
    if (!buffer || buffer.getCount() === 0) return 0;

    // Reverse calculating the index of the last pushed item
    const idx = (buffer.getHeadIndex() - 1 + buffer.getCapacity()) % buffer.getCapacity();
    return buffer.getRawBuffer()[idx];
  }

  public getEma(id: string): number {
    return this.emaValues.get(id) ?? this.getLatest(id);
  }

  public getAllRegisteredIds(): string[] {
    return Array.from(this.metrics.keys());
  }
}
