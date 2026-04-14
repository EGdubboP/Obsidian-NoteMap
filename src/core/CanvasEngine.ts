import { Viewport } from "./Viewport";
import { SelectionManager } from "./SelectionManager";
import { InputHandler, InputHandlerCallbacks } from "./InputHandler";
import { UndoManager } from "./UndoManager";
import { NoteMap } from "../models/NoteMap";
import { NoteMapNode, NodeShape } from "../models/Node";
import { NoteMapEdge } from "../models/Edge";
import { NoteMapTable, DEFAULT_CELL_STYLE } from "../models/Table";
import { GridRenderer } from "../renderers/GridRenderer";
import { NodeRenderer } from "../renderers/NodeRenderer";
import { EdgeRenderer } from "../renderers/EdgeRenderer";
import { LODRenderer } from "../renderers/LODRenderer";
import { TableRenderer } from "../renderers/TableRenderer";
import { ContextMenu } from "../ui/ContextMenu";
import { MiniMap } from "../ui/MiniMap";
import { SearchBar } from "../ui/SearchBar";
import { PropertyPanel, PropertyPanelCallbacks } from "../ui/PropertyPanel";
import { Toolbar, ToolbarCallbacks } from "../ui/Toolbar";
import { SpatialGrid } from "../utils/geometry";
import { autoLayout } from "../utils/autoLayout";
import { exportToPNG, exportToSVG, downloadSVG } from "../utils/exportMap";

export interface CanvasEngineCallbacks {
  onSave: (data: string) => void;
  onNodePopup: (node: NoteMapNode) => void;
  resolveImageUrl?: (path: string) => string | null;
  onClipboardPaste?: () => void;
}

// --- 배경 설정 (여기서만 수정하면 됩니다) ---
const BG_COLOR = "#1E1E1E";
const DOT_COLOR = "#353535";
const DOT_SPACING = 20;
const DOT_RADIUS = 1.25;

let nextId = 1;
function generateId(): string {
  return `nm-${Date.now()}-${nextId++}`;
}

export class CanvasEngine {
  readonly viewport: Viewport;
  readonly selection: SelectionManager;
  readonly noteMap: NoteMap;
  readonly undoManager: UndoManager;

  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private inputHandler: InputHandler;
  private gridRenderer: GridRenderer;
  private nodeRenderer: NodeRenderer;
  private edgeRenderer: EdgeRenderer;
  private lodRenderer: LODRenderer;
  private tableRenderer: TableRenderer;
  private contextMenu: ContextMenu;
  private miniMap: MiniMap | null = null;
  private searchBar: SearchBar;
  private propertyPanel: PropertyPanel;
  private toolbar: Toolbar;
  private spatialGrid: SpatialGrid<NoteMapNode>;

  private renderRequested = false;
  private resizeObserver: ResizeObserver;
  private callbacks: CanvasEngineCallbacks;
  private container: HTMLElement;

  // Cell selection for merge
  private selectedCells: { tableId: string; cells: { row: number; col: number }[] } | null = null;

