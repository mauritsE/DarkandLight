// A full campaign played through the real UI: every decision is a mouse click or key press
// on the page (tool buttons, canvas clicks, minimap, panels, Tab, F, G ...).
// The script only READS game state to decide what to do and to verify each action, and it
// fast-forwards game time between actions (headless software rendering runs at ~5 fps).
const { chromium } = require('playwright');
const out = process.argv[2];
const SEED_LOG = [];
const fails = [];
const note = (m) => { console.log(m); };
const fail = (m) => { fails.push(m); console.log('  !! ' + m); };

(async () => {
  const b = await chromium.launch({ args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] });
  const p = await b.newPage({ viewport: { width: 1180, height: 720 } });
  const errs = [];
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('pageerror', (e) => errs.push('PAGEERROR: ' + e.message));
  await p.goto('http://localhost:5173/?gfx=low&seed=' + (process.argv[3] || 2024));
  await p.waitForTimeout(1200);
  await p.evaluate(() => localStorage.clear());
  await p.click('#btnNew');
  await p.waitForTimeout(1200);

  // ---------- read-only helpers living in the page ----------
  await p.evaluate(async () => {
    const defs = await import('/src/sim/defs.ts');
    const combat = await import('/src/sim/combat.ts');
    const N = 80;
    const T = (window.__T = { defs, combat });
    const G = () => window.dal.game;
    T.scr = (x, z) => {
      const r = window.dal.renderer, g = G();
      const v = r.camera.position.clone().set(x, Math.max(0, g.world.heightAt(x, z)), z).project(r.camera);
      const px = (v.x + 1) / 2 * innerWidth, py = (1 - v.y) / 2 * innerHeight;
      const el = document.elementFromPoint(px, py);
      return { x: px, y: py, free: !!el && el.id === 'c' };
    };
    // BFS over free/road tiles from (x,z) to the connected road network; returns tiles needing a road
    T.route = (x, z, blocked) => {
      const g = G();
      if (g.netDirty) g.recomputeNet();
      const th = g.find('townhall');
      const nearKeep = (ix, iz) => ((ix === th.x - 1 || ix === th.x + 3) && iz >= th.z && iz <= th.z + 2) || ((iz === th.z - 1 || iz === th.z + 3) && ix >= th.x && ix <= th.x + 2);
      const prev = new Map(), q = [z * N + x];
      prev.set(z * N + x, -1);
      let end = -1;
      while (q.length) {
        const i = q.shift(), ix = i % N, iz = (i / N) | 0;
        if (g.roadNet[i] || nearKeep(ix, iz)) { end = i; break; }
        for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = ix + dx, nz = iz + dz, ni = nz * N + nx;
          if (!g.world.inb(nx, nz) || prev.has(ni)) continue;
          if (!g.road[ni] && (g.tileFree(nx, nz) || blocked.has(ni))) continue;
          prev.set(ni, i); q.push(ni);
        }
      }
      if (end < 0) return null;
      const tiles = [];
      for (let i = end; i >= 0; i = prev.get(i)) if (!g.road[i]) tiles.push([i % N, (i / N) | 0]);
      return tiles.reverse();
    };
    T.spot = (type) => {
      const g = G(), d = defs.BUILDINGS[type], s = g.world.start;
      for (let r = 2; r < 44; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dz)) !== r) continue;
        const x = s.x + dx, z = s.z + dz;
        if (!g.canPlace(type, x, z).ok || g.tileFree(x - 1, z)) continue;
        if (type === 'woodcutter' && g.resEfficiency(type, x, z) < 0.8) continue;
        const foot = new Set();
        let forest = false;
        for (let a = 0; a < d.size; a++) for (let c = 0; c < d.size; c++) { foot.add((z + c) * N + x + a); if (g.world.type[(z + c) * N + x + a] === 3) forest = true; }
        if (forest && type !== 'woodcutter' && type !== 'forester') continue;
        if (d.category === 'decor') return { x, z, size: d.size, roads: [] };
        const roads = T.route(x - 1, z, foot);
        if (!roads) continue;
        return { x, z, size: d.size, roads };
      }
      return null;
    };
    T.snap = () => {
      const g = G(), S = g.state;
      const army = S.entities.filter((e) => e.team === 0 && defs.UNITS[e.kind].speed > 0);
      const ge = g.gateEnt();
      return {
        time: S.time, gold: S.gold, income: S.income, pop: S.pop, peak: S.peakPop, quest: S.quest, won: S.won,
        stock: Object.fromEntries(Object.entries(S.stock).map(([k, v]) => [k, Math.floor(v)])),
        counts: S.buildings.reduce((a, b) => ((a[b.type] = (a[b.type] || 0) + 1), a), {}),
        noRoad: S.buildings.filter((b) => b.status === 'noRoad' && defs.BUILDINGS[b.type].category !== 'decor').length,
        army: army.length, armyCap: combat.armyCap(g), queue: S.trainQ.length,
        healthy: army.every((e) => e.hp > defs.UNITS[e.kind].hp * 0.8),
        camps: S.camps.map((c) => c.alive), gate: ge ? { x: ge.x, z: ge.z, hp: ge.hp, down: !!ge.down } : null,
        beacons: S.entities.filter((e) => e.kind === 'beacon').length,
        docked: S.ships.findIndex((sh) => sh.phase === 'docked'), contracts: S.contracts.length,
        stats: S.stats, dark: window.dal.dark, selected: window.dal.renderer.selected.size, raid: S.entities.some((e) => e.raid),
        shards: Math.floor(S.stock.shards), tool: window.dal.tool,
      };
    };
    T.can = (type) => { const g = G(), d = defs.BUILDINGS[type]; return g.unlocked(type) && g.canAfford(d.gold + 60, d.cost) && !(d.unique && g.find(type)); };
    T.ff = (sec) => { const g = G(); for (let i = 0; i < sec * 10; i++) g.tick(0.1); };
  });

  const snap = () => p.evaluate(() => window.__T.snap());
  const ff = async (sec) => { await p.evaluate((s) => window.__T.ff(s), sec); await p.waitForTimeout(250); };
  const shot = (name) => p.screenshot({ path: `${out}/ui-${name}.png` });

  // ---------- real-input helpers ----------
  async function clickEl(sel, opts = {}) {
    const loc = p.locator(sel).first();
    const bb = await loc.boundingBox().catch(() => null);
    if (!bb) return false;
    await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2, opts);
    await p.waitForTimeout(60);
    return true;
  }
  async function camTo(x, z) {
    const bb = await p.locator('#minimap').boundingBox();
    await p.mouse.click(bb.x + (x / 80) * bb.width, bb.y + (z / 80) * bb.height);
    for (let i = 0; i < 60; i++) {
      const c = await p.evaluate(() => { const c = window.dal.renderer.cam; return [c.x, c.z, c.tx, c.tz]; });
      if (Math.hypot(c[0] - c[2], c[1] - c[3]) < 0.08) break;
      await p.waitForTimeout(120);
    }
    await p.waitForTimeout(150);
  }
  async function clickWorld(x, z, button = 'left', mods = []) {
    let s = await p.evaluate(([x, z]) => window.__T.scr(x, z), [x, z]);
    if (!s.free || s.x < 5 || s.y < 5 || s.x > 1175 || s.y > 715) { await camTo(x, z); s = await p.evaluate(([x, z]) => window.__T.scr(x, z), [x, z]); }
    if (!s.free) { fail(`world point ${x.toFixed(1)},${z.toFixed(1)} is covered by UI even after centering`); return false; }
    for (const m of mods) await p.keyboard.down(m);
    await p.mouse.click(s.x, s.y, { button });
    for (const m of mods) await p.keyboard.up(m);
    await p.waitForTimeout(50);
    return true;
  }
  async function pickTool(type) {
    if (type !== 'road' && type !== 'demolish' && type !== 'beacon') {
      const cat = await p.evaluate((t) => window.__T.defs.BUILDINGS[t].category, type);
      await clickEl(`[data-act="tab"][data-t="${cat}"]`);
    }
    for (let attempt = 0; attempt < 2; attempt++) {
      await clickEl(`.bbtn[data-t="${type}"], button[data-act="tool"][data-t="${type}"]`);
      const tool = await p.evaluate(() => window.dal.tool);
      if (tool === type) { if (attempt) note(`   (tool ${type} needed a second click)`); return true; }
      const info = await p.evaluate((t) => { const el = document.querySelector(`.bbtn[data-t="${t}"], button[data-act="tool"][data-t="${t}"]`); if (!el) return 'button missing'; const r = el.getBoundingClientRect(); const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return `disabled=${el.disabled} topmost=${top && (top.id || top.className)} tool=${window.dal.tool}`; }, type);
      if (attempt) { fail(`tool button for ${type} did not activate: ${info}`); return false; }
      note(`   (tool ${type} click missed: ${info})`);
      await p.waitForTimeout(300);
    }
    return false;
  }
  async function setWorld(dark) {
    const s = await snap();
    if (s.dark === dark) return true;
    await p.keyboard.press('Tab');
    for (let i = 0; i < 40; i++) { await p.waitForTimeout(150); if ((await p.evaluate(() => window.dal.dark)) === dark) break; }
    await p.waitForTimeout(800);
    const ok = (await p.evaluate(() => window.dal.dark)) === dark;
    const cls = await p.evaluate(() => document.body.classList.contains('dark'));
    if (!ok || cls !== dark) fail(`world switch to ${dark ? 'dark' : 'light'} failed`);
    return ok;
  }
  async function build(type) {
    const plan = await p.evaluate((t) => window.__T.spot(t), type);
    if (!plan) { fail(`no spot found for ${type}`); return false; }
    await setWorld(false);
    if (!(await pickTool(type))) return false;
    const cx = plan.x + plan.size / 2, cz = plan.z + plan.size / 2;
    await camTo(cx, cz);
    await clickWorld(cx, cz);
    const placed = await p.evaluate(([t, x, z]) => !!window.dal.game.state.buildings.find((b) => b.type === t && b.x === x && b.z === z), [type, plan.x, plan.z]);
    await p.keyboard.press('Escape');
    if (!placed) { fail(`click did not place ${type} at ${plan.x},${plan.z}`); return false; }
    if (plan.roads.length) {
      await pickTool('road');
      for (const [x, z] of plan.roads) await clickWorld(x + 0.5, z + 0.5);
      await p.keyboard.press('Escape');
      let miss = await p.evaluate((tiles) => tiles.filter(([x, z]) => !window.dal.game.road[z * 80 + x]).map(([x, z]) => [x, z, window.dal.game.tileFree(x, z), Math.round(window.dal.game.state.gold)]), plan.roads);
      if (miss.length) {
        note(`   (${miss.length}/${plan.roads.length} road clicks missed for ${type}: ${JSON.stringify(miss)} — retrying)`);
        await pickTool('road');
        for (const [x, z] of miss) { await camTo(x + 0.5, z + 0.5); await clickWorld(x + 0.5, z + 0.5); }
        await p.keyboard.press('Escape');
        miss = await p.evaluate((tiles) => tiles.filter(([x, z]) => !window.dal.game.road[z * 80 + x]), miss);
        if (miss.length) fail(`${miss.length} road tiles for ${type} could not be laid even on retry: ${JSON.stringify(miss)}`);
      }
    }
    await ff(0.3);
    const conn = await p.evaluate(([t, x, z]) => window.dal.game.state.buildings.find((b) => b.type === t && b.x === x && b.z === z)?.connected, [type, plan.x, plan.z]);
    if (!conn && !['garden', 'statue', 'fountain'].includes(type)) fail(`${type} at ${plan.x},${plan.z} is not connected after its road was laid`);
    return true;
  }
  async function hudCheck(label) {
    await p.waitForTimeout(450);
    const r = await p.evaluate(() => {
      const g = window.dal.game, S = g.state, txt = (id) => document.getElementById(id).textContent.replace(/,/g, '');
      return { hudGold: +txt('s-gold'), gold: Math.floor(S.gold), hudPop: +txt('s-pop'), pop: S.pop, quest: document.querySelector('#quest h3')?.textContent, alerts: [...document.querySelectorAll('.alerts div')].map((d) => d.textContent) };
    });
    if (Math.abs(r.hudGold - r.gold) > 25) fail(`${label}: HUD gold ${r.hudGold} vs state ${r.gold}`);
    if (r.hudPop !== r.pop) fail(`${label}: HUD pop ${r.hudPop} vs state ${r.pop}`);
    return r;
  }
  async function harborChores(s) {
    s = await snap();
    const surplus = ['planks', 'stone', 'cloth', 'bread', 'wood'].filter((k) => s.stock[k] > 45);
    if (s.docked < 0 || (!surplus.length && !s.contracts)) return;
    await setWorld(false);
    const h = await p.evaluate(() => { const g = window.dal.game, h = g.find('harbor'); return h && h.connected ? g.center(h) : null; });
    if (!h) return;
    await camTo(h.x, h.z); await clickWorld(h.x, h.z);
    await p.waitForTimeout(350);
    const title = await p.textContent('#panel h2').catch(() => '');
    if (!/Harbor/.test(title || '')) { fail(`clicking the harbor opened "${title}"`); return; }
    const before = await snap();
    for (const k of surplus) {
      const sel = `[data-act="sell"][data-g="${k}"][data-n="10"]`;
      const vis = await p.evaluate((sel) => { const el = document.querySelector(sel); if (!el) return 'missing'; const r = el.getBoundingClientRect(); const top = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); return top === el ? 'visible' : 'hidden'; }, sel);
      if (vis === 'missing') { note(`   (no sell button for ${k}: ${await p.evaluate(() => document.getElementById('panel').textContent.slice(0, 200))})`); continue; }
      if (vis === 'hidden') { needScroll++; await p.locator(sel).first().scrollIntoViewIfNeeded().catch(() => {}); }
      await clickEl(sel);
    }
    if (s.contracts) await clickEl('[data-act="deliver"]:not([disabled])');
    const after = await snap();
    if (surplus.length && after.stats.trades === before.stats.trades && after.docked >= 0) fail('sell buttons had no effect while a ship was docked');
    if (after.stats.contracts > before.stats.contracts) note(`   contract delivered (+${Math.round(after.gold - before.gold)} gold incl. sales)`);
    await p.keyboard.press('Escape');
  }

  const WAR = process.argv[4] === 'war';
  if (WAR) {
    await p.evaluate(() => {
      const g = window.dal.game, T = window.__T; g.state.peakPop = 300; g.state.gold = 60000;
      for (const k in g.state.stock) g.state.stock[k] = 60;
      for (const t of ['gate', 'barracks', 'barracks', 'barracks', 'barracks']) { const sp = T.spot(t); g.place(t, sp.x, sp.z); for (const [x, z] of sp.roads) g.placeRoad(x, z); g.recomputeNet(); }
    });
  }
  const topUp = () => WAR ? p.evaluate(() => { const S = window.dal.game.state; S.gold = Math.max(S.gold, 20000); S.stock.weapons = 60; S.stock.wood = 60; S.stock.stone = 60; }) : null;
  // ---------- the campaign ----------
  const plan = ['house', 'house', 'house', 'house', 'woodcutter', 'fishery', 'house', 'house', 'market', 'house', 'house', 'sawmill', 'quarry', 'house', 'house',
    'forester', 'woodcutter', 'harbor', 'farm', 'bakery', 'house', 'house', 'garden', 'garden', 'sheepfarm', 'weaver', 'chapel', 'house', 'house', 'fishery', 'house', 'house', 'warehouse',
    'mine', 'forge', 'house', 'house', 'statue', 'fountain', 'gate', 'barracks', 'house', 'house', 'barracks'];
  const later = () => ['fishery', 'farm', 'bakery', 'sheepfarm', 'weaver', 'market', 'chapel', 'barracks', 'barracks', 'mine', 'forge', 'forge'];
  const laterMax = { fishery: 3, farm: 2, bakery: 2, sheepfarm: 2, weaver: 2, market: 2, chapel: 2, barracks: 4, mine: 2, forge: 3, house: 38, spire: 1 };
  let needScroll = 0, lastDiag = -999, lastTarget = 0;
  let pi = 0, attacking = false, harvested = false, lastChore = -999, lastWar = -999, shots = new Set(), darkVisits = 0, t0 = Date.now();
  const once = async (name) => { if (!shots.has(name)) { shots.add(name); await p.waitForTimeout(700); await shot(name); } };

  for (let iter = 0; iter < 2000; iter++) {
    let s = await snap();
    if (s.won) break;
    if (s.time > 60 * 130) { fail('campaign did not finish within 130 game-minutes'); break; }
    if ((Date.now() - t0) / 60000 > 27) { fail(`ran out of wall-clock time at game minute ${(s.time / 60).toFixed(0)}`); break; }
    let acted = false;
    await topUp();

    // --- economy: opening plan, then expansion ---
    let want = null;
    if (pi < plan.length) want = plan[pi];
    else {
      if (s.shards >= 8 && !s.camps[0] && !(s.counts.spire >= 1)) want = 'spire';
      else want = later().find((t) => (s.counts[t] || 0) < laterMax[t]) || ((s.counts.house || 0) < laterMax.house ? 'house' : null);
      if (want === 'barracks' && s.camps[0]) want = (s.counts.house || 0) < laterMax.house ? 'house' : null;
    }
    if (!WAR && want && (await p.evaluate((t) => window.__T.can(t), want))) {
      if (await build(want)) {
        note(`${(s.time / 60).toFixed(1)}m built ${want} via UI (gold ${Math.round(s.gold)}, pop ${s.pop})`);
        if (pi < plan.length) pi++;
        acted = true;
        if (want === 'market') await once('town-early');
        if (want === 'gate') { await hudCheck('after gate'); await once('gate-built'); }
      } else if (pi < plan.length) { pi++; }
    }
    // --- harbor: sell surplus, deliver contracts ---
    if (!WAR && s.counts.harbor && s.time - lastChore > 45) { lastChore = s.time; await harborChores(s); }

    // --- war ---
    if (s.gate && s.armyCap > 0 && s.time - lastWar >= 15) {
      lastWar = s.time;
      const target = s.camps.findIndex((a) => a);
      if (target !== lastTarget) { if (lastTarget >= 0 && target !== lastTarget) note(`${(s.time / 60).toFixed(1)}m stronghold ${lastTarget + 1} DESTROYED`); lastTarget = target; if (attacking) { attacking = false; await setWorld(true); await p.keyboard.press('f'); await p.keyboard.press('g'); note('   regrouping at the gate (G)'); } }
      const need = Math.min(s.armyCap, [12, 18, 24][target]);
      // training (dark-world toolbar)
      if (!s.gate.down && s.army + s.queue < s.armyCap && s.stock.weapons >= 1 && s.gold >= 60) {
        await setWorld(true); darkVisits++;
        for (let k = 0; k < 6; k++) {
          const st = await snap();
          if (st.army + st.queue >= st.armyCap) break;
          const kind = st.shards >= 2 && !st.camps[0] && st.stock.weapons >= 2 && st.gold >= 150 ? 'knight' : (st.army + st.queue) % 3 === 2 ? 'archer' : 'swordsman';
          const why = await p.evaluate((k) => window.__T.combat.canTrain(window.dal.game, k), kind);
          if (why) break;
          await clickEl(`.bbtn[data-act="train"][data-k="${kind}"]`);
          const st2 = await snap();
          if (st2.queue + st2.army <= st.queue + st.army) { await p.waitForTimeout(250); const st3 = await snap(); if (st3.queue + st3.army <= st.queue + st.army) fail(`train button for ${kind} did nothing (${await p.evaluate((k) => window.__T.combat.canTrain(window.dal.game, k), kind)})`); break; }
        }
      }
      // beacons around the gate
      if (s.shards >= 4 && s.gold > 500 && s.beacons < 4 && !s.gate.down) {
        await setWorld(true);
        if (await pickTool('beacon')) {
          const a = s.beacons * 1.6 + 0.4;
          await camTo(s.gate.x, s.gate.z);
          await clickWorld(s.gate.x + Math.cos(a) * 3.6, s.gate.z + Math.sin(a) * 3.6);
          const nb = (await snap()).beacons;
          if (nb > s.beacons) note(`${(s.time / 60).toFixed(1)}m placed light beacon #${nb} via UI`);
          await p.keyboard.press('Escape');
        }
      }
      s = await snap();
      // first trip into the dark: harvest the nearest shard crystal
      if (!harvested && s.army >= 4 && !s.raid) {
        await setWorld(true);
        await once('dark-first');
        const n = await p.evaluate(() => { const g = window.dal.game, ge = g.gateEnt(); return g.state.nodes.filter((n) => n.ready).sort((a, b) => Math.hypot(a.x - ge.x, a.z - ge.z) - Math.hypot(b.x - ge.x, b.z - ge.z))[0]; });
        await p.keyboard.press('f');
        const sel = (await snap()).selected;
        if (sel !== s.army) fail(`F selected ${sel} of ${s.army} soldiers`);
        await clickWorld(n.x + 0.9, n.z + 0.3, 'right');
        const h0 = (await snap()).stats.harvested;
        for (let k = 0; k < 14 && (await snap()).stats.harvested === h0; k++) await ff(8);
        const st = await snap();
        if (st.stats.harvested > h0) { note(`${(st.time / 60).toFixed(1)}m harvested a shard crystal via right-click move (+${st.stats.harvested - h0} shards)`); await once('dark-harvest'); }
        else fail('soldiers sent to a crystal never harvested it');
        harvested = true;
        await p.keyboard.press('f'); await p.keyboard.press('g'); // retreat to the gate
        await ff(25);
      }
      s = await snap();
      if (target >= 0) {
        if (!attacking && s.army >= need && s.healthy && !s.raid) { attacking = true; note(`${(s.time / 60).toFixed(1)}m ATTACK stronghold ${target + 1} with ${s.army} soldiers`); }
        if (!attacking && s.army >= need && s.time - lastDiag > 90) {
          lastDiag = s.time;
          const d = await p.evaluate(() => { const g = window.dal.game, ge = g.gateEnt(); const U = window.__T.defs.UNITS; return { hurt: g.state.entities.filter((e) => e.team === 0 && U[e.kind].speed > 0 && e.hp <= U[e.kind].hp * 0.8).map((e) => `${e.kind} ${Math.round(e.hp)}hp dist ${Math.hypot(e.x - ge.x, e.z - ge.z).toFixed(0)} order ${e.order}`), raiders: g.state.entities.filter((e) => e.raid).map((e) => `${e.kind} dist ${Math.hypot(e.x - ge.x, e.z - ge.z).toFixed(0)} tgt ${e.tgt} path ${e.path ? e.path.length : null} age ${Math.round(g.state.time - (e.raidT || 0))}`) }; });
          note(`   (holding the attack at ${(s.time / 60).toFixed(1)}m: hurt ${JSON.stringify(d.hurt)} raiders ${JSON.stringify(d.raiders)})`);
        }
        if (attacking && s.army < need * 0.35) {
          attacking = false;
          await setWorld(true); await p.keyboard.press('f'); await p.keyboard.press('g');
          note(`${(s.time / 60).toFixed(1)}m RETREAT (G) with ${s.army} left`);
        }
        if (attacking) {
          await setWorld(true);
          const c = await p.evaluate((t) => { const g = window.dal.game; const e = g.entById.get(g.state.camps[t].entId); return e ? { x: e.x, z: e.z, id: e.id } : null; }, target);
          if (c) {
            await p.keyboard.press('f');
            await camTo(c.x, c.z);
            await clickWorld(c.x, c.z, 'right');
            const ordered = await p.evaluate(() => window.dal.game.state.entities.filter((e) => e.team === 0 && e.order === 2).length);
            if (!ordered) fail('right-click on a stronghold gave no attack orders');
            if (target === 0) await once('battle-1'); if (target === 2) await once('battle-3');
          }
        }
        if (attacking || WAR) note(`   war ${(s.time / 60).toFixed(1)}m: ${await p.evaluate((t) => { const g = window.dal.game, S = g.state, c = g.entById.get(S.camps[t].entId), ge = g.gateEnt(); const mine = S.entities.filter((e) => e.team === 0 && window.__T.defs.UNITS[e.kind].speed > 0); const U = window.__T.defs.UNITS; return `camp hp ${c ? Math.round(c.hp) : 'dead'} guards ${S.entities.filter((e) => e.camp === t && !e.raid && e.kind !== 'camp').length} raiders ${S.entities.filter((e) => e.raid).length} | army ${mine.length} hp% ${mine.map((e) => Math.round(100 * e.hp / U[e.kind].hp)).join(',')} | distToCamp ${c ? mine.map((e) => Math.round(Math.hypot(e.x - c.x, e.z - c.z))).join(',') : ''} | orders ${mine.map((e) => e.order).join('')} | gate ${Math.round(ge.hp)}`; }, target)}`);
        const s2 = await snap();
        if (s2.camps.findIndex((a) => a) !== target) { attacking = false; note(`${(s2.time / 60).toFixed(1)}m stronghold ${target + 1} DESTROYED`); await once(`camp${target + 1}-down`); await p.keyboard.press('f'); await p.keyboard.press('g'); }
      }
    }
    if (iter % 25 === 0) { const h = await hudCheck(`iter ${iter}`); note(`-- ${(s.time / 60).toFixed(1)}m gold ${Math.round(s.gold)} (${Math.round(s.income)}/min) pop ${s.pop} army ${s.army}/${s.armyCap} quest "${h.quest}" alerts ${JSON.stringify(h.alerts)} wall ${((Date.now() - t0) / 60000).toFixed(1)}min`); }
    await ff(acted ? 2 : attacking ? 10 : 20);
  }

  let s = await snap();
  await p.waitForTimeout(1200);
  const modal = await p.evaluate(() => { const m = document.getElementById('modal'); return m.classList.contains('hidden') ? null : m.textContent; });
  if (s.won && !/Dawn Over All/.test(modal || '')) fail('victory modal did not appear');
  await shot('victory');
  if (modal) await clickEl('[data-act="closeModal"]');
  await setWorld(false);
  await p.keyboard.press('h'); await p.waitForTimeout(1500);
  await shot('final-city');
  const h = await hudCheck('final');
  // save / continue (paused, so nothing changes between the snapshot and the reload)
  await p.keyboard.press('p'); await p.waitForTimeout(400);
  const before = await p.evaluate(() => { const S = window.dal.game.state; return { b: S.buildings.length, r: S.roads.length, won: S.won, e: S.entities.length, gold: Math.floor(S.gold) }; });
  await p.reload(); await p.waitForTimeout(1500);
  await p.click('#btnContinue'); await p.waitForTimeout(1500);
  const after = await p.evaluate(() => { const S = window.dal.game.state; return { b: S.buildings.length, r: S.roads.length, won: S.won, e: S.entities.length, gold: Math.floor(S.gold) }; });
  if (before.b !== after.b || before.r !== after.r || before.won !== after.won || Math.abs(before.e - after.e) > 2) fail(`save/continue mismatch ${JSON.stringify(before)} vs ${JSON.stringify(after)}`);
  await shot('after-continue');

  console.log('\n===== RESULT =====');
  console.log(`won: ${s.won} at game minute ${(s.time / 60).toFixed(1)} | wall ${((Date.now() - t0) / 60000).toFixed(1)} min | dark visits for training ${darkVisits}`);
  console.log(`buildings ${JSON.stringify(s.counts)}`);
  console.log(`pop ${s.pop} gold ${Math.round(s.gold)} income ${Math.round(s.income)} stats ${JSON.stringify(s.stats)} final quest "${h.quest}"`);
  console.log(`save/continue ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
  console.log(`sell buttons that needed scrolling into view: ${needScroll}`);
  console.log(`UI action failures: ${fails.length}`); fails.forEach((f) => console.log('  - ' + f));
  console.log(`console errors: ${errs.length}`); errs.slice(0, 10).forEach((e) => console.log('  - ' + e));
  await b.close();
})().catch((e) => { console.log('SCRIPT CRASH', e); process.exit(1); });
