import * as THREE from "three";
import { RoundedBoxGeometry } from "three/addons/geometries/RoundedBoxGeometry.js";

// Beauty products standing on a table: procedural models turned from real
// packaging silhouettes (lathe profiles), with refractive glass, brushed metal
// and labels printed on the body. Built from p.kind/p.style, coloured by
// p.base. Same interface as a Garment so a Rail can slide them; the hook is the
// point on the table under the model. The piece in the spotlight lifts a
// little and turns like it is on a turntable.

const SPIN = 0.7; // spotlight turn, rad/s
const LIFT = 0.05; // spotlight lift, model units

const phys = (o) => new THREE.MeshPhysicalMaterial(o);
// Geometry depends only on kind/style, so it is built once and shared; the
// cache owns it, so rails leave it alone when they dispose.
const GEO = {};
const once = (key, make) => (GEO[key] ??= Object.assign(make(), { userData: { shared: true } }));
// Shared finishes; table rails light them with a brighter environment.
const FINISH = {
  gold: phys({ color: 0xdcb36b, metalness: 1, roughness: 0.2 }),
  roseGold: phys({ color: 0xe6aa92, metalness: 1, roughness: 0.22 }),
  silver: phys({ color: 0xebebf0, metalness: 1, roughness: 0.12 }),
  lacquer: phys({ color: 0x0a0a0c, roughness: 0.1, clearcoat: 1, clearcoatRoughness: 0.04 }),
  frosted: phys({ color: 0x18181a, roughness: 0.6, sheen: 0.5, sheenRoughness: 0.6, sheenColor: 0x4a4a4e }),
  white: phys({ color: 0xf6f5f1, roughness: 0.3, clearcoat: 0.6, clearcoatRoughness: 0.2 }),
  rubber: phys({ color: 0x1b1b1d, roughness: 0.75 }),
  // Clear glass is a thin reflective shell, not transmission: transmission
  // refracts the canvas's transparent backdrop and turns milky.
  glass: phys({ color: 0xffffff, roughness: 0.02, clearcoat: 1, transparent: true, opacity: 0.2, depthWrite: false }),
  frostGlass: phys({ color: 0xf4f3f0, roughness: 0.4, clearcoat: 0.6, clearcoatRoughness: 0.3, transparent: true, opacity: 0.55, depthWrite: false }),
  amberGlass: phys({ color: 0xa8571d, roughness: 0.04, clearcoat: 1, transparent: true, opacity: 0.6, depthWrite: false }),
};

function shade(hex, t) {
  const c = new THREE.Color(hex);
  return t > 0 ? c.lerp(new THREE.Color(0xffffff), t) : c.lerp(new THREE.Color(0x000000), -t);
}

// Light packaging takes dark print and the reverse.
function ink(hex) {
  return new THREE.Color(hex).getHSL({}).l > 0.55 ? "#2a2522" : "#f7f4ee";
}

