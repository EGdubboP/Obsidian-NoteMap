import { NoteMapEdge } from "../models/Edge";
import { NoteMapNode } from "../models/Node";
import { Point } from "../core/Viewport";

type AnchorDirection = "top" | "bottom" | "left" | "right";

export class EdgeRenderer {
  render(
    ctx: CanvasRenderingContext2D,
    edge: NoteMapEdge,
    sourceNode: NoteMapNode,
    targetNode: NoteMapNode,
    isSelected: boolean
  ): void {
    // Use edge position (on the shape border) for drawing lines and arrows
    const sourcePos = sourceNode.getAnchorEdgePosition
      ? sourceNode.getAnchorEdgePosition(edge.source.anchorId)
      : sourceNode.getAnchorWorldPosition(edge.source.anchorId);
    const targetPos = targetNode.getAnchorEdgePosition
      ? targetNode.getAnchorEdgePosition(edge.target.anchorId)
      : targetNode.getAnchorWorldPosition(edge.target.anchorId);
    if (!sourcePos || !targetPos) return;

    ctx.save();
    ctx.strokeStyle = isSelected ? "#3b82f6" : edge.style.color;
    ctx.lineWidth = isSelected ? edge.style.width + 1 : edge.style.width;

    if (edge.style.lineStyle === "dashed") {
      ctx.setLineDash([8, 4]);
    } else if (edge.style.lineStyle === "dotted") {
      ctx.setLineDash([3, 4]);
    } else {
      ctx.setLineDash([]);
    }

    ctx.beginPath();

    switch (edge.type) {
      case "bezier":
        this.drawBezier(ctx, sourcePos, targetPos, edge.controlPoints);
        break;
      case "orthogonal":
      case "elbow":
        this.drawElbow(
          ctx, sourcePos, targetPos,
          this.getAnchorDirection(sourceNode, edge.source.anchorId),
          this.getAnchorDirection(targetNode, edge.target.anchorId)
        );
        break;
      default:
        ctx.moveTo(sourcePos.x, sourcePos.y);
        ctx.lineTo(targetPos.x, targetPos.y);
    }

    ctx.stroke();
    ctx.setLineDash([]);

    // Arrows
    const lastSegDir = this.getLastSegmentDirection(edge, sourcePos, targetPos, sourceNode, targetNode);
    const firstSegDir = this.getFirstSegmentDirection(edge, sourcePos, targetPos, sourceNode, targetNode);

    if (edge.style.arrow === "end" || edge.style.arrow === "both") {
      this.drawArrow(ctx, lastSegDir, targetPos, edge.style);
    }
    if (edge.style.arrow === "start" || edge.style.arrow === "both") {
      this.drawArrow(ctx, firstSegDir, sourcePos, edge.style);
    }

    if (edge.label) {
      this.drawLabel(ctx, edge.label, sourcePos, targetPos);
    }

    ctx.restore();
  }

  renderPreview(ctx: CanvasRenderingContext2D, from: Point, to: Point): void {
    ctx.save();
    ctx.strokeStyle = "#3b82f6";
    ctx.lineWidth = 2;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }

  private drawBezier(ctx: CanvasRenderingContext2D, from: Point, to: Point, controlPoints: Point[]): void {
    ctx.moveTo(from.x, from.y);
    if (controlPoints.length >= 2) {
      ctx.bezierCurveTo(controlPoints[0].x, controlPoints[0].y, controlPoints[1].x, controlPoints[1].y, to.x, to.y);
    } else {
      const mx = (from.x + to.x) / 2;
      const dx = to.x - from.x;
      const dy = to.y - from.y;
      const offset = Math.min(Math.abs(dx), Math.abs(dy)) * 0.5;
      ctx.bezierCurveTo(mx - offset, from.y, mx + offset, to.y, to.x, to.y);
    }
  }

  /**
   * Elbow edge: 90-degree routing that respects anchor directions.
   * Extends outward past the node bounding box, then connects with right-angle segments.
   */
  /**
   * Elbow edge: 90-degree routing that respects anchor directions.
   * Extends outward from each anchor, then connects with right-angle segments.
   */
  private drawElbow(
    ctx: CanvasRenderingContext2D,
    from: Point, to: Point,
    fromDir: AnchorDirection, toDir: AnchorDirection
  ): void {
    const margin = 30;
    const points = this.computeElbowPath(from, to, fromDir, toDir, margin);

    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
  }

