import { NoteMapNode, NodeShape } from "../models/Node";
import { NoteMapEdge, EdgeType, ArrowType } from "../models/Edge";
import { NoteMapTable } from "../models/Table";
import { PRESET_PALETTES, hexToHSL } from "../utils/colors";

export interface PropertyPanelCallbacks {
  onNodeStyleChange: (nodeId: string, prop: string, value: any) => void;
  onNodeShapeChange: (nodeId: string, shape: NodeShape) => void;
  onNodeTextStyleChange: (nodeId: string, prop: string, value: any) => void;
  onEdgeStyleChange: (edgeId: string, prop: string, value: any) => void;
  onEdgeTypeChange: (edgeId: string, type: EdgeType) => void;
  onTableStyleChange: (tableId: string, prop: string, value: any) => void;
  onRequestSave: () => void;
}

export class PropertyPanel {
  private el: HTMLElement;
  private contentEl: HTMLElement;
  private visible = false;

  constructor(container: HTMLElement, private callbacks: PropertyPanelCallbacks) {
    this.el = container.createDiv({ cls: "notemap-property-panel" });
    this.el.createDiv({ cls: "notemap-pp-header", text: "속성" });
    this.contentEl = this.el.createDiv({ cls: "notemap-pp-content" });
    this.el.style.display = "none";
  }

