import { Viewport, Point } from "./Viewport";
import { SelectionManager } from "./SelectionManager";
import { NoteMap } from "../models/NoteMap";
import { NoteMapNode } from "../models/Node";
import { NoteMapEdge } from "../models/Edge";
import { NoteMapTable } from "../models/Table";

export type InteractionMode = "select" | "pan" | "edge" | "resize";

export interface InputHandlerCallbacks {
  onRequestRender: () => void;
  onNodeCreated: (node: NoteMapNode) => void;
  onEdgeCreated: (edge: NoteMapEdge) => void;
  onRequestSave: () => void;
  onNodePopup: (node: NoteMapNode) => void;
  onTableCellEdit: (table: NoteMapTable, row: number, col: number) => void;
  onEdgeJunction: (edge: NoteMapEdge, worldPos: Point) => void;
}

let nextId = 1;
function generateId(): string {
  return `notemap-${Date.now()}-${nextId++}`;
}

export class InputHandler {
  private mode: InteractionMode = "select";
  private isPanning = false;
  private isDraggingNode = false;
  private isResizing = false;
  private isDraggingEdge = false;
  private dragStartWorld: Point = { x: 0, y: 0 };
  private dragStartScreen: Point = { x: 0, y: 0 };
  private dragNodeOffset: Point = { x: 0, y: 0 };
  private resizeHandle: string | null = null;
  private resizeStartBounds = { x: 0, y: 0, width: 0, height: 0 };

  private edgeSourceNodeId: string | null = null;
  private edgeSourceAnchorId: string | null = null;
  private edgePreviewTarget: Point | null = null;

  // draw.io style: hover anchor points
  private hoveredNodeId: string | null = null;
  private hoveredAnchorId: string | null = null;

  // Snap target: nearby anchor highlighted during edge drag
  private snapTargetNodeId: string | null = null;
  private snapTargetAnchorId: string | null = null;

  // Alignment snap guides (Figma-style)
  private snapGuides: { type: "h" | "v"; pos: number }[] = [];

  // Box selection (drag select)
  private isBoxSelecting = false;
  private boxSelectStart: Point = { x: 0, y: 0 };
  private boxSelectEnd: Point = { x: 0, y: 0 };

  private spaceHeld = false;

  constructor(
    private canvas: HTMLCanvasElement,
    private viewport: Viewport,
    private noteMap: NoteMap,
    private selection: SelectionManager,
    private callbacks: InputHandlerCallbacks
  ) {
    this.bindEvents();
  }

  getMode(): InteractionMode {
    return this.mode;
  }

  setMode(mode: InteractionMode): void {
    this.mode = mode;
    this.edgeSourceNodeId = null;
    this.edgePreviewTarget = null;
    this.canvas.style.cursor = mode === "edge" ? "crosshair" : "default";
  }

  getEdgePreview(): { from: Point; to: Point } | null {
    if (!this.edgeSourceNodeId || !this.edgePreviewTarget || !this.edgeSourceAnchorId) return null;

    let from: Point | null = null;
    const sourceNode = this.noteMap.getNodeById(this.edgeSourceNodeId);
    if (sourceNode) {
      from = sourceNode.getAnchorWorldPosition(this.edgeSourceAnchorId);
    } else if (this.noteMap.tables) {
      const sourceTable = this.noteMap.tables.find((t) => t.id === this.edgeSourceNodeId);
      if (sourceTable) {
        from = sourceTable.getAnchorWorldPosition(this.edgeSourceAnchorId!) as Point | null;
      }
    }

    if (!from) return null;
    return { from, to: this.edgePreviewTarget };
  }

  getHoveredNodeId(): string | null {
    return this.hoveredNodeId;
  }

  getHoveredAnchorId(): string | null {
    return this.hoveredAnchorId;
  }

  getSnapTargetNodeId(): string | null {
    return this.snapTargetNodeId;
  }

  getSnapTargetAnchorId(): string | null {
    return this.snapTargetAnchorId;
  }

  getSnapGuides(): { type: "h" | "v"; pos: number }[] {
    return this.snapGuides;
  }

  getBoxSelectRect(): { x: number; y: number; w: number; h: number } | null {
    if (!this.isBoxSelecting) return null;
    const x = Math.min(this.boxSelectStart.x, this.boxSelectEnd.x);
    const y = Math.min(this.boxSelectStart.y, this.boxSelectEnd.y);
    const w = Math.abs(this.boxSelectEnd.x - this.boxSelectStart.x);
    const h = Math.abs(this.boxSelectEnd.y - this.boxSelectStart.y);
    return { x, y, w, h };
  }

  /** Returns empty set — all anchors are always available (duplicates checked on drop) */
  getOccupiedAnchors(): Set<string> {
    return new Set<string>();
  }

