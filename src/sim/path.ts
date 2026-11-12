import { N, World } from './world';

const SQ2 = Math.SQRT2;

/** Straight-line walkability check between two world positions. */
export function los(w: World, ax: number, az: number, bx: number, bz: number) {
  const d = Math.hypot(bx - ax, bz - az);
  const steps = Math.ceil(d / 0.35);
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    if (!w.isWalk(Math.floor(ax + (bx - ax) * t), Math.floor(az + (bz - az) * t))) return false;
  }
  return true;
}

/** A* over walkable tiles. Returns flat [x,z,...] world waypoints (smoothed), or null. */
export function findPath(w: World, sx: number, sz: number, tx: number, tz: number): number[] | null {
  const s0x = Math.floor(sx), s0z = Math.floor(sz);
  let gx = Math.floor(tx), gz = Math.floor(tz);
  if (!w.isWalk(gx, gz)) {
    // nearest walkable tile to the goal
    let best = Infinity, fx = -1, fz = -1;
    for (let r = 1; r <= 6 && fx < 0; r++) {
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (!w.isWalk(gx + dx, gz + dz)) continue;
        const d = dx * dx + dz * dz;
        if (d < best) { best = d; fx = gx + dx; fz = gz + dz; }
      }
    }
    if (fx < 0) return null;
    gx = fx; gz = fz; tx = gx + 0.5; tz = gz + 0.5;
  }
  if (!w.isWalk(s0x, s0z)) return [tx, tz];
  const start = s0z * N + s0x, goal = gz * N + gx;
  if (start === goal) return [tx, tz];

  const g = new Float32Array(N * N).fill(Infinity);
  const came = new Int32Array(N * N).fill(-1);
  const closed = new Uint8Array(N * N);
  const heap: number[] = [];
  const f = new Float32Array(N * N);
  const push = (i: number) => {
    heap.push(i);
    let c = heap.length - 1;
    while (c > 0) {
      const p = (c - 1) >> 1;
      if (f[heap[p]] <= f[heap[c]]) break;
      [heap[p], heap[c]] = [heap[c], heap[p]]; c = p;
    }
  };
  const pop = () => {
    const top = heap[0], last = heap.pop()!;
    if (heap.length) {
      heap[0] = last;
      let p = 0;
      for (;;) {
        const l = p * 2 + 1, r = l + 1;
        let m = p;
        if (l < heap.length && f[heap[l]] < f[heap[m]]) m = l;
        if (r < heap.length && f[heap[r]] < f[heap[m]]) m = r;
        if (m === p) break;
        [heap[p], heap[m]] = [heap[m], heap[p]]; p = m;
      }
    }
    return top;
  };
  const hfn = (x: number, z: number) => {
    const dx = Math.abs(x - gx), dz = Math.abs(z - gz);
    return Math.max(dx, dz) + (SQ2 - 1) * Math.min(dx, dz);
  };
  g[start] = 0; f[start] = hfn(s0x, s0z); push(start);
  let found = false;
  while (heap.length) {
    const cur = pop();
    if (cur === goal) { found = true; break; }
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % N, cz = (cur / N) | 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      if (!dx && !dz) continue;
      const nx = cx + dx, nz = cz + dz;
      if (!w.isWalk(nx, nz)) continue;
      if (dx && dz && (!w.isWalk(cx + dx, cz) || !w.isWalk(cx, cz + dz))) continue;
      const ni = nz * N + nx;
      if (closed[ni]) continue;
      const ng = g[cur] + (dx && dz ? SQ2 : 1);
      if (ng < g[ni]) { g[ni] = ng; came[ni] = cur; f[ni] = ng + hfn(nx, nz); push(ni); }
    }
  }
  if (!found) return null;
  const pts: number[] = [];
  for (let i = goal; i !== start && i >= 0; i = came[i]) pts.push((i % N) + 0.5, ((i / N) | 0) + 0.5);
  // pts is reversed pairs [x,z] from goal back; rebuild forward
  const fwd: number[] = [];
  for (let i = pts.length - 2; i >= 0; i -= 2) fwd.push(pts[i], pts[i + 1]);
  fwd[fwd.length - 2] = tx; fwd[fwd.length - 1] = tz;
  // string-pull
  const out: number[] = [];
  let ax = sx, az = sz, i = 0;
  while (i < fwd.length) {
    let j = fwd.length - 2;
    while (j > i && !los(w, ax, az, fwd[j], fwd[j + 1])) j -= 2;
    out.push(fwd[j], fwd[j + 1]);
    ax = fwd[j]; az = fwd[j + 1]; i = j + 2;
  }
  return out;
}
