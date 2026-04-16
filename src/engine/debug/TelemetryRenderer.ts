import { TelemetryRegistry, type MetricDefinition } from './TelemetryRegistry';

const COLORS = [
  '#00ffcc', // teal
  '#ff00cc', // pink
  '#ccff00', // yellow-green
  '#00ccff', // sky blue
  '#ffcc00', // yellow-orange
  '#cc00ff', // purple
];

export interface IBufferSnapshot {
  rawBuffer: Float32Array | Float64Array;
  count: number;
  capacity: number;
  headIndex: number;
}

export class TelemetryRenderer {
  private ctx: CanvasRenderingContext2D;
  private width: number = 0;
  private height: number = 0;
  public laneHeight = 60;
  public headerHeight = 20;

  constructor(canvas: HTMLCanvasElement) {
    this.ctx = canvas.getContext('2d')!;
    this.resize(canvas.width, canvas.height);
  }

  public resize(width: number, height: number) {
    this.width = width;
    this.height = height;
    this.ctx.canvas.width = width;
    this.ctx.canvas.height = height;
  }

  public render(
    activeIds: string[],
    registry: TelemetryRegistry,
    zoomX: number = 1.0,
    panX: number = 0.0,
    frozenSnapshots: Map<string, IBufferSnapshot> | null = null,
    cursorX: number | null = null,
  ): Record<string, number> {
    this.ctx.clearRect(0, 0, this.width, this.height);

    if (activeIds.length === 0) return {};

    let globalCapacity = 600;
    const firstId = activeIds[0];
    if (frozenSnapshots && frozenSnapshots.has(firstId)) {
      globalCapacity = frozenSnapshots.get(firstId)!.capacity;
    } else {
      const liveBuffer = registry.getBuffer(firstId);
      if (liveBuffer) globalCapacity = liveBuffer.getCapacity();
    }

    this.drawGrid(zoomX, panX, Math.max(1, globalCapacity));

    const readouts: Record<string, number> = {};

    activeIds.forEach((id, index) => {
      const def = registry.getDefinition(id);
      if (!def) return;

      let bufferObj: IBufferSnapshot | undefined;

      if (frozenSnapshots && frozenSnapshots.has(id)) {
        bufferObj = frozenSnapshots.get(id);
      } else {
        const liveBuffer = registry.getBuffer(id);
        if (liveBuffer) {
          bufferObj = {
            rawBuffer: liveBuffer.getRawBuffer() as Float32Array | Float64Array,
            count: liveBuffer.getCount() as number,
            capacity: liveBuffer.getCapacity() as number,
            headIndex: liveBuffer.getHeadIndex(),
          };
        }
      }

      if (!bufferObj) return;

      const yOffset = index * this.laneHeight + this.headerHeight;
      const valAtCursor = this.renderLane(
        def,
        bufferObj,
        yOffset,
        this.laneHeight,
        zoomX,
        panX,
        index,
        cursorX,
      );
      if (valAtCursor !== null) {
        readouts[id] = valAtCursor;
      }
    });

    if (cursorX !== null) {
      this.drawCursor(cursorX);
    }

    return readouts;
  }

  private drawGrid(zoomX: number, panX: number, capacity: number) {
    this.ctx.save();

    this.ctx.fillStyle = '#111';
    this.ctx.fillRect(0, 0, this.width, this.headerHeight);
    this.ctx.strokeStyle = '#333';
    this.ctx.beginPath();
    this.ctx.moveTo(0, this.headerHeight);
    this.ctx.lineTo(this.width, this.headerHeight);
    this.ctx.stroke();

    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
    this.ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
    this.ctx.font = '10px monospace';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';
    this.ctx.lineWidth = 1;

    const intervals = 10;
    const maxPoints = Math.floor(capacity / zoomX);
    const startPointOffset = Math.floor(panX * (capacity - maxPoints));

    for (let i = 0; i <= intervals; i++) {
      const x = this.width - (i / intervals) * this.width;

      this.ctx.beginPath();
      this.ctx.moveTo(x, this.headerHeight);
      this.ctx.lineTo(x, this.height);
      this.ctx.stroke();

      const age = startPointOffset + Math.floor((i / intervals) * maxPoints);
      if (age > 0) {
        this.ctx.fillText(`-${age}f`, x, this.headerHeight / 2);
      } else {
        this.ctx.fillText(`HEAD`, x, this.headerHeight / 2);
      }
    }
    this.ctx.restore();
  }

