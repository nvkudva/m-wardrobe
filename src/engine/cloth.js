import * as THREE from "three";

// World-space XPBD cloth. Particles live in world coordinates and the top row
// is pinned to the hanger, so moving, turning or scaling the hanger drags the
// fabric with real inertia: lag, swing and flutter come from the physics.
// The solver runs on a coarse grid; the meshes draw a finer bicubic surface
// through it. A settled cloth falls asleep and is carried rigidly by the
// hanger (one matrix, no per-vertex work) until it is shaken awake.
const RATE = 120;     // substeps per second
const ITER = 2;
const DRAG = 0.78;    // ½·ρ_air·Cd; divided by the fabric's areal density
const COMP_GHOST = 2e-3; // links into cut-away area: light bracing, not fabric
const WAKE = 0.9;     // hanger acceleration that wakes a sleeping cloth (garment units/s²)
const SLEEP_V = 0.02, SLEEP_T = 0.35;
// Furthest a particle may stray from its hanging pose, as a share of its
// distance from the pins: hems flare and trail, but nothing folds over.
const STRAY = 0.45;
// While the hook travels fast the cut holds its shape harder (up to BRACE×
// shape memory and bending, with a floor so even chiffon stays readable):
// a garment swept across the view twists and flares without folding over.
const BRACE = 6, BRACE_V = 1.2, BRACE_K = 10;

// Catmull-Rom weights from S sim samples onto N render samples, ends extrapolated
// linearly. Four (index, weight) pairs per render sample.
function bicubic(S, N) {
  const idx = new Int32Array(N * 4), wt = new Float64Array(N * 4), dense = new Float64Array(S);
  for (let r = 0; r < N; r++) {
    const g = (r / (N - 1)) * (S - 1), i = Math.min(Math.floor(g), S - 2), t = g - i;
    const w = [(-t * t * t + 2 * t * t - t) / 2, (3 * t * t * t - 5 * t * t + 2) / 2, (-3 * t * t * t + 4 * t * t + t) / 2, (t * t * t - t * t) / 2];
    dense.fill(0);
    for (let a = 0; a < 4; a++) {
      const k = i - 1 + a;
      if (k < 0) { dense[0] += 2 * w[a]; dense[1] -= w[a]; }
      else if (k >= S) { dense[S - 1] += 2 * w[a]; dense[S - 2] -= w[a]; }
      else dense[k] += w[a];
    }
    let c = 0;
    for (let k = Math.max(i - 1, 0); k <= Math.min(i + 2, S - 1); k++) { idx[r * 4 + c] = k; wt[r * 4 + c++] = dense[k]; }
  }
  return { idx, wt };
}

function gridNormals(pos, normal, W, H) {
  for (let j = 0; j < H; j++) {
    for (let i = 0; i < W; i++) {
      const r = (j * W + Math.min(i + 1, W - 1)) * 3, l = (j * W + Math.max(i - 1, 0)) * 3;
      const u = (Math.max(j - 1, 0) * W + i) * 3, d = (Math.min(j + 1, H - 1) * W + i) * 3;
      const ax = pos[r] - pos[l], ay = pos[r + 1] - pos[l + 1], az = pos[r + 2] - pos[l + 2];
      const bx = pos[u] - pos[d], by = pos[u + 1] - pos[d + 1], bz = pos[u + 2] - pos[d + 2];
      const nx = ay * bz - az * by, ny = az * bx - ax * bz, nz = ax * by - ay * bx;
      const len = Math.sqrt(nx * nx + ny * ny + nz * nz) || 1, k = (j * W + i) * 3;
      normal[k] = nx / len; normal[k + 1] = ny / len; normal[k + 2] = nz / len;
    }
  }
}

function apply(e, x, y, z, out, k) {
  out[k] = e[0] * x + e[4] * y + e[8] * z + e[12];
  out[k + 1] = e[1] * x + e[5] * y + e[9] * z + e[13];
  out[k + 2] = e[2] * x + e[6] * y + e[10] * z + e[14];
}

