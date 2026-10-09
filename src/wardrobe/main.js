import * as THREE from "three";
import * as paint from "../paint.js";
import * as rails from "../rail.js";
import * as variants from "../variants.js";
import * as product from "../product.js";
import * as nav from "./nav.js";

// Nyntra wardrobe: category tiles over a stack of rails, one per sub-category.
// One renderer draws every rail into its own strip of a shared canvas; tapping
// the focused garment re-frames that rail to the whole screen as its detail view.

const PER_RAIL = 12;
const BUILD_MS = 10; // stocking work per frame
// Strip framing: the rail near the top, garments filling the strip below it.
const STRIP = { ...rails.PHONE, railY: 0.07, s0: [0.68, 0.345] };
// Table rows: products stand on the table near the bottom of the strip; in
// detail the piece stands mid-screen so it reads above the text.
const TABLE = { ...rails.PHONE, railY: 0.85, s0: [0.74, 0.34] };
const TABLE_PDP = { ...rails.PHONE, pdpY: 0.55, sPdp: [0.6, 0.86] };
const PDP = { ...rails.PHONE, pdpY: 0.155, sPdp: [0.44, 0.8] };
const LAYOUTS = { bar: { strip: STRIP, pdp: PDP }, table: { strip: TABLE, pdp: TABLE_PDP } };

const $ = (id) => document.getElementById(id);
const screenEl = $("screen"), scrollEl = $("scroll"), canvas = $("gl");

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NeutralToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.shadowMap.autoUpdate = false; // re-cast only when a rail's contents moved
renderer.setScissorTest(true);

// Each entry: { rail, view, caption, el, pdp }.
let shelf = [], active = null, layoutDirty = true, building = 0, current = null;
const bag = { size: "M" };

const els = {
  counter: $("counter"), title: $("title"), price: $("price"), desc: $("desc"),
  sizes: $("sizes"), add: $("addBtn"), bag: $("bagCount"), bagBtn: $("bagBtn"),
};

// ---- Layout ---------------------------------------------------------------

function box(el) {
  const s = screenEl.getBoundingClientRect(), r = el.getBoundingClientRect();
  return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height };
}

function resize() {
  renderer.setSize(screenEl.clientWidth, screenEl.clientHeight, false);
  for (const s of shelf) {
    if (s === active) s.rail.resize(screenEl.clientWidth, screenEl.clientHeight, s.pdp);
    else s.rail.resize(s.view.clientWidth, s.view.clientHeight);
  }
  layoutDirty = true;
}

// World transform taking a strip's framing to the full screen's: same pixels.
function stripToScreen(s) {
  const r = box(s.view), W = screenEl.clientWidth, H = screenEl.clientHeight;
  const wpp = s.rail.L.visH / H; // world units per pixel at full screen
  return { k: r.h / H, ox: (r.x + r.w / 2 - W / 2) * wpp, oy: -(r.y + r.h / 2 - H / 2) * wpp };
}

// ---- Labels ---------------------------------------------------------------

const rupees = (n) => `₹${n.toLocaleString("en-IN")}`;

function swap(el, html) {
  if (el.innerHTML === html) return;
  el.classList.add("out");
  clearTimeout(el._t);
  el._t = setTimeout(() => {
    el.innerHTML = html;
    el.classList.remove("out");
    layoutDirty = true; // a caption that changed height shifts the rails below
  }, 140);
}

function caption(s) {
  const p = s.rail.garments[s.rail.ui.focus].p;
  swap(s.caption, `<b>${p.name}</b><span>${rupees(p.price)}</span>`);
}

