import { describe, expect, it } from 'vitest';
import { Game } from '../src/sim/game';
import { N, T } from '../src/sim/world';
import { BuildingId, UNITS } from '../src/sim/defs';
import { orderAttackMove, orderMove } from '../src/sim/combat';
import { canDeliver, deliver } from '../src/sim/trade';
import { ORDER } from '../src/sim/state';

function run(g: Game, seconds: number, keepConnected = true) {
  for (let t = 0; t < seconds; t += 0.1) {
    if (keepConnected) { g.state.buildings.forEach((b) => (b.connected = true)); g.netDirty = false; }
    g.tick(0.1);
  }
}
function rich(seed = 42, difficulty = 1) {
  const g = Game.create(seed, difficulty);
  g.state.peakPop = 300; g.state.gold = 50000;
  for (const k in g.state.stock) (g.state.stock as Record<string, number>)[k] = 60;
  return g;
}
function placeNear(g: Game, type: BuildingId, cx: number, cz: number) {
  for (let r = 1; r < 45; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
    if (g.canPlace(type, cx + dx, cz + dz).ok && g.place(type, cx + dx, cz + dz).ok) return g.state.buildings[g.state.buildings.length - 1];
  }
  throw new Error('no spot for ' + type);
}
const forest = (g: Game) => { let n = 0; for (let i = 0; i < N * N; i++) if (g.world.type[i] === T.Forest) n++; return n; };

describe('forester', () => {
  it('plants trees that survive save/load', () => {
    const g = rich();
    const s = g.world.start;
    for (let i = 0; i < 3; i++) placeNear(g, 'house', s.x, s.z + 4);
    run(g, 40); // residents move in, so the forester has workers
    placeNear(g, 'forester', s.x, s.z + 4);
    const before = forest(g);
    run(g, 120);
    expect(forest(g)).toBeGreaterThan(before + 3);
    const g2 = Game.load(g.serialize())!;
    expect(forest(g2)).toBe(forest(g));
  });
});

describe('charm', () => {
  it('ornaments near a home raise its taxes', () => {
    const tax = (withGardens: boolean) => {
      const g = rich();
      const s = g.world.start;
      const h = placeNear(g, 'house', s.x, s.z + 4);
      if (withGardens) for (let i = 0; i < 6; i++) placeNear(g, 'garden', h.x, h.z);
      g.recomputeNet();
      run(g, 60);
      return { taxes: g.ledger.taxes, beauty: h.beauty ?? 0 };
    };
    const a = tax(false), b = tax(true);
    expect(a.beauty).toBe(0);
    expect(b.beauty).toBe(1);
    expect(b.taxes).toBeGreaterThan(a.taxes * 1.15);
  });
});

describe('housing tiers', () => {
  it('homes climb from Settlers to Burghers to Luminaries when their needs are in reach', () => {
    const g = rich(2024);
    const S = g.state, s = g.world.start;
    const stocked = () => { for (const k in S.stock) (S.stock as Record<string, number>)[k] = Math.max((S.stock as Record<string, number>)[k], 40); };
    for (let x = s.x - 4; x <= s.x + 8; x++) g.placeRoad(x, s.z + 2);
    for (let x = s.x - 2; x <= s.x + 4; x += 2) expect(g.place('house', x, s.z + 3).ok).toBe(true);
    const houses = S.buildings.filter((b) => b.type === 'house');
    for (const t of ['market', 'chapel', 'spire'] as const) placeNear(g, t, s.x + 6, s.z + 5);
    for (let t = 0; t < 200; t++) { stocked(); run(g, 1); }
    expect(houses.every((h) => h.tier === 2)).toBe(true);
    expect(houses.every((h) => Math.floor(h.residents!) === 28)).toBe(true);
    // without shards the spire goes dark and Luminaries lose that need
    S.stock.shards = 0;
    for (let t = 0; t < 200; t++) { stocked(); S.stock.shards = 0; run(g, 1); }
    expect(g.find('spire')!.fuel).toBe(0);
    expect(houses[0].sat!).toBeLessThan(0.9);
    expect(Math.floor(houses[0].residents!)).toBeLessThan(28);
  });
});

describe('contracts', () => {
  it('merchants offer contracts that pay out on delivery', () => {
    const g = rich();
    const s = g.world.start;
    placeNear(g, 'harbor', s.x, s.z);
    placeNear(g, 'woodcutter', s.x, s.z);
    let delivered = false;
    for (let t = 0; t < 1500 && !delivered; t++) {
      run(g, 1);
      g.state.stock.wood = 60;
      const c = g.state.contracts[0];
      if (c && !canDeliver(g, c)) {
        const gold = g.state.gold;
        expect(deliver(g, 0)).toBe(true);
        expect(g.state.gold).toBe(gold + c.reward);
        delivered = true;
      }
    }
    expect(delivered).toBe(true);
    expect(g.state.stats.contracts).toBe(1);
  });
});