export class Cloth {
  // shape: see shapes.js; fabric: see fabric.js; alpha(u, v) → 0..1 is the art's
  // coverage, so constraints only join real fabric; top: y of the pinned edge.
  constructor(shape, fabric, alpha, top) {
    const { w, h } = shape, [SX, SY] = shape.sim, n = SX * SY;
    this.sx = SX; this.sy = SY; this.nx = shape.grid[0]; this.ny = shape.grid[1];
    this.n = n;
    this.fabric = fabric;
    this.local = new Float64Array(n * 3);
    this.inv = new Float64Array(n);
    this.grav = new Float64Array(n);
    this.k = new Float64Array(n);
    this.area = new Float64Array(n);
    const real = new Uint8Array(n), du = 0.5 / (SX - 1), dv = 0.5 / (SY - 1);
    const fold = shape.folds;
    for (let j = 0; j < SY; j++) {
      for (let i = 0; i < SX; i++) {
        const k = j * SX + i, u = i / (SX - 1), v = j / (SY - 1);
        this.local[k * 3] = (u - 0.5) * w;
        this.local[k * 3 + 1] = top - v * h;
        if (fold && v > fold.from) {
          const r = (v - fold.from) / (1 - fold.from);
          this.local[k * 3 + 2] = fold.amp * r * Math.sqrt(r) * Math.sin(2 * Math.PI * fold.n * u);
        }
        let cover = 0;
        for (let a = -2; a <= 2; a++) for (let b = -2; b <= 2; b++) cover += alpha(u + (a / 2) * du, v + (b / 2) * dv) / 25;
        real[k] = cover > 0.3 ? 1 : 0;
        const pinned = j === 0 && shape.pins.some(([u0, u1]) => u >= u0 - 1e-6 && u <= u1 + 1e-6);
        this.inv[k] = pinned ? 0 : 1;
        if (pinned) real[k] = 1;
        // The cut holds the top of the garment (shoulders, sleeves, waistband);
        // below that it hangs under gravity and only loosely remembers its shape.
        const hold = Math.pow(1 - v, shape.hold);
        this.grav[k] = real[k] ? 1 - shape.support * hold : 0;
        this.k[k] = fabric.kHem + (fabric.kTop - fabric.kHem) * hold;
        this.area[k] = real[k] ? 0.12 + 0.88 * cover : 0;
      }
    }
    const L = this.local, dist = (p, q) => Math.hypot(L[q * 3] - L[p * 3], L[q * 3 + 1] - L[p * 3 + 1], L[q * 3 + 2] - L[p * 3 + 2]);
    // Fabric joins two particles only if the art is solid all along the link,
    // so legs, sleeves and the pallu move on their own.
    const solid = (p, q) => {
      const u0 = (p % SX) / (SX - 1), v0 = Math.floor(p / SX) / (SY - 1), u1 = (q % SX) / (SX - 1), v1 = Math.floor(q / SX) / (SY - 1);
      for (let t = 0.25; t < 1; t += 0.25) if (alpha(u0 + (u1 - u0) * t, v0 + (v1 - v0) * t) < 0.5) return false;
      return true;
    };
    const a = [], b = [], rest = [], comp = [], nb = Array.from({ length: n }, () => []);
    const link = (i0, j0, i1, j1, c) => {
      if (i1 < 0 || i1 >= SX || j1 >= SY) return;
      const p = j0 * SX + i0, q = j1 * SX + i1;
      if (!this.inv[p] && !this.inv[q]) return;
      // The hanger grips the fabric at the pins even where the art's top edge
      // starts a little lower (shoulder slope, scoop neck).
      const pin = !this.inv[p] || !this.inv[q];
      if (!pin && real[p] && real[q] && !solid(p, q)) return;
      const fabricLink = pin || (real[p] && real[q]);
      a.push(p); b.push(q); comp.push(fabricLink ? c : COMP_GHOST); rest.push(dist(p, q));
      if (fabricLink && c <= fabric.shear) { nb[p].push(q); nb[q].push(p); }
    };
    // Rows top-down so Gauss-Seidel carries the pins' pull to the hem in one sweep.
    for (let j = 0; j < SY; j++) {
      for (let i = 0; i < SX; i++) {
        link(i, j, i + 1, j, 0); link(i, j, i, j + 1, 0);
        link(i, j, i + 1, j + 1, fabric.shear); link(i, j, i - 1, j + 1, fabric.shear);
        link(i, j, i + 2, j, fabric.bend); link(i, j, i, j + 2, fabric.bend);
      }
    }
    this.a = Int32Array.from(a, (p) => p * 3); this.b = Int32Array.from(b, (q) => q * 3);
    this.wa = Float64Array.from(a, (p) => this.inv[p]); this.wb = Float64Array.from(b, (q) => this.inv[q]);
    this.rest = Float64Array.from(rest); this.comp = Float64Array.from(comp);
    this.lambda = new Float64Array(a.length);

    // Long-range attachments: no particle may drift further from its nearest
    // pin than its rest distance through the fabric. Removes gravity sag at
    // any iteration count. Cut-away particles (unreachable) are left free.
    this.anchor = new Int32Array(n);
    this.reach = new Float64Array(n).fill(Infinity);
    const done = new Uint8Array(n);
    for (let p = 0; p < SX; p++) if (!this.inv[p]) { this.reach[p] = 0; this.anchor[p] = p; }
    for (;;) {
      let best = -1;
      for (let k = 0; k < n; k++) if (!done[k] && this.reach[k] < Infinity && (best < 0 || this.reach[k] < this.reach[best])) best = k;
      if (best < 0) break;
      done[best] = 1;
      for (const q of nb[best]) {
        const d = this.reach[best] + dist(best, q);
        if (d < this.reach[q]) { this.reach[q] = d; this.anchor[q] = this.anchor[best]; }
      }
    }

    this.x = new Float64Array(n * 3);
    this.v = new Float64Array(n * 3);
    this.x0 = new Float64Array(n * 3);
    this.goal = new Float64Array(n * 3);
    this.from = new Float64Array(n * 3);
    this.to = new Float64Array(n * 3);
    this.nrm = new Float64Array(n * 3);

    const NX = this.nx, NY = this.ny;
    this.cx = bicubic(SX, NX);
    this.cy = bicubic(SY, NY);
    this.row = new Float64Array(NX * SY * 3);
    this.pos = new Float32Array(NX * NY * 3);
    this.normal = new Float32Array(NX * NY * 3);

    this.air = new Float32Array(3); // ambient air velocity, garment units/s
    this.push = null; // pending poke: [px, py, r, vx, vy, vz] in world units
    this.dev = new Float32Array(3); // mean offset of the fabric from its rigid pose (world)
    this.asleep = false;
    this.carry = new THREE.Matrix4(); // sleeping cloth: rigid transform from its frozen pose
    this.mSleepInv = new THREE.Matrix4();
    this.mT = new THREE.Matrix4();
    this.calm = 0;
    this.brace = 1;
    this.speed = 0;
    this.started = false;
    // Probe points that measure how hard the hanger is being shaken.
    this.probe = new Float64Array([-w / 2, top - h, 0, w / 2, top - h, 0, 0, top, 0]);
    this.pp = new Float64Array(9);
    this.pv = new Float64Array(9);
    this.pt = new Float64Array(9);
  }

