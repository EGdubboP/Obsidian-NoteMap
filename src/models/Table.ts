export interface CellStyle {
  fillColor: string;
  textColor: string;
  textAlign: "left" | "center" | "right";
  fontWeight: "normal" | "bold";
  fontSize: number;
}

export interface TableCell {
  value: string;
  style: CellStyle;
  colspan: number;
  rowspan: number;
}

export const DEFAULT_CELL_STYLE: CellStyle = {
  fillColor: "#131313",
  textColor: "#d0d0d0",
  textAlign: "left",
  fontWeight: "normal",
  fontSize: 13,
};

export interface TableAnchor {
  id: string;
  position: "top" | "bottom" | "left" | "right";
}

export class NoteMapTable {
  id: string;
  x: number;
  y: number;
  rows: number;
  cols: number;
  colWidths: number[];
  rowHeights: number[];
  cells: TableCell[][];
  borderColor: string;
  headerStyle: CellStyle;
  anchors: TableAnchor[];

  constructor(id: string, x: number, y: number, rows = 3, cols = 3) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.rows = rows;
    this.cols = cols;
    this.colWidths = Array(cols).fill(120);
    this.rowHeights = Array(rows).fill(36);
    this.borderColor = "#2a2a2a";
    this.headerStyle = { ...DEFAULT_CELL_STYLE, fillColor: "#1a1a1a", fontWeight: "bold", textAlign: "center" };

    this.anchors = [
      { id: `${id}-top`, position: "top" },
      { id: `${id}-bottom`, position: "bottom" },
      { id: `${id}-left`, position: "left" },
      { id: `${id}-right`, position: "right" },
    ];

