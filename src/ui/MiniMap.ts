import { Viewport } from "../core/Viewport";
import { NoteMap } from "../models/NoteMap";

export class MiniMap {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private isDragging = false;
  private width = 180;
  private height = 120;

  constructor(
    container: HTMLElement,
    private viewport: Viewport,
    private noteMap: NoteMap,
    private onNavigate: () => void
  ) {
    this.canvas = container.createEl("canvas", { cls: "notemap-minimap" });
    this.canvas.width = this.width;
    this.canvas.height = this.height;

    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("MiniMap: Failed to get canvas context");
    this.ctx = ctx;

    this.canvas.addEventListener("mousedown", this.onMouseDown);
    this.canvas.addEventListener("mousemove", this.onMouseMove);
    this.canvas.addEventListener("mouseup", this.onMouseUp);
    this.canvas.addEventListener("mouseleave", this.onMouseUp);
  }

  render(canvasWidth: number, canvasHeight: number): void {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);

    // Background
    ctx.fillStyle = "rgba(0, 0, 0, 0.05)";
    ctx.fillRect(0, 0, this.width, this.height);
    ctx.strokeStyle = "rgba(0, 0, 0, 0.15)";
    ctx.lineWidth = 1;
    ctx.strokeRect(0, 0, this.width, this.height);

    if (this.noteMap.nodes.length === 0) return;

    const bounds = this.noteMap.getBoundingRect();
    const padding = 20;
    const bx = bounds.x - padding;
    const by = bounds.y - padding;
    const bw = bounds.width + padding * 2;
    const bh = bounds.height + padding * 2;

    const scale = Math.min(this.width / bw, this.height / bh);
    const offsetX = (this.width - bw * scale) / 2;
    const offsetY = (this.height - bh * scale) / 2;

    // Nodes
    for (const node of this.noteMap.nodes) {
      const nx = (node.x - bx) * scale + offsetX;
      const ny = (node.y - by) * scale + offsetY;
      const nw = node.width * scale;
      const nh = node.height * scale;

      ctx.fillStyle = node.style.fillColor === "#ffffff" ? node.style.borderColor : node.style.fillColor;
      ctx.globalAlpha = 0.7;
      ctx.fillRect(nx, ny, Math.max(nw, 2), Math.max(nh, 2));
    }
    ctx.globalAlpha = 1;

    // Edges
    ctx.strokeStyle = "rgba(100, 100, 100, 0.3)";
    ctx.lineWidth = 0.5;
    for (const edge of this.noteMap.edges) {
      const sn = this.noteMap.getNodeById(edge.source.nodeId);
      const tn = this.noteMap.getNodeById(edge.target.nodeId);
      if (!sn || !tn) continue;

      const sx = (sn.x + sn.width / 2 - bx) * scale + offsetX;
      const sy = (sn.y + sn.height / 2 - by) * scale + offsetY;
      const tx = (tn.x + tn.width / 2 - bx) * scale + offsetX;
      const ty = (tn.y + tn.height / 2 - by) * scale + offsetY;

      ctx.beginPath();
      ctx.moveTo(sx, sy);
      ctx.lineTo(tx, ty);
      ctx.stroke();
    }

    // Viewport rect
    const visibleRect = this.viewport.getVisibleRect(canvasWidth, canvasHeight);
    const vx = (visibleRect.x - bx) * scale + offsetX;
    const vy = (visibleRect.y - by) * scale + offsetY;
    const vw = visibleRect.width * scale;
    const vh = visibleRect.height * scale;

    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(vx, vy, vw, vh);
    ctx.fillStyle = "rgba(59, 130, 246, 0.08)";
    ctx.fillRect(vx, vy, vw, vh);
  }

  destroy(): void {
    this.canvas.removeEventListener("mousedown", this.onMouseDown);
    this.canvas.removeEventListener("mousemove", this.onMouseMove);
    this.canvas.removeEventListener("mouseup", this.onMouseUp);
    this.canvas.removeEventListener("mouseleave", this.onMouseUp);
    this.canvas.remove();
  }

  private navigateTo(mx: number, my: number, canvasWidth: number, canvasHeight: number): void {
    if (this.noteMap.nodes.length === 0) return;

    const bounds = this.noteMap.getBoundingRect();
    const padding = 20;
    const bx = bounds.x - padding;
    const by = bounds.y - padding;
    const bw = bounds.width + padding * 2;
    const bh = bounds.height + padding * 2;

    const scale = Math.min(this.width / bw, this.height / bh);
    const offsetX = (this.width - bw * scale) / 2;
    const offsetY = (this.height - bh * scale) / 2;

    const worldX = (mx - offsetX) / scale + bx;
    const worldY = (my - offsetY) / scale + by;

    this.viewport.x = canvasWidth / 2 - worldX * this.viewport.zoom;
    this.viewport.y = canvasHeight / 2 - worldY * this.viewport.zoom;

    this.onNavigate();
  }

  private onMouseDown = (e: MouseEvent): void => {
    this.isDragging = true;
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const parent = this.canvas.parentElement;
    if (parent) {
      const pr = parent.getBoundingClientRect();
      this.navigateTo(mx, my, pr.width, pr.height);
    }
  };

  private onMouseMove = (e: MouseEvent): void => {
    if (!this.isDragging) return;
    const rect = this.canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const parent = this.canvas.parentElement;
    if (parent) {
      const pr = parent.getBoundingClientRect();
      this.navigateTo(mx, my, pr.width, pr.height);
    }
  };

  private onMouseUp = (): void => {
    this.isDragging = false;
  };
}