  transform(m, out) {
    const e = m.elements, l = this.local;
    for (let k = 0; k < l.length; k += 3) apply(e, l[k], l[k + 1], l[k + 2], out, k);
  }

  // Largest acceleration of the probes this frame, in garment units/s².
  shake(m, s, dt) {
    const e = m.elements, { probe, pp, pv, pt } = this;
    let worst = 0;
    for (let k = 0; k < 9; k += 3) {
      apply(e, probe[k], probe[k + 1], probe[k + 2], pt, k);
      for (let c = 0; c < 3; c++) {
        const vel = (pt[k + c] - pp[k + c]) / dt;
        worst = Math.max(worst, Math.abs(vel - pv[k + c]) / dt);
        pv[k + c] = vel;
        pp[k + c] = pt[k + c];
      }
    }
    // The top-centre probe sits on the yaw axis: its speed is pure travel.
    this.speed = Math.hypot(pv[6], pv[7], pv[8]) / s;
    return worst / s;
  }

  // Hanger moved from mPrev to m this frame. Returns true when the cloth
  // simulated (its pos/normal changed); a sleeping cloth instead exposes `carry`.
  update(mPrev, m, s, dt, visible = true) {
    if (!this.started) {
      this.shake(m, s, 1);
      this.pv.fill(0);
      this.transform(m, this.x);
      this.started = true;
      this.render();
      return true;
    }
    const shake = this.shake(m, s, dt);
    const windy = this.air[0] !== 0 || this.air[1] !== 0 || this.air[2] !== 0 || this.push !== null;
    if (this.asleep) {
      if (!visible || (shake < WAKE && !windy)) {
        this.carry.multiplyMatrices(m, this.mSleepInv);
        return false;
      }
      this.wake(mPrev, m, dt);
    } else if (!visible) {
      this.sleep(mPrev);
      this.carry.multiplyMatrices(m, this.mSleepInv);
      return false;
    }
    const v = this.speed / BRACE_V;
    this.brace = Math.max(Math.min(1 + v * v, BRACE), 1 + (this.brace - 1) * Math.exp(-dt / 0.25));
    const rel = this.simulate(mPrev, m, s, dt);
    this.calm = rel < SLEEP_V && shake < WAKE * 0.5 && !windy ? this.calm + dt : 0;
    if (this.calm > SLEEP_T) this.sleep(m);
    this.render();
    return true;
  }

