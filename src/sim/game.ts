import {
  BASE_STORAGE, BEAUTY_FULL, BEAUTY_RADIUS, BLIGHT_RADIUS, BUILDINGS, GATE_MIN_CAMP_DIST, BuildingId, CAMPS, Cost, GOOD_IDS, Good, MERCHANTS,
  ROAD_COST, UNITS, WAREHOUSE_STORAGE,
} from './defs';
import { Building, CampState, Entity, GameEvent, GameState, ORDER } from './state';
import { N, T, World, mulberry32 } from './world';
import { tickEconomy } from './economy';
import { tickTrade } from './trade';
import { tickCombat } from './combat';
import { tickQuests } from './quests';
import { nearestWalk } from './path';

export const SAVE_VERSION = 4;

export interface PlaceCheck { ok: boolean; reason?: string }

export class Game {
  world: World;
  state: GameState;
  events: GameEvent[] = [];
  occ = new Int32Array(N * N);
  road = new Uint8Array(N * N);
  roadNet = new Uint8Array(N * N); // road tiles connected to the Keep
  blight = new Uint8Array(N * N);
  byId = new Map<number, Building>();
  entById = new Map<number, Entity>();
  netDirty = true;
  roadVer = 0;
  terrainVer = 0;
  treeVer = 0;
  rand: () => number;
  private questT = 0;
  /** Per-minute flows of each good, refreshed every tick (for the UI). */
  rates = {} as Record<Good, { prod: number; cons: number }>;
  ledger = { taxes: 0, buildings: 0, army: 0 };
  spireCd = new Map<number, number>();

  constructor(state: GameState) {
    this.state = state;
    state.qdone ??= [];
    this.world = new World(state.seed);
    this.rand = mulberry32((state.seed ^ 0x9e3779b9) + Math.floor(state.time * 10));
    const W = this.world;
    for (const k in state.tiles) W.type[+k] = state.tiles[k];
    for (const g of GOOD_IDS) this.rates[g] = { prod: 0, cons: 0 };
    for (const [i, h] of state.flat) W.h[i] = h;
    for (const b of state.buildings) this.stamp(b, b.id);
    for (const i of state.roads) this.road[i] = 1;
    for (const e of state.entities) this.entById.set(e.id, e);
    this.recomputeBlight();
  }

  static create(seed: number, difficulty = 1): Game {
    const stock = {} as Record<Good, number>;
    for (const g of GOOD_IDS) stock[g] = 0;
    Object.assign(stock, { wood: 50, planks: 10, stone: 10, fish: 20 });
    const state: GameState = {
      version: SAVE_VERSION, seed, time: 0, gold: 900, income: 0, stock,
      buildings: [], roads: [], tiles: {}, flat: [], nextId: 1,
      pop: 0, peakPop: 0, jobs: 0, workEff: 1, happiness: 1, needSat: { fish: 1, bread: 1, cloth: 1 },
      autoUpgrade: true,
      ships: MERCHANTS.map((_, i) => ({ merchant: i, phase: 'away' as const, t: 20 + i * 45, stock: {} })),
      orders: {}, rep: MERCHANTS.map(() => 0),
      entities: [], projectiles: [],
      camps: CAMPS.map(() => ({ alive: true, entId: 0, respawn: 40, well: 90 }) as CampState),
      raidTimer: 0, raidCount: 0, gateDown: 0, trainQ: [], trainT: 0, quest: 0, qdone: [],
      difficulty, nodes: [], contracts: [], contractT: 90,
      stats: { trades: 0, kills: 0, trained: 0, visitedDark: false, t2: 0, t3: 0, contracts: 0, harvested: 0 },
      won: false,
    };
    const g = new Game(state);
    const s = g.world.start;
    g.addBuilding('townhall', s.x - 1, s.z - 1);
    // Dark strongholds and their guards
    CAMPS.forEach((cd, ci) => {
      const site = g.world.campSites[ci];
      const camp = g.spawn('camp', 1, site.x + 0.5, site.z + 0.5, ci);
      camp.hp = cd.hp;
      state.camps[ci].entId = camp.id;
      cd.guards.forEach((k, gi) => {
        const a = (gi / cd.guards.length) * Math.PI * 2;
        g.spawnNear(k, 1, site.x + 0.5 + Math.cos(a) * 2.6, site.z + 0.5 + Math.sin(a) * 2.6, ci);
      });
    });
    // Shard crystals scattered over the dark island, away from home and from each other
    const W = g.world;
    for (let tries = 0; tries < 4000 && state.nodes.length < 10; tries++) {
      const x = 3 + Math.floor(g.rand() * (N - 6)), z = 3 + Math.floor(g.rand() * (N - 6));
      if (!W.isWalk(x, z) || Math.hypot(x - s.x, z - s.z) < 11) continue;
      if (W.campSites.some((c) => Math.hypot(c.x - x, c.z - z) < 4.5)) continue;
      if (state.nodes.some((n) => Math.hypot(n.x - x, n.z - z) < 9)) continue;
      state.nodes.push({ x: x + 0.5, z: z + 0.5, ready: true, t: 0, prog: 0 });
    }
    g.recomputeBlight();
    return g;
  }

