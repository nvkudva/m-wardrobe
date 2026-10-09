import * as shapes from "./shapes.js";

// Procedural garment art: each product paints a front and a back canvas (W×H
// for tops, the shape's tex size otherwise; the garment hangs from the top
// edge). Folds and lighting come from the 3D cloth; the baked drape and AO
// here only add fabric depth.
export const W = 512, H = 672;
const CX = W / 2;

// Left half of each silhouette, collar → hem; the right half is mirrored.
// bows: how far each edge (collar→shoulder, shoulder→sleeve, sleeve hem,
// underarm, side seam, …) curves out (+) or in (−), in texels: a rounded
// shoulder and sleeve cap, a scooped underarm, a side seam nipped at the waist.
const HALF_BOWS = [5, 14, 3, -5, -10], FULL_BOWS = [5, 10, 3, -3, -10];
const CUTS = {
  // A tee lies about 3:4, sleeves out at ~45°; long sleeves angle away from
  // the body so they hang free of it.
  tee: { collar: 196, neck: 108, side: [[98, 42], [22, 160], [72, 204], [98, 168], [94, 590]], bows: HALF_BOWS, dip: 10 },
  ls: { collar: 200, neck: 104, side: [[100, 40], [18, 540], [66, 556], [112, 196], [108, 640]], bows: FULL_BOWS, dip: 10 },
  // Shirts: longer, with the curved shirt-tail hem.
  shirt: { collar: 204, neck: 66, side: [[100, 40], [18, 540], [66, 556], [112, 196], [106, 620]], bows: FULL_BOWS, dip: 34 },
  crew: { collar: 204, neck: 86, side: [[100, 42], [40, 574], [92, 590], [124, 198], [120, 606], [128, 614], [128, 652]], bows: [...FULL_BOWS, 0, 0] },
};

// Quadratic from a to b (the path is already at a), bowed k texels off the
// straight line: toward −x when travelling down. Mirrored and reversed, the
// same k bows the mirrored edge the same way.
function bow(g, a, b, k) {
  const dx = b[0] - a[0], dy = b[1] - a[1], l = Math.hypot(dx, dy) || 1;
  g.quadraticCurveTo((a[0] + b[0]) / 2 - (dy / l) * k, (a[1] + b[1]) / 2 + (dx / l) * k, b[0], b[1]);
}

function rng(seed) {
  let s = (seed % 2147483646) + 1;
  return () => (s = (s * 16807) % 2147483647) / 2147483647;
}

function rgb(hex) {
  const n = parseInt(hex.slice(1), 16);
  return [n >> 16, (n >> 8) & 255, n & 255];
}

function lum(hex) {
  const [r, g, b] = rgb(hex);
  return (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
}

// t > 0 mixes toward white, t < 0 toward black.
function tone(hex, t) {
  const to = t > 0 ? 255 : 0, k = Math.abs(t);
  const [r, g, b] = rgb(hex).map((v) => Math.round(v + (to - v) * k));
  return `rgb(${r},${g},${b})`;
}

function canvas(w = W, h = H) {
  const c = document.createElement("canvas");
  c.width = w; c.height = h;
  return c;
}

// Fit: width multiplies the body across; length is in the fitted shape.
const WIDTH = { slim: 0.88, regular: 1, wide: 1.18 };
// Top sleeves (outer edge point, cuff inner point) and the armpit they join.
const SLEEVES = {
  none: { pts: [[112, 110], [104, 150]], armpit: [98, 168], bows: [5, -14, 0, 0, -7] },
  half: { pts: [[22, 160], [72, 204]], armpit: [98, 168], bows: HALF_BOWS },
  full: { pts: [[18, 540], [66, 556]], armpit: [112, 196], bows: FULL_BOWS },
};

// A top's silhouette for this product: the cut's own points with the sleeve
// swapped, the body widened or narrowed, and everything below the armpit
// stretched to the fitted hem.
function cutOf(p) {
  const base = CUTS[p.cut], f = p.fit ?? {};
  if (base.side.length !== 5 || (!f.sleeve && !f.width && !f.length)) return base;
  let [shoulder, out, cuff, pit, hem] = base.side.map((q) => [...q]);
  if (f.sleeve) [out, cuff, pit] = [...SLEEVES[f.sleeve].pts.map((q) => [...q]), [...SLEEVES[f.sleeve].armpit]];
  const wd = WIDTH[f.width ?? "regular"], X = (x) => CX - (CX - x) * wd;
  const H2 = shapes.fitted(p.cut, f).tex[1], hemY = hem[1] + (H2 - H);
  const shift = X(pit[0]) - pit[0];
  return {
    ...base,
    bows: f.sleeve ? SLEEVES[f.sleeve].bows : base.bows,
    side: [shoulder, [out[0] + shift, out[1]], [cuff[0] + shift, cuff[1]], [X(pit[0]), pit[1]], [X(hem[0]), hemY]],
  };
}

function outline(g, c, back) {
  const pts = [[c.collar, 16], ...c.side], hem = pts.at(-1), k = (i) => c.bows?.[i] ?? 0;
  g.beginPath();
  g.moveTo(...pts[0]);
  for (let i = 1; i < pts.length; i++) bow(g, pts[i - 1], pts[i], k(i - 1));
  g.quadraticCurveTo(CX, hem[1] + (c.dip ?? 10), W - hem[0], hem[1]);
  for (let i = pts.length - 1; i > 0; i--) bow(g, [W - pts[i][0], pts[i][1]], [W - pts[i - 1][0], pts[i - 1][1]], k(i - 1));
  g.quadraticCurveTo(CX, back ? 40 : c.neck, c.collar, 16);
  g.closePath();
}

let grainPattern = null;
function grain(g) {
  if (!grainPattern) {
    const c = document.createElement("canvas");
    c.width = c.height = 128;
    const x = c.getContext("2d"), id = x.createImageData(128, 128), r = rng(7);
    for (let i = 0; i < id.data.length; i += 4) {
      const v = r() > 0.5 ? 255 : 0;
      id.data[i] = id.data[i + 1] = id.data[i + 2] = v;
      id.data[i + 3] = 10 + r() * 14;
    }
    x.putImageData(id, 0, 0);
    grainPattern = c;
  }
  g.fillStyle = g.createPattern(grainPattern, "repeat");
  g.fillRect(0, 0, g.canvas.width, g.canvas.height);
}

// Shared bump map: fine knit grain with faint horizontal courses.
export function knit() {
  const c = canvas(), g = c.getContext("2d"), id = g.createImageData(W, H), r = rng(3);
  for (let y = 0; y < H; y++) {
    const row = y % 3 === 0 ? 18 : 0;
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4, v = 118 + row + r() * 22;
      id.data[i] = id.data[i + 1] = id.data[i + 2] = v;
      id.data[i + 3] = 255;
    }
  }
  g.putImageData(id, 0, 0);
  return c;
}

