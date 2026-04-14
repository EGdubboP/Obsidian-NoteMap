import { Plugin, WorkspaceLeaf, TextFileView, TFile, MarkdownRenderer, ItemView } from "obsidian";
import { CanvasEngine } from "./core/CanvasEngine";
import { NoteMapNode } from "./models/Node";

const NOTEMAP_VIEW_TYPE = "notemap-view";
const NOTEMAP_OUTLINE_VIEW = "notemap-outline";
const NOTEMAP_EXTENSION = "notemap";

class NoteMapView extends TextFileView {
  engine: CanvasEngine | null = null;
  private container: HTMLElement | null = null;

  getViewType(): string {
    return NOTEMAP_VIEW_TYPE;
  }

  getViewData(): string {
    return this.data;
  }

  setViewData(data: string, clear: boolean): void {
    this.data = data;
    if (clear) {
      this.initCanvas();
    }
    if (this.engine && data) {
      this.engine.loadData(data);
    }
  }

  clear(): void {
    this.data = "";
  }

  getIcon(): string {
    return "network";
  }

  onOpen(): Promise<void> {
    this.initCanvas();
    return Promise.resolve();
  }

  onClose(): Promise<void> {
    if (this.engine) {
      this.engine.destroy();
      this.engine = null;
    }
    return Promise.resolve();
  }

  private initCanvas(): void {
    if (this.engine) {
      this.engine.destroy();
    }

    const contentEl = this.contentEl;
    contentEl.empty();
    contentEl.addClass("notemap-container");

    this.container = contentEl.createDiv({ cls: "notemap-canvas-wrapper" });

    this.engine = new CanvasEngine(this.container, {
      onSave: (json: string) => {
        this.data = json;
        this.requestSave();
      },
      onNodePopup: (node: NoteMapNode) => {
        this.showNodePopup(node);
      },
      onClipboardPaste: () => {
        this.handleClipboardPaste();
      },
      resolveImageUrl: (path: string) => {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) {
          return this.app.vault.getResourcePath(file);
        }
        return null;
      },
    });

    // Zoom sensitivity control
    this.addZoomControl(this.container);

    // Drag & drop files from Obsidian file explorer
    this.registerDragDrop(this.container);