  serialize(): string { return JSON.stringify(this.state); }
  static load(json: string): Game | null {
    try {
      const st = JSON.parse(json) as GameState;
      if (st.version !== SAVE_VERSION) return null;
      return new Game(st);
    } catch { return null; }
  }

  toast(msg: string, kind: 'info' | 'warn' | 'good' = 'info') { this.events.push({ t: 'toast', msg, kind }); }

  // ---------- helpers ----------
  private stamp(b: Building, v: number) {
    const s = BUILDINGS[b.type].size;
    for (let dz = 0; dz < s; dz++) for (let dx = 0; dx < s; dx++) this.occ[(b.z + dz) * N + b.x + dx] = v;
    if (v) this.byId.set(b.id, b); else this.byId.delete(b.id);
  }
  center(b: Building) { const s = BUILDINGS[b.type].size; return { x: b.x + s / 2, z: b.z + s / 2 }; }
  count(type: BuildingId) { let n = 0; for (const b of this.state.buildings) if (b.type === type) n++; return n; }
  find(type: BuildingId) { return this.state.buildings.find((b) => b.type === type); }
  storageCap() { return BASE_STORAGE + WAREHOUSE_STORAGE * this.state.buildings.filter((b) => b.type === 'warehouse' && b.connected).length; }
  canAfford(gold: number, cost: Cost) {
    if (this.state.gold < gold) return false;
    for (const k in cost) if (this.state.stock[k as Good] < cost[k as Good]!) return false;
    return true;
  }
  pay(gold: number, cost: Cost) {
    this.state.gold -= gold;
    for (const k in cost) this.state.stock[k as Good] -= cost[k as Good]!;
  }
  addGood(g: Good, n: number) {
    const s = this.state.stock;
    s[g] = Math.min(Math.max(this.storageCap(), s[g]), s[g] + n);
  }
  unlocked(type: BuildingId) {
    const d = BUILDINGS[type];
    return this.state.peakPop >= d.unlockPop && (!d.requires || !!this.find(d.requires));
  }

  recomputeBlight() {
    this.blight.fill(0);
    this.state.camps.forEach((c, ci) => {
      if (!c.alive) return;
      const s = this.world.campSites[ci];
      for (let dz = -BLIGHT_RADIUS; dz <= BLIGHT_RADIUS; dz++) for (let dx = -BLIGHT_RADIUS; dx <= BLIGHT_RADIUS; dx++) {
        if (dx * dx + dz * dz > BLIGHT_RADIUS * BLIGHT_RADIUS) continue;
        if (this.world.inb(s.x + dx, s.z + dz)) this.blight[(s.z + dz) * N + s.x + dx] = 1;
      }
    });
    this.terrainVer++;
  }

