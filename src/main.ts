import './ui/style.css';
import { BUILDINGS, BuildingId, CAMPS, DIFFICULTY, GOODS, ROAD_COST, UNITS } from './sim/defs';
import { Game } from './sim/game';
import { canPlaceBeacon, orderAttack, orderAttackMove, orderMove, placeBeacon } from './sim/combat';
import { N } from './sim/world';
import { PreviewKind, Renderer } from './render/renderer';
import { Sound } from './ui/audio';
import { App, Hud } from './ui/hud';

const SAVE_KEY = 'dal-save-v4';
const canvas = document.getElementById('c') as HTMLCanvasElement;
const $ = (id: string) => document.getElementById(id)!;

const renderer = new Renderer(canvas);
const sound = new Sound();
let started = false;
let switching = false;
let difficulty = 1;
const urlSeed = Number(new URLSearchParams(location.search).get('seed'));
let seedUsed = false;
/** A random island, or the one named by ?seed=N for the first game of this page load. */
const newSeed = () => { if (urlSeed > 0 && !seedUsed) { seedUsed = true; return urlSeed | 0; } return (Math.random() * 1e9) | 0; };

const app: App = {
  game: Game.create(newSeed()),
  renderer, sound, dark: false, tool: null, speed: 1, charge: false,
  setTool(t) {
    if (t && t !== 'road' && t !== 'demolish' && t !== 'beacon' && !app.game.unlocked(t)) return;
    app.tool = t; renderer.setPreview(t);
    if (t) hud.closePanel(); else hud.hint('');
    canvas.style.cursor = t ? 'crosshair' : '';
  },
  toggleWorld() {
    if (switching || !started) return;
    if (!app.game.gateEnt()) { hud.toast('Raise a Rift Gate to cross into the Dark World.', 'warn'); sound.error(); return; }
    switching = true;
    const to = !app.dark, rift = $('rift');
    rift.className = to ? 'in' : 'in tolight';
    sound.setDark(to);
    setTimeout(() => {
      app.dark = to; app.setTool(null);
      document.body.classList.toggle('dark', to);
      renderer.setDark(to);
      app.charge = false;
      if (to) {
        if (!app.game.state.stats.visitedDark) hud.toast('Pink shard crystals glow across the dark island. Stand soldiers beside one to harvest it.', 'info');
        app.game.state.stats.visitedDark = true;
        const g = app.game.gateEnt()!; renderer.focus(g.x, g.z);
      }
      hud.closePanel();
      rift.className = to ? 'out' : 'out tolight';
      setTimeout(() => { rift.className = ''; switching = false; }, 620);
    }, 470);
  },
  setSpeed(n) { app.speed = n; },
  selectAll() {
    renderer.selected.clear();
    for (const e of app.game.state.entities) if (e.team === 0 && UNITS[e.kind].speed > 0) renderer.selected.add(e.id);
  },
  newGame() { startGame(Game.create(newSeed(), app.game.state.difficulty)); },
  toggleGfx() {
    const low = !renderer.low;
    renderer.setQuality(low);
    localStorage.setItem('dal-gfx', low ? 'low' : 'high');
    return low;
  },
  retreat() {
    const g = app.game.gateEnt(), ids = [...renderer.selected];
    if (!g || !ids.length) return;
    orderMove(app.game, ids, g.x + 2.2, g.z + 2.2);
    renderer.moveMarker(g.x + 2.2, g.z + 2.2, false); sound.order();
  },
};
const hud = new Hud(app);
renderer.setGame(app.game);
if (localStorage.getItem('dal-gfx') === 'low' || new URLSearchParams(location.search).get('gfx') === 'low') renderer.setQuality(true);

function startGame(g: Game) {
  app.game = g; app.dark = false; app.tool = null; app.speed = 1;
  document.body.classList.remove('dark');
  renderer.setGame(g); renderer.setPreview(null);
  hud.closePanel();
  started = true;
  document.body.classList.add('started');
  hud.refresh();
  $('title').classList.add('gone');
  sound.start();
  save();
}
function save() { try { localStorage.setItem(SAVE_KEY, app.game.serialize()); } catch { /* storage unavailable */ } }