  showForNode(node: NoteMapNode): void {
    this.contentEl.empty();
    this.visible = true;
    this.el.style.display = "flex";

    // Text-only mode: font style + alignment only
    if (node.mode === "text-only") {
      this.addSectionHeader("텍스트");

      this.addSelect("폰트", node.textStyle.fontFamily, [
        { value: "-apple-system, BlinkMacSystemFont, sans-serif", label: "시스템 기본" },
        { value: "Georgia, serif", label: "Georgia" },
        { value: "'Courier New', monospace", label: "Courier" },
        { value: "'Noto Sans KR', sans-serif", label: "Noto Sans KR" },
        { value: "'Nanum Gothic', sans-serif", label: "나눔고딕" },
        { value: "Arial, sans-serif", label: "Arial" },
      ], (v) => {
        this.callbacks.onNodeTextStyleChange(node.id, "fontFamily", v);
      });

      this.addColorRow("글자색", node.textStyle.color, (c) => {
        this.callbacks.onNodeTextStyleChange(node.id, "color", c);
      });

      this.addSlider("글자 크기", node.textStyle.bodySize, 7, 36, 1, (v) => {
        this.callbacks.onNodeTextStyleChange(node.id, "bodySize", v);
      });

      this.addToggle("기울임", node.textStyle.italic, (v) => {
        this.callbacks.onNodeTextStyleChange(node.id, "italic", v);
      });

      this.addSelect("정렬", node.textStyle.bodyAlign || "center", [
        { value: "left", label: "왼쪽" },
        { value: "center", label: "가운데" },
        { value: "right", label: "오른쪽" },
      ], (v) => {
        this.callbacks.onNodeTextStyleChange(node.id, "bodyAlign", v);
      });

      return;
    }

    // Image mode: only show image path and size
    if (node.mode === "image") {
      this.addSectionHeader("이미지");

      const row = this.contentEl.createDiv({ cls: "notemap-pp-row" });
      row.createSpan({ cls: "notemap-pp-label", text: "경로" });
      row.createSpan({ text: node.content.imagePath || "(없음)", attr: { style: "font-size:11px;color:var(--notemap-text-secondary);word-break:break-all" } });

      this.addSizeRow("크기", node.width, node.height, (w, h) => {
        this.callbacks.onNodeStyleChange(node.id, "width", w);
        this.callbacks.onNodeStyleChange(node.id, "height", h);
      });

      return;
    }

    // Shape
    this.addSelect("형태", node.shape, [
      { value: "rectangle", label: "사각형" },
      { value: "circle", label: "원형" },
      { value: "triangle", label: "삼각형" },
    ], (v) => {
      this.callbacks.onNodeShapeChange(node.id, v as NodeShape);
    });

    // Fill Color
    this.addColorRow("배경색", node.style.fillColor, (c) => {
      this.callbacks.onNodeStyleChange(node.id, "fillColor", c);
    });

    // Border Color
    this.addColorRow("테두리색", node.style.borderColor, (c) => {
      this.callbacks.onNodeStyleChange(node.id, "borderColor", c);
    });

    // Border Width
    this.addSlider("테두리 두께", node.style.borderWidth, 0, 10, 1, (v) => {
      this.callbacks.onNodeStyleChange(node.id, "borderWidth", v);
    });

    // Border Style
    this.addSelect("테두리 스타일", node.style.borderStyle, [
      { value: "solid", label: "실선" },
      { value: "dashed", label: "점선" },
      { value: "dotted", label: "도트" },
    ], (v) => {
      this.callbacks.onNodeStyleChange(node.id, "borderStyle", v);
    });

    // Corner Radius
    this.addSlider("모서리 둥글기", node.style.cornerRadius, 0, 50, 1, (v) => {
      this.callbacks.onNodeStyleChange(node.id, "cornerRadius", v);
    });

    // Opacity
    this.addSlider("투명도", Math.round(node.style.opacity * 100), 0, 100, 5, (v) => {
      this.callbacks.onNodeStyleChange(node.id, "opacity", v / 100);
    });

    // Shadow
    this.addToggle("그림자", node.style.shadow, (v) => {
      this.callbacks.onNodeStyleChange(node.id, "shadow", v);
    });

    // Size
    this.addSizeRow("크기", node.width, node.height, (w, h) => {
      this.callbacks.onNodeStyleChange(node.id, "width", w);
      this.callbacks.onNodeStyleChange(node.id, "height", h);
    });

    // --- Text Style Section ---
    this.addSectionHeader("텍스트");

    // Font Family
    this.addSelect("폰트", node.textStyle.fontFamily, [
      { value: "-apple-system, BlinkMacSystemFont, sans-serif", label: "시스템 기본" },
      { value: "Georgia, serif", label: "Georgia (세리프)" },
      { value: "'Courier New', monospace", label: "Courier (고정폭)" },
      { value: "'Noto Sans KR', sans-serif", label: "Noto Sans KR" },
      { value: "'Nanum Gothic', sans-serif", label: "나눔고딕" },
      { value: "'Nanum Myeongjo', serif", label: "나눔명조" },
      { value: "Arial, sans-serif", label: "Arial" },
      { value: "'Times New Roman', serif", label: "Times New Roman" },
    ], (v) => {
      this.callbacks.onNodeTextStyleChange(node.id, "fontFamily", v);
    });

    // Text Color
    this.addColorRow("글자색", node.textStyle.color, (c) => {
      this.callbacks.onNodeTextStyleChange(node.id, "color", c);
    });

    // Title Size
    this.addSlider("제목 크기", node.textStyle.titleSize, 8, 36, 1, (v) => {
      this.callbacks.onNodeTextStyleChange(node.id, "titleSize", v);
    });

    // Body Size
    this.addSlider("본문 크기", node.textStyle.bodySize, 7, 28, 1, (v) => {
      this.callbacks.onNodeTextStyleChange(node.id, "bodySize", v);
    });

    // Bold
    this.addToggle("제목 굵게", node.textStyle.bold, (v) => {
      this.callbacks.onNodeTextStyleChange(node.id, "bold", v);
    });

    // Italic
    this.addToggle("기울임", node.textStyle.italic, (v) => {
      this.callbacks.onNodeTextStyleChange(node.id, "italic", v);
    });

    // Title align
    this.addSelect("제목 정렬", node.textStyle.titleAlign || "center", [
      { value: "left", label: "왼쪽" },
      { value: "center", label: "가운데" },
      { value: "right", label: "오른쪽" },
    ], (v) => {
      this.callbacks.onNodeTextStyleChange(node.id, "titleAlign", v);
    });

    // Body align
    this.addSelect("본문 정렬", node.textStyle.bodyAlign || "center", [
      { value: "left", label: "왼쪽" },
      { value: "center", label: "가운데" },
      { value: "right", label: "오른쪽" },
    ], (v) => {
      this.callbacks.onNodeTextStyleChange(node.id, "bodyAlign", v);
    });
  }