// Bakes a 2D drawing into a texture; draw(g, w, h).
function texture(w, h, draw) {
  const c = document.createElement("canvas");
  c.width = Math.max(16, Math.round(w)); c.height = Math.max(16, Math.round(h));
  draw(c.getContext("2d"), c.width, c.height);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

// Turned solid from a [r, y] profile, bottom to top. Corners are rounded by
// `round` unless a point carries its own radius as a third value.
function lathe(pts, round = 0.008, segs = 72) {
  const out = [];
  for (let i = 0; i < pts.length; i++) {
    const p = pts[i], a = pts[i - 1], b = pts[i + 1], rr = p[2] ?? round;
    if (!a || !b || rr <= 0) { out.push(new THREE.Vector2(p[0], p[1])); continue; }
    const da = Math.hypot(a[0] - p[0], a[1] - p[1]), db = Math.hypot(b[0] - p[0], b[1] - p[1]);
    const ta = Math.min(rr, da / 2) / da, tb = Math.min(rr, db / 2) / db;
    const s = [p[0] + (a[0] - p[0]) * ta, p[1] + (a[1] - p[1]) * ta], e = [p[0] + (b[0] - p[0]) * tb, p[1] + (b[1] - p[1]) * tb];
    for (let k = 0; k <= 6; k++) {
      const t = k / 6, u = 1 - t;
      out.push(new THREE.Vector2(u * u * s[0] + 2 * u * t * p[0] + t * t * e[0], u * u * s[1] + 2 * u * t * p[1] + t * t * e[1]));
    }
  }
  return new THREE.LatheGeometry(out, segs);
}

// Radius of a profile at height y (linear between points).
function radiusAt(pts, y) {
  for (let i = 1; i < pts.length; i++) {
    const [r0, y0] = pts[i - 1], [r1, y1] = pts[i];
    if (y >= Math.min(y0, y1) && y <= Math.max(y0, y1) && y1 !== y0) return r0 + ((r1 - r0) * (y - y0)) / (y1 - y0);
  }
  return 0;
}

// Vertical fluting or knurling between y0 and y1.
function ribs(geo, n, depth, y0 = -Infinity, y1 = Infinity) {
  const pos = geo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), z = pos.getZ(i);
    if (y < y0 || y > y1) continue;
    const k = 1 + depth * Math.cos(Math.atan2(x, z) * n);
    pos.setX(i, x * k); pos.setZ(i, z * k);
  }
  geo.computeVertexNormals();
  return geo;
}

// Brand, product line and size, centred on (cx, cy) of a label canvas.
function print(g, w, h, cx, cy, p, fg, scale = 1) {
  const u = h * 0.08 * scale;
  g.fillStyle = fg;
  g.textAlign = "center";
  g.textBaseline = "middle";
  g.font = `600 ${u * 1.5}px Georgia, serif`;
  g.letterSpacing = `${u * 0.25}px`;
  g.fillText(p.brand.toUpperCase(), cx, cy - u * 1.2);
  g.font = `500 ${u * 0.75}px "Assistant", sans-serif`;
  g.letterSpacing = `${u * 0.12}px`;
  g.fillText(p.type.toUpperCase(), cx, cy + u * 0.5);
  g.globalAlpha = 0.7;
  g.fillText(p.volume ?? "", cx, cy + u * 1.6);
  g.globalAlpha = 1;
}

class Kit {
  constructor(p) {
    this.p = p;
    this.group = new THREE.Group();
    this.owned = []; // materials and textures to dispose
  }
  mat(o) {
    const m = phys(o);
    this.owned.push(m);
    if (o.map) this.owned.push(o.map);
    return m;
  }
  add(geo, mat, x = 0, y = 0, z = 0) {
    const m = new THREE.Mesh(geo, mat);
    m.position.set(x, y, z);
    m.castShadow = true;
    this.group.add(m);
    return m;
  }
  // Opaque body with the label printed round its front. Lathe and cylinder
  // UVs start at the front (+z); the canvas centre is shifted there. circ/h
  // keep the print's aspect true.
  printed(base, circ, h, draw, o = {}) {
    const map = texture(512, (512 * h) / circ, (g, w, ch) => {
      g.fillStyle = base;
      g.fillRect(0, 0, w, ch);
      draw(g, w, ch);
    });
    map.wrapS = THREE.RepeatWrapping;
    map.offset.x = 0.5;
    return this.mat({ map, roughness: 0.32, clearcoat: 0.5, clearcoatRoughness: 0.2, ...o });
  }
  // Paper label wrapped part-way round a glass bottle's front.
  wrap(r, h, y, arc, draw) {
    const map = texture((256 * arc * r) / h, 256, draw);
    const geo = once(`wrap-${r}-${h}-${arc}`, () => new THREE.CylinderGeometry(r, r, h, 48, 1, true, -arc / 2, arc));
    return this.add(geo, this.mat({ map, roughness: 0.6 }), 0, y);
  }
}

// ---- Lipsticks ---------------------------------------------------------------

