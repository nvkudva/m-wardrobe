// Garment shapes: how a piece hangs. Sizes are hanger-local units (a tee is
// 0.8 wide); u runs across the art, v from the top edge (0) to the hem (1).
//   tex      art canvas size, same aspect as w × h
//   sim/grid solver and render grid resolution
//   pins     u-ranges of the top edge held by the hanger
//   hold     how far down the cut holds its shape (higher = only near the top)
//   support  share of gravity carried by the cut at the top edge (sleeves out)
//   folds    rest-pose waves in depth: pleats, godets, flare
//   body     how far each sheet stands off the cloth surface (gives volume)

function torso(t) {
  return (u, v) => {
    const tx = (u - 0.5) / t, body = tx * tx < 1 ? Math.sqrt(1 - tx * tx) : 0;
    const vert = (0.45 + 0.55 * Math.min(v / 0.25, 1)) * (1 - 0.3 * v);
    return body > 0 ? 0.022 + 0.04 * body * vert : 0.008;
  };
}

const top = { stretch: 500, w: 0.8, h: 0.95, tex: [512, 672], sim: [13, 17], grid: [22, 28], hanger: "shoulder", pins: [[0.25, 0.75]], hold: 3.2, support: 0.8 };

export const tee = { ...top, body: torso(0.28), fabric: "jersey" };
export const ls = { ...top, body: torso(0.25), fabric: "jersey" };
export const crew = { ...top, body: torso(0.25), fabric: "fleece" };
export const shirt = { ...top, body: torso(0.25), fabric: "poplin" };

// Held by two clips at the waistband; the legs split below the crotch (v).
function legs(crotch) {
  return (u, v) => {
    if (v < crotch) {
      const tx = (u - 0.5) / 0.46;
      return 0.01 + 0.03 * Math.sqrt(Math.max(0, 1 - tx * tx)) * Math.min(v / 0.12, 1);
    }
    const tx = (Math.abs(u - 0.5) - 0.24) / 0.22;
    return 0.006 + 0.022 * Math.sqrt(Math.max(0, 1 - tx * tx));
  };
}

// Full-length leg (about 2.2× the waist across, like real jeans laid flat).
// baseH lets pants hang longer than a tee instead of being shrunk to its length.
export const pants = {
  w: 0.62, h: 1.36, tex: [512, 1123], sim: [13, 28], grid: [22, 48], hanger: "clip", baseH: 1.12,
  pins: [[0.06, 0.2], [0.8, 0.94]], hold: 5, support: 0.6, fabric: "denim", body: legs(0.27), stretch: 820,
};

export const shorts = { ...pants, h: 0.5, tex: [512, 413], sim: [13, 11], grid: [22, 19], baseH: undefined, hold: 4, body: legs(0.55), stretch: 300 };

// Narrow bodice on straps, skirt flaring to a wide hem.
function gown(bodice, waist) {
  return (u, v) => {
    if (v > waist) return 0.012 + 0.01 * (1 - v);
    const tx = (u - 0.5) / bodice, body = tx * tx < 1 ? Math.sqrt(1 - tx * tx) : 0;
    return 0.008 + 0.03 * body * Math.min(v / 0.15, 1);
  };
}

export const dress = {
  w: 0.8, h: 1, tex: [512, 640], sim: [13, 19], grid: [22, 32], hanger: "shoulder",
  pins: [[0.3, 0.7]], hold: 4, support: 0.6, folds: { n: 4, amp: 0.022, from: 0.38 },
  body: gown(0.17, 0.36), fabric: "linen", stretch: 410,
};

export const frock = {
  w: 0.9, h: 0.84, tex: [512, 478], sim: [15, 15], grid: [26, 24], hanger: "shoulder",
  pins: [[0.32, 0.68]], hold: 3.5, support: 0.6, folds: { n: 5, amp: 0.03, from: 0.36 },
  body: gown(0.15, 0.34), fabric: "silk", stretch: 318,
};

// Long tunic with cap sleeves, gently A-line to the hem.
export const kurti = {
  w: 0.8, h: 1.1, tex: [512, 704], sim: [13, 21], grid: [22, 34], hanger: "shoulder",
  pins: [[0.3, 0.7]], hold: 3.6, support: 0.7, folds: { n: 3, amp: 0.012, from: 0.45 },
  body: gown(0.2, 0.45), fabric: "linen", stretch: 574,
};

// Kurta set: the kurti with its bottoms hanging below the hem on the same hanger.
export const kurtiSet = {
  ...kurti, h: 1.5, tex: [512, 960], sim: [13, 27], grid: [22, 44], folds: { n: 3, amp: 0.01, from: 0.4 },
};

// Hanging display: one sheet folded over the bar. The two sheets wrap round
// the bar's half-circle from the shared top edge, then lie together below.
const BAR_R = 0.02;
function overBar(h) {
  return (u, v) => {
    const d = v * h;
    if (d < BAR_R) return Math.sqrt(BAR_R * BAR_R - (BAR_R - d) * (BAR_R - d));
    return 0.004 + (BAR_R - 0.004) * Math.exp(-(d - BAR_R) / 0.03);
  };
}
export const saree = {
  w: 0.8, h: 1, tex: [512, 640], sim: [15, 19], grid: [26, 32], hanger: "bar",
  pins: [[0, 1]], hold: 7, support: 0, folds: { n: 3.5, amp: 0.014, from: 0.05 },
  body: overBar(1), fabric: "silk",
};

// ---- Fit -----------------------------------------------------------------
// A product's p.fit = { length, width, sleeve }. Length changes the shape
// itself: `stretch` texels of the cut (the part below the armpit or waist)
// grow or shrink, and the cloth grid with them. Width and sleeve only change
// the painted outline (paint.js). baseH keeps the hanger's size-to-fit scale
// at the cut's regular length, so a long piece really hangs longer.
const LENGTH = { short: 0.92, regular: 1, long: 1.1 };
const CUTS = { tee, ls, crew, shirt, pants, shorts, dress, frock, kurti, kurtiSet, saree };

export function fitted(cut, fit = {}) {
  const s = typeof cut === "string" ? CUTS[cut] : cut, k = LENGTH[fit.length ?? "regular"];
  if (k === 1 || !s.stretch) return s;
  const H = s.tex[1], H2 = H + Math.round(s.stretch * (k - 1)), r = H2 / H;
  return {
    ...s, h: s.h * r, tex: [s.tex[0], H2], baseH: s.baseH ?? s.h,
    sim: [s.sim[0], Math.round(s.sim[1] * r)], grid: [s.grid[0], Math.round(s.grid[1] * r)],
  };
}
