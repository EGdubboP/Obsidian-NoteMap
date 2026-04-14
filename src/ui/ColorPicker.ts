import { hexToHSL, hslToHex, isValidHex, PRESET_PALETTES } from "../utils/colors";

export class ColorPicker {
  private el: HTMLElement | null = null;
  private onChange: ((color: string) => void) | null = null;

  show(container: HTMLElement, x: number, y: number, currentColor: string, onChange: (color: string) => void): void {
    this.hide();
    this.onChange = onChange;

    this.el = container.createDiv({ cls: "notemap-colorpicker" });
    this.el.style.left = `${x}px`;
    this.el.style.top = `${y}px`;

    // Preset palette
    const paletteSection = this.el.createDiv({ cls: "notemap-cp-section" });
    paletteSection.createDiv({ cls: "notemap-cp-label", text: "프리셋 컬러" });
    const grid = paletteSection.createDiv({ cls: "notemap-cp-grid" });

    for (const color of PRESET_PALETTES.default) {
      const swatch = grid.createDiv({ cls: "notemap-cp-swatch" });
      swatch.style.backgroundColor = color;
      if (color.toLowerCase() === currentColor.toLowerCase()) {
        swatch.addClass("is-active");
      }
      swatch.addEventListener("click", () => {
        this.selectColor(color);
      });
    }

    // Palette selector
    const palSection = this.el.createDiv({ cls: "notemap-cp-section" });
    palSection.createDiv({ cls: "notemap-cp-label", text: "팔레트" });
    const palBtns = palSection.createDiv({ cls: "notemap-cp-pal-btns" });

    const palettes = Object.keys(PRESET_PALETTES) as Array<keyof typeof PRESET_PALETTES>;
    for (const name of palettes) {
      const btn = palBtns.createEl("button", { cls: "notemap-cp-pal-btn", text: name });
      if (name === "default") btn.addClass("is-active");
      btn.addEventListener("click", () => {
        palBtns.querySelectorAll(".notemap-cp-pal-btn").forEach((b) => b.removeClass("is-active"));
        btn.addClass("is-active");
        this.updateGrid(grid, PRESET_PALETTES[name], currentColor);
      });
    }

    // HSL Sliders
    const hsl = hexToHSL(currentColor);
    const sliderSection = this.el.createDiv({ cls: "notemap-cp-section" });
    sliderSection.createDiv({ cls: "notemap-cp-label", text: "커스텀" });

    const preview = sliderSection.createDiv({ cls: "notemap-cp-preview" });
    preview.style.backgroundColor = currentColor;

    this.createSlider(sliderSection, "H", 0, 360, hsl.h, (v) => {
      hsl.h = v;
      const c = hslToHex(hsl);
      preview.style.backgroundColor = c;
      hexInput.value = c;
    });
    this.createSlider(sliderSection, "S", 0, 100, hsl.s, (v) => {
      hsl.s = v;
      const c = hslToHex(hsl);
      preview.style.backgroundColor = c;
      hexInput.value = c;
    });
    this.createSlider(sliderSection, "L", 0, 100, hsl.l, (v) => {
      hsl.l = v;
      const c = hslToHex(hsl);
      preview.style.backgroundColor = c;
      hexInput.value = c;
    });

    // HEX input
    const hexRow = sliderSection.createDiv({ cls: "notemap-cp-hex-row" });
    hexRow.createSpan({ text: "HEX:" });
    const hexInput = hexRow.createEl("input", {
      cls: "notemap-cp-hex-input",
      attr: { type: "text", value: currentColor },
    });

    const applyBtn = sliderSection.createEl("button", { cls: "notemap-cp-apply", text: "적용" });
    applyBtn.addEventListener("click", () => {
      const val = hexInput.value.startsWith("#") ? hexInput.value : `#${hexInput.value}`;
      if (isValidHex(val)) {
        this.selectColor(val);
      }
    });

    // Close on outside click
    const closeHandler = (e: MouseEvent) => {
      if (this.el && !this.el.contains(e.target as Node)) {
        this.hide();
        document.removeEventListener("mousedown", closeHandler);
      }
    };
    setTimeout(() => document.addEventListener("mousedown", closeHandler), 0);
  }

  hide(): void {
    if (this.el) {
      this.el.remove();
      this.el = null;
    }
  }

  private selectColor(color: string): void {
    if (this.onChange) this.onChange(color);
    this.hide();
  }

  private updateGrid(grid: HTMLElement, colors: string[], current: string): void {
    grid.empty();
    for (const color of colors) {
      const swatch = grid.createDiv({ cls: "notemap-cp-swatch" });
      swatch.style.backgroundColor = color;
      if (color.toLowerCase() === current.toLowerCase()) swatch.addClass("is-active");
      swatch.addEventListener("click", () => this.selectColor(color));
    }
  }

  private createSlider(
    parent: HTMLElement,
    label: string,
    min: number,
    max: number,
    value: number,
    onChange: (v: number) => void
  ): void {
    const row = parent.createDiv({ cls: "notemap-cp-slider-row" });
    row.createSpan({ cls: "notemap-cp-slider-label", text: label });
    const input = row.createEl("input", {
      cls: "notemap-cp-slider",
      attr: { type: "range", min: String(min), max: String(max), value: String(value) },
    });
    const valDisplay = row.createSpan({ cls: "notemap-cp-slider-val", text: String(value) });
    input.addEventListener("input", () => {
      const v = parseInt(input.value);
      valDisplay.textContent = String(v);
      onChange(v);
    });
  }
}
