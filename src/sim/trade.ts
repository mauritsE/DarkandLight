import { BUILDINGS, DEFAULT_BUY_MULT, GOODS, GOOD_IDS, Good, MERCHANTS } from './defs';
import type { Game } from './game';
import type { Contract, Ship } from './state';

/** Price the merchant pays you per unit. */
export function sellPrice(g: Game, ship: Ship, good: Good) {
  const m = MERCHANTS[ship.merchant];
  const rep = 1 + Math.min(0.1, g.state.rep[ship.merchant] / 3000);
  return Math.max(1, Math.round(GOODS[good].price * (m.buys[good] ?? DEFAULT_BUY_MULT) * rep));
}
/** Price you pay the merchant per unit (only for goods the ship carries). */
export function buyPrice(g: Game, ship: Ship, good: Good) {
  const m = MERCHANTS[ship.merchant];
  const rep = 1 - Math.min(0.1, g.state.rep[ship.merchant] / 3000);
  return Math.max(1, Math.round(GOODS[good].price * (m.sells[good]?.mult ?? 1.5) * rep));
}

export function sell(g: Game, ship: Ship, good: Good, n: number): number {
  if (ship.phase !== 'docked') return 0;
  n = Math.min(n, Math.floor(g.state.stock[good]));
  if (n <= 0) return 0;
  const v = n * sellPrice(g, ship, good);
  g.state.stock[good] -= n; g.state.gold += v;
  g.state.rep[ship.merchant] += v; g.state.stats.trades += n;
  return n;
}

export function buy(g: Game, ship: Ship, good: Good, n: number): number {
  if (ship.phase !== 'docked') return 0;
  const p = buyPrice(g, ship, good);
  n = Math.min(n, ship.stock[good] ?? 0, Math.floor(g.state.gold / p), Math.floor(g.storageCap() - g.state.stock[good]));
  if (n <= 0) return 0;
  ship.stock[good]! -= n; g.state.stock[good] += n; g.state.gold -= n * p;
  g.state.rep[ship.merchant] += n * p; g.state.stats.trades += n;
  return n;
}

/** Goods a merchant might ask for: only things the player can already make. */
function contractGoods(g: Game): Good[] {
  const made = new Set<Good>();
  for (const b of g.state.buildings) for (const k in BUILDINGS[b.type].outputs) made.add(k as Good);
  return [...made];
}

export function canDeliver(g: Game, c: Contract): string | null {
  if (g.state.stock[c.good] < c.qty) return `Need ${c.qty} ${GOODS[c.good].name}`;
  if (g.state.ships[c.merchant].phase !== 'docked') return `Wait for the ${MERCHANTS[c.merchant].name} ship`;
  return null;
}
export function deliver(g: Game, i: number): boolean {
  const c = g.state.contracts[i];
  if (!c || canDeliver(g, c)) return false;
  g.state.stock[c.good] -= c.qty; g.state.gold += c.reward;
  g.state.rep[c.merchant] += c.reward * 1.5; g.state.stats.trades += c.qty; g.state.stats.contracts++;
  g.state.contracts.splice(i, 1);
  g.toast(`📜 Contract fulfilled for the ${MERCHANTS[c.merchant].name}: +${c.reward} gold.`, 'good');
  return true;
}

export function tickTrade(g: Game, dt: number) {
  const S = g.state;
  const harbor = g.find('harbor');
  const active = !!harbor && harbor.connected;
  // --- contracts ---
  for (let i = S.contracts.length - 1; i >= 0; i--) {
    S.contracts[i].t -= dt;
    if (S.contracts[i].t <= 0) { g.toast(`A contract with the ${MERCHANTS[S.contracts[i].merchant].name} has lapsed.`, 'info'); S.contracts.splice(i, 1); }
  }
  if (active) {
    S.contractT -= dt;
    if (S.contractT <= 0) {
      S.contractT = 150 + g.rand() * 90;
      const goods = contractGoods(g).filter((k) => !S.contracts.some((c) => c.good === k));
      if (S.contracts.length < 2 && goods.length) {
        const good = goods[Math.floor(g.rand() * goods.length)], merchant = Math.floor(g.rand() * MERCHANTS.length);
        const qty = Math.min(50, Math.max(8, Math.round((140 + g.rand() * 160) / GOODS[good].price / 2) * 2));
        const reward = Math.round((qty * GOODS[good].price * (1.5 + g.rand() * 0.4)) / 10) * 10;
        S.contracts.push({ merchant, good, qty, reward, t: 600 });
        g.toast(`📜 ${MERCHANTS[merchant].captain} offers a contract: ${qty} ${GOODS[good].name} for ${reward} gold.`, 'info');
      }
    }
  }
  for (const ship of S.ships) {
    if (!active && ship.phase === 'away') continue;
    ship.t -= dt;
    if (ship.phase === 'docked') {
      // standing orders: up to ~2 units per second per good
      const n = Math.max(1, Math.round(dt * 2 + g.rand() * 0.5));
      for (const good of GOOD_IDS) {
        const o = S.orders[good];
        if (!o || o.mode === 'none') continue;
        if (o.mode === 'sell' && S.stock[good] > o.level) sell(g, ship, good, Math.min(n, Math.floor(S.stock[good] - o.level)));
        else if (o.mode === 'buy' && S.stock[good] < o.level && ship.stock[good]) buy(g, ship, good, Math.min(n, Math.ceil(o.level - S.stock[good])));
      }
    }
    if (ship.t > 0) continue;
    const m = MERCHANTS[ship.merchant];
    if (ship.phase === 'away') {
      ship.phase = 'arriving'; ship.t = 14;
      ship.stock = {};
      for (const k in m.sells) ship.stock[k as Good] = m.sells[k as Good]!.qty;
    } else if (ship.phase === 'arriving') {
      ship.phase = 'docked'; ship.t = 70;
      g.toast(`${m.captain} of the ${m.name} has docked at your harbor.`, 'info');
      g.events.push({ t: 'trade' });
    } else if (ship.phase === 'docked') {
      ship.phase = 'leaving'; ship.t = 14;
    } else {
      ship.phase = 'away'; ship.t = 50 + g.rand() * 40;
    }
  }
}
