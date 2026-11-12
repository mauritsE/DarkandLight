import { BUILDINGS, Good, TIERS, UNITS } from './defs';
import type { Game } from './game';

const approach = (v: number, target: number, rate: number) =>
  v < target ? Math.min(target, v + rate) : Math.max(target, v - rate);

export function tickEconomy(g: Game, dt: number) {
  const S = g.state, stock = S.stock, cap = g.storageCap();

  // --- workforce ---
  let jobs = 0;
  for (const b of S.buildings) {
    const d = BUILDINGS[b.type];
    if (d.workers && b.connected && !b.paused && b.resEff > 0) jobs += d.workers;
  }
  S.jobs = jobs;
  const workEff = jobs > 0 ? Math.min(1, S.pop / jobs) : 1;
  S.workEff = workEff;

  // --- production ---
  let upkeep = 0;
  let coverageDirty = false;
  for (const b of S.buildings) {
    const d = BUILDINGS[b.type];
    if (!b.paused) upkeep += d.upkeep;
    if (b.type === 'spire') {
      const was = (b.fuel ?? 0) > 0;
      b.fuel = Math.max(0, (b.fuel ?? 0) - dt);
      if (b.connected && b.fuel <= 0 && stock.shards >= 1) { stock.shards -= 1; b.fuel = d.cycle!; }
      b.status = !b.connected ? 'noRoad' : b.fuel > 0 ? 'ok' : 'noInput';
      if (was !== b.fuel > 0) coverageDirty = true;
      continue;
    }
    if (!d.cycle) { b.status = b.connected ? 'ok' : 'noRoad'; continue; }
    if (!b.connected) { b.status = 'noRoad'; continue; }
    if (b.paused) { b.status = 'paused'; continue; }
    if (b.resEff <= 0) { b.status = 'noResource'; continue; }
    if (b.progress < 1) {
      b.progress += (dt * workEff * b.resEff) / d.cycle;
      b.status = workEff < 0.5 ? 'noWorkers' : 'ok';
    }
    if (b.progress >= 1) {
      let ok = true;
      for (const k in d.inputs) if (stock[k as Good] < d.inputs[k as Good]!) { ok = false; b.status = 'noInput'; }
      if (ok) for (const k in d.outputs) if (stock[k as Good] >= cap) { ok = false; b.status = 'full'; }
      if (ok) {
        for (const k in d.inputs) stock[k as Good] -= d.inputs[k as Good]!;
        for (const k in d.outputs) stock[k as Good] = Math.min(cap, stock[k as Good] + d.outputs[k as Good]!);
        b.progress -= 1;
      } else b.progress = 1;
    }
  }
  if (coverageDirty) g.recomputeCoverage();

  // --- consumption ---
  const demand: Partial<Record<Good, number>> = {};
  for (const b of S.buildings) {
    if (b.type !== 'house') continue;
    const goods = TIERS[b.tier!].goods;
    for (const k in goods) demand[k as Good] = (demand[k as Good] ?? 0) + (b.residents! * goods[k as Good]! * dt) / 60;
  }
  for (const k of ['fish', 'bread', 'cloth'] as Good[]) {
    const dmd = demand[k] ?? 0;
    const have = dmd === 0 || stock[k] >= dmd;
    if (stock[k] >= dmd) stock[k] -= dmd; else stock[k] = 0;
    S.needSat[k] = approach(S.needSat[k] ?? 1, have ? 1 : 0, dt / 25);
  }

  // --- houses ---
  let pop = 0, taxes = 0, satSum = 0, houses = 0;
  for (const b of S.buildings) {
    if (b.type !== 'house') continue;
    const tier = TIERS[b.tier!];
    let sum = 0, n = 0;
    for (const k in tier.goods) { sum += S.needSat[k as Good] ?? 1; n++; }
    for (const sv of tier.services) { sum += b.cov?.[sv] ? 1 : 0; n++; }
    const sat = n ? sum / n : 1;
    b.sat = sat;
    const target = b.connected ? tier.cap * (0.3 + 0.7 * sat) : 0;
    b.residents = approach(b.residents!, target, dt * 0.45);
    const r = Math.floor(b.residents);
    pop += r; houses++; satSum += sat;
    taxes += r * tier.tax * (0.55 + 0.45 * sat);
    b.status = b.connected ? 'ok' : 'noRoad';

    // upgrade
    if (b.tier! < 2 && S.autoUpgrade && b.connected) {
      const next = TIERS[b.tier! + 1];
      const svcOk = next.services.every((sv) => !!b.cov?.[sv]);
      const ready = sat >= 0.95 && b.residents >= tier.cap - 0.5 && svcOk && S.peakPop >= (b.tier === 0 ? 40 : 80);
      if (ready) b.upT = (b.upT ?? 0) + dt; else b.upT = 0;
      if (b.upT! > 15 && g.canAfford(0, next.upgrade)) {
        g.pay(0, next.upgrade);
        b.tier!++; b.upT = 0;
        if (b.tier === 1) S.stats.t2++; else S.stats.t3++;
        g.events.push({ t: 'upgrade', id: b.id });
      }
    }
  }
  S.pop = pop;
  if (pop > S.peakPop) S.peakPop = pop;
  S.happiness = houses ? satSum / houses : 1;

  for (const e of S.entities) if (e.team === 0) upkeep += UNITS[e.kind].upkeep ?? 0;
  S.income = taxes - upkeep;
  S.gold += (S.income * dt) / 60;
  if (S.gold < -300) S.gold = -300;
}