function pdpLabel() {
  const r = active.rail, p = r.garments[r.ui.sel].p, n = r.garments.length;
  els.counter.textContent = `${String(r.ui.sel + 1).padStart(2, "0")} / ${String(n).padStart(2, "0")}`;
  els.title.textContent = p.name;
  const off = Math.round((1 - p.price / p.mrp) * 100);
  els.price.innerHTML = `${rupees(p.price)}<s>${rupees(p.mrp)}</s><em>(${off}% OFF)</em>`;
  els.desc.textContent = p.desc;
  if (els.sizes.dataset.for !== p.sizes.join()) {
    els.sizes.dataset.for = p.sizes.join();
    const on = Math.min(1, p.sizes.length - 1);
    els.sizes.innerHTML = p.sizes.map((z, i) => `<button class="${i === on ? "on" : ""}">${z}</button>`).join("");
    bag.size = p.sizes[on];
  }
}

// ---- Rack ↔ detail ----------------------------------------------------------

function open(s) {
  if (active || !s.rail.garments.length) return;
  const W = screenEl.clientWidth, H = screenEl.clientHeight;
  s.rail.resize(W, H, s.pdp);
  const { k, ox, oy } = stripToScreen(s);
  s.rail.remap(k, ox, oy);
  s.rail.open();
  active = s;
  screenEl.dataset.mode = "pdp";
  pdpLabel();
  layoutDirty = true;
}

function close() {
  const s = active;
  if (!s) return;
  const { k, ox, oy } = stripToScreen(s);
  s.rail.close();
  s.rail.resize(s.view.clientWidth, s.view.clientHeight);
  s.rail.remap(1 / k, -ox / k, -oy / k);
  active = null;
  screenEl.dataset.mode = "rack";
  caption(s);
  layoutDirty = true;
}

function step(dir) {
  if (!active) return;
  active.rail.step(dir);
  pdpLabel();
}

// ---- Shelf ------------------------------------------------------------------

const ndc = new THREE.Vector2();
function pick(s, ev) {
  const r = s.view.getBoundingClientRect();
  ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
  return s.rail.pick(ndc);
}

function focus(s, i) {
  if (s.rail.setFocus(i)) caption(s);
}

function wire(s) {
  const v = s.view;
  let drag = null, lastHover = 0, wheelAcc = 0;
  v.addEventListener("pointerdown", (e) => {
    drag = { x: e.clientX, focus: s.rail.ui.focus, moved: 0 };
    if (e.pointerType === "mouse") v.setPointerCapture(e.pointerId);
  });
  v.addEventListener("pointermove", (e) => {
    if (drag) {
      const dx = e.clientX - drag.x;
      drag.moved = Math.max(drag.moved, Math.abs(dx));
      if (drag.moved > 6) focus(s, Math.round(drag.focus - dx / (v.clientWidth * 0.12)));
      return;
    }
    if (e.pointerType !== "mouse" || e.timeStamp - lastHover < 260) return;
    const i = pick(s, e);
    if (i >= 0 && i !== s.rail.ui.focus) {
      focus(s, i);
      lastHover = e.timeStamp;
    }
  });
  v.addEventListener("pointerup", (e) => {
    if (!drag) return;
    const moved = drag.moved;
    drag = null;
    if (moved >= 6) return;
    const i = pick(s, e);
    if (i === s.rail.ui.focus) open(s);
    else if (i >= 0) focus(s, i);
  });
  v.addEventListener("pointercancel", () => (drag = null));
  v.addEventListener("wheel", (e) => {
    if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return; // vertical scroll is the page's
    e.preventDefault();
    wheelAcc += e.deltaX;
    if (Math.abs(wheelAcc) > 60) {
      focus(s, s.rail.ui.focus + Math.sign(wheelAcc));
      wheelAcc = 0;
    }
  }, { passive: false });
  s.caption.addEventListener("click", () => open(s));
}

function clearShelf() {
  for (const s of shelf) s.rail.dispose();
  shelf = [];
  $("rails").innerHTML = "";
}