  destroy(): void {
    this.canvas.removeEventListener("mousedown", this.onMouseDown);
    this.canvas.removeEventListener("mousemove", this.onMouseMove);
    this.canvas.removeEventListener("mouseup", this.onMouseUp);
    this.canvas.removeEventListener("wheel", this.onWheel);
    this.canvas.removeEventListener("dblclick", this.onDoubleClick);
    this.canvas.removeEventListener("contextmenu", this.onContextMenu);
    document.removeEventListener("keydown", this.onKeyDown);
    document.removeEventListener("keyup", this.onKeyUp);
  }

  private bindEvents(): void {
    this.canvas.addEventListener("mousedown", this.onMouseDown);
    this.canvas.addEventListener("mousemove", this.onMouseMove);
    this.canvas.addEventListener("mouseup", this.onMouseUp);
    this.canvas.addEventListener("wheel", this.onWheel, { passive: false });
    this.canvas.addEventListener("dblclick", this.onDoubleClick);
    this.canvas.addEventListener("contextmenu", this.onContextMenu);
    document.addEventListener("keydown", this.onKeyDown);
    document.addEventListener("keyup", this.onKeyUp);
  }

  private onMouseDown = (e: MouseEvent): void => {
    // Ignore right-click — handled by contextmenu event
    if (e.button === 2) return;

    const rect = this.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = this.viewport.screenToWorld(sx, sy);

    this.dragStartScreen = { x: sx, y: sy };
    this.dragStartWorld = world;

    if (this.spaceHeld || e.button === 1) {
      this.isPanning = true;
      this.canvas.style.cursor = "grabbing";
      return;
    }

    // Update hover state right before checking (ensures anchors are fresh)
    this.updateHover(world);

    // draw.io style: clicking on an anchor point starts edge dragging
    // Any anchor can start a new edge (duplicates are checked on drop)
    if (this.hoveredAnchorId && this.hoveredNodeId) {
      this.isDraggingEdge = true;
      this.edgeSourceNodeId = this.hoveredNodeId;
      this.edgeSourceAnchorId = this.hoveredAnchorId;
      this.edgePreviewTarget = world;
      this.canvas.style.cursor = "crosshair";
      return;
    }

    if (this.mode === "edge") {
      this.handleEdgeStart(world);
      return;
    }

    // Check resize handles first
    const resizeHandle = this.getResizeHandle(sx, sy);
    if (resizeHandle) {
      this.isResizing = true;
      this.resizeHandle = resizeHandle.handle;
      const node = this.noteMap.getNodeById(resizeHandle.nodeId)!;
      this.resizeStartBounds = { x: node.x, y: node.y, width: node.width, height: node.height };
      return;
    }

    const hitNode = this.hitTestNode(world.x, world.y);

    if (hitNode) {
      if (e.shiftKey) {
        this.selection.toggle("node", hitNode.id);
      } else if (!this.selection.isSelected("node", hitNode.id)) {
        this.selection.select("node", hitNode.id);
      }
      this.isDraggingNode = true;
      this.dragNodeOffset = { x: world.x - hitNode.x, y: world.y - hitNode.y };
    } else {
      // Check table hit
      const hitTable = this.hitTestTable(world.x, world.y);
      if (hitTable) {
        if (e.shiftKey) {
          this.selection.toggle("table", hitTable.id);
        } else if (!this.selection.isSelected("table", hitTable.id)) {
          this.selection.select("table", hitTable.id);
        }
        this.isDraggingNode = true;
        this.dragNodeOffset = { x: world.x - hitTable.x, y: world.y - hitTable.y };
      } else {
        const hitEdge = this.hitTestEdge(world.x, world.y);
        if (hitEdge) {
          if (e.shiftKey) {
            this.selection.toggle("edge", hitEdge.id);
          } else {
            this.selection.select("edge", hitEdge.id);
          }
        } else {
          // Empty area: start box selection
          if (!e.shiftKey) this.selection.clear();
          this.isBoxSelecting = true;
          this.boxSelectStart = world;
          this.boxSelectEnd = world;
          this.canvas.style.cursor = "crosshair";
        }
      }
    }

    this.callbacks.onRequestRender();
  };