    if (this.data) {
      this.engine.loadData(this.data);
    }
  }

  private registerDragDrop(container: HTMLElement): void {
    // Must listen on the canvas element itself, not just the wrapper
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer) {
        e.dataTransfer.dropEffect = "copy";
      }
    };

    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      if (!this.engine || !e.dataTransfer) return;

      const rect = container.getBoundingClientRect();
      const sx = e.clientX - rect.left;
      const sy = e.clientY - rect.top;

      // Debug: log all available data types and their values
      const dt = e.dataTransfer;
      console.log("[NoteMap Drop] types:", Array.from(dt.types));
      for (const type of dt.types) {
        try {
          console.log(`[NoteMap Drop] ${type}:`, dt.getData(type));
        } catch { /* */ }
      }
      console.log("[NoteMap Drop] files:", dt.files.length);

      // Obsidian uses multiple data formats for internal file drag
      // Try them all in priority order

      let filePath: string | null = null;

      const textData = dt.getData("text/plain").trim();

      // Obsidian sends: obsidian://open?vault=VAULT&file=ENCODED_FILE_NAME
      if (textData.startsWith("obsidian://")) {
        try {
          const url = new URL(textData);
          const fileParam = url.searchParams.get("file");
          if (fileParam) filePath = decodeURIComponent(fileParam);
        } catch { /* */ }
      }

      // Fallback: raw path or [[wikilink]]
      if (!filePath && textData) {
        let path = textData;
        if (path.startsWith("[[") && path.endsWith("]]")) {
          path = path.slice(2, -2);
        }
        filePath = path;
      }

      // Try Obsidian vault file first
      if (filePath) {
        const imageExts = [".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".bmp"];
        const hasExt = filePath.includes(".");
        const isImage = imageExts.some((ext) => filePath!.toLowerCase().endsWith(ext));
        if (!hasExt && !isImage) {
          filePath = filePath + ".md";
        }

        let file = this.app.vault.getAbstractFileByPath(filePath);
        if (!file || !(file instanceof TFile)) {
          const allFiles = this.app.vault.getFiles();
          const baseName = filePath.replace(/\.[^.]+$/, "");
          const found = allFiles.find(
            (f) => f.basename === baseName || f.path === filePath
          );
          if (found) file = found;
        }

        if (file instanceof TFile) {
          this.engine.handleFileDrop(file.path, file.name, sx, sy);
          return;
        }
      }

      // OS file drop: save image to vault then reference it
      if (dt.files && dt.files.length > 0) {
        this.handleOSFileDrop(dt.files[0], sx, sy);
        return;
      }
    };

    container.addEventListener("dragover", onDragOver);
    container.addEventListener("drop", onDrop);

    // Also register on the canvas element when it's created
    const canvas = this.engine?.getCanvas();
    if (canvas) {
      canvas.addEventListener("dragover", onDragOver);
      canvas.addEventListener("drop", onDrop);
    }
  }

  /** Save an OS file (from drag or clipboard) into the vault and add as image node */
  private async handleOSFileDrop(file: File, sx: number, sy: number): Promise<void> {
    if (!this.engine) return;
    const imageExts = ["png", "jpg", "jpeg", "gif", "svg", "webp", "bmp"];
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    if (!imageExts.includes(ext)) return;

    const buffer = await file.arrayBuffer();
    const fileName = `notemap-${Date.now()}.${ext}`;
    const folder = "NoteMap-Images";

    // Ensure folder exists
    if (!this.app.vault.getAbstractFileByPath(folder)) {
      await this.app.vault.createFolder(folder);
    }

    const filePath = `${folder}/${fileName}`;
    const created = await this.app.vault.createBinary(filePath, buffer);
    this.engine.handleFileDrop(created.path, created.name, sx, sy);
  }

  /** Save clipboard image into vault and add as image node */
  private async handleClipboardPaste(): Promise<void> {
    if (!this.engine) return;
    try {
      const items = await navigator.clipboard.read();
      for (const item of items) {
        const imageType = item.types.find((t) => t.startsWith("image/"));
        if (imageType) {
          const blob = await item.getType(imageType);
          const ext = imageType.split("/")[1] || "png";
          const buffer = await blob.arrayBuffer();
          const fileName = `notemap-${Date.now()}.${ext}`;
          const folder = "NoteMap-Images";

          if (!this.app.vault.getAbstractFileByPath(folder)) {
            await this.app.vault.createFolder(folder);
          }

          const filePath = `${folder}/${fileName}`;
          const created = await this.app.vault.createBinary(filePath, buffer);

          // Place at center of viewport
          const cx = this.engine.getCanvas().width / 2;
          const cy = this.engine.getCanvas().height / 2;
          this.engine.handleFileDrop(created.path, created.name, cx, cy);
          return;
        }
      }
    } catch {
      // Clipboard API not available or no image
    }
  }

  private addZoomControl(container: HTMLElement): void {
    const control = container.createDiv({ cls: "notemap-zoom-control" });

    const label = control.createSpan({ cls: "notemap-zoom-label", text: "줌 감도" });

    const slider = control.createEl("input", {
      cls: "notemap-zoom-slider",
      attr: { type: "range", min: "1", max: "5", value: "1", step: "1" },
    });

    const val = control.createSpan({ cls: "notemap-zoom-val", text: "1" });

    slider.addEventListener("input", () => {
      const level = parseInt(slider.value);
      val.textContent = String(level);
      this.engine?.setZoomSensitivity(level);
    });
  }

  private showTextOnlyPopup(node: NoteMapNode): void {
    const modal = this.contentEl.createDiv({ cls: "notemap-popup-overlay" });
    const popup = modal.createDiv({ cls: "notemap-popup" });
    popup.style.width = "400px";

    const header = popup.createDiv({ cls: "notemap-popup-header" });
    header.createSpan({ cls: "notemap-popup-header-label", text: "텍스트 편집" });
    const closeBtn = header.createEl("button", { cls: "notemap-popup-close", text: "X" });

    const bodyArea = popup.createEl("textarea", {
      cls: "notemap-popup-body",
      attr: { placeholder: "텍스트를 입력하세요..." },
    });
    bodyArea.value = node.content.body;
    bodyArea.style.minHeight = "120px";

    bodyArea.addEventListener("input", () => {
      node.content.body = bodyArea.value;
      this.engine?.requestRender();
    });

    const closeModal = () => { this.engine?.save(); modal.remove(); };
    closeBtn.addEventListener("click", closeModal);
    modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { closeModal(); document.removeEventListener("keydown", escHandler); }
    };
    document.addEventListener("keydown", escHandler);
    bodyArea.focus();
  }

  private showNodePopup(node: NoteMapNode): void {
    // image mode → no popup
    if (node.mode === "image") return;

    // text-only mode → inline edit on canvas
    if (node.mode === "text-only") {
      this.engine?.showInlineTextEditor(node);
      return;
    }

    // note-link mode + double-click → open the linked note directly
    if (node.mode === "note-link" && node.content.linkedNote) {
      const file = this.app.vault.getAbstractFileByPath(node.content.linkedNote);
      if (file instanceof TFile) {
        this.app.workspace.getLeaf(false).openFile(file);
        return;
      }
    }

    const modal = this.contentEl.createDiv({ cls: "notemap-popup-overlay" });
    const popup = modal.createDiv({ cls: "notemap-popup" });

    // Header
    const header = popup.createDiv({ cls: "notemap-popup-header" });
    header.createSpan({ cls: "notemap-popup-header-label", text: "노드 편집" });
    const closeBtn = header.createEl("button", { cls: "notemap-popup-close", text: "X" });

    // Mode selector
    const modeBar = popup.createDiv({ cls: "notemap-popup-tabs" });
    const contentModeBtn = modeBar.createEl("button", {
      cls: `notemap-popup-tab ${node.mode === "content" ? "is-active" : ""}`,
      text: "제목 + 내용",
    });
    const noteLinkModeBtn = modeBar.createEl("button", {
      cls: `notemap-popup-tab ${node.mode === "note-link" ? "is-active" : ""}`,
      text: "노트 연결",
    });

    // Body
    const body = popup.createDiv({ cls: "notemap-popup-body-wrapper" });

    // --- Content mode panel ---
    const contentPanel = body.createDiv({ cls: `notemap-popup-panel ${node.mode === "content" ? "is-active" : ""}` });
    const titleRow = contentPanel.createDiv({ cls: "notemap-popup-field" });
    titleRow.createEl("label", { text: "제목" });
    const titleInput = titleRow.createEl("input", {
      cls: "notemap-popup-input",
      attr: { type: "text", value: node.content.title, placeholder: "노드 제목" },
    });

    const bodyRow = contentPanel.createDiv({ cls: "notemap-popup-field" });
    bodyRow.createEl("label", { text: "내용" });
    const bodyArea = bodyRow.createEl("textarea", {
      cls: "notemap-popup-body",
      attr: { placeholder: "내용을 입력하세요..." },
    });
    bodyArea.value = node.content.body;

    // --- Note-link mode panel ---
    const noteLinkPanel = body.createDiv({ cls: `notemap-popup-panel ${node.mode === "note-link" ? "is-active" : ""}` });
    const noteRow = noteLinkPanel.createDiv({ cls: "notemap-popup-field" });
    noteRow.createEl("label", { text: "노트 경로" });

    const noteInputRow = noteRow.createDiv({ cls: "notemap-popup-note-row" });
    const noteInput = noteInputRow.createEl("input", {
      cls: "notemap-popup-input",
      attr: { type: "text", value: node.content.linkedNote || "", placeholder: "folder/note.md" },
    });
    const browseBtn = noteInputRow.createEl("button", { cls: "notemap-popup-btn", text: "찾기" });

    const notePreview = noteLinkPanel.createDiv({ cls: "notemap-popup-note-preview" });
    if (node.content.linkedNote) {
      const file = this.app.vault.getAbstractFileByPath(node.content.linkedNote);
      notePreview.textContent = file ? `"${node.content.linkedNote}" 연결됨` : `"${node.content.linkedNote}" (파일 없음)`;
    }

    // Browse: list vault md files
    browseBtn.addEventListener("click", () => {
      const files = this.app.vault.getMarkdownFiles();
      const listEl = noteLinkPanel.createDiv({ cls: "notemap-popup-file-list" });
      const searchInput = listEl.createEl("input", {
        cls: "notemap-popup-input",
        attr: { type: "text", placeholder: "파일 검색..." },
      });
      const listContainer = listEl.createDiv({ cls: "notemap-popup-file-items" });

      const renderFiles = (query: string) => {
        listContainer.empty();
        const filtered = files.filter((f) => f.path.toLowerCase().includes(query.toLowerCase())).slice(0, 20);
        for (const f of filtered) {
          const item = listContainer.createDiv({ cls: "notemap-popup-file-item", text: f.path });
          item.addEventListener("click", () => {
            noteInput.value = f.path;
            node.content.linkedNote = f.path;
            node.content.title = f.basename;
            notePreview.textContent = `"${f.path}" 연결됨`;
            listEl.remove();
            this.engine?.requestRender();
          });
        }
      };

      renderFiles("");
      searchInput.addEventListener("input", () => renderFiles(searchInput.value));
      searchInput.focus();
    });

    // Mode switching
    contentModeBtn.addEventListener("click", () => {
      node.mode = "content";
      contentModeBtn.addClass("is-active");
      noteLinkModeBtn.removeClass("is-active");
      contentPanel.addClass("is-active");
      noteLinkPanel.removeClass("is-active");
      this.engine?.requestRender();
    });

    noteLinkModeBtn.addEventListener("click", () => {
      node.mode = "note-link";
      noteLinkModeBtn.addClass("is-active");
      contentModeBtn.removeClass("is-active");
      noteLinkPanel.addClass("is-active");
      contentPanel.removeClass("is-active");
      this.engine?.requestRender();
    });

    // Input events
    titleInput.addEventListener("input", () => {
      node.content.title = titleInput.value;
      this.engine?.requestRender();
    });
    bodyArea.addEventListener("input", () => {
      node.content.body = bodyArea.value;
      this.engine?.requestRender();
    });
    noteInput.addEventListener("change", () => {
      node.content.linkedNote = noteInput.value || null;
      if (noteInput.value) {
        const file = this.app.vault.getAbstractFileByPath(noteInput.value);
        if (file instanceof TFile) node.content.title = file.basename;
        notePreview.textContent = file ? `"${noteInput.value}" 연결됨` : `"${noteInput.value}" (파일 없음)`;
      }
      this.engine?.requestRender();
    });

    // Close
    const closeModal = () => {
      this.engine?.save();
      modal.remove();
    };
    closeBtn.addEventListener("click", closeModal);
    modal.addEventListener("click", (e) => { if (e.target === modal) closeModal(); });
    const escHandler = (e: KeyboardEvent) => {
      if (e.key === "Escape") { closeModal(); document.removeEventListener("keydown", escHandler); }
    };
    document.addEventListener("keydown", escHandler);

    titleInput.focus();
  }
}