  constructor(container: HTMLElement, callbacks: CanvasEngineCallbacks) {
    this.callbacks = callbacks;
    this.container = container;
    this.viewport = new Viewport();
    this.selection = new SelectionManager();
    this.noteMap = new NoteMap();
    this.undoManager = new UndoManager();
    this.spatialGrid = new SpatialGrid<NoteMapNode>(300);

    // Canvas
    this.canvas = document.createElement("canvas");
    this.canvas.className = "notemap-canvas";
    container.appendChild(this.canvas);

    const ctx = this.canvas.getContext("2d");
    if (!ctx) throw new Error("Failed to get canvas 2d context");
    this.ctx = ctx;

    // Renderers
    this.gridRenderer = new GridRenderer();
    this.nodeRenderer = new NodeRenderer();
    if (callbacks.resolveImageUrl) {
      this.nodeRenderer.resolveImageUrl = callbacks.resolveImageUrl;
    }
    this.edgeRenderer = new EdgeRenderer();
    this.lodRenderer = new LODRenderer();
    this.tableRenderer = new TableRenderer();

    // UI
    this.contextMenu = new ContextMenu(container);
    this.searchBar = new SearchBar(container, this.noteMap, (node) => this.navigateToNode(node));

    const ppCallbacks: PropertyPanelCallbacks = {
      onNodeStyleChange: (id, prop, val) => this.handleNodeStyleChange(id, prop, val),
      onNodeShapeChange: (id, shape) => this.handleNodeShapeChange(id, shape),
      onNodeTextStyleChange: (id, prop, val) => this.handleNodeTextStyleChange(id, prop, val),
      onEdgeStyleChange: (id, prop, val) => this.handleEdgeStyleChange(id, prop, val),
      onEdgeTypeChange: (id, type) => this.handleEdgeTypeChange(id, type),
      onTableStyleChange: (id, prop, val) => this.handleTableStyleChange(id, prop, val),
      onRequestSave: () => this.save(),
    };
    this.propertyPanel = new PropertyPanel(container, ppCallbacks);

    const toolbarCallbacks: ToolbarCallbacks = {
      onModeChange: (mode) => { this.inputHandler.setMode(mode); this.toolbar.updateMode(mode); },
      onAddNode: (shape) => this.addNodeAtCenter(shape),
      onAddTable: () => this.addTableAtCenter(),
      onFitAll: () => this.fitAll(),
      onUndo: () => this.undo(),
      onRedo: () => this.redo(),
      onSearch: () => this.searchBar.show(),
      onExport: (fmt) => this.exportAs(fmt),
      onAutoLayout: () => { autoLayout(this.noteMap); this.save(); this.requestRender(); },
    };
    this.toolbar = new Toolbar(container, toolbarCallbacks);

    // Input
    const inputCallbacks: InputHandlerCallbacks = {
      onRequestRender: () => this.requestRender(),
      onNodeCreated: () => {},
      onEdgeCreated: () => {},
      onRequestSave: () => { this.pushUndo(); this.save(); },
      onNodePopup: (node) => this.callbacks.onNodePopup(node),
      onTableCellEdit: (table, row, col) => this.showCellEditor(table, row, col),
      onEdgeJunction: () => {},
    };
    this.inputHandler = new InputHandler(this.canvas, this.viewport, this.noteMap, this.selection, inputCallbacks);

    // Selection change → property panel
    this.selection.onChange(() => {
      const selectedNodes = this.selection.getSelectedIds("node");
      const selectedEdges = this.selection.getSelectedIds("edge");
      const selectedTables = this.selection.getSelectedIds("table");
      if (selectedNodes.length === 1) {
        const node = this.noteMap.getNodeById(selectedNodes[0]);
        if (node) this.propertyPanel.showForNode(node);
      } else if (selectedEdges.length === 1) {
        const edge = this.noteMap.getEdgeById(selectedEdges[0]);
        if (edge) this.propertyPanel.showForEdge(edge);
      } else if (selectedTables.length === 1 && this.noteMap.tables) {
        const table = this.noteMap.tables.find((t) => t.id === selectedTables[0]);
        if (table) this.propertyPanel.showForTable(table);
      } else {
        this.propertyPanel.hide();
      }
      // Clear cell selection when selecting non-table items
      if (selectedTables.length === 0 && this.selectedCells) {
        this.selectedCells = null;
      }
      this.requestRender();
    });

    // Context menu binding
    this.canvas.addEventListener("contextmenu", (e) => this.handleContextMenu(e));

    // Keyboard shortcuts
    document.addEventListener("keydown", (e) => this.handleGlobalKeydown(e));

    // Resize
    this.resizeObserver = new ResizeObserver(() => this.handleResize());
    this.resizeObserver.observe(container);

    this.handleResize();
    this.requestRender();
  }

  loadData(json: string): void {
    try {
      const data = JSON.parse(json);
      const map = NoteMap.fromJSON(data);
      this.noteMap.nodes = map.nodes;
      this.noteMap.edges = map.edges;
      this.noteMap.metadata = map.metadata;

      // Load tables
      if (data.tables) {
        this.noteMap.tables = data.tables.map((t: any) => NoteMapTable.fromJSON(t));
      }

      if (data.viewport) {
        this.viewport.x = data.viewport.x || 0;
        this.viewport.y = data.viewport.y || 0;
        this.viewport.zoom = data.viewport.zoom || 1;
      }

      this.rebuildSpatialGrid();
      this.undoManager.clear();
      // Push initial state so first undo has something to go back to
      this.undoManager.push(this.getStateSnapshot());
      this.requestRender();
    } catch {
      // Start with empty map
    }
  }

  save(): void {
    const data = this.noteMap.toJSON() as any;
    data.viewport = { x: this.viewport.x, y: this.viewport.y, zoom: this.viewport.zoom };
    data.tables = (this.noteMap.tables || []).map((t: NoteMapTable) => t.toJSON());
    this.callbacks.onSave(JSON.stringify(data, null, 2));
  }

  requestRender(): void {
    if (!this.renderRequested) {
      this.renderRequested = true;
      requestAnimationFrame(() => this.render());
    }
  }

  destroy(): void {
    if (this.pushUndoTimer) clearTimeout(this.pushUndoTimer);
    this.inputHandler.destroy();
    this.resizeObserver.disconnect();
    this.miniMap?.destroy();
    this.canvas.remove();
  }

  fitAll(): void {
    const bounds = this.noteMap.getBoundingRect();
    this.viewport.animateToFit(bounds, this.canvas.width, this.canvas.height, () => {
      this.requestRender();
    });
  }

  getInputHandler(): InputHandler {
    return this.inputHandler;
  }

  getCanvas(): HTMLCanvasElement {
    return this.canvas;
  }

  // --- Undo / Redo ---
  private pushUndoTimer: ReturnType<typeof setTimeout> | null = null;

  /** Get current state as a plain object (no JSON.stringify) */
  private getStateSnapshot(): any {
    const data = this.noteMap.toJSON() as any;
    data.viewport = { x: this.viewport.x, y: this.viewport.y, zoom: this.viewport.zoom };
    data.tables = (this.noteMap.tables || []).map((t: NoteMapTable) => t.toJSON());
    return data;
  }