const saved = localStorage.getItem(SAVE_KEY);
if (saved) $('btnContinue').classList.remove('hidden');
$('btnNew').addEventListener('click', () => startGame(difficulty === 1 ? app.game : Game.create(app.game.state.seed, difficulty)));
const diffBox = $('difficulty');
diffBox.innerHTML = DIFFICULTY.map((d, i) => `<button data-d="${i}" class="${i === 1 ? 'on' : ''}" title="${d.desc}">${d.name}</button>`).join('');
diffBox.addEventListener('click', (e) => {
  const b = (e.target as HTMLElement).closest('button');
  if (!b) return;
  difficulty = +b.dataset.d!;
  diffBox.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
  $('diffDesc').textContent = DIFFICULTY[difficulty].desc;
});
$('btnContinue').addEventListener('click', () => {
  const g = saved ? Game.load(saved) : null;
  if (g) startGame(g); else { hud.toast('The saved game could not be read. Starting a new island.', 'warn'); startGame(app.game); }
});
$('worldBtn').addEventListener('click', () => app.toggleWorld());

// ---------- input ----------
const keys = new Set<string>();
const mouse = { x: 0, y: 0 };
type Drag = { kind: 'pan' | 'paint' | 'box' | 'rotate'; sx: number; sy: number; moved: boolean; gx: number; gz: number; lastTile: number; button: number };
let drag: Drag | null = null;

function hoverTile(cx: number, cy: number, size: number) {
  const p = renderer.screenToGround(cx, cy);
  if (!p) return null;
  return { tx: Math.floor(p.x - size / 2 + 0.5), tz: Math.floor(p.z - size / 2 + 0.5), x: p.x, z: p.z };
}
const toolSize = (t: PreviewKind) => (!t || t === 'road' || t === 'demolish' || t === 'beacon' ? 1 : BUILDINGS[t].size);

function applyTool(cx: number, cy: number, dragging: boolean) {
  const t = app.tool, g = app.game;
  if (!t) return;
  const h = hoverTile(cx, cy, toolSize(t));
  if (!h) return;
  if (t === 'road' || t === 'demolish') {
    const idx = h.tz * N + h.tx;
    if (dragging && drag && drag.lastTile === idx) return;
    // fill an L-shaped line from the previous tile so fast drags leave no gaps
    let x = drag && drag.lastTile >= 0 ? drag.lastTile % N : h.tx, z = drag && drag.lastTile >= 0 ? (drag.lastTile / N) | 0 : h.tz;
    const stepOnce = (px: number, pz: number) => {
      if (t === 'road') { const r = g.placeRoad(px, pz); if (r.ok) sound.road(); else if (!dragging && r.reason !== 'Tile is occupied') { hud.toast(r.reason!, 'warn'); sound.error(); } }
      else if (g.demolishAt(px, pz)) sound.demolish();
    };
    if (!dragging || !drag || drag.lastTile < 0) stepOnce(h.tx, h.tz);
    while (x !== h.tx) { x += Math.sign(h.tx - x); stepOnce(x, z); }
    while (z !== h.tz) { z += Math.sign(h.tz - z); stepOnce(x, z); }
    if (drag) drag.lastTile = idx;
    return;
  }
  if (dragging) return;
  if (t === 'beacon') {
    const r = placeBeacon(g, h.x, h.z);
    if (r) { hud.toast(r, 'warn'); sound.error(); } else sound.place();
    return;
  }
  const r = g.place(t, h.tx, h.tz);
  if (r.ok) {
    sound.place();
    if (BUILDINGS[t].unique || !g.unlocked(t)) app.setTool(null);
  } else { hud.toast(r.reason!, 'warn'); sound.error(); }
}