// Denim bump: steep diagonal twill wales.
export function twill() {
  const c = canvas(), g = c.getContext("2d"), id = g.createImageData(W, H), r = rng(11);
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4, v = 112 + ((x + 2 * y) % 6 < 3 ? 26 : 0) + r() * 18;
      id.data[i] = id.data[i + 1] = id.data[i + 2] = v;
      id.data[i + 3] = 255;
    }
  }
  g.putImageData(id, 0, 0);
  return c;
}

// Plain weave with slubs: linen, silk, chiffon (scaled down per fabric).
export function weave() {
  const c = canvas(), g = c.getContext("2d"), id = g.createImageData(W, H), r = rng(19);
  const slub = new Float32Array(H).map(() => (r() < 0.06 ? 30 * r() : 0));
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4, v = 118 + ((x + y) % 2 ? 14 : 0) + slub[y] + r() * 14;
      id.data[i] = id.data[i + 1] = id.data[i + 2] = v;
      id.data[i + 3] = 255;
    }
  }
  g.putImageData(id, 0, 0);
  return c;
}

function fabric(g, p, back) {
  const r = rng(p.name.length * 977 + (back ? 31 : 0));
  for (let k = 0; k < 10; k++) {
    const x = 120 + r() * 272, w = 16 + r() * 44, dark = r() < 0.55;
    const gr = g.createLinearGradient(x - w, 0, x + w, 0);
    gr.addColorStop(0, "rgba(0,0,0,0)");
    gr.addColorStop(0.5, dark ? "rgba(0,0,0,0.07)" : "rgba(255,255,255,0.07)");
    gr.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = gr;
    g.fillRect(x - w, 160 + r() * 140, w * 2, 540);
  }
  const cw = g.canvas.width, ch = g.canvas.height;
  const side = g.createLinearGradient(0, 0, cw, 0);
  side.addColorStop(0, "rgba(0,0,0,0.22)");
  side.addColorStop(0.3, "rgba(0,0,0,0)");
  side.addColorStop(0.7, "rgba(0,0,0,0)");
  side.addColorStop(1, "rgba(0,0,0,0.22)");
  g.fillStyle = side;
  g.fillRect(0, 0, cw, ch);
  const vert = g.createLinearGradient(0, 0, 0, ch);
  vert.addColorStop(0, "rgba(255,255,255,0.10)");
  vert.addColorStop(0.25, "rgba(255,255,255,0)");
  vert.addColorStop(0.85, "rgba(0,0,0,0)");
  vert.addColorStop(1, "rgba(0,0,0,0.12)");
  g.fillStyle = vert;
  g.fillRect(0, 0, cw, ch);
  for (const ux of [118, W - 118]) {
    const ao = g.createRadialGradient(ux, 190, 0, ux, 190, 70);
    ao.addColorStop(0, "rgba(0,0,0,0.16)");
    ao.addColorStop(1, "rgba(0,0,0,0)");
    g.fillStyle = ao;
    g.fillRect(ux - 70, 120, 140, 140);
  }
  if (p.art === "afterdark") {
    for (let k = 0; k < 16; k++) {
      const x = r() * W, y = 60 + r() * 600, rad = 30 + r() * 80;
      const m = g.createRadialGradient(x, y, 0, x, y, rad);
      m.addColorStop(0, "rgba(255,255,255,0.06)");
      m.addColorStop(1, "rgba(255,255,255,0)");
      g.fillStyle = m;
      g.fillRect(x - rad, y - rad, rad * 2, rad * 2);
    }
  }
  if (p.art === "heather") {
    for (let k = 0; k < 9000; k++) {
      g.fillStyle = r() > 0.5 ? "rgba(255,255,255,0.18)" : "rgba(40,40,44,0.16)";
      g.fillRect(r() * W, r() * H, 1.5, 1.2);
    }
  }
  grain(g);
}