  // ---------- building ----------
  resEfficiency(type: BuildingId, x: number, z: number): number {
    const d = BUILDINGS[type], W = this.world, c = d.size / 2;
    if (d.needs === 'forest') {
      let n = 0;
      for (let dz = -5; dz < d.size + 5; dz++) for (let dx = -5; dx < d.size + 5; dx++) {
        if (dx >= 0 && dz >= 0 && dx < d.size && dz < d.size) continue;
        const tx = x + dx, tz = z + dz;
        if (!W.inb(tx, tz) || Math.hypot(dx + 0.5 - c, dz + 0.5 - c) > 4.8) continue;
        if (W.type[tz * N + tx] === T.Forest) n++;
      }
      return n < 3 ? 0 : Math.min(1, n / 12);
    }
    if (d.needs === 'rock') {
      for (let dz = -3; dz < d.size + 3; dz++) for (let dx = -3; dx < d.size + 3; dx++) {
        const tx = x + dx, tz = z + dz;
        if (W.inb(tx, tz) && W.type[tz * N + tx] === T.Rock) return 1;
      }
      return 0;
    }
    if (d.needs === 'coast') {
      for (let dz = -1; dz <= d.size; dz++) for (let dx = -1; dx <= d.size; dx++) {
        const tx = x + dx, tz = z + dz;
        if (W.inb(tx, tz) && W.type[tz * N + tx] === T.Water) return 1;
      }
      return 0;
    }
    return 1;
  }

  tileFree(x: number, z: number): string | null {
    if (!this.world.inb(x, z)) return 'Out of bounds';
    const i = z * N + x, t = this.world.type[i];
    if (t === T.Water) return 'Cannot build on water';
    if (t === T.Rock) return 'Cannot build on mountains';
    if (this.occ[i] || this.road[i]) return 'Tile is occupied';
    if (this.blight[i]) return 'The land is blighted — destroy the stronghold in the Dark World';
    return null;
  }

  canPlace(type: BuildingId, x: number, z: number): PlaceCheck {
    const d = BUILDINGS[type];
    for (let dz = 0; dz < d.size; dz++) for (let dx = 0; dx < d.size; dx++) {
      const r = this.tileFree(x + dx, z + dz);
      if (r) return { ok: false, reason: r };
    }
    if (d.unique && this.find(type)) return { ok: false, reason: `Only one ${d.name} allowed` };
    if (type === 'gate') {
      for (let ci = 0; ci < this.state.camps.length; ci++) {
        const c = this.world.campSites[ci];
        if (this.state.camps[ci].alive && Math.hypot(c.x - (x + 1), c.z - (z + 1)) < GATE_MIN_CAMP_DIST) return { ok: false, reason: 'Too close to a dark stronghold — the Rift would open under its guards' };
      }
    }
    if (d.needs && this.resEfficiency(type, x, z) <= 0) {
      return { ok: false, reason: d.needs === 'coast' ? 'Must be on the coast' : d.needs === 'rock' ? 'Must be near mountains' : 'Needs forest nearby' };
    }
    return { ok: true };
  }

  private addBuilding(type: BuildingId, x: number, z: number): Building {
    const d = BUILDINGS[type], S = this.state, W = this.world;
    for (let dz = 0; dz < d.size; dz++) for (let dx = 0; dx < d.size; dx++) this.clearForest(x + dx, z + dz);
    S.flat.push(...W.flatten(x, z, d.size));
    const b: Building = { id: S.nextId++, type, x, z, progress: 0, status: 'ok', connected: type === 'townhall', resEff: this.resEfficiency(type, x, z) };
    if (type === 'house') { b.tier = 0; b.residents = 0; b.sat = 1; b.upT = 0; b.cov = {}; }
    if (type === 'spire') b.fuel = 0;
    S.buildings.push(b);
    this.stamp(b, b.id);
    this.netDirty = true; this.terrainVer++;
    if (type === 'gate') {
      const c = this.center(b);
      this.spawn('gate', 0, c.x, c.z, -1);
      S.raidTimer = 200;
      this.toast('The Rift Gate hums awake. Something on the other side has noticed.', 'warn');
    }
    this.events.push({ t: 'built', id: b.id });
    return b;
  }

