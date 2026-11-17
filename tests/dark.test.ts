import { describe, expect, it } from 'vitest';
import { Game } from '../src/sim/game';
import { ABILITIES, BURST_DMG, GATE_MIN_LAIR_DIST, RELIC_IDS, UNITS } from '../src/sim/defs';
import { canCast, cast, computeVision, isExplored, isVisible, maxHp } from '../src/sim/dark';
import { orderAttack, orderMove } from '../src/sim/combat';
import { ORDER } from '../src/sim/state';
import { N } from '../src/sim/world';
import { invariants } from './helpers';

function run(g: Game, seconds: number) { for (let t = 0; t < seconds; t += 0.1) { g.state.buildings.forEach((b) => (b.connected = true)); g.netDirty = false; g.tick(0.1); } }
/** A game with a gate up, plenty of everything, and no raids. Creatures stay where the test needs them. */
function setup(seed = 2024, keepLairs = false) {
  const g = Game.create(seed, 0);
  const S = g.state, s = g.world.start;
  S.peakPop = 300; S.gold = 50000;
  for (const k in S.stock) (S.stock as Record<string, number>)[k] = 60;
  if (!keepLairs) { S.entities = S.entities.filter((e) => e.lair === undefined); g.entById.clear(); for (const e of S.entities) g.entById.set(e.id, e); S.lairs = []; }
  let ok = false;
  for (let r = 3; r < 30 && !ok; r++) for (let dz = -r; dz <= r && !ok; dz++) for (let dx = -r; dx <= r && !ok; dx++) if (g.place('gate', s.x + dx, s.z + dz).ok) ok = true;
  expect(ok).toBe(true);
  run(g, 1);
  return g;
}
const still = (e: { order: number; ox: number; oz: number; x: number; z: number; hx: number; hz: number }) => { e.order = ORDER.Move; e.ox = e.x; e.oz = e.z; e.hx = e.x; e.hz = e.z; };

describe('darkness and light', () => {
  it('the dark island starts unexplored; soldiers light their surroundings and leave explored ground behind', () => {
    const g = setup();
    const ge = g.gateEnt()!;
    expect(isVisible(g, ge.x, ge.z)).toBe(true);
    const camp = g.world.campSites[2];
    expect(isExplored(g, camp.x, camp.z)).toBe(false);
    let lit = 0; for (let i = 0; i < N * N; i++) if (g.vis[i] === 2) lit++;
    expect(lit).toBeGreaterThan(100);
    expect(lit).toBeLessThan(N * N * 0.3);
    // a scout walks out and back
    const scout = g.spawnNear('swordsman', 0, ge.x + 2.5, ge.z, -1);
    const far = { x: ge.x + (ge.x < 40 ? 16 : -16), z: ge.z };
    orderMove(g, [scout.id], far.x, far.z);
    run(g, 14);
    expect(isVisible(g, scout.x, scout.z)).toBe(true);
    const seenAt = { x: scout.x, z: scout.z };
    orderMove(g, [scout.id], ge.x + 2.5, ge.z);
    run(g, 16);
    if (Math.hypot(seenAt.x - ge.x, seenAt.z - ge.z) > 12) {
      expect(isVisible(g, seenAt.x, seenAt.z)).toBe(false);
      expect(isExplored(g, seenAt.x, seenAt.z)).toBe(true);
    }
  });
  it('explored ground survives save and load', () => {
    const g = setup();
    const explored = () => { let n = 0; for (let i = 0; i < N * N; i++) if (g.vis[i]) n++; return n; };
    const before = explored();
    const g2 = Game.load(g.serialize())!;
    let n = 0; for (let i = 0; i < N * N; i++) if (g2.vis[i]) n++;
    expect(n).toBe(before);
    computeVision(g2);
    expect(isVisible(g2, g2.gateEnt()!.x, g2.gateEnt()!.z)).toBe(true);
  });
});