// --- Outline sidebar view ---
class NoteMapOutlineView extends ItemView {
  private plugin: NoteMapPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: NoteMapPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string { return NOTEMAP_OUTLINE_VIEW; }
  getDisplayText(): string { return "NoteMap 목록"; }
  getIcon(): string { return "list"; }

  async onOpen(): Promise<void> {
    this.refresh();
    // Re-render when active leaf changes
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.refresh()));
  }

  refresh(): void {
    const container = this.contentEl;
    container.empty();

    // Find any open NoteMapView
    let engine: CanvasEngine | null = null;
    this.app.workspace.iterateAllLeaves((leaf) => {
      if (engine) return;
      if (leaf.view && leaf.view.getViewType() === NOTEMAP_VIEW_TYPE) {
        const view = leaf.view as NoteMapView;
        if (view.engine) engine = view.engine;
      }
    });

    if (!engine) {
      container.createDiv({ cls: "notemap-outline-empty", text: "NoteMap 파일을 열어주세요" });
      return;
    }
    const noteMap = engine.noteMap;
    const eng = engine; // capture for closures

    // Header
    const header = container.createDiv({ cls: "notemap-outline-header" });
    header.createSpan({ text: `노드 ${noteMap.nodes.length}개` });
    if (noteMap.tables && noteMap.tables.length > 0) {
      header.createSpan({ text: ` · 표 ${noteMap.tables.length}개` });
    }

    // Add group button
    const addGroupBtn = header.createEl("button", { cls: "notemap-outline-add-group", text: "＋ 그룹" });
    addGroupBtn.addEventListener("click", () => {
      // Show inline input instead of prompt()
      const inputRow = container.createDiv({ cls: "notemap-outline-group-input" });
      const input = inputRow.createEl("input", {
        cls: "notemap-outline-group-name-input",
        attr: { type: "text", placeholder: "그룹 이름 입력" },
      });
      const confirmBtn = inputRow.createEl("button", { text: "확인", cls: "notemap-outline-group-confirm" });
      const cancelBtn = inputRow.createEl("button", { text: "취소", cls: "notemap-outline-group-cancel" });

      const submit = () => {
        const name = input.value.trim();
        if (name && !noteMap.groups.includes(name)) {
          noteMap.groups.push(name);
          eng.save();
        }
        inputRow.remove();
        this.refresh();
      };

      confirmBtn.addEventListener("click", submit);
      cancelBtn.addEventListener("click", () => { inputRow.remove(); });
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") submit();
        if (e.key === "Escape") { inputRow.remove(); }
      });
      input.focus();
    });

    const list = container.createDiv({ cls: "notemap-outline-list" });

    // Collect groups — include registered empty groups too
    const groups = new Map<string, NoteMapNode[]>();
    for (const gName of noteMap.groups) {
      groups.set(gName, []);
    }
    const ungrouped: NoteMapNode[] = [];
    for (const node of noteMap.nodes) {
      if (node.group) {
        if (!groups.has(node.group)) groups.set(node.group, []);
        groups.get(node.group)!.push(node);
      } else {
        ungrouped.push(node);
      }
    }

    // Render helper
    const getIcon = (node: NoteMapNode): string => {
      if (node.mode === "note-link") return "🔗";
      if (node.mode === "image") return "🖼";
      if (node.mode === "text-only") return "T";
      if (node.shape === "circle") return "○";
      if (node.shape === "triangle") return "△";
      return "□";
    };

    const getLabel = (node: NoteMapNode): string => {
      if (node.mode === "note-link") return node.content.linkedNote?.replace(/\.md$/, "").split("/").pop() || node.id;
      if (node.mode === "image") return node.content.imagePath?.split("/").pop() || "이미지";
      if (node.mode === "text-only") return node.content.body?.substring(0, 30) || "텍스트";
      return node.content.title || node.content.body?.substring(0, 20) || node.id;
    };

    const allGroupNames = Array.from(groups.keys());

    const renderNodeItem = (node: NoteMapNode, parent: HTMLElement) => {
      const item = parent.createDiv({ cls: "notemap-outline-item" });
      item.setAttribute("draggable", "true");
      item.createSpan({ cls: "notemap-outline-icon", text: getIcon(node) });
      item.createSpan({ cls: "notemap-outline-label", text: getLabel(node) });

      // Drag start — store node id
      item.addEventListener("dragstart", (ev) => {
        ev.dataTransfer?.setData("notemap/node-id", node.id);
        item.addClass("is-dragging");
      });
      item.addEventListener("dragend", () => { item.removeClass("is-dragging"); });

      item.addEventListener("click", () => eng.navigateToNode(node));

      // Right-click: move to group
      item.addEventListener("contextmenu", (e) => {
        e.preventDefault();
        const menu = container.createDiv({ cls: "notemap-outline-menu" });
        menu.style.left = `${e.clientX - container.getBoundingClientRect().left}px`;
        menu.style.top = `${e.clientY - container.getBoundingClientRect().top}px`;

        // Move to existing groups
        for (const gName of allGroupNames) {
          if (gName === node.group) continue;
          const mi = menu.createDiv({ cls: "notemap-outline-menu-item", text: `→ ${gName}` });
          mi.addEventListener("click", () => { node.group = gName; eng.save(); menu.remove(); this.refresh(); });
        }

        // New group
        const newGrp = menu.createDiv({ cls: "notemap-outline-menu-item", text: "→ 새 그룹..." });
        newGrp.addEventListener("click", () => {
          menu.remove();
          const inputRow = container.createDiv({ cls: "notemap-outline-group-input" });
          const inp = inputRow.createEl("input", {
            cls: "notemap-outline-group-name-input",
            attr: { type: "text", placeholder: "그룹 이름 입력" },
          });
          const ok = inputRow.createEl("button", { text: "확인", cls: "notemap-outline-group-confirm" });
          const doIt = () => {
            const name = inp.value.trim();
            if (name) {
              node.group = name;
              if (!noteMap.groups.includes(name)) noteMap.groups.push(name);
              eng.save();
            }
            inputRow.remove();
            this.refresh();
          };
          ok.addEventListener("click", doIt);
          inp.addEventListener("keydown", (ev) => {
            if (ev.key === "Enter") doIt();
            if (ev.key === "Escape") { inputRow.remove(); }
          });
          inp.focus();
        });

        // Remove from group
        if (node.group) {
          const ungrp = menu.createDiv({ cls: "notemap-outline-menu-item", text: "그룹 해제" });
          ungrp.addEventListener("click", () => { node.group = ""; eng.save(); menu.remove(); this.refresh(); });
        }

        const closeMenu = (ev: MouseEvent) => {
          if (!menu.contains(ev.target as Node)) { menu.remove(); document.removeEventListener("mousedown", closeMenu); }
        };
        setTimeout(() => document.addEventListener("mousedown", closeMenu), 0);
      });
    };

    // Drop handler helper
    const makeDropZone = (el: HTMLElement, targetGroup: string) => {
      el.addEventListener("dragover", (ev) => {
        ev.preventDefault();
        if (ev.dataTransfer) ev.dataTransfer.dropEffect = "move";
        el.addClass("is-drop-target");
      });
      el.addEventListener("dragleave", () => { el.removeClass("is-drop-target"); });
      el.addEventListener("drop", (ev) => {
        ev.preventDefault();
        el.removeClass("is-drop-target");
        const nodeId = ev.dataTransfer?.getData("notemap/node-id");
        if (!nodeId) return;
        const node = noteMap.getNodeById(nodeId);
        if (node) {
          node.group = targetGroup;
          eng.save();
          this.refresh();
        }
      });
    };

    // Render groups
    for (const [groupName, nodes] of groups) {
      const groupEl = list.createDiv({ cls: "notemap-outline-group" });
      const groupHeader = groupEl.createDiv({ cls: "notemap-outline-group-header" });
      groupHeader.createSpan({ cls: "notemap-outline-group-arrow", text: "▾" });
      groupHeader.createSpan({ text: `${groupName} (${nodes.length})` });

      // Group header is a drop target
      makeDropZone(groupHeader, groupName);

      const groupBody = groupEl.createDiv({ cls: "notemap-outline-group-body" });
      makeDropZone(groupBody, groupName);

      for (const node of nodes) {
        renderNodeItem(node, groupBody);
      }

      // Toggle collapse
      let collapsed = false;
      groupHeader.addEventListener("click", () => {
        collapsed = !collapsed;
        groupBody.style.display = collapsed ? "none" : "block";
        groupHeader.querySelector(".notemap-outline-group-arrow")!.textContent = collapsed ? "▸" : "▾";
      });
    }

    // Ungrouped area — drop here to remove from group
    const ungroupedZone = list.createDiv({ cls: "notemap-outline-ungrouped-zone" });
    if (groups.size > 0) {
      ungroupedZone.textContent = "그룹 없음";
    }
    makeDropZone(ungroupedZone, "");

    // Ungrouped nodes
    for (const node of ungrouped) {
      renderNodeItem(node, ungroupedZone);
    }

    // Tables
    if (noteMap.tables && noteMap.tables.length > 0) {
      for (const table of noteMap.tables) {
        const item = list.createDiv({ cls: "notemap-outline-item" });
        item.createSpan({ cls: "notemap-outline-icon", text: "▦" });
        item.createSpan({ cls: "notemap-outline-label", text: `표 ${table.rows}×${table.cols}` });
        item.addEventListener("click", () => {
          eng.viewport.animateToFit(
            { x: table.x, y: table.y, width: table.width, height: table.height },
            eng.getCanvas().width, eng.getCanvas().height,
            () => eng.requestRender()
          );
        });
      }
    }
  }
}