  private onMouseMove = (e: MouseEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = this.viewport.screenToWorld(sx, sy);

    if (this.isPanning) {
      const dx = sx - this.dragStartScreen.x;
      const dy = sy - this.dragStartScreen.y;
      this.viewport.pan(dx, dy);
      this.dragStartScreen = { x: sx, y: sy };
      this.callbacks.onRequestRender();
      return;
    }

    if (this.isBoxSelecting) {
      this.boxSelectEnd = world;
      this.updateBoxSelection();
      this.callbacks.onRequestRender();
      return;
    }

    if (this.isResizing && this.resizeHandle) {
      this.handleResize(world);
      this.callbacks.onRequestRender();
      return;
    }

    if (this.isDraggingNode) {
      const selectedNodeIds = this.selection.getSelectedIds("node");
      const selectedTableIds = this.selection.getSelectedIds("table");

      if (selectedNodeIds.length > 0) {
        const primaryNode = this.noteMap.getNodeById(selectedNodeIds[0]);
        if (primaryNode) {
          let newX = world.x - this.dragNodeOffset.x;
          let newY = world.y - this.dragNodeOffset.y;

          // Snap to alignment guides
          const snapped = this.calcAlignmentSnap(primaryNode.id, newX, newY, primaryNode.width, primaryNode.height, selectedNodeIds);
          newX = snapped.x;
          newY = snapped.y;

          const dx = newX - primaryNode.x;
          const dy = newY - primaryNode.y;
          for (const id of selectedNodeIds) {
            const node = this.noteMap.getNodeById(id);
            if (node) { node.x += dx; node.y += dy; }
          }
        }
      } else if (selectedTableIds.length > 0 && this.noteMap.tables) {
        const primaryTable = this.noteMap.tables.find((t) => t.id === selectedTableIds[0]);
        if (primaryTable) {
          let newX = world.x - this.dragNodeOffset.x;
          let newY = world.y - this.dragNodeOffset.y;

          const snapped = this.calcAlignmentSnapForTable(primaryTable.id, newX, newY, primaryTable.width, primaryTable.height);
          newX = snapped.x;
          newY = snapped.y;

          const dx = newX - primaryTable.x;
          const dy = newY - primaryTable.y;
          for (const id of selectedTableIds) {
            const table = this.noteMap.tables.find((t) => t.id === id);
            if (table) { table.x += dx; table.y += dy; }
          }
        }
      }

      this.callbacks.onRequestRender();
      return;
    }

    // Edge dragging (draw.io style or E-mode)
    if ((this.isDraggingEdge || this.mode === "edge") && this.edgeSourceNodeId) {
      this.updateSnapTarget(world);

      // Snap preview endpoint to target anchor position if close enough
      if (this.snapTargetNodeId && this.snapTargetAnchorId) {
        let anchorPos: { x: number; y: number } | null = null;

        const targetNode = this.noteMap.getNodeById(this.snapTargetNodeId);
        if (targetNode) {
          anchorPos = targetNode.getAnchorWorldPosition(this.snapTargetAnchorId);
        } else if (this.noteMap.tables) {
          const targetTable = this.noteMap.tables.find((t) => t.id === this.snapTargetNodeId);
          if (targetTable) {
            anchorPos = targetTable.getAnchorWorldPosition(this.snapTargetAnchorId!);
          }
        }

        if (anchorPos) {
          this.edgePreviewTarget = anchorPos;
          this.callbacks.onRequestRender();
          return;
        }
      }

      this.edgePreviewTarget = world;
      this.callbacks.onRequestRender();
      return;
    }

    // Hover detection: check anchor points on hovered node
    this.updateHover(world);

    // Update cursor
    if (!this.isPanning && !this.isDraggingNode) {
      const handle = this.getResizeHandle(sx, sy);
      if (handle) {
        this.canvas.style.cursor = this.getResizeCursor(handle.handle);
      } else if (this.hoveredAnchorId && this.hoveredNodeId) {
        this.canvas.style.cursor = "crosshair";
      } else {
        const hitNode = this.hitTestNode(world.x, world.y);
        const hitTable = hitNode ? null : this.hitTestTable(world.x, world.y);
        this.canvas.style.cursor = (hitNode || hitTable) ? "move" : (this.mode === "edge" ? "crosshair" : "default");
      }
    }
  };

  private onMouseUp = (_e: MouseEvent): void => {
    if (this.isDraggingNode || this.isResizing) {
      this.callbacks.onRequestSave();
    }

    // Complete edge connection (draw.io style or E-mode)
    if ((this.isDraggingEdge || this.mode === "edge") && this.edgeSourceNodeId && this.edgePreviewTarget) {
      let targetNodeId: string | null = null;
      let targetAnchorId: string | null = null;

      // Prefer snap target if available
      if (this.snapTargetNodeId && this.snapTargetAnchorId) {
        targetNodeId = this.snapTargetNodeId;
        targetAnchorId = this.snapTargetAnchorId;
      } else {
        // Fallback: check if mouse is directly on a node or table
        const world = this.edgePreviewTarget;
        const hitNode = this.hitTestNode(world.x, world.y);
        if (hitNode && hitNode.id !== this.edgeSourceNodeId) {
          targetNodeId = hitNode.id;
          targetAnchorId = hitNode.getNearestAnchor(world.x, world.y).id;
        } else {
          const hitTable = this.hitTestTable(world.x, world.y);
          if (hitTable && hitTable.id !== this.edgeSourceNodeId) {
            targetNodeId = hitTable.id;
            targetAnchorId = hitTable.getNearestAnchor(world.x, world.y).id;
          }
        }
      }

      if (targetNodeId && targetAnchorId) {
        // Only block if this exact anchor pair is already connected
        const isDuplicate = this.noteMap.hasEdgeBetweenAnchors(
          this.edgeSourceNodeId, this.edgeSourceAnchorId!,
          targetNodeId, targetAnchorId
        );
        if (!isDuplicate) {
          const edge = new NoteMapEdge(generateId(), {
            nodeId: this.edgeSourceNodeId,
            anchorId: this.edgeSourceAnchorId!,
          }, {
            nodeId: targetNodeId,
            anchorId: targetAnchorId,
          });
          this.noteMap.addEdge(edge);
          this.callbacks.onEdgeCreated(edge);
          this.callbacks.onRequestSave();
        }
      }

      this.edgeSourceNodeId = null;
      this.edgeSourceAnchorId = null;
      this.edgePreviewTarget = null;
      this.snapTargetNodeId = null;
      this.snapTargetAnchorId = null;
    }

    this.isPanning = false;
    this.isDraggingNode = false;
    this.isResizing = false;
    this.isDraggingEdge = false;
    this.isBoxSelecting = false;
    this.resizeHandle = null;
    this.snapGuides = [];
    this.canvas.style.cursor = this.mode === "edge" ? "crosshair" : "default";
    this.callbacks.onRequestRender();
  };