async function showCategory(cat) {
  const token = ++building;
  current = cat;
  if (active) close();
  for (const b of $("cats").children) {
    b.classList.toggle("on", b.dataset.key === cat.key);
    // Centre the chosen tile; scrollIntoView would also shift the clipped screen.
    if (b.dataset.key === cat.key) $("cats").scrollTo({ left: b.offsetLeft - ($("cats").clientWidth - b.offsetWidth) / 2, behavior: "smooth" });
  }
  clearShelf();
  scrollEl.scrollTop = 0;
  const fixture = cat.fixture ?? "bar", L = LAYOUTS[fixture];
  for (const recipe of cat.rails) {
    const el = document.createElement("section");
    el.className = "rail";
    el.dataset.fixture = fixture;
    el.innerHTML = `<h3>${recipe.label} <span>· ${PER_RAIL} styles</span></h3><div class="view"></div><p class="caption"></p>`;
    if (recipe.height) el.querySelector(".view").style.height = `${recipe.height}px`;
    $("rails").append(el);
    const rail = new rails.Rail(renderer, L.strip, fixture);
    rail.key.shadow.mapSize.set(1024, 1024);
    const s = { rail, el, view: el.querySelector(".view"), caption: el.querySelector(".caption"), pdp: L.pdp };
    shelf.push(s);
    rail.resize(s.view.clientWidth, s.view.clientHeight);
    wire(s);
  }
  layoutDirty = true;
  // Paint and upload items a few per frame so the page stays responsive while
  // stocking; each rail is hung in one go once its items are ready.
  let t0 = performance.now();
  for (let k = 0; k < cat.rails.length; k++) {
    const s = shelf[k], items = [];
    for (const p of variants.products(cat.rails[k], PER_RAIL)) {
      const item = p.kind ? new product.Product(p) : rails.dress(p, paint.garment(p));
      for (const t of item.textures) renderer.initTexture(t);
      items.push([p, item]);
      if (performance.now() - t0 < BUILD_MS) continue;
      await new Promise(requestAnimationFrame);
      if (token !== building) return items.forEach(([, it]) => it.dispose());
      t0 = performance.now();
    }
    for (const [p, item] of items) s.rail.add(p, item);
    s.rail.setFocus(cat.rails[k].focus ?? 2);
    caption(s);
    await new Promise(requestAnimationFrame);
    if (token !== building) return;
    t0 = performance.now();
  }
  building = 0;
}

function tiles() {
  const nav = $("cats");
  for (const cat of variants.CATEGORIES) {
    const b = document.createElement("button");
    b.className = "cat";
    b.dataset.key = cat.key;
    const p = variants.products(cat.rails[cat.key === "women" ? 1 : 0], 1)[0];
    b.append(p.kind ? lipstickIcon() : paint.garment(p).front, cat.label);
    b.onclick = (e) => {
      ripple(b, e);
      showCategory(cat);
    };
    nav.append(b);
  }
}

// Ink drop spreading from the tap point inside a tile.
function ripple(el, e) {
  const r = el.getBoundingClientRect(), d = document.createElement("span");
  d.className = "ripple";
  d.style.left = `${e.clientX - r.left}px`;
  d.style.top = `${e.clientY - r.top}px`;
  el.append(d);
  d.addEventListener("animationend", () => d.remove());
}

// Flat lipstick for the Accessories tile.
function lipstickIcon() {
  const c = document.createElement("canvas"), g = c.getContext("2d");
  c.width = 120; c.height = 160;
  g.fillStyle = "#a3172c";
  g.beginPath(); g.moveTo(44, 70); g.lineTo(44, 34); g.lineTo(76, 18); g.lineTo(76, 70); g.fill();
  const metal = g.createLinearGradient(36, 0, 84, 0);
  metal.addColorStop(0, "#a8844a"); metal.addColorStop(0.45, "#ecd29a"); metal.addColorStop(1, "#a8844a");
  g.fillStyle = metal;
  g.fillRect(38, 68, 44, 18);
  g.fillStyle = "#1a1a1d";
  g.beginPath(); g.roundRect(34, 86, 52, 66, 4); g.fill();
  return c;
}

// ---- PDP controls -----------------------------------------------------------