  private drawCursor(cursorX: number) {
    this.ctx.save();
    this.ctx.strokeStyle = 'rgba(255, 200, 0, 0.8)';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(cursorX, 0);
    this.ctx.lineTo(cursorX, this.height);
    this.ctx.stroke();
    this.ctx.restore();
  }

  private drawEnumPacket(
    def: MetricDefinition,
    val: number,
    leftX: number,
    rightX: number,
    yOffset: number,
    height: number,
    colorIndex: number,
  ) {
    const paddingY = height * 0.15;
    const top = yOffset + paddingY;
    const bottom = yOffset + height - paddingY;
    const h = bottom - top;
    const w = rightX - leftX;

    if (w <= 0) return;

    this.ctx.save();
    this.ctx.strokeStyle = COLORS[colorIndex % COLORS.length];
    this.ctx.lineWidth = 1;

    this.ctx.beginPath();
    const chamfer = Math.min(Math.min(h * 0.2, w * 0.3), 4);
    if (w > 2 * chamfer) {
      this.ctx.moveTo(leftX, top + h / 2);
      this.ctx.lineTo(leftX + chamfer, top);
      this.ctx.lineTo(rightX - chamfer, top);
      this.ctx.lineTo(rightX, top + h / 2);
      this.ctx.lineTo(rightX - chamfer, bottom);
      this.ctx.lineTo(leftX + chamfer, bottom);
      this.ctx.closePath();
    } else {
      this.ctx.rect(leftX, top, w, h);
    }

    this.ctx.stroke();

    this.ctx.fillStyle = this.ctx.strokeStyle;
    this.ctx.globalAlpha = 0.2;
    this.ctx.fill();
    this.ctx.globalAlpha = 1.0;

    const label = def.enumValues ? (def.enumValues[val] ?? val.toString()) : val.toString();
    this.ctx.fillStyle = '#fff';
    this.ctx.font = '10px "Inter", sans-serif';
    this.ctx.textAlign = 'center';
    this.ctx.textBaseline = 'middle';

    const textWidth = this.ctx.measureText(label).width;
    if (w > textWidth + 8) {
      this.ctx.beginPath();
      this.ctx.rect(leftX, top, w, h);
      this.ctx.clip();
      this.ctx.fillText(label, leftX + w / 2, top + h / 2);
    }
    this.ctx.restore();
  }