function trims(g, p, back) {
  const c = cutOf(p), s = c.side, hem = s[s.length - 1], bare = p.fit?.sleeve === "none", dark = lum(p.base) < 0.4;
  const stitch = dark ? "rgba(255,255,255,0.13)" : "rgba(0,0,0,0.16)";
  const seam = dark ? "rgba(0,0,0,0.45)" : "rgba(0,0,0,0.11)";
  const ny = back ? 40 : c.neck;

  g.lineWidth = 14;
  g.strokeStyle = tone(p.base, dark ? 0.07 : -0.06);
  g.beginPath();
  g.moveTo(c.collar - 4, 20);
  g.quadraticCurveTo(CX, ny + 8, W - c.collar + 4, 20);
  g.stroke();
  g.lineWidth = 1.2;
  g.strokeStyle = seam;
  g.beginPath();
  g.moveTo(c.collar - 6, 28);
  g.quadraticCurveTo(CX, ny + 16, W - c.collar + 6, 28);
  g.stroke();

  for (const m of [1, -1]) {
    const X = (x) => (m > 0 ? x : W - x);
    g.beginPath();
    g.moveTo(X(s[0][0]), s[0][1]);
    g.lineTo(X(s[3][0]), s[3][1]);
    g.stroke();
  }

  g.setLineDash([5, 4]);
  g.lineWidth = 1.4;
  g.strokeStyle = stitch;
  g.beginPath();
  g.moveTo(hem[0] + 4, hem[1] - 14);
  g.quadraticCurveTo(CX, hem[1] - 14 + (c.dip ?? 10), W - hem[0] - 4, hem[1] - 14);
  g.stroke();
  if (p.cut === "tee" && !bare) {
    for (const m of [1, -1]) {
      const X = (x) => (m > 0 ? x : W - x);
      g.beginPath();
      g.moveTo(X(s[1][0] + 10), s[1][1] - 9);
      g.lineTo(X(s[2][0] + 8), s[2][1] - 11);
      g.stroke();
    }
  }
  g.setLineDash([]);

  if (p.cut !== "tee" && !bare) {
    const band = tone(p.base, dark ? 0.05 : -0.05);
    for (const m of [1, -1]) {
      const X = (x) => (m > 0 ? x : W - x);
      g.fillStyle = band;
      g.beginPath();
      g.moveTo(X(s[1][0]), s[1][1]);
      g.lineTo(X(s[2][0]), s[2][1]);
      g.lineTo(X(s[2][0] + 3), s[2][1] - 42);
      g.lineTo(X(s[1][0] + 4), s[1][1] - 42);
      g.closePath();
      g.fill();
      g.strokeStyle = "rgba(0,0,0,0.12)";
      g.lineWidth = 1;
      for (let t = 0.1; t < 1; t += 0.12) {
        const x0 = s[1][0] + (s[2][0] - s[1][0]) * t, y0 = s[1][1] + (s[2][1] - s[1][1]) * t;
        g.beginPath();
        g.moveTo(X(x0), y0);
        g.lineTo(X(x0 + 3), y0 - 42);
        g.stroke();
      }
    }
  }
  if (p.cut === "shirt") shirtTrims(g, p, back, dark, seam, stitch);
  if (p.cut === "crew") {
    g.fillStyle = tone(p.base, -0.05);
    g.fillRect(118, 612, W - 236, 50);
    g.strokeStyle = "rgba(0,0,0,0.12)";
    g.lineWidth = 1;
    for (let x = 124; x < W - 118; x += 6) {
      g.beginPath();
      g.moveTo(x, 614);
      g.lineTo(x, 660);
      g.stroke();
    }
  }
}

// Collar points, button placket and chest pocket; a yoke seam on the back.
function shirtTrims(g, p, back, dark, seam, stitch) {
  const hem = cutOf(p).side.at(-1)[1];
  if (back) {
    g.strokeStyle = seam;
    g.lineWidth = 1.2;
    g.beginPath(); g.moveTo(110, 112); g.quadraticCurveTo(CX, 124, W - 110, 112); g.stroke();
    return;
  }
  g.fillStyle = tone(p.base, dark ? 0.05 : -0.04);
  g.fillRect(CX - 15, 60, 30, hem - 50);
  stitchLine(g, stitch, [CX - 12, 64, CX - 12, hem]);
  stitchLine(g, stitch, [CX + 12, 64, CX + 12, hem]);
  for (let y = 96; y < hem - 30; y += 74) {
    g.fillStyle = dark ? "rgba(235,232,224,0.9)" : tone(p.base, -0.35);
    g.beginPath(); g.arc(CX, y, 5.5, 0, Math.PI * 2); g.fill();
  }
  g.fillStyle = tone(p.base, dark ? 0.1 : -0.07);
  g.strokeStyle = seam;
  g.lineWidth = 1.2;
  for (const m of [1, -1]) {
    const X = (x) => CX + m * x;
    g.beginPath();
    g.moveTo(X(54), 14); g.lineTo(X(2), 64); g.lineTo(X(36), 104); g.lineTo(X(72), 34);
    g.closePath(); g.fill(); g.stroke();
  }
  stitchLine(g, stitch, [300, 220, 368, 220, 368, 296, 334, 306, 300, 296, 300, 220]);
}

// Repeating fabric prints laid under the shading, in p.accent.
function pattern(g, p) {
  if (!p.pattern || p.pattern === "solid") return;
  const w = g.canvas.width, h = g.canvas.height, a = p.accent;
  g.save();
  g.fillStyle = a;
  switch (p.pattern) {
    case "stripe":
      for (let y = 0; y < h; y += 38) g.fillRect(0, y, w, 13);
      break;
    case "pinstripe":
      g.globalAlpha = 0.6;
      for (let x = 4; x < w; x += 18) g.fillRect(x, 0, 2, h);
      break;
    case "check":
      g.globalAlpha = 0.38;
      for (let x = 0; x < w; x += 44) g.fillRect(x, 0, 22, h);
      for (let y = 0; y < h; y += 44) g.fillRect(0, y, w, 22);
      break;
    case "tartan":
      g.globalAlpha = 0.3;
      for (let x = 0; x < w; x += 96) g.fillRect(x, 0, 40, h);
      for (let y = 0; y < h; y += 96) g.fillRect(0, y, w, 40);
      g.globalAlpha = 0.7;
      for (let x = 62; x < w; x += 96) g.fillRect(x, 0, 3, h);
      for (let y = 62; y < h; y += 96) g.fillRect(0, y, w, 3);
      break;
    case "dots":
      for (let y = 12; y < h; y += 30) for (let x = (y / 30) % 2 ? 15 : 0; x < w; x += 30) { g.beginPath(); g.arc(x, y, 4, 0, Math.PI * 2); g.fill(); }
      break;
    case "floral": {
      const r = rng(p.name.length * 53 + w);
      for (let k = 0; k < (w * h) / 2600; k++) flower(g, r() * w, r() * h, 9 + r() * 9, a);
      break;
    }
    case "butta":
      for (let y = 30; y < h; y += 52) for (let x = (y / 52) % 2 ? 40 : 14; x < w; x += 52) paisley(g, x, y, 8, a);
      break;
    case "colorblock":
      g.fillRect(0, 0, w, h * 0.34);
      g.globalAlpha = 0.85;
      g.fillStyle = "#f2f0ea";
      g.fillRect(0, h * 0.34, w, 14);
      break;
  }
  g.restore();
}