canvas.addEventListener('contextmenu', (e) => e.preventDefault());
const touches = new Map<number, { x: number; y: number }>();
let pinch = 0;
const endTouch = (e: PointerEvent) => { touches.delete(e.pointerId); pinch = 0; };
canvas.addEventListener('pointercancel', endTouch);
canvas.addEventListener('pointerdown', (e) => {
  if (!started) return;
  canvas.setPointerCapture(e.pointerId);
  if (e.pointerType === 'touch') {
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 2) { drag = null; pinch = 0; return; }
  }
  const p = renderer.screenToGround(e.clientX, e.clientY);
  drag = { kind: 'pan', sx: e.clientX, sy: e.clientY, moved: false, gx: p?.x ?? 0, gz: p?.z ?? 0, lastTile: -1, button: e.button };
  if (e.button === 2) { drag.kind = 'rotate'; return; }
  if (e.button === 1) return;
  if (app.tool) {
    drag.kind = 'paint';
    applyTool(e.clientX, e.clientY, false);
  } else if (app.dark && e.pointerType !== 'touch') drag.kind = 'box';
});
canvas.addEventListener('pointermove', (e) => {
  mouse.x = e.clientX; mouse.y = e.clientY;
  if (touches.has(e.pointerId)) {
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size === 2) {
      const [a, b] = [...touches.values()], d = Math.hypot(a.x - b.x, a.y - b.y);
      if (pinch) renderer.cam.tdist *= pinch / d;
      pinch = d;
      return;
    }
  }
  if (!drag) return;
  const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
  if (Math.hypot(dx, dy) > 5) drag.moved = true;
  if (drag.kind === 'rotate') {
    if (drag.moved) { renderer.cam.tyaw -= e.movementX * 0.006; renderer.cam.yaw = renderer.cam.tyaw; }
  } else if (drag.kind === 'pan' && drag.moved) {
    const p = renderer.screenToGround(e.clientX, e.clientY);
    if (p) { const c = renderer.cam; c.tx += drag.gx - p.x; c.tz += drag.gz - p.z; c.x = c.tx; c.z = c.tz; renderer.frame(0); }
  } else if (drag.kind === 'paint') applyTool(e.clientX, e.clientY, true);
  else if (drag.kind === 'box' && drag.moved) {
    const s = $('selbox').style;
    $('selbox').classList.remove('hidden');
    s.left = `${Math.min(drag.sx, e.clientX)}px`; s.top = `${Math.min(drag.sy, e.clientY)}px`;
    s.width = `${Math.abs(dx)}px`; s.height = `${Math.abs(dy)}px`;
  }
});
canvas.addEventListener('pointerup', (e) => {
  const d = drag; drag = null;
  endTouch(e);
  $('selbox').classList.add('hidden');
  if (!d || !started) return;
  const g = app.game, sel = renderer.selected;
  if (d.kind === 'box' && d.moved) {
    if (!e.shiftKey) sel.clear();
    for (const id of renderer.unitsInRect(d.sx, d.sy, e.clientX, e.clientY)) sel.add(id);
    if (sel.size) sound.click();
    return;
  }
  if (d.moved || d.kind === 'paint') return;
  // --- clicks ---
  if (d.button === 2) {
    if (app.tool) { app.setTool(null); return; }
    if (app.dark) command(e.clientX, e.clientY);
    else hud.closePanel();
    return;
  }
  if (d.button !== 0) return;
  if (app.dark) {
    const own = renderer.entityAt(e.clientX, e.clientY, 0);
    const ownE = g.entById.get(own);
    if (ownE && UNITS[ownE.kind].speed > 0) {
      if (!e.shiftKey) sel.clear();
      sel.add(own); sound.click();
    } else if (sel.size && (e.pointerType === 'touch' || renderer.entityAt(e.clientX, e.clientY, 1))) command(e.clientX, e.clientY);
    else if (ownE?.kind === 'gate') { const b = g.find('gate'); if (b) hud.openBuilding(b.id); }
    else sel.clear();
    return;
  }
  const p = renderer.screenToGround(e.clientX, e.clientY);
  if (!p) return;
  const b = g.byId.get(g.occ[Math.floor(p.z) * N + Math.floor(p.x)] ?? 0);
  if (b && g.world.inb(Math.floor(p.x), Math.floor(p.z))) { hud.openBuilding(b.id); sound.click(); } else hud.closePanel();
});