// Case archetypes from the big houses: square gold couture, soft-touch black
// pro bullet, polished silver with engraved rings, black lacquer with a gold
// band, and a fluted rose-gold tube.
const LIPSTICK = {
  couture: { case: "gold", sleeve: "gold", square: true },
  pro: { case: "frosted", sleeve: "silver", band: "silver" },
  silver: { case: "silver", sleeve: "silver", engraved: true },
  lacquer: { case: "lacquer", sleeve: "gold", band: "gold" },
  fluted: { case: "roseGold", sleeve: "roseGold", fluted: true },
};

// The stick: turned, with the classic slanted tip and a softly rounded edge.
function bullet(r, h, slant) {
  const pts = [[0, 0]];
  for (let i = 0; i <= 40; i++) pts.push([r, (h * i) / 40]);
  pts.push([0, h]);
  const geo = lathe(pts, 0, 64), pos = geo.attributes.position, k = 0.007;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i), y = pos.getY(i), plane = h - (slant * (r - x)) / (2 * r);
    pos.setY(i, -k * Math.log(Math.exp(-y / k) + Math.exp(-plane / k)));
  }
  geo.computeVertexNormals();
  return geo;
}

function lipstick(k) {
  const p = k.p, st = LIPSTICK[p.style], body = FINISH[st.case], H = 0.34, R = 0.1;
  if (st.square) {
    k.add(once(`lip-square-${p.style}`, () => new RoundedBoxGeometry(0.2, H, 0.2, 4, 0.012)), body, 0, H / 2);
  } else {
    k.add(once(`lip-case-${!!st.fluted}`, () => {
      const geo = lathe([[0, 0], [R * 0.9, 0], [R, 0.025], [R, H - 0.008], [R * 0.95, H], [0, H]], 0.012, 128);
      return st.fluted ? ribs(geo, 28, 0.03, 0.03, H - 0.02) : geo;
    }), body);
    if (st.band) k.add(once("lip-band", () => new THREE.CylinderGeometry(R + 0.003, R + 0.003, 0.03, 96)), FINISH[st.band], 0, H - 0.04);
    if (st.engraved) {
      for (const y of [0.05, 0.065, 0.275, 0.29]) {
        const ring = k.add(once("lip-ring", () => new THREE.TorusGeometry(R, 0.0022, 6, 128)), FINISH.lacquer, 0, y);
        ring.rotation.x = Math.PI / 2;
        ring.castShadow = false;
      }
    }
  }
  k.add(once("lip-sleeve", () => lathe([[0, 0], [0.079, 0], [0.079, 0.055], [0.074, 0.065], [0, 0.065]], 0.004, 64)), FINISH[st.sleeve], 0, H);
  const matte = /Matte|Velvet/.test(p.type);
  const stick = k.mat({ color: p.base, roughness: matte ? 0.6 : 0.24, clearcoat: matte ? 0 : 0.7, clearcoatRoughness: 0.18, sheen: matte ? 0.6 : 0, sheenRoughness: 0.5, sheenColor: shade(p.base, 0.3) });
  k.add(once("lip-bullet", () => bullet(0.066, 0.22, 0.1)), stick, 0, H + 0.05);
}

// ---- Nail polish ---------------------------------------------------------------

// Bottle archetypes: the rounded-square salon bottle with a tall black cap,
// the flat square bottle with a tall white or black cap, and a domed bottle
// with a short faceted gold cap. All heavy-based glass with lacquer inside
// and the brush stem showing in the neck.
const POLISH = {
  classic: { profile: [[0, 0], [0.14, 0, 0.015], [0.158, 0.03], [0.158, 0.19], [0.12, 0.245], [0.048, 0.262], [0.048, 0.29, 0], [0, 0.29]], cap: 0.32 },
  square: { box: [0.27, 0.25, 0.19], cap: 0.3 },
  dome: { profile: [[0, 0], [0.16, 0, 0.02], [0.168, 0.05], [0.14, 0.16], [0.07, 0.235], [0.048, 0.25], [0.048, 0.28, 0], [0, 0.28]], cap: 0.16 },
};

