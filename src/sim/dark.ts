// The Dark World's own rules: what your light reveals, the powers it grants,
// and the relics won from creature lairs.
import {
  ABILITIES, AbilityId, BUILDINGS, BURST_DMG, CAMPS, LAIR_GUARDS, MEND_FRACTION, RALLY_BONUS, RALLY_TIME, RELIC_IDS, RelicId, SIGHT, UNITS,
} from './defs';
import type { Game } from './game';
import { damage } from './combat';
import type { Entity } from './state';
import { N } from './world';

export const hasRelic = (g: Game, r: RelicId) => g.state.relics.includes(r);
const isSoldier = (e: Entity) => e.team === 0 && UNITS[e.kind].speed > 0;

export function maxHp(g: Game, e: Entity): number {
  const base = e.kind === 'camp' ? CAMPS[e.camp].hp : UNITS[e.kind].hp;
  return isSoldier(e) && hasRelic(g, 'aegis') ? base * 1.2 : base;
}
export function dmgMult(g: Game, e: Entity): number {
  if (!isSoldier(e)) return 1;
  return (hasRelic(g, 'ember') ? 1.15 : 1) * (g.state.abil.rallyT > 0 ? 1 + RALLY_BONUS : 1);
}
export function speedMult(g: Game, e: Entity): number {
  if (!isSoldier(e)) return 1;
  return (hasRelic(g, 'boots') ? 1.2 : 1) * (g.state.abil.rallyT > 0 ? 1 + RALLY_BONUS : 1);
}

// ---------- vision ----------
export const isVisible = (g: Game, x: number, z: number) => g.world.inb(Math.floor(x), Math.floor(z)) && g.vis[Math.floor(z) * N + Math.floor(x)] === 2;
export const isExplored = (g: Game, x: number, z: number) => g.world.inb(Math.floor(x), Math.floor(z)) && g.vis[Math.floor(z) * N + Math.floor(x)] >= 1;

/** Recompute which tiles are lit right now (2), were lit before (1) or never (0). */
export function computeVision(g: Game) {
  const vis = g.vis, S = g.state;
  for (let i = 0; i < N * N; i++) if (vis[i] === 2) vis[i] = 1;
  const light = (cx: number, cz: number, r: number) => {
    const x0 = Math.max(0, Math.floor(cx - r)), x1 = Math.min(N - 1, Math.ceil(cx + r));
    const z0 = Math.max(0, Math.floor(cz - r)), z1 = Math.min(N - 1, Math.ceil(cz + r));
    for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx, dz = z + 0.5 - cz;
      if (dx * dx + dz * dz <= r * r) vis[z * N + x] = 2;
    }
  };
  for (const b of S.buildings) {
    if (!b.connected) continue;
    const c = g.center(b), s = BUILDINGS[b.type].size;
    light(c.x, c.z, b.type === 'chapel' ? SIGHT.chapel : b.type === 'spire' && (b.fuel ?? 0) > 0 ? SIGHT.spire : SIGHT.building + s / 2);
  }
  for (const e of S.entities) {
    if (e.team !== 0 || e.down) continue;
    light(e.x, e.z, e.kind === 'gate' ? SIGHT.gate : e.kind === 'beacon' ? SIGHT.beacon : e.kind === 'knight' ? SIGHT.knight : SIGHT.soldier);
  }
  S.camps.forEach((c, i) => { if (!c.alive) light(g.world.campSites[i].x + 0.5, g.world.campSites[i].z + 0.5, SIGHT.well); });
  g.visVer++;
}

export function tickDark(g: Game, dt: number) {
  const a = g.state.abil, k = hasRelic(g, 'prism') ? 1.3 : 1;
  a.burst = Math.max(0, a.burst - dt * k); a.mend = Math.max(0, a.mend - dt * k); a.rally = Math.max(0, a.rally - dt * k);
  a.rallyT = Math.max(0, a.rallyT - dt);
  g.visT -= dt;
  if (g.visT <= 0) { g.visT = 0.4; computeVision(g); }
}