  private computeElbowPath(
    from: Point, to: Point,
    fromDir: AnchorDirection, toDir: AnchorDirection,
    margin: number
  ): Point[] {
    const p1 = this.extendPoint(from, fromDir, margin);
    const p2 = this.extendPoint(to, toDir, margin);

    const isFromHorizontal = fromDir === "left" || fromDir === "right";
    const isToHorizontal = toDir === "left" || toDir === "right";

    // Both horizontal
    if (isFromHorizontal && isToHorizontal) {
      if ((fromDir === "right" && toDir === "left" && p1.x <= p2.x) ||
          (fromDir === "left" && toDir === "right" && p1.x >= p2.x)) {
        const midX = (p1.x + p2.x) / 2;
        return [from, p1, { x: midX, y: p1.y }, { x: midX, y: p2.y }, p2, to];
      }
      const midY = (p1.y + p2.y) / 2;
      return [from, p1, { x: p1.x, y: midY }, { x: p2.x, y: midY }, p2, to];
    }

    // Both vertical
    if (!isFromHorizontal && !isToHorizontal) {
      if ((fromDir === "bottom" && toDir === "top" && p1.y <= p2.y) ||
          (fromDir === "top" && toDir === "bottom" && p1.y >= p2.y)) {
        const midY = (p1.y + p2.y) / 2;
        return [from, p1, { x: p1.x, y: midY }, { x: p2.x, y: midY }, p2, to];
      }
      const midX = (p1.x + p2.x) / 2;
      return [from, p1, { x: midX, y: p1.y }, { x: midX, y: p2.y }, p2, to];
    }

    // One horizontal, one vertical
    if (isFromHorizontal && !isToHorizontal) {
      return [from, p1, { x: p2.x, y: p1.y }, p2, to];
    }
    return [from, p1, { x: p1.x, y: p2.y }, p2, to];
  }

  private extendPoint(p: Point, dir: AnchorDirection, dist: number): Point {
    switch (dir) {
      case "top":    return { x: p.x, y: p.y - dist };
      case "bottom": return { x: p.x, y: p.y + dist };
      case "left":   return { x: p.x - dist, y: p.y };
      case "right":  return { x: p.x + dist, y: p.y };
    }
  }

  private getAnchorDirection(node: NoteMapNode, anchorId: string): AnchorDirection {
    const anchor = node.anchors.find((a) => a.id === anchorId);
    if (!anchor) return "right";
    switch (anchor.position) {
      case "top": return "top";
      case "bottom": return "bottom";
      case "left": return "left";
      case "right": return "right";
      default: return "right";
    }
  }

  // Arrow direction helpers — need to know last/first segment direction for elbow
  private getLastSegmentDirection(
    edge: NoteMapEdge, from: Point, to: Point,
    sourceNode: NoteMapNode, targetNode: NoteMapNode
  ): Point {
    if (edge.type === "elbow") {
      const toDir = this.getAnchorDirection(targetNode, edge.target.anchorId);
      // Arrow points INTO the anchor, so reverse the extend direction
      switch (toDir) {
        case "top": return { x: 0, y: -1 };
        case "bottom": return { x: 0, y: 1 };
        case "left": return { x: -1, y: 0 };
        case "right": return { x: 1, y: 0 };
      }
    }
    if (edge.type === "orthogonal") {
      return { x: to.x > from.x ? 1 : -1, y: 0 };
    }
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len };
  }

  private getFirstSegmentDirection(
    edge: NoteMapEdge, from: Point, to: Point,
    sourceNode: NoteMapNode, targetNode: NoteMapNode
  ): Point {
    if (edge.type === "elbow") {
      const fromDir = this.getAnchorDirection(sourceNode, edge.source.anchorId);
      switch (fromDir) {
        case "top": return { x: 0, y: 1 };
        case "bottom": return { x: 0, y: -1 };
        case "left": return { x: 1, y: 0 };
        case "right": return { x: -1, y: 0 };
      }
    }
    const dx = from.x - to.x;
    const dy = from.y - to.y;
    const len = Math.hypot(dx, dy) || 1;
    return { x: dx / len, y: dy / len };
  }

  private drawArrow(ctx: CanvasRenderingContext2D, direction: Point, tip: Point, style: { color: string; width: number }): void {
    const arrowLength = 12;
    const arrowWidth = 6;
    const angle = Math.atan2(direction.y, direction.x);

    ctx.save();
    ctx.fillStyle = style.color;
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(
      tip.x - arrowLength * Math.cos(angle) + arrowWidth * Math.sin(angle),
      tip.y - arrowLength * Math.sin(angle) - arrowWidth * Math.cos(angle)
    );
    ctx.lineTo(
      tip.x - arrowLength * Math.cos(angle) - arrowWidth * Math.sin(angle),
      tip.y - arrowLength * Math.sin(angle) + arrowWidth * Math.cos(angle)
    );
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  private drawLabel(ctx: CanvasRenderingContext2D, label: string, from: Point, to: Point): void {
    const mx = (from.x + to.x) / 2;
    const my = (from.y + to.y) / 2;

    ctx.font = "12px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";

    const metrics = ctx.measureText(label);
    const padding = 4;
    ctx.fillStyle = "rgba(255, 255, 255, 0.9)";
    ctx.fillRect(mx - metrics.width / 2 - padding, my - 8 - padding, metrics.width + padding * 2, 16 + padding * 2);

    ctx.fillStyle = "#374151";
    ctx.fillText(label, mx, my);
  }
}
