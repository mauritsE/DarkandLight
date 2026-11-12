// A scripted player that builds a full economy from a fresh start with no cheats,
// to check that the intended progression is actually reachable and balanced.
import { describe, expect, it } from 'vitest';
import { Game } from '../src/sim/game';
import { BUILDINGS, BuildingId, CAMPS, UNITS } from '../src/sim/defs';
import { N, T } from '../src/sim/world';
import { armyCap, armySize, orderAttack, orderMove, train } from '../src/sim/combat';
import { deliver, sell } from '../src/sim/trade';

function link(g: Game, x: number, z: number): boolean {
  if (g.netDirty) g.recomputeNet();
  const th = g.find('townhall')!;
  const prev = new Map<number, number>(), q = [z * N + x];
  prev.set(z * N + x, -1);
  let end = -1;
  const nearKeep = (ix: number, iz: number) => ix >= th.x - 1 && ix <= th.x + 3 && iz >= th.z - 1 && iz <= th.z + 3;
  while (q.length) {
    const i = q.shift()!, ix = i % N, iz = (i / N) | 0;
    if (g.roadNet[i] || nearKeep(ix, iz)) { end = i; break; }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = ix + dx, nz = iz + dz, ni = nz * N + nx;
      if (!g.world.inb(nx, nz) || prev.has(ni)) continue;
      if (!g.road[ni] && g.tileFree(nx, nz)) continue;
      prev.set(ni, i); q.push(ni);
    }
  }
  if (end < 0) return false;
  for (let i = end; i >= 0; i = prev.get(i)!) if (!g.road[i]) g.placeRoad(i % N, (i / N) | 0);
  return true;
}

function build(g: Game, type: BuildingId): boolean {
  const d = BUILDINGS[type], s = g.world.start;
  if (!g.unlocked(type) || !g.canAfford(d.gold + 40, d.cost)) return false;
  for (let r = 2; r < 40; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
    if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
    const x = s.x + dx, z = s.z + dz;
    if (!g.canPlace(type, x, z).ok || g.tileFree(x - 1, z)) continue;
    if (type === 'woodcutter' && g.resEfficiency(type, x, z) < 0.8) continue;
    // like a sensible player: don't pave over the forest (keeps woodcutters productive)
    let onForest = false;
    for (let a = 0; a < d.size; a++) for (let b = 0; b < d.size; b++) if (g.world.type[(z + b) * N + x + a] === T.Forest) onForest = true;
    if (onForest && type !== 'woodcutter') continue;
    if (!g.place(type, x, z).ok) return false;
    link(g, x - 1, z);
    return true;
  }
  return false;
}

