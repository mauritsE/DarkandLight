// A scripted player that builds a full economy from a fresh start with no cheats,
// to check that the intended progression is actually reachable and balanced.
import { Game } from '../src/sim/game';
import { BUILDINGS, BuildingId, CAMPS, UNITS } from '../src/sim/defs';
import { N, T } from '../src/sim/world';
import { armyCap, armySize, orderAttack, orderMove, placeBeacon, train } from '../src/sim/combat';
import { buy, deliver, sell } from '../src/sim/trade';

export function link(g: Game, x: number, z: number, dry?: Set<number>): boolean {
  if (g.netDirty) g.recomputeNet();
  const th = g.find('townhall')!;
  const prev = new Map<number, number>(), q = [z * N + x];
  prev.set(z * N + x, -1);
  let end = -1;
  // edge-adjacent to the Keep (a diagonal touch does not connect a road)
  const nearKeep = (ix: number, iz: number) => ((ix === th.x - 1 || ix === th.x + 3) && iz >= th.z && iz <= th.z + 2) || ((iz === th.z - 1 || iz === th.z + 3) && ix >= th.x && ix <= th.x + 2);
  while (q.length) {
    const i = q.shift()!, ix = i % N, iz = (i / N) | 0;
    if (g.roadNet[i] || nearKeep(ix, iz)) { end = i; break; }
    for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = ix + dx, nz = iz + dz, ni = nz * N + nx;
      if (!g.world.inb(nx, nz) || prev.has(ni)) continue;
      if (!g.road[ni] && (g.tileFree(nx, nz) || dry?.has(ni))) continue;
      prev.set(ni, i); q.push(ni);
    }
  }
  if (end < 0) return false;
  if (dry) return true;
  for (let i = end; i >= 0; i = prev.get(i)!) if (!g.road[i]) g.placeRoad(i % N, (i / N) | 0);
  return true;
}

export function build(g: Game, type: BuildingId): boolean {
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
    // only build where a road can actually reach (the footprint itself will block tiles)
    const foot = new Set<number>();
    for (let a = 0; a < d.size; a++) for (let b = 0; b < d.size; b++) foot.add((z + b) * N + x + a);
    if (!link(g, x - 1, z, foot)) continue;
    if (!g.place(type, x, z).ok) return false;
    link(g, x - 1, z);
    return true;
  }
  return false;
}


/** Things that must always be true of a game state, whatever the player does. */
export function invariants(g: Game): string[] {
  const S = g.state, W = g.world, bad: string[] = [];
  if (!Number.isFinite(S.gold) || S.gold < -300.001) bad.push(`gold ${S.gold}`);
  for (const k in S.stock) { const v = (S.stock as Record<string, number>)[k]; if (!Number.isFinite(v) || v < -1e-6) bad.push(`stock ${k}=${v}`); }
  if (!Number.isInteger(S.pop) || S.pop < 0) bad.push(`pop ${S.pop}`);
  const occ = new Int32Array(N * N);
  for (const b of S.buildings) {
    const s = BUILDINGS[b.type].size;
    for (let dz = 0; dz < s; dz++) for (let dx = 0; dx < s; dx++) {
      const i = (b.z + dz) * N + b.x + dx;
      if (occ[i]) bad.push(`buildings overlap at ${b.x + dx},${b.z + dz}`);
      occ[i] = b.id;
      if (g.road[i]) bad.push(`road under ${b.type}`);
      if (W.type[i] === T.Water || W.type[i] === T.Rock || W.type[i] === T.Forest) bad.push(`${b.type} on terrain type ${W.type[i]}`);
    }
    if (b.type === 'house' && (!(b.residents! >= 0) || b.residents! > 28.001)) bad.push(`house residents ${b.residents}`);
    if (!Number.isFinite(b.progress)) bad.push(`${b.type} progress ${b.progress}`);
  }
  for (let i = 0; i < N * N; i++) if (occ[i] !== g.occ[i]) { bad.push(`occupancy grid out of sync at ${i % N},${(i / N) | 0}`); break; }
  if (S.roads.length !== new Set(S.roads).size) bad.push('duplicate road tiles');
  const ids = new Set<number>();
  for (const e of S.entities) {
    if (ids.has(e.id)) bad.push(`duplicate entity id ${e.id}`);
    ids.add(e.id);
    if (!Number.isFinite(e.x) || !Number.isFinite(e.z) || !Number.isFinite(e.hp)) bad.push(`${e.kind} has NaN`);
    else if (UNITS[e.kind].speed > 0 && !W.isWalk(Math.floor(e.x), Math.floor(e.z))) bad.push(`${e.kind} stands on unwalkable ${e.x.toFixed(1)},${e.z.toFixed(1)}`);
    if (g.entById.get(e.id) !== e) bad.push(`entity index out of sync for ${e.kind}`);
  }
  if (g.entById.size !== S.entities.length) bad.push(`entity index size ${g.entById.size} vs ${S.entities.length}`);
  if (S.entities.filter((e) => e.kind === 'gate').length > 1) bad.push('more than one gate entity');
  return bad;
}