describe('light powers', () => {
  it('Radiant Burst damages creatures in its circle, costs shards and goes on cooldown', () => {
    const g = setup();
    const ge = g.gateEnt()!;
    const a = g.spawnNear('brute', 1, ge.x + 4, ge.z, -1), b = g.spawnNear('brute', 1, ge.x + 5, ge.z + 1, -1), far = g.spawnNear('brute', 1, ge.x + 4, ge.z + 7, -1);
    [a, b, far].forEach(still);
    const shards = g.state.stock.shards;
    expect(cast(g, 'burst', ge.x + 4.5, ge.z + 0.5)).toBeNull();
    expect(a.hp).toBe(UNITS.brute.hp - BURST_DMG);
    expect(b.hp).toBe(UNITS.brute.hp - BURST_DMG);
    expect(far.hp).toBe(UNITS.brute.hp);
    expect(g.state.stock.shards).toBe(shards - ABILITIES.burst.shards);
    expect(canCast(g, 'burst')).toMatch(/recharging/);
    run(g, ABILITIES.burst.cd + 1);
    expect(canCast(g, 'burst')).toBeNull();
  });
  it('powers cannot be cast into the unlit dark or without shards', () => {
    const g = setup();
    const camp = g.world.campSites[2];
    expect(cast(g, 'burst', camp.x, camp.z)).toMatch(/light does not reach/);
    g.state.stock.shards = 0;
    const ge = g.gateEnt()!;
    expect(cast(g, 'mend', ge.x, ge.z)).toMatch(/Shard/);
    expect(g.state.stats.casts).toBe(0);
  });
  it('Mending Light heals soldiers in its circle', () => {
    const g = setup();
    const ge = g.gateEnt()!;
    const u = g.spawnNear('knight', 0, ge.x + 8, ge.z + 8, -1);
    u.hp = 20; computeVision(g);
    expect(cast(g, 'mend', u.x, u.z)).toBeNull();
    expect(u.hp).toBeCloseTo(20 + UNITS.knight.hp * 0.6, 3);
  });
  it('Rallying Cry makes soldiers faster for a while', () => {
    const dist = (rally: boolean) => {
      const g = setup();
      const ge = g.gateEnt()!;
      const u = g.spawnNear('swordsman', 0, ge.x + 2.5, ge.z + 2.5, -1);
      const x0 = u.x, z0 = u.z;
      if (rally) expect(cast(g, 'rally')).toBeNull();
      orderMove(g, [u.id], g.world.start.x, g.world.start.z + 4);
      run(g, 2);
      return Math.hypot(u.x - x0, u.z - z0);
    };
    const plain = dist(false), fast = dist(true);
    expect(plain).toBeGreaterThan(1);
    expect(fast).toBeGreaterThan(plain * 1.15);
  });
});

describe('lairs and relics', () => {
  it('every island has lairs, each with a different relic, none too close to the start', () => {
    for (const seed of [2024, 1, 7, 42, 99]) {
      const g = Game.create(seed);
      const L = g.state.lairs, s = g.world.start;
      expect(L.length).toBeGreaterThanOrEqual(2);
      expect(new Set(L.map((l) => l.relic)).size).toBe(L.length);
      for (const l of L) { expect(RELIC_IDS).toContain(l.relic); expect(Math.hypot(l.x - s.x, l.z - s.z)).toBeGreaterThan(12); }
      expect(invariants(g)).toEqual([]);
    }
  });
  it('destroying a lair grants its relic, and the relic changes the army', () => {
    const g = setup(2024, true);
    const S = g.state, L = S.lairs[0], ge = g.gateEnt()!;
    S.lairs[0].relic = 'aegis';
    const army = Array.from({ length: 10 }, (_, i) => g.spawnNear(i % 3 === 2 ? 'archer' : 'swordsman', 0, ge.x + 2.5 + (i % 3) * 0.6, ge.z + i * 0.3, -1));
    const hp0 = maxHp(g, army[0]);
    orderAttack(g, army.map((e) => e.id), L.entId);
    for (let t = 0; t < 240 && L.alive; t++) run(g, 1);
    expect(L.alive).toBe(false);
    expect(S.relics).toEqual(['aegis']);
    expect(S.stats.lairs).toBe(1);
    const survivor = S.entities.find((e) => e.team === 0 && e.kind !== 'gate')!;
    expect(survivor).toBeTruthy();
    expect(maxHp(g, survivor)).toBeCloseTo(UNITS[survivor.kind].hp * 1.2, 3);
    expect(hp0).toBe(UNITS.swordsman.hp);
    expect(invariants(g)).toEqual([]);
  });
  it('a gate cannot be raised next to a lair', () => {
    const g = Game.create(2024);
    g.state.peakPop = 300;
    const L = g.state.lairs[0];
    let refused = 0, allowed = 0;
    for (let dz = -20; dz <= 20; dz++) for (let dx = -20; dx <= 20; dx++) {
      const x = Math.floor(L.x) + dx, z = Math.floor(L.z) + dz, r = g.canPlace('gate', x, z);
      const d = Math.hypot(L.x - (x + 1.5), L.z - (z + 1.5));
      if (r.ok) { allowed++; expect(d).toBeGreaterThanOrEqual(GATE_MIN_LAIR_DIST); }
      else if (/lair/.test(r.reason ?? '')) refused++;
    }
    expect(refused).toBeGreaterThan(0);
  });
});

describe('new creatures', () => {
  it('a wraith goes for the archer behind the swordsman', () => {
    const g = setup();
    const ge = g.gateEnt()!, s = g.world.start;
    const x = s.x + 0.5, z = s.z + 5.5;
    const sword = g.spawnNear('swordsman', 0, x + 3, z, -1), archer = g.spawnNear('archer', 0, x, z, -1);
    [sword, archer].forEach(still);
    const w = g.spawnNear('wraith', 1, x + 6, z, -1);
    run(g, 0.6);
    expect(w.tgt).toBe(archer.id);
    expect(ge).toBeTruthy();
  });
  it('a warlock mends wounded creatures near it', () => {
    const g = setup();
    const s = g.world.start;
    const lock = g.spawnNear('warlock', 1, s.x + 0.5, s.z + 6.5, -1), brute = g.spawnNear('brute', 1, s.x + 2.5, s.z + 6.5, -1);
    [lock, brute].forEach(still);
    brute.hp = 100;
    run(g, 5);
    expect(brute.hp).toBeGreaterThanOrEqual(145);
  });
});