function blob(g, x, y, rad, r) {
  const n = 7, pts = [];
  for (let k = 0; k < n; k++) {
    const a = (k / n) * Math.PI * 2, rr = rad * (0.55 + r() * 0.75);
    pts.push([x + Math.cos(a) * rr * 1.3, y + Math.sin(a) * rr]);
  }
  const mid = (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2];
  const m0 = mid(pts[n - 1], pts[0]);
  g.beginPath();
  g.moveTo(m0[0], m0[1]);
  for (let k = 0; k < n; k++) {
    const m = mid(pts[k], pts[(k + 1) % n]);
    g.quadraticCurveTo(pts[k][0], pts[k][1], m[0], m[1]);
  }
  g.fill();
}

function flower(g, x, y, rad, col) {
  g.fillStyle = col;
  for (let k = 0; k < 5; k++) {
    const a = (k / 5) * Math.PI * 2;
    g.beginPath();
    g.ellipse(x + Math.cos(a) * rad * 0.62, y + Math.sin(a) * rad * 0.62, rad * 0.48, rad * 0.36, a, 0, Math.PI * 2);
    g.fill();
  }
  g.fillStyle = "#f4cf3a";
  g.beginPath();
  g.arc(x, y, rad * 0.3, 0, Math.PI * 2);
  g.fill();
}

