import {
  ARMY_PER_BARRACKS, BUILDINGS, BuildingId, CAMPS, Category, Cost, GOODS, GOOD_IDS, Good, MAX_BEACONS, MERCHANTS,
  ROAD_COST, TIERS, TRAINABLE, TRAIN_TIME, UNITS, UnitKind,
} from '../sim/defs';
import type { Game } from '../sim/game';
import { armyCap, armySize, canTrain, train } from '../sim/combat';
import { QUESTS } from '../sim/quests';
import { buy, buyPrice, sell, sellPrice } from '../sim/trade';
import type { Status } from '../sim/state';
import { N, T } from '../sim/world';
import type { PreviewKind, Renderer } from '../render/renderer';
import type { Sound } from './audio';

export interface App {
  game: Game; renderer: Renderer; sound: Sound;
  dark: boolean; tool: PreviewKind; speed: number;
  setTool(t: PreviewKind): void;
  toggleWorld(): void;
  setSpeed(n: number): void;
  selectAll(): void;
  newGame(): void;
}

const $ = (id: string) => document.getElementById(id)!;
const fmt = (n: number) => Math.floor(n).toLocaleString('en-US');
const STATUS: Record<Status, [string, boolean]> = {
  ok: ['Working', true], noRoad: ['No road to the Keep', false], noInput: ['Waiting for materials', false],
  full: ['Storage is full', false], noWorkers: ['Short of workers', false], noResource: ['No resource in reach', false], paused: ['Paused', false],
};
const TABS: [Category, string][] = [['civic', '🏠 Town'], ['production', '⚒️ Production'], ['war', '⚓ Trade & War']];

export class Hud {
  private tab: Category = 'civic';
  private panel: { kind: 'none' } | { kind: 'building'; id: number } = { kind: 'none' };
  private tradeTab: 'ships' | 'orders' = 'ships';
  private last: Record<string, string> = {};
  private mapBase: HTMLCanvasElement = document.createElement('canvas');
  private mapKey = '';
  private goodEls = {} as Record<Good, HTMLElement>;