function command(cx: number, cy: number) {
  const ids = [...renderer.selected];
  if (!ids.length) return;
  const enemy = renderer.entityAt(cx, cy, 1);
  const charge = app.charge || keys.has('shift');
  app.charge = false;
  if (enemy) {
    orderAttack(app.game, ids, enemy);
    const e = app.game.entById.get(enemy)!;
    renderer.moveMarker(e.x, e.z, true);
  } else {
    const p = renderer.screenToGround(cx, cy);
    if (!p) return;
    if (charge) orderAttackMove(app.game, ids, p.x, p.z); else orderMove(app.game, ids, p.x, p.z);
    renderer.moveMarker(p.x, p.z, charge);
  }
  sound.order();
}

canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  renderer.cam.tdist *= Math.exp(Math.sign(e.deltaY) * Math.min(0.25, Math.abs(e.deltaY) * 0.0015));
}, { passive: false });

window.addEventListener('keydown', (e) => {
  if ((e.target as HTMLElement).tagName === 'INPUT' || (e.target as HTMLElement).tagName === 'SELECT') return;
  const k = e.key.toLowerCase();
  keys.add(k);
  if (!started) return;
  if (k === 'tab' || k === ' ') { e.preventDefault(); app.toggleWorld(); }
  else if (k === 'escape') { if (app.tool) app.setTool(null); else if (renderer.selected.size) renderer.selected.clear(); else hud.closePanel(); }
  else if (k === 'p') app.setSpeed(app.speed ? 0 : 1);
  else if (k === '1') app.setSpeed(1);
  else if (k === '2') app.setSpeed(2);
  else if (k === '3') app.setSpeed(4);
  else if (k === 'r' && !app.dark) app.setTool(app.tool === 'road' ? null : 'road');
  else if (k === 'x' && !app.dark) app.setTool(app.tool === 'demolish' ? null : 'demolish');
  else if (k === 'f' && app.dark) app.selectAll();
  else if (k === 'c' && app.dark) app.charge = !app.charge;
  else if (k === 'g' && app.dark) app.retreat();
  else if (k === 'l') document.querySelector<HTMLElement>('[data-act="ledger"]')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
  else if (k === 'h') { const s = app.game.world.start; renderer.focus(s.x, s.z); }
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));
window.addEventListener('blur', () => keys.clear());
window.addEventListener('resize', () => renderer.resize());
window.addEventListener('beforeunload', () => { if (started) save(); });

