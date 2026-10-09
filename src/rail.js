import * as THREE from "three";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";
import * as garment from "./garment.js";
import * as shapes from "./shapes.js";

// One rail of garments in its own scene: lights, wall, rail bar, the garments
// and their rack ↔ detail choreography. The page owns the renderer, the
// viewport and the UI; it moves the rail with focus/open/close/step and calls
// update() each frame.

// Layout is sized for a tee; other shapes are cut to fit the same box.
const { w: GW, h: GH } = shapes.tee;
const YAW = 1.08; // edge-on turn of garments packed on the rail
const FOV = 30, CAM_Z = 10;

// Fractions of the viewport, measured off the reference video frames:
// rail and detail heights from the top, garment sizes as [of height, of width].
export const PHONE = { railY: 0.35, s0: [0.205, 0.36], pdpY: 0.205, sPdp: [0.355, 0.66] };

let env = null;

function spring(o, k, to, stiff, zeta, dt) {
  o[k + "V"] += (stiff * (to - o[k]) - 2 * zeta * Math.sqrt(stiff) * o[k + "V"]) * dt;
  o[k] += o[k + "V"] * dt;
}

// A garment from its painted art, on a hanger.
export function dress(p, art) {
  return new garment.Garment({ shape: shapes.fitted(p.cut, p.fit), fabric: p.fabric, art });
}