  private clearForest(x: number, z: number) {
    const i = z * N + x;
    if (this.world.type[i] === T.Forest) {
      this.world.type[i] = T.Grass; this.state.tiles[i] = T.Grass; this.treeVer++;
      this.refreshWoodcutters();
    }
  }
  private refreshWoodcutters() {
    for (const b of this.state.buildings) if (b.type === 'woodcutter') b.resEff = this.resEfficiency('woodcutter', b.x, b.z);
  }
  /** Forester: grow a tree on a free grass tile near the building. Returns false if no room. */
  plantNear(b: Building): boolean {
    const c = this.center(b), spots: number[] = [];
    for (let dz = -5; dz <= 5; dz++) for (let dx = -5; dx <= 5; dx++) {
      const x = Math.floor(c.x) + dx, z = Math.floor(c.z) + dz;
      if (!this.world.inb(x, z) || Math.hypot(x + 0.5 - c.x, z + 0.5 - c.z) > 5) continue;
      const i = z * N + x;
      if (this.world.type[i] !== T.Grass || this.occ[i] || this.road[i] || this.blight[i]) continue;
      // leave a one-tile margin around roads and buildings so the town can still breathe
      let near = false;
      for (const [ax, az] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const j = (z + az) * N + x + ax; if (this.world.inb(x + ax, z + az) && (this.occ[j] || this.road[j])) near = true; }
      if (!near) spots.push(i);
    }
    if (!spots.length) return false;
    const i = spots[Math.floor(this.rand() * spots.length)];
    this.world.type[i] = T.Forest; this.state.tiles[i] = T.Forest; this.treeVer++;
    this.refreshWoodcutters();
    return true;
  }

  place(type: BuildingId, x: number, z: number): PlaceCheck {
    const d = BUILDINGS[type];
    if (!this.unlocked(type)) return { ok: false, reason: 'Not unlocked yet' };
    const c = this.canPlace(type, x, z);
    if (!c.ok) return c;
    if (!this.canAfford(d.gold, d.cost)) return { ok: false, reason: 'Not enough resources' };
    this.pay(d.gold, d.cost);
    this.addBuilding(type, x, z);
    return { ok: true };
  }

  placeRoad(x: number, z: number): PlaceCheck {
    const r = this.tileFree(x, z);
    if (r) return { ok: false, reason: r };
    if (this.state.gold < ROAD_COST) return { ok: false, reason: 'Not enough gold' };
    this.state.gold -= ROAD_COST;
    this.clearForest(x, z);
    this.road[z * N + x] = 1; this.state.roads.push(z * N + x);
    this.netDirty = true; this.roadVer++;
    return { ok: true };
  }

  demolishAt(x: number, z: number): boolean {
    if (!this.world.inb(x, z)) return false;
    const i = z * N + x;
    if (this.road[i]) {
      this.road[i] = 0; this.state.roads.splice(this.state.roads.indexOf(i), 1);
      this.netDirty = true; this.roadVer++;
      return true;
    }
    const b = this.byId.get(this.occ[i]);
    return b ? this.demolish(b.id) : false;
  }

  demolish(id: number): boolean {
    const b = this.byId.get(id);
    if (!b || b.type === 'townhall') return false;
    if (b.type === 'gate') { this.toast('The Rift Gate cannot be unmade.', 'warn'); return false; }
    this.state.gold += Math.floor(BUILDINGS[b.type].gold / 2);
    this.stamp(b, 0);
    this.state.buildings.splice(this.state.buildings.indexOf(b), 1);
    this.netDirty = true;
    this.events.push({ t: 'removed', id });
    return true;
  }