// ---------- loop ----------
let last = performance.now(), acc = 0, hudT = 0, saveT = 0;
function loop(now: number) {
  requestAnimationFrame(loop);
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  const c = renderer.cam;

  if (!started) c.tyaw += dt * 0.05;
  else {
    // camera keys
    const sp = c.dist * 0.9 * dt, fx = -Math.sin(c.yaw), fz = -Math.cos(c.yaw);
    let mx = 0, mz = 0;
    if (keys.has('w') || keys.has('arrowup')) { mx += fx; mz += fz; }
    if (keys.has('s') || keys.has('arrowdown')) { mx -= fx; mz -= fz; }
    if (keys.has('a') || keys.has('arrowleft')) { mx += fz; mz -= fx; }
    if (keys.has('d') || keys.has('arrowright')) { mx -= fz; mz += fx; }
    c.tx += mx * sp; c.tz += mz * sp;
    if (keys.has('q')) c.tyaw += dt * 1.6;
    if (keys.has('e')) c.tyaw -= dt * 1.6;

    acc += dt * app.speed;
    let steps = 0;
    while (acc >= 0.1 && steps++ < 8) { app.game.tick(0.1); acc -= 0.1; }
    if (steps >= 8) acc = 0;
    handleEvents();

    // placement preview
    if (app.tool && !drag?.moved || app.tool && drag?.kind === 'paint') {
      const t = app.tool, h = hoverTile(mouse.x, mouse.y, toolSize(t));
      if (h) {
        const g = app.game;
        const ok = t === 'road' ? !g.tileFree(h.tx, h.tz) : t === 'demolish' ? true : t === 'beacon' ? !canPlaceBeacon(g, h.x, h.z)
          : g.canPlace(t as BuildingId, h.tx, h.tz).ok && g.canAfford(BUILDINGS[t as BuildingId].gold, BUILDINGS[t as BuildingId].cost);
        renderer.updatePreview(h.tx, h.tz, ok);
        // tell the player why (or how well) this spot works
        let text = '';
        if (t === 'road') text = ok ? `Road · ${ROAD_COST} gold per tile` : g.tileFree(h.tx, h.tz) ?? '';
        else if (t === 'beacon') text = canPlaceBeacon(g, h.x, h.z) ?? 'Light Beacon';
        else if (t !== 'demolish') {
          const d = BUILDINGS[t as BuildingId], c = g.canPlace(d.id, h.tx, h.tz);
          if (!c.ok) text = c.reason!;
          else if (!g.canAfford(d.gold, d.cost)) text = 'Not enough ' + (g.state.gold < d.gold ? 'gold' : Object.keys(d.cost).filter((k) => g.state.stock[k as keyof typeof GOODS] < d.cost[k as keyof typeof GOODS]!).map((k) => GOODS[k as keyof typeof GOODS].name.toLowerCase()).join(', '));
          else if (d.needs === 'forest') text = `Forest in reach: ${Math.round(g.resEfficiency(d.id, h.tx, h.tz) * 100)}%`;
          else if (d.beauty) text = `+${d.beauty} charm to homes nearby`;
        }
        hud.hint(text, mouse.x, mouse.y, ok);
      } else hud.hint('');
    }
    saveT += dt;
    if (saveT > 20) { saveT = 0; save(); }
  }
  // the HUD follows the wall clock, so it stays responsive even when frames are slow
  if (now - hudT > 180) { hudT = now; if (started) hud.refresh(); }
  renderer.frame(dt);
}

function handleEvents() {
  const evs = app.game.events;
  if (!evs.length) return;
  for (const ev of evs) {
    renderer.onEvent(ev);
    switch (ev.t) {
      case 'toast': hud.toast(ev.msg, ev.kind); break;
      case 'prod': {
        if (app.dark) break;
        const b = app.game.byId.get(ev.id);
        const p = b && renderer.toScreen(b.x + BUILDINGS[b.type].size / 2, b.z + BUILDINGS[b.type].size / 2, 1.6);
        if (p) hud.popup(p.x, p.y, `+${ev.n} ${GOODS[ev.good].icon}`);
        break;
      }
      case 'harvest': case 'loot': {
        if (ev.t === 'harvest') sound.coin();
        const p = app.dark && renderer.toScreen(ev.x, ev.z, 1.4);
        if (p) hud.popup(p.x, p.y, `+${ev.n} 🔮`, 'shard');
        break;
      }
      case 'quest': hud.toast(`📜 ${ev.msg}`, 'quest'); sound.quest(); break;
      case 'hit': if (app.dark) sound.hit(); break;
      case 'shot': if (app.dark) sound.shot(); break;
      case 'die': if (app.dark) sound.die(); break;
      case 'raid': sound.horn(); break;
      case 'breach': sound.boom(); break;
      case 'campDown': sound.boom(); sound.quest(); break;
      case 'upgrade': sound.upgrade(); break;
      case 'trade': sound.coin(); break;
      case 'victory':
        sound.victory();
        hud.modal(`<h2>🌅 Dawn Over All</h2><p>${CAMPS[2].leader}, the Night Sovereign, is no more. The last blight lifts from your island and the Dark World grows quiet.</p><p>Your city stands in both worlds.</p><p><button data-act="closeModal">Keep building</button></p>`);
        break;
      default: break;
    }
  }
  evs.length = 0;
}

(window as unknown as { dal: App }).dal = app;
requestAnimationFrame(loop);