function star(g, x, y, rad, col) {
  g.fillStyle = col;
  g.beginPath();
  for (let k = 0; k < 16; k++) {
    const a = (k / 16) * Math.PI * 2, rr = k % 2 ? rad * 0.38 : rad;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}

function art(g, p) {
  const cream = "#ece6d6";
  g.textAlign = "center";
  g.textBaseline = "alphabetic";
  switch (p.art) {
    case "camo": {
      const r = rng(41), cols = ["#2e3322", "#4f5534", "#9c8a5a", "#1e2118", "#7a7748"];
      for (let i = 0; i < 95; i++) {
        g.fillStyle = cols[i % cols.length];
        blob(g, r() * W, r() * H, 14 + r() * 36, r);
      }
      break;
    }
    case "studio":
      g.fillStyle = "rgba(236,232,222,0.85)";
      g.font = '600 10px "Instrument Sans", sans-serif';
      g.letterSpacing = "3px";
      g.fillText("HANGER CLUB", CX, 114);
      g.letterSpacing = "0px";
      break;
    case "slow":
      g.save();
      g.translate(196, 120);
      g.rotate(-0.08);
      g.fillStyle = "#b9b5ac";
      g.font = '30px "Great Vibes", cursive';
      g.fillText("slow days", 0, 0);
      g.restore();
      break;
    case "night":
      g.fillStyle = cream;
      g.beginPath(); g.arc(198, 118, 12, 0, Math.PI * 2); g.fill();
      g.fillStyle = p.base;
      g.beginPath(); g.arc(204, 114, 10, 0, Math.PI * 2); g.fill();
      break;
    case "garden":
      g.fillStyle = cream;
      g.font = '74px "Instrument Serif", Georgia, serif';
      g.fillText("Garden", CX, 196);
      g.fillText("Club", CX, 262);
      g.font = '600 11px "Instrument Sans", sans-serif';
      g.letterSpacing = "3px";
      g.fillText("GROW SLOW · EST. 2026", CX, 296);
      g.letterSpacing = "0px";
      g.fillStyle = "#f6f3ea";
      for (let k = 0; k < 8; k++) {
        const a = (k / 8) * Math.PI * 2;
        g.beginPath();
        g.ellipse(CX + Math.cos(a) * 9, 334 + Math.sin(a) * 9, 7, 4, a, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = "#f2c230";
      g.beginPath(); g.arc(CX, 334, 5.5, 0, Math.PI * 2); g.fill();
      break;
    case "afterdark": {
      const cy = 226;
      const ring = (from, to) => {
        g.save();
        g.translate(CX, cy);
        g.rotate(-0.32);
        g.beginPath();
        g.ellipse(0, 0, 98, 24, 0, from, to);
        g.restore();
      };
      g.strokeStyle = cream;
      g.lineWidth = 7;
      ring(Math.PI, Math.PI * 2);
      g.stroke();
      g.fillStyle = cream;
      g.beginPath(); g.arc(CX, cy, 50, 0, Math.PI * 2); g.fill();
      g.fillStyle = p.base;
      g.beginPath(); g.arc(CX + 22, cy - 12, 44, 0, Math.PI * 2); g.fill();
      ring(0, Math.PI);
      g.strokeStyle = p.base; g.lineWidth = 14; g.stroke();
      g.strokeStyle = cream; g.lineWidth = 7; g.stroke();
      const txt = "AFTER DARK SUPPLY CO. · EST. 2026 · ";
      g.fillStyle = cream;
      g.font = '600 13px "Instrument Sans", sans-serif';
      for (let i = 0; i < txt.length; i++) {
        const a = -Math.PI / 2 + (i / txt.length) * Math.PI * 2;
        g.save();
        g.translate(CX + Math.cos(a) * 124, cy + Math.sin(a) * 124);
        g.rotate(a + Math.PI / 2);
        g.fillText(txt[i], 0, 0);
        g.restore();
      }
      break;
    }
    case "bloom": {
      g.fillStyle = "#1b1b1f";
      g.font = '98px "Great Vibes", cursive';
      g.fillText("Bloom", CX + 6, 196);
      const F = [
        [180, 262, 17, "#f29cc0"], [306, 246, 15, "#b48ad6"], [234, 318, 19, "#f2a531"],
        [160, 352, 15, "#5bb7e6"], [326, 318, 13, "#f29cc0"], [288, 372, 11, "#b48ad6"],
      ];
      for (const [x, y, rad, col] of F) flower(g, x, y, rad, col);
      const S = [[262, 236, 14, "#e2412f"], [246, 386, 12, "#2f8fe2"], [340, 360, 9, "#e2412f"], [140, 296, 8, "#3fae5a"], [352, 262, 7, "#f2c230"]];
      for (const [x, y, rad, col] of S) star(g, x, y, rad, col);
      const r = rng(5);
      for (let k = 0; k < 34; k++) {
        g.fillStyle = r() > 0.5 ? "#1b1b1f" : "#2f8fe2";
        g.beginPath();
        g.arc(140 + r() * 230, 226 + r() * 180, 1.6, 0, Math.PI * 2);
        g.fill();
      }
      g.fillStyle = "#9b9890";
      g.font = 'italic 14px "Instrument Serif", Georgia, serif';
      g.fillText("from the garden, with love", CX, 430);
      break;
    }
    case "ticket": {
      g.save();
      g.translate(CX - 6, 148);
      g.rotate(-0.07);
      const w = 152, h = 60;
      g.fillStyle = "#f6dcc2";
      g.beginPath();
      g.roundRect(-w / 2, -h / 2, w, h, 4);
      g.fill();
      g.fillStyle = p.base;
      for (const x of [-w / 2, w / 2]) {
        g.beginPath(); g.arc(x, 0, 7, 0, Math.PI * 2); g.fill();
      }
      g.strokeStyle = "#de5f36";
      g.lineWidth = 1.6;
      g.strokeRect(-w / 2 + 9, -h / 2 + 6, w - 18, h - 12);
      g.setLineDash([3, 3]);
      g.beginPath(); g.moveTo(w / 2 - 30, -h / 2 + 6); g.lineTo(w / 2 - 30, h / 2 - 6); g.stroke();
      g.setLineDash([]);
      g.fillStyle = "#de5f36";
      g.font = '25px "Instrument Serif", Georgia, serif';
      g.fillText("ADMIT ONE", -12, 6);
      g.font = '600 6.5px "Instrument Sans", sans-serif';
      g.fillText("HANGER CLUB · ROW A · SEAT 12", -12, 19);
      g.save();
      g.translate(w / 2 - 17, 0);
      g.rotate(-Math.PI / 2);
      g.font = '600 8px "Instrument Sans", sans-serif';
      g.fillText("No 0426", 0, 3);
      g.restore();
      g.restore();
      break;
    }
  }
}

function side(p, back) {
  const cut = cutOf(p), c = canvas(W, shapes.fitted(p.cut, p.fit).tex[1]), g = c.getContext("2d");
  outline(g, cut, back);
  g.fillStyle = p.base;
  g.fill();
  g.save();
  g.clip();
  pattern(g, p);
  fabric(g, p, back);
  if (!back) art(g, p);
  trims(g, p, back);
  g.restore();
  outline(g, cut, back);
  g.strokeStyle = "rgba(0,0,0,0.14)";
  g.lineWidth = 1.5;
  g.stroke();
  return c;
}

// ---- Bottoms, dresses, sarees ---------------------------------------------

function piece(p, back, path, inside) {
  const [w, h] = shapes.fitted(p.cut, p.fit).tex, c = canvas(w, h), g = c.getContext("2d");
  path(g, back);
  g.fillStyle = p.base;
  g.fill();
  g.save();
  g.clip();
  pattern(g, p);
  inside(g, back);
  const side = g.createLinearGradient(0, 0, w, 0);
  side.addColorStop(0, "rgba(0,0,0,0.16)");
  side.addColorStop(0.25, "rgba(0,0,0,0)");
  side.addColorStop(0.75, "rgba(0,0,0,0)");
  side.addColorStop(1, "rgba(0,0,0,0.16)");
  g.fillStyle = side;
  g.fillRect(0, 0, w, h);
  const vert = g.createLinearGradient(0, 0, 0, h);
  vert.addColorStop(0, "rgba(255,255,255,0.08)");
  vert.addColorStop(0.3, "rgba(255,255,255,0)");
  vert.addColorStop(1, "rgba(0,0,0,0.12)");
  g.fillStyle = vert;
  g.fillRect(0, 0, w, h);
  grain(g);
  g.restore();
  path(g, back);
  g.strokeStyle = "rgba(0,0,0,0.14)";
  g.lineWidth = 1.5;
  g.stroke();
  return c;
}

function stitchLine(g, col, pts, dash = [5, 4]) {
  g.setLineDash(dash);
  g.strokeStyle = col;
  g.lineWidth = 1.4;
  g.beginPath();
  g.moveTo(pts[0], pts[1]);
  for (let k = 2; k < pts.length; k += 2) g.lineTo(pts[k], pts[k + 1]);
  g.stroke();
  g.setLineDash([]);
}

// Crotch at 300 on full-length pants; shorts split lower and flare a little.
// wd < 1 tapers the legs to the hem, wd > 1 flares them.
function pantsPath(h, wd = 1) {
  const c = Math.min(300, 0.6 * h), hip = Math.min(250, c - 40), f = (h < 600 ? 22 : 0) + (wd - 1) * 150;
  // Clockwise, so a negative bow curves an edge outward: rounded hips, the
  // outer seam easing in toward the knee, a softly scooped inseam and hem.
  // Waist a touch narrower than the hips; shorts' leg openings rise toward
  // the inseam, so each leg angles out instead of ending square.
  const rise = h < 600 ? 22 : 0;
  const P = [[48, 0], [464, 0], [482, hip], [446 + f, h - 4], [290 - f / 2, h - 4 - rise], [262, c]];
  const Q = [[250, c], [222 + f / 2, h - 4 - rise], [66 - f, h - 4], [30, hip], [48, 0]];
  return (g) => {
    g.beginPath();
    g.moveTo(...P[0]);
    g.lineTo(...P[1]);
    bow(g, P[1], P[2], -9);
    bow(g, P[2], P[3], 6);
    bow(g, P[3], P[4], -4);
    bow(g, P[4], P[5], 5);
    g.quadraticCurveTo(256, c - 12, 250, c);
    bow(g, Q[0], Q[1], 5);
    bow(g, Q[1], Q[2], -4);
    bow(g, Q[2], Q[3], 6);
    bow(g, Q[3], Q[4], -9);
    g.closePath();
  };
}

function pants(g, p, back) {
  const denim = p.art === "denim", r = rng(p.name.length * 31 + (back ? 7 : 0));
  const h = shapes.fitted(p.cut, p.fit).tex[1], c = Math.min(300, 0.6 * h);
  const stitch = denim ? "rgba(214,140,58,0.85)" : "rgba(0,0,0,0.22)";
  if (denim) {
    g.strokeStyle = "rgba(255,255,255,0.05)";
    g.lineWidth = 1;
    for (let x = -900; x < 512; x += 4) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + h / 2, h); g.stroke(); }
    for (const [x, y] of [[150, 0.56 * h], [362, 0.56 * h], [150, 230], [362, 230]]) {
      const m = g.createRadialGradient(x, y, 0, x, y, 120);
      m.addColorStop(0, "rgba(190,210,240,0.2)");
      m.addColorStop(1, "rgba(190,210,240,0)");
      g.fillStyle = m;
      g.fillRect(x - 120, y - 120, 240, 240);
    }
    if (!back) {
      g.strokeStyle = "rgba(220,230,250,0.22)";
      g.lineWidth = 2;
      for (const m of [1, -1]) for (let k = 0; k < 5; k++) {
        const y = c + k * 14 + r() * 6, x0 = 256 - m * 14;
        g.beginPath(); g.moveTo(x0, y); g.quadraticCurveTo(x0 - m * 40, y - 4, x0 - m * (70 + r() * 30), y - 16); g.stroke();
      }
    }
  }
  g.fillStyle = tone(p.base, -0.08);
  g.fillRect(0, 0, 512, 46);
  stitchLine(g, stitch, [40, 6, 472, 6]);
  stitchLine(g, stitch, [36, 40, 476, 40]);
  g.fillStyle = tone(p.base, -0.12);
  for (const x of [72, 168, 344, 440]) g.fillRect(x - 6, 0, 12, 56);
  for (const m of [1, -1]) {
    const X = (x) => (m > 0 ? x : 512 - x);
    if (back) {
      g.strokeStyle = "rgba(0,0,0,0.25)";
      g.beginPath(); g.moveTo(X(36), 120); g.lineTo(X(256), 160); g.stroke();
      stitchLine(g, stitch, [X(110), 190, X(210), 196, X(206), 300, X(160), 322, X(114), 296, X(110), 190]);
    } else {
      g.strokeStyle = "rgba(0,0,0,0.3)";
      g.lineWidth = 1.5;
      g.beginPath(); g.moveTo(X(56), 46); g.quadraticCurveTo(X(70), 150, X(160), 150); g.stroke();
      stitchLine(g, stitch, [X(62), 46, X(74), 140, X(160), 142]);
    }
    stitchLine(g, stitch, [X(66), h - 30, X(222), h - 30]);
  }
  if (!back) {
    stitchLine(g, stitch, [278, 46, 278, c - 84, 256, c - 52]);
    g.fillStyle = denim ? "#b9b2a2" : tone(p.base, -0.3);
    g.beginPath(); g.arc(256, 23, 9, 0, Math.PI * 2); g.fill();
  }
}

// Wide shoulder straps (where the hanger holds it), scoop neck, fitted bodice.
// wd scales the skirt's flare (the hem can't grow past the canvas).
function gownPath(w, h, waist, wd = 1) {
  return (g) => {
    const c = w / 2, fl = 150 * wd, hx = c + (c - 6) * Math.min(wd, 1);
    g.beginPath();
    g.moveTo(c - 106, 0); g.lineTo(c - 60, 0); g.quadraticCurveTo(c, 130, c + 60, 0); g.lineTo(c + 106, 0);
    g.quadraticCurveTo(c + 86, 60, c + 96, 120); g.quadraticCurveTo(c + 104, (120 + waist) / 2, c + 84, waist);
    g.quadraticCurveTo(c + fl, waist + 100, hx, h - 20); g.quadraticCurveTo(c, h + 6, w - hx, h - 20);
    g.quadraticCurveTo(c - fl, waist + 100, c - 84, waist); g.quadraticCurveTo(c - 104, (120 + waist) / 2, c - 96, 120); g.quadraticCurveTo(c - 86, 60, c - 106, 0);
    g.closePath();
  };
}

function gown(g, p, back) {
  const [w, h] = shapes.fitted(p.cut, p.fit).tex, c = w / 2, waist = p.cut === "frock" ? 160 : 230, r = rng(p.name.length * 13);
  if (p.art === "polka") {
    g.fillStyle = "rgba(255,255,255,0.85)";
    for (let y = 10; y < h; y += 34) for (let x = (y / 34) % 2 ? 17 : 0; x < w; x += 34) { g.beginPath(); g.arc(x, y, 4.5, 0, Math.PI * 2); g.fill(); }
  } else if (!p.pattern) {
    for (let k = 0; k < 900; k++) {
      g.fillStyle = r() > 0.5 ? "rgba(255,240,220,0.5)" : "rgba(80,30,10,0.25)";
      g.beginPath(); g.arc(r() * w, r() * h, 1.6, 0, Math.PI * 2); g.fill();
    }
  }
  g.strokeStyle = "rgba(0,0,0,0.08)";
  g.lineWidth = 2;
  for (let k = -7; k <= 7; k++) {
    g.beginPath(); g.moveTo(c + k * 11, waist + 6); g.quadraticCurveTo(c + k * 18, waist + 140, c + k * 34, h); g.stroke();
  }
  g.fillStyle = tone(p.base, -0.1);
  g.fillRect(0, waist - 10, w, p.cut === "frock" ? 22 : 14);
  if (p.cut === "frock" && !back) {
    g.fillStyle = tone(p.base, -0.16);
    for (const m of [1, -1]) {
      g.beginPath(); g.ellipse(c + m * 18, waist, 18, 9, m * 0.4, 0, Math.PI * 2); g.fill();
    }
    g.beginPath(); g.arc(c, waist + 1, 6, 0, Math.PI * 2); g.fill();
  }
  if (p.cut === "dress" && !back) {
    g.fillStyle = "#efe6d6";
    for (let y = 120; y < waist - 20; y += 28) { g.beginPath(); g.arc(c, y, 4, 0, Math.PI * 2); g.fill(); }
  }
  stitchLine(g, "rgba(0,0,0,0.18)", [8, h - 34, w - 8, h - 34]);
}

function sareePath(back) {
  return (g) => {
    g.beginPath();
    // Folded over the bar as one rectangle; the pallu is the right-hand panel.
    g.rect(0, 0, 512, back ? 380 : 628);
  };
}

function paisley(g, x, y, s, col) {
  g.fillStyle = col;
  g.beginPath();
  g.moveTo(x, y + s);
  g.bezierCurveTo(x - s, y + s * 0.6, x - s * 0.8, y - s * 0.7, x, y - s * 0.7);
  g.bezierCurveTo(x + s * 0.9, y - s * 0.7, x + s * 0.5, y - s * 1.4, x + s * 0.2, y - s * 1.2);
  g.bezierCurveTo(x + s * 1.1, y - s * 1.2, x + s * 0.9, y + s * 0.6, x, y + s);
  g.fill();
}

function saree(g, p, back) {
  const silk = p.art === "zari", zari = silk ? "#d8ad45" : "#dfe3e8", r = rng(p.name.length * 7);
  const band = (x, y, w, h) => {
    const gr = g.createLinearGradient(0, y, 0, y + h);
    gr.addColorStop(0, zari); gr.addColorStop(0.5, tone(zari, 0.35)); gr.addColorStop(1, zari);
    g.fillStyle = gr;
    g.fillRect(x, y, w, h);
    g.fillStyle = tone(p.base, -0.15);
    for (let k = x + 6; k < x + w; k += 14) { g.beginPath(); g.moveTo(k, y + h * 0.3); g.lineTo(k + 5, y + h * 0.7); g.lineTo(k - 5, y + h * 0.7); g.fill(); }
  };
  const butta = silk ? (x, y) => paisley(g, x, y, 5, zari) : (x, y) => { g.fillStyle = zari; g.beginPath(); g.arc(x, y, 2, 0, Math.PI * 2); g.fill(); };
  if (back) {
    for (let k = 0; k < 60; k++) butta(r() * 512, 20 + r() * 320);
    band(0, 344, 512, silk ? 36 : 18);
    return;
  }
  const bw = silk ? 46 : 22;
  for (let y = 40; y < 628 - bw - 20; y += 38) for (let x = (y / 38) % 2 ? 38 : 16; x < 300; x += 44) butta(x, y);
  band(0, 628 - bw, 336, bw);
  band(0, 0, silk ? 26 : 14, 628);
  // Pallu: stripes and large motifs, border down its free edge, tassels at the end.
  const fade = g.createLinearGradient(0, 90, 0, 160);
  fade.addColorStop(0, "rgba(0,0,0,0)");
  fade.addColorStop(1, silk ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.1)");
  g.fillStyle = fade;
  g.fillRect(336, 90, 176, 540);
  for (let y = 150; y < 620; y += silk ? 120 : 70) band(336, y, 176, silk ? 16 : 6);
  for (let y = 210; y < 600; y += 120) for (const x of [380, 450]) silk ? paisley(g, x, y, 18, zari) : star(g, x, y, 10, zari);
  band(silk ? 484 : 498, 0, silk ? 28 : 14, 628);
  g.strokeStyle = zari;
  g.lineWidth = 2;
  for (let x = 342; x < 512; x += 8) { g.beginPath(); g.moveTo(x, 614); g.lineTo(x + r() * 2, 628); g.stroke(); }
}

// Kurti sleeves, right side (x from centre): points from the shoulder tip
// down and back in to the armpit. The last two points are the sleeve's open
// edge, where the embroidered border goes.
// bows run shoulder tip → … → armpit; the outline is clockwise, so negative
// rounds an edge outward (shoulder, sleeve) and positive scoops it in (underarm).
const KURTI_SLEEVES = {
  none: { pts: [[112, 24], [104, 92]], armpit: [100, 122], bows: [0, 10, 2] },
  cap: { pts: [[176, 46], [150, 138]], armpit: [102, 120], bows: [-6, -3, 10] },
  half: { pts: [[188, 62], [196, 250], [146, 262]], armpit: [104, 134], bows: [-8, -10, -2, 10] },
  full: { pts: [[184, 58], [230, 468], [184, 484]], armpit: [106, 142], bows: [-8, -12, -2, 12] },
};

// Kurti geometry for a product: hem height (grows with length), body width,
// sleeve. Lengths stretch everything below the armpit.
function kurtiFit(p, sh) {
  const f = p.fit ?? {}, Hk = sh.tex[1] - (p.cut === "kurtiSet" ? 256 : 0);
  return { Hk, wd: WIDTH[f.width ?? "regular"], sleeve: KURTI_SLEEVES[f.sleeve ?? "cap"], none: f.sleeve === "none" };
}

// Scoop neck, the chosen sleeve, a straight body easing out to the hem.
function kurtiOutline(g, k) {
  const c = 256, { Hk, wd, sleeve } = k, ay = sleeve.armpit[1];
  const Y = (y) => ay + ((y - ay) * (Hk - ay)) / (704 - ay);
  const arm = [[108, 0], ...sleeve.pts, sleeve.armpit], R = ([x, y]) => [c + x, y], L = ([x, y]) => [c - x, y];
  g.moveTo(c - 108, 0); g.lineTo(c - 52, 0); g.quadraticCurveTo(c, 120, c + 52, 0); g.lineTo(c + 108, 0);
  for (let i = 1; i < arm.length; i++) bow(g, R(arm[i - 1]), R(arm[i]), sleeve.bows[i - 1]);
  g.lineTo(c + 106 * wd, Y(330)); g.quadraticCurveTo(c + 140 * wd, Y(520), c + 148 * wd, Hk - 8);
  g.quadraticCurveTo(c, Hk + 2, c - 148 * wd, Hk - 8);
  g.quadraticCurveTo(c - 140 * wd, Y(520), c - 106 * wd, Y(330));
  g.lineTo(c - sleeve.armpit[0], ay);
  for (let i = arm.length - 1; i > 0; i--) bow(g, L(arm[i]), L(arm[i - 1]), sleeve.bows[i - 1]);
  g.closePath();
}

function kurtiPath(p, sh) {
  const k = kurtiFit(p, sh);
  return (g) => {
    g.beginPath();
    kurtiOutline(g, k);
  };
}

// Embroidered yoke round the neck, borders at the sleeves and hem.
function kurti(g, p, back) {
  const c = 256, k = kurtiFit(p, shapes.fitted(p.cut, p.fit)), h = k.Hk, trim = p.trim ?? "#d8ad45";
  g.fillStyle = trim;
  if (!k.none) {
    const [[x1, y1], [x2, y2]] = k.sleeve.pts.slice(-2), a = Math.atan2(y2 - y1, x2 - x1), len = Math.hypot(x2 - x1, y2 - y1);
    for (const m of [1, -1]) {
      g.save();
      g.translate(c + (m * (x1 + x2)) / 2, (y1 + y2) / 2);
      g.rotate(m > 0 ? a : Math.PI - a);
      g.fillRect(-len / 2, -6, len, 12);
      g.restore();
    }
  }
  g.fillRect(0, h - 44, 512, 18);
  g.fillStyle = tone(p.base, -0.15);
  for (let x = 6; x < 512; x += 14) { g.beginPath(); g.moveTo(x, h - 40); g.lineTo(x + 5, h - 30); g.lineTo(x - 5, h - 30); g.fill(); }
  if (back) return;
  g.strokeStyle = trim;
  g.lineWidth = 9;
  g.beginPath(); g.moveTo(c - 60, 0); g.quadraticCurveTo(c, 136, c + 60, 0); g.stroke();
  g.fillStyle = trim;
  for (let t = 0.1; t < 0.95; t += 0.1) {
    const u = 1 - t, x = u * u * (c - 72) + 2 * u * t * c + t * t * (c + 72), y = 2 * u * t * 152;
    g.beginPath(); g.arc(x, y + 6, 3.2, 0, Math.PI * 2); g.fill();
  }
  stitchLine(g, trim, [c, 66, c, 190], [3, 5]);
  stitchLine(g, "rgba(0,0,0,0.18)", [8, h - 60, 504, h - 60]);
}

// Kurta set: the bottoms hang on the same hanger, legs showing below the
// kurti's hem. Both sub-paths run clockwise so their overlap stays filled and
// the legs stay joined to the kurti in the cloth. Drawn for a 704 hem and
// shifted down by however much longer the kurti is.
const LEGS = {
  straight: [[[178, 640], [252, 640], [246, 952], [186, 952]], [[260, 640], [334, 640], [326, 952], [266, 952]]],
  palazzo: [[[170, 640], [252, 640], [250, 952], [134, 952]], [[260, 640], [342, 640], [378, 952], [262, 952]]],
};

function legs(p, d) {
  return LEGS[p.bottom].map((leg) => leg.map(([x, y]) => [x, y + d]));
}

function kurtiSetPath(p, sh) {
  const k = kurtiFit(p, sh), d = k.Hk - 704;
  return (g) => {
    g.beginPath();
    kurtiOutline(g, k);
    for (const leg of legs(p, d)) {
      g.moveTo(...leg[0]);
      for (const pt of leg.slice(1)) g.lineTo(...pt);
      g.closePath();
    }
  };
}

function kurtiSet(g, p, back) {
  kurti(g, p, back);
  const d = kurtiFit(p, shapes.fitted(p.cut, p.fit)).Hk - 704, top = 700 + d;
  g.save();
  g.beginPath();
  g.rect(0, top, 512, 260);
  g.clip();
  for (const leg of legs(p, d)) {
    g.fillStyle = p.bottomColor;
    g.beginPath();
    g.moveTo(...leg[0]);
    for (const pt of leg.slice(1)) g.lineTo(...pt);
    g.fill();
    // A pressed crease down each leg and a stitched hem.
    const [[x0], [x1], [x2, y2], [x3]] = leg, mid = (x0 + x1) / 2, low = (x2 + x3) / 2;
    g.strokeStyle = tone(p.bottomColor, -0.12);
    g.lineWidth = 1.5;
    g.beginPath(); g.moveTo(mid, top); g.lineTo(low, y2); g.stroke();
    stitchLine(g, "rgba(0,0,0,0.2)", [x3 + 4, y2 - 14, x2 - 4, y2 - 14]);
  }
  // The kurti's hem shades the bottoms just beneath it.
  const sh = g.createLinearGradient(0, top, 0, top + 40);
  sh.addColorStop(0, "rgba(0,0,0,0.22)");
  sh.addColorStop(1, "rgba(0,0,0,0)");
  g.fillStyle = sh;
  g.fillRect(0, top, 512, 40);
  g.restore();
}

// Outline builders take the product and its fitted shape (length already in
// the shape's height; width and sleeve from p.fit).
const PIECES = {
  pants: { path: (back, p, sh) => pantsPath(sh.tex[1], WIDTH[p.fit?.width ?? "regular"]), paint: pants },
  shorts: { path: (back, p, sh) => pantsPath(sh.tex[1], WIDTH[p.fit?.width ?? "regular"]), paint: pants },
  kurti: { path: (back, p, sh) => kurtiPath(p, sh), paint: kurti },
  kurtiSet: { path: (back, p, sh) => kurtiSetPath(p, sh), paint: kurtiSet },
  dress: { path: (back, p, sh) => gownPath(512, sh.tex[1], 230, WIDTH[p.fit?.width ?? "regular"]), paint: gown },
  frock: { path: (back, p, sh) => gownPath(512, sh.tex[1], 160, WIDTH[p.fit?.width ?? "regular"]), paint: gown },
  saree: { path: (back) => sareePath(back), paint: saree },
};

export function garment(p) {
  const k = PIECES[p.cut];
  if (!k) return { front: side(p, false), back: side(p, true) };
  const sh = shapes.fitted(p.cut, p.fit);
  const make = (back) => piece(p, back, k.path(back, p, sh), (g) => k.paint(g, p, back));
  return { front: make(false), back: make(true) };
}