  /** Push undo with 250ms debounce (like Obsidian Canvas) */
  private pushUndo(): void {
    if (this.pushUndoTimer) clearTimeout(this.pushUndoTimer);
    this.pushUndoTimer = setTimeout(() => {
      this.pushUndoTimer = null;
      this.undoManager.push(this.getStateSnapshot());
      this.toolbar.updateUndoRedo(this.undoManager.canUndo(), this.undoManager.canRedo());
    }, 250);
  }

  /** Push undo immediately (for discrete actions like add/delete) */
  private pushUndoNow(): void {
    if (this.pushUndoTimer) { clearTimeout(this.pushUndoTimer); this.pushUndoTimer = null; }
    this.undoManager.push(this.getStateSnapshot());
    this.toolbar.updateUndoRedo(this.undoManager.canUndo(), this.undoManager.canRedo());
  }

  private undo(): void {
    const prev = this.undoManager.undo();
    if (prev) {
      this.restoreState(prev);
      this.toolbar.updateUndoRedo(this.undoManager.canUndo(), this.undoManager.canRedo());
    }
  }

  private redo(): void {
    const next = this.undoManager.redo();
    if (next) {
      this.restoreState(next);
      this.toolbar.updateUndoRedo(this.undoManager.canUndo(), this.undoManager.canRedo());
    }
  }

  /** Restore state from snapshot — saves to file but does NOT push to undo history */
  private restoreState(snapshot: any): void {
    const map = NoteMap.fromJSON(snapshot);
    this.noteMap.nodes = map.nodes;
    this.noteMap.edges = map.edges;
    if (snapshot.tables) {
      this.noteMap.tables = snapshot.tables.map((t: any) => NoteMapTable.fromJSON(t));
    }
    this.selection.clear();
    this.rebuildSpatialGrid();
    // Save to file without pushing history
    this.callbacks.onSave(JSON.stringify(snapshot));
    this.requestRender();
  }

  // --- Add helpers ---
  addTextOnlyNode(worldX?: number, worldY?: number): void {
    const cx = worldX ?? this.viewport.screenToWorld(this.canvas.width / 2, this.canvas.height / 2).x;
    const cy = worldY ?? this.viewport.screenToWorld(this.canvas.width / 2, this.canvas.height / 2).y;
    const node = new NoteMapNode(generateId(), cx - 80, cy - 20, 160, 40);
    node.mode = "text-only";
    node.content.body = "텍스트";
    node.style.fillColor = "transparent";
    node.style.borderWidth = 0;
    this.pushUndo();
    this.noteMap.addNode(node);
    this.selection.select("node", node.id);
    this.save();
    this.requestRender();
  }

  addNodeAtCenter(shape: NodeShape): void {
    const center = this.viewport.screenToWorld(this.canvas.width / 2, this.canvas.height / 2);
    const node = new NoteMapNode(generateId(), center.x - 100, center.y - 60);
    node.shape = shape;
    node.content.title = "새 노드";
    this.pushUndo();
    this.noteMap.addNode(node);
    this.selection.select("node", node.id);
    this.save();
    this.requestRender();
  }

  addTableAtCenter(): void {
    const center = this.viewport.screenToWorld(this.canvas.width / 2, this.canvas.height / 2);
    const table = new NoteMapTable(generateId(), center.x - 180, center.y - 54);
    this.pushUndo();
    if (!this.noteMap.tables) this.noteMap.tables = [];
    this.noteMap.tables.push(table);
    this.save();
    this.requestRender();
  }

  // --- Property changes ---
  private handleNodeStyleChange(nodeId: string, prop: string, value: any): void {
    const node = this.noteMap.getNodeById(nodeId);
    if (!node) return;
    this.pushUndo();
    if (prop === "width") { node.width = value; }
    else if (prop === "height") { node.height = value; }
    else { (node.style as any)[prop] = value; }
    this.requestRender();
  }

  private handleNodeShapeChange(nodeId: string, shape: NodeShape): void {
    const node = this.noteMap.getNodeById(nodeId);
    if (!node) return;
    this.pushUndo();
    node.shape = shape;
    this.save();
    this.requestRender();
  }

  private handleNodeTextStyleChange(nodeId: string, prop: string, value: any): void {
    const node = this.noteMap.getNodeById(nodeId);
    if (!node) return;
    this.pushUndo();
    (node.textStyle as any)[prop] = value;
    this.save();
    this.requestRender();
  }

  private handleTableStyleChange(tableId: string, prop: string, value: any): void {
    if (!this.noteMap.tables) return;
    const table = this.noteMap.tables.find((t) => t.id === tableId);
    if (!table) return;
    this.pushUndo();
    if (prop === "_render") {
      // Just re-render, cells were already modified directly
    } else {
      (table as any)[prop] = value;
    }
    this.save();
    this.requestRender();
  }

  private handleEdgeStyleChange(edgeId: string, prop: string, value: any): void {
    const edge = this.noteMap.getEdgeById(edgeId);
    if (!edge) return;
    this.pushUndo();
    (edge.style as any)[prop] = value;
    this.requestRender();
  }

