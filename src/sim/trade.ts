import { DEFAULT_BUY_MULT, GOODS, GOOD_IDS, Good, MERCHANTS } from './defs';
import type { Game } from './game';
import type { Ship } from './state';

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

export function tickTrade(g: Game, dt: number) {
  const S = g.state;
  const harbor = g.find('harbor');
  const active = !!harbor && harbor.connected;
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