  // Zoom sensitivity: 1 = very slow, 5 = very fast (default 3)
  private zoomSensitivity = 1;

  setZoomSensitivity(level: number): void {
    this.zoomSensitivity = Math.max(1, Math.min(5, level));
  }

  getZoomSensitivity(): number {
    return this.zoomSensitivity;
  }

  private onWheel = (e: WheelEvent): void => {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;

    // Base zoom amounts per sensitivity level
    // Level 1: 0.5%, Level 2: 1%, Level 3: 2%, Level 4: 4%, Level 5: 6%
    const baseAmounts = [0.005, 0.01, 0.02, 0.04, 0.06];
    const amount = baseAmounts[this.zoomSensitivity - 1];
    const ctrlMultiplier = 2.5;

    const delta = e.ctrlKey || e.metaKey ? amount * ctrlMultiplier : amount;
    const factor = e.deltaY > 0 ? 1 - delta : 1 + delta;

    this.viewport.zoomAt(factor, sx, sy);
    this.callbacks.onRequestRender();
  };

  private onDoubleClick = (e: MouseEvent): void => {
    const rect = this.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = this.viewport.screenToWorld(sx, sy);

    const hitNode = this.hitTestNode(world.x, world.y);
    if (hitNode) {
      this.callbacks.onNodePopup(hitNode);
      return;
    }

    // Check table cell double-click
    if (this.noteMap.tables) {
      for (const table of this.noteMap.tables) {
        const cell = table.getCellAt(world.x, world.y);
        if (cell) {
          this.callbacks.onTableCellEdit(table, cell.row, cell.col);
          return;
        }
      }
    }

  };

  private onContextMenu = (e: MouseEvent): void => {
    e.preventDefault();
  };

  private onKeyDown = (e: KeyboardEvent): void => {
    // Don't intercept keys when an input/textarea is focused (e.g. popup editor)
    if (this.isInputFocused()) return;

    if (e.code === "Space") {
      this.spaceHeld = true;
      this.canvas.style.cursor = "grab";
    }

    if (e.code === "Delete" || e.code === "Backspace") {
      e.preventDefault();
      const selectedNodes = this.selection.getSelectedIds("node");
      const selectedEdges = this.selection.getSelectedIds("edge");
      const selectedTables = this.selection.getSelectedIds("table");
      for (const id of selectedNodes) this.noteMap.removeNode(id);
      for (const id of selectedEdges) this.noteMap.removeEdge(id);
      if (this.noteMap.tables) {
        for (const id of selectedTables) {
          this.noteMap.tables = this.noteMap.tables.filter((t) => t.id !== id);
        }
      }
      this.selection.clear();
      if (selectedNodes.length > 0 || selectedEdges.length > 0 || selectedTables.length > 0) {
        this.callbacks.onRequestSave();
      }
      this.callbacks.onRequestRender();
    }

    // Copy (Ctrl+C)
    if ((e.ctrlKey || e.metaKey) && e.code === "KeyC") {
      this.copySelection();
    }

    // Paste (Ctrl+V)
    if ((e.ctrlKey || e.metaKey) && e.code === "KeyV") {
      this.pasteClipboard();
    }

    if (e.code === "KeyE") {
      this.setMode(this.mode === "edge" ? "select" : "edge");
    }

    if (e.code === "Escape") {
      this.setMode("select");
      this.selection.clear();
      this.callbacks.onRequestRender();
    }

    if (e.code === "KeyF" && !e.ctrlKey && !e.metaKey) {
      const bounds = this.noteMap.getBoundingRect();
      this.viewport.animateToFit(bounds, this.canvas.width, this.canvas.height, () => {
        this.callbacks.onRequestRender();
      });
    }
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    if (e.code === "Space") {
      this.spaceHeld = false;
      this.canvas.style.cursor = this.mode === "edge" ? "crosshair" : "default";
    }
  };

