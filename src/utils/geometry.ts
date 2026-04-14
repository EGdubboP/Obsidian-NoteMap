import { Point, Rect } from "../core/Viewport";

export function distance(a: Point, b: Point): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function pointInRect(p: Point, r: Rect): boolean {
  return p.x >= r.x && p.x <= r.x + r.width && p.y >= r.y && p.y <= r.y + r.height;
}

export function rectsOverlap(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

export function rectContains(outer: Rect, inner: Rect): boolean {
  return (
    inner.x >= outer.x &&
    inner.y >= outer.y &&
    inner.x + inner.width <= outer.x + outer.width &&
    inner.y + inner.height <= outer.y + outer.height
  );
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function bezierPoint(t: number, p0: Point, p1: Point, p2: Point, p3: Point): Point {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;
  return {
    x: uuu * p0.x + 3 * uu * t * p1.x + 3 * u * tt * p2.x + ttt * p3.x,
    y: uuu * p0.y + 3 * uu * t * p1.y + 3 * u * tt * p2.y + ttt * p3.y,
  };
}

export function pointToLineDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return distance(p, a);
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / lenSq;
  t = clamp(t, 0, 1);
  return distance(p, { x: a.x + t * dx, y: a.y + t * dy });
}

// Spatial hash grid for performance optimization
export class SpatialGrid<T extends { x: number; y: number; width: number; height: number }> {
  private cellSize: number;
  private cells = new Map<string, T[]>();

  constructor(cellSize = 200) {
    this.cellSize = cellSize;
  }

  clear(): void {
    this.cells.clear();
  }

  insert(item: T): void {
    const minCX = Math.floor(item.x / this.cellSize);
    const minCY = Math.floor(item.y / this.cellSize);
    const maxCX = Math.floor((item.x + item.width) / this.cellSize);
    const maxCY = Math.floor((item.y + item.height) / this.cellSize);

    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cy = minCY; cy <= maxCY; cy++) {
        const key = `${cx},${cy}`;
        let cell = this.cells.get(key);
        if (!cell) {
          cell = [];
          this.cells.set(key, cell);
        }
        cell.push(item);
      }
    }
  }

  query(rect: Rect): T[] {
    const result = new Set<T>();
    const minCX = Math.floor(rect.x / this.cellSize);
    const minCY = Math.floor(rect.y / this.cellSize);
    const maxCX = Math.floor((rect.x + rect.width) / this.cellSize);
    const maxCY = Math.floor((rect.y + rect.height) / this.cellSize);

    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cy = minCY; cy <= maxCY; cy++) {
        const cell = this.cells.get(`${cx},${cy}`);
        if (cell) {
          for (const item of cell) {
            result.add(item);
          }
        }
      }
    }
    return Array.from(result);
  }

  rebuild(items: T[]): void {
    this.clear();
    for (const item of items) {
      this.insert(item);
    }
  }
}
