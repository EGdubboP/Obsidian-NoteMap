export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export class Viewport {
  x = 0;
  y = 0;
  zoom = 1;

  readonly minZoom = 0.01;
  readonly maxZoom = 50;

  private animationId: number | null = null;

  screenToWorld(sx: number, sy: number): Point {
    return {
      x: (sx - this.x) / this.zoom,
      y: (sy - this.y) / this.zoom,
    };
  }

  worldToScreen(wx: number, wy: number): Point {
    return {
      x: wx * this.zoom + this.x,
      y: wy * this.zoom + this.y,
    };
  }

  pan(dx: number, dy: number): void {
    this.x += dx;
    this.y += dy;
  }

  zoomAt(factor: number, cx: number, cy: number): void {
    const newZoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.zoom * factor));
    const ratio = newZoom / this.zoom;
    this.x = cx - (cx - this.x) * ratio;
    this.y = cy - (cy - this.y) * ratio;
    this.zoom = newZoom;
  }

  setZoom(newZoom: number, cx: number, cy: number): void {
    const clamped = Math.max(this.minZoom, Math.min(this.maxZoom, newZoom));
    const ratio = clamped / this.zoom;
    this.x = cx - (cx - this.x) * ratio;
    this.y = cy - (cy - this.y) * ratio;
    this.zoom = clamped;
  }

  animateToFit(rect: Rect, canvasWidth: number, canvasHeight: number, onUpdate: () => void): void {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
    }

    const padding = 60;
    const targetZoom = Math.min(
      (canvasWidth - padding * 2) / rect.width,
      (canvasHeight - padding * 2) / rect.height,
      this.maxZoom
    );
    const targetX = canvasWidth / 2 - (rect.x + rect.width / 2) * targetZoom;
    const targetY = canvasHeight / 2 - (rect.y + rect.height / 2) * targetZoom;

    const startX = this.x;
    const startY = this.y;
    const startZoom = this.zoom;
    const startTime = performance.now();
    const duration = 300;

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const t = Math.min(elapsed / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3); // ease-out cubic

      this.x = startX + (targetX - startX) * ease;
      this.y = startY + (targetY - startY) * ease;
      this.zoom = startZoom + (targetZoom - startZoom) * ease;

      onUpdate();

      if (t < 1) {
        this.animationId = requestAnimationFrame(animate);
      } else {
        this.animationId = null;
      }
    };

    this.animationId = requestAnimationFrame(animate);
  }

  getVisibleRect(canvasWidth: number, canvasHeight: number): Rect {
    const topLeft = this.screenToWorld(0, 0);
    const bottomRight = this.screenToWorld(canvasWidth, canvasHeight);
    return {
      x: topLeft.x,
      y: topLeft.y,
      width: bottomRight.x - topLeft.x,
      height: bottomRight.y - topLeft.y,
    };
  }

  applyTransform(ctx: CanvasRenderingContext2D): void {
    ctx.setTransform(this.zoom, 0, 0, this.zoom, this.x, this.y);
  }
}
