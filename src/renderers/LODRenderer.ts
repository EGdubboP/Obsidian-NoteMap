import { NoteMapNode } from "../models/Node";
import { Viewport } from "../core/Viewport";
import { traceNodeShape } from "./ShapeUtils";

export enum LODLevel {
  Dot = 0,       // < 0.05x: 색상 점만 표시
  Title = 1,     // 0.05x ~ 0.15x: 제목 + 색상 블록
  Summary = 2,   // 0.15x ~ 0.4x: 제목 + 요약 미리보기
  Full = 3,      // 0.4x ~ 1.0x: 전체 내용 표시
  Edit = 4,      // > 1.0x: 전체 + 편집 가능
}

export class LODRenderer {
  getLODLevel(zoom: number): LODLevel {
    if (zoom < 0.05) return LODLevel.Dot;
    if (zoom < 0.15) return LODLevel.Title;
    if (zoom < 0.4) return LODLevel.Summary;
    if (zoom < 1.0) return LODLevel.Full;
    return LODLevel.Edit;
  }

  renderNode(
    ctx: CanvasRenderingContext2D,
    node: NoteMapNode,
    viewport: Viewport,
    isSelected: boolean
  ): void {
    const level = this.getLODLevel(viewport.zoom);

    switch (level) {
      case LODLevel.Dot:
        this.renderDot(ctx, node, isSelected);
        break;
      case LODLevel.Title:
        this.renderTitleBlock(ctx, node, isSelected);
        break;
      case LODLevel.Summary:
        this.renderSummary(ctx, node, isSelected);
        break;
      case LODLevel.Full:
      case LODLevel.Edit:
        // Full rendering is handled by NodeRenderer
        break;
    }
  }

  shouldUseFullRenderer(zoom: number): boolean {
    return this.getLODLevel(zoom) >= LODLevel.Full;
  }

  private renderDot(ctx: CanvasRenderingContext2D, node: NoteMapNode, isSelected: boolean): void {
    const cx = node.x + node.width / 2;
    const cy = node.y + node.height / 2;
    const radius = Math.max(node.width, node.height) / 2;

    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.fillStyle = node.style.fillColor === "#ffffff" ? node.style.borderColor : node.style.fillColor;
    ctx.globalAlpha = node.style.opacity * 0.8;
    ctx.fill();

    if (isSelected) {
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 4;
      ctx.stroke();
    }

    ctx.globalAlpha = 1;
  }

  private renderTitleBlock(ctx: CanvasRenderingContext2D, node: NoteMapNode, isSelected: boolean): void {
    ctx.globalAlpha = node.style.opacity;

    // Fill — uses correct shape
    ctx.fillStyle = node.style.fillColor;
    traceNodeShape(ctx, node);
    ctx.fill();

    // Border — uses correct shape
    ctx.strokeStyle = isSelected ? "#3b82f6" : node.style.borderColor;
    ctx.lineWidth = isSelected ? 3 : node.style.borderWidth;
    traceNodeShape(ctx, node);
    ctx.stroke();

    // Title
    if (node.content.title) {
      const fontSize = 14;
      ctx.font = `bold ${fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
      ctx.fillStyle = "#000000";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      const cx = node.x + node.width / 2;
      const cy = node.y + node.height / 2;
      ctx.fillText(node.content.title, cx, cy, node.width - 10);
    }

    ctx.globalAlpha = 1;
  }

  private renderSummary(ctx: CanvasRenderingContext2D, node: NoteMapNode, isSelected: boolean): void {
    ctx.globalAlpha = node.style.opacity;

    // Shadow
    if (node.style.shadow) {
      ctx.shadowColor = "rgba(0, 0, 0, 0.1)";
      ctx.shadowBlur = 4;
      ctx.shadowOffsetX = 1;
      ctx.shadowOffsetY = 1;
    }

    // Fill — uses correct shape
    ctx.fillStyle = node.style.fillColor;
    traceNodeShape(ctx, node);
    ctx.fill();

    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    // Border — uses correct shape
    ctx.strokeStyle = isSelected ? "#3b82f6" : node.style.borderColor;
    ctx.lineWidth = isSelected ? 3 : node.style.borderWidth;
    traceNodeShape(ctx, node);
    ctx.stroke();

    // Title
    const cx = node.x + node.width / 2;
    let textY = node.y + 20;

    if (node.content.title) {
      ctx.font = "bold 13px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = "#000000";
      ctx.textAlign = "center";
      ctx.textBaseline = "top";
      ctx.fillText(node.content.title, cx, textY, node.width - 16);
      textY += 20;
    }

    // Summary (first 2 lines)
    if (node.content.body) {
      ctx.font = "11px -apple-system, BlinkMacSystemFont, sans-serif";
      ctx.fillStyle = "#000000";
      const lines = node.content.body.split("\n").slice(0, 2);
      for (const line of lines) {
        if (textY > node.y + node.height - 10) break;
        ctx.fillText(line.substring(0, 30), cx, textY, node.width - 16);
        textY += 14;
      }
    }

    ctx.globalAlpha = 1;
  }
}
