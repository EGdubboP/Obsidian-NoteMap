import { Viewport } from "../core/Viewport";

export class GridRenderer {
  private readonly smallGridSize = 20;
  private readonly largeGridSize = 100;

  render(ctx: CanvasRenderingContext2D, viewport: Viewport, width: number, height: number): void {
    const visibleRect = viewport.getVisibleRect(width, height);

    if (viewport.zoom > 0.15) {
      this.drawGrid(ctx, visibleRect, this.smallGridSize, "rgba(200, 200, 200, 0.15)");
    }
    if (viewport.zoom > 0.05) {
      this.drawGrid(ctx, visibleRect, this.largeGridSize, "rgba(160, 160, 160, 0.3)");
    }
  }

  private drawGrid(
    ctx: CanvasRenderingContext2D,
    visibleRect: { x: number; y: number; width: number; height: number },
    gridSize: number,
    color: string
  ): void {
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.beginPath();

    const startX = Math.floor(visibleRect.x / gridSize) * gridSize;
    const startY = Math.floor(visibleRect.y / gridSize) * gridSize;
    const endX = visibleRect.x + visibleRect.width;
    const endY = visibleRect.y + visibleRect.height;

    for (let x = startX; x <= endX; x += gridSize) {
      ctx.moveTo(x, visibleRect.y);
      ctx.lineTo(x, visibleRect.y + visibleRect.height);
    }
    for (let y = startY; y <= endY; y += gridSize) {
      ctx.moveTo(visibleRect.x, y);
      ctx.lineTo(visibleRect.x + visibleRect.width, y);
    }
    ctx.stroke();
  }
}