$("closeBtn").onclick = close;
// M: back to the top of the first category, closing whatever is open.
$("homeBtn").onclick = () => {
  nav.dismiss();
  if (active) close();
  const home = variants.CATEGORIES[0];
  if (current !== home) return showCategory(home);
  scrollEl.scrollTo({ top: 0, behavior: "smooth" });
  $("cats").scrollTo({ left: 0, behavior: "smooth" });
};
$("prevBtn").onclick = () => step(-1);
$("nextBtn").onclick = () => step(1);
els.sizes.addEventListener("click", (e) => {
  const b = e.target.closest("button");
  if (!b) return;
  bag.size = b.textContent;
  for (const c of els.sizes.children) c.classList.toggle("on", c === b);
});
els.add.onclick = addToBag;

// Restart a CSS animation class on an element.
function replay(el, cls) {
  el.classList.remove(cls);
  void el.offsetWidth;
  el.classList.add(cls);
}

// A garment folds like a shop-folded tee (sleeves in, then the bottom up)
// while it arcs into the bag. Accessories just arc in. The bag wiggles, the count pops, and the piece grows back.
let adding = false;
function addToBag() {
  if (!active || adding) return;
  adding = true;
  const s = active, r = s.rail, g = r.garments[r.ui.sel], p = g.p, gm = g.gm;
  const W = screenEl.clientWidth, H = screenEl.clientHeight, full = { x: 0, y: 0, w: W, h: H };
  // Snapshot straight off the canvas (valid right after drawing, same task),
  // without the hanger.
  if (gm.hanger) gm.hanger.visible = false;
  draw(s, full, full, false);
  const shot = snapshot({ x: 0, y: H * 0.05, w: W, h: H * 0.68 });
  gm.shown = false;
  r.dirty = true;
  els.add.textContent = "ADDED ✓";

  const fold = !p.kind, ghost = fold ? folded(shot) : shot.c;
  ghost.classList.add("ghost");
  Object.assign(ghost.style, { left: `${shot.x}px`, top: `${shot.y}px`, width: `${shot.w}px`, height: `${shot.h}px` });
  screenEl.append(ghost);
  // The folded stack is the top of the middle third; that point flies to the bag.
  const oy = fold ? 0.25 : 0.5, b = box(els.bagBtn);
  const tx = b.x + b.w / 2 - (shot.x + shot.w / 2), ty = b.y + b.h / 2 - (shot.y + shot.h * oy);
  ghost.style.transformOrigin = `50% ${oy * 100}%`;
  ghost.animate([
    { transform: "none", easing: "cubic-bezier(0.3, 0, 0.3, 1)" },
    { transform: `translate(${tx * 0.32}px, ${ty * 0.3 - 46}px) scale(0.6) rotate(-6deg)`, opacity: 1, offset: 0.5, easing: "cubic-bezier(0.5, 0, 0.75, 0.4)" },
    { opacity: 1, offset: 0.9 },
    { transform: `translate(${tx}px, ${ty}px) scale(0.07) rotate(10deg)`, opacity: 0 },
  ], { duration: 900, fill: "forwards" }).finished.then(() => {
    ghost.remove();
    nav.add({ name: p.name, price: p.price, size: bag.size, thumb: shot.thumb });
    replay(els.bagBtn, "shake");
    replay(els.bag, "bump");
    sparks(b.x + b.w / 2, b.y + b.h / 2);
    setTimeout(() => {
      gm.shown = true;
      g.st.s *= 0.35; // springs back to full size
      r.dirty = true;
      els.add.textContent = "ADD TO BAG";
      adding = false;
    }, 300);
  });
}

// A new canvas of size w × h holding region (x, y, sw, sh) of src.
function copy(src, x, y, sw, sh, w = sw, h = sh, opts) {
  const c = document.createElement("canvas");
  c.width = Math.ceil(w); c.height = Math.ceil(h);
  c.getContext("2d", opts).drawImage(src, x, y, sw, sh, 0, 0, w, h);
  return c;
}