function polish(k) {
  const p = k.p, st = POLISH[p.style], lacquer = k.mat({ color: p.base, roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.03 });
  let top;
  if (st.box) {
    const [w, h, d] = st.box;
    k.add(once(`polish-box-${p.style}`, () => new RoundedBoxGeometry(w, h, d, 5, 0.04)), FINISH.glass, 0, h / 2);
    k.add(once(`polish-box-fill-${p.style}`, () => new RoundedBoxGeometry(w - 0.05, h - 0.09, d - 0.05, 4, 0.025)), lacquer, 0, 0.04 + (h - 0.09) / 2);
    k.add(once(`polish-box-neck-${p.style}`, () => lathe([[0, 0], [0.048, 0], [0.048, 0.04, 0], [0, 0.04]], 0.004, 48)), FINISH.glass, 0, h);
    top = h + 0.04;
  } else {
    const pr = st.profile, fill = pr.find((q) => q[1] > 0.1 && q[0] < pr[2][0] * 0.95)?.[1] ?? 0.17;
    k.add(once(`polish-${p.style}`, () => lathe(pr, 0.03, 96)), FINISH.glass);
    k.add(once(`polish-${p.style}-fill`, () => {
      const wall = 0.022, base = 0.045, lvl = fill - 0.02, inner = [[0, base]];
      for (let y = base; y <= lvl; y += 0.01) inner.push([radiusAt(pr, y) - wall, y]);
      inner.push([radiusAt(pr, lvl) - wall, lvl], [0, lvl]);
      return lathe(inner, 0.008, 64);
    }), lacquer);
    top = pr.at(-1)[1];
  }
  k.add(once(`polish-${p.style}-stem`, () => new THREE.CylinderGeometry(0.008, 0.008, top - 0.08, 8)), FINISH.lacquer, 0, 0.08 + (top - 0.08) / 2);
  const ch = st.cap, gold = p.cap === "gold";
  const cap = once(`polish-${p.style}-cap-${gold}`, () => {
    const geo = lathe([[0, 0], [0.062, 0, 0], [0.064, ch * 0.7], [0.06, ch], [0, ch]], 0.012, 96);
    return gold ? ribs(geo, 12, 0.04, 0.01, ch - 0.01) : geo;
  });
  k.add(cap, FINISH[p.cap], 0, top - 0.035);
}

// ---- Creams --------------------------------------------------------------------

// Luxury frosted-glass jar with a knurled metal (or coloured) lid.
function jar(k) {
  const p = k.p, R = 0.23, H = 0.17;
  k.add(once("jar", () => lathe([[0, 0], [R - 0.01, 0, 0.012], [R, 0.02], [R, H - 0.03], [R - 0.03, H], [R - 0.04, H + 0.02, 0], [0, H + 0.02]], 0.02, 96)), FINISH.frostGlass);
  k.add(once("jar-fill", () => lathe([[0, 0.03], [R - 0.035, 0.03], [R - 0.035, H - 0.02], [0, H - 0.02]], 0.01, 64)), k.mat({ color: shade(p.base, 0.1), roughness: 0.5 }));
  const lid = once("jar-lid", () => ribs(lathe([[0, 0], [R + 0.008, 0, 0.004], [R + 0.008, 0.075], [R - 0.01, 0.095], [0, 0.098]], 0.012, 192), 90, 0.006, 0.006, 0.07));
  k.add(lid, p.lid ? FINISH[p.lid] : k.mat({ color: shade(p.base, -0.25), roughness: 0.25, clearcoat: 0.8 }), 0, H + 0.005);
  k.wrap(R + 0.002, 0.07, 0.085, 1.4, (g, w, h) => print(g, w, h, w / 2, h * 0.5, p, "#3a3430", 2.4));
}