  sleep(m) {
    this.asleep = true;
    this.calm = 0;
    this.mSleepInv.copy(m).invert();
    this.carry.identity();
  }

  // Bake the rigid carry back into the particles, moving with the hanger.
  wake(mPrev, m, dt) {
    const { x, v, n } = this;
    const e0 = this.mT.multiplyMatrices(mPrev, this.mSleepInv).elements.slice();
    const e1 = this.mT.multiplyMatrices(m, this.mSleepInv).elements;
    for (let k = 0; k < n * 3; k += 3) {
      const px = x[k], py = x[k + 1], pz = x[k + 2];
      apply(e1, px, py, pz, v, k);
      apply(e0, px, py, pz, x, k);
      v[k] = (v[k] - x[k]) / dt; v[k + 1] = (v[k + 1] - x[k + 1]) / dt; v[k + 2] = (v[k + 2] - x[k + 2]) / dt;
    }
    this.asleep = false;
    this.calm = 0;
    this.carry.identity();
  }

  // Shove the fabric around world point (px, py) with velocity (vx, vy, vz), e.g.
  // a cursor brushing past. Applied on the next update; wakes a sleeping cloth.
  poke(px, py, r, vx, vy, vz) {
    this.push = [px, py, r, vx, vy, vz];
  }

  simulate(mPrev, m, s, dt) {
    const { x, v, x0, goal, from, to, nrm, inv, grav, area, n, air } = this;
    if (this.push) {
      const [px, py, r, vx, vy, vz] = this.push;
      for (let k = 0; k < n; k++) {
        const k3 = k * 3, d = Math.hypot(x[k3] - px, x[k3 + 1] - py);
        if (!inv[k] || d >= r) continue;
        const f = (1 - d / r) ** 2;
        v[k3] += vx * f; v[k3 + 1] += vy * f; v[k3 + 2] += vz * f;
      }
      this.push = null;
    }
    this.transform(mPrev, from);
    this.transform(m, to);
    gridNormals(x, nrm, this.sx, this.sy);
    const steps = Math.max(1, Math.round(dt * RATE)), h = dt / steps, g = -9.8 * s;
    const { damp, skin, vmax, density } = this.fabric, brace = this.brace, kFloor = BRACE_K * (brace - 1);
    const ax0 = air[0] * s, ay0 = air[1] * s, az0 = air[2] * s, drag = DRAG / density / s;
    let rel = 0;
    for (let st = 1; st <= steps; st++) {
      const f = st / steps;
      for (let k = 0; k < n; k++) {
        const k3 = k * 3;
        const gvx = (to[k3] - from[k3]) / dt, gvy = (to[k3 + 1] - from[k3 + 1]) / dt, gvz = (to[k3 + 2] - from[k3 + 2]) / dt;
        const tx = from[k3] + (to[k3] - from[k3]) * f;
        const ty = from[k3 + 1] + (to[k3 + 1] - from[k3 + 1]) * f;
        const tz = from[k3 + 2] + (to[k3 + 2] - from[k3 + 2]) * f;
        x0[k3] = x[k3]; x0[k3 + 1] = x[k3 + 1]; x0[k3 + 2] = x[k3 + 2];
        goal[k3] = tx; goal[k3 + 1] = ty; goal[k3 + 2] = tz;
        if (!inv[k]) { x[k3] = tx; x[k3 + 1] = ty; x[k3 + 2] = tz; continue; }
        let vx = v[k3], vy = v[k3 + 1], vz = v[k3 + 2];
        // Air acts on the fabric plate: pressure along the normal ∝ |v|·v_n gives
        // both drag and lift, so a sideways sweep lifts the hem as well as slowing it.
        const rx = vx - ax0, ry = vy - ay0, rz = vz - az0;
        const nx = nrm[k3], ny = nrm[k3 + 1], nz = nrm[k3 + 2];
        // Pressure saturates at speed (the fabric flattens into the flow instead of folding over).
        const vn = rx * nx + ry * ny + rz * nz, sp = Math.min(Math.sqrt(rx * rx + ry * ry + rz * rz), vmax * s);
        const pa = -drag * area[k] * sp * vn, sk = skin * area[k];
        let fx = pa * nx - sk * (rx - vn * nx) - damp * (vx - gvx);
        let fy = pa * ny - sk * (ry - vn * ny) - damp * (vy - gvy) + g * grav[k];
        let fz = pa * nz - sk * (rz - vn * nz) - damp * (vz - gvz);
        vx += fx * h; vy += fy * h; vz += fz * h;
        let px = x[k3] + vx * h, py = x[k3 + 1] + vy * h, pz = x[k3 + 2] + vz * h;
        // Shape memory toward the hanging pose, implicit so any stiffness is stable.
        const hk = h * h * Math.max(this.k[k] * brace, kFloor), beta = hk / (1 + hk);
        x[k3] = px + (tx - px) * beta; x[k3 + 1] = py + (ty - py) * beta; x[k3 + 2] = pz + (tz - pz) * beta;
      }
      this.solve(s, h);
      const last = st === steps;
      for (let k = 0; k < n; k++) {
        const k3 = k * 3;
        const vx = (x[k3] - x0[k3]) / h, vy = (x[k3 + 1] - x0[k3 + 1]) / h, vz = (x[k3 + 2] - x0[k3 + 2]) / h;
        v[k3] = vx; v[k3 + 1] = vy; v[k3 + 2] = vz;
        if (last && inv[k]) {
          const dx = vx - (to[k3] - from[k3]) / dt, dy = vy - (to[k3 + 1] - from[k3 + 1]) / dt, dz = vz - (to[k3 + 2] - from[k3 + 2]) / dt;
          rel = Math.max(rel, dx * dx + dy * dy + dz * dz);
        }
      }
    }
    let dx = 0, dy = 0, dz = 0, wsum = 0;
    for (let k = 0; k < n; k++) {
      const k3 = k * 3, w = area[k];
      dx += (x[k3] - to[k3]) * w; dy += (x[k3 + 1] - to[k3 + 1]) * w; dz += (x[k3 + 2] - to[k3 + 2]) * w; wsum += w;
    }
    this.dev[0] = dx / wsum; this.dev[1] = dy / wsum; this.dev[2] = dz / wsum;
    return Math.sqrt(rel) / s;
  }