// Crops the drawn piece out of the canvas region src (CSS px) to its opaque
// bounds; returns the crop canvas, its CSS rect and a bag thumbnail.
function snapshot(src) {
  const pr = renderer.getPixelRatio(), sw = Math.round(src.w * pr), sh = Math.round(src.h * pr);
  const c = copy(canvas, src.x * pr, src.y * pr, sw, sh, sw, sh, { willReadFrequently: true }), cx = c.getContext("2d");
  const img = cx.getImageData(0, 0, sw, sh), a = img.data;
  // The cloth renders with soft alpha: make it solid so folds don't see
  // through, drop the faint floor shadow, and find the opaque bounds.
  let x0 = sw, y0 = sh, x1 = 0, y1 = 0;
  for (let y = 0, i = 3; y < sh; y++) for (let x = 0; x < sw; x++, i += 4) {
    if (a[i] < 70) { a[i] = 0; continue; }
    a[i] = 255;
    if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
  }
  cx.putImageData(img, 0, 0);
  if (x1 <= x0) { x0 = 0; y0 = 0; x1 = sw - 1; y1 = sh - 1; }
  const w = x1 - x0 + 1, h = y1 - y0 + 1, out = copy(c, x0, y0, w, h), k = Math.min(1, 160 / Math.max(w, h));
  const thumb = copy(out, 0, 0, w, h, Math.round(w * k), Math.round(h * k)).toDataURL();
  return { c: out, x: src.x + x0 / pr, y: src.y + y0 / pr, w: w / pr, h: h / pr, thumb };
}

// Six panels (two rows of thirds) that fold on hinges: the side thirds swing
// over the middle, then the bottom row flips up onto the top.
function folded(shot) {
  const el = document.createElement("div"), pw = shot.c.width / 3, ph = shot.c.height / 2;
  el.className = "fold";
  const rows = [0, 1].map((row) => {
    const half = document.createElement("div");
    half.className = `half ${row ? "bot" : "top"}`;
    for (let col = 0; col < 3; col++) {
      half.append(copy(shot.c, col * pw, row * ph, pw, ph));
    }
    el.append(half);
    return half;
  });
  const ease = "cubic-bezier(0.55, 0, 0.25, 1)", shade = (t) => [
    { transform: "none", filter: "brightness(1)" },
    { filter: "brightness(0.72)", offset: 0.55 },
    { transform: t, filter: "brightness(0.9)" },
  ];
  for (const half of rows) {
    half.children[0].animate(shade("translateZ(1px) rotateY(176deg)"), { duration: 200, easing: ease, fill: "forwards" });
    half.children[2].animate(shade("translateZ(2px) rotateY(-176deg)"), { duration: 200, delay: 40, easing: ease, fill: "forwards" });
  }
  rows[1].animate([{ transform: "none" }, { transform: "translateZ(4px) rotateX(176deg)" }], { duration: 220, delay: 220, easing: ease, fill: "forwards" });
  return el;
}

