import { NoteMapNode } from "../models/Node";
import { Viewport } from "../core/Viewport";
import { traceNodeShape } from "./ShapeUtils";

export class NodeRenderer {
  private imageCache = new Map<string, HTMLImageElement>();
  private imageLoadFailed = new Set<string>();

  /** Call this to set up image URL resolver (from Obsidian vault) */
  resolveImageUrl: ((path: string) => string | null) | null = null;

  private getImage(path: string): HTMLImageElement | null {
    if (this.imageLoadFailed.has(path)) return null;
    const cached = this.imageCache.get(path);
    if (cached) return cached;

    // Start loading
    const url = this.resolveImageUrl?.(path);
    if (!url) { this.imageLoadFailed.add(path); return null; }

    const img = new Image();
    img.src = url;
    img.onload = () => { this.imageCache.set(path, img); };
    img.onerror = () => { this.imageLoadFailed.add(path); };
    // Store immediately so we don't re-trigger loading
    this.imageCache.set(path, img);
    return null; // not ready yet, will render next frame
  }
  render(
    ctx: CanvasRenderingContext2D,
    node: NoteMapNode,
    viewport: Viewport,
    isSelected: boolean,
    isHovered = false,
    hoveredAnchorId: string | null = null,
    occupiedAnchors: Set<string> | null = null
  ): void {
    ctx.save();
    ctx.globalAlpha = node.style.opacity;

    // text-only: skip background and border
    if (node.mode !== "text-only") {
      if (node.style.shadow) {
        ctx.shadowColor = "rgba(0, 0, 0, 0.15)";
        ctx.shadowBlur = 8;
        ctx.shadowOffsetX = 2;
        ctx.shadowOffsetY = 2;
      }

      this.drawShape(ctx, node);

      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;

      this.drawBorder(ctx, node, isSelected);
    }

    this.drawContent(ctx, node, viewport.zoom);

    if (isSelected) {
      this.drawSelectionHandles(ctx, node);
    }

    // draw.io style: show anchor points on hover
    if (isHovered) {
      this.drawAnchorPoints(ctx, node, hoveredAnchorId, occupiedAnchors);
    }

    ctx.restore();
  }


  private drawShape(ctx: CanvasRenderingContext2D, node: NoteMapNode): void {
    ctx.fillStyle = node.style.fillColor;
    traceNodeShape(ctx, node);
    ctx.fill();
  }

