import { NoteMapNode } from "./Node";
import { NoteMapEdge } from "./Edge";
import { NoteMapTable } from "./Table";

export interface NoteMapData {
  version: string;
  viewport: { x: number; y: number; zoom: number };
  nodes: any[];
  edges: any[];
  tables?: any[];
  metadata: {
    created: string;
    modified: string;
    tags: string[];
  };
}

export class NoteMap {
  nodes: NoteMapNode[] = [];
  edges: NoteMapEdge[] = [];
  tables: NoteMapTable[] = [];
  groups: string[] = [];
  metadata = {
    created: new Date().toISOString(),
    modified: new Date().toISOString(),
    tags: [] as string[],
  };

  addNode(node: NoteMapNode): void {
    this.nodes.push(node);
    this.metadata.modified = new Date().toISOString();
  }

  removeNode(nodeId: string): void {
    this.nodes = this.nodes.filter((n) => n.id !== nodeId);
    this.edges = this.edges.filter((e) => e.source.nodeId !== nodeId && e.target.nodeId !== nodeId);
    this.metadata.modified = new Date().toISOString();
  }

  addEdge(edge: NoteMapEdge): void {
    this.edges.push(edge);
    this.metadata.modified = new Date().toISOString();
  }

  removeEdge(edgeId: string): void {
    this.edges = this.edges.filter((e) => e.id !== edgeId);
    this.metadata.modified = new Date().toISOString();
  }

  getNodeById(id: string): NoteMapNode | undefined {
    return this.nodes.find((n) => n.id === id);
  }

  getEdgeById(id: string): NoteMapEdge | undefined {
    return this.edges.find((e) => e.id === id);
  }

  getEdgesForNode(nodeId: string): NoteMapEdge[] {
    return this.edges.filter((e) => e.source.nodeId === nodeId || e.target.nodeId === nodeId);
  }

  /** Check if an exact anchor-to-anchor connection already exists (either direction) */
  hasEdgeBetweenAnchors(nodeIdA: string, anchorIdA: string, nodeIdB: string, anchorIdB: string): boolean {
    return this.edges.some((e) =>
      (e.source.nodeId === nodeIdA && e.source.anchorId === anchorIdA &&
       e.target.nodeId === nodeIdB && e.target.anchorId === anchorIdB) ||
      (e.source.nodeId === nodeIdB && e.source.anchorId === anchorIdB &&
       e.target.nodeId === nodeIdA && e.target.anchorId === anchorIdA)
    );
  }

  getBoundingRect() {
    if (this.nodes.length === 0) return { x: 0, y: 0, width: 100, height: 100 };
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    for (const node of this.nodes) {
      minX = Math.min(minX, node.x);
      minY = Math.min(minY, node.y);
      maxX = Math.max(maxX, node.x + node.width);
      maxY = Math.max(maxY, node.y + node.height);
    }
    return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
  }

  toJSON(): NoteMapData {
    return {
      version: "1.0.0",
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: this.nodes.map((n) => n.toJSON()),
      edges: this.edges.map((e) => e.toJSON()),
      groups: this.groups,
      metadata: this.metadata,
    };
  }

  static fromJSON(data: NoteMapData): NoteMap {
    const map = new NoteMap();
    map.nodes = (data.nodes || []).map((n: any) => NoteMapNode.fromJSON(n));
    map.edges = (data.edges || []).map((e: any) => NoteMapEdge.fromJSON(e));
    map.groups = (data as any).groups || [];
    map.metadata = data.metadata || {
      created: new Date().toISOString(),
      modified: new Date().toISOString(),
      tags: [],
    };
    return map;
  }
}