  // During edge drag: find the closest anchor on nearby nodes to snap to
  private updateSnapTarget(world: Point): void {
    this.snapTargetNodeId = null;
    this.snapTargetAnchorId = null;

    if (!this.edgeSourceNodeId || !this.edgeSourceAnchorId) return;

    const snapRadius = 60 / this.viewport.zoom; // screen ~60px radius
    let bestDist = snapRadius;
    let bestNodeId: string | null = null;
    let bestAnchorId: string | null = null;

    for (const node of this.noteMap.nodes) {
      if (node.id === this.edgeSourceNodeId) continue;

      // Quick bounding box check: is node roughly within range?
      const cx = node.x + node.width / 2;
      const cy = node.y + node.height / 2;
      const roughDist = Math.hypot(world.x - cx, world.y - cy);
      if (roughDist > snapRadius + Math.max(node.width, node.height)) continue;

      for (const anchor of node.anchors) {
        const pos = node.getAnchorWorldPosition(anchor.id);
        if (!pos) continue;

        // Skip if this exact connection already exists
        if (this.noteMap.hasEdgeBetweenAnchors(
          this.edgeSourceNodeId, this.edgeSourceAnchorId,
          node.id, anchor.id
        )) continue;

        const dist = Math.hypot(world.x - pos.x, world.y - pos.y);
        if (dist < bestDist) {
          bestDist = dist;
          bestNodeId = node.id;
          bestAnchorId = anchor.id;
        }
      }
    }

    // Also check table anchors
    if (this.noteMap.tables) {
      for (const table of this.noteMap.tables) {
        if (table.id === this.edgeSourceNodeId) continue;
        const tcx = table.x + table.width / 2;
        const tcy = table.y + table.height / 2;
        if (Math.hypot(world.x - tcx, world.y - tcy) > snapRadius + Math.max(table.width, table.height)) continue;

        for (const anchor of table.anchors) {
          const pos = table.getAnchorWorldPosition(anchor.id);
          if (!pos) continue;
          if (this.noteMap.hasEdgeBetweenAnchors(this.edgeSourceNodeId, this.edgeSourceAnchorId, table.id, anchor.id)) continue;
          const dist = Math.hypot(world.x - pos.x, world.y - pos.y);
          if (dist < bestDist) {
            bestDist = dist;
            bestNodeId = table.id;
            bestAnchorId = anchor.id;
          }
        }
      }
    }

    this.snapTargetNodeId = bestNodeId;
    this.snapTargetAnchorId = bestAnchorId;
  }

  // Detect hover on anchor points — checks anchor positions directly,
  // not limited to being inside the shape (since anchors are offset outside)
  private updateHover(world: Point): void {
    const prevHoveredNode = this.hoveredNodeId;
    const prevHoveredAnchor = this.hoveredAnchorId;
    this.hoveredNodeId = null;
    this.hoveredAnchorId = null;

    const anchorThreshold = 12 / this.viewport.zoom;

    // First: check if mouse is near any anchor point (across all nodes & tables)
    let bestAnchorDist = anchorThreshold;
    for (const node of this.noteMap.nodes) {
      for (const anchor of node.anchors) {
        const pos = node.getAnchorWorldPosition(anchor.id);
        if (!pos) continue;
        const dist = Math.hypot(world.x - pos.x, world.y - pos.y);
        if (dist < bestAnchorDist) {
          bestAnchorDist = dist;
          this.hoveredNodeId = node.id;
          this.hoveredAnchorId = anchor.id;
        }
      }
    }
    if (this.noteMap.tables) {
      for (const table of this.noteMap.tables) {
        for (const anchor of table.anchors) {
          const pos = table.getAnchorWorldPosition(anchor.id);
          if (!pos) continue;
          const dist = Math.hypot(world.x - pos.x, world.y - pos.y);
          if (dist < bestAnchorDist) {
            bestAnchorDist = dist;
            this.hoveredNodeId = table.id;
            this.hoveredAnchorId = anchor.id;
          }
        }
      }
    }

    // If no anchor hit, check if hovering near a node (to show anchors)
    if (!this.hoveredNodeId) {
      const hitNode = this.hitTestNode(world.x, world.y);
      if (hitNode) {
        this.hoveredNodeId = hitNode.id;
      } else if (this.noteMap.tables) {
        const hitTable = this.hitTestTable(world.x, world.y);
        if (hitTable) {
          this.hoveredNodeId = hitTable.id;
        }
      }
    }

    if (prevHoveredNode !== this.hoveredNodeId || prevHoveredAnchor !== this.hoveredAnchorId) {
      this.callbacks.onRequestRender();
    }
  }