  private renderLane(
    def: MetricDefinition,
    buf: IBufferSnapshot,
    yOffset: number,
    height: number,
    zoomX: number,
    panX: number,
    colorIndex: number,
    cursorX: number | null,
  ): number | null {
    if (buf.count === 0) return null;

    this.ctx.save();
    this.ctx.beginPath();
    this.ctx.rect(0, yOffset, this.width, height);
    this.ctx.clip();

    if (colorIndex % 2 === 0) {
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
      this.ctx.fillRect(0, yOffset, this.width, height);
    }

    this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
    this.ctx.lineWidth = 1;
    this.ctx.beginPath();
    this.ctx.moveTo(0, yOffset + height);
    this.ctx.lineTo(this.width, yOffset + height);
    this.ctx.stroke();

    const maxPoints = Math.max(1, Math.floor(buf.capacity / zoomX));
    const startPointOffset = Math.floor(panX * (buf.capacity - maxPoints));

    let min = def.minBound ?? 0;
    let max = def.maxBound ?? 1;

    if (def.type === 'analog' && def.maxBound === undefined) {
      min = Infinity;
      max = -Infinity;

      const pointsToScan = Math.min(buf.count, maxPoints);
      for (let i = 0; i < pointsToScan; i++) {
        const age = i + startPointOffset;
        if (age >= buf.count) break;
        const physicalIdx = (buf.headIndex - 1 - age + buf.capacity) % buf.capacity;
        const val = buf.rawBuffer[physicalIdx];
        if (val < min) min = val;
        if (val > max) max = val;
      }

      if (min === max) {
        min -= 1;
        max += 1;
      } else {
        const padding = (max - min) * 0.1;
        min -= padding;
        max += padding;
      }
    } else if (def.type === 'digital' || def.type === 'enum') {
      max = def.maxBound ?? 5;
      min = def.minBound ?? 0;
    }

    this.ctx.strokeStyle = COLORS[colorIndex % COLORS.length];
    this.ctx.lineWidth = 2;
    this.ctx.lineJoin = 'round';
    this.ctx.beginPath();

    const range = max - min;
    const paddingY = height * 0.15;
    const drawHeight = height - paddingY * 2;
    let valAtCursor: number | null = null;

    let enumVal: number | null = null;
    let enumStartX: number = this.width;
    let lastX: number = this.width;

    for (let i = 0; i < maxPoints; i++) {
      if (i >= buf.count) break;

      const age = i + startPointOffset;
      if (age >= buf.count) break;

      const physicalIdx = (buf.headIndex - 1 - age + buf.capacity) % buf.capacity;
      const val = buf.rawBuffer[physicalIdx];

      const x = this.width - (i / (maxPoints - 1)) * this.width;

      if (cursorX !== null && valAtCursor === null) {
        if (x <= cursorX) {
          valAtCursor = val;
        }
      }

      if (def.type === 'enum') {
        if (enumVal === null) {
          enumVal = val;
          enumStartX = x;
        } else if (enumVal !== val) {
          this.drawEnumPacket(def, enumVal, lastX, enumStartX, yOffset, height, colorIndex);
          enumVal = val;
          enumStartX = lastX;
        }
        lastX = x;
        continue;
      }

      let normalized = range === 0 ? 0.5 : (val - min) / range;
      normalized = Math.max(0, Math.min(1, normalized));
      const y = yOffset + height - paddingY - normalized * drawHeight;

      if (def.type === 'digital') {
        if (i === 0) {
          this.ctx.moveTo(x, y);
        } else {
          const lastValAgeMinus1PhysicalIdx =
            (buf.headIndex - 1 - (age - 1) + buf.capacity) % buf.capacity;
          const lastVal = buf.rawBuffer[lastValAgeMinus1PhysicalIdx];
          let lastNorm = range === 0 ? 0.5 : (lastVal - min) / range;
          lastNorm = Math.max(0, Math.min(1, lastNorm));
          const lastY = yOffset + height - paddingY - lastNorm * drawHeight;

          this.ctx.lineTo(x, lastY);
          this.ctx.lineTo(x, y);
        }
      } else {
        if (i === 0) {
          this.ctx.moveTo(x, y);
        } else {
          this.ctx.lineTo(x, y);
        }
      }
    }

    this.ctx.stroke();

    if (def.type === 'enum' && enumVal !== null) {
      this.drawEnumPacket(def, enumVal, lastX, enumStartX, yOffset, height, colorIndex);
    }

    if (def.type === 'digital') {
      this.ctx.fillStyle = this.ctx.strokeStyle;
      this.ctx.globalAlpha = 0.2;
      this.ctx.lineTo(0, yOffset + height);
      this.ctx.lineTo(this.width, yOffset + height);
      this.ctx.fill();
      this.ctx.globalAlpha = 1.0;
    }

    this.ctx.font = '10px "Inter", sans-serif';

    if (def.type === 'analog') {
      this.ctx.textAlign = 'right';
      this.ctx.fillStyle = 'rgba(255, 255, 255, 0.6)';
      this.ctx.fillText(max.toFixed(2), this.width - 10, yOffset + 10);
      this.ctx.textBaseline = 'bottom';
      this.ctx.fillText(min.toFixed(2), this.width - 10, yOffset + height - 10);
    }

    if (cursorX !== null && valAtCursor === null && buf.count > 0) {
      const phys = (buf.headIndex - 1 - startPointOffset + buf.capacity) % buf.capacity;
      valAtCursor = buf.rawBuffer[phys];
    }

    this.ctx.restore();
    return valAtCursor;
  }
}