// Squeeze tube standing on its flip-top cap, pressed flat to a crimped seal.
function tube(k) {
  const p = k.p, h = 0.52, r = 0.105, y0 = 0.115;
  const geo = once("tube", () => {
    const geo = new THREE.CylinderGeometry(r, r, h, 64, 24), pos = geo.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      const t = pos.getY(i) / h + 0.5, e = t * t * (3 - 2 * t);
      pos.setX(i, pos.getX(i) * (1 + 0.42 * e));
      pos.setZ(i, pos.getZ(i) * (1 - 0.94 * Math.pow(e, 0.85)));
    }
    geo.computeVertexNormals();
    return geo;
  });
  const fg = ink(p.base);
  const body = k.printed(p.base, 2 * Math.PI * r, h, (g, w, ch) => {
    g.fillStyle = shade(p.base, -0.12).getStyle();
    g.fillRect(0, ch * 0.08, w, ch * 0.012);
    print(g, w, ch, w / 2, ch * 0.5, p, fg, 0.85);
  });
  k.add(geo, body, 0, y0 + h / 2);
  const seal = texture(256, 32, (g, w, ch) => {
    g.fillStyle = shade(p.base, -0.06).getStyle();
    g.fillRect(0, 0, w, ch);
    g.fillStyle = "rgba(0,0,0,0.12)";
    for (let x = 0; x < w; x += 4) g.fillRect(x, 0, 1.5, ch);
  });
  k.add(once("tube-seal", () => new RoundedBoxGeometry(2 * r * 1.44, 0.05, 0.016, 2, 0.006)), k.mat({ map: seal, roughness: 0.45 }), 0, y0 + h + 0.012);
  const capMat = p.base === "#3b3c40" ? FINISH.white : FINISH.lacquer.clone();
  if (capMat !== FINISH.white) { capMat.color.set(shade(p.base, -0.5)); k.owned.push(capMat); }
  k.add(once("tube-cap", () => lathe([[0, 0], [0.088, 0, 0.02], [0.094, 0.1], [0.1, y0], [0, y0]], 0.006, 96)), capMat);
}

// Pharmacy lotion: rounded bottle, ribbed collar, pump with a side nozzle.
function pump(k) {
  const p = k.p, R = 0.15, H = 0.48, fg = "#1f3c68";
  const body = k.printed("#f7f7f4", 2 * Math.PI * R, H, (g, w, h) => {
    g.fillStyle = p.base;
    g.fillRect(0, h * 0.1, w, h * 0.06);
    print(g, w, h, w / 2, h * 0.48, p, fg, 0.8);
  });
  k.add(once("pump", () => lathe([[0, 0], [R - 0.01, 0, 0.015], [R, 0.025], [R, H - 0.06], [R - 0.05, H - 0.01], [0.055, H], [0, H]], 0.03, 96)), body);
  const collar = once("pump-collar", () => ribs(lathe([[0, 0], [0.066, 0], [0.066, 0.05], [0.05, 0.06], [0, 0.06]], 0.006, 144), 48, 0.025, 0.004, 0.046));
  k.add(collar, FINISH.white, 0, H - 0.005);
  k.add(once("pump-stem", () => new THREE.CylinderGeometry(0.016, 0.016, 0.07, 16)), FINISH.white, 0, H + 0.08);
  k.add(once("pump-head", () => lathe([[0, 0], [0.05, 0], [0.052, 0.03], [0.04, 0.045], [0, 0.048]], 0.008, 64)), FINISH.white, 0, H + 0.11);
  const nozzle = k.add(once("pump-nozzle", () => new THREE.CylinderGeometry(0.012, 0.014, 0.09, 16)), FINISH.white, 0.08, H + 0.135);
  nozzle.rotation.z = Math.PI / 2;
}

