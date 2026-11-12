import { ARMY_PER_BARRACKS, CAMPS, MAX_BEACONS, TRAIN_TIME, UNITS, UnitKind } from './defs';
import type { Game } from './game';
import { findPath, los } from './path';
import { Entity, ORDER } from './state';

const isStatic = (e: Entity) => UNITS[e.kind].speed === 0;

export function armySize(g: Game) {
  let n = 0;
  for (const e of g.state.entities) if (e.team === 0 && !isStatic(e)) n++;
  return n;
}
export function armyCap(g: Game) {
  return ARMY_PER_BARRACKS * g.state.buildings.filter((b) => b.type === 'barracks' && b.connected).length;
}

export function canTrain(g: Game, kind: UnitKind): string | null {
  const d = UNITS[kind], gate = g.gateEnt();
  if (!gate) return 'Build a Rift Gate first';
  if (gate.down) return 'The Rift Gate is breached';
  if (armyCap(g) === 0) return 'Build a Barracks (with road access)';
  if (armySize(g) + g.state.trainQ.length >= armyCap(g)) return 'Army limit reached — build more Barracks';
  if (!g.canAfford(d.gold ?? 0, d.cost ?? {})) return 'Not enough resources';
  return null;
}

export function train(g: Game, kind: UnitKind): string | null {
  const r = canTrain(g, kind);
  if (r) return r;
  const d = UNITS[kind];
  g.pay(d.gold ?? 0, d.cost ?? {});
  if (!g.state.trainQ.length) g.state.trainT = TRAIN_TIME;
  g.state.trainQ.push(kind);
  return null;
}

export function canPlaceBeacon(g: Game, x: number, z: number): string | null {
  const gate = g.gateEnt(), d = UNITS.beacon;
  if (!gate) return 'Build a Rift Gate first';
  if (!g.world.isWalk(Math.floor(x), Math.floor(z))) return 'Cannot build here';
  if (Math.hypot(gate.x - x, gate.z - z) > 14) return 'Too far from the Rift Gate';
  if (g.state.entities.filter((e) => e.kind === 'beacon').length >= MAX_BEACONS) return `At most ${MAX_BEACONS} beacons`;
  for (const e of g.state.entities) if (isStatic(e) && Math.hypot(e.x - x, e.z - z) < 2) return 'Too close to another structure';
  if (!g.canAfford(d.gold!, d.cost!)) return 'Not enough resources';
  return null;
}
export function placeBeacon(g: Game, x: number, z: number): string | null {
  const r = canPlaceBeacon(g, x, z);
  if (r) return r;
  g.pay(UNITS.beacon.gold!, UNITS.beacon.cost!);
  const e = g.spawn('beacon', 0, Math.floor(x) + 0.5, Math.floor(z) + 0.5, -1);
  g.events.push({ t: 'spawn', x: e.x, z: e.z, team: 0 });
  return null;
}

export function orderMove(g: Game, ids: number[], x: number, z: number) {
  const units = ids.map((id) => g.entById.get(id)).filter((e): e is Entity => !!e && e.team === 0 && !isStatic(e));
  const cols = Math.ceil(Math.sqrt(units.length));
  units.forEach((e, i) => {
    const ox = ((i % cols) - (cols - 1) / 2) * 0.8, oz = (Math.floor(i / cols) - (cols - 1) / 2) * 0.8;
    let tx = x + ox, tz = z + oz;
    if (!g.world.isWalk(Math.floor(tx), Math.floor(tz))) { tx = x; tz = z; }
    e.order = ORDER.Move; e.ox = tx; e.oz = tz; e.tgt = 0; e.path = null;
  });
}
export function orderAttack(g: Game, ids: number[], targetId: number) {
  for (const id of ids) {
    const e = g.entById.get(id);
    if (!e || e.team !== 0 || isStatic(e)) continue;
    e.order = ORDER.Attack; e.otgt = targetId; e.tgt = targetId; e.path = null;
  }
}

function damage(g: Game, t: Entity, dmg: number, from: Entity | undefined) {
  if (t.hp <= 0 || t.down) return;
  t.hp -= dmg;
  g.events.push({ t: 'hit', x: t.x, z: t.z, team: t.team });
  if (from && from.hp > 0 && !t.tgt && t.order !== ORDER.Move && !isStatic(t)) t.tgt = from.id;
  // guards rally when their stronghold is attacked
  if (t.kind === 'camp' && from) {
    for (const e of g.state.entities) if (e.camp === t.camp && e !== t && !e.tgt && !e.raid) e.tgt = from.id;
  }
}