    this.cells = [];
    for (let r = 0; r < rows; r++) {
      const row: TableCell[] = [];
      for (let c = 0; c < cols; c++) {
        row.push({
          value: "",
          style: r === 0 ? { ...this.headerStyle } : { ...DEFAULT_CELL_STYLE },
          colspan: 1,
          rowspan: 1,
        });
      }
      this.cells.push(row);
    }
  }

  get width(): number {
    return this.colWidths.reduce((a, b) => a + b, 0);
  }

  get height(): number {
    return this.rowHeights.reduce((a, b) => a + b, 0);
  }

  containsPoint(px: number, py: number): boolean {
    return px >= this.x && px <= this.x + this.width && py >= this.y && py <= this.y + this.height;
  }

  getAnchorWorldPosition(anchorId: string): { x: number; y: number } | null {
    const anchor = this.anchors.find((a) => a.id === anchorId);
    if (!anchor) return null;
    const pad = 8;
    const cx = this.x + this.width / 2;
    const cy = this.y + this.height / 2;
    switch (anchor.position) {
      case "top": return { x: cx, y: this.y - pad };
      case "bottom": return { x: cx, y: this.y + this.height + pad };
      case "left": return { x: this.x - pad, y: cy };
      case "right": return { x: this.x + this.width + pad, y: cy };
    }
  }

  /** Anchor position on the table edge (where the edge arrow touches) */
  getAnchorEdgePosition(anchorId: string): { x: number; y: number } | null {
    const anchor = this.anchors.find((a) => a.id === anchorId);
    if (!anchor) return null;
    const cx = this.x + this.width / 2;
    const cy = this.y + this.height / 2;
    switch (anchor.position) {
      case "top": return { x: cx, y: this.y };
      case "bottom": return { x: cx, y: this.y + this.height };
      case "left": return { x: this.x, y: cy };
      case "right": return { x: this.x + this.width, y: cy };
    }
  }

  getNearestAnchor(px: number, py: number): TableAnchor {
    let nearest = this.anchors[0];
    let minDist = Infinity;
    for (const anchor of this.anchors) {
      const pos = this.getAnchorWorldPosition(anchor.id);
      if (!pos) continue;
      const dist = Math.hypot(pos.x - px, pos.y - py);
      if (dist < minDist) { minDist = dist; nearest = anchor; }
    }
    return nearest;
  }

  getCellAt(px: number, py: number): { row: number; col: number } | null {
    if (!this.containsPoint(px, py)) return null;
    let cx = this.x;
    let col = -1;
    for (let c = 0; c < this.cols; c++) {
      if (px >= cx && px < cx + this.colWidths[c]) { col = c; break; }
      cx += this.colWidths[c];
    }
    let cy = this.y;
    let row = -1;
    for (let r = 0; r < this.rows; r++) {
      if (py >= cy && py < cy + this.rowHeights[r]) { row = r; break; }
      cy += this.rowHeights[r];
    }
    if (row >= 0 && col >= 0) {
      // If this cell is merged away (colspan/rowspan=0), find the owner cell
      const cell = this.cells[row][col];
      if (cell.colspan === 0 || cell.rowspan === 0) {
        return this.findMergeOwner(row, col);
      }
      return { row, col };
    }
    return null;
  }

  /** Find the top-left owner cell of a merged region that contains (row, col) */
  findMergeOwner(row: number, col: number): { row: number; col: number } | null {
    for (let r = row; r >= 0; r--) {
      for (let c = col; c >= 0; c--) {
        const cell = this.cells[r][c];
        if (cell.colspan > 0 && cell.rowspan > 0) {
          if (r + cell.rowspan > row && c + cell.colspan > col) {
            return { row: r, col: c };
          }
        }
      }
    }
    return null;
  }

  addRow(afterIndex?: number): void {
    const idx = afterIndex !== undefined ? afterIndex + 1 : this.rows;
    const row: TableCell[] = [];
    for (let c = 0; c < this.cols; c++) {
      row.push({ value: "", style: { ...DEFAULT_CELL_STYLE }, colspan: 1, rowspan: 1 });
    }
    this.cells.splice(idx, 0, row);
    this.rowHeights.splice(idx, 0, 36);
    this.rows++;
  }

  addColumn(afterIndex?: number): void {
    const idx = afterIndex !== undefined ? afterIndex + 1 : this.cols;
    for (let r = 0; r < this.rows; r++) {
      this.cells[r].splice(idx, 0, {
        value: "",
        style: r === 0 ? { ...this.headerStyle } : { ...DEFAULT_CELL_STYLE },
        colspan: 1,
        rowspan: 1,
      });
    }
    this.colWidths.splice(idx, 0, 120);
    this.cols++;
  }

  removeRow(index: number): void {
    if (this.rows <= 1) return;
    this.cells.splice(index, 1);
    this.rowHeights.splice(index, 1);
    this.rows--;
  }

  removeColumn(index: number): void {
    if (this.cols <= 1) return;
    for (let r = 0; r < this.rows; r++) {
      this.cells[r].splice(index, 1);
    }
    this.colWidths.splice(index, 1);
    this.cols--;
  }

  mergeCells(startRow: number, startCol: number, endRow: number, endCol: number): void {
    const cell = this.cells[startRow][startCol];
    cell.colspan = endCol - startCol + 1;
    cell.rowspan = endRow - startRow + 1;
    for (let r = startRow; r <= endRow; r++) {
      for (let c = startCol; c <= endCol; c++) {
        if (r === startRow && c === startCol) continue;
        this.cells[r][c].value = "";
        this.cells[r][c].colspan = 0; // merged away
        this.cells[r][c].rowspan = 0;
      }
    }
  }

  toJSON() {
    return {
      id: this.id,
      position: { x: this.x, y: this.y },
      rows: this.rows,
      cols: this.cols,
      colWidths: this.colWidths,
      rowHeights: this.rowHeights,
      cells: this.cells,
      borderColor: this.borderColor,
    };
  }

  static fromJSON(data: any): NoteMapTable {
    const t = new NoteMapTable(data.id, data.position.x, data.position.y, data.rows, data.cols);
    t.colWidths = data.colWidths || t.colWidths;
    t.rowHeights = data.rowHeights || t.rowHeights;
    t.cells = data.cells || t.cells;
    t.borderColor = data.borderColor || t.borderColor;
    return t;
  }
}