  private handleEdgeStart(world: Point): void {
    const hitNode = this.hitTestNode(world.x, world.y);
    if (hitNode) {
      const anchor = hitNode.getNearestAnchor(world.x, world.y);
      this.edgeSourceNodeId = hitNode.id;
      this.edgeSourceAnchorId = anchor.id;
      this.edgePreviewTarget = world;
    }
  }

  private handleResize(world: Point): void {
    const selectedNodeIds = this.selection.getSelectedIds("node");
    if (selectedNodeIds.length !== 1) return;
    const node = this.noteMap.getNodeById(selectedNodeIds[0]);
    if (!node || !this.resizeHandle) return;

    const minSize = 40;
    const b = this.resizeStartBounds;
    const dx = world.x - this.dragStartWorld.x;
    const dy = world.y - this.dragStartWorld.y;

    if (this.resizeHandle.includes("right")) {
      node.width = Math.max(minSize, b.width + dx);
    }
    if (this.resizeHandle.includes("left")) {
      const newWidth = Math.max(minSize, b.width - dx);
      node.x = b.x + b.width - newWidth;
      node.width = newWidth;
    }
    if (this.resizeHandle.includes("bottom")) {
      node.height = Math.max(minSize, b.height + dy);
    }
    if (this.resizeHandle.includes("top")) {
      const newHeight = Math.max(minSize, b.height - dy);
      node.y = b.y + b.height - newHeight;
      node.height = newHeight;
    }
  }

  private getResizeHandle(sx: number, sy: number): { nodeId: string; handle: string } | null {
    const selectedNodeIds = this.selection.getSelectedIds("node");
    if (selectedNodeIds.length !== 1) return null;

    const node = this.noteMap.getNodeById(selectedNodeIds[0]);
    if (!node) return null;

    const handleSize = 8;
    const corners = [
      { handle: "top-left", x: node.x, y: node.y },
      { handle: "top-right", x: node.x + node.width, y: node.y },
      { handle: "bottom-left", x: node.x, y: node.y + node.height },
      { handle: "bottom-right", x: node.x + node.width, y: node.y + node.height },
    ];

    const world = this.viewport.screenToWorld(sx, sy);
    const threshold = handleSize / this.viewport.zoom;

    for (const corner of corners) {
      if (Math.abs(world.x - corner.x) < threshold && Math.abs(world.y - corner.y) < threshold) {
        return { nodeId: node.id, handle: corner.handle };
      }
    }
    return null;
  }

  private getResizeCursor(handle: string): string {
    switch (handle) {
      case "top-left":
      case "bottom-right":
        return "nwse-resize";
      case "top-right":
      case "bottom-left":
        return "nesw-resize";
      default:
        return "default";
    }
  }

  // --- Box selection ---
  private updateBoxSelection(): void {
    const x1 = Math.min(this.boxSelectStart.x, this.boxSelectEnd.x);
    const y1 = Math.min(this.boxSelectStart.y, this.boxSelectEnd.y);
    const x2 = Math.max(this.boxSelectStart.x, this.boxSelectEnd.x);
    const y2 = Math.max(this.boxSelectStart.y, this.boxSelectEnd.y);

    // Select nodes inside the box
    for (const node of this.noteMap.nodes) {
      const inside = node.x >= x1 && node.y >= y1 &&
                     node.x + node.width <= x2 && node.y + node.height <= y2;
      if (inside) {
        if (!this.selection.isSelected("node", node.id)) {
          this.selection.select("node", node.id, true);
        }
      }
    }

    // Select edges whose both endpoints are inside the box
    for (const edge of this.noteMap.edges) {
      const sn = this.noteMap.getNodeById(edge.source.nodeId);
      const tn = this.noteMap.getNodeById(edge.target.nodeId);
      if (sn && tn) {
        const sInside = this.selection.isSelected("node", sn.id);
        const tInside = this.selection.isSelected("node", tn.id);
        if (sInside && tInside) {
          if (!this.selection.isSelected("edge", edge.id)) {
            this.selection.select("edge", edge.id, true);
          }
        }
      }
    }

    // Select tables inside the box
    if (this.noteMap.tables) {
      for (const table of this.noteMap.tables) {
        const inside = table.x >= x1 && table.y >= y1 &&
                       table.x + table.width <= x2 && table.y + table.height <= y2;
        if (inside && !this.selection.isSelected("table", table.id)) {
          this.selection.select("table", table.id, true);
        }
      }
    }
  }

  // --- Copy / Paste ---
  private clipboard: { nodes: any[]; edges: any[] } | null = null;

  private copySelection(): void {
    const selectedNodeIds = new Set(this.selection.getSelectedIds("node"));
    if (selectedNodeIds.size === 0) return;

    const nodes = this.noteMap.nodes
      .filter((n) => selectedNodeIds.has(n.id))
      .map((n) => n.toJSON());

    // Copy edges that connect two selected nodes
    const edges = this.noteMap.edges
      .filter((e) => selectedNodeIds.has(e.source.nodeId) && selectedNodeIds.has(e.target.nodeId))
      .map((e) => e.toJSON());

    this.clipboard = { nodes, edges };
  }