  /** Recompute road network connectivity and service coverage. */
  recomputeNet() {
    this.netDirty = false;
    const net = this.roadNet; net.fill(0);
    const th = this.find('townhall');
    const q: number[] = [];
    const seed = (b: Building) => {
      const s = BUILDINGS[b.type].size;
      for (let k = 0; k < s; k++) {
        for (const [x, z] of [[b.x + k, b.z - 1], [b.x + k, b.z + s], [b.x - 1, b.z + k], [b.x + s, b.z + k]]) {
          if (this.world.inb(x, z) && this.road[z * N + x] && !net[z * N + x]) { net[z * N + x] = 1; q.push(z * N + x); }
        }
      }
    };
    if (th) seed(th);
    while (q.length) {
      const i = q.pop()!, x = i % N, z = (i / N) | 0;
      for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, nz = z + dz;
        if (!this.world.inb(nx, nz)) continue;
        const ni = nz * N + nx;
        if (this.road[ni] && !net[ni]) { net[ni] = 1; q.push(ni); }
      }
    }
    for (const b of this.state.buildings) {
      if (b.type === 'townhall') { b.connected = true; continue; }
      const s = BUILDINGS[b.type].size;
      let c = false;
      for (let k = 0; k < s && !c; k++) {
        for (const [x, z] of [[b.x + k, b.z - 1], [b.x + k, b.z + s], [b.x - 1, b.z + k], [b.x + s, b.z + k]]) {
          if (this.world.inb(x, z) && net[z * N + x]) { c = true; break; }
        }
      }
      b.connected = c;
    }
    this.recomputeCoverage();
  }

  recomputeCoverage() {
    const services = this.state.buildings.filter((b) => BUILDINGS[b.type].radius && b.connected && (b.type !== 'spire' || (b.fuel ?? 0) > 0));
    const decor = this.state.buildings.filter((b) => BUILDINGS[b.type].beauty);
    for (const h of this.state.buildings) {
      if (h.type !== 'house') continue;
      const hc = this.center(h); h.cov = {};
      let charm = 0;
      for (const o of decor) { const c = this.center(o); if (Math.hypot(c.x - hc.x, c.z - hc.z) <= BEAUTY_RADIUS) charm += BUILDINGS[o.type].beauty!; }
      h.beauty = Math.min(1, charm / BEAUTY_FULL);
      for (const sv of services) {
        const c = this.center(sv);
        if (Math.hypot(c.x - hc.x, c.z - hc.z) <= BUILDINGS[sv.type].radius!) h.cov[sv.type] = true;
      }
    }
  }

  // ---------- entities ----------
  spawn(kind: Entity['kind'], team: number, x: number, z: number, camp: number): Entity {
    const e: Entity = {
      id: this.state.nextId++, kind, team, x, z, hp: UNITS[kind].hp, cd: this.rand(), think: this.rand() * 0.3,
      tgt: 0, order: ORDER.Idle, ox: x, oz: z, path: null, pi: 0, repath: 0, gx: 0, gz: 0, hx: x, hz: z, camp, face: 0,
    };
    this.state.entities.push(e); this.entById.set(e.id, e);
    return e;
  }
  spawnNear(kind: Entity['kind'], team: number, x: number, z: number, camp: number): Entity {
    for (let i = 0; i < 20; i++) {
      const px = x + (i ? (this.rand() - 0.5) * (1 + i * 0.3) : 0), pz = z + (i ? (this.rand() - 0.5) * (1 + i * 0.3) : 0);
      if (this.world.isWalk(Math.floor(px), Math.floor(pz))) return this.spawn(kind, team, px, pz, camp);
    }
    // hemmed in by rock or water: fall back to the closest ground there is
    const p = nearestWalk(this.world, x, z);
    return this.spawn(kind, team, p.x, p.z, camp);
  }
  gateEnt() { return this.state.entities.find((e) => e.kind === 'gate'); }

  // ---------- main tick ----------
  tick(dt: number) {
    const S = this.state;
    S.time += dt;
    if (this.netDirty) this.recomputeNet();
    tickEconomy(this, dt);
    tickTrade(this, dt);
    tickCombat(this, dt);
    this.questT -= dt;
    if (this.questT <= 0) { this.questT = 1; tickQuests(this); }
  }
}
