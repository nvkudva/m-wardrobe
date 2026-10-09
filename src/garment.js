import * as THREE from "three";
import * as cloth from "./cloth.js";
import * as paint from "./paint.js";
import * as shapes from "./shapes.js";
import * as fabrics from "./fabric.js";

// A garment on a hanger: hanger meshes, the two fabric sheets, the cloth sim and
// the hanger's swing on its hook. The page only moves the hook (`hook`) and
// calls update(); everything that hangs off it follows physically.

// Hook drop to the hanger's bar in hanger-local units (a tee is 0.8 wide).
const HB = 0.12, ARM = 0.2;
const GUST = 0.45; // peak draught speed for idle life, garment units/s

const wood = new THREE.MeshStandardMaterial({ color: 0x8a5530, roughness: 0.5 });
const steel = new THREE.MeshStandardMaterial({ color: 0xb8b8bd, metalness: 0.9, roughness: 0.3 });

function hookParts() {
  const neck = new THREE.CylinderGeometry(0.005, 0.005, HB - 0.005, 6);
  neck.translate(0, -0.04 - (HB - 0.045) / 2, 0);
  const hook = new THREE.TorusGeometry(0.032, 0.005, 6, 24, Math.PI * 1.15);
  hook.rotateY(Math.PI / 2);
  hook.translate(0, -0.04, 0.032);
  return [[neck, steel], [hook, steel]];
}

function arms(half) {
  const pts = [];
  for (let k = 0; k <= 16; k++) {
    const x = -half + (2 * half * k) / 16;
    pts.push(new THREE.Vector3(x, -HB - 0.035 - 0.05 * (x / half) ** 2, 0));
  }
  return new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 32, 0.014, 8);
}

function rod(half, y, r) {
  const g = new THREE.CylinderGeometry(r, r, 2 * half, 10);
  g.rotateZ(Math.PI / 2);
  g.translate(0, y, 0);
  return g;
}

// Each hanger type gives its parts and the y where the fabric's top edge sits.
const HANGERS = {
  shoulder: () => ({ top: -HB, parts: [[arms(ARM), wood], ...hookParts()] }),
  // Metal bar with two clips biting the waistband at the pinned spans.
  clip: (shape) => {
    const parts = [[rod(shape.w / 2 + 0.03, -HB, 0.006), steel], ...hookParts()];
    for (const [u0, u1] of shape.pins) {
      const clip = new THREE.BoxGeometry((u1 - u0) * shape.w + 0.02, 0.06, 0.022);
      clip.translate(((u0 + u1) / 2 - 0.5) * shape.w, -HB - 0.03, 0);
      parts.push([clip, steel]);
    }
    return { top: -HB - 0.045, parts };
  },
  // Wooden hanger with a dowel between the arm tips; the sheet is folded over it.
  bar: (shape) => {
    const half = shape.w / 2 + 0.03, y = -HB - 0.085;
    return { top: y + 0.02, parts: [[arms(half), wood], [rod(half, y, 0.012), wood], ...hookParts()] };
  },
};

function makeHanger(parts) {
  const g = new THREE.Group();
  for (const [geo, mat] of parts) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    g.add(m);
  }
  g.matrixAutoUpdate = false;
  return g;
}

const bumps = {};
function fabricMaterial(c, look) {
  bumps[look.bump] ??= new THREE.CanvasTexture(paint[look.bump]());
  const map = new THREE.CanvasTexture(c);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = 8;
  return new THREE.MeshPhysicalMaterial({
    map, bumpMap: bumps[look.bump], bumpScale: look.bumpScale, alphaTest: 0.5, side: THREE.DoubleSide,
    roughness: look.roughness, sheen: look.sheen, sheenRoughness: look.sheenRoughness, sheenColor: new THREE.Color(look.sheenColor),
    anisotropy: look.anisotropy ?? 0,
    ...(look.opacity ? { transparent: true, opacity: look.opacity } : {}),
  });
}