export default class NoteMapPlugin extends Plugin {
  async onload(): Promise<void> {
    this.registerView(NOTEMAP_VIEW_TYPE, (leaf: WorkspaceLeaf) => new NoteMapView(leaf));
    this.registerView(NOTEMAP_OUTLINE_VIEW, (leaf: WorkspaceLeaf) => new NoteMapOutlineView(leaf, this));
    this.registerExtensions([NOTEMAP_EXTENSION], NOTEMAP_VIEW_TYPE);

    this.addRibbonIcon("network", "NoteMap", () => {
      this.createNewMap();
    });

    // Open outline panel on layout ready
    this.app.workspace.onLayoutReady(() => {
      if (this.app.workspace.getLeavesOfType(NOTEMAP_OUTLINE_VIEW).length === 0) {
        this.activateOutlineView();
      }
    });

    this.addCommand({
      id: "create-new-notemap",
      name: "새 맵 생성",
      callback: () => this.createNewMap(),
    });

    this.addCommand({
      id: "create-map-from-note",
      name: "현재 노트의 헤딩으로 마인드맵 생성",
      checkCallback: (checking: boolean) => {
        const file = this.app.workspace.getActiveFile();
        if (file && file.extension === "md") {
          if (!checking) this.createMapFromNote(file);
          return true;
        }
        return false;
      },
    });
  }