  private handleEdgeTypeChange(edgeId: string, type: any): void {
    const edge = this.noteMap.getEdgeById(edgeId);
    if (!edge) return;
    this.pushUndo();
    edge.type = type;
    this.save();
    this.requestRender();
  }

  // --- Context Menu ---
  private handleContextMenu(e: MouseEvent): void {
    e.preventDefault();
    const rect = this.canvas.getBoundingClientRect();
    const sx = e.clientX - rect.left;
    const sy = e.clientY - rect.top;
    const world = this.viewport.screenToWorld(sx, sy);

    // Clear cell selection when right-clicking outside a table
    let hitAnyTable = false;
    if (this.noteMap.tables) {
      for (const t of this.noteMap.tables) {
        if (t.containsPoint(world.x, world.y)) { hitAnyTable = true; break; }
      }
    }
    if (!hitAnyTable) {
      this.selectedCells = null;
      this.requestRender();
    }

    // Check node hit
    for (let i = this.noteMap.nodes.length - 1; i >= 0; i--) {
      const node = this.noteMap.nodes[i];
      if (node.containsPoint(world.x, world.y)) {
        this.selection.select("node", node.id);
        this.contextMenu.showForNode(sx, sy, node, {
          onEdit: () => this.callbacks.onNodePopup(node),
          onPopup: () => this.callbacks.onNodePopup(node),
          onChangeShape: (shape) => { this.handleNodeShapeChange(node.id, shape); },
          onChangeColor: (color) => { this.handleNodeStyleChange(node.id, "fillColor", color); this.save(); },
          onStartEdge: () => { this.inputHandler.setMode("edge"); this.toolbar.updateMode("edge"); },
          onDuplicate: () => this.duplicateNode(node),
          onOpenNote: () => {},
          onSwitchToContent: () => {
            this.pushUndo();
            node.mode = "content";
            node.content.title = node.content.linkedNote
              ? node.content.linkedNote.replace(/\.md$/, "").split("/").pop() || ""
              : node.content.title;
            node.content.linkedNote = null;
            this.save();
            this.requestRender();
          },
          onDelete: () => { this.pushUndo(); this.noteMap.removeNode(node.id); this.selection.clear(); this.save(); this.requestRender(); },
          isNoteLink: node.mode === "note-link",
        });
        return;
      }
    }

    // Check table hit
    if (this.noteMap.tables) {
      for (const table of this.noteMap.tables) {
        if (table.containsPoint(world.x, world.y)) {
          const cellPos = table.getCellAt(world.x, world.y);

          // Cell selection: Shift+right-click adds, plain right-click resets to this cell
          if (cellPos) {
            if (e.shiftKey && this.selectedCells && this.selectedCells.tableId === table.id) {
              if (!this.selectedCells.cells.some(c => c.row === cellPos.row && c.col === cellPos.col)) {
                this.selectedCells.cells.push(cellPos);
              }
            } else {
              this.selectedCells = { tableId: table.id, cells: [cellPos] };
            }
            this.requestRender();
          }

          // Can merge?
          const canMerge = this.selectedCells && this.selectedCells.tableId === table.id && this.selectedCells.cells.length >= 2;

          this.contextMenu.showForTable(sx, sy, {
            onAddRow: () => { this.pushUndo(); table.addRow(); this.save(); this.requestRender(); },
            onAddCol: () => { this.pushUndo(); table.addColumn(); this.save(); this.requestRender(); },
            onRemoveRow: () => { this.pushUndo(); table.removeRow(table.rows - 1); this.save(); this.requestRender(); },
            onRemoveCol: () => { this.pushUndo(); table.removeColumn(table.cols - 1); this.save(); this.requestRender(); },
            onEditCell: cellPos ? () => { this.showCellEditor(table, cellPos.row, cellPos.col); } : null,
            onCellColor: cellPos ? (color: string) => {
              this.pushUndo();
              table.cells[cellPos.row][cellPos.col].style.fillColor = color;
              this.save(); this.requestRender();
            } : null,
            onCellTextColor: cellPos ? (color: string) => {
              this.pushUndo();
              table.cells[cellPos.row][cellPos.col].style.textColor = color;
              this.save(); this.requestRender();
            } : null,
            onMergeCells: canMerge ? () => {
              this.pushUndo();
              const cells = this.selectedCells!.cells;
              const minR = Math.min(...cells.map(c => c.row));
              const maxR = Math.max(...cells.map(c => c.row));
              const minC = Math.min(...cells.map(c => c.col));
              const maxC = Math.max(...cells.map(c => c.col));
              table.mergeCells(minR, minC, maxR, maxC);
              this.selectedCells = null;
              this.save(); this.requestRender();
            } : null,
            onClearSelection: this.selectedCells ? () => { this.selectedCells = null; this.requestRender(); } : null,
            onDelete: () => { this.pushUndo(); this.noteMap.tables = this.noteMap.tables!.filter((t) => t.id !== table.id); this.save(); this.requestRender(); },
          });
          return;
        }
      }
    }

    // Check edge hit
    for (const edge of this.noteMap.edges) {
      const sn = this.noteMap.getNodeById(edge.source.nodeId);
      const tn = this.noteMap.getNodeById(edge.target.nodeId);
      if (!sn || !tn) continue;
      const sp = sn.getAnchorWorldPosition(edge.source.anchorId);
      const tp = tn.getAnchorWorldPosition(edge.target.anchorId);
      if (!sp || !tp) continue;
      const dist = this.pointToLineDist(world.x, world.y, sp.x, sp.y, tp.x, tp.y);
      if (dist < 10 / this.viewport.zoom) {
        this.selection.select("edge", edge.id);
        this.contextMenu.showForEdge(sx, sy, edge, {
          onChangeType: (type) => { this.handleEdgeTypeChange(edge.id, type); },
          onChangeColor: (color) => { this.handleEdgeStyleChange(edge.id, "color", color); this.save(); },
          onAddLabel: () => {
            const label = prompt("라벨을 입력하세요:");
            if (label !== null) { this.pushUndo(); edge.label = label; this.save(); this.requestRender(); }
          },
          onDelete: () => { this.pushUndo(); this.noteMap.removeEdge(edge.id); this.selection.clear(); this.save(); this.requestRender(); },
        });
        return;
      }
    }

    // Canvas context menu
    this.contextMenu.showForCanvas(sx, sy, {
      onAddNode: (shape) => {
        const node = new NoteMapNode(generateId(), world.x - 100, world.y - 60);
        node.shape = shape;
        node.content.title = "새 노드";
        this.pushUndo();
        this.noteMap.addNode(node);
        this.selection.select("node", node.id);
        this.save();
        this.requestRender();
      },
      onAddTextOnly: () => {
        this.addTextOnlyNode(world.x, world.y);
      },
      onAddTable: () => {
        const table = new NoteMapTable(generateId(), world.x - 180, world.y - 54);
        this.pushUndo();
        if (!this.noteMap.tables) this.noteMap.tables = [];
        this.noteMap.tables.push(table);
        this.save();
        this.requestRender();
      },
      onPaste: () => {},
      onFitAll: () => this.fitAll(),
      onAutoLayout: () => { this.pushUndo(); autoLayout(this.noteMap); this.save(); this.requestRender(); },
    });
  }

