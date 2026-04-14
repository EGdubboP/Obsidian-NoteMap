import { NoteMapNode } from "../models/Node";

/**
 * Shared shape path drawing utilities.
 * Creates the path on the context — caller is responsible for fill/stroke.
 */
export function traceNodeShape(ctx: CanvasRenderingContext2D, node: NoteMapNode): void {
  switch (node.shape) {
    case "circle":
      ctx.beginPath();
      ctx.ellipse(
        node.x + node.width / 2,
        node.y + node.height / 2,
        node.width / 2,
        node.height / 2,
        0, 0, Math.PI * 2
      );
      break;
    case "triangle":
      traceTriangle(ctx, node);
      break;
    case "rectangle":
    default:
      traceRoundedRect(ctx, node.x, node.y, node.width, node.height, node.style.cornerRadius);
      break;
  }
}

export function traceRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, w: number, h: number, r: number
): void {
  r = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

function traceTriangle(ctx: CanvasRenderingContext2D, node: NoteMapNode): void {
  ctx.beginPath();
  ctx.moveTo(node.x + node.width / 2, node.y);
  ctx.lineTo(node.x + node.width, node.y + node.height);
  ctx.lineTo(node.x, node.y + node.height);
  ctx.closePath();
}