function nearestEnemy(g: Game, e: Entity, radius: number, mobileOnly: boolean): Entity | undefined {
  let best: Entity | undefined, bd = radius;
  for (const o of g.state.entities) {
    if (o.team === e.team || o.hp <= 0 || o.down) continue;
    const st = isStatic(o);
    if (st && mobileOnly) continue;
    let dd = Math.hypot(o.x - e.x, o.z - e.z) - UNITS[o.kind].radius;
    if (st) dd += 1.5; // prefer fighters over structures
    if (dd < bd) { bd = dd; best = o; }
  }
  return best;
}

function acquire(g: Game, e: Entity) {
  const d = UNITS[e.kind];
  if (e.order === ORDER.Move) { e.tgt = 0; return; }
  const alive = (o: Entity | undefined): o is Entity => !!o && o.hp > 0 && !o.down;
  if (e.order === ORDER.Attack) {
    const ot = g.entById.get(e.otgt ?? 0);
    if (!alive(ot)) { e.order = ORDER.Idle; e.tgt = 0; }
    else {
      // when sieging a structure, deal with defenders that get close first
      const near = isStatic(ot) ? nearestEnemy(g, e, 4.5, true) : undefined;
      e.tgt = (near ?? ot).id;
      return;
    }
  }
  const cur = g.entById.get(e.tgt);
  if (!alive(cur)) e.tgt = 0;
  // guards leash back home
  if (e.team === 1 && !e.raid && e.camp >= 0 && Math.hypot(e.x - e.hx, e.z - e.hz) > 16) {
    e.tgt = 0; e.order = ORDER.Move; e.ox = e.hx; e.oz = e.hz; e.path = null; return;
  }
  if (alive(cur) && !isStatic(cur) && Math.hypot(cur.x - e.x, cur.z - e.z) < d.aggro * 1.6) return;
  const best = nearestEnemy(g, e, d.aggro, false);
  if (best) e.tgt = best.id;
}

function stepToward(g: Game, e: Entity, tx: number, tz: number, dt: number) {
  const d = UNITS[e.kind], W = g.world;
  let wx = tx, wz = tz;
  if (!los(W, e.x, e.z, tx, tz)) {
    e.repath -= dt;
    if (!e.path || Math.hypot(e.gx - tx, e.gz - tz) > 1.5 || e.repath <= 0) {
      e.path = findPath(W, e.x, e.z, tx, tz); e.pi = 0; e.gx = tx; e.gz = tz; e.repath = 2 + g.rand();
    }
    if (!e.path) return;
    while (e.pi < e.path.length - 2 && Math.hypot(e.path[e.pi] - e.x, e.path[e.pi + 1] - e.z) < 0.35) e.pi += 2;
    wx = e.path[e.pi]; wz = e.path[e.pi + 1];
  } else e.path = null;
  const dx = wx - e.x, dz = wz - e.z, dist = Math.hypot(dx, dz);
  if (dist < 0.01) return;
  const st = Math.min(dist, d.speed * dt);
  const nx = e.x + (dx / dist) * st, nz = e.z + (dz / dist) * st;
  if (W.isWalk(Math.floor(nx), Math.floor(nz))) { e.x = nx; e.z = nz; }
  else if (W.isWalk(Math.floor(nx), Math.floor(e.z))) e.x = nx;
  else if (W.isWalk(Math.floor(e.x), Math.floor(nz))) e.z = nz;
  e.face = Math.atan2(dx, dz);
  e.moving = true;
}

function spawnRaid(g: Game) {
  const S = g.state, gate = g.gateEnt();
  const live = S.camps.map((c, i) => (c.alive ? i : -1)).filter((i) => i >= 0);
  if (!gate || !live.length) return;
  const ci = S.raidCount < 3 ? live[0] : live[Math.floor(g.rand() * live.length)];
  const cd = CAMPS[ci], site = g.world.campSites[ci];
  const n = Math.min(3 + Math.floor(S.raidCount * 0.8), 12);
  for (let i = 0; i < n; i++) {
    const e = g.spawnNear(cd.raid[i % cd.raid.length], 1, site.x + 0.5 + (g.rand() - 0.5) * 4, site.z + 2.5 + g.rand() * 2, ci);
    e.raid = true; e.order = ORDER.AttackMove; e.ox = gate.x; e.oz = gate.z;
  }
  S.raidCount++;
  g.events.push({ t: 'raid', camp: ci });
  g.toast(`⚔️ ${cd.name} sends a raid against your Rift Gate!`, 'warn');
}

