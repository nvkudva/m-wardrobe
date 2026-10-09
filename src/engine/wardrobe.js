import * as THREE from "three";
import * as paint from "../catalog/paint.js";
import * as variants from "../catalog/variants.js";
import * as rails from "./rail.js";
import * as product from "./product.js";
import * as snapshot from "./snapshot.js";

// The wardrobe's 3D side, framework-free: one WebGL renderer draws every rail
// into its own strip of a shared canvas; opening a piece re-frames its rail to
// the whole screen as the detail view. The UI layer hands it the DOM it draws
// over and hears back through `events`; it never touches the UI's markup.

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

export { PER_RAIL };

export class Wardrobe {
  // screen: the element the canvas covers; scroller: the scrolling rack.
  // events: { focus(rail, product), detail({ rail, index, count, product } | null) }.
  constructor({ canvas, screen, scroller, events }) {
    this.screen = screen;
    this.scroller = scroller;
    this.events = events;
    this.shelf = []; // { rail, view, pdp }
    this.active = null;
    this.dirty = true; // layout moved: clear and redraw every visible strip
    this.building = 0;
    this.ndc = new THREE.Vector2();

    const r = (this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true }));
    r.setPixelRatio(Math.min(devicePixelRatio, 2));
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.NeutralToneMapping;
    r.shadowMap.enabled = true;
    r.shadowMap.type = THREE.PCFSoftShadowMap;
    r.shadowMap.autoUpdate = false; // re-cast only when a rail's contents moved
    r.setScissorTest(true);

    this.onResize = () => this.resize();
    this.onScroll = () => (this.dirty = true);
    addEventListener("resize", this.onResize);
    scroller.addEventListener("scroll", this.onScroll, { passive: true });
    // Anything that shifts the rack (a caption changing height, a new rail)
    // moves the strips under the canvas.
    this.observer = new ResizeObserver(() => (this.dirty = true));
    for (const el of scroller.children) this.observer.observe(el);
    this.detailDrag();
    this.resize();
    this.last = performance.now();
    this.raf = requestAnimationFrame((t) => this.frame(t));
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    removeEventListener("resize", this.onResize);
    this.scroller.removeEventListener("scroll", this.onScroll);
    this.observer.disconnect();
    this.clearShelf();
    this.renderer.dispose();
  }

  // ---- Layout ----------------------------------------------------------------

  box(el) {
    const s = this.screen.getBoundingClientRect(), r = el.getBoundingClientRect();
    return { x: r.left - s.left, y: r.top - s.top, w: r.width, h: r.height };
  }

  resize() {
    const W = this.screen.clientWidth, H = this.screen.clientHeight;
    this.renderer.setSize(W, H, false);
    for (const s of this.shelf) {
      if (s === this.active) s.rail.resize(W, H, s.pdp);
      else s.rail.resize(s.view.clientWidth, s.view.clientHeight);
    }
    this.dirty = true;
  }

  // World transform taking a strip's framing to the full screen's: same pixels.
  stripToScreen(s) {
    const r = this.box(s.view), W = this.screen.clientWidth, H = this.screen.clientHeight;
    const wpp = s.rail.L.visH / H; // world units per pixel at full screen
    return { k: r.h / H, ox: (r.x + r.w / 2 - W / 2) * wpp, oy: -(r.y + r.h / 2 - H / 2) * wpp };
  }

  // ---- Shelf -----------------------------------------------------------------

  clearShelf() {
    for (const s of this.shelf) s.rail.dispose();
    this.shelf = [];
  }

  // Stocks one rail per recipe of cat into views (one element per recipe,
  // already in the DOM). Items are painted and uploaded a few per frame so the
  // page stays responsive; each rail is hung in one go once its items are ready.
  async show(cat, views) {
    const token = ++this.building;
    this.close();
    this.clearShelf();
    this.scroller.scrollTop = 0;
    const fixture = cat.fixture ?? "bar", L = LAYOUTS[fixture];
    this.shelf = views.map((view) => {
      const rail = new rails.Rail(this.renderer, L.strip, fixture);
      rail.key.shadow.mapSize.set(1024, 1024);
      rail.resize(view.clientWidth, view.clientHeight);
      const s = { rail, view, pdp: L.pdp, index: 0 };
      this.wire(s);
      return s;
    });
    this.shelf.forEach((s, i) => (s.index = i));
    this.dirty = true;

    let t0 = performance.now();
    const next = async () => {
      await new Promise(requestAnimationFrame);
      t0 = performance.now();
      return token === this.building;
    };
    for (const [k, s] of this.shelf.entries()) {
      const items = [];
      for (const p of variants.products(cat.rails[k], PER_RAIL)) {
        const item = p.kind ? new product.Product(p) : rails.dress(p, paint.garment(p));
        for (const t of item.textures) this.renderer.initTexture(t);
        items.push([p, item]);
        if (performance.now() - t0 < BUILD_MS) continue;
        if (!(await next())) return items.forEach(([, it]) => it.dispose());
      }
      for (const [p, item] of items) s.rail.add(p, item);
      s.rail.setFocus(cat.rails[k].focus ?? 2);
      this.events.focus(k, this.focused(s));
      if (!(await next())) return;
    }
    this.building = 0;
  }

  focused(s) {
    return s.rail.garments[s.rail.ui.focus].p;
  }

  focus(s, i) {
    if (s.rail.setFocus(i)) this.events.focus(s.index, this.focused(s));
  }

  pick(s, ev) {
    const r = s.view.getBoundingClientRect();
    this.ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    return s.rail.pick(this.ndc);
  }

  // Rack gestures on one strip: drag or horizontal wheel moves focus, hover
  // (mouse) focuses, a tap on the focused piece opens it.
  wire(s) {
    const v = s.view;
    let drag = null, lastHover = 0, wheelAcc = 0;
    v.onpointerdown = (e) => {
      drag = { x: e.clientX, focus: s.rail.ui.focus, moved: 0 };
      if (e.pointerType === "mouse") v.setPointerCapture(e.pointerId);
    };
    v.onpointermove = (e) => {
      if (drag) {
        const dx = e.clientX - drag.x;
        drag.moved = Math.max(drag.moved, Math.abs(dx));
        if (drag.moved > 6) this.focus(s, Math.round(drag.focus - dx / (v.clientWidth * 0.12)));
        return;
      }
      if (e.pointerType !== "mouse" || e.timeStamp - lastHover < 260) return;
      const i = this.pick(s, e);
      if (i >= 0 && i !== s.rail.ui.focus) {
        this.focus(s, i);
        lastHover = e.timeStamp;
      }
    };
    v.onpointerup = (e) => {
      if (!drag) return;
      const moved = drag.moved;
      drag = null;
      if (moved >= 6) return;
      const i = this.pick(s, e);
      if (i === s.rail.ui.focus) this.open(s.index);
      else if (i >= 0) this.focus(s, i);
    };
    v.onpointercancel = () => (drag = null);
    v.onwheel = (e) => {
      if (Math.abs(e.deltaX) <= Math.abs(e.deltaY)) return; // vertical scroll is the page's
      e.preventDefault();
      wheelAcc += e.deltaX;
      if (Math.abs(wheelAcc) > 60) {
        this.focus(s, s.rail.ui.focus + Math.sign(wheelAcc));
        wheelAcc = 0;
      }
    };
  }

  // ---- Rack ↔ detail -----------------------------------------------------------

  open(i) {
    const s = this.shelf[i];
    if (this.active || !s?.rail.garments.length) return;
    s.rail.resize(this.screen.clientWidth, this.screen.clientHeight, s.pdp);
    const { k, ox, oy } = this.stripToScreen(s);
    s.rail.remap(k, ox, oy);
    s.rail.open();
    this.active = s;
    this.dirty = true;
    this.emitDetail();
  }

  close() {
    const s = this.active;
    if (!s) return;
    const { k, ox, oy } = this.stripToScreen(s);
    s.rail.close();
    s.rail.resize(s.view.clientWidth, s.view.clientHeight);
    s.rail.remap(1 / k, -ox / k, -oy / k);
    this.active = null;
    this.dirty = true;
    this.events.detail(null);
    this.events.focus(s.index, this.focused(s));
  }

  step(dir) {
    if (!this.active) return;
    this.active.rail.step(dir);
    this.emitDetail();
  }

  emitDetail() {
    const s = this.active, r = s.rail;
    this.events.detail({ rail: s.index, index: r.ui.sel, count: r.garments.length, product: r.garments[r.ui.sel].p });
  }

  // In detail: a drag anywhere turns and tips the piece under the finger like
  // a 3D object (rubber-banded, so it never flips round) and springs it back on
  // release; a long or quick horizontal drag steps to the next piece.
  detailDrag() {
    const el = this.screen;
    let swipe = null;
    el.addEventListener("pointerdown", (e) => {
      if (!this.active || e.target.closest("button")) return;
      swipe = { x: e.clientX, y: e.clientY, t: e.timeStamp, vx: 0, w: el.clientWidth, h: el.clientHeight };
      this.active.rail.held = true;
      el.setPointerCapture(e.pointerId);
    });
    el.addEventListener("pointermove", (e) => {
      if (!this.active || !swipe) return;
      const rail = this.active.rail, { w, h } = swipe;
      const dt = Math.max(e.timeStamp - swipe.t, 1);
      swipe.vx = 0.7 * swipe.vx + 0.3 * (e.movementX / dt);
      swipe.t = e.timeStamp;
      rail.tilt = 0.75 * Math.tanh(((e.clientX - swipe.x) / w) * 2.2);
      rail.lean = 0.28 * Math.tanh(((e.clientY - swipe.y) / h) * 2.5);
    });
    const end = (e) => {
      if (!swipe || !this.active) return (swipe = null);
      const rail = this.active.rail, dx = e.clientX - swipe.x;
      rail.held = false;
      rail.tilt = rail.lean = 0;
      if (Math.abs(dx) > swipe.w * 0.3 || (Math.abs(swipe.vx) > 0.8 && Math.abs(dx) > 30)) this.step(dx < 0 ? 1 : -1);
      swipe = null;
    };
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  }

  // ---- Add to bag --------------------------------------------------------------

  // Lifts the piece in detail off the stage as a cropped picture (no hanger)
  // and hides it; returns the picture, the product and restore() to grow it
  // back on its hanger.
  takePiece() {
    const s = this.active;
    if (!s) return null;
    const r = s.rail, g = r.garments[r.ui.sel], gm = g.gm;
    const W = this.screen.clientWidth, H = this.screen.clientHeight, full = { x: 0, y: 0, w: W, h: H };
    // Read straight off the canvas: valid right after drawing, same task.
    if (gm.hanger) gm.hanger.visible = false;
    this.draw(s, full, full, false);
    const shot = snapshot.take(this.renderer, { x: 0, y: H * 0.05, w: W, h: H * 0.68 });
    gm.shown = false;
    r.dirty = true;
    return {
      shot,
      product: g.p,
      restore: () => {
        gm.shown = true;
        g.st.s *= 0.35; // springs back to full size
        r.dirty = true;
      },
    };
  }

  // ---- Frame -------------------------------------------------------------------

  // moved: the rail's contents changed, so its shadows are re-cast; a pure
  // re-frame (scroll, resize) reuses them.
  draw(s, r, clip, moved = true) {
    const H = this.screen.clientHeight, gl = this.renderer;
    gl.setViewport(r.x, H - r.y - r.h, r.w, r.h);
    gl.setScissor(clip.x, H - clip.y - clip.h, clip.w, clip.h);
    gl.shadowMap.needsUpdate = moved;
    gl.render(s.rail.scene, s.rail.camera);
  }

  clear() {
    this.renderer.setScissor(0, 0, this.screen.clientWidth, this.screen.clientHeight);
    this.renderer.clear();
  }

  frame(now) {
    this.raf = requestAnimationFrame((t) => this.frame(t));
    const dt = Math.min((now - this.last) / 1000, 1 / 30);
    this.last = now;
    if (dt <= 0) return;
    const W = this.screen.clientWidth, H = this.screen.clientHeight;
    if (this.dirty) this.clear();
    if (this.active) {
      const changed = this.active.rail.update(dt);
      const full = { x: 0, y: 0, w: W, h: H };
      if (changed || this.dirty) this.draw(this.active, full, full, changed);
    } else {
      // The canvas doesn't keep its pixels between presented frames, so when
      // any strip changes every visible strip is drawn again; unchanged ones
      // reuse their shadows, which keeps that cheap.
      const port = this.box(this.scroller), shown = [];
      let changed = this.dirty;
      for (const s of this.shelf) {
        const r = this.box(s.view);
        const y0 = Math.max(r.y, port.y), y1 = Math.min(r.y + r.h, port.y + port.h);
        if (y1 <= y0) continue; // off-screen rails neither simulate nor draw
        const moved = s.rail.update(dt);
        changed ||= moved;
        shown.push([s, r, { x: r.x, y: y0, w: r.w, h: y1 - y0 }, moved]);
      }
      if (changed) {
        if (!this.dirty) this.clear();
        for (const [s, r, clip, moved] of shown) this.draw(s, r, clip, moved);
      }
    }
    this.dirty = false;
  }
}
