import { Point } from "../core/Viewport";

export type EdgeType = "straight" | "bezier" | "orthogonal" | "elbow";
export type ArrowType = "none" | "start" | "end" | "both";

export interface EdgeStyle {
  color: string;
  width: number;
  arrow: ArrowType;
  lineStyle: "solid" | "dashed" | "dotted";
}

export interface EdgeEndpoint {
  nodeId: string;
  anchorId: string;
}

export const DEFAULT_EDGE_STYLE: EdgeStyle = {
  color: "#c1c1c1",
  width: 2,
  arrow: "none",
  lineStyle: "solid",
};

export class NoteMapEdge {
  id: string;
  type: EdgeType;
  source: EdgeEndpoint;
  target: EdgeEndpoint;
  controlPoints: Point[];
  style: EdgeStyle;
  label: string;

  constructor(id: string, source: EdgeEndpoint, target: EdgeEndpoint) {
    this.id = id;
    this.type = "straight";
    this.source = source;
    this.target = target;
    this.controlPoints = [];
    this.style = { ...DEFAULT_EDGE_STYLE };
    this.label = "";
  }

  toJSON() {
    return {
      id: this.id,
      type: this.type,
      source: this.source,
      target: this.target,
      controlPoints: this.controlPoints,
      style: this.style,
      label: this.label,
    };
  }

  static fromJSON(data: any): NoteMapEdge {
    const edge = new NoteMapEdge(data.id, data.source, data.target);
    edge.type = data.type || "straight";
    edge.controlPoints = data.controlPoints || [];
    edge.style = { ...DEFAULT_EDGE_STYLE, ...data.style };
    edge.label = data.label || "";
    return edge;
  }
}