// One grid sheet per side; vertices are the cloth surface pushed out along
// its normal so the garment has body instead of being paper-flat.
function sheet(nx, ny, normal) {
  const g = new THREE.BufferGeometry(), n = nx * ny;
  const uv = new Float32Array(n * 2), idx = [];
  for (let j = 0; j < ny; j++) {
    for (let i = 0; i < nx; i++) {
      const k = j * nx + i;
      uv[k * 2] = i / (nx - 1);
      uv[k * 2 + 1] = 1 - j / (ny - 1);
      if (i < nx - 1 && j < ny - 1) idx.push(k, k + nx, k + 1, k + 1, k + nx, k + nx + 1);
    }
  }
  g.setAttribute("position", new THREE.BufferAttribute(new Float32Array(n * 3), 3).setUsage(THREE.DynamicDrawUsage));
  g.setAttribute("normal", normal);
  g.setAttribute("uv", new THREE.BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.boundingSphere = new THREE.Sphere();
  return g;
}

const euler = new THREE.Euler(), quat = new THREE.Quaternion(), vPos = new THREE.Vector3(), vScale = new THREE.Vector3();

export class Garment {
  // shape: a shapes.js name or object; fabric: a fabric.js name or object
  // (default: the shape's); art: { front, back } canvases, alpha = silhouette.
  constructor({ shape, fabric, art }) {
    shape = typeof shape === "string" ? shapes[shape] : shape;
    fabric = fabric ?? shape.fabric;
    fabric = typeof fabric === "string" ? fabrics[fabric] : fabric;
    this.shape = shape;
    this.tw = art.front.width; this.th = art.front.height;
    this.alpha = art.front.getContext("2d").getImageData(0, 0, this.tw, this.th).data;
    const hanger = HANGERS[shape.hanger](shape);
    this.top = hanger.top;
    // Long pieces are shown smaller so every shape hangs to a tee's length.
    this.fit = Math.min(1, (shapes.tee.h + HB) / ((shape.baseH ?? shape.h) - hanger.top));
    // Hanging length relative to a tee (above 1 for pieces cut longer than baseH).
    this.length = (shape.h - hanger.top) * this.fit / (shapes.tee.h + HB);
    this.sim = new cloth.Cloth(shape, fabric, (u, v) => this.alphaAt(u, v), hanger.top);
    const { nx, ny } = this.sim;
    // Both sheets read the solver's normals directly.
    const normal = new THREE.BufferAttribute(this.sim.normal, 3).setUsage(THREE.DynamicDrawUsage);
    this.front = new THREE.Mesh(sheet(nx, ny, normal), fabricMaterial(art.front, fabric.look));
    this.back = new THREE.Mesh(sheet(nx, ny, normal), fabricMaterial(art.back, fabric.look));
    this.front.castShadow = true; // both sheets share a silhouette; one shadow is enough
    for (const m of [this.front, this.back]) m.matrixAutoUpdate = false;
    this.hanger = makeHanger(hanger.parts);
    this.bulge = new Float32Array(nx * ny);
    for (let j = 0; j < ny; j++) for (let i = 0; i < nx; i++) this.bulge[j * nx + i] = shape.body(i / (nx - 1), j / (ny - 1));
    this.hook = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, s: 1 }; // set by the caller every frame
    this.breeze = 0; // 0..1: occasional draughts that keep an idle garment alive
    this.sw = { roll: 0, rollV: 0, pitch: 0, pitchV: 0, vx: 0, vz: 0, px: 0, pz: 0 };
    this.gust = { t: 1 + Math.random() * 3, dur: 0, age: 0, x: 0, z: 0 };
    this.m = new THREE.Matrix4();
    this.mPrev = new THREE.Matrix4();
    this.started = false;
  }

  addTo(scene) {
    scene.add(this.front, this.back, this.hanger);
  }

  set shown(v) {
    this.front.visible = this.back.visible = this.hanger.visible = v;
  }

  get pickables() {
    return [this.front];
  }

  get textures() {
    return [this.front.material.map, this.back.material.map];
  }

  // A ray hit counts only on painted fabric, not the transparent texels.
  hits(h) {
    return this.alphaAt(h.uv.x, 1 - h.uv.y) > 0.5;
  }

  // Hanger materials and fabric bump maps are shared; only the art is ours.
  dispose() {
    for (const m of [this.front.material, this.back.material]) {
      m.map.dispose();
      m.dispose();
    }
  }

  alphaAt(u, v) {
    const x = Math.round(u * (this.tw - 1)), y = Math.round(v * (this.th - 1));
    if (x < 0 || y < 0 || x >= this.tw || y >= this.th) return 0;
    return this.alpha[(y * this.tw + x) * 4 + 3] / 255;
  }

  // Indoor air: still most of the time, with the odd soft draught.
  draught(dt) {
    const gs = this.gust, air = this.sim.air;
    if (this.breeze <= 0 && gs.age >= gs.dur) { air.fill(0); return; }
    gs.age += dt;
    if (gs.age >= gs.dur) {
      air.fill(0);
      if ((gs.t -= dt) > 0) return;
      gs.dur = 1.6 + Math.random() * 2.2;
      gs.age = 0;
      gs.t = 2.5 + Math.random() * 5;
      const a = (Math.random() - 0.5) * 2.4, amp = this.breeze * GUST * (0.5 + Math.random() * 0.5);
      gs.x = Math.sin(a) * amp; gs.z = -Math.abs(Math.cos(a)) * amp;
    }
    // Smooth swell and fade with a little flicker inside it.
    const p = gs.age / gs.dur, env = Math.sin(Math.PI * p) ** 2 * (0.8 + 0.2 * Math.sin(gs.age * 7.3 + gs.x * 40));
    air[0] = gs.x * env; air[1] = 0; air[2] = gs.z * env;
  }

  pose() {
    const h = this.hook, sw = this.sw;
    euler.set(sw.pitch + h.pitch, h.yaw, sw.roll, "ZXY");
    quat.setFromEuler(euler);
    this.m.compose(vPos.set(h.x, h.y, h.z), quat, vScale.setScalar(h.s * this.fit));
  }

  // The hook jumped (the view was re-framed): carry the cloth rigidly to the
  // new pose instead of flinging it.
  teleport() {
    if (!this.started) return;
    const h = this.hook, sim = this.sim, old = this.mPrev.copy(this.m);
    this.pose();
    if (!sim.asleep) sim.sleep(old);
    sim.carry.multiplyMatrices(this.m, sim.mSleepInv);
    sim.shake(this.m, h.s * this.fit, 1);
    sim.pv.fill(0);
    this.mPrev.copy(this.m);
    Object.assign(this.sw, { px: h.x, pz: h.z, vx: 0, vz: 0 });
  }

  // Returns true when anything visible changed this frame.
  update(dt, visible = true) {
    const h = this.hook, sw = this.sw;
    if (!this.started) {
      sw.px = h.x; sw.pz = h.z;
      this.pose();
      this.mPrev.copy(this.m);
    }
    // Hook acceleration by differencing, whatever is driving the hook.
    const vx = (h.x - sw.px) / dt, vz = (h.z - sw.pz) / dt;
    const ax = this.started ? THREE.MathUtils.clamp((vx - sw.vx) / dt, -40, 40) : 0;
    const az = this.started ? THREE.MathUtils.clamp((vz - sw.vz) / dt, -40, 40) : 0;
    sw.vx = vx; sw.vz = vz; sw.px = h.x; sw.pz = h.z;
    // Hanger is a damped pendulum on its hook, kicked by the hook's acceleration
    // and pulled toward wherever the fabric's mass has swung or been blown.
    const len = (0.525 * this.shape.h - this.top) * h.s * this.fit, w2 = 9.8 / len, dev = this.sim.dev;
    sw.rollV += (-w2 * Math.sin(sw.roll) - 4.4 * sw.rollV - 0.4 * (ax / len) * Math.cos(sw.roll) + 1.3 * w2 * dev[0] / len) * dt;
    sw.roll += sw.rollV * dt;
    sw.pitchV += (-w2 * Math.sin(sw.pitch) - 4.4 * sw.pitchV + 0.4 * (az / len) * Math.cos(sw.pitch) - 1.3 * w2 * dev[2] / len) * dt;
    sw.pitch += sw.pitchV * dt;

    this.mPrev.copy(this.m);
    this.pose();
    this.hanger.matrix.copy(this.m);
    this.hanger.matrixWorldNeedsUpdate = true;
    this.draught(dt);

    const sim = this.sim, a = this.m.elements, b = this.mPrev.elements;
    let moved = !this.started;
    for (let k = 0; k < 16 && !moved; k++) moved = Math.abs(a[k] - b[k]) > 1e-5;
    this.started = true;
    if (!sim.update(this.mPrev, this.m, h.s * this.fit, dt, visible)) {
      for (const mesh of [this.front, this.back]) {
        mesh.matrix.copy(sim.carry);
        mesh.matrixWorldNeedsUpdate = true;
      }
      return moved;
    }
    const { pos, normal } = sim, s = h.s * this.fit;
    const fp = this.front.geometry.attributes.position, bp = this.back.geometry.attributes.position;
    const fa = fp.array, ba = bp.array;
    for (let k = 0; k < this.bulge.length; k++) {
      const b = this.bulge[k] * s, k3 = k * 3;
      for (let c = 0; c < 3; c++) {
        fa[k3 + c] = pos[k3 + c] + normal[k3 + c] * b;
        ba[k3 + c] = pos[k3 + c] - normal[k3 + c] * b;
      }
    }
    fp.needsUpdate = bp.needsUpdate = true;
    this.front.geometry.attributes.normal.needsUpdate = true;
    // Inextensible from the pins, so the fabric stays inside this sphere.
    for (const mesh of [this.front, this.back]) {
      mesh.geometry.boundingSphere.center.set(h.x, h.y, h.z);
      mesh.geometry.boundingSphere.radius = (this.shape.h - this.top + 0.2) * s;
      mesh.matrix.identity();
      mesh.matrixWorldNeedsUpdate = true;
    }
    return true;
  }
}