  showForEdge(edge: NoteMapEdge): void {
    this.contentEl.empty();
    this.visible = true;
    this.el.style.display = "flex";

    this.addSelect("선 타입", edge.type, [
      { value: "straight", label: "직선" },
      { value: "bezier", label: "곡선" },
      { value: "orthogonal", label: "꺾은선" },
      { value: "elbow", label: "직각 엘보" },
    ], (v) => {
      this.callbacks.onEdgeTypeChange(edge.id, v as EdgeType);
    });

    this.addColorRow("색상", edge.style.color, (c) => {
      this.callbacks.onEdgeStyleChange(edge.id, "color", c);
    });

    this.addSlider("두께", edge.style.width, 1, 10, 1, (v) => {
      this.callbacks.onEdgeStyleChange(edge.id, "width", v);
    });

    this.addSelect("화살표", edge.style.arrow, [
      { value: "none", label: "없음" },
      { value: "end", label: "끝" },
      { value: "start", label: "시작" },
      { value: "both", label: "양방향" },
    ], (v) => {
      this.callbacks.onEdgeStyleChange(edge.id, "arrow", v as ArrowType);
    });

    this.addSelect("선 스타일", edge.style.lineStyle, [
      { value: "solid", label: "실선" },
      { value: "dashed", label: "점선" },
      { value: "dotted", label: "도트" },
    ], (v) => {
      this.callbacks.onEdgeStyleChange(edge.id, "lineStyle", v);
    });
  }

  showForTable(table: NoteMapTable): void {
    this.contentEl.empty();
    this.visible = true;
    this.el.style.display = "flex";

    this.addSectionHeader("표 스타일");

    // Border color
    this.addColorRow("테두리색", table.borderColor, (c) => {
      this.callbacks.onTableStyleChange(table.id, "borderColor", c);
    });

    // Header row style
    this.addSectionHeader("헤더 행 (첫 행)");

    const headerCell = table.cells[0]?.[0];
    if (headerCell) {
      this.addColorRow("헤더 배경색", headerCell.style.fillColor, (c) => {
        for (let ci = 0; ci < table.cols; ci++) {
          table.cells[0][ci].style.fillColor = c;
        }
        this.callbacks.onTableStyleChange(table.id, "_render", null);
      });

      this.addColorRow("헤더 글자색", headerCell.style.textColor, (c) => {
        for (let ci = 0; ci < table.cols; ci++) {
          table.cells[0][ci].style.textColor = c;
        }
        this.callbacks.onTableStyleChange(table.id, "_render", null);
      });

      this.addSlider("헤더 글자 크기", headerCell.style.fontSize, 8, 24, 1, (v) => {
        for (let ci = 0; ci < table.cols; ci++) {
          table.cells[0][ci].style.fontSize = v;
        }
        this.callbacks.onTableStyleChange(table.id, "_render", null);
      });

      this.addSelect("헤더 굵기", headerCell.style.fontWeight, [
        { value: "normal", label: "보통" },
        { value: "bold", label: "굵게" },
      ], (v) => {
        for (let ci = 0; ci < table.cols; ci++) {
          table.cells[0][ci].style.fontWeight = v as "normal" | "bold";
        }
        this.callbacks.onTableStyleChange(table.id, "_render", null);
      });
    }

    // Body cells style
    this.addSectionHeader("본문 셀");

    const bodyCell = table.cells[1]?.[0] || table.cells[0]?.[0];
    if (bodyCell) {
      this.addColorRow("셀 배경색", bodyCell.style.fillColor, (c) => {
        for (let r = 1; r < table.rows; r++) {
          for (let ci = 0; ci < table.cols; ci++) {
            table.cells[r][ci].style.fillColor = c;
          }
        }
        this.callbacks.onTableStyleChange(table.id, "_render", null);
      });

      this.addColorRow("셀 글자색", bodyCell.style.textColor, (c) => {
        for (let r = 1; r < table.rows; r++) {
          for (let ci = 0; ci < table.cols; ci++) {
            table.cells[r][ci].style.textColor = c;
          }
        }
        this.callbacks.onTableStyleChange(table.id, "_render", null);
      });

      this.addSlider("셀 글자 크기", bodyCell.style.fontSize, 8, 24, 1, (v) => {
        for (let r = 1; r < table.rows; r++) {
          for (let ci = 0; ci < table.cols; ci++) {
            table.cells[r][ci].style.fontSize = v;
          }
        }
        this.callbacks.onTableStyleChange(table.id, "_render", null);
      });

      this.addSelect("셀 정렬", bodyCell.style.textAlign, [
        { value: "left", label: "왼쪽" },
        { value: "center", label: "가운데" },
        { value: "right", label: "오른쪽" },
      ], (v) => {
        for (let r = 0; r < table.rows; r++) {
          for (let ci = 0; ci < table.cols; ci++) {
            table.cells[r][ci].style.textAlign = v as "left" | "center" | "right";
          }
        }
        this.callbacks.onTableStyleChange(table.id, "_render", null);
      });
    }

    // Size
    this.addSectionHeader("크기");

    this.addSlider("열 너비", table.colWidths[0] || 120, 60, 300, 10, (v) => {
      for (let ci = 0; ci < table.cols; ci++) table.colWidths[ci] = v;
      this.callbacks.onTableStyleChange(table.id, "_render", null);
    });

    this.addSlider("행 높이", table.rowHeights[0] || 36, 24, 80, 2, (v) => {
      for (let r = 0; r < table.rows; r++) table.rowHeights[r] = v;
      this.callbacks.onTableStyleChange(table.id, "_render", null);
    });
  }

