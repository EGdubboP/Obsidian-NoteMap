import { NoteMap } from "../models/NoteMap";
import { NoteMapNode } from "../models/Node";
import { NoteMapEdge } from "../models/Edge";

export function exportToPNG(
  noteMap: NoteMap,
  renderCallback: (ctx: CanvasRenderingContext2D, width: number, height: number) => void
): void {
  const bounds = noteMap.getBoundingRect();
  const padding = 40;
  const width = bounds.width + padding * 2;
  const height = bounds.height + padding * 2;

  const canvas = document.createElement("canvas");
  canvas.width = width * 2; // 2x for retina
  canvas.height = height * 2;
  const ctx = canvas.getContext("2d")!;
  ctx.scale(2, 2);

  // White background
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  // Translate so map content starts at padding
  ctx.translate(padding - bounds.x, padding - bounds.y);

  renderCallback(ctx, width, height);

  canvas.toBlob((blob) => {
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `notemap-${Date.now()}.png`;
    a.click();
    URL.revokeObjectURL(url);
  }, "image/png");
}

export function exportToSVG(noteMap: NoteMap): string {
  const bounds = noteMap.getBoundingRect();
  const padding = 40;
  const width = bounds.width + padding * 2;
  const height = bounds.height + padding * 2;
  const ox = bounds.x - padding;
  const oy = bounds.y - padding;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="${ox} ${oy} ${width} ${height}">\n`;
  svg += `<rect x="${ox}" y="${oy}" width="${width}" height="${height}" fill="#ffffff"/>\n`;

  // Edges
  for (const edge of noteMap.edges) {
    const sn = noteMap.getNodeById(edge.source.nodeId);
    const tn = noteMap.getNodeById(edge.target.nodeId);
    if (!sn || !tn) continue;
    const sp = sn.getAnchorWorldPosition(edge.source.anchorId);
    const tp = tn.getAnchorWorldPosition(edge.target.anchorId);
    if (!sp || !tp) continue;

    const dashArray = edge.style.lineStyle === "dashed" ? ' stroke-dasharray="8,4"' : edge.style.lineStyle === "dotted" ? ' stroke-dasharray="2,4"' : "";

    if (edge.type === "bezier") {
      const mx = (sp.x + tp.x) / 2;
      svg += `<path d="M ${sp.x} ${sp.y} C ${mx} ${sp.y}, ${mx} ${tp.y}, ${tp.x} ${tp.y}" fill="none" stroke="${edge.style.color}" stroke-width="${edge.style.width}"${dashArray}/>\n`;
    } else if (edge.type === "orthogonal" || edge.type === "elbow") {
      // Simple elbow: extend from source, turn, arrive at target
      const margin = 30;
      const sDir = sn.anchors.find(a => a.id === edge.source.anchorId)?.position || "right";
      const tDir = tn.anchors.find(a => a.id === edge.target.anchorId)?.position || "left";
      const ext = (p: {x:number,y:number}, d: string) => {
        if (d === "top") return `${p.x} ${p.y - margin}`;
        if (d === "bottom") return `${p.x} ${p.y + margin}`;
        if (d === "left") return `${p.x - margin} ${p.y}`;
        return `${p.x + margin} ${p.y}`;
      };
      const sExt = ext(sp, sDir);
      const tExt = ext(tp, tDir);
      const sIsH = sDir === "left" || sDir === "right";
      const tIsH = tDir === "left" || tDir === "right";
      const [sx2, sy2] = sExt.split(" ").map(Number);
      const [tx2, ty2] = tExt.split(" ").map(Number);
      let path = `M ${sp.x} ${sp.y} L ${sExt}`;
      if (sIsH && !tIsH) {
        path += ` L ${sx2} ${ty2} L ${tExt}`;
      } else if (!sIsH && tIsH) {
        path += ` L ${tx2} ${sy2} L ${tExt}`;
      } else {
        const midX = (sx2 + tx2) / 2;
        const midY = (sy2 + ty2) / 2;
        if (sIsH) path += ` L ${sx2} ${midY} L ${tx2} ${midY} L ${tExt}`;
        else path += ` L ${midX} ${sy2} L ${midX} ${ty2} L ${tExt}`;
      }
      path += ` L ${tp.x} ${tp.y}`;
      svg += `<path d="${path}" fill="none" stroke="${edge.style.color}" stroke-width="${edge.style.width}"${dashArray}/>\n`;
    } else {
      svg += `<line x1="${sp.x}" y1="${sp.y}" x2="${tp.x}" y2="${tp.y}" stroke="${edge.style.color}" stroke-width="${edge.style.width}"${dashArray}/>\n`;
    }
  }

  // Nodes
  for (const node of noteMap.nodes) {
    svg += renderNodeSVG(node);
  }

  svg += `</svg>`;
  return svg;
}

function renderNodeSVG(node: NoteMapNode): string {
  let svg = "";
  const { x, y, width: w, height: h } = node;
  const fill = node.style.fillColor;
  const stroke = node.style.borderColor;
  const sw = node.style.borderWidth;
  const r = node.style.cornerRadius;

  switch (node.shape) {
    case "rectangle":
      svg += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>\n`;
      break;
    case "circle":
      svg += `<ellipse cx="${x + w / 2}" cy="${y + h / 2}" rx="${w / 2}" ry="${h / 2}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>\n`;
      break;
    case "triangle": {
      svg += `<polygon points="${x + w / 2},${y} ${x + w},${y + h} ${x},${y + h}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>\n`;
      break;
    }
    default:
      svg += `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${r}" fill="${fill}" stroke="${stroke}" stroke-width="${sw}"/>\n`;
  }

  // Title
  if (node.content.title) {
    svg += `<text x="${x + w / 2}" y="${y + h / 2}" text-anchor="middle" dominant-baseline="central" font-family="sans-serif" font-size="14" font-weight="bold" fill="#1f2937">${escapeXml(node.content.title)}</text>\n`;
  }

  return svg;
}

function escapeXml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function downloadSVG(svgContent: string): void {
  const blob = new Blob([svgContent], { type: "image/svg+xml" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `notemap-${Date.now()}.svg`;
  a.click();
  URL.revokeObjectURL(url);
}
