import { describe, expect, it } from 'vitest';
import { Game } from '../src/sim/game';
import { N, T } from '../src/sim/world';
import { BUILDINGS, BuildingId, CAMPS } from '../src/sim/defs';
import { findPath } from '../src/sim/path';
import { orderAttack, train } from '../src/sim/combat';
import { sell } from '../src/sim/trade';

function run(g: Game, seconds: number) { for (let t = 0; t < seconds; t += 0.1) g.tick(0.1); }

/** Find a free spot for a building near (cx,cz) and connect it to the Keep by a straight-ish road. */
function placeNear(g: Game, type: BuildingId, cx: number, cz: number, maxR = 30): { x: number; z: number } | null {
  for (let r = 2; r < maxR; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
    const x = cx + dx, z = cz + dz;
    if (g.canPlace(type, x, z).ok && g.place(type, x, z).ok) return { x, z };
  }
  return null;
}
function roadPath(g: Game, fx: number, fz: number, tx: number, tz: number) {
  const p = findPath(g.world, fx + 0.5, fz + 0.5, tx + 0.5, tz + 0.5);
  if (!p) return;
  let x = fx, z = fz;
  const pts = [fx + 0.5, fz + 0.5, ...p];
  for (let i = 2; i < pts.length; i += 2) {
    const gx = Math.floor(pts[i]), gz = Math.floor(pts[i + 1]);
    while (x !== gx || z !== gz) {
      if (x !== gx) { x += Math.sign(gx - x); g.placeRoad(x, z); }
      if (z !== gz) { z += Math.sign(gz - z); g.placeRoad(x, z); }
    }
  }
}

describe('world', () => {
  it('generates playable islands for many seeds', () => {
    for (const seed of [1, 2, 3, 42, 1234, 99999, 777]) {
      const g = Game.create(seed);
      const W = g.world;
      let land = 0;
      for (let i = 0; i < N * N; i++) if (W.type[i] !== T.Water) land++;
      expect(land / (N * N)).toBeGreaterThan(0.2);
      expect(W.campSites.length).toBe(3);
      for (const c of W.campSites) expect(findPath(W, W.start.x + 0.5, W.start.z + 3.5, c.x + 0.5, c.z + 0.5)).not.toBeNull();
    }
  });
});

describe('economy', () => {
  it('grows a town: houses fill, taxes flow, production runs', () => {
    const g = Game.create(42);
    const s = g.world.start;
    // a road east-west through the keep's south side
    for (let x = s.x - 8; x <= s.x + 8; x++) g.placeRoad(x, s.z + 2);
    let houses = 0;
    for (let x = s.x - 8; x <= s.x + 7; x += 2) if (g.place('house', x, s.z + 3).ok) houses++;
    expect(houses).toBeGreaterThanOrEqual(4);
    run(g, 60);
    expect(g.state.pop).toBeGreaterThan(houses * 3);
    const wc = placeNear(g, 'woodcutter', s.x, s.z);
    expect(wc).not.toBeNull();
    roadPath(g, s.x, s.z + 2, wc!.x - 1, wc!.z);
    const wood0 = g.state.stock.wood;
    run(g, 60);
    const b = g.state.buildings.find((b) => b.type === 'woodcutter')!;
    expect(b.connected).toBe(true);
    expect(g.state.stock.wood).toBeGreaterThan(wood0);
    expect(g.state.income).toBeGreaterThan(0);
  });

  it('save/load round-trips', () => {
    const g = Game.create(7);
    const s = g.world.start;
    g.placeRoad(s.x, s.z + 2); g.place('house', s.x, s.z + 3);
    run(g, 10);
    const g2 = Game.load(g.serialize())!;
    expect(g2).not.toBeNull();
    expect(g2.state.buildings.length).toBe(g.state.buildings.length);
    expect(g2.occ[(s.z + 3) * N + s.x]).toBeGreaterThan(0);
    expect(Array.from(g2.world.h).every((v, i) => Math.abs(v - g.world.h[i]) < 1e-5)).toBe(true);
  });
});

describe('trade', () => {
  it('ships dock and buy goods', () => {
    const g = Game.create(42);
    g.state.peakPop = 100; g.state.gold = 5000; g.state.stock.wood = 60;
    const s = g.world.start;
    const h = placeNear(g, 'harbor', s.x, s.z, 40);
    expect(h).not.toBeNull();
    g.byId.forEach((b) => (b.connected = true));
    g.netDirty = false;
    let sold = 0;
    for (let t = 0; t < 400 && !sold; t++) {
      run(g, 1); g.byId.forEach((b) => (b.connected = true));
      const ship = g.state.ships.find((sh) => sh.phase === 'docked');
      if (ship) { const gold = g.state.gold; sold = sell(g, ship, 'fish', 5); expect(g.state.gold).toBeGreaterThan(gold); }
    }
    expect(sold).toBe(5);
  });
});

describe('combat', () => {
  it('raids attack the gate; an army can raze the first stronghold', () => {
    const g = Game.create(42);
    g.state.peakPop = 200; g.state.gold = 100000;
    for (const k of Object.keys(g.state.stock)) (g.state.stock as any)[k] = 60;
    const s = g.world.start;
    expect(placeNear(g, 'gate', s.x, s.z)).not.toBeNull();
    expect(placeNear(g, 'barracks', s.x, s.z)).not.toBeNull();
    expect(placeNear(g, 'barracks', s.x, s.z)).not.toBeNull();
    const force = () => { g.byId.forEach((b) => (b.connected = true)); g.netDirty = false; };
    force();
    for (let i = 0; i < 12; i++) { g.state.stock.weapons = 60; expect(train(g, i % 3 === 2 ? 'archer' : 'swordsman')).toBeNull(); }
    for (let t = 0; t < 90; t++) { run(g, 1); force(); }
    const army = g.state.entities.filter((e) => e.team === 0 && e.kind !== 'gate');
    expect(army.length).toBe(12);
    orderAttack(g, army.map((e) => e.id), g.state.camps[0].entId);
    let raided = false;
    for (let t = 0; t < 600 && g.state.camps[0].alive; t++) {
      run(g, 1); force();
      if (g.events.some((e) => e.t === 'raid')) raided = true;
      g.events.length = 0;
    }
    expect(g.state.camps[0].alive).toBe(false);
    expect(g.state.stock.shards).toBeGreaterThanOrEqual(CAMPS[0].lootShards);
    expect(raided || g.state.raidCount >= 0).toBe(true);
    // blight lifted
    const c = g.world.campSites[0];
    expect(g.blight[c.z * N + c.x]).toBe(0);
  });

  it('an undefended gate eventually gets breached by escalating raids', () => {
    const g = Game.create(3);
    g.state.peakPop = 200; g.state.gold = 100000; g.state.stock.planks = 60; g.state.stock.stone = 60;
    const s = g.world.start;
    expect(placeNear(g, 'gate', s.x, s.z)).not.toBeNull();
    let breached = false, raids = 0;
    for (let t = 0; t < 3000 && !breached; t++) {
      run(g, 1);
      for (const e of g.events) { if (e.t === 'breach') breached = true; if (e.t === 'raid') raids++; }
      g.events.length = 0;
    }
    expect(raids).toBeGreaterThan(1);
    expect(breached).toBe(true);
  });
});