  onunload(): void {
    this.app.workspace.detachLeavesOfType(NOTEMAP_VIEW_TYPE);
    this.app.workspace.detachLeavesOfType(NOTEMAP_OUTLINE_VIEW);
  }

  private async activateOutlineView(): Promise<void> {
    const leaf = this.app.workspace.getLeftLeaf(false);
    if (leaf) {
      await leaf.setViewState({ type: NOTEMAP_OUTLINE_VIEW, active: true });
    }
  }

  private async createNewMap(): Promise<void> {
    const name = `NoteMap ${new Date().toLocaleDateString("ko-KR")}.${NOTEMAP_EXTENSION}`;
    const initialData = JSON.stringify({
      version: "1.0.0",
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes: [],
      edges: [],
      tables: [],
      metadata: {
        created: new Date().toISOString(),
        modified: new Date().toISOString(),
        tags: [],
      },
    }, null, 2);

    try {
      const file = await this.app.vault.create(name, initialData);
      const leaf = this.app.workspace.getLeaf(false);
      await leaf.openFile(file);
    } catch (e) {
      console.error("NoteMap: Failed to create map", e);
    }
  }

  private async createMapFromNote(file: TFile): Promise<void> {
    const content = await this.app.vault.read(file);
    const lines = content.split("\n");
    const headings: Array<{ level: number; text: string }> = [];

    for (const line of lines) {
      const match = line.match(/^(#{1,6})\s+(.+)$/);
      if (match) {
        headings.push({ level: match[1].length, text: match[2].trim() });
      }
    }

    if (headings.length === 0) return;

    const nodes: any[] = [];
    const edges: any[] = [];
    let idCounter = 1;

    const rootNode = {
      id: `node-${idCounter++}`,
      shape: "rectangle",
      position: { x: 0, y: 0 },
      size: { width: 220, height: 80 },
      style: { fillColor: "#3b82f6", borderColor: "#1e40af", borderWidth: 2, borderStyle: "solid", opacity: 1, shadow: true, cornerRadius: 8 },
      content: { title: file.basename, body: "", linkedNote: file.path },
    };
    nodes.push(rootNode);

    const parentStack: { id: string; level: number }[] = [{ id: rootNode.id, level: 0 }];
    const colors = ["#E74F4C", "#E0C431", "#94B68E", "#4CCBCD", "#4A9BD9", "#8B5CF6"];
    let y = 150;

    for (const heading of headings) {
      const nodeId = `node-${idCounter++}`;
      const xOffset = (heading.level - 1) * 280;
      const colorIndex = (heading.level - 1) % colors.length;

      nodes.push({
        id: nodeId,
        shape: "rectangle",
        position: { x: xOffset, y },
        size: { width: 200, height: 60 },
        style: {
          fillColor: "#ffffff",
          borderColor: colors[colorIndex],
          borderWidth: 2,
          borderStyle: "solid",
          opacity: 1,
          shadow: true,
          cornerRadius: 8,
        },
        content: { title: heading.text, body: "", linkedNote: null },
      });

      // Find parent
      while (parentStack.length > 1 && parentStack[parentStack.length - 1].level >= heading.level) {
        parentStack.pop();
      }
      const parent = parentStack[parentStack.length - 1];

      edges.push({
        id: `edge-${idCounter++}`,
        type: "bezier",
        source: { nodeId: parent.id, anchorId: `${parent.id}-bottom` },
        target: { nodeId: nodeId, anchorId: `${nodeId}-top` },
        controlPoints: [],
        style: { color: colors[colorIndex], width: 2, arrow: "end", lineStyle: "solid" },
        label: "",
      });

      parentStack.push({ id: nodeId, level: heading.level });
      y += 100;
    }

    const mapData = JSON.stringify({
      version: "1.0.0",
      viewport: { x: 0, y: 0, zoom: 1 },
      nodes,
      edges,
      tables: [],
      metadata: {
        created: new Date().toISOString(),
        modified: new Date().toISOString(),
        tags: [],
      },
    }, null, 2);

    const mapName = `${file.basename} - Map.${NOTEMAP_EXTENSION}`;
    try {
      const mapFile = await this.app.vault.create(mapName, mapData);
      const leaf = this.app.workspace.getLeaf(false);
      await leaf.openFile(mapFile);
    } catch (e) {
      console.error("NoteMap: Failed to create map from note", e);
    }
  }
}