  private pasteClipboard(): void {
    if (!this.clipboard || this.clipboard.nodes.length === 0) return;

    const offset = 40;
    const idMap = new Map<string, string>(); // old id → new id

    // Create new nodes with offset
    const newNodes: NoteMapNode[] = [];
    for (const data of this.clipboard.nodes) {
      const newId = generateId();
      idMap.set(data.id, newId);
      const shifted = { ...data, id: newId, position: { x: data.position.x + offset, y: data.position.y + offset } };
      const node = NoteMapNode.fromJSON(shifted);
      this.noteMap.addNode(node);
      newNodes.push(node);
    }

    // Create new edges with remapped IDs
    for (const data of this.clipboard.edges) {
      const newSourceNodeId = idMap.get(data.source.nodeId);
      const newTargetNodeId = idMap.get(data.target.nodeId);
      if (!newSourceNodeId || !newTargetNodeId) continue;

      const newEdgeId = generateId();
      const newSourceAnchorId = data.source.anchorId.replace(data.source.nodeId, newSourceNodeId);
      const newTargetAnchorId = data.target.anchorId.replace(data.target.nodeId, newTargetNodeId);

      const edgeData = {
        ...data,
        id: newEdgeId,
        source: { nodeId: newSourceNodeId, anchorId: newSourceAnchorId },
        target: { nodeId: newTargetNodeId, anchorId: newTargetAnchorId },
      };
      this.noteMap.addEdge(NoteMapEdge.fromJSON(edgeData));
    }

    // Select the pasted items
    this.selection.clear();
    for (const node of newNodes) {
      this.selection.select("node", node.id, true);
    }

    this.callbacks.onRequestSave();
    this.callbacks.onRequestRender();
  }

  // --- Alignment Snap (Figma-style) ---
  private calcAlignmentSnap(
    dragId: string, x: number, y: number, w: number, h: number,
    excludeIds: string[]
  ): { x: number; y: number } {
    const threshold = 8 / this.viewport.zoom;
    const excludeSet = new Set(excludeIds);
    this.snapGuides = [];

    // Edges of dragged node
    const dragLeft = x, dragRight = x + w, dragCx = x + w / 2;
    const dragTop = y, dragBottom = y + h, dragCy = y + h / 2;

    let bestDx = threshold + 1;
    let bestDy = threshold + 1;
    let snapX = x, snapY = y;

    // Collect reference edges from other nodes
    for (const node of this.noteMap.nodes) {
      if (excludeSet.has(node.id)) continue;
      const refs = [
        { v: node.x, label: "left" },
        { v: node.x + node.width / 2, label: "cx" },
        { v: node.x + node.width, label: "right" },
      ];
      const hRefs = [
        { v: node.y, label: "top" },
        { v: node.y + node.height / 2, label: "cy" },
        { v: node.y + node.height, label: "bottom" },
      ];

      // Vertical guides (X alignment)
      for (const ref of refs) {
        for (const drag of [dragLeft, dragCx, dragRight]) {
          const diff = Math.abs(drag - ref.v);
          if (diff < threshold && diff < bestDx) {
            bestDx = diff;
            snapX = x + (ref.v - drag);
          }
        }
      }

      // Horizontal guides (Y alignment)
      for (const ref of hRefs) {
        for (const drag of [dragTop, dragCy, dragBottom]) {
          const diff = Math.abs(drag - ref.v);
          if (diff < threshold && diff < bestDy) {
            bestDy = diff;
            snapY = y + (ref.v - drag);
          }
        }
      }
    }

    // Also snap to tables
    if (this.noteMap.tables) {
      for (const table of this.noteMap.tables) {
        const refs = [table.x, table.x + table.width / 2, table.x + table.width];
        const hRefs = [table.y, table.y + table.height / 2, table.y + table.height];
        for (const ref of refs) {
          for (const drag of [dragLeft, dragCx, dragRight]) {
            const diff = Math.abs(drag - ref);
            if (diff < threshold && diff < bestDx) { bestDx = diff; snapX = x + (ref - drag); }
          }
        }
        for (const ref of hRefs) {
          for (const drag of [dragTop, dragCy, dragBottom]) {
            const diff = Math.abs(drag - ref);
            if (diff < threshold && diff < bestDy) { bestDy = diff; snapY = y + (ref - drag); }
          }
        }
      }
    }

    // Build guide lines for rendering
    if (bestDx <= threshold) {
      // Find which X we snapped to
      const snappedLeft = snapX, snappedCx = snapX + w / 2, snappedRight = snapX + w;
      for (const node of this.noteMap.nodes) {
        if (excludeSet.has(node.id)) continue;
        for (const ref of [node.x, node.x + node.width / 2, node.x + node.width]) {
          if (Math.abs(snappedLeft - ref) < 1 || Math.abs(snappedCx - ref) < 1 || Math.abs(snappedRight - ref) < 1) {
            this.snapGuides.push({ type: "v", pos: ref });
          }
        }
      }
    }
    if (bestDy <= threshold) {
      const snappedTop = snapY, snappedCy = snapY + h / 2, snappedBottom = snapY + h;
      for (const node of this.noteMap.nodes) {
        if (excludeSet.has(node.id)) continue;
        for (const ref of [node.y, node.y + node.height / 2, node.y + node.height]) {
          if (Math.abs(snappedTop - ref) < 1 || Math.abs(snappedCy - ref) < 1 || Math.abs(snappedBottom - ref) < 1) {
            this.snapGuides.push({ type: "h", pos: ref });
          }
        }
      }
    }

    return { x: snapX, y: snapY };
  }