export interface CampaignResult { seed: number; built: number; planned: number; gate: number; army: number; win: number; retreats: number; minGold: number; pop: number; income: number; raids: number; quest: number; left: number; log: string[]; game: Game }

/** A scripted player: builds a town from nothing, trades, raises armies and attacks each stronghold in turn. No cheats. */
export function campaign(seed: number, difficulty = 1, minutes = 150, hook?: (g: Game) => void): CampaignResult {
  const g = Game.create(seed, difficulty);
  const S = g.state;
  const plan: BuildingId[] = ['house', 'house', 'house', 'house', 'woodcutter', 'fishery', 'house', 'house', 'market', 'house', 'house', 'sawmill', 'quarry', 'house', 'house',
      'woodcutter', 'harbor', 'farm', 'bakery', 'house', 'house', 'sheepfarm', 'weaver', 'chapel', 'house', 'house', 'fishery', 'house', 'house', 'warehouse', 'mine', 'forge', 'house', 'house', 'gate', 'barracks', 'house', 'house', 'barracks'];
    const log: string[] = [];
    let pi = 0, minGold = Infinity, attacked = false, tGate = 0, tArmy = 0, tWin = 0, losses = 0, camp1 = 0, camp2 = 0, curTarget = 0;
    for (let t = 0; t < 60 * minutes && !tWin; t++) {
      for (let k = 0; k < 10; k++) { g.tick(0.1); hook?.(g); }
      if (t % 5 === 0) { const bad = invariants(g); if (bad.length) throw new Error(`seed ${seed} t=${t}s: ` + bad.join('; ')); }
      g.events.length = 0;
      minGold = Math.min(minGold, S.gold);
      if (pi < plan.length && build(g, plan[pi])) { log.push(`${(t / 60).toFixed(1)}m ${plan[pi]} (gold ${Math.round(S.gold)}, pop ${S.pop}, inc ${Math.round(S.income)})`); pi++; }
      if (t % 300 === 0) log.push(`  .. ${(t / 60).toFixed(0)}m waiting for ${plan[pi]}: gold ${Math.round(S.gold)} wood ${Math.floor(S.stock.wood)} planks ${Math.floor(S.stock.planks)} stone ${Math.floor(S.stock.stone)} pop ${S.pop}/${S.jobs} wc ${S.buildings.filter((b) => b.type === 'woodcutter').map((b) => b.resEff.toFixed(2) + b.status).join(',')}`);
      // like a player reacting to the "no road" warning: reconnect anything that lost its road
      if (t % 30 === 15) for (const b of S.buildings) {
        if (b.status !== 'noRoad') continue;
        const sz = BUILDINGS[b.type].size;
        for (const [x, z] of [[b.x - 1, b.z], [b.x + sz, b.z], [b.x, b.z - 1], [b.x, b.z + sz]]) if (!g.tileFree(x, z) || g.road[z * N + x]) { if (link(g, x, z)) break; }
      }
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
        // weapons are the bottleneck of a big army: add forges (and mines to feed them)
        else if (S.stock.weapons < 3 && S.gold > 1200 && count('forge') < 3) { if (count('mine') <= count('forge')) build(g, 'mine'); build(g, 'forge'); }
      }
      if (S.stock.wood < 4 && t % 45 === 0 && S.buildings.filter((b) => b.type === 'woodcutter' && b.resEff > 0.5).length < 3) build(g, 'woodcutter');
      // sell surplus when a ship is in
      const ship = S.ships.find((sh) => sh.phase === 'docked');
      if (ship) for (const k of ['planks', 'stone', 'cloth', 'bread', 'wood'] as const) if (S.stock[k] > 45) sell(g, ship, k, Math.floor(S.stock[k] - 35));
      for (let i = S.contracts.length - 1; i >= 0; i--) deliver(g, i);
      if (ship && S.stock.weapons < 4 && S.gold > 1500) buy(g, ship, 'weapons', 8);
      if (g.find('gate') && !tGate) tGate = t;
      // ring the gate with light beacons as shards allow
      if (t % 20 === 7 && S.stock.shards >= 4 && S.gold > 400) {
        const ge = g.gateEnt();
        const nb = S.entities.filter((e) => e.kind === 'beacon').length;
        if (ge && nb < 6) for (let k = 0; k < 8; k++) { const a = (nb + k) * 1.05; if (!placeBeacon(g, ge.x + Math.cos(a) * 3.6, ge.z + Math.sin(a) * 3.6)) break; }
      }
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
  return { seed, built: pi, planned: plan.length, gate: tGate / 60, army: tArmy / 60, win: tWin / 60, retreats: losses, minGold, pop: S.pop, income: S.income, raids: S.raidCount, quest: S.quest, left: armySize(g), log, game: g };
}