  solve(s, h) {
    const { x, goal, inv, a, b, wa, wb, rest, comp, lambda, anchor, reach, n } = this;
    lambda.fill(0);
    const ih2b = 1 / (h * h * this.brace);
    for (let it = 0; it < ITER; it++) {
      for (let c = 0; c < a.length; c++) {
        const p3 = a[c], q3 = b[c], wp = wa[c], wq = wb[c];
        const dx = x[q3] - x[p3], dy = x[q3 + 1] - x[p3 + 1], dz = x[q3 + 2] - x[p3 + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz) || 1e-6;
        const at = comp[c] * ih2b;
        const dl = (d - rest[c] * s - at * lambda[c]) / (wp + wq + at);
        lambda[c] += dl;
        const r = dl / d, cx = dx * r, cy = dy * r, cz = dz * r;
        x[p3] += cx * wp; x[p3 + 1] += cy * wp; x[p3 + 2] += cz * wp;
        x[q3] -= cx * wq; x[q3 + 1] -= cy * wq; x[q3 + 2] -= cz * wq;
      }
      for (let k = 0; k < n; k++) {
        if (!inv[k]) continue;
        const k3 = k * 3, p3 = anchor[k] * 3;
        const dx = x[k3] - x[p3], dy = x[k3 + 1] - x[p3 + 1], dz = x[k3 + 2] - x[p3 + 2];
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz), max = reach[k] * s;
        if (d > max) {
          const r = (d - max) / d;
          x[k3] -= dx * r; x[k3 + 1] -= dy * r; x[k3 + 2] -= dz * r;
        }
        const gx = x[k3] - goal[k3], gy = x[k3 + 1] - goal[k3 + 1], gz = x[k3 + 2] - goal[k3 + 2];
        const g = Math.sqrt(gx * gx + gy * gy + gz * gz), lim = STRAY * max;
        if (g > lim) {
          const r = (g - lim) / g;
          x[k3] -= gx * r; x[k3 + 1] -= gy * r; x[k3 + 2] -= gz * r;
        }
      }
    }
  }

  // Bicubic surface through the sim particles onto the render grid, then normals.
  render() {
    const { x, row, pos, cx, cy } = this, SX = this.sx, SY = this.sy, NX = this.nx, NY = this.ny;
    for (let j = 0; j < SY; j++) {
      for (let i = 0; i < NX; i++) {
        let px = 0, py = 0, pz = 0;
        for (let c = 0; c < 4; c++) {
          const w = cx.wt[i * 4 + c], k = (j * SX + cx.idx[i * 4 + c]) * 3;
          px += x[k] * w; py += x[k + 1] * w; pz += x[k + 2] * w;
        }
        const o = (j * NX + i) * 3;
        row[o] = px; row[o + 1] = py; row[o + 2] = pz;
      }
    }
    for (let j = 0; j < NY; j++) {
      for (let i = 0; i < NX; i++) {
        let px = 0, py = 0, pz = 0;
        for (let c = 0; c < 4; c++) {
          const w = cy.wt[j * 4 + c], k = (cy.idx[j * 4 + c] * NX + i) * 3;
          px += row[k] * w; py += row[k + 1] * w; pz += row[k + 2] * w;
        }
        const o = (j * NX + i) * 3;
        pos[o] = px; pos[o + 1] = py; pos[o + 2] = pz;
      }
    }
    gridNormals(pos, this.normal, NX, NY);
  }
}