  showForCell(table: NoteMapTable, row: number, col: number, cell: { value: string; style: { fillColor: string; textColor: string; textAlign: string; fontWeight: string; fontSize: number }; colspan: number; rowspan: number }): void {
    this.contentEl.empty();
    this.visible = true;
    this.el.style.display = "flex";

    this.addSectionHeader(`셀 [${row + 1}, ${col + 1}]`);

    this.addColorRow("배경색", cell.style.fillColor, (c) => {
      cell.style.fillColor = c;
      this.callbacks.onTableStyleChange(table.id, "_render", null);
    });

    this.addColorRow("글자색", cell.style.textColor, (c) => {
      cell.style.textColor = c;
      this.callbacks.onTableStyleChange(table.id, "_render", null);
    });

    this.addSlider("글자 크기", cell.style.fontSize, 8, 28, 1, (v) => {
      cell.style.fontSize = v;
      this.callbacks.onTableStyleChange(table.id, "_render", null);
    });

    this.addSelect("굵기", cell.style.fontWeight, [
      { value: "normal", label: "보통" },
      { value: "bold", label: "굵게" },
    ], (v) => {
      cell.style.fontWeight = v as "normal" | "bold";
      this.callbacks.onTableStyleChange(table.id, "_render", null);
    });

    this.addSelect("정렬", cell.style.textAlign, [
      { value: "left", label: "왼쪽" },
      { value: "center", label: "가운데" },
      { value: "right", label: "오른쪽" },
    ], (v) => {
      cell.style.textAlign = v as "left" | "center" | "right";
      this.callbacks.onTableStyleChange(table.id, "_render", null);
    });

    this.addSectionHeader("셀 크기");

    this.addSlider("열 너비", table.colWidths[col], 40, 400, 5, (v) => {
      table.colWidths[col] = v;
      this.callbacks.onTableStyleChange(table.id, "_render", null);
    });

    this.addSlider("행 높이", table.rowHeights[row], 20, 120, 2, (v) => {
      table.rowHeights[row] = v;
      this.callbacks.onTableStyleChange(table.id, "_render", null);
    });
  }

  hide(): void {
    this.visible = false;
    this.el.style.display = "none";
    this.contentEl.empty();
  }

  isVisible(): boolean {
    return this.visible;
  }

  private addSectionHeader(title: string): void {
    const header = this.contentEl.createDiv({ cls: "notemap-pp-section-header" });
    header.textContent = title;
  }

  private addSelect(label: string, current: string, options: { value: string; label: string }[], onChange: (v: string) => void): void {
    const row = this.contentEl.createDiv({ cls: "notemap-pp-row" });
    row.createSpan({ cls: "notemap-pp-label", text: label });
    const select = row.createEl("select", { cls: "notemap-pp-select" });
    for (const opt of options) {
      const optEl = select.createEl("option", { text: opt.label, attr: { value: opt.value } });
      if (opt.value === current) optEl.selected = true;
    }
    select.addEventListener("change", () => {
      onChange(select.value);
      this.callbacks.onRequestSave();
    });
  }

