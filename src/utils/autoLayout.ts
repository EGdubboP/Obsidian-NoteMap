import { NoteMap } from "../models/NoteMap";
import { NoteMapNode } from "../models/Node";

interface LayoutNode {
  id: string;
  children: string[];
  parents: string[];
  depth: number;
  order: number;
}

export type LayoutDirection = "top-down" | "left-right";

export function autoLayout(noteMap: NoteMap, direction: LayoutDirection = "top-down"): void {
  if (noteMap.nodes.length === 0) return;

  // Build adjacency
  const graph = new Map<string, LayoutNode>();
  for (const node of noteMap.nodes) {
    graph.set(node.id, { id: node.id, children: [], parents: [], depth: -1, order: 0 });
  }

  for (const edge of noteMap.edges) {
    const src = graph.get(edge.source.nodeId);
    const tgt = graph.get(edge.target.nodeId);
    if (src && tgt) {
      src.children.push(tgt.id);
      tgt.parents.push(src.id);
    }
  }

  // Find roots (no parents)
  const roots: string[] = [];
  for (const [id, ln] of graph) {
    if (ln.parents.length === 0) roots.push(id);
  }

  // If no clear roots, use all nodes
  if (roots.length === 0) {
    simpleGridLayout(noteMap, direction);
    return;
  }

  // BFS to assign depths
  const queue = [...roots];
  for (const r of roots) {
    graph.get(r)!.depth = 0;
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    const ln = graph.get(current)!;
    for (const childId of ln.children) {
      const child = graph.get(childId)!;
      if (child.depth < ln.depth + 1) {
        child.depth = ln.depth + 1;
        queue.push(childId);
      }
    }
  }

  // Assign depths to unvisited nodes
  for (const [, ln] of graph) {
    if (ln.depth === -1) ln.depth = 0;
  }

  // Group by depth
  const levels = new Map<number, string[]>();
  for (const [id, ln] of graph) {
    if (!levels.has(ln.depth)) levels.set(ln.depth, []);
    levels.get(ln.depth)!.push(id);
  }

  // Layout
  const hSpacing = 280;
  const vSpacing = 160;

  for (const [depth, nodeIds] of levels) {
    nodeIds.forEach((nodeId, index) => {
      const node = noteMap.getNodeById(nodeId);
      if (!node) return;

      const totalWidth = nodeIds.length * hSpacing;
      const startOffset = -totalWidth / 2 + hSpacing / 2;

      if (direction === "top-down") {
        node.x = startOffset + index * hSpacing;
        node.y = depth * vSpacing;
      } else {
        node.x = depth * hSpacing;
        node.y = startOffset + index * vSpacing;
      }
    });
  }
}

function simpleGridLayout(noteMap: NoteMap, direction: LayoutDirection): void {
  const cols = Math.ceil(Math.sqrt(noteMap.nodes.length));
  const spacing = 280;

  noteMap.nodes.forEach((node, i) => {
    const row = Math.floor(i / cols);
    const col = i % cols;
    if (direction === "top-down") {
      node.x = col * spacing;
      node.y = row * spacing;
    } else {
      node.x = row * spacing;
      node.y = col * spacing;
    }
  });
}