function onDeath(g: Game, e: Entity) {
  const S = g.state;
  g.events.push({ t: 'die', x: e.x, z: e.z, kind: e.kind, team: e.team });
  if (e.team !== 1) return;
  S.stats.kills++;
  if (e.kind === 'camp') {
    const cd = CAMPS[e.camp], cs = S.camps[e.camp];
    cs.alive = false;
    S.gold += cd.lootGold; g.addGood('shards', cd.lootShards);
    g.recomputeBlight();
    g.events.push({ t: 'campDown', camp: e.camp });
    g.toast(`✨ ${cd.name} has fallen! +${cd.lootGold} gold, +${cd.lootShards} shards. Its blight lifts from the Light World.`, 'good');
    if (S.camps.every((c) => !c.alive) && !S.won) { S.won = true; g.events.push({ t: 'victory' }); }
    return;
  }
  const loot = e.kind === 'ghoul' ? (g.rand() < 0.35 ? 1 : 0) : e.kind === 'spitter' ? (g.rand() < 0.5 ? 1 : 0) : e.kind === 'brute' ? 2 : 6;
  if (loot) g.addGood('shards', loot);
  S.gold += 4 + Math.floor(g.rand() * 8);
}

export function tickCombat(g: Game, dt: number) {
  const S = g.state, ents = S.entities, W = g.world;
  const gate = g.gateEnt();

  // --- training ---
  if (S.trainQ.length && gate && !gate.down) {
    S.trainT -= dt;
    if (S.trainT <= 0) {
      const kind = S.trainQ.shift()!;
      const a = g.rand() * Math.PI * 2;
      const e = g.spawnNear(kind, 0, gate.x + Math.cos(a) * 2.4, gate.z + Math.sin(a) * 2.4, -1);
      S.stats.trained++;
      g.events.push({ t: 'spawn', x: e.x, z: e.z, team: 0 });
      S.trainT = TRAIN_TIME;
    }
  }

  // --- gate upkeep & raids ---
  if (gate) {
    if (gate.down) {
      S.gateDown -= dt;
      if (S.gateDown <= 0) { gate.down = false; gate.hp = UNITS.gate.hp * 0.5; g.toast('The Rift Gate flickers back to life.', 'info'); }
    } else {
      gate.hp = Math.min(UNITS.gate.hp, gate.hp + 1.5 * dt);
      for (const e of ents) {
        if (e.team === 0 && e !== gate && Math.hypot(e.x - gate.x, e.z - gate.z) < 6) e.hp = Math.min(UNITS[e.kind].hp, e.hp + 3 * dt);
      }
    }
    if (S.camps.some((c) => c.alive)) {
      S.raidTimer -= dt;
      if (S.raidTimer <= 0) { spawnRaid(g); S.raidTimer = Math.max(110, 175 - S.raidCount * 4) + g.rand() * 30; }
    }
  }

  // --- strongholds: reinforcements, purified wells ---
  S.camps.forEach((cs, ci) => {
    if (!cs.alive) {
      cs.well -= dt;
      if (cs.well <= 0) { cs.well = 90; g.addGood('shards', 1); }
      return;
    }
    cs.respawn -= dt;
    if (cs.respawn <= 0) {
      cs.respawn = 45;
      const cd = CAMPS[ci], site = W.campSites[ci];
      const have = ents.filter((e) => e.camp === ci && !e.raid && e.kind !== 'camp');
      if (have.length < cd.guards.length) {
        const need = cd.guards.filter((k) => k !== 'sovereign');
        const kind = need[Math.floor(g.rand() * need.length)];
        g.spawnNear(kind, 1, site.x + 0.5 + (g.rand() - 0.5) * 5, site.z + 0.5 + (g.rand() - 0.5) * 5, ci);
      }
    }
  });

  // --- units ---
  for (const e of ents) {
    if (e.hp <= 0 || e.down) continue;
    const d = UNITS[e.kind];
    e.cd -= dt; e.think -= dt; e.moving = false;
    if (e.kind === 'camp') continue;
    if (e.think <= 0) { e.think = 0.3 + g.rand() * 0.15; acquire(g, e); }
    const t = e.tgt ? g.entById.get(e.tgt) : undefined;
    if (t && t.hp > 0 && !t.down) {
      const dist = Math.hypot(t.x - e.x, t.z - e.z) - UNITS[t.kind].radius;
      if (dist <= d.range) {
        e.face = Math.atan2(t.x - e.x, t.z - e.z);
        if (e.cd <= 0) {
          e.cd = d.cd; e.atkT = S.time;
          if (d.ranged) {
            S.projectiles.push({ id: S.nextId++, x: e.x, z: e.z, y: e.kind === 'beacon' || e.kind === 'gate' ? 2.2 : 0.7, tgt: t.id, dmg: d.dmg, team: e.team, from: e.id });
            g.events.push({ t: 'shot', x: e.x, z: e.z, team: e.team });
          } else damage(g, t, d.dmg, e);
        }
      } else if (d.speed > 0) stepToward(g, e, t.x, t.z, dt);
    } else if (d.speed > 0) {
      if (e.order === ORDER.Move || e.order === ORDER.AttackMove) {
        if (Math.hypot(e.ox - e.x, e.oz - e.z) < 0.5) { if (e.order === ORDER.Move) e.order = ORDER.Idle; e.path = null; }
        else stepToward(g, e, e.ox, e.oz, dt);
      } else if (e.team === 1 && e.camp >= 0 && !e.raid && Math.hypot(e.hx - e.x, e.hz - e.z) > 1.5) {
        stepToward(g, e, e.hx, e.hz, dt);
      }
    }
  }

  // --- projectiles ---
  for (let i = S.projectiles.length - 1; i >= 0; i--) {
    const p = S.projectiles[i], t = g.entById.get(p.tgt);
    if (!t || t.hp <= 0 || t.down) { S.projectiles.splice(i, 1); continue; }
    const dx = t.x - p.x, dz = t.z - p.z, dist = Math.hypot(dx, dz), st = 13 * dt;
    if (dist <= st + UNITS[t.kind].radius * 0.5) {
      damage(g, t, p.dmg, g.entById.get(p.from));
      S.projectiles.splice(i, 1);
    } else { p.x += (dx / dist) * st; p.z += (dz / dist) * st; p.y += (0.7 - p.y) * Math.min(1, st / dist); }
  }

  // --- separation ---
  for (let i = 0; i < ents.length; i++) {
    const a = ents[i];
    if (a.hp <= 0) continue;
    const sa = isStatic(a), ra = UNITS[a.kind].radius;
    for (let j = i + 1; j < ents.length; j++) {
      const b = ents[j];
      if (b.hp <= 0) continue;
      const sb = isStatic(b);
      if (sa && sb) continue;
      const min = ra + UNITS[b.kind].radius;
      let dx = b.x - a.x, dz = b.z - a.z;
      const d2 = dx * dx + dz * dz;
      if (d2 >= min * min) continue;
      let dist = Math.sqrt(d2);
      if (dist < 0.001) { dx = g.rand() - 0.5; dz = g.rand() - 0.5; dist = Math.hypot(dx, dz) || 1; }
      const push = ((min - dist) / dist) * 0.5;
      const move = (e: Entity, mx: number, mz: number) => {
        const nx = e.x + mx, nz = e.z + mz;
        if (W.isWalk(Math.floor(nx), Math.floor(nz))) { e.x = nx; e.z = nz; }
      };
      if (!sa) move(a, -dx * push * (sb ? 2 : 1), -dz * push * (sb ? 2 : 1));
      if (!sb) move(b, dx * push * (sa ? 2 : 1), dz * push * (sa ? 2 : 1));
    }
  }

  // --- deaths ---
  const dead = ents.filter((e) => e.hp <= 0 && !e.down);
  for (const e of dead) {
    if (e.kind === 'gate') {
      e.down = true; e.hp = 0; S.gateDown = 45;
      const lost = Math.max(0, Math.floor(S.gold * 0.2));
      S.gold -= lost;
      for (const r of ents) if (r.raid) r.hp = -1e9; // raiders vanish with their plunder
      g.events.push({ t: 'breach' });
      g.toast(`💀 The Rift Gate was breached! Raiders plundered ${lost} gold from your city.`, 'warn');
    } else onDeath(g, e);
  }
  if (dead.length) {
    S.entities = ents.filter((e) => {
      if (e.hp > 0 || e.kind === 'gate') return true;
      g.entById.delete(e.id);
      return false;
    });
  }
}