  private calcAlignmentSnapForTable(
    tableId: string, x: number, y: number, w: number, h: number
  ): { x: number; y: number } {
    return this.calcAlignmentSnap(tableId, x, y, w, h, [tableId]);
  }

  private hitTestTable(wx: number, wy: number): NoteMapTable | null {
    if (!this.noteMap.tables) return null;
    for (let i = this.noteMap.tables.length - 1; i >= 0; i--) {
      if (this.noteMap.tables[i].containsPoint(wx, wy)) {
        return this.noteMap.tables[i];
      }
    }
    return null;
  }

  private hitTestNode(wx: number, wy: number): NoteMapNode | null {
    for (let i = this.noteMap.nodes.length - 1; i >= 0; i--) {
      if (this.noteMap.nodes[i].containsPoint(wx, wy)) {
        return this.noteMap.nodes[i];
      }
    }
    return null;
  }

  private resolveAnchorPos(nodeId: string, anchorId: string): Point | null {
    const node = this.noteMap.getNodeById(nodeId);
    if (node) return node.getAnchorEdgePosition(anchorId) || node.getAnchorWorldPosition(anchorId);
    if (this.noteMap.tables) {
      const table = this.noteMap.tables.find((t) => t.id === nodeId);
      if (table) return table.getAnchorEdgePosition(anchorId) || table.getAnchorWorldPosition(anchorId) as Point | null;
    }
    return null;
  }

  private hitTestEdge(wx: number, wy: number): NoteMapEdge | null {
    const threshold = 10 / this.viewport.zoom;
    for (const edge of this.noteMap.edges) {
      const sp = this.resolveAnchorPos(edge.source.nodeId, edge.source.anchorId);
      const tp = this.resolveAnchorPos(edge.target.nodeId, edge.target.anchorId);
      if (!sp || !tp) continue;

      // For straight edges, check point-to-segment distance
      // For elbow/orthogonal, check each segment of the L-shaped path
      let hit = false;
      if (edge.type === "straight" || edge.type === "bezier") {
        hit = this.pointToSegmentDist(wx, wy, sp.x, sp.y, tp.x, tp.y) < threshold;
      } else {
        // Build the elbow path segments and check each one
        const margin = 30;
        const points = [sp];
        // Simple approximation: extend from source, turn, arrive at target
        const isSourceH = this.isAnchorHorizontal(edge.source.nodeId, edge.source.anchorId);
        const isTargetH = this.isAnchorHorizontal(edge.target.nodeId, edge.target.anchorId);
        if (isSourceH && isTargetH) {
          const mx = (sp.x + tp.x) / 2;
          points.push({ x: mx, y: sp.y }, { x: mx, y: tp.y });
        } else if (!isSourceH && !isTargetH) {
          const my = (sp.y + tp.y) / 2;
          points.push({ x: sp.x, y: my }, { x: tp.x, y: my });
        } else if (isSourceH) {
          points.push({ x: tp.x, y: sp.y });
        } else {
          points.push({ x: sp.x, y: tp.y });
        }
        points.push(tp);
        for (let i = 0; i < points.length - 1; i++) {
          if (this.pointToSegmentDist(wx, wy, points[i].x, points[i].y, points[i+1].x, points[i+1].y) < threshold) {
            hit = true; break;
          }
        }
      }

      if (hit) return edge;
    }
    return null;
  }

  private isAnchorHorizontal(nodeId: string, anchorId: string): boolean {
    const node = this.noteMap.getNodeById(nodeId);
    if (node) {
      const a = node.anchors.find((a) => a.id === anchorId);
      if (a) return a.position === "left" || a.position === "right";
    }
    if (this.noteMap.tables) {
      const table = this.noteMap.tables.find((t) => t.id === nodeId);
      if (table) {
        const a = table.anchors.find((a) => a.id === anchorId);
        if (a) return a.position === "left" || a.position === "right";
      }
    }
    return true;
  }

  private pointToSegmentDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1;
    const dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  private isInputFocused(): boolean {
    const active = document.activeElement;
    return active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement;
  }
}
