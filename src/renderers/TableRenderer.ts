import { NoteMapTable } from "../models/Table";

export class TableRenderer {
  render(ctx: CanvasRenderingContext2D, table: NoteMapTable, isSelected: boolean, isHovered = false, selectedCells: { row: number; col: number }[] | null = null): void {
    ctx.save();

    // Outer border / background
    const r = 4;
    ctx.fillStyle = "#131313";
    this.roundRect(ctx, table.x, table.y, table.width, table.height, r);
    ctx.fill();

    // Cells
    let cy = table.y;
    for (let ri = 0; ri < table.rows; ri++) {
      let cx = table.x;
      for (let ci = 0; ci < table.cols; ci++) {
        const cell = table.cells[ri][ci];
        if (cell.colspan === 0 || cell.rowspan === 0) {
          cx += table.colWidths[ci];
          continue;
        }

        let cellW = 0;
        for (let cc = ci; cc < ci + cell.colspan && cc < table.cols; cc++) cellW += table.colWidths[cc];
        let cellH = 0;
        for (let rr = ri; rr < ri + cell.rowspan && rr < table.rows; rr++) cellH += table.rowHeights[rr];

        // Cell fill
        ctx.fillStyle = cell.style.fillColor;
        ctx.fillRect(cx + 0.5, cy + 0.5, cellW - 1, cellH - 1);

        // Cell border
        ctx.strokeStyle = table.borderColor;
        ctx.lineWidth = 0.5;
        ctx.strokeRect(cx, cy, cellW, cellH);

        // Cell text
        if (cell.value) {
          ctx.font = `${cell.style.fontWeight} ${cell.style.fontSize}px -apple-system, BlinkMacSystemFont, sans-serif`;
          ctx.fillStyle = cell.style.textColor;
          ctx.textBaseline = "middle";

          let textX: number;
          switch (cell.style.textAlign) {
            case "center": ctx.textAlign = "center"; textX = cx + cellW / 2; break;
            case "right": ctx.textAlign = "right"; textX = cx + cellW - 6; break;
            default: ctx.textAlign = "left"; textX = cx + 6;
          }
          ctx.fillText(cell.value, textX, cy + cellH / 2, cellW - 12);
        }

        cx += table.colWidths[ci];
      }
      cy += table.rowHeights[ri];
    }

    // Cell selection highlight
    if (selectedCells && selectedCells.length > 0) {
      for (const sc of selectedCells) {
        let scx = table.x;
        for (let c = 0; c < sc.col; c++) scx += table.colWidths[c];
        let scy = table.y;
        for (let r = 0; r < sc.row; r++) scy += table.rowHeights[r];
        const scw = table.colWidths[sc.col] || 0;
        const sch = table.rowHeights[sc.row] || 0;
        ctx.fillStyle = "rgba(59, 130, 246, 0.15)";
        ctx.fillRect(scx, scy, scw, sch);
        ctx.strokeStyle = "#3b82f6";
        ctx.lineWidth = 1.5;
        ctx.strokeRect(scx, scy, scw, sch);
      }
    }

    // Selection border
    if (isSelected) {
      ctx.strokeStyle = "#3b82f6";
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      this.roundRect(ctx, table.x - 1, table.y - 1, table.width + 2, table.height + 2, r);
      ctx.stroke();
    }

    // Anchor points on hover
    if (isHovered || isSelected) {
      this.drawAnchors(ctx, table);
    }

    ctx.restore();
  }

  private drawAnchors(ctx: CanvasRenderingContext2D, table: NoteMapTable): void {
    const radius = 5;
    for (const anchor of table.anchors) {
      const pos = table.getAnchorWorldPosition(anchor.id);
      if (!pos) continue;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, radius, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(59, 130, 246, 0.6)";
      ctx.fill();
      ctx.strokeStyle = "#ffffff";
      ctx.lineWidth = 1.5;
      ctx.stroke();
    }
  }

  private roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.lineTo(x + w - r, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + r);
    ctx.lineTo(x + w, y + h - r);
    ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
    ctx.lineTo(x + r, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - r);
    ctx.lineTo(x, y + r);
    ctx.quadraticCurveTo(x, y, x + r, y);
    ctx.closePath();
  }
}