// Treatment serum: clear or amber glass with a ribbed collar, rubber bulb and
// a plain white wrap label.
function dropper(k) {
  const p = k.p, pr = [[0, 0], [0.098, 0, 0.012], [0.105, 0.02], [0.105, 0.29], [0.06, 0.335], [0.034, 0.345], [0.034, 0.37, 0], [0, 0.37]];
  k.add(once("dropper", () => lathe(pr, 0.03, 96)), p.amber ? FINISH.amberGlass : FINISH.glass);
  const inner = once("dropper-fill", () => {
    const pts = [[0, 0.03]];
    for (let y = 0.03; y <= 0.27; y += 0.02) pts.push([radiusAt(pr, y) - 0.016, y]);
    pts.push([0, 0.27]);
    return lathe(pts, 0.01, 48);
  });
  k.add(inner, k.mat({ color: shade(p.base, 0.35), roughness: 0.1, transparent: true, opacity: 0.85 }));
  const collar = once("dropper-collar", () => ribs(lathe([[0, 0], [0.046, 0], [0.046, 0.07], [0.04, 0.08], [0, 0.08]], 0.005, 144), 40, 0.03, 0.005, 0.065));
  k.add(collar, FINISH.lacquer, 0, 0.36);
  k.add(once("dropper-bulb", () => lathe([[0, 0], [0.032, 0], [0.036, 0.04], [0.03, 0.09], [0.016, 0.115], [0, 0.12]], 0.01, 48)), FINISH.rubber, 0, 0.44);
  k.add(once("dropper-pipette", () => new THREE.CylinderGeometry(0.006, 0.006, 0.26, 8)), FINISH.glass, 0, 0.23);
  k.wrap(0.107, 0.16, 0.14, 2.2, (g, w, h) => {
    g.fillStyle = "#fbfaf7";
    g.fillRect(0, 0, w, h);
    print(g, w, h, w / 2, h * 0.48, p, "#232323", 1.1);
  });
}

const KINDS = { lipstick, polish, jar, tube, pump, dropper };

const mPrev = new THREE.Matrix4(), euler = new THREE.Euler(), quat = new THREE.Quaternion(), vPos = new THREE.Vector3(), vScale = new THREE.Vector3();

export class Product {
  constructor(p) {
    const k = new Kit(p);
    KINDS[p.kind](k);
    // Models are built at ~0.6 tall; bring them up to a garment's presence.
    k.group.scale.setScalar(1.25 * (p.size ?? 1));
    this.root = new THREE.Group();
    this.root.add(k.group);
    this.root.matrixAutoUpdate = false;
    this.owned = k.owned;
    this.meshes = [];
    k.group.traverse((o) => o.isMesh && this.meshes.push(o));
    this.hook = { x: 0, y: 0, z: 0, yaw: 0, pitch: 0, s: 1 }; // set by the rail every frame
    this.breeze = 0; // 1 while in the spotlight
    this.yaw = 0.55; // parked pieces turn only part-way: flat ones stay readable
    this.gap = 1.35;
    this.pack = 1.8;
    this.spin = 0;
    this.lift = 0;
    this.liftV = 0;
  }

  addTo(scene) {
    scene.add(this.root);
  }

  set shown(v) {
    this.root.visible = v;
  }

  get pickables() {
    return this.meshes;
  }

  hits() {
    return true;
  }

  get textures() {
    return this.owned.filter((o) => o.isTexture);
  }

  teleport() {}

  update(dt) {
    const h = this.hook, on = this.breeze > 0;
    if (on) this.spin += SPIN * dt;
    else {
      // Settle back to facing front by the shortest way round.
      const home = Math.round(this.spin / (Math.PI * 2)) * Math.PI * 2;
      this.spin += (home - this.spin) * (1 - Math.exp(-5 * dt));
    }
    this.liftV += (120 * ((on ? LIFT : 0) - this.lift) - 2 * 0.7 * Math.sqrt(120) * this.liftV) * dt;
    this.lift += this.liftV * dt;
    mPrev.copy(this.root.matrix);
    euler.set(h.pitch, h.yaw + this.spin, 0);
    quat.setFromEuler(euler);
    this.root.matrix.compose(vPos.set(h.x, h.y + this.lift * h.s, h.z), quat, vScale.setScalar(h.s));
    this.root.matrixWorldNeedsUpdate = true;
    const a = this.root.matrix.elements, b = mPrev.elements;
    for (let i = 0; i < 16; i++) if (Math.abs(a[i] - b[i]) > 1e-5) return true;
    return false;
  }

  dispose() {
    for (const o of this.owned) o.dispose();
  }
}
