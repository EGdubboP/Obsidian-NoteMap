import { NoteMapNode, NodeShape } from "../models/Node";
import { NoteMapEdge, EdgeType } from "../models/Edge";
import { PRESET_PALETTES } from "../utils/colors";

export interface MenuAction {
  label: string;
  icon?: string;
  shortcut?: string;
  children?: MenuAction[];
  disabled?: boolean;
  action?: () => void;
}

export class ContextMenu {
  private container: HTMLElement;
  private menuEl: HTMLElement | null = null;

  constructor(container: HTMLElement) {
    this.container = container;
  }

  showForCanvas(x: number, y: number, callbacks: {
    onAddNode: (shape: NodeShape) => void;
    onAddTextOnly: () => void;
    onAddTable: () => void;
    onPaste: () => void;
    onFitAll: () => void;
    onAutoLayout: () => void;
  }): void {
    const actions: MenuAction[] = [
      {
        label: "노드 추가",
        icon: "➕",
        children: [
          { label: "사각형", action: () => callbacks.onAddNode("rectangle") },
          { label: "원형", action: () => callbacks.onAddNode("circle") },
          { label: "삼각형", action: () => callbacks.onAddNode("triangle") },
        ],
      },
      { label: "텍스트 추가", icon: "T", action: () => callbacks.onAddTextOnly() },
      { label: "표 추가", icon: "📊", action: () => callbacks.onAddTable() },
      { label: "붙여넣기", icon: "📋", shortcut: "Ctrl+V", action: () => callbacks.onPaste() },
      { label: "───", disabled: true, action: () => {} },
      { label: "전체 보기", icon: "🔍", shortcut: "F", action: () => callbacks.onFitAll() },
      { label: "자동 정렬", icon: "📐", action: () => callbacks.onAutoLayout() },
    ];
    this.show(x, y, actions);
  }

  showForNode(x: number, y: number, node: NoteMapNode, callbacks: {
    onEdit: () => void;
    onPopup: () => void;
    onChangeShape: (shape: NodeShape) => void;
    onChangeColor: (color: string) => void;
    onStartEdge: () => void;
    onDuplicate: () => void;
    onOpenNote: () => void;
    onSwitchToContent: () => void;
    onDelete: () => void;
    isNoteLink: boolean;
  }): void {
    const colors = PRESET_PALETTES.default.slice(0, 8);
    const actions: MenuAction[] = [
      { label: "편집", icon: "✏️", action: () => callbacks.onEdit() },
      ...(callbacks.isNoteLink ? [
        { label: "직접 입력으로 전환", icon: "✎", action: () => callbacks.onSwitchToContent() },
      ] : []),
      {
        label: "형태 변경",
        icon: "◆",
        children: [
          { label: "사각형", action: () => callbacks.onChangeShape("rectangle") },
          { label: "원형", action: () => callbacks.onChangeShape("circle") },
          { label: "삼각형", action: () => callbacks.onChangeShape("triangle") },
        ],
      },
      {
        label: "색상 변경",
        icon: "🎨",
        children: colors.map((c) => ({
          label: c,
          action: () => callbacks.onChangeColor(c),
        })),
      },
      { label: "엣지 연결", icon: "🔗", shortcut: "E", action: () => callbacks.onStartEdge() },
      { label: "복제", icon: "📄", action: () => callbacks.onDuplicate() },
      { label: "Obsidian 노트 열기", icon: "📝", action: () => callbacks.onOpenNote() },
      { label: "───", disabled: true, action: () => {} },
      { label: "삭제", icon: "🗑", shortcut: "Del", action: () => callbacks.onDelete() },
    ];
    this.show(x, y, actions);
  }

  showForEdge(x: number, y: number, edge: NoteMapEdge, callbacks: {
    onChangeType: (type: EdgeType) => void;
    onChangeColor: (color: string) => void;
    onAddLabel: () => void;
    onDelete: () => void;
  }): void {
    const colors = PRESET_PALETTES.default.slice(0, 8);
    const actions: MenuAction[] = [
      {
        label: "선 타입 변경",
        icon: "〰",
        children: [
          { label: "직선", action: () => callbacks.onChangeType("straight") },
          { label: "곡선 (베지어)", action: () => callbacks.onChangeType("bezier") },
          { label: "꺾은선", action: () => callbacks.onChangeType("orthogonal") },
          { label: "직각 엘보", action: () => callbacks.onChangeType("elbow") },
        ],
      },
      {
        label: "색상 변경",
        icon: "🎨",
        children: colors.map((c) => ({
          label: c,
          action: () => callbacks.onChangeColor(c),
        })),
      },
      { label: "라벨 추가", icon: "🏷", action: () => callbacks.onAddLabel() },
      { label: "───", disabled: true, action: () => {} },
      { label: "삭제", icon: "🗑", shortcut: "Del", action: () => callbacks.onDelete() },
    ];
    this.show(x, y, actions);
  }