describe('light across the rift', () => {
  it('a lit spire strikes dark creatures and a chapel heals soldiers', () => {
    const g = rich();
    const s = g.world.start;
    const spire = placeNear(g, 'spire', s.x, s.z + 4), chapel = placeNear(g, 'chapel', s.x, s.z - 6);
    run(g, 2);
    expect(spire.fuel).toBeGreaterThan(0);
    const sc = g.center(spire), cc = g.center(chapel);
    const ghoul = g.spawnNear('ghoul', 1, sc.x + 3, sc.z, -1);
    const hurt = g.spawnNear('swordsman', 0, cc.x + 2, cc.z, -1);
    hurt.hp = 20; hurt.order = ORDER.Move; hurt.ox = hurt.x; hurt.oz = hurt.z;
    run(g, 6);
    expect(g.entById.has(ghoul.id) ? ghoul.hp : 0).toBeLessThan(UNITS.ghoul.hp - 30);
    expect(hurt.hp).toBeGreaterThan(40);
  });
});

describe('shard crystals', () => {
  it('are harvested by soldiers standing beside them, then regrow', () => {
    const g = rich();
    expect(g.state.nodes.length).toBeGreaterThan(4);
    const n = g.state.nodes[0];
    g.state.stock.shards = 0;
    const u = g.spawnNear('swordsman', 0, n.x + 0.8, n.z, -1);
    run(g, 6);
    u.hp = 0; // the harvester leaves; the crystal regrows on its own
    expect(n.ready).toBe(false);
    expect(g.state.stock.shards).toBeGreaterThanOrEqual(3);
    run(g, 310);
    expect(n.ready).toBe(true);
  });
});

describe('orders and difficulty', () => {
  it('attack-move engages enemies on the way; plain move does not', () => {
    const g = rich();
    const s = g.world.start;
    const a = g.spawnNear('knight', 0, s.x + 0.5, s.z + 4.5, -1);
    const foe = g.spawnNear('ghoul', 1, s.x + 4.5, s.z + 4.5, -1);
    foe.hx = foe.x; foe.hz = foe.z;
    orderAttackMove(g, [a.id], s.x + 9.5, s.z + 4.5);
    expect(a.order).toBe(ORDER.AttackMove);
    run(g, 6);
    expect(g.entById.has(foe.id)).toBe(false);
    run(g, 40); // nearby stronghold guards may join in; once they are dealt with the march ends
    expect(a.order).toBe(ORDER.Idle);
  });
  it('a move order onto water ends at the nearest shore instead of never arriving', () => {
    const g = rich();
    const s = g.world.start;
    let wx = -1, wz = -1;
    for (let r = 3; r < 40 && wx < 0; r++) for (let dx = -r; dx <= r && wx < 0; dx++) if (g.world.inb(s.x + dx, s.z + r) && g.world.type[(s.z + r) * N + s.x + dx] === T.Water) { wx = s.x + dx; wz = s.z + r; }
    expect(wx).toBeGreaterThanOrEqual(0);
    const a = g.spawnNear('swordsman', 0, s.x + 0.5, s.z + 4.5, -1);
    orderMove(g, [a.id], wx + 0.5, wz + 0.5);
    expect(g.world.isWalk(Math.floor(a.ox), Math.floor(a.oz))).toBe(true);
    run(g, 60);
    expect(a.order).toBe(ORDER.Idle);
  });
  it('soldiers return to their post after a chase, and recover when left alone', () => {
    const g = rich();
    const s = g.world.start;
    const a = g.spawnNear('knight', 0, s.x + 0.5, s.z + 4.5, -1);
    const post = { x: a.x, z: a.z };
    const foe = g.spawnNear('ghoul', 1, s.x + 5.5, s.z + 4.5, -1);
    foe.hx = foe.x; foe.hz = foe.z; foe.order = ORDER.Move; foe.ox = foe.x; foe.oz = foe.z; // stands still
    run(g, 8);
    expect(g.entById.has(foe.id)).toBe(false); // chased down
    const hurt = a.hp;
    expect(hurt).toBeLessThan(UNITS.knight.hp);
    run(g, 40);
    expect(Math.hypot(a.x - post.x, a.z - post.z)).toBeLessThan(3); // back at the post
    expect(a.hp).toBeGreaterThan(hurt); // resting heals
  });
  it('peaceful mode never raids', () => {
    const g = rich(3, 0);
    placeNear(g, 'gate', g.world.start.x, g.world.start.z);
    run(g, 900);
    expect(g.state.raidCount).toBe(0);
  });
});