  private drawBorder(ctx: CanvasRenderingContext2D, node: NoteMapNode, isSelected: boolean): void {
    const width = isSelected ? Math.max(node.style.borderWidth, 1) + 1 : node.style.borderWidth;
    if (width <= 0 && !isSelected) return;

    ctx.strokeStyle = isSelected ? "#3b82f6" : node.style.borderColor;
    ctx.lineWidth = width;

    if (node.style.borderStyle === "dashed") {
      ctx.setLineDash([8, 4]);
    } else if (node.style.borderStyle === "dotted") {
      ctx.setLineDash([2, 4]);
    } else {
      ctx.setLineDash([]);
    }

    traceNodeShape(ctx, node);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  private drawContent(ctx: CanvasRenderingContext2D, node: NoteMapNode, zoom: number): void {
    if (node.mode === "image") {
      this.drawImageContent(ctx, node);
      return;
    }

    if (zoom * 14 < 3) return;

    if (node.mode === "text-only") {
      this.drawTextOnlyContent(ctx, node);
    } else if (node.mode === "note-link") {
      this.drawNoteLinkContent(ctx, node);
    } else {
      this.drawTitleBodyContent(ctx, node);
    }
  }

  /** text-only mode: no background/border, auto-expand height to fit text */
  private drawTextOnlyContent(ctx: CanvasRenderingContext2D, node: NoteMapNode): void {
    if (!node.content.body) return;
    const ts = node.textStyle;
    const padX = 4;
    const padY = 4;
    const maxW = node.width - padX * 2;
    const fontSize = ts.bodySize;
    const lineSpacing = 1.3;
    const lineH = fontSize * lineSpacing;

    ctx.font = this.fontStr(fontSize, node, false);
    const lines = this.wrapTextFull(ctx, node.content.body, maxW);

    // Auto-expand node height to fit all lines
    const neededH = lines.length * lineH + padY * 2;
    if (neededH > node.height) {
      node.height = neededH;
    }

    let curY = node.y + padY + fontSize / 2;

    const bodyA = this.getAlignX(ts.bodyAlign, node.x, padX, node.width);
    ctx.fillStyle = ts.color;
    ctx.textAlign = bodyA.canvasAlign;
    ctx.textBaseline = "middle";

    for (const line of lines) {
      ctx.fillText(line, bodyA.x, curY, maxW);
      curY += lineH;
    }
  }

  private drawImageContent(ctx: CanvasRenderingContext2D, node: NoteMapNode): void {
    if (!node.content.imagePath) return;

    const img = this.getImage(node.content.imagePath);
    if (!img || !img.complete || img.naturalWidth === 0) return;

    const pad = 4;
    const x = node.x + pad;
    const y = node.y + pad;
    const w = node.width - pad * 2;
    const h = node.height - pad * 2;

    // Fit image preserving aspect ratio
    const imgRatio = img.naturalWidth / img.naturalHeight;
    const nodeRatio = w / h;

    let drawX: number, drawY: number, drawW: number, drawH: number;
    if (imgRatio > nodeRatio) {
      // Image wider — fit to width
      drawW = w;
      drawH = w / imgRatio;
      drawX = x;
      drawY = y + (h - drawH) / 2;
    } else {
      // Image taller — fit to height
      drawH = h;
      drawW = h * imgRatio;
      drawX = x + (w - drawW) / 2;
      drawY = y;
    }

    // Clip to node shape
    ctx.save();
    traceNodeShape(ctx, node);
    ctx.clip();
    ctx.drawImage(img, drawX, drawY, drawW, drawH);
    ctx.restore();
  }

  private fontStr(size: number, node: NoteMapNode, forTitle: boolean): string {
    const ts = node.textStyle;
    const italic = ts.italic ? "italic " : "";
    const bold = forTitle && ts.bold ? "bold " : (!forTitle ? "" : "");
    return `${italic}${bold}${size}px ${ts.fontFamily}`;
  }

  /** note-link mode: show note title centered */
  private drawNoteLinkContent(ctx: CanvasRenderingContext2D, node: NoteMapNode): void {
    const ts = node.textStyle;
    const cx = node.x + node.width / 2;
    const cy = node.y + node.height / 2;
    const maxW = node.width - 20;
    const displayTitle = node.content.linkedNote
      ? node.content.linkedNote.replace(/\.md$/, "").split("/").pop() || ""
      : node.content.title || "";

    if (!displayTitle) return;

    let fontSize = ts.titleSize;
    ctx.font = this.fontStr(fontSize, node, true);
    while (fontSize > 8 && ctx.measureText(displayTitle).width > maxW) {
      fontSize--;
      ctx.font = this.fontStr(fontSize, node, true);
    }

    ctx.fillStyle = ts.color;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(displayTitle, cx, cy, maxW);
  }

  private getAlignX(align: string, nodeX: number, padX: number, nodeW: number): { x: number; canvasAlign: CanvasTextAlign } {
    switch (align) {
      case "left": return { x: nodeX + padX, canvasAlign: "left" };
      case "right": return { x: nodeX + nodeW - padX, canvasAlign: "right" };
      default: return { x: nodeX + nodeW / 2, canvasAlign: "center" };
    }
  }

  /** content mode: title at top, body below, auto-expand height to fit */
  private drawTitleBodyContent(ctx: CanvasRenderingContext2D, node: NoteMapNode): void {
    const ts = node.textStyle;
    const padX = 12;
    const padY = 10;
    const maxW = node.width - padX * 2;
    const lineSpacing = 1.3;

    ctx.fillStyle = ts.color;

    const hasTitle = !!node.content.title;
    const hasBody = !!node.content.body;

    if (!hasTitle && !hasBody) return;

    const tFs = ts.titleSize;
    const bFs = ts.bodySize;
    const titleLineH = tFs * lineSpacing;
    const bodyLineH = bFs * lineSpacing;
    const gap = hasTitle && hasBody ? 6 : 0;

    ctx.font = this.fontStr(tFs, node, true);
    const titleLines = hasTitle ? this.wrapTextFull(ctx, node.content.title, maxW) : [];

    ctx.font = this.fontStr(bFs, node, false);
    const bodyLines = hasBody ? this.wrapTextFull(ctx, node.content.body, maxW) : [];

    const totalH = titleLines.length * titleLineH + gap + bodyLines.length * bodyLineH;
    const neededH = totalH + padY * 2;

    // Auto-expand node height
    if (neededH > node.height) {
      node.height = neededH;
    }

    let curY = node.y + padY + tFs / 2;

    // Draw title lines
    if (titleLines.length > 0) {
      const titleA = this.getAlignX(ts.titleAlign, node.x, padX, node.width);
      ctx.font = this.fontStr(tFs, node, true);
      ctx.fillStyle = ts.color;
      ctx.textAlign = titleA.canvasAlign;
      ctx.textBaseline = "middle";
      for (const line of titleLines) {
        ctx.fillText(line, titleA.x, curY, maxW);
        curY += titleLineH;
      }
      curY += gap;
    }

    // Draw body lines
    if (bodyLines.length > 0) {
      const bodyA = this.getAlignX(ts.bodyAlign, node.x, padX, node.width);
      ctx.font = this.fontStr(bFs, node, false);
      ctx.textAlign = bodyA.canvasAlign;
      for (const line of bodyLines) {
        ctx.fillText(line, bodyA.x, curY, maxW);
        curY += bodyLineH;
      }
    }
  }

  /** Wrap text into as many lines as needed (no max line limit) */
  /** Wrap text with character-level breaking for CJK and word-level for others */
  private wrapTextFull(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
    const allLines: string[] = [];
    const paragraphs = text.split("\n");
    for (const para of paragraphs) {
      if (!para) { allLines.push(""); continue; }

      // Character-by-character wrapping (handles Korean/CJK and long words)
      let currentLine = "";
      for (let i = 0; i < para.length; i++) {
        const ch = para[i];
        const testLine = currentLine + ch;
        if (ctx.measureText(testLine).width > maxWidth && currentLine) {
          allLines.push(currentLine);
          currentLine = ch;
        } else {
          currentLine = testLine;
        }
      }
      if (currentLine) allLines.push(currentLine);
    }
    return allLines;
  }

  private drawAnchorPoints(
    ctx: CanvasRenderingContext2D,
    node: NoteMapNode,
    hoveredAnchorId: string | null,
    occupiedAnchors: Set<string> | null
  ): void {
    const radius = 5;

    for (const anchor of node.anchors) {
      const pos = node.getAnchorWorldPosition(anchor.id);
      if (!pos) continue;

      const isOccupied = occupiedAnchors?.has(anchor.id) ?? false;
      const isActive = anchor.id === hoveredAnchorId;

      if (isOccupied) {
        // Occupied source anchor: show as red/gray X mark — not connectable
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = "rgba(120, 120, 120, 0.4)";
        ctx.fill();
        ctx.strokeStyle = "rgba(120, 120, 120, 0.6)";
        ctx.lineWidth = 1;
        ctx.stroke();

        // Small X
        const s = 3;
        ctx.strokeStyle = "rgba(200, 200, 200, 0.6)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(pos.x - s, pos.y - s);
        ctx.lineTo(pos.x + s, pos.y + s);
        ctx.moveTo(pos.x + s, pos.y - s);
        ctx.lineTo(pos.x - s, pos.y + s);
        ctx.stroke();
      } else {
        // Available anchor: blue dot, larger when hovered
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, isActive ? radius + 2 : radius, 0, Math.PI * 2);
        ctx.fillStyle = isActive ? "#3b82f6" : "rgba(59, 130, 246, 0.6)";
        ctx.fill();
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 1.5;
        ctx.stroke();
      }
    }
  }

