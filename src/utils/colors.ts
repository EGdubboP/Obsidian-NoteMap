export interface HSL {
  h: number; // 0-360
  s: number; // 0-100
  l: number; // 0-100
}

export const PRESET_PALETTES = {
  default: [
    "#E74F4C", "#E28342", "#E0C431", "#94B68E",
    "#4CCBCD", "#4A9BD9", "#3B5998", "#2C3E6B",
    "#8B5CF6", "#EB55A4", "#F9A8D4", "#FDBA74",
    "#6EE7B7", "#78D144", "#262626", "#FFFFFF",
  ],
  pastel: [
    "#FFB3BA", "#FFDFBA", "#FFFFBA", "#BAFFC9",
    "#BAE1FF", "#E8BAFF", "#FFC9DE", "#D4F0F0",
    "#FCE1E4", "#E8DFF5", "#DAEAF6", "#CCE2CB",
    "#B6CFB6", "#F0E6EF", "#FDE2E4", "#FAD2E1",
  ],
  neon: [
    "#FF0080", "#FF4D00", "#FFE600", "#00FF66",
    "#00FFFF", "#0066FF", "#8000FF", "#FF00FF",
    "#FF3333", "#FF9933", "#CCFF33", "#33FF99",
    "#33CCFF", "#3366FF", "#9933FF", "#FF33CC",
  ],
  mono: [
    "#000000", "#1a1a1a", "#333333", "#4d4d4d",
    "#666666", "#808080", "#999999", "#b3b3b3",
    "#cccccc", "#d9d9d9", "#e6e6e6", "#f2f2f2",
    "#f5f5f5", "#f8f8f8", "#fafafa", "#ffffff",
  ],
  earth: [
    "#8B4513", "#A0522D", "#CD853F", "#DEB887",
    "#D2691E", "#B8860B", "#DAA520", "#F4A460",
    "#2F4F4F", "#556B2F", "#6B8E23", "#808000",
    "#BDB76B", "#BC8F8F", "#C4A484", "#D2B48C",
  ],
};

export function hexToHSL(hex: string): HSL {
  hex = hex.replace("#", "");
  const r = parseInt(hex.substring(0, 2), 16) / 255;
  const g = parseInt(hex.substring(2, 4), 16) / 255;
  const b = parseInt(hex.substring(4, 6), 16) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0, s = 0;

  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: h = ((g - b) / d + (g < b ? 6 : 0)) / 6; break;
      case g: h = ((b - r) / d + 2) / 6; break;
      case b: h = ((r - g) / d + 4) / 6; break;
    }
  }

  return { h: Math.round(h * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

export function hslToHex(hsl: HSL): string {
  const h = hsl.h / 360;
  const s = hsl.s / 100;
  const l = hsl.l / 100;

  const hue2rgb = (p: number, q: number, t: number) => {
    if (t < 0) t += 1;
    if (t > 1) t -= 1;
    if (t < 1 / 6) return p + (q - p) * 6 * t;
    if (t < 1 / 2) return q;
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6;
    return p;
  };

  let r: number, g: number, b: number;
  if (s === 0) {
    r = g = b = l;
  } else {
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    r = hue2rgb(p, q, h + 1 / 3);
    g = hue2rgb(p, q, h);
    b = hue2rgb(p, q, h - 1 / 3);
  }

  const toHex = (n: number) => {
    const hex = Math.round(n * 255).toString(16);
    return hex.length === 1 ? "0" + hex : hex;
  };

  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

export function isValidHex(hex: string): boolean {
  return /^#?[0-9A-Fa-f]{6}$/.test(hex);
}
