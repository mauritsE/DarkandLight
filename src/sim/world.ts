// Procedural island: heights, tile types, start site and enemy stronghold sites.

export const N = 80;
export const T = { Water: 0, Sand: 1, Grass: 2, Forest: 3, Rock: 4 } as const;

export function mulberry32(a: number) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hash2(seed: number, x: number, y: number) {
  let h = seed ^ Math.imul(x, 374761393) ^ Math.imul(y, 668265263);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

function vnoise(seed: number, x: number, y: number) {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf);
  const a = hash2(seed, xi, yi), b = hash2(seed, xi + 1, yi);
  const c = hash2(seed, xi, yi + 1), d = hash2(seed, xi + 1, yi + 1);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

export function fbm(seed: number, x: number, y: number, oct = 4) {
  let amp = 0.5, f = 1, sum = 0, norm = 0;
  for (let i = 0; i < oct; i++) {
    sum += amp * vnoise(seed + i * 101, x * f, y * f);
    norm += amp; amp *= 0.5; f *= 2;
  }
  return sum / norm;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export interface Pt { x: number; z: number }

export class World {
  h = new Float32Array((N + 1) * (N + 1));
  type = new Uint8Array(N * N);
  start: Pt = { x: 0, z: 0 };
  campSites: Pt[] = [];
  genSeed = 0;

  constructor(public seed: number) {
    let s = seed >>> 0;
    for (let i = 0; i < 200; i++) {
      if (this.generate(s)) { this.genSeed = s; return; }
      s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    }
    throw new Error('World generation failed');
  }

  idx(x: number, z: number) { return z * N + x; }
  inb(x: number, z: number) { return x >= 0 && z >= 0 && x < N && z < N; }
  tileH(x: number, z: number) {
    const W = N + 1, h = this.h;
    return (h[z * W + x] + h[z * W + x + 1] + h[(z + 1) * W + x] + h[(z + 1) * W + x + 1]) / 4;
  }
  /** Bilinear terrain height at a world position. */
  heightAt(fx: number, fz: number) {
    const x = Math.min(N - 0.001, Math.max(0, fx)), z = Math.min(N - 0.001, Math.max(0, fz));
    const xi = Math.floor(x), zi = Math.floor(z), u = x - xi, v = z - zi, W = N + 1, h = this.h;
    const a = h[zi * W + xi], b = h[zi * W + xi + 1], c = h[(zi + 1) * W + xi], d = h[(zi + 1) * W + xi + 1];
    return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
  }
  isLand(x: number, z: number) { return this.inb(x, z) && this.type[z * N + x] !== T.Water; }
  isWalk(x: number, z: number) {
    if (!this.inb(x, z)) return false;
    const t = this.type[z * N + x];
    return t !== T.Water && t !== T.Rock;
  }

  private generate(seed: number): boolean {
    const W = N + 1;
    const mount = new Float32Array(W * W);
    for (let j = 0; j < W; j++) for (let i = 0; i < W; i++) {
      const nx = i / N - 0.5, nz = j / N - 0.5;
      const d = Math.sqrt(nx * nx + nz * nz) * 2;
      const e = fbm(seed, i * 0.05, j * 0.05, 4);
      const v = e - 0.2 - 0.95 * Math.pow(d, 2.4);
      let y = v > 0 ? 0.1 + v * 0.75 : v * 2.2;
      const r = 1 - Math.abs(2 * fbm(seed + 7, i * 0.06, j * 0.06, 3) - 1);
      const mask = fbm(seed + 13, i * 0.03, j * 0.03, 2);
      const m = smooth(0.8, 1, r) * smooth(0.42, 0.6, mask) * smooth(0.08, 0.22, v);
      mount[j * W + i] = m;
      y += m * 2.6 + (m > 0.2 ? hash2(seed, i, j) * 0.5 * m : 0);
      this.h[j * W + i] = y;
    }
    for (let z = 0; z < N; z++) for (let x = 0; x < N; x++) {
      const hh = this.tileH(x, z);
      const m = (mount[z * W + x] + mount[z * W + x + 1] + mount[(z + 1) * W + x] + mount[(z + 1) * W + x + 1]) / 4;
      let t: number = T.Grass;
      if (hh < 0.04) t = T.Water;
      else if (m > 0.22) t = T.Rock;
      else if (hh < 0.15) t = T.Sand;
      else if (fbm(seed + 31, x * 0.11, z * 0.11, 3) > 0.54) t = T.Forest;
      this.type[z * N + x] = t;
    }

    // Start site: flat grassy area near the centre with forest, coast and rock within reach.
    let best = -1, bx = 0, bz = 0;
    for (let z = 8; z < N - 8; z++) for (let x = 8; x < N - 8; x++) {
      let ok = true;
      for (let dz = -2; dz <= 2 && ok; dz++) for (let dx = -2; dx <= 2; dx++) {
        const t = this.type[(z + dz) * N + x + dx];
        if (t !== T.Grass && t !== T.Forest) { ok = false; break; }
      }
      if (!ok) continue;
      let open = 0, forest = 0, rock = 0, water = 0;
      for (let dz = -16; dz <= 16; dz++) for (let dx = -16; dx <= 16; dx++) {
        if (!this.inb(x + dx, z + dz)) continue;
        const t = this.type[(z + dz) * N + x + dx], dd = dx * dx + dz * dz;
        if (dd <= 81 && (t === T.Grass || t === T.Forest)) open++;
        if (dd <= 64 && t === T.Forest) forest++;
        if (dd <= 256 && t === T.Rock) rock++;
        if (dd <= 121 && t === T.Water) water++;
      }
      if (forest < 14 || rock < 4 || water < 6 || open < 150) continue;
      const cd = Math.hypot(x - N / 2, z - N / 2);
      const score = open - cd * 3 + Math.min(forest, 40);
      if (score > best) { best = score; bx = x; bz = z; }
    }
    if (best < 0) return false;
    this.start = { x: bx, z: bz };

    // BFS walking distance from start.
    const dist = this.bfs(bx, bz);
    const cands: { x: number; z: number; d: number }[] = [];
    for (let z = 4; z < N - 4; z++) for (let x = 4; x < N - 4; x++) {
      const d = dist[z * N + x];
      if (d < 0) continue;
      let ok = true;
      for (let dz = -2; dz <= 2 && ok; dz++) for (let dx = -2; dx <= 2; dx++) {
        const t = this.type[(z + dz) * N + x + dx];
        if (t === T.Water || t === T.Rock) { ok = false; break; }
      }
      if (ok) cands.push({ x, z, d });
    }
    const sites: Pt[] = [];
    const pick = (want: number, minSep: number) => {
      let b: Pt | null = null, bs = Infinity;
      for (const c of cands) {
        if (Math.hypot(c.x - bx, c.z - bz) < 17) continue;
        if (sites.some((s) => Math.hypot(s.x - c.x, s.z - c.z) < minSep)) continue;
        const sc = Math.abs(c.d - want);
        if (sc < bs) { bs = sc; b = { x: c.x, z: c.z }; }
      }
      if (b) sites.push(b);
      return !!b;
    };
    let far = 0;
    for (const c of cands) far = Math.max(far, c.d);
    if (far < 34) return false;
    if (!pick(far, 0)) return false; // sovereign: farthest
    if (!pick(22, 20)) return false; // hollow: near
    if (!pick(Math.max(28, far * 0.7), 20)) return false; // ashen: mid
    this.campSites = [sites[1], sites[2], sites[0]];

    this.flatten(bx - 2, bz - 2, 5);
    for (const s of this.campSites) {
      for (let dz = -2; dz <= 2; dz++) for (let dx = -2; dx <= 2; dx++) {
        const i = (s.z + dz) * N + s.x + dx;
        if (this.type[i] === T.Forest) this.type[i] = T.Grass;
      }
      this.flatten(s.x - 1, s.z - 1, 3);
    }
    return true;
  }

  bfs(sx: number, sz: number) {
    const dist = new Int32Array(N * N).fill(-1);
    const q = new Int32Array(N * N);
    let qh = 0, qt = 0;
    dist[sz * N + sx] = 0; q[qt++] = sz * N + sx;
    while (qh < qt) {
      const i = q[qh++], x = i % N, z = (i / N) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (!this.isWalk(nx, nz)) continue;
        const ni = nz * N + nx;
        if (dist[ni] >= 0) continue;
        dist[ni] = dist[i] + 1; q[qt++] = ni;
      }
    }
    return dist;
  }

  /** Flatten an s×s tile footprint to its average height. Returns changed corners. */
  flatten(x: number, z: number, s: number): [number, number][] {
    const W = N + 1;
    let sum = 0, n = 0;
    for (let j = z; j <= z + s; j++) for (let i = x; i <= x + s; i++) { sum += this.h[j * W + i]; n++; }
    const avg = +Math.max(0.1, sum / n).toFixed(3);
    const out: [number, number][] = [];
    for (let j = z; j <= z + s; j++) for (let i = x; i <= x + s; i++) {
      this.h[j * W + i] = avg; out.push([j * W + i, avg]);
    }
    return out;
  }
}
