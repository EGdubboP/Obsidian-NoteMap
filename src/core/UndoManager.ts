export class UndoManager {
  private data: any[] = [];
  private current = -1;
  private max = 50;

  push(state: any): void {
    // Clone to prevent shared references
    const snapshot = structuredClone(state);

    // Discard any redo history after current
    if (this.current < this.data.length - 1) {
      this.data.length = this.current + 1;
    }

    this.data.push(snapshot);

    // Trim oldest if over limit
    if (this.data.length > this.max) {
      this.data.shift();
    }

    this.current = this.data.length - 1;
  }

  undo(): any | null {
    if (!this.canUndo()) return null;
    this.current--;
    return structuredClone(this.data[this.current]);
  }

  redo(): any | null {
    if (!this.canRedo()) return null;
    this.current++;
    return structuredClone(this.data[this.current]);
  }

  canUndo(): boolean {
    return this.current > 0;
  }

  canRedo(): boolean {
    return this.current < this.data.length - 1;
  }

  clear(): void {
    this.data = [];
    this.current = -1;
  }
}
