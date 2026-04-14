import { InteractionMode } from "../core/InputHandler";
import { NodeShape } from "../models/Node";

export interface ToolbarCallbacks {
  onModeChange: (mode: InteractionMode) => void;
  onAddNode: (shape: NodeShape) => void;
  onAddTable: () => void;
  onFitAll: () => void;
  onUndo: () => void;
  onRedo: () => void;
  onSearch: () => void;
  onExport: (format: "png" | "svg") => void;
  onAutoLayout: () => void;
}

export class Toolbar {
  private el: HTMLElement;
  private modeButtons: HTMLElement[] = [];

  constructor(container: HTMLElement, private callbacks: ToolbarCallbacks) {
    this.el = container.createDiv({ cls: "notemap-toolbar" });
    this.build();
  }

  updateMode(mode: InteractionMode): void {
    this.modeButtons.forEach((btn, i) => {
      btn.toggleClass("is-active", (i === 0 && mode === "select") || (i === 1 && mode === "edge"));
    });
  }

  updateUndoRedo(canUndo: boolean, canRedo: boolean): void {
    const undoBtn = this.el.querySelector("[data-action=undo]") as HTMLElement;
    const redoBtn = this.el.querySelector("[data-action=redo]") as HTMLElement;
    if (undoBtn) undoBtn.toggleClass("is-disabled", !canUndo);
    if (redoBtn) redoBtn.toggleClass("is-disabled", !canRedo);
  }

  private build(): void {
    // Mode tools
    const modeGroup = this.addGroup();

    this.modeButtons.push(
      this.addButton(modeGroup, "선택", ICONS.select, "Esc", () => this.callbacks.onModeChange("select"))
    );
    this.modeButtons.push(
      this.addButton(modeGroup, "엣지 연결", ICONS.edge, "E", () => this.callbacks.onModeChange("edge"))
    );
    this.modeButtons[0].addClass("is-active");

    // Add tools
    const addGroup = this.addGroup();
    const nodeDropdown = this.addDropdownButton(addGroup, "노드 추가", ICONS.addNode, [
      { label: "사각형", action: () => this.callbacks.onAddNode("rectangle") },
      { label: "원형", action: () => this.callbacks.onAddNode("circle") },
      { label: "삼각형", action: () => this.callbacks.onAddNode("triangle") },
    ]);
    this.addButton(addGroup, "표 추가", ICONS.table, "T", () => this.callbacks.onAddTable());

    // Actions
    const actionGroup = this.addGroup();
    this.addButton(actionGroup, "되돌리기", ICONS.undo, "Ctrl+Z", () => this.callbacks.onUndo()).setAttribute("data-action", "undo");
    this.addButton(actionGroup, "다시하기", ICONS.redo, "Ctrl+Y", () => this.callbacks.onRedo()).setAttribute("data-action", "redo");

    // View
    const viewGroup = this.addGroup();
    this.addButton(viewGroup, "전체 보기", ICONS.fitAll, "F", () => this.callbacks.onFitAll());
    this.addButton(viewGroup, "자동 정렬", ICONS.layout, "", () => this.callbacks.onAutoLayout());
    this.addButton(viewGroup, "검색", ICONS.search, "Ctrl+F", () => this.callbacks.onSearch());

    // Export
    const exportGroup = this.addGroup();
    this.addDropdownButton(exportGroup, "내보내기", ICONS.export, [
      { label: "PNG 이미지", action: () => this.callbacks.onExport("png") },
      { label: "SVG 벡터", action: () => this.callbacks.onExport("svg") },
    ]);
  }

  private addGroup(): HTMLElement {
    return this.el.createDiv({ cls: "notemap-toolbar-group" });
  }

  private addButton(parent: HTMLElement, title: string, icon: string, shortcut: string, onClick: () => void): HTMLElement {
    const btn = parent.createEl("button", {
      cls: "notemap-toolbar-btn",
      attr: { title: shortcut ? `${title} (${shortcut})` : title },
    });
    btn.innerHTML = icon;
    btn.addEventListener("click", onClick);
    return btn;
  }

  private addDropdownButton(parent: HTMLElement, title: string, icon: string, items: { label: string; action: () => void }[]): HTMLElement {
    const wrapper = parent.createDiv({ cls: "notemap-toolbar-dropdown" });
    const btn = wrapper.createEl("button", {
      cls: "notemap-toolbar-btn notemap-toolbar-dropdown-btn",
      attr: { title },
    });
    btn.innerHTML = icon + `<span class="notemap-toolbar-caret">▾</span>`;

    const menu = wrapper.createDiv({ cls: "notemap-toolbar-dropdown-menu" });
    for (const item of items) {
      const menuItem = menu.createDiv({ cls: "notemap-toolbar-dropdown-item", text: item.label });
      menuItem.addEventListener("click", (e) => {
        e.stopPropagation();
        item.action();
        menu.style.display = "none";
      });
    }

    btn.addEventListener("click", () => {
      menu.style.display = menu.style.display === "block" ? "none" : "block";
    });

    document.addEventListener("click", (e) => {
      if (!wrapper.contains(e.target as Node)) {
        menu.style.display = "none";
      }
    });

    return wrapper;
  }
}

const ICONS = {
  select: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 3l7.07 16.97 2.51-7.39 7.39-2.51L3 3z"/></svg>`,
  edge: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/></svg>`,
  addNode: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="12" y1="8" x2="12" y2="16"/><line x1="8" y1="12" x2="16" y2="12"/></svg>`,
  table: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><line x1="3" y1="9" x2="21" y2="9"/><line x1="3" y1="15" x2="21" y2="15"/><line x1="9" y1="3" x2="9" y2="21"/><line x1="15" y1="3" x2="15" y2="21"/></svg>`,
  undo: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="1 4 1 10 7 10"/><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10"/></svg>`,
  redo: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="23 4 23 10 17 10"/><path d="M20.49 15a9 9 0 1 1-2.13-9.36L23 10"/></svg>`,
  fitAll: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/></svg>`,
  layout: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>`,
  search: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>`,
  export: `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>`,
};