  private drawSelectionHandles(ctx: CanvasRenderingContext2D, node: NoteMapNode): void {
    const handleSize = 6;
    const handles = [
      { x: node.x, y: node.y },
      { x: node.x + node.width, y: node.y },
      { x: node.x, y: node.y + node.height },
      { x: node.x + node.width, y: node.y + node.height },
    ];

    ctx.fillStyle = "#3b82f6";
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;

    for (const h of handles) {
      ctx.fillRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize);
      ctx.strokeRect(h.x - handleSize / 2, h.y - handleSize / 2, handleSize, handleSize);
    }
  }

  private truncateText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
    if (ctx.measureText(text).width <= maxWidth) return text;
    let truncated = text;
    while (truncated.length > 0 && ctx.measureText(truncated + "...").width > maxWidth) {
      truncated = truncated.slice(0, -1);
    }
    return truncated + "...";
  }

  private wrapText(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, maxLines: number): string[] {
    const words = text.split(" ");
    const lines: string[] = [];
    let currentLine = "";

    for (const word of words) {
      const testLine = currentLine ? currentLine + " " + word : word;
      if (ctx.measureText(testLine).width > maxWidth && currentLine) {
        lines.push(currentLine);
        currentLine = word;
        if (lines.length >= maxLines) {
          lines[lines.length - 1] = this.truncateText(ctx, lines[lines.length - 1], maxWidth);
          return lines;
        }
      } else {
        currentLine = testLine;
      }
    }
    if (currentLine) lines.push(currentLine);
    return lines.slice(0, maxLines);
  }
}