// ---------- light powers ----------
export function canCast(g: Game, id: AbilityId, x?: number, z?: number): string | null {
  const d = ABILITIES[id], gate = g.gateEnt();
  if (!gate) return 'Raise a Rift Gate first';
  if (gate.down) return 'The Rift Gate is breached';
  if (g.state.abil[id] > 0) return `${d.name} is recharging (${Math.ceil(g.state.abil[id])}s)`;
  if (g.state.stock.shards < d.shards) return `Needs ${d.shards} Umbral Shard${d.shards > 1 ? 's' : ''}`;
  if (d.targeted && x !== undefined && z !== undefined && !isVisible(g, x, z)) return 'Your light does not reach there';
  return null;
}

export function cast(g: Game, id: AbilityId, x = 0, z = 0): string | null {
  const why = canCast(g, id, x, z);
  if (why) return why;
  const d = ABILITIES[id], S = g.state;
  S.stock.shards -= d.shards; S.abil[id] = d.cd; S.stats.casts++;
  if (id === 'burst') {
    for (const e of S.entities) if (e.team === 1 && Math.hypot(e.x - x, e.z - z) <= d.radius + UNITS[e.kind].radius) damage(g, e, BURST_DMG, undefined);
    g.events.push({ t: 'burst', x, z });
  } else if (id === 'mend') {
    for (const e of S.entities) if (isSoldier(e) && e.hp > 0 && Math.hypot(e.x - x, e.z - z) <= d.radius) e.hp = Math.min(maxHp(g, e), e.hp + maxHp(g, e) * MEND_FRACTION);
    g.events.push({ t: 'mend', x, z, team: 0 });
  } else {
    S.abil.rallyT = RALLY_TIME;
    g.events.push({ t: 'rally' });
  }
  return null;
}

// ---------- lairs & relics ----------
/** Scatter creature lairs over the island; nearer ones are weaker. Each holds one relic. */
export function setupLairs(g: Game) {
  const S = g.state, W = g.world, s = W.start;
  const sites: { x: number; z: number }[] = [];
  for (let tries = 0; tries < 20000 && sites.length < LAIR_GUARDS.length; tries++) {
    const x = 4 + Math.floor(g.rand() * (N - 8)), z = 4 + Math.floor(g.rand() * (N - 8));
    let ok = Math.hypot(x - s.x, z - s.z) >= 13;
    for (let dz = -1; dz <= 1 && ok; dz++) for (let dx = -1; dx <= 1; dx++) if (!W.isReach(x + dx, z + dz)) { ok = false; break; }
    if (!ok) continue;
    if (W.campSites.some((c) => Math.hypot(c.x - x, c.z - z) < 11)) continue;
    if (sites.some((o) => Math.hypot(o.x - x, o.z - z) < 9)) continue;
    // the two nearest lairs keep clear of crystals, so a first harvest is safe; deeper ones may guard one
    if (S.nodes.some((n) => Math.hypot(n.x - x, n.z - z) < (Math.hypot(x - s.x, z - s.z) < 26 ? 10 : 3.5))) continue;
    sites.push({ x, z });
  }
  sites.sort((a, b) => Math.hypot(a.x - s.x, a.z - s.z) - Math.hypot(b.x - s.x, b.z - s.z));
  // shuffle which relic sits where
  const relics = [...RELIC_IDS];
  for (let i = relics.length - 1; i > 0; i--) { const j = Math.floor(g.rand() * (i + 1)); [relics[i], relics[j]] = [relics[j], relics[i]]; }
  sites.forEach((site, i) => {
    const den = g.spawn('lair', 1, site.x + 0.5, site.z + 0.5, -1);
    den.lair = i;
    S.lairs.push({ x: site.x + 0.5, z: site.z + 0.5, alive: true, entId: den.id, relic: relics[i] });
    LAIR_GUARDS[i].forEach((k, gi) => {
      const a = (gi / LAIR_GUARDS[i].length) * Math.PI * 2 + i;
      const e = g.spawnNear(k, 1, site.x + 0.5 + Math.cos(a) * 2, site.z + 0.5 + Math.sin(a) * 2, -1);
      e.guard = true; e.lair = i;
    });
  });
}

/** A lair has fallen: its relic passes to the player. */
export function claimRelic(g: Game, lairIndex: number) {
  const S = g.state, L = S.lairs[lairIndex];
  if (!L || !L.alive) return;
  L.alive = false; S.stats.lairs++;
  const id = L.relic as RelicId;
  if (id === 'aegis') for (const e of S.entities) if (isSoldier(e)) e.hp *= 1.2;
  S.relics.push(id);
  g.events.push({ t: 'relic', id, x: L.x, z: L.z });
}