  private duplicateNode(node: NoteMapNode): void {
    this.pushUndo();
    const dup = new NoteMapNode(generateId(), node.x + 30, node.y + 30, node.width, node.height);
    dup.shape = node.shape;
    dup.style = { ...node.style };
    dup.content = { ...node.content };
    this.noteMap.addNode(dup);
    this.selection.select("node", dup.id);
    this.save();
    this.requestRender();
  }

  // --- Keyboard ---
  private handleGlobalKeydown(e: KeyboardEvent): void {
    if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement || e.target instanceof HTMLSelectElement) return;

    if ((e.ctrlKey || e.metaKey) && e.code === "KeyZ" && !e.shiftKey) {
      e.preventDefault();
      this.undo();
    }
    if ((e.ctrlKey || e.metaKey) && (e.code === "KeyY" || (e.code === "KeyZ" && e.shiftKey))) {
      e.preventDefault();
      this.redo();
    }
    if ((e.ctrlKey || e.metaKey) && e.code === "KeyF") {
      e.preventDefault();
      this.searchBar.show();
    }
    if ((e.ctrlKey || e.metaKey) && e.code === "KeyV") {
      // Try clipboard image paste (if callback is set)
      if (this.callbacks.onClipboardPaste) {
        this.callbacks.onClipboardPaste();
        // Don't prevent default — InputHandler's paste (node copy) will also run,
        // but clipboard image takes priority if found
      }
    }
    if (e.code === "KeyN" && !e.ctrlKey && !e.metaKey) {
      this.addNodeAtCenter("rectangle");
    }
    if (e.code === "KeyT" && !e.ctrlKey && !e.metaKey) {
      this.addTableAtCenter();
    }
    if ((e.ctrlKey || e.metaKey) && e.code === "KeyA") {
      e.preventDefault();
      for (const node of this.noteMap.nodes) {
        this.selection.select("node", node.id, true);
      }
      this.requestRender();
    }
    if ((e.ctrlKey || e.metaKey) && e.code === "Digit0" && !e.shiftKey) {
      e.preventDefault();
      this.viewport.setZoom(1, this.canvas.width / 2, this.canvas.height / 2);
      this.requestRender();
    }
    if ((e.ctrlKey || e.metaKey) && e.shiftKey && e.code === "Digit0") {
      e.preventDefault();
      this.fitAll();
    }
  }

  // --- Drop file onto canvas/node ---
  private static IMAGE_EXTENSIONS = [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp"];

  private isImageFile(fileName: string): boolean {
    const lower = fileName.toLowerCase();
    return CanvasEngine.IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext));
  }

  handleFileDrop(filePath: string, fileName: string, screenX: number, screenY: number): void {
    const world = this.viewport.screenToWorld(screenX, screenY);
    const isImage = this.isImageFile(fileName);

    // Check if dropped on an existing node
    for (let i = this.noteMap.nodes.length - 1; i >= 0; i--) {
      const node = this.noteMap.nodes[i];
      if (node.containsPoint(world.x, world.y)) {
        this.pushUndo();
        if (isImage) {
          node.mode = "image";
          node.content.imagePath = filePath;
        } else {
          node.mode = "note-link";
          node.content.linkedNote = filePath;
          node.content.title = fileName.replace(/\.md$/, "");
        }
        this.save();
        this.requestRender();
        return;
      }
    }

    // Dropped on empty area: create a new node
    this.pushUndo();
    if (isImage) {
      const node = new NoteMapNode(generateId(), world.x - 120, world.y - 90, 240, 180);
      node.mode = "image";
      node.content.imagePath = filePath;
      node.style.fillColor = "transparent";
      node.style.borderWidth = 0;
      this.noteMap.addNode(node);
      this.selection.select("node", node.id);
    } else {
      const node = new NoteMapNode(generateId(), world.x - 100, world.y - 40, 200, 80);
      node.mode = "note-link";
      node.content.linkedNote = filePath;
      node.content.title = fileName.replace(/\.md$/, "");
      this.noteMap.addNode(node);
      this.selection.select("node", node.id);
    }
    this.save();
    this.requestRender();
  }

  // --- Table Cell Editor (inline, directly on cell) ---
  private activeCellEditor: HTMLElement | null = null;

  private showCellEditor(table: NoteMapTable, row: number, col: number): void {
    // Remove any existing editor
    if (this.activeCellEditor) { this.activeCellEditor.remove(); this.activeCellEditor = null; }

    const cell = table.cells[row][col];
    if (cell.colspan === 0 || cell.rowspan === 0) return;

    // Show cell style in property panel
    this.showCellPropertyPanel(table, row, col);

    // Calculate cell world position
    let cellX = table.x;
    for (let c = 0; c < col; c++) cellX += table.colWidths[c];
    let cellY = table.y;
    for (let r = 0; r < row; r++) cellY += table.rowHeights[r];
    let cellW = 0;
    for (let c = col; c < col + cell.colspan && c < table.cols; c++) cellW += table.colWidths[c];
    let cellH = 0;
    for (let r = row; r < row + cell.rowspan && r < table.rows; r++) cellH += table.rowHeights[r];

    // Screen coords
    const sp = this.viewport.worldToScreen(cellX, cellY);
    const sw = cellW * this.viewport.zoom;
    const sh = cellH * this.viewport.zoom;

    // Create input directly on canvas, matching cell exactly
    const input = this.container.createEl("input", { cls: "notemap-cell-input" });
    input.type = "text";
    input.value = cell.value;
    input.style.position = "absolute";
    input.style.left = `${sp.x}px`;
    input.style.top = `${sp.y}px`;
    input.style.width = `${sw}px`;
    input.style.height = `${sh}px`;
    input.style.fontSize = `${cell.style.fontSize * this.viewport.zoom}px`;
    input.style.color = cell.style.textColor;
    input.style.textAlign = cell.style.textAlign;
    input.style.fontWeight = cell.style.fontWeight;
    input.style.background = cell.style.fillColor;
    input.style.zIndex = "50";

    this.activeCellEditor = input;

    // Real-time
    input.addEventListener("input", () => {
      cell.value = input.value;
      this.requestRender();
    });

    const finish = () => {
      if (!this.activeCellEditor) return;
      cell.value = input.value;
      this.save();
      this.requestRender();
      input.remove();
      this.activeCellEditor = null;
    };

    input.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter" || e.key === "Escape") { e.preventDefault(); finish(); }
      if (e.key === "Tab") {
        e.preventDefault();
        cell.value = input.value;
        const nextCol = col + 1 < table.cols ? col + 1 : 0;
        const nextRow = nextCol === 0 && row + 1 < table.rows ? row + 1 : row;
        input.remove();
        this.activeCellEditor = null;
        if (nextRow < table.rows) {
          this.showCellEditor(table, nextRow, nextCol);
        } else { this.save(); this.requestRender(); }
      }
    });

    input.addEventListener("blur", () => {
      // Delay to allow Tab handling
      setTimeout(() => { if (this.activeCellEditor === input) finish(); }, 100);
    });

    input.focus();
    input.select();
  }

  /** Show individual cell style in property panel */
  private showCellPropertyPanel(table: NoteMapTable, row: number, col: number): void {
    const cell = table.cells[row][col];
    this.propertyPanel.showForCell(table, row, col, cell);
  }

  // --- Inline text editor for text-only nodes ---
  private activeTextEditor: HTMLElement | null = null;

  showInlineTextEditor(node: NoteMapNode): void {
    if (this.activeTextEditor) { this.activeTextEditor.remove(); this.activeTextEditor = null; }

    const sp = this.viewport.worldToScreen(node.x, node.y);
    const sw = node.width * this.viewport.zoom;
    const sh = node.height * this.viewport.zoom;

    const textarea = this.container.createEl("textarea", { cls: "notemap-inline-text-editor" });
    textarea.value = node.content.body;
    textarea.style.position = "absolute";
    textarea.style.left = `${sp.x}px`;
    textarea.style.top = `${sp.y}px`;
    textarea.style.width = `${sw}px`;
    textarea.style.height = `${sh}px`;
    textarea.style.fontSize = `${node.textStyle.bodySize * this.viewport.zoom}px`;
    textarea.style.color = node.textStyle.color;
    textarea.style.fontFamily = node.textStyle.fontFamily;
    textarea.style.fontStyle = node.textStyle.italic ? "italic" : "normal";
    textarea.style.textAlign = node.textStyle.bodyAlign || "center";
    textarea.style.zIndex = "50";

    this.activeTextEditor = textarea;

    textarea.addEventListener("input", () => {
      node.content.body = textarea.value;
      this.requestRender();
    });

    const finish = () => {
      if (!this.activeTextEditor) return;
      node.content.body = textarea.value;
      this.save();
      this.requestRender();
      textarea.remove();
      this.activeTextEditor = null;
    };

    textarea.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Escape") { e.preventDefault(); finish(); }
    });
    textarea.addEventListener("blur", () => {
      setTimeout(() => { if (this.activeTextEditor === textarea) finish(); }, 100);
    });

    textarea.focus();
    textarea.select();
  }

  // --- Navigation ---
  navigateToNode(node: NoteMapNode): void {
    // Expand bounds so we don't zoom in too much — show surrounding context
    const bounds = node.getBounds();
    const padW = Math.max(bounds.width * 3, 400);
    const padH = Math.max(bounds.height * 3, 300);
    const expanded = {
      x: bounds.x - (padW - bounds.width) / 2,
      y: bounds.y - (padH - bounds.height) / 2,
      width: padW,
      height: padH,
    };
    this.viewport.animateToFit(expanded, this.canvas.width, this.canvas.height, () => {
      this.requestRender();
    });
    this.selection.select("node", node.id);
  }

  // --- Export ---
  private exportAs(format: "png" | "svg"): void {
    if (format === "svg") {
      const svg = exportToSVG(this.noteMap);
      downloadSVG(svg);
    } else {
      exportToPNG(this.noteMap, (ctx, _w, _h) => {
        // Render edges
        for (const edge of this.noteMap.edges) {
          const sn = this.noteMap.getNodeById(edge.source.nodeId);
          const tn = this.noteMap.getNodeById(edge.target.nodeId);
          if (!sn || !tn) continue;
          this.edgeRenderer.render(ctx, edge, sn, tn, false);
        }
        // Render tables
        if (this.noteMap.tables) {
          for (const table of this.noteMap.tables) {
            this.tableRenderer.render(ctx, table, false);
          }
        }
        // Render nodes
        for (const node of this.noteMap.nodes) {
          this.nodeRenderer.render(ctx, node, this.viewport, false);
        }
      });
    }
  }

  // --- Spatial Grid ---
  private rebuildSpatialGrid(): void {
    this.spatialGrid.rebuild(this.noteMap.nodes);
  }

  /** Resolve an edge endpoint ID to a node-like object (supports both nodes and tables) */
  private resolveEdgeEndpoint(id: string): NoteMapNode | null {
    const node = this.noteMap.getNodeById(id);
    if (node) return node;

    // Check tables — create a lightweight adapter
    if (this.noteMap.tables) {
      const table = this.noteMap.tables.find((t) => t.id === id);
      if (table) {
        const adapter = new NoteMapNode(table.id, table.x, table.y, table.width, table.height);
        adapter.anchors = table.anchors.map((a) => ({ id: a.id, position: a.position }));
        return adapter;
      }
    }
    return null;
  }

  // --- Render ---
  private render(): void {
    this.renderRequested = false;
    const { width, height } = this.canvas;
    const ctx = this.ctx;

    // Clear
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, width, height);

    ctx.fillStyle = BG_COLOR;
    ctx.fillRect(0, 0, width, height);

    // Dot pattern (Obsidian Canvas style)
    this.drawDotPattern(ctx, width, height);

    // Apply viewport transform
    this.viewport.applyTransform(ctx);

    // Edges (supports both nodes and tables as endpoints)
    for (const edge of this.noteMap.edges) {
      const sourceNode = this.resolveEdgeEndpoint(edge.source.nodeId);
      const targetNode = this.resolveEdgeEndpoint(edge.target.nodeId);
      if (!sourceNode || !targetNode) continue;
      const isSelected = this.selection.isSelected("edge", edge.id);
      this.edgeRenderer.render(ctx, edge, sourceNode, targetNode, isSelected);
    }

    // Edge preview
    const edgePreview = this.inputHandler.getEdgePreview();
    if (edgePreview) {
      this.edgeRenderer.renderPreview(ctx, edgePreview.from, edgePreview.to);
    }

    // Tables
    if (this.noteMap.tables) {
      const hovNodeId = this.inputHandler.getHoveredNodeId();
      const snapNodeId = this.inputHandler.getSnapTargetNodeId();
      for (const table of this.noteMap.tables) {
        const isSelected = this.selection.isSelected("table", table.id);
        const isHovered = table.id === hovNodeId || table.id === snapNodeId;
        const cellSel = this.selectedCells && this.selectedCells.tableId === table.id ? this.selectedCells.cells : null;
        this.tableRenderer.render(ctx, table, isSelected, isHovered, cellSel);
      }
    }

    // Nodes (with LOD + hover anchor points + snap targets)
    const useFull = this.lodRenderer.shouldUseFullRenderer(this.viewport.zoom);
    const hoveredNodeId = this.inputHandler.getHoveredNodeId();
    const hoveredAnchorId = this.inputHandler.getHoveredAnchorId();
    const occupiedAnchors = this.inputHandler.getOccupiedAnchors();
    const snapTargetNodeId = this.inputHandler.getSnapTargetNodeId();
    const snapTargetAnchorId = this.inputHandler.getSnapTargetAnchorId();

    for (const node of this.noteMap.nodes) {
      const isSelected = this.selection.isSelected("node", node.id);
      const isHovered = node.id === hoveredNodeId;
      const isSnapTarget = node.id === snapTargetNodeId;
      if (useFull) {
        this.nodeRenderer.render(
          ctx, node, this.viewport, isSelected,
          isHovered || isSnapTarget,
          isHovered ? hoveredAnchorId : (isSnapTarget ? snapTargetAnchorId : null),
          isHovered ? occupiedAnchors : null
        );
      } else {
        this.lodRenderer.renderNode(ctx, node, this.viewport, isSelected);
      }
    }

    // Box selection rectangle
    const boxRect = this.inputHandler.getBoxSelectRect();
    if (boxRect) {
      ctx.fillStyle = "rgba(59, 130, 246, 0.08)";
      ctx.fillRect(boxRect.x, boxRect.y, boxRect.w, boxRect.h);
      ctx.strokeStyle = "rgba(59, 130, 246, 0.5)";
      ctx.lineWidth = 1 / this.viewport.zoom;
      ctx.setLineDash([4 / this.viewport.zoom, 4 / this.viewport.zoom]);
      ctx.strokeRect(boxRect.x, boxRect.y, boxRect.w, boxRect.h);
      ctx.setLineDash([]);
    }

    // Alignment snap guides
    const guides = this.inputHandler.getSnapGuides();
    if (guides.length > 0) {
      ctx.strokeStyle = "rgba(255, 100, 100, 0.6)";
      ctx.lineWidth = 1 / this.viewport.zoom;
      ctx.setLineDash([4 / this.viewport.zoom, 4 / this.viewport.zoom]);
      const vis = this.viewport.getVisibleRect(width, height);
      for (const g of guides) {
        ctx.beginPath();
        if (g.type === "v") {
          ctx.moveTo(g.pos, vis.y);
          ctx.lineTo(g.pos, vis.y + vis.height);
        } else {
          ctx.moveTo(vis.x, g.pos);
          ctx.lineTo(vis.x + vis.width, g.pos);
        }
        ctx.stroke();
      }
      ctx.setLineDash([]);
    }

    // Zoom indicator
    this.drawZoomIndicator(ctx, width, height);

    // MiniMap
    if (this.miniMap) {
      this.miniMap.render(width, height);
    }
  }

  private drawDotPattern(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    const dotSpacing = DOT_SPACING;
    const dotRadius = DOT_RADIUS;
    const dotColor = DOT_COLOR;

    const zoom = this.viewport.zoom;
    if (zoom < 0.15) return; // too zoomed out for dots

    const spacing = dotSpacing * zoom;
    if (spacing < 6) return; // dots too dense

    const offsetX = this.viewport.x % spacing;
    const offsetY = this.viewport.y % spacing;

    ctx.fillStyle = dotColor;

    for (let x = offsetX; x < width; x += spacing) {
      for (let y = offsetY; y < height; y += spacing) {
        ctx.beginPath();
        ctx.arc(x, y, dotRadius * Math.min(zoom, 1), 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  setZoomSensitivity(level: number): void {
    this.inputHandler.setZoomSensitivity(level);
  }

  getZoomSensitivity(): number {
    return this.inputHandler.getZoomSensitivity();
  }

  private drawZoomIndicator(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const zoom = this.viewport.zoom;
    const text = `${Math.round(zoom * 100)}%`;

    ctx.font = "12px -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillStyle = "rgba(255, 255, 255, 0.45)";
    ctx.textAlign = "right";
    ctx.textBaseline = "bottom";
    ctx.fillText(text, width - 200, height - 12);
  }

  private handleResize(): void {
    const parent = this.canvas.parentElement;
    if (!parent) return;
    const rect = parent.getBoundingClientRect();
    this.canvas.width = rect.width;
    this.canvas.height = rect.height;
    this.requestRender();
  }

  private pointToLineDist(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
    const dx = x2 - x1, dy = y2 - y1;
    const lenSq = dx * dx + dy * dy;
    if (lenSq === 0) return Math.hypot(px - x1, py - y1);
    let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(px - (x1 + t * dx), py - (y1 + t * dy));
  }

  initMiniMap(container: HTMLElement): void {
    this.miniMap = new MiniMap(container, this.viewport, this.noteMap, () => this.requestRender());
  }
}