describe('bot playthrough', () => {
  it('builds an economy from a cold start, fields armies and razes all three strongholds', () => {
    const g = Game.create(2024);
    const S = g.state;
    const plan: BuildingId[] = ['house', 'house', 'house', 'house', 'woodcutter', 'fishery', 'house', 'house', 'market', 'house', 'house', 'sawmill', 'quarry', 'house', 'house',
      'woodcutter', 'harbor', 'farm', 'bakery', 'house', 'house', 'sheepfarm', 'weaver', 'chapel', 'house', 'house', 'fishery', 'house', 'house', 'warehouse', 'mine', 'forge', 'house', 'house', 'gate', 'barracks', 'house', 'house', 'barracks'];
    const log: string[] = [];
    let pi = 0, minGold = Infinity, attacked = false, tGate = 0, tArmy = 0, tWin = 0, losses = 0, camp1 = 0, camp2 = 0, curTarget = 0;
    for (let t = 0; t < 60 * 150 && !tWin; t++) {
      for (let k = 0; k < 10; k++) g.tick(0.1);
      g.events.length = 0;
      minGold = Math.min(minGold, S.gold);
      if (pi < plan.length && build(g, plan[pi])) { log.push(`${(t / 60).toFixed(1)}m ${plan[pi]} (gold ${Math.round(S.gold)}, pop ${S.pop}, inc ${Math.round(S.income)})`); pi++; }
      if (t % 300 === 0) log.push(`  .. ${(t / 60).toFixed(0)}m waiting for ${plan[pi]}: gold ${Math.round(S.gold)} wood ${Math.floor(S.stock.wood)} planks ${Math.floor(S.stock.planks)} stone ${Math.floor(S.stock.stone)} pop ${S.pop}/${S.jobs} wc ${S.buildings.filter((b) => b.type === 'woodcutter').map((b) => b.resEff.toFixed(2) + b.status).join(',')}`);
      // keep growing the town once the opening plan is done
      if (pi >= plan.length && t % 20 === 0) {
        const count = (ty: BuildingId) => S.buildings.filter((b) => b.type === ty).length;
        if (count('fishery') < 3) build(g, 'fishery');
        else if (count('farm') < 2) build(g, 'farm');
        else if (count('bakery') < 2) build(g, 'bakery');
        else if (count('sheepfarm') < 2) build(g, 'sheepfarm');
        else if (count('weaver') < 2) build(g, 'weaver');
        else if (count('market') < 2) build(g, 'market');
        else if (count('chapel') < 2) build(g, 'chapel');
        else if (count('house') < 40) build(g, 'house');
      }
      if (S.stock.wood < 4 && t % 45 === 0 && S.buildings.filter((b) => b.type === 'woodcutter' && b.resEff > 0.5).length < 3) build(g, 'woodcutter');
      // sell surplus when a ship is in
      const ship = S.ships.find((sh) => sh.phase === 'docked');
      if (ship) for (const k of ['planks', 'stone', 'cloth', 'bread', 'wood'] as const) if (S.stock[k] > 45) sell(g, ship, k, Math.floor(S.stock[k] - 35));
      for (let i = S.contracts.length - 1; i >= 0; i--) deliver(g, i);
      if (g.find('gate') && !tGate) tGate = t;
      const army = () => S.entities.filter((e) => e.team === 0 && e.kind !== 'gate' && e.kind !== 'beacon');
      const cap = armyCap(g);
      if (cap && armySize(g) + S.trainQ.length < cap) train(g, S.stock.shards >= 2 && S.camps[0].alive === false ? 'knight' : armySize(g) % 3 === 2 ? 'archer' : 'swordsman');
      // late game: more barracks once the first stronghold is down
      if (!S.camps[0].alive && S.buildings.filter((b) => b.type === 'barracks').length < 4 && t % 30 === 0) build(g, 'barracks');
      const target = S.camps.findIndex((c) => c.alive);
      if (target < 0) { tWin = t; break; }
      if (target !== curTarget) { curTarget = target; attacked = false; const ge = g.gateEnt(); if (ge) orderMove(g, army().map((e) => e.id), ge.x + 2, ge.z + 2); }
      const need = target === 0 ? 12 : target === 1 ? 18 : 24;
      const healthy = army().every((e) => e.hp > UNITS[e.kind].hp * 0.8);
      if (!attacked && army().length >= need && healthy) { attacked = true; if (!tArmy) tArmy = t; log.push(`${(t / 60).toFixed(1)}m attack ${CAMPS[target].name} with ${army().length}`); }
      if (attacked && army().length < need * 0.35) { attacked = false; losses++; const ge = g.gateEnt()!; orderMove(g, army().map((e) => e.id), ge.x + 2, ge.z + 2); log.push(`${(t / 60).toFixed(1)}m retreat`); }
      if (attacked && t % 5 === 0) orderAttack(g, army().map((e) => e.id), S.camps[target].entId);
      if (!S.camps[target].alive || (attacked && S.camps.findIndex((c) => c.alive) !== target)) { attacked = false; }
      if (target > 0 && !camp1) { camp1 = t; log.push(`${(t / 60).toFixed(1)}m first stronghold down`); }
      if (target > 1 && !camp2) { camp2 = t; log.push(`${(t / 60).toFixed(1)}m second stronghold down`); }
    }
    console.log(log.join('\n'));
    console.log(`gate ${(tGate / 60).toFixed(1)}m, army ${(tArmy / 60).toFixed(1)}m, victory ${(tWin / 60).toFixed(1)}m, retreats ${losses}, minGold ${Math.round(minGold)}, pop ${S.pop}, income ${Math.round(S.income)}, raids ${S.raidCount}, quest ${S.quest}, army left ${armySize(g)}, t2 ${S.stats.t2}`);
    expect(pi).toBe(plan.length);
    expect(tGate).toBeGreaterThan(0);
    expect(tWin).toBeGreaterThan(0);
    expect(S.won).toBe(true);
    expect(minGold).toBeGreaterThan(-100);
  }, 120_000);
});