function sparks(x, y) {
  for (let i = 0; i < 9; i++) {
    const d = document.createElement("span"), a = (i / 9) * Math.PI * 2 + Math.random() * 0.4, len = 22 + Math.random() * 14;
    d.className = "spark";
    Object.assign(d.style, { left: `${x}px`, top: `${y}px`, background: i % 2 ? "#f9a03f" : "#fb6548" });
    screenEl.append(d);
    d.animate([
      { transform: "translate(0, 0) scale(1)", opacity: 1 },
      { transform: `translate(${Math.cos(a) * len}px, ${Math.sin(a) * len}px) scale(0.2)`, opacity: 0 },
    ], { duration: 520, easing: "cubic-bezier(0.2, 0.8, 0.4, 1)" }).finished.then(() => d.remove());
  }
}
addEventListener("keydown", (e) => {
  if (!active) return;
  if (e.key === "ArrowRight") step(1);
  else if (e.key === "ArrowLeft") step(-1);
  else if (e.key === "Escape") close();
});
// In detail: a drag anywhere turns and tips the piece under the finger like a
// 3D object (rubber-banded, so it never flips round) and springs it back on
// release; a long or quick horizontal drag steps to the next piece.
let swipe = null;
screenEl.addEventListener("pointerdown", (e) => {
  if (!active || e.target.closest("button")) return;
  swipe = { x: e.clientX, y: e.clientY, t: e.timeStamp, vx: 0, w: screenEl.clientWidth, h: screenEl.clientHeight };
  active.rail.held = true;
  screenEl.setPointerCapture(e.pointerId);
});
screenEl.addEventListener("pointermove", (e) => {
  if (!active || !swipe) return;
  const rail = active.rail, { w, h } = swipe;
  const dt = Math.max(e.timeStamp - swipe.t, 1);
  swipe.vx = 0.7 * swipe.vx + 0.3 * (e.movementX / dt);
  swipe.t = e.timeStamp;
  rail.tilt = 0.75 * Math.tanh(((e.clientX - swipe.x) / w) * 2.2);
  rail.lean = 0.28 * Math.tanh(((e.clientY - swipe.y) / h) * 2.5);
});
const endSwipe = (e) => {
  if (!swipe || !active) return (swipe = null);
  const rail = active.rail, dx = e.clientX - swipe.x;
  rail.held = false;
  rail.tilt = rail.lean = 0;
  if (Math.abs(dx) > swipe.w * 0.3 || (Math.abs(swipe.vx) > 0.8 && Math.abs(dx) > 30)) step(dx < 0 ? 1 : -1);
  swipe = null;
};
screenEl.addEventListener("pointerup", endSwipe);
screenEl.addEventListener("pointercancel", endSwipe);

// ---- Frame ------------------------------------------------------------------

// moved: the rail's contents changed, so its shadows are re-cast; a pure
// re-frame (scroll, resize) reuses them.
function draw(s, r, clip, moved = true) {
  const H = screenEl.clientHeight;
  renderer.setViewport(r.x, H - r.y - r.h, r.w, r.h);
  renderer.setScissor(clip.x, H - clip.y - clip.h, clip.w, clip.h);
  renderer.shadowMap.needsUpdate = moved;
  renderer.render(s.rail.scene, s.rail.camera);
}

function clearAll() {
  renderer.setScissor(0, 0, screenEl.clientWidth, screenEl.clientHeight);
  renderer.clear();
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min((now - last) / 1000, 1 / 30);
  last = now;
  if (dt <= 0) return;
  const W = screenEl.clientWidth, H = screenEl.clientHeight;
  if (active) {
    const changed = active.rail.update(dt);
    if (changed || layoutDirty) {
      if (layoutDirty) clearAll();
      const full = { x: 0, y: 0, w: W, h: H };
      draw(active, full, full, changed);
    }
  } else {
    const port = box(scrollEl);
    if (layoutDirty) clearAll();
    for (const s of shelf) {
      const r = box(s.view);
      const y0 = Math.max(r.y, port.y), y1 = Math.min(r.y + r.h, port.y + port.h);
      if (y1 <= y0) continue; // off-screen rails neither simulate nor draw
      const changed = s.rail.update(dt);
      if (changed || layoutDirty) draw(s, r, { x: r.x, y: y0, w: r.w, h: y1 - y0 }, changed);
    }
  }
  layoutDirty = false;
}

scrollEl.addEventListener("scroll", () => (layoutDirty = true), { passive: true });
addEventListener("resize", resize);

nav.init({
  categories: variants.CATEGORIES,
  onCategory: (key) => showCategory(variants.CATEGORIES.find((c) => c.key === key)),
  // In a detail view the heart saves the piece; elsewhere it opens the list.
  current: () => {
    if (!active) return null;
    const p = active.rail.garments[active.rail.ui.sel].p;
    return { name: p.name, price: p.price, size: bag.size };
  },
});
tiles();
resize();
showCategory(variants.CATEGORIES[0]);
requestAnimationFrame(frame);