  private addColorRow(label: string, current: string, onChange: (c: string) => void): void {
    const row = this.contentEl.createDiv({ cls: "notemap-pp-row" });
    row.createSpan({ cls: "notemap-pp-label", text: label });
    const colorGroup = row.createDiv({ cls: "notemap-pp-color-group" });

    const preview = colorGroup.createDiv({ cls: "notemap-pp-color-preview" });
    preview.style.backgroundColor = current;

    const input = colorGroup.createEl("input", {
      cls: "notemap-pp-color-input",
      attr: { type: "text", value: current },
    });

    // Palette container (hidden by default)
    const paletteContainer = colorGroup.createDiv({ cls: "notemap-pp-palette-container" });
    let paletteOpen = false;

    // Click preview to toggle palette
    preview.style.cursor = "pointer";
    preview.addEventListener("click", () => {
      paletteOpen = !paletteOpen;
      if (paletteOpen) {
        this.buildPalette(paletteContainer, current, (c) => {
          input.value = c;
          preview.style.backgroundColor = c;
          onChange(c);
          this.callbacks.onRequestSave();
        });
        paletteContainer.style.display = "block";
      } else {
        paletteContainer.style.display = "none";
        paletteContainer.empty();
      }
    });

    input.addEventListener("change", () => {
      const val = input.value.startsWith("#") ? input.value : `#${input.value}`;
      preview.style.backgroundColor = val;
      onChange(val);
      this.callbacks.onRequestSave();
    });
  }

