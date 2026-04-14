export type SelectableType = "node" | "edge" | "table";

export interface SelectionItem {
  type: SelectableType;
  id: string;
}

export class SelectionManager {
  private selected: SelectionItem[] = [];
  private listeners: Array<() => void> = [];

  getSelected(): ReadonlyArray<SelectionItem> {
    return this.selected;
  }

  getSelectedIds(type: SelectableType): string[] {
    return this.selected.filter((s) => s.type === type).map((s) => s.id);
  }

  isSelected(type: SelectableType, id: string): boolean {
    return this.selected.some((s) => s.type === type && s.id === id);
  }

  select(type: SelectableType, id: string, additive = false): void {
    if (!additive) {
      this.selected = [];
    }
    if (!this.isSelected(type, id)) {
      this.selected.push({ type, id });
    }
    this.notify();
  }

  deselect(type: SelectableType, id: string): void {
    this.selected = this.selected.filter((s) => !(s.type === type && s.id === id));
    this.notify();
  }

  toggle(type: SelectableType, id: string): void {
    if (this.isSelected(type, id)) {
      this.deselect(type, id);
    } else {
      this.selected.push({ type, id });
      this.notify();
    }
  }

  clear(): void {
    if (this.selected.length > 0) {
      this.selected = [];
      this.notify();
    }
  }

  hasSelection(): boolean {
    return this.selected.length > 0;
  }

  onChange(listener: () => void): void {
    this.listeners.push(listener);
  }

  private notify(): void {
    for (const l of this.listeners) l();
  }
}