export class Rail {
  // fixture: "bar" hangs garments from a rod; "table" stands products on a shelf.
  constructor(renderer, layout = PHONE, fixture = "bar") {
    this.layout = layout;
    this.fixture = fixture;
    const scene = (this.scene = new THREE.Scene());
    this.camera = new THREE.PerspectiveCamera(FOV, 1, 0.1, 50);
    this.camera.position.set(0, 0, CAM_Z);

    env ??= new THREE.PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environment = env;
    // Products are metal and glass: they need more of the room to reflect.
    scene.environmentIntensity = fixture === "table" ? 1 : 0.35;
    scene.add(new THREE.HemisphereLight(0xffffff, 0xcdc5b6, 1.5));
    const key = (this.key = new THREE.DirectionalLight(0xfff5e8, 2.1));
    key.position.set(-2.2, 4.5, 7);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, { left: -3.5, right: 3.5, top: 3.5, bottom: -3.5, near: 1, far: 20 });
    key.shadow.bias = -0.0004;
    key.shadow.normalBias = 0.02;
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xeef1ff, 0.6);
    fill.position.set(4, 1, 5);
    scene.add(fill);

    const wall = new THREE.Mesh(new THREE.PlaneGeometry(30, 16), new THREE.ShadowMaterial({ opacity: 0.12 }));
    wall.position.z = -0.45;
    wall.receiveShadow = true;
    scene.add(wall);

    if (fixture === "table") {
      // The page draws the tabletop; this invisible plane only catches the
      // products' contact shadows on it.
      this.barMat = new THREE.ShadowMaterial({ opacity: 0.2 });
      this.bar = new THREE.Mesh(new THREE.PlaneGeometry(1, 0.8), this.barMat);
      this.bar.rotation.x = -Math.PI / 2;
      this.bar.receiveShadow = true;
    } else {
      // Brushed chrome tube running edge to edge. It reflects its own copy of
      // the room, so it reads as metal even in the dim garment lighting.
      this.barMat = new THREE.MeshStandardMaterial({ color: 0xdcdde2, metalness: 1, roughness: 0.22, envMap: env, envMapIntensity: 1.3, transparent: true });
      this.bar = new THREE.Mesh(new THREE.CylinderGeometry(0.0105, 0.0105, 1, 32), this.barMat);
      this.bar.rotation.z = Math.PI / 2;
    }
    scene.add(this.bar);
    this.barMax = this.barMat.opacity;

    this.garments = [];
    this.ui = { mode: "rack", focus: 0, focusF: 0, focusFV: 0, sel: 0 };
    this.tilt = 0; // extra turn of the piece in detail, set while it is dragged
    this.lean = 0; // and its tip toward or away from the viewer
    this.held = false; // a finger is on it: follow tightly, spring back on release
    this.L = {};
    this.dirty = true;
    this.ray = new THREE.Raycaster();
  }

  // gm: a Garment or anything with its interface (hook, breeze, update,
  // teleport, pickables, hits, dispose; optional yaw/gap/pack for how it parks).
  // p.scale shrinks a piece (kids' sizes).
  add(p, gm) {
    gm.addTo(this.scene);
    const g = { p, index: this.garments.length, gm, k: p.scale ?? 1, yaw: gm.yaw ?? YAW, pack: gm.pack ?? 1, gap: gm.gap ?? 1 };
    // Detail view fits long pieces into a tee's height so they clear the text below.
    g.kPdp = g.k / Math.max(1, gm.length ?? 1);
    for (const m of gm.pickables) m.userData.g = g;
    this.garments.push(g);
    g.st = { ...this.target(g), xV: 0, yV: 0, zV: 0, yawV: 0, pitch: 0, pitchV: 0, sV: 0 };
    return g;
  }

  target(g) {
    const { L, ui } = this, n = this.garments.length, i = g.index;
    if (ui.mode === "rack") {
      const d = i - ui.focusF, ad = Math.abs(d), sg = Math.sign(d);
      const e = ad < 1 ? ad * ad * (3 - 2 * ad) : 1;
      return { x: sg * (e * L.gap * g.gap + Math.max(ad - 1, 0) * L.pack * g.pack), y: L.railY, z: -e * 0.25, yaw: -sg * e * g.yaw, s: L.s0 * g.k };
    }
    let d = (((i - ui.sel) % n) + n) % n;
    if (d > n / 2) d -= n;
    if (d === 0) return { x: 0, y: L.pdpY, z: 0.25, yaw: this.tilt, pitch: this.lean, s: L.sPdp * g.kPdp };
    const sg = Math.sign(d), ad = Math.abs(d);
    // Neighbours wait just off-screen at detail size so prev/next can swing in.
    if (ad === 1) return { x: sg * L.off, y: L.pdpY, z: 0, yaw: -sg * g.yaw, s: L.sPdp * g.kPdp };
    return { x: sg * (L.off + ad * 0.3), y: L.railY, z: -0.3, yaw: -sg * g.yaw, s: L.s0 * g.k };
  }

  animate(g, dt) {
    const st = g.st, tg = this.target(g), L = this.L;
    const off = L.visW / 2 + 0.6;
    // A parked garment whose slot moved to the other side teleports there off-screen
    // instead of flying across the view.
    if (Math.abs(st.x) > off && Math.abs(tg.x) > 0.01 && Math.sign(st.x) !== Math.sign(tg.x)) st.x = -st.x;
    spring(st, "x", tg.x, 60, 0.86, dt);
    spring(st, "y", tg.y, 60, 0.9, dt);
    spring(st, "z", tg.z, 60, 0.9, dt);
    spring(st, "s", tg.s, 60, 1, dt);
    const held = this.held && g.index === this.ui.sel && this.ui.mode !== "rack";
    spring(st, "yaw", tg.yaw, held ? 160 : 48, held ? 0.9 : 0.42, dt);
    spring(st, "pitch", tg.pitch ?? 0, held ? 160 : 60, held ? 0.9 : 0.45, dt);
    Object.assign(g.gm.hook, { x: st.x, y: st.y, z: st.z, yaw: st.yaw, pitch: st.pitch, s: st.s });
    // Only the piece in the spotlight catches the room's draughts.
    g.gm.breeze = g.index === (this.ui.mode === "rack" ? this.ui.focus : this.ui.sel) ? 1 : 0;
    const visible = Math.abs(st.x) - GW * st.s < L.visW / 2;
    return g.gm.update(dt, visible);
  }

  // w, h: the viewport in pixels.
  resize(w, h, layout = this.layout) {
    const { L, camera } = this;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    L.visH = 2 * CAM_Z * Math.tan(THREE.MathUtils.degToRad(FOV / 2));
    L.visW = L.visH * camera.aspect;
    const yAt = (f) => L.visH / 2 - f * L.visH;
    L.railY = yAt(layout.railY);
    L.pdpY = yAt(layout.pdpY);
    L.s0 = Math.min(layout.s0[0] * L.visH / GH, layout.s0[1] * L.visW / GW);
    L.sPdp = Math.min(layout.sPdp[0] * L.visH / GH, layout.sPdp[1] * L.visW / GW);
    L.pack = 0.12 * L.s0;
    L.gap = 0.62 * L.s0;
    L.off = L.visW / 2 + GW * L.sPdp * 0.65;
    if (this.fixture === "table") {
      this.bar.scale.set(L.visW * 3, L.s0, 1);
      this.bar.position.set(0, L.railY, 0);
    } else {
      // Hook's inner curve tops out just above where the rod sits.
      this.bar.scale.set(L.s0, L.visW * 3, L.s0);
      this.bar.position.set(0, L.railY - 0.03 * L.s0, 0.032 * L.s0);
    }
    const sc = this.key.shadow.camera, half = Math.max(3.5, L.visW / 2 + 0.5);
    Object.assign(sc, { left: -half, right: half });
    sc.updateProjectionMatrix();
    this.dirty = true;
  }

  // The viewport changed and the view is re-framed: x' = k·x + ox, y' = k·y + oy
  // keeps every garment on the same pixels it was on.
  remap(k, ox, oy) {
    for (const g of this.garments) {
      const st = g.st;
      st.x = st.x * k + ox; st.y = st.y * k + oy; st.s *= k;
      st.xV *= k; st.yV *= k; st.sV *= k;
      Object.assign(g.gm.hook, { x: st.x, y: st.y, s: st.s });
      g.gm.teleport();
    }
    this.dirty = true;
  }

  // Returns true when the focus moved.
  setFocus(i) {
    i = THREE.MathUtils.clamp(i, 0, this.garments.length - 1);
    if (i === this.ui.focus) return false;
    this.ui.focus = i;
    return true;
  }

  open() {
    const ui = this.ui;
    if (ui.mode !== "rack") return;
    ui.mode = "pdp";
    ui.sel = ui.focus;
    this.garments[ui.sel].st.yawV += 11; // lift-off twirl
  }

  close() {
    const ui = this.ui;
    if (ui.mode !== "pdp") return;
    ui.mode = "rack";
    ui.focus = ui.focusF = ui.sel;
    ui.focusFV = 0;
  }

  step(dir) {
    const ui = this.ui;
    if (ui.mode !== "pdp") return;
    ui.sel = (ui.sel + dir + this.garments.length) % this.garments.length;
  }

  // Index of the item under ndc (−1..1), or −1.
  pick(ndc) {
    this.ray.setFromCamera(ndc, this.camera);
    const meshes = this.garments.flatMap((g) => g.gm.pickables);
    for (const m of meshes) m.geometry.computeBoundingSphere();
    for (const h of this.ray.intersectObjects(meshes, false)) {
      const g = h.object.userData.g;
      if (g.gm.hits(h)) return g.index;
    }
    return -1;
  }

  // Steps springs and cloth; returns true when anything visible changed.
  update(dt) {
    const ui = this.ui;
    spring(ui, "focusF", ui.focus, 90, 1, dt);
    const op = this.barMat.opacity;
    this.barMat.opacity += ((ui.mode === "rack" ? this.barMax : 0) - op) * (1 - Math.exp(-8 * dt));
    this.bar.visible = this.barMat.opacity > 0.01;
    let changed = this.dirty || Math.abs(this.barMat.opacity - op) > 1e-4;
    for (const g of this.garments) if (this.animate(g, dt)) changed = true;
    this.dirty = false;
    return changed;
  }

  dispose() {
    this.scene.traverse((o) => o.isMesh && !o.geometry.userData.shared && o.geometry.dispose());
    for (const { gm } of this.garments) gm.dispose();
    this.key.shadow.map?.dispose();
  }
}
