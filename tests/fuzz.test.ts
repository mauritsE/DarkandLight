// Monkey testing: thousands of random player actions, legal or not, on several islands.
// Nothing may throw and the state invariants must hold after every step.
import { describe, expect, it } from 'vitest';
import { Game } from '../src/sim/game';
import { BUILDINGS, BuildingId, GOOD_IDS, TRAINABLE } from '../src/sim/defs';
import { orderAttack, orderAttackMove, orderMove, placeBeacon, train } from '../src/sim/combat';
import { buy, deliver, sell } from '../src/sim/trade';
import { N, mulberry32 } from '../src/sim/world';
import { invariants, link } from './helpers';

const TYPES = (Object.keys(BUILDINGS) as BuildingId[]).filter((t) => t !== 'townhall');

function monkey(seed: number, steps: number, difficulty: number) {
  let g = Game.create(seed, difficulty);
  const r = mulberry32(seed * 7919 + 13);
  const ri = (n: number) => Math.floor(r() * n);
  const s = g.world.start;
  const counts: Record<string, number> = {};
  const did = (k: string) => (counts[k] = (counts[k] ?? 0) + 1);
  // a small connected street to start from, so buildings actually function
  for (let x = s.x - 10; x <= s.x + 10; x++) g.placeRoad(x, s.z + 2);
  for (let z = s.z - 8; z <= s.z + 10; z++) g.placeRoad(s.x + 3, z);
  for (let step = 0; step < steps; step++) {
    const S = g.state;
    // keep the monkey solvent so it reaches deep states (a broke monkey tests nothing)
    if (step % 200 === 0) { S.gold += 3000; S.peakPop = Math.max(S.peakPop, 120); for (const k of GOOD_IDS) S.stock[k] = Math.max(S.stock[k], 30); }
    const near = () => [s.x + ri(41) - 20, s.z + ri(41) - 20] as const;
    const any = () => [ri(N + 4) - 2, ri(N + 4) - 2] as const; // includes out-of-bounds
    const a = ri(100);
    if (a < 38) { const [x, z] = r() < 0.9 ? near() : any(); const ty = r() < 0.3 ? 'house' : TYPES[ri(TYPES.length)]; if (g.place(ty, x, z).ok) { did('place'); if (r() < 0.6 && !g.tileFree(x - 1, z)) link(g, x - 1, z); } }
    else if (a < 47) { let [x, z] = r() < 0.9 ? near() : any(); const dx = r() < 0.5 ? 1 : 0; for (let k = 0; k < 2 + ri(8); k++) { if (g.placeRoad(x, z).ok) did('road'); x += dx; z += 1 - dx; } }
    else if (a < 49) { const [x, z] = near(); if (g.demolishAt(x, z)) did('demolish'); }
    else if (a < 50 && S.buildings.length > 1) { if (g.demolish(S.buildings[ri(S.buildings.length)].id)) did('demolish'); }
    else if (a < 53) { /* the monkey rests */ }
    else if (a < 58) { if (!train(g, TRAINABLE[ri(TRAINABLE.length)])) did('train'); }
    else if (a < 66) {
      const mine = S.entities.filter((e) => e.team === 0).map((e) => e.id), foes = S.entities.filter((e) => e.team === 1);
      const ids = mine.filter(() => r() < 0.6);
      const [x, z] = any();
      const k = ri(3);
      if (k === 0) orderMove(g, ids, x + r(), z + r());
      else if (k === 1) orderAttackMove(g, ids, x + r(), z + r());
      else if (foes.length) orderAttack(g, ids, r() < 0.9 ? foes[ri(foes.length)].id : 999999);
      did('order');
    }
    else if (a < 69) { const ge = g.gateEnt(); const [x, z] = ge && r() < 0.8 ? [ge.x + ri(13) - 6, ge.z + ri(13) - 6] : any(); if (!placeBeacon(g, x, z)) did('beacon'); }
    else if (a < 76) {
      const ship = S.ships[ri(S.ships.length)], good = GOOD_IDS[ri(GOOD_IDS.length)];
      if ((r() < 0.5 ? sell(g, ship, good, ri(30)) : buy(g, ship, good, ri(30))) > 0) did('trade');
      if (deliver(g, ri(3))) did('contract');
    }
    else if (a < 79) { const good = GOOD_IDS[ri(GOOD_IDS.length)]; S.orders[good] = { mode: (['none', 'sell', 'buy'] as const)[ri(3)], level: ri(80) }; }
    else if (a < 81 && S.buildings.length > 1) { const b = S.buildings[ri(S.buildings.length)]; b.paused = !b.paused; }
    else if (a < 82) { S.autoUpgrade = !S.autoUpgrade; }
    else if (a < 84) { const json = g.serialize(); const g2 = Game.load(json); expect(g2).not.toBeNull(); expect(g2!.serialize()).toBe(json); g = g2!; did('reload'); }
    // time passes (mostly a little, sometimes a lot)
    const ticks = r() < 0.05 ? 300 : 5 + ri(25);
    for (let k = 0; k < ticks; k++) g.tick(0.1);
    g.events.length = 0;
    const bad = invariants(g);
    if (bad.length) throw new Error(`seed ${seed} step ${step}: ${bad.join('; ')}`);
  }
  return { counts, g };
}

describe('monkey testing', () => {
  for (const [seed, diff] of [[11, 1], [222, 2], [3333, 1], [44444, 0], [5, 2]] as const) {
    it(`island ${seed}, difficulty ${diff}: 2500 random actions never break the game`, () => {
      const { counts, g } = monkey(seed, 2500, diff);
      console.log(`seed ${seed}: ${JSON.stringify(counts)} | buildings ${g.state.buildings.length} roads ${g.state.roads.length} entities ${g.state.entities.length} peakPop ${g.state.peakPop} t2/t3 ${g.state.stats.t2}/${g.state.stats.t3} trades ${g.state.stats.trades} time ${(g.state.time / 60).toFixed(0)}m kills ${g.state.stats.kills} camps ${g.state.camps.map((c) => (c.alive ? 1 : 0)).join('')}`);
      expect(counts.place).toBeGreaterThan(40);
      expect(counts.reload).toBeGreaterThan(10);
    }, 180_000);
  }
});