  showForTable(x: number, y: number, callbacks: {
    onAddRow: () => void;
    onAddCol: () => void;
    onRemoveRow: () => void;
    onRemoveCol: () => void;
    onEditCell: (() => void) | null;
    onCellColor: ((color: string) => void) | null;
    onCellTextColor: ((color: string) => void) | null;
    onMergeCells: (() => void) | null;
    onClearSelection: (() => void) | null;
    onDelete: () => void;
  }): void {
    const colors = PRESET_PALETTES.default.slice(0, 8);
    const actions: MenuAction[] = [];

    if (callbacks.onEditCell) {
      actions.push({ label: "셀 편집", icon: "✏️", action: () => callbacks.onEditCell!() });
    }
    if (callbacks.onCellColor) {
      actions.push({
        label: "셀 배경색",
        icon: "🎨",
        children: colors.map((c) => ({ label: c, action: () => callbacks.onCellColor!(c) })),
      });
    }
    if (callbacks.onCellTextColor) {
      actions.push({
        label: "셀 글자색",
        icon: "✎",
        children: colors.map((c) => ({ label: c, action: () => callbacks.onCellTextColor!(c) })),
      });
    }

    if (callbacks.onMergeCells) {
      actions.push({ label: "셀 병합", icon: "⊞", action: () => callbacks.onMergeCells!() });
    }
    if (callbacks.onClearSelection) {
      actions.push({ label: "셀 선택 해제", icon: "✕", action: () => callbacks.onClearSelection!() });
    }

    actions.push({ label: "───", disabled: true, action: () => {} });
    actions.push({ label: "행 추가", icon: "➕", action: () => callbacks.onAddRow() });
    actions.push({ label: "열 추가", icon: "➕", action: () => callbacks.onAddCol() });
    actions.push({ label: "행 삭제", icon: "➖", action: () => callbacks.onRemoveRow() });
    actions.push({ label: "열 삭제", icon: "➖", action: () => callbacks.onRemoveCol() });
    actions.push({ label: "───", disabled: true, action: () => {} });
    actions.push({ label: "삭제", icon: "🗑", action: () => callbacks.onDelete() });

    this.show(x, y, actions);
  }

  hide(): void {
    if (this.menuEl) {
      this.menuEl.remove();
      this.menuEl = null;
    }
  }

  private show(x: number, y: number, actions: MenuAction[]): void {
    this.hide();

    this.menuEl = this.container.createDiv({ cls: "notemap-context-menu" });
    this.menuEl.style.left = `${x}px`;
    this.menuEl.style.top = `${y}px`;

    this.buildMenu(this.menuEl, actions);

    // Adjust if off-screen
    requestAnimationFrame(() => {
      if (!this.menuEl) return;
      const rect = this.menuEl.getBoundingClientRect();
      const parentRect = this.container.getBoundingClientRect();
      if (rect.right > parentRect.right) {
        this.menuEl.style.left = `${x - rect.width}px`;
      }
      if (rect.bottom > parentRect.bottom) {
        this.menuEl.style.top = `${y - rect.height}px`;
      }
    });

    // Close on outside click
    const closeHandler = (e: MouseEvent) => {
      if (this.menuEl && !this.menuEl.contains(e.target as Node)) {
        this.hide();
        document.removeEventListener("mousedown", closeHandler);
      }
    };
    setTimeout(() => document.addEventListener("mousedown", closeHandler), 0);
  }

  private buildMenu(parent: HTMLElement, actions: MenuAction[]): void {
    for (const action of actions) {
      if (action.disabled && action.label === "───") {
        parent.createDiv({ cls: "notemap-context-separator" });
        continue;
      }

      const item = parent.createDiv({ cls: "notemap-context-item" });
      if (action.disabled) item.addClass("is-disabled");

      if (action.icon) {
        item.createSpan({ cls: "notemap-context-icon", text: action.icon });
      }

      // Color swatch for color items
      if (action.label.startsWith("#")) {
        const swatch = item.createSpan({ cls: "notemap-color-swatch" });
        swatch.style.backgroundColor = action.label;
        item.createSpan({ cls: "notemap-context-label", text: action.label });
      } else {
        item.createSpan({ cls: "notemap-context-label", text: action.label });
      }

      if (action.shortcut) {
        item.createSpan({ cls: "notemap-context-shortcut", text: action.shortcut });
      }

      if (action.children) {
        item.createSpan({ cls: "notemap-context-arrow", text: "▸" });
        const sub = item.createDiv({ cls: "notemap-context-submenu" });
        this.buildMenu(sub, action.children);
      }

      if (action.action && !action.children) {
        item.addEventListener("click", (e) => {
          e.stopPropagation();
          action.action!();
          this.hide();
        });
      }
    }
  }
}