  private buildPalette(container: HTMLElement, current: string, onSelect: (c: string) => void): void {
    container.empty();

    const hsl = hexToHSL(current);
    let hue = hsl.h;
    let sat = hsl.s / 100;
    let val = 1 - (hsl.l / 100 - (1 - hsl.s / 100) * 0.5) / (hsl.s / 100 || 0.01);
    // Convert HSL to HSV approximation
    const l = hsl.l / 100;
    const s = hsl.s / 100;
    val = l + s * Math.min(l, 1 - l);
    sat = val === 0 ? 0 : 2 * (1 - l / val);
    sat = Math.max(0, Math.min(1, sat));
    val = Math.max(0, Math.min(1, val));

    // HEX display
    const hexRow = container.createDiv({ cls: "notemap-cp-hex-display" });
    const hexLabel = hexRow.createSpan({ cls: "notemap-cp-hex-text", text: current });

    const pickerBody = container.createDiv({ cls: "notemap-cp-body" });

    // SV gradient canvas
    const svSize = 180;
    const svCanvas = pickerBody.createEl("canvas", { cls: "notemap-cp-sv" });
    svCanvas.width = svSize;
    svCanvas.height = svSize;
    const svCtx = svCanvas.getContext("2d")!;

    // Hue slider canvas
    const hueCanvas = pickerBody.createEl("canvas", { cls: "notemap-cp-hue" });
    hueCanvas.width = 20;
    hueCanvas.height = svSize;
    const hueCtx = hueCanvas.getContext("2d")!;

    const drawSV = () => {
      // Base hue color
      const hueColor = `hsl(${hue}, 100%, 50%)`;
      // White → hue gradient (left to right)
      svCtx.fillStyle = "#ffffff";
      svCtx.fillRect(0, 0, svSize, svSize);
      const gradH = svCtx.createLinearGradient(0, 0, svSize, 0);
      gradH.addColorStop(0, "rgba(255,255,255,1)");
      gradH.addColorStop(1, hueColor);
      svCtx.fillStyle = gradH;
      svCtx.fillRect(0, 0, svSize, svSize);
      // Black gradient (top to bottom)
      const gradV = svCtx.createLinearGradient(0, 0, 0, svSize);
      gradV.addColorStop(0, "rgba(0,0,0,0)");
      gradV.addColorStop(1, "rgba(0,0,0,1)");
      svCtx.fillStyle = gradV;
      svCtx.fillRect(0, 0, svSize, svSize);

      // Cursor
      const cx = sat * svSize;
      const cy = (1 - val) * svSize;
      svCtx.strokeStyle = "#ffffff";
      svCtx.lineWidth = 2;
      svCtx.beginPath();
      svCtx.arc(cx, cy, 6, 0, Math.PI * 2);
      svCtx.stroke();
      svCtx.strokeStyle = "#000000";
      svCtx.lineWidth = 1;
      svCtx.beginPath();
      svCtx.arc(cx, cy, 7, 0, Math.PI * 2);
      svCtx.stroke();
    };

    const drawHue = () => {
      const grad = hueCtx.createLinearGradient(0, 0, 0, svSize);
      const stops = [0, 0.17, 0.33, 0.5, 0.67, 0.83, 1];
      const colors = ["#ff0000", "#ffff00", "#00ff00", "#00ffff", "#0000ff", "#ff00ff", "#ff0000"];
      stops.forEach((s, i) => grad.addColorStop(s, colors[i]));
      hueCtx.fillStyle = grad;
      hueCtx.fillRect(0, 0, 20, svSize);

      // Cursor
      const cy = (hue / 360) * svSize;
      hueCtx.strokeStyle = "#ffffff";
      hueCtx.lineWidth = 2;
      hueCtx.strokeRect(0, cy - 3, 20, 6);
    };

    const updateColor = () => {
      const color = this.hsvToHex(hue, sat, val);
      hexLabel.textContent = color;
      drawSV();
      drawHue();
    };

    const applyColor = () => {
      const color = this.hsvToHex(hue, sat, val);
      onSelect(color);
    };

    // SV interaction — stays open, applies in real-time
    let svDragging = false;
    const handleSV = (e: MouseEvent) => {
      const rect = svCanvas.getBoundingClientRect();
      sat = Math.max(0, Math.min(1, (e.clientX - rect.left) / svSize));
      val = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / svSize));
      updateColor();
      applyColor();
    };
    svCanvas.addEventListener("mousedown", (e) => { svDragging = true; handleSV(e); });
    document.addEventListener("mousemove", (e) => { if (svDragging) handleSV(e); });
    document.addEventListener("mouseup", () => { svDragging = false; });

    // Hue interaction — applies in real-time
    let hueDragging = false;
    const handleHue = (e: MouseEvent) => {
      const rect = hueCanvas.getBoundingClientRect();
      hue = Math.max(0, Math.min(360, ((e.clientY - rect.top) / svSize) * 360));
      updateColor();
      applyColor();
    };
    hueCanvas.addEventListener("mousedown", (e) => { hueDragging = true; handleHue(e); });
    document.addEventListener("mousemove", (e) => { if (hueDragging) handleHue(e); });
    document.addEventListener("mouseup", () => { hueDragging = false; });

    // Bottom bar: HEX input + eyedropper
    const bottomBar = container.createDiv({ cls: "notemap-cp-bottom" });

    // HEX input
    const hexInput = bottomBar.createEl("input", {
      cls: "notemap-cp-hex-input",
      attr: { type: "text", value: current, placeholder: "#000000" },
    });
    hexInput.addEventListener("change", () => {
      const hex = hexInput.value.startsWith("#") ? hexInput.value : `#${hexInput.value}`;
      onSelect(hex);
      // Update picker state
      const newHsl = hexToHSL(hex);
      hue = newHsl.h;
      const nl = newHsl.l / 100;
      const ns = newHsl.s / 100;
      val = nl + ns * Math.min(nl, 1 - nl);
      sat = val === 0 ? 0 : 2 * (1 - nl / val);
      sat = Math.max(0, Math.min(1, sat));
      val = Math.max(0, Math.min(1, val));
      updateColor();
    });

    // Eyedropper button
    const eyedropperBtn = bottomBar.createEl("button", { cls: "notemap-cp-eyedropper", text: "💧" });
    eyedropperBtn.title = "스포이드";
    eyedropperBtn.addEventListener("click", async () => {
      try {
        // Use browser EyeDropper API if available
        const w = window as any;
        if (w.EyeDropper) {
          const dropper = new w.EyeDropper();
          const result = await dropper.open();
          if (result && result.sRGBHex) {
            const hex = result.sRGBHex;
            onSelect(hex);
            hexInput.value = hex;
            hexLabel.textContent = hex;
            // Update picker state
            const newHsl = hexToHSL(hex);
            hue = newHsl.h;
            const nl = newHsl.l / 100;
            const ns = newHsl.s / 100;
            val = nl + ns * Math.min(nl, 1 - nl);
            sat = val === 0 ? 0 : 2 * (1 - nl / val);
            sat = Math.max(0, Math.min(1, sat));
            val = Math.max(0, Math.min(1, val));
            updateColor();
          }
        } else {
          // Fallback: prompt
          const hex = prompt("HEX 색상 코드를 입력하세요:", hexLabel.textContent || "");
          if (hex) {
            const val2 = hex.startsWith("#") ? hex : `#${hex}`;
            onSelect(val2);
          }
        }
      } catch { /* cancelled */ }
    });

    // Update hex input when color changes
    const origUpdate = updateColor;
    const wrappedUpdate = () => {
      origUpdate();
      hexInput.value = this.hsvToHex(hue, sat, val);
    };
    // Replace updateColor reference - just call wrapped on interactions
    svCanvas.removeEventListener("mousedown", handleSV);
    const handleSV2 = (e: MouseEvent) => {
      const rect = svCanvas.getBoundingClientRect();
      sat = Math.max(0, Math.min(1, (e.clientX - rect.left) / svSize));
      val = Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / svSize));
      wrappedUpdate();
      applyColor();
    };
    svCanvas.addEventListener("mousedown", (e) => { svDragging = true; handleSV2(e); });
    // Re-register mousemove with wrapped
    document.addEventListener("mousemove", (e) => { if (svDragging) handleSV2(e); });

    const handleHue2 = (e: MouseEvent) => {
      const rect = hueCanvas.getBoundingClientRect();
      hue = Math.max(0, Math.min(360, ((e.clientY - rect.top) / svSize) * 360));
      wrappedUpdate();
      applyColor();
    };
    hueCanvas.addEventListener("mousedown", (e) => { hueDragging = true; handleHue2(e); });
    document.addEventListener("mousemove", (e) => { if (hueDragging) handleHue2(e); });

    updateColor();
  }

  private hsvToHex(h: number, s: number, v: number): string {
    const hi = Math.floor(h / 60) % 6;
    const f = h / 60 - Math.floor(h / 60);
    const p = v * (1 - s);
    const q = v * (1 - f * s);
    const t = v * (1 - (1 - f) * s);
    let r = 0, g = 0, b = 0;
    switch (hi) {
      case 0: r = v; g = t; b = p; break;
      case 1: r = q; g = v; b = p; break;
      case 2: r = p; g = v; b = t; break;
      case 3: r = p; g = q; b = v; break;
      case 4: r = t; g = p; b = v; break;
      case 5: r = v; g = p; b = q; break;
    }
    const toHex = (n: number) => Math.round(n * 255).toString(16).padStart(2, "0");
    return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
  }

  private addSlider(label: string, value: number, min: number, max: number, step: number, onChange: (v: number) => void): void {
    const row = this.contentEl.createDiv({ cls: "notemap-pp-row" });
    row.createSpan({ cls: "notemap-pp-label", text: label });
    const group = row.createDiv({ cls: "notemap-pp-slider-group" });
    const slider = group.createEl("input", {
      cls: "notemap-pp-slider",
      attr: { type: "range", min: String(min), max: String(max), step: String(step), value: String(value) },
    });
    const valEl = group.createSpan({ cls: "notemap-pp-slider-val", text: String(value) });
    slider.addEventListener("input", () => {
      const v = parseFloat(slider.value);
      valEl.textContent = String(v);
      onChange(v);
      this.callbacks.onRequestSave();
    });
  }

  private addToggle(label: string, value: boolean, onChange: (v: boolean) => void): void {
    const row = this.contentEl.createDiv({ cls: "notemap-pp-row" });
    row.createSpan({ cls: "notemap-pp-label", text: label });
    const toggle = row.createEl("input", {
      cls: "notemap-pp-toggle",
      attr: { type: "checkbox" },
    });
    (toggle as HTMLInputElement).checked = value;
    toggle.addEventListener("change", () => {
      onChange((toggle as HTMLInputElement).checked);
      this.callbacks.onRequestSave();
    });
  }

  private addSizeRow(label: string, w: number, h: number, onChange: (w: number, h: number) => void): void {
    const row = this.contentEl.createDiv({ cls: "notemap-pp-row" });
    row.createSpan({ cls: "notemap-pp-label", text: label });
    const group = row.createDiv({ cls: "notemap-pp-size-group" });
    const wInput = group.createEl("input", {
      cls: "notemap-pp-size-input",
      attr: { type: "number", value: String(Math.round(w)), min: "40" },
    });
    group.createSpan({ text: "x" });
    const hInput = group.createEl("input", {
      cls: "notemap-pp-size-input",
      attr: { type: "number", value: String(Math.round(h)), min: "40" },
    });
    const handler = () => {
      onChange(parseInt(wInput.value) || 200, parseInt(hInput.value) || 120);
      this.callbacks.onRequestSave();
    };
    wInput.addEventListener("change", handler);
    hInput.addEventListener("change", handler);
  }
}