  constructor(private app: App) {
    this.mapBase.width = this.mapBase.height = N;
    const tb = $('topbar');
    tb.innerHTML = `
      <div class="stat main" title="Gold">🪙 <b id="s-gold"></b> <small id="s-inc"></small></div>
      <div class="stat" title="Residents / jobs">👥 <b id="s-pop"></b> <small id="s-jobs"></small></div>
      <div class="stat" title="Happiness of your residents"><span id="s-face">😊</span> <b id="s-hap"></b></div>
      <div class="goods" id="s-goods"></div>
      <div class="sep"></div>
      <div class="speed"><button data-act="speed" data-n="0" title="Pause (P)">⏸</button><button data-act="speed" data-n="1">1×</button><button data-act="speed" data-n="2">2×</button><button data-act="speed" data-n="4">4×</button></div>
      <button data-act="mute" id="s-mute" title="Sound">🔊</button>
      <button data-act="menu" title="New game">☰</button>`;
    const goods = $('s-goods');
    for (const g of GOOD_IDS) {
      const el = document.createElement('div');
      el.className = 'stat'; el.title = GOODS[g].name;
      el.innerHTML = `${GOODS[g].icon} <b></b>`;
      goods.appendChild(el); this.goodEls[g] = el;
    }
    $('s-mute').textContent = app.sound.muted ? '🔇' : '🔊';

    document.addEventListener('pointerdown', (e) => {
      const el = (e.target as HTMLElement).closest('[data-act]') as HTMLElement | null;
      if (!el || (el as HTMLButtonElement).disabled || el.tagName === 'SELECT' || el.tagName === 'INPUT') return;
      e.preventDefault();
      this.act(el.dataset.act!, el.dataset);
    });
    document.addEventListener('change', (e) => {
      const el = e.target as HTMLInputElement;
      if (el.dataset?.act) this.act(el.dataset.act, el.dataset, el.value);
    });
    document.addEventListener('mouseover', (e) => this.tooltip((e.target as HTMLElement).closest('[data-tip]') as HTMLElement | null));
    $('minimap').addEventListener('pointerdown', (e) => {
      const r = $('minimap').getBoundingClientRect();
      const move = (ev: PointerEvent) => app.renderer.focus(((ev.clientX - r.left) / r.width) * N, ((ev.clientY - r.top) / r.height) * N);
      move(e);
      const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up); };
      window.addEventListener('pointermove', move); window.addEventListener('pointerup', up);
    });
    $('alert').addEventListener('pointerdown', () => app.toggleWorld());
  }

  private get g() { return this.app.game; }

  // ---------- actions ----------
  private act(a: string, d: DOMStringMap, value?: string) {
    const app = this.app, g = this.g, snd = app.sound;
    switch (a) {
      case 'speed': app.setSpeed(+d.n!); break;
      case 'mute': $('s-mute').textContent = snd.toggleMute() ? '🔇' : '🔊'; break;
      case 'menu': this.modal(`<h2>Dark &amp; Light</h2><p>Your city is saved automatically.</p><p><button data-act="closeModal">Resume</button> <button data-act="newGame">Start a new island</button></p>`); break;
      case 'closeModal': $('modal').classList.add('hidden'); break;
      case 'newGame': $('modal').classList.add('hidden'); app.newGame(); break;
      case 'tab': this.tab = d.t as Category; snd.click(); break;
      case 'tool': app.setTool(app.tool === d.t ? null : (d.t as PreviewKind)); snd.click(); break;
      case 'close': this.closePanel(); break;
      case 'demolish': if (g.demolish(+d.id!)) { snd.demolish(); this.closePanel(); } break;
      case 'pause': { const b = g.byId.get(+d.id!); if (b) b.paused = !b.paused; break; }
      case 'auto': g.state.autoUpgrade = !g.state.autoUpgrade; break;
      case 'train': { const r = train(g, d.k as UnitKind); if (r) { this.toast(r, 'warn'); snd.error(); } else snd.click(); break; }
      case 'selectAll': app.selectAll(); break;
      case 'ttab': this.tradeTab = d.t as 'ships' | 'orders'; break;
      case 'sell': case 'buy': {
        const ship = g.state.ships[+d.s!];
        const n = a === 'sell' ? sell(g, ship, d.g as Good, +d.n!) : buy(g, ship, d.g as Good, +d.n!);
        if (n) snd.coin(); else snd.error();
        break;
      }
      case 'omode': { const o = (g.state.orders[d.g as Good] ??= { mode: 'none', level: 20 }); o.mode = value as 'none' | 'sell' | 'buy'; break; }
      case 'olevel': { const o = (g.state.orders[d.g as Good] ??= { mode: 'none', level: 20 }); o.level = Math.max(0, Math.min(999, +value! || 0)); break; }
      case 'focusGate': { const e = g.gateEnt(); if (e) app.renderer.focus(e.x, e.z); break; }
    }
    this.refresh();
  }

  modal(html: string) { $('modal').innerHTML = `<div class="card">${html}</div>`; $('modal').classList.remove('hidden'); }
  openBuilding(id: number) { this.panel = { kind: 'building', id }; this.refresh(); }
  closePanel() { this.panel = { kind: 'none' }; this.refresh(); }

  toast(msg: string, kind: string = 'info') {
    const box = $('toasts');
    const el = document.createElement('div');
    el.className = `toast ${kind}`; el.textContent = msg;
    box.appendChild(el);
    while (box.children.length > 4) box.firstChild!.remove();
    setTimeout(() => (el.style.opacity = '0'), kind === 'warn' || kind === 'quest' ? 6000 : 4000);
    setTimeout(() => el.remove(), kind === 'warn' || kind === 'quest' ? 6700 : 4700);
  }

  // ---------- html helpers ----------
  private cost(gold: number, cost: Cost) {
    const S = this.g.state;
    let h = gold ? `<span class="pill ${S.gold < gold ? 'lack' : ''}">🪙 ${gold}</span>` : '';
    for (const k in cost) h += `<span class="pill ${S.stock[k as Good] < cost[k as Good]! ? 'lack' : ''}">${GOODS[k as Good].icon} ${cost[k as Good]}</span>`;
    return h || '<span class="pill">Free</span>';
  }
  private io(c?: Cost) { return c ? Object.entries(c).map(([k, v]) => `${v} ${GOODS[k as Good].icon}`).join(' + ') : ''; }

  private tooltip(el: HTMLElement | null) {
    const tip = $('tooltip');
    if (!el) { tip.classList.add('hidden'); return; }
    const [kind, id] = el.dataset.tip!.split(':');
    let h = '';
    if (kind === 'b') {
      const d = BUILDINGS[id as BuildingId];
      h = `<h3>${d.icon} ${d.name}</h3><p>${d.desc}</p><p>${this.cost(d.gold, d.cost)}</p>`;
      if (d.cycle && d.outputs) h += `<p class="muted">${d.inputs ? this.io(d.inputs) + ' → ' : ''}${this.io(d.outputs)} every ${d.cycle}s</p>`;
      if (d.upkeep || d.workers) h += `<p class="muted">${d.upkeep ? `Upkeep 🪙 ${d.upkeep}/min` : ''}${d.workers ? ` · 👥 ${d.workers} workers` : ''}</p>`;
      if (!this.g.unlocked(d.id)) h += `<p class="no">🔒 ${this.g.state.peakPop < d.unlockPop ? `Needs ${d.unlockPop} residents` : `Needs a ${BUILDINGS[d.requires!].name}`}</p>`;
    } else if (kind === 'u') {
      const d = UNITS[id as UnitKind];
      h = `<h3>${d.icon} ${d.name}</h3><p>${d.desc}</p><p>${this.cost(d.gold ?? 0, d.cost ?? {})}</p><p class="muted">❤ ${d.hp} · ⚔ ${d.dmg} · range ${d.range} · upkeep 🪙 ${d.upkeep}/min</p>`;
    } else if (kind === 't') {
      h = id === 'road' ? `<h3>🛤️ Road</h3><p>Connects buildings to the Keep. Drag to draw.</p><p><span class="pill">🪙 ${ROAD_COST} per tile</span></p>`
        : `<h3>🧨 Demolish</h3><p>Remove roads and buildings. Half the gold is refunded.</p>`;
    }
    tip.innerHTML = h; tip.classList.remove('hidden');
    const r = el.getBoundingClientRect(), tr = tip.getBoundingClientRect();
    tip.style.left = `${Math.max(6, Math.min(window.innerWidth - tr.width - 6, r.left + r.width / 2 - tr.width / 2))}px`;
    tip.style.top = `${Math.max(6, r.top - tr.height - 8)}px`;
  }

  private set(id: string, html: string) {
    if (this.last[id] === html) return;
    const el = $(id);
    if (id === 'panel') {
      const ae = document.activeElement;
      if (ae && el.contains(ae) && (ae.tagName === 'INPUT' || ae.tagName === 'SELECT')) return;
    }
    this.last[id] = html; el.innerHTML = html;
  }

  // ---------- refresh ----------
  refresh() {
    const g = this.g, S = g.state, app = this.app;
    // top bar
    $('s-gold').textContent = fmt(S.gold);
    const inc = Math.round(S.income);
    $('s-inc').innerHTML = `<span class="${inc >= 0 ? 'pos' : 'neg'}">${inc >= 0 ? '+' : ''}${inc}/min</span>`;
    $('s-pop').textContent = fmt(S.pop);
    $('s-jobs').innerHTML = `<span class="${S.jobs > S.pop ? 'neg' : ''}">${S.jobs} jobs</span>`;
    $('s-hap').textContent = `${Math.round(S.happiness * 100)}%`;
    $('s-face').textContent = S.happiness > 0.8 ? '😊' : S.happiness > 0.5 ? '😐' : '😟';
    const cap = g.storageCap();
    for (const k of GOOD_IDS) {
      const el = this.goodEls[k], v = Math.floor(S.stock[k]);
      (el.lastElementChild as HTMLElement).textContent = String(v);
      el.title = `${GOODS[k].name}: ${v} / ${cap}`;
      el.className = `stat${v === 0 ? ' zero' : ''}${v >= cap ? ' low' : ''}`;
    }
    document.querySelectorAll<HTMLElement>('.speed button').forEach((b) => b.classList.toggle('on', +b.dataset.n! === app.speed));

    // quest
    const q = QUESTS[S.quest];
    this.set('quest', q ? `<h3>📜 ${q.title}</h3><p>${q.text}</p><small>Reward: 🪙 ${q.reward} · ${S.quest + 1}/${QUESTS.length}</small>`
      : `<h3>🌅 Dawn Over All</h3><p>The island is yours, in both worlds. Keep building!</p>`);

    // world button / alert
    const gate = g.gateEnt(), wb = $('worldBtn');
    const raid = S.entities.some((e) => e.raid);
    wb.classList.toggle('locked', !gate);
    wb.classList.toggle('pulse', raid && !app.dark);
    wb.querySelector('small')!.textContent = !gate ? 'no gate' : app.dark ? 'to Light' : 'to Dark';
    const al = $('alert');
    al.classList.toggle('hidden', !(raid && !app.dark));
    if (raid && !app.dark) al.textContent = `⚔️ Raid on the Rift Gate! ${gate ? Math.ceil(gate.hp) : 0} HP`;

    this.bottom();
    this.renderPanel();
    this.minimap();
  }

  private bottom() {
    const g = this.g, S = g.state, app = this.app;
    let h = '';
    if (!app.dark) {
      h += `<div class="col">
        <button class="bbtn ${app.tool === 'road' ? 'on' : ''}" data-act="tool" data-t="road" data-tip="t:road"><span class="ic">🛤️</span><span class="nm">Road</span></button></div>
        <div class="col"><div class="tabs" style="margin:0">${TABS.map(([t, n]) => `<button class="${this.tab === t ? 'on' : ''}" data-act="tab" data-t="${t}">${n}</button>`).join('')}
        <span class="grow" style="flex:1"></span><button class="${app.tool === 'demolish' ? 'on' : ''}" data-act="tool" data-t="demolish" data-tip="t:demolish">🧨 Demolish</button></div><div class="items">`;
      for (const d of Object.values(BUILDINGS)) {
        if (d.hidden || d.category !== this.tab) continue;
        const un = g.unlocked(d.id), poor = !g.canAfford(d.gold, d.cost), done = d.unique && !!g.find(d.id);
        h += `<button class="bbtn ${app.tool === d.id ? 'on' : ''} ${un ? '' : 'locked'} ${poor && un ? 'poor' : ''}" data-act="tool" data-t="${d.id}" data-tip="b:${d.id}" ${un && !done ? '' : 'disabled'}>
          <span class="ic">${d.icon}</span><span class="nm">${d.name}</span>${un ? (done ? '<span class="lock">✓</span>' : '') : `<span class="lock">🔒${S.peakPop < d.unlockPop ? d.unlockPop : ''}</span>`}</button>`;
      }
      h += '</div></div>';
    } else {
      const cap = armyCap(g), n = armySize(g), sel = app.renderer.selected.size;
      const beacons = S.entities.filter((e) => e.kind === 'beacon').length;
      h += `<div class="col army"><div>⚔️ Army <b>${n}</b> / ${cap}</div><div class="muted">${sel ? `${sel} selected` : 'Drag to select'}</div>
        <button data-act="selectAll">Select all <kbd>F</kbd></button></div><div class="items">`;
      h += this.trainButtons();
      h += `<button class="bbtn ${app.tool === 'beacon' ? 'on' : ''}" data-act="tool" data-t="beacon" data-tip="u:beacon" ${beacons >= MAX_BEACONS ? 'disabled' : ''}><span class="ic">🕯️</span><span class="nm">Beacon</span><span class="lock">${beacons}/${MAX_BEACONS}</span></button>`;
      h += `</div><div class="col army muted" style="max-width:190px">${S.trainQ.length ? `Training ${UNITS[S.trainQ[0]].name}…<div class="bar"><i style="width:${(1 - S.trainT / TRAIN_TIME) * 100}%"></i></div>${S.trainQ.length > 1 ? `+${S.trainQ.length - 1} queued` : ''}`
        : 'Right-click to move or attack. Units heal near the Rift Gate.'}</div>`;
    }
    this.set('bottombar', h);
  }

  private trainButtons() {
    const g = this.g, q = g.state.trainQ;
    return TRAINABLE.map((k) => {
      const d = UNITS[k], why = canTrain(g, k), cnt = q.filter((x) => x === k).length;
      return `<button class="bbtn ${why ? 'poor' : ''}" data-act="train" data-k="${k}" data-tip="u:${k}"><span class="ic">${d.icon}</span><span class="nm">${d.name}</span>${cnt ? `<span class="q">+${cnt}</span>` : ''}</button>`;
    }).join('');
  }

  private renderPanel() {
    const g = this.g, S = g.state, p = this.panel, el = $('panel');
    const b = p.kind === 'building' ? g.byId.get(p.id) : undefined;
    if (!b) { this.panel = { kind: 'none' }; el.classList.add('hidden'); return; }
    el.classList.remove('hidden');
    const d = BUILDINGS[b.type], [st, ok] = STATUS[b.status];
    let h = `<button class="x" data-act="close">✕</button>`;
    if (b.type === 'house') {
      const t = TIERS[b.tier!];
      h += `<h2>🏠 ${t.name}' Home</h2><p class="muted">${Math.floor(b.residents!)} / ${t.cap} residents · tax 🪙 ${t.tax.toFixed(1)}/resident/min</p>
        <div class="bar"><i style="width:${(b.sat ?? 0) * 100}%"></i></div><p>Needs</p>`;
      if (!b.connected) h += `<p class="no">✗ No road to the Keep</p>`;
      for (const k in t.goods) { const s = S.needSat[k as Good] ?? 1; h += `<div class="row"><span class="${s > 0.6 ? 'ok' : 'no'}">${s > 0.6 ? '✓' : '✗'}</span> ${GOODS[k as Good].icon} ${GOODS[k as Good].name}</div>`; }
      for (const sv of t.services) h += `<div class="row"><span class="${b.cov?.[sv] ? 'ok' : 'no'}">${b.cov?.[sv] ? '✓' : '✗'}</span> ${BUILDINGS[sv].icon} ${BUILDINGS[sv].name} nearby</div>`;
      if (b.tier! < 2) {
        const nx = TIERS[b.tier! + 1], miss = nx.services.filter((sv) => !b.cov?.[sv]);
        h += `<p class="muted">Rises to <b>${nx.name}</b> when full and content${miss.length ? `, with a ${miss.map((m) => BUILDINGS[m].name).join(' & ')} nearby` : ''}${S.peakPop < (b.tier ? 80 : 40) ? ` (city needs ${b.tier ? 80 : 40} residents)` : ''}. Cost: ${this.cost(0, nx.upgrade)}</p>`;
        if ((b.upT ?? 0) > 0) h += `<div class="bar"><i style="width:${Math.min(100, (b.upT! / 15) * 100)}%"></i></div>`;
      }
      h += `<div class="row"><button data-act="auto">${S.autoUpgrade ? '☑' : '☐'} Auto-upgrade homes</button></div>`;
    } else {
      h += `<h2>${d.icon} ${d.name}</h2><p class="${ok ? 'ok' : 'no'}">${ok ? '●' : '▲'} ${st}</p><p class="muted">${d.desc}</p>`;
      if (d.cycle && d.outputs) {
        h += `<p>${d.inputs ? this.io(d.inputs) + ' → ' : ''}${this.io(d.outputs)} every ${d.cycle}s</p><div class="bar"><i style="width:${Math.min(1, b.progress) * 100}%"></i></div>
          <p class="muted">Efficiency ${Math.round(S.workEff * b.resEff * 100)}%${d.needs === 'forest' ? ` · forest ${Math.round(b.resEff * 100)}%` : ''} · 👥 ${d.workers}</p>`;
      }
      if (b.type === 'spire') h += `<p>Burns 1 🔮 every ${d.cycle}s</p><div class="bar"><i style="width:${((b.fuel ?? 0) / d.cycle!) * 100}%"></i></div>`;
      if (b.type === 'warehouse' || b.type === 'townhall') h += `<p>Storage limit: <b>${g.storageCap()}</b> per good</p>`;
      if (b.type === 'townhall') h += `<p class="muted">Peak population ${S.peakPop}. ${S.pop} residents fill ${S.jobs} jobs.</p>`;
      if (b.type === 'harbor') h += this.tradeHtml();
      if (b.type === 'barracks') h += `<p>Army ${armySize(g)} / ${armyCap(g)} <span class="muted">(${ARMY_PER_BARRACKS} per barracks)</span></p><div class="row">${this.trainButtons()}</div>${S.trainQ.length ? `<div class="bar"><i style="width:${(1 - S.trainT / TRAIN_TIME) * 100}%"></i></div>` : ''}<p class="muted">Soldiers appear at the Rift Gate in the Dark World.</p>`;
      if (b.type === 'gate') {
        const e = g.gateEnt();
        h += `<p>${e?.down ? `<span class="no">Breached — restoring in ${Math.ceil(S.gateDown)}s</span>` : `Integrity ${Math.ceil(e?.hp ?? 0)} / ${UNITS.gate.hp}`}</p><div class="bar"><i style="width:${((e?.hp ?? 0) / UNITS.gate.hp) * 100}%"></i></div>
          <p class="muted">Strongholds standing: ${S.camps.map((c, i) => (c.alive ? CAMPS[i].name : '')).filter(Boolean).join(', ') || 'none'}.${S.camps.some((c) => c.alive) ? ` Next raid in about ${Math.max(0, Math.ceil(S.raidTimer / 10) * 10)}s.` : ''}</p>`;
      }
      h += `<div class="row" style="margin-top:8px">`;
      if (d.cycle && d.outputs) h += `<button data-act="pause" data-id="${b.id}">${b.paused ? '▶ Resume' : '⏸ Pause'}</button>`;
      if (b.type !== 'townhall' && b.type !== 'gate') h += `<span class="grow"></span><button data-act="demolish" data-id="${b.id}">🧨 Demolish</button>`;
      h += `</div>`;
    }
    this.set('panel', h);
  }

  private tradeHtml() {
    const g = this.g, S = g.state;
    let h = `<div class="tabs"><button class="${this.tradeTab === 'ships' ? 'on' : ''}" data-act="ttab" data-t="ships">Ships in port</button><button class="${this.tradeTab === 'orders' ? 'on' : ''}" data-act="ttab" data-t="orders">Standing orders</button></div>`;
    if (this.tradeTab === 'orders') {
      h += `<p class="muted">Carried out automatically whenever a ship is docked.</p><table class="trade"><tr><th>Good</th><th>Have</th><th>Order</th><th>Keep</th></tr>`;
      for (const k of GOOD_IDS) {
        const o = S.orders[k] ?? { mode: 'none', level: 20 };
        h += `<tr><td>${GOODS[k].icon} ${GOODS[k].name}</td><td>${Math.floor(S.stock[k])}</td><td><select data-act="omode" data-g="${k}">
          ${(['none', 'sell', 'buy'] as const).map((m) => `<option value="${m}" ${o.mode === m ? 'selected' : ''}>${m === 'none' ? '—' : m === 'sell' ? 'Sell above' : 'Buy below'}</option>`).join('')}</select></td>
          <td><input type="number" min="0" max="999" value="${o.level}" data-act="olevel" data-g="${k}"></td></tr>`;
      }
      return h + '</table>';
    }
    S.ships.forEach((sh, si) => {
      const m = MERCHANTS[sh.merchant];
      const col = `#${m.color.toString(16).padStart(6, '0')}`;
      const phase = sh.phase === 'docked' ? `<span class="ok">Docked — leaves in ${Math.ceil(sh.t)}s</span>` : sh.phase === 'arriving' ? 'Sailing in…' : sh.phase === 'leaving' ? 'Setting sail' : `At sea — back in ~${Math.ceil(sh.t / 10) * 10}s`;
      h += `<div class="ship" style="border-left-color:${col}"><b>⛵ ${m.name}</b> <span class="muted">· ${m.captain}</span><br>${phase}`;
      if (sh.phase === 'docked') {
        h += `<table class="trade"><tr><th>Good</th><th>Have</th><th colspan="2">Sell for</th><th colspan="2">Buy for</th></tr>`;
        for (const k of GOOD_IDS) {
          const have = Math.floor(S.stock[k]), st = sh.stock[k] ?? 0, fav = (m.buys[k] ?? 0) >= 1;
          if (!have && !st) continue;
          h += `<tr><td title="${GOODS[k].name}">${GOODS[k].icon}</td><td>${have}</td><td class="${fav ? 'ok' : ''}">${sellPrice(g, sh, k)}🪙</td>
            <td><button data-act="sell" data-s="${si}" data-g="${k}" data-n="1" ${have ? '' : 'disabled'}>1</button><button data-act="sell" data-s="${si}" data-g="${k}" data-n="10" ${have ? '' : 'disabled'}>10</button></td>`;
          h += st ? `<td>${buyPrice(g, sh, k)}🪙 <span class="muted">(${st})</span></td><td><button data-act="buy" data-s="${si}" data-g="${k}" data-n="1">1</button><button data-act="buy" data-s="${si}" data-g="${k}" data-n="10">10</button></td></tr>`
            : '<td class="muted">—</td><td></td></tr>';
        }
        h += '</table>';
      } else {
        const likes = Object.entries(m.buys).filter(([, v]) => v! >= 1).map(([k]) => GOODS[k as Good].icon).join(' ');
        h += `<br><span class="muted">Pays well for ${likes} · sells ${Object.keys(m.sells).map((k) => GOODS[k as Good].icon).join(' ')}</span>`;
      }
      h += '</div>';
    });
    return h;
  }

  // ---------- minimap ----------
  private minimap() {
    const g = this.g, W = g.world, app = this.app;
    const key = `${g.terrainVer}:${app.dark}:${g.state.seed}`;
    if (key !== this.mapKey) {
      this.mapKey = key;
      const x = this.mapBase.getContext('2d')!, img = x.createImageData(N, N);
      const L = [[42, 110, 160], [228, 214, 160], [128, 184, 82], [78, 140, 62], [150, 148, 144]];
      const D = [[10, 7, 22], [50, 42, 74], [44, 34, 72], [30, 26, 56], [22, 18, 30]];
      for (let i = 0; i < N * N; i++) {
        let c = (app.dark ? D : L)[W.type[i]];
        if (g.blight[i] && W.type[i] !== T.Water) c = app.dark ? [90, 24, 50] : [92, 74, 110];
        img.data.set([c[0], c[1], c[2], 255], i * 4);
      }
      x.putImageData(img, 0, 0);
    }
    const cv = $('minimap') as HTMLCanvasElement, x = cv.getContext('2d')!, k = cv.width / N;
    x.imageSmoothingEnabled = false;
    x.drawImage(this.mapBase, 0, 0, cv.width, cv.height);
    x.fillStyle = app.dark ? 'rgba(180,170,220,0.45)' : '#d8c8a0';
    for (const i of g.state.roads) x.fillRect((i % N) * k, ((i / N) | 0) * k, k, k);
    for (const b of g.state.buildings) {
      const s = BUILDINGS[b.type].size;
      x.fillStyle = b.type === 'gate' ? '#c080ff' : app.dark ? 'rgba(200,210,255,0.55)' : b.type === 'house' ? '#b5482f' : b.type === 'townhall' ? '#2c4f9a' : '#6a4a2a';
      x.fillRect(b.x * k, b.z * k, s * k, s * k);
    }
    g.state.camps.forEach((c, i) => {
      const s = W.campSites[i];
      x.beginPath(); x.arc((s.x + 0.5) * k, (s.z + 0.5) * k, 4.5, 0, 7);
      x.fillStyle = c.alive ? `#${CAMPS[i].color.toString(16).padStart(6, '0')}` : '#ffe9a8'; x.fill();
      x.strokeStyle = '#000'; x.lineWidth = 1; x.stroke();
    });
    if (app.dark || g.state.entities.some((e) => e.raid)) {
      for (const e of g.state.entities) {
        if (e.kind === 'camp' || e.kind === 'gate') continue;
        x.fillStyle = e.team === 0 ? '#ffe08a' : '#ff4a6a';
        if (e.team === 1 && !app.dark && !e.raid) continue;
        x.fillRect(e.x * k - 1.5, e.z * k - 1.5, 3, 3);
      }
    }
    const c = app.renderer.cam;
    x.strokeStyle = '#fff'; x.lineWidth = 1.5;
    x.beginPath(); x.arc(c.x * k, c.z * k, Math.max(4, c.dist * 0.28 * k), 0, 7); x.stroke();
  }
}
