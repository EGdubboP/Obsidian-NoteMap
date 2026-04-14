import { Point } from "../core/Viewport";

export type NodeShape = "rectangle" | "circle" | "triangle";
export type NodeMode = "content" | "note-link" | "image" | "text-only";

export interface NodeStyle {
  fillColor: string;
  borderColor: string;
  borderWidth: number;
  borderStyle: "solid" | "dashed" | "dotted";
  opacity: number;
  shadow: boolean;
  cornerRadius: number;
}

export type TextAlign = "left" | "center" | "right";

export interface TextStyle {
  fontFamily: string;
  color: string;
  titleSize: number;
  bodySize: number;
  bold: boolean;
  italic: boolean;
  titleAlign: TextAlign;
  bodyAlign: TextAlign;
}

export const DEFAULT_TEXT_STYLE: TextStyle = {
  fontFamily: "-apple-system, BlinkMacSystemFont, sans-serif",
  color: "#d0d0d0",
  titleSize: 14,
  bodySize: 12,
  bold: true,
  italic: false,
  titleAlign: "center",
  bodyAlign: "center",
};

export interface NodeContent {
  title: string;
  body: string;
  linkedNote: string | null;
  imagePath: string | null;
}

export interface AnchorPoint {
  id: string;
  position: "top" | "bottom" | "left" | "right" | "custom";
  customOffset?: Point;
}

export const DEFAULT_NODE_STYLE: NodeStyle = {
  fillColor: "#131313",
  borderColor: "#d0d0d0",
  borderWidth: 1,
  borderStyle: "solid",
  opacity: 1,
  shadow: false,
  cornerRadius: 8,
};

export class NoteMapNode {
  id: string;
  shape: NodeShape;
  mode: NodeMode;
  x: number;
  y: number;
  width: number;
  height: number;
  style: NodeStyle;
  textStyle: TextStyle;
  content: NodeContent;
  group: string;
  anchors: AnchorPoint[];

  constructor(id: string, x: number, y: number, width = 200, height = 120) {
    this.id = id;
    this.shape = "rectangle";
    this.mode = "content";
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.style = { ...DEFAULT_NODE_STYLE };
    this.textStyle = { ...DEFAULT_TEXT_STYLE };
    this.content = { title: "", body: "", linkedNote: null, imagePath: null };
    this.group = "";
    this.anchors = NoteMapNode.createAnchors(id, this.shape);
  }

  updateAnchorsForShape(): void {
    this.anchors = NoteMapNode.createAnchors(this.id, this.shape);
  }

  static createAnchors(id: string, shape: NodeShape): AnchorPoint[] {
    if (shape === "triangle") {
      return [
        { id: `${id}-tri-left`, position: "custom", customOffset: undefined },
        { id: `${id}-tri-right`, position: "custom", customOffset: undefined },
        { id: `${id}-bottom`, position: "bottom" },
      ];
    }
    return [
      { id: `${id}-top`, position: "top" },
      { id: `${id}-bottom`, position: "bottom" },
      { id: `${id}-left`, position: "left" },
      { id: `${id}-right`, position: "right" },
    ];
  }

  containsPoint(px: number, py: number): boolean {
    return px >= this.x && px <= this.x + this.width && py >= this.y && py <= this.y + this.height;
  }

  getAnchorWorldPosition(anchorId: string): Point | null {
    const anchor = this.anchors.find((a) => a.id === anchorId);
    if (!anchor) return null;

    const cx = this.x + this.width / 2;
    const cy = this.y + this.height / 2;

    const pad = 8; // distance from edge

    // Triangle custom anchors
    if (anchorId.includes("-tri-left")) {
      return { x: this.x + this.width / 4 - pad, y: this.y + this.height / 2 };
    }
    if (anchorId.includes("-tri-right")) {
      return { x: this.x + this.width * 3 / 4 + pad, y: this.y + this.height / 2 };
    }

    switch (anchor.position) {
      case "top":
        return { x: cx, y: this.y - pad };
      case "bottom":
        return { x: cx, y: this.y + this.height + pad };
      case "left":
        return { x: this.x - pad, y: cy };
      case "right":
        return { x: this.x + this.width + pad, y: cy };
      case "custom":
        return anchor.customOffset
          ? { x: this.x + anchor.customOffset.x, y: this.y + anchor.customOffset.y }
          : { x: cx, y: cy };
    }
  }

  /** Anchor position on the shape edge (where the edge arrow touches) */
  getAnchorEdgePosition(anchorId: string): Point | null {
    const anchor = this.anchors.find((a) => a.id === anchorId);
    if (!anchor) return null;

    const cx = this.x + this.width / 2;
    const cy = this.y + this.height / 2;

    if (anchorId.includes("-tri-left")) {
      return { x: this.x + this.width / 4, y: this.y + this.height / 2 };
    }
    if (anchorId.includes("-tri-right")) {
      return { x: this.x + this.width * 3 / 4, y: this.y + this.height / 2 };
    }

    switch (anchor.position) {
      case "top": return { x: cx, y: this.y };
      case "bottom": return { x: cx, y: this.y + this.height };
      case "left": return { x: this.x, y: cy };
      case "right": return { x: this.x + this.width, y: cy };
      case "custom":
        return anchor.customOffset
          ? { x: this.x + anchor.customOffset.x, y: this.y + anchor.customOffset.y }
          : { x: cx, y: cy };
    }
  }

  getCenter(): Point {
    return { x: this.x + this.width / 2, y: this.y + this.height / 2 };
  }

  getNearestAnchor(px: number, py: number): AnchorPoint {
    let nearest = this.anchors[0];
    let minDist = Infinity;

    for (const anchor of this.anchors) {
      const pos = this.getAnchorWorldPosition(anchor.id);
      if (!pos) continue;
      const dist = Math.hypot(pos.x - px, pos.y - py);
      if (dist < minDist) {
        minDist = dist;
        nearest = anchor;
      }
    }
    return nearest;
  }

  getBounds() {
    return { x: this.x, y: this.y, width: this.width, height: this.height };
  }

  toJSON() {
    return {
      id: this.id,
      shape: this.shape,
      mode: this.mode,
      position: { x: this.x, y: this.y },
      size: { width: this.width, height: this.height },
      style: this.style,
      textStyle: this.textStyle,
      content: this.content,
      group: this.group,
    };
  }

  static fromJSON(data: any): NoteMapNode {
    const node = new NoteMapNode(data.id, data.position.x, data.position.y, data.size.width, data.size.height);
    node.shape = data.shape || "rectangle";
    node.mode = data.mode || "content";
    node.style = { ...DEFAULT_NODE_STYLE, ...data.style };
    node.textStyle = { ...DEFAULT_TEXT_STYLE, ...data.textStyle };
    node.content = { title: "", body: "", linkedNote: null, imagePath: null, ...data.content };
    node.group = data.group || "";
    node.updateAnchorsForShape();
    return node;
  }
}
