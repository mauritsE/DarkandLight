// Targeted checks of every control, panel and shortcut, through real input events.
const { chromium } = require('playwright');
const out = process.argv[2];
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const ARGS = ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];

async function boot(b, opts = {}, query = '?gfx=low&seed=2024', fresh = true) {
  const ctx = await b.newContext({ viewport: { width: 1180, height: 720 }, ...opts });
  const p = await ctx.newPage();
  p.errs = [];
  p.on('console', (m) => { if (m.type() === 'error') p.errs.push(m.text()); });
  p.on('pageerror', (e) => p.errs.push('PAGEERROR: ' + e.message));
  await p.goto('http://localhost:5173/' + query);
  await p.waitForTimeout(1000);
  if (fresh) await p.evaluate(() => { const g = localStorage.getItem('dal-gfx'); localStorage.clear(); if (g) localStorage.setItem('dal-gfx', g); });
  return p;
}
const H = (p) => ({
  st: (fn, arg) => p.evaluate(fn, arg),
  scr: (x, z) => p.evaluate(([x, z]) => { const r = window.dal.renderer, g = window.dal.game; const v = r.camera.position.clone().set(x, Math.max(0, g.world.heightAt(x, z)), z).project(r.camera); return [(v.x + 1) / 2 * innerWidth, (1 - v.y) / 2 * innerHeight]; }, [x, z]),
  async clickEl(sel, opts = {}) { const bb = await p.locator(sel).first().boundingBox().catch(() => null); if (!bb) return false; await p.mouse.click(bb.x + bb.width / 2, bb.y + bb.height / 2, opts); await p.waitForTimeout(80); return true; },
  async cam(x, z) { await p.evaluate(([x, z]) => { const c = window.dal.renderer.cam; c.x = c.tx = x; c.z = c.tz = z; }, [x, z]); await p.waitForTimeout(500); },
  frames: (n = 3) => p.evaluate((n) => new Promise((res) => { let k = 0; const f = () => (++k >= n ? res() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n),
});

(async () => {
  const b = await chromium.launch({ args: ARGS });

  // =================== 1. title screen ===================
  let p = await boot(b);
  let h = H(p);
  check('title: HUD hidden before start', await p.evaluate(() => getComputedStyle(document.getElementById('ui')).display === 'none'));
  check('title: no Continue button without a save', !(await p.isVisible('#btnContinue')));
  await p.click('[data-d="2"]');
  check('title: difficulty description updates', /Bigger raids/.test(await p.textContent('#diffDesc')));
  await p.keyboard.press('Tab');
  check('title: Tab before start does nothing', !(await p.evaluate(() => window.dal.dark)));
  await p.click('#btnNew'); await p.waitForTimeout(1200);
  check('title: chosen difficulty reaches the game', (await h.st(() => window.dal.game.state.difficulty)) === 2);
  check('start: 900 gold, Keep placed, quest shown', await h.st(() => { const S = window.dal.game.state; return S.gold >= 899 && S.buildings.length === 1 && /First Hearths/.test(document.querySelector('#quest h3').textContent); }));
  await p.context().close();

  // =================== 2. light world controls ===================
  p = await boot(b); h = H(p);
  await p.click('#btnNew'); await p.waitForTimeout(1200);
  const s = await h.st(() => window.dal.game.world.start);
  const g0 = await h.st(() => window.dal.game.state.gold);

  // keyboard tools
  await p.keyboard.press('r'); check('key R selects the road tool', (await h.st(() => window.dal.tool)) === 'road');
  await p.keyboard.press('Escape'); check('Esc cancels the tool', (await h.st(() => window.dal.tool)) === null);
  await p.keyboard.press('x'); check('key X selects demolish', (await h.st(() => window.dal.tool)) === 'demolish');
  let c = await h.scr(s.x + 6, s.z + 6); await p.mouse.click(c[0], c[1], { button: 'right' });
  check('right-click cancels the tool', (await h.st(() => window.dal.tool)) === null);

  // hint + preview
  await h.clickEl('.bbtn[data-t="house"]');
  const water = await h.st(() => { const g = window.dal.game, W = g.world, s = W.start; for (let r = 3; r < 40; r++) for (let dx = -r; dx <= r; dx++) for (const dz of [-r, r]) if (W.inb(s.x + dx, s.z + dz) && W.type[(s.z + dz) * 80 + s.x + dx] === 0) return [s.x + dx, s.z + dz]; });
  await h.cam(water[0], water[1]); c = await h.scr(water[0] + 0.5, water[1] + 0.5); await p.mouse.move(c[0], c[1]); await h.frames(4);
  check('hint explains an invalid spot', /water/i.test(await p.textContent('#hint')), await p.textContent('#hint'));
  await p.mouse.click(c[0], c[1]);
  check('clicking an invalid spot builds nothing and shows a warning', (await h.st(() => window.dal.game.state.buildings.length)) === 1 && /water/i.test(await p.textContent('#toasts')));
  await p.keyboard.press('Escape');
  check('hint hides when the tool is cancelled', await p.evaluate(() => document.getElementById('hint').classList.contains('hidden')));

  // road drag
  await h.cam(s.x, s.z + 3);
  await p.keyboard.press('r');
  let a = await h.scr(s.x - 5.5, s.z + 2.5), e = await h.scr(s.x + 6.5, s.z + 2.5);
  await p.mouse.move(a[0], a[1]); await p.mouse.down();
  for (let i = 1; i <= 10; i++) { await p.mouse.move(a[0] + (e[0] - a[0]) * i / 10, a[1] + (e[1] - a[1]) * i / 10); await p.waitForTimeout(40); }
  await p.mouse.up();
  const road = await h.st(([x0, x1, z]) => { const g = window.dal.game; let n = 0; for (let x = x0; x <= x1; x++) if (g.road[z * 80 + x]) n++; return [n, x1 - x0 + 1, g.state.roads.length]; }, [s.x - 6, s.x + 6, s.z + 2]);
  check('dragging the road tool lays an unbroken street', road[0] === road[1], `${road[0]}/${road[1]} tiles`);
  check('roads cost 2 gold each', Math.abs((g0 - (await h.st(() => window.dal.game.state.gold))) - road[2] * 2) < 1.5);
  await p.keyboard.press('Escape');

  // houses via clicks, tool stays active for repeat placement
  await h.clickEl('.bbtn[data-t="house"]');
  for (const dx of [-5, -3, -1, 1]) { c = await h.scr(s.x + dx + 1, s.z + 4); await p.mouse.click(c[0], c[1]); await p.waitForTimeout(60); }
  check('house tool stays active for repeated placement', (await h.st(() => window.dal.tool)) === 'house');
  check('4 houses placed and connected', (await h.st(() => { const g = window.dal.game; g.recomputeNet(); return g.state.buildings.filter((b) => b.type === 'house' && b.connected).length; })) === 4);
  c = await h.scr(s.x - 4, s.z + 4); await p.mouse.move(c[0], c[1]); await h.frames(4);
  check('hint says occupied over an existing building', /occupied/i.test(await p.textContent('#hint')));
  await p.keyboard.press('Escape');

  // tooltip
  let bb = await p.locator('.bbtn[data-t="market"]').boundingBox(); await p.mouse.move(bb.x + 20, bb.y + 20); await p.waitForTimeout(150);
  check('hovering a build button shows a tooltip with cost', /Market/.test(await p.textContent('#tooltip')) && /100/.test(await p.textContent('#tooltip')));
  await p.mouse.move(600, 300); await p.waitForTimeout(100);
  check('tooltip hides when leaving the button', await p.evaluate(() => document.getElementById('tooltip').classList.contains('hidden')));
  // locked buildings
  check('locked buildings are disabled', await p.evaluate(() => document.querySelector('.bbtn[data-t="chapel"]').disabled));

  // building panel
  c = await h.scr(s.x - 4, s.z + 4); await p.mouse.click(c[0], c[1]); await p.waitForTimeout(300);
  check('clicking a house opens its panel', /Settlers/.test(await p.textContent('#panel h2')));
  const au0 = await h.st(() => window.dal.game.state.autoUpgrade);
  await h.clickEl('[data-act="auto"]');
  check('auto-upgrade toggle works', (await h.st(() => window.dal.game.state.autoUpgrade)) === !au0);
  await h.clickEl('[data-act="auto"]');
  c = await h.scr(s.x + 0.5, s.z + 0.5); await p.mouse.click(c[0], c[1]); await p.waitForTimeout(300);
  check('clicking the Keep opens its panel (no demolish button)', /Keep/.test(await p.textContent('#panel h2')) && !(await p.locator('#panel [data-act="demolish"]').count()));
  await p.mouse.click(520, 330, { button: 'right' }); await p.waitForTimeout(200);
  check('right-click closes the panel', await p.evaluate(() => document.getElementById('panel').classList.contains('hidden')));

  // market: range ring + demolish via panel refund
  await h.st(() => { window.dal.game.state.gold = 2000; });
  await h.clickEl('.bbtn[data-t="market"]');
  c = await h.scr(s.x + 5.5, s.z + 4.5); await p.mouse.click(c[0], c[1]); await p.keyboard.press('Escape');
  const mk = await h.st(() => { const b = window.dal.game.find('market'); return b ? [b.x, b.z, b.id] : null; });
  check('market placed', !!mk);
  if (mk) {
    c = await h.scr(mk[0] + 1.5, mk[1] + 1.5); await p.mouse.click(c[0], c[1]); await p.waitForTimeout(300);
    check('selecting a service building shows its range ring', await h.st(() => window.dal.renderer.rangeRing.visible && Math.abs(window.dal.renderer.rangeRing.scale.x - 10) < 0.01));
    const gold1 = await h.st(() => window.dal.game.state.gold);
    await h.clickEl('#panel [data-act="demolish"]');
    const r = await h.st(() => [!!window.dal.game.find('market'), window.dal.game.state.gold, window.dal.renderer.rangeRing.visible]);
    check('panel demolish removes the building and refunds half its gold', !r[0] && Math.abs(r[1] - gold1 - 50) < 2 && !r[2], `gold +${Math.round(r[1] - gold1)}`);
  }
  // demolish tool drag over road
  await p.keyboard.press('x');
  a = await h.scr(s.x + 4.5, s.z + 2.5); e = await h.scr(s.x + 6.5, s.z + 2.5);
  const r0 = await h.st(() => window.dal.game.state.roads.length);
  await p.mouse.move(a[0], a[1]); await p.mouse.down(); await p.mouse.move((a[0] + e[0]) / 2, (a[1] + e[1]) / 2); await p.mouse.move(e[0], e[1]); await p.mouse.up();
  check('dragging demolish removes road tiles', (await h.st(() => window.dal.game.state.roads.length)) === r0 - 3, `${r0} -> ${await h.st(() => window.dal.game.state.roads.length)}`);
  await p.keyboard.press('Escape');

  // camera
  let cam0 = await h.st(() => ({ ...window.dal.renderer.cam }));
  await p.keyboard.down('w'); await p.waitForTimeout(600); await p.keyboard.up('w'); await p.waitForTimeout(400);
  let cam1 = await h.st(() => ({ ...window.dal.renderer.cam }));
  check('W moves the camera forward', Math.hypot(cam1.tx - cam0.tx, cam1.tz - cam0.tz) > 1);
  await p.keyboard.down('q'); await p.waitForTimeout(500); await p.keyboard.up('q');
  check('Q rotates the camera', Math.abs((await h.st(() => window.dal.renderer.cam.tyaw)) - cam1.tyaw) > 0.2);
  await p.mouse.move(600, 350); for (let i = 0; i < 40; i++) await p.mouse.wheel(0, 300); await p.waitForTimeout(600);
  check('zoom out is clamped', (await h.st(() => window.dal.renderer.cam.tdist)) <= 70.01);
  for (let i = 0; i < 60; i++) await p.mouse.wheel(0, -300); await p.waitForTimeout(600);
  check('zoom in is clamped', (await h.st(() => window.dal.renderer.cam.tdist)) >= 8.99);
  for (let i = 0; i < 6; i++) await p.mouse.wheel(0, 300);
  await p.keyboard.press('h'); await p.waitForTimeout(900);
  check('H returns to the Keep', await h.st(() => { const c = window.dal.renderer.cam, s = window.dal.game.world.start; return Math.hypot(c.x - s.x, c.z - s.z) < 1.5; }));
  cam0 = await h.st(() => ({ ...window.dal.renderer.cam }));
  await p.mouse.move(700, 300); await p.mouse.down(); await p.mouse.move(640, 330); await p.mouse.move(560, 380); await p.mouse.up(); await p.waitForTimeout(300);
  cam1 = await h.st(() => ({ ...window.dal.renderer.cam }));
  check('dragging the ground pans the camera', Math.hypot(cam1.tx - cam0.tx, cam1.tz - cam0.tz) > 1.5);
  const yaw0 = cam1.tyaw;
  await p.mouse.move(700, 300); await p.mouse.down({ button: 'right' }); await p.mouse.move(760, 300); await p.mouse.move(850, 300); await p.mouse.up({ button: 'right' });
  check('right-drag rotates the camera', Math.abs((await h.st(() => window.dal.renderer.cam.tyaw)) - yaw0) > 0.3);
  bb = await p.locator('#minimap').boundingBox();
  await p.mouse.click(bb.x + bb.width * 0.5, bb.y + bb.height * 0.5); await p.waitForTimeout(200);
  check('minimap click moves the camera target', await h.st(() => Math.hypot(window.dal.renderer.cam.tx - 40, window.dal.renderer.cam.tz - 40) < 1.5));
  await p.keyboard.press('h');

  // speed / pause
  const tick = async (ms) => { const t0 = await h.st(() => window.dal.game.state.time); await p.waitForTimeout(ms); return (await h.st(() => window.dal.game.state.time)) - t0; };
  const base = await tick(2500);
  await h.clickEl('.speed [data-n="4"]'); const fast = await tick(2500);
  check('4× speed runs the simulation faster', fast > base * 2, `${base.toFixed(1)}s vs ${fast.toFixed(1)}s of game time`);
  await p.keyboard.press('p'); const paused = await tick(1200);
  check('P pauses the simulation', paused === 0 && (await h.st(() => window.dal.speed)) === 0);
  await p.keyboard.press('p'); check('P resumes at 1×', (await h.st(() => window.dal.speed)) === 1);
  await p.keyboard.press('2'); check('key 2 sets 2×', (await h.st(() => window.dal.speed)) === 2); await p.keyboard.press('1');

  // ledger
  await p.keyboard.press('l'); await p.waitForTimeout(200);
  check('L opens the ledger', /Ledger/.test(await p.textContent('#panel h2')) && /Taxes/.test(await p.textContent('#panel')));
  await h.clickEl('[data-act="ledger"]'); await p.waitForTimeout(150);
  check('clicking gold toggles the ledger closed', await p.evaluate(() => document.getElementById('panel').classList.contains('hidden')));

  // mute + menu
  const m0 = await p.textContent('#s-mute'); await h.clickEl('#s-mute');
  check('mute button toggles and persists', (await p.textContent('#s-mute')) !== m0 && (await p.evaluate(() => localStorage.getItem('dal-mute'))) !== null);
  await h.clickEl('[data-act="menu"]');
  check('menu opens', await p.isVisible('#modal'));
  const gtxt = await p.textContent('[data-act="gfx"]'); await h.clickEl('[data-act="gfx"]');
  check('graphics quality toggles', (await p.textContent('[data-act="gfx"]')) !== gtxt && (await h.st(() => window.dal.renderer.low)) === !/Low/.test(gtxt));
  await h.clickEl('[data-act="gfx"]');
  await h.clickEl('[data-act="closeModal"]'); check('Resume closes the menu', !(await p.isVisible('#modal')));
  // resize
  await p.setViewportSize({ width: 900, height: 600 }); await p.waitForTimeout(400);
  check('window resize updates the canvas and camera', await h.st(() => { const r = window.dal.renderer; return r.three.domElement.width === 900 && Math.abs(r.camera.aspect - 1.5) < 0.01; }));
  await p.screenshot({ path: `${out}/c-small.png` });
  check('HUD pieces stay on screen at 900×600', await p.evaluate(() => ['topbar', 'bottombar', 'worldBtn', 'minimap', 'quest'].every((id) => { const r = document.getElementById(id).getBoundingClientRect(); return r.left >= -1 && r.top >= -1 && r.right <= innerWidth + 1 && r.bottom <= innerHeight + 1; })));
  await p.setViewportSize({ width: 1180, height: 720 }); await p.waitForTimeout(300);

  // Tab without a gate
  await p.keyboard.press('Tab'); await p.waitForTimeout(300);
  check('Tab without a Rift Gate explains why', /Rift Gate/.test(await p.textContent('#toasts')) && !(await h.st(() => window.dal.dark)));

  // alerts: disconnected building
  await h.st(() => { const g = window.dal.game, s = g.world.start; g.state.stock.wood = 50; for (let z = s.z - 9; z > s.z - 16; z--) if (g.place('house', s.x, z).ok) break; });
  await p.waitForTimeout(900);
  check('alerts list flags a building without a road', /without a road/.test(await p.textContent('#quest')));
  cam0 = await h.st(() => ({ ...window.dal.renderer.cam }));
  await h.clickEl('.alerts'); await p.waitForTimeout(700);
  check('clicking the alert moves the camera there', await h.st((c0) => Math.hypot(window.dal.renderer.cam.tx - c0.tx, window.dal.renderer.cam.tz - c0.tz) > 3, cam0));

  // standing orders with a docked ship
  await h.st(() => {
    const g = window.dal.game, s = g.world.start; g.state.peakPop = 100; g.state.gold = 4000; for (const k in g.state.stock) g.state.stock[k] = 50;
    let done = false;
    for (let r = 3; r < 40 && !done; r++) for (let dz = -r; dz <= r && !done; dz++) for (let dx = -r; dx <= r && !done; dx++) if (g.canPlace('harbor', s.x + dx, s.z + dz).ok) { g.place('harbor', s.x + dx, s.z + dz); done = true; }
    const hb = g.find('harbor');
    // connect it honestly: BFS road to the network
    g.recomputeNet();
    const N = 80, prev = new Map(), start = hb.z * N + hb.x - 1, q = [];
    for (const [x, z] of [[hb.x - 1, hb.z], [hb.x + 3, hb.z], [hb.x, hb.z - 1], [hb.x, hb.z + 3]]) if (!g.tileFree(x, z)) { q.push(z * N + x); prev.set(z * N + x, -1); break; }
    let end = -1;
    while (q.length) { const i = q.shift(), ix = i % N, iz = (i / N) | 0; if (g.roadNet[i]) { end = i; break; } for (const [dx, dz] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const nx = ix + dx, nz = iz + dz, ni = nz * N + nx; if (!g.world.inb(nx, nz) || prev.has(ni)) continue; if (!g.road[ni] && g.tileFree(nx, nz)) continue; prev.set(ni, i); q.push(ni); } }
    for (let i = end; i >= 0; i = prev.get(i)) if (!g.road[i]) g.placeRoad(i % N, (i / N) | 0);
    g.state.ships[1].phase = 'arriving'; g.state.ships[1].t = 0.3; g.state.ships[1].stock = { wood: 30, grain: 24, wool: 14, bread: 14 };
  });
  await p.waitForTimeout(1500);
  const hb = await h.st(() => { const g = window.dal.game, b = g.find('harbor'); return { c: g.center(b), connected: b.connected, docked: g.state.ships[1].phase }; });
  check('harbor connected and a ship docked', hb.connected && hb.docked === 'docked', JSON.stringify(hb));
  await h.cam(hb.c.x, hb.c.z); c = await h.scr(hb.c.x, hb.c.z); await p.mouse.click(c[0], c[1]); await p.waitForTimeout(400);
  check('harbor panel lists the docked ship with prices', /Verdant League/.test(await p.textContent('#panel')) && /Docked/.test(await p.textContent('#panel')));
  await p.screenshot({ path: `${out}/c-harbor.png` });
  let t0 = await h.st(() => ({ gold: window.dal.game.state.gold, planks: window.dal.game.state.stock.planks, grain: window.dal.game.state.stock.grain }));
  await h.clickEl('[data-act="sell"][data-g="planks"][data-n="1"]');
  await h.clickEl('[data-act="buy"][data-g="grain"][data-n="10"]');
  let t1 = await h.st(() => ({ gold: window.dal.game.state.gold, planks: window.dal.game.state.stock.planks, grain: window.dal.game.state.stock.grain }));
  check('sell 1 and buy 10 buttons trade the right amounts', Math.round(t0.planks - t1.planks) === 1 && Math.round(t1.grain - t0.grain) === 10, `planks ${t0.planks.toFixed(0)}→${t1.planks.toFixed(0)}, grain ${t0.grain.toFixed(0)}→${t1.grain.toFixed(0)}, gold ${Math.round(t1.gold - t0.gold)}`);
  await h.clickEl('[data-act="ttab"][data-t="orders"]'); await p.waitForTimeout(200);
  await p.selectOption('select[data-g="stone"]', 'sell');
  await p.fill('input[data-g="stone"]', '20'); await p.keyboard.press('Tab');
  check('standing order is stored from the select and the number field', await h.st(() => { const o = window.dal.game.state.orders.stone; return o && o.mode === 'sell' && o.level === 20; }));
  await p.locator('input[data-g="stone"]').focus(); await p.waitForTimeout(700);
  check('typing in the orders table is not interrupted by HUD refreshes', await p.evaluate(() => document.activeElement && document.activeElement.dataset.g === 'stone'));
  await p.locator('input[data-g="stone"]').blur();
  await h.st(() => { const g = window.dal.game; for (let i = 0; i < 300; i++) g.tick(0.1); });
  check('the standing order sells stone down to the kept level while docked', (await h.st(() => Math.floor(window.dal.game.state.stock.stone))) === 20, `stone ${await h.st(() => window.dal.game.state.stock.stone)}`);
  // contract
  await h.st(() => { const g = window.dal.game; g.state.contracts = [{ merchant: 1, good: 'cloth', qty: 20, reward: 500, t: 300 }]; g.state.ships[1].t = 60; });
  await h.clickEl('[data-act="ttab"][data-t="ships"]'); await p.waitForTimeout(300);
  t0 = await h.st(() => window.dal.game.state.gold);
  await h.clickEl('[data-act="deliver"]');
  check('contract Deliver button pays the reward', Math.round((await h.st(() => window.dal.game.state.gold)) - t0) === 500);
  await h.st(() => { const g = window.dal.game; g.state.contracts = [{ merchant: 0, good: 'cloth', qty: 20, reward: 500, t: 300 }]; g.state.ships[0].phase = 'away'; g.state.ships[0].t = 500; });
  await p.waitForTimeout(400);
  check('Deliver is disabled when that merchant is not in port', await p.evaluate(() => document.querySelector('[data-act="deliver"]')?.disabled === true));
  // production building pause
  await h.st(() => { const g = window.dal.game, s = g.world.start; for (let r = 2; r < 30; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (g.canPlace('sawmill', s.x + dx, s.z + dz).ok && !g.find('sawmill')) g.place('sawmill', s.x + dx, s.z + dz); });
  const sm = await h.st(() => { const g = window.dal.game; return g.center(g.find('sawmill')); });
  await h.cam(sm.x, sm.z); c = await h.scr(sm.x, sm.z); await p.mouse.click(c[0], c[1]); await p.waitForTimeout(300);
  await h.clickEl('#panel [data-act="pause"]');
  check('Pause button pauses a workshop', await h.st(() => window.dal.game.find('sawmill').paused === true));
  check('light world: no console errors', p.errs.length === 0, p.errs.slice(0, 3).join(' | '));
  await p.context().close();

  // =================== 3. dark world controls ===================
  p = await boot(b); h = H(p);
  await p.click('#btnNew'); await p.waitForTimeout(1200);
  await h.st(() => {
    const g = window.dal.game, s = g.world.start; g.state.peakPop = 100; g.state.gold = 6000; for (const k in g.state.stock) g.state.stock[k] = 50; g.state.raidTimer = 9999;
    let ok = false; for (let r = 4; r < 20 && !ok; r++) for (let dz = -r; dz <= r && !ok; dz++) for (let dx = -r; dx <= r && !ok; dx++) if (g.place('gate', s.x + dx, s.z + dz).ok) ok = true;
    const ge = g.gateEnt(); for (let i = 0; i < 6; i++) g.spawnNear(i < 4 ? 'swordsman' : 'archer', 0, ge.x + 2.6, ge.z - 1 + i * 0.5, -1);
    g.state.raidTimer = 9999;
  });
  const near = await h.st(() => { const g = window.dal.game, s = g.world.start, c = g.world.campSites.map((c, i) => Math.hypot(c.x - (g.gateEnt().x), c.z - g.gateEnt().z)); return c; });
  check('gate was placed at least 17 tiles from every stronghold', near.every((d) => d >= 17), near.map((d) => d.toFixed(0)).join(','));
  const tooClose = await h.st(() => { const g = window.dal.game, c = g.world.campSites[0]; const saved = g.state.buildings.findIndex((b) => b.type === 'gate'); const gb = g.state.buildings[saved]; g.state.buildings.splice(saved, 1); let reason = ''; for (let dx = -12; dx <= 12 && !reason; dx++) for (let dz = -12; dz <= 12; dz++) { const r = g.canPlace('gate', c.x + dx, c.z + dz); if (r.reason && /stronghold/.test(r.reason)) { reason = r.reason; break; } } g.state.buildings.splice(saved, 0, gb); return reason; });
  check('a gate cannot be raised beside a stronghold', /stronghold/.test(tooClose), tooClose);
  await p.keyboard.press('Tab'); await p.waitForTimeout(2200);
  check('Tab enters the Dark World (state, body class, groups)', await h.st(() => window.dal.dark && document.body.classList.contains('dark') && window.dal.game.state.stats.visitedDark));
  check('first visit explains shard crystals', /crystal/i.test(await p.textContent('#toasts')));
  const ge = await h.st(() => { const e = window.dal.game.gateEnt(); return [e.x, e.z]; });
  check('camera centres on the gate on arrival', await h.st(() => { const c = window.dal.renderer.cam, e = window.dal.game.gateEnt(); return Math.hypot(c.tx - e.x, c.tz - e.z) < 0.5; }));
  await p.screenshot({ path: `${out}/c-dark.png` });
  const unitsScr = async () => { const pts = await h.st(() => window.dal.game.state.entities.filter((e) => e.team === 0 && e.kind !== 'gate').map((e) => [e.x, e.z, e.id])); const o = []; for (const [x, z, id] of pts) { const s2 = await h.scr(x, z); o.push([s2[0], s2[1] - 12, id]); } return o; };
  let us = await unitsScr();
  await p.mouse.click(us[0][0], us[0][1]); await p.waitForTimeout(100);
  check('clicking a soldier selects just that one', (await h.st(() => [...window.dal.renderer.selected])).length === 1);
  await p.keyboard.down('Shift'); await p.mouse.click(us[3][0], us[3][1]); await p.keyboard.up('Shift'); await p.waitForTimeout(100);
  check('shift-click adds to the selection', (await h.st(() => window.dal.renderer.selected.size)) === 2, `${await h.st(() => window.dal.renderer.selected.size)}`);
  await p.keyboard.press('Escape'); check('Esc clears the selection', (await h.st(() => window.dal.renderer.selected.size)) === 0);
  const xs = us.map((u) => u[0]), ys = us.map((u) => u[1]);
  await p.mouse.move(Math.min(...xs) - 30, Math.min(...ys) - 30); await p.mouse.down(); await p.mouse.move(Math.max(...xs), Math.max(...ys)); await p.mouse.move(Math.max(...xs) + 30, Math.max(...ys) + 40); await p.waitForTimeout(120);
  check('selection rectangle is drawn while dragging', await p.evaluate(() => !document.getElementById('selbox').classList.contains('hidden')));
  await p.mouse.up();
  check('box-select picks all six soldiers', (await h.st(() => window.dal.renderer.selected.size)) === 6, `${await h.st(() => window.dal.renderer.selected.size)}`);
  await p.waitForTimeout(450);
  check('toolbar shows the selection count within half a second', /6 selected/.test(await p.textContent('#bottombar')));
  // move
  let tgt = await h.scr(ge[0] + 4, ge[1] + 4); await p.mouse.click(tgt[0], tgt[1], { button: 'right' }); await p.waitForTimeout(100);
  check('right-click orders a move', (await h.st(() => window.dal.game.state.entities.filter((e) => e.team === 0 && e.order === 1).length)) === 6);
  // charge via key C
  await p.keyboard.press('c'); check('C arms a charge order', await h.st(() => window.dal.charge));
  tgt = await h.scr(ge[0] - 4, ge[1] + 4); await p.mouse.click(tgt[0], tgt[1], { button: 'right' }); await p.waitForTimeout(100);
  check('the next right-click is an attack-move, then the mode resets', (await h.st(() => window.dal.game.state.entities.filter((e) => e.team === 0 && e.order === 3).length)) === 6 && !(await h.st(() => window.dal.charge)));
  // shift + right click charge
  await h.st(() => { for (const e of window.dal.game.state.entities) if (e.team === 0) e.order = 0; });
  await p.keyboard.down('Shift'); await p.mouse.click(tgt[0] + 40, tgt[1], { button: 'right' }); await p.keyboard.up('Shift'); await p.waitForTimeout(100);
  check('Shift + right-click is also an attack-move', (await h.st(() => window.dal.game.state.entities.filter((e) => e.team === 0 && e.order === 3).length)) === 6);
  // charge button in the toolbar
  await h.clickEl('[data-act="charge"]'); check('Charge button arms the order', await h.st(() => window.dal.charge)); await p.keyboard.press('c');
  // retreat
  await p.keyboard.press('g'); await p.waitForTimeout(100);
  check('G sends the selection back to the gate', await h.st(() => { const g = window.dal.game, ge = g.gateEnt(); return g.state.entities.filter((e) => e.team === 0 && e.order === 1 && Math.hypot(e.ox - ge.x, e.oz - ge.z) < 5).length === 6; }));
  // left click on empty ground deselects
  tgt = await h.scr(ge[0] - 6, ge[1] - 6); await p.mouse.click(tgt[0], tgt[1]);
  check('left-click on empty ground deselects', (await h.st(() => window.dal.renderer.selected.size)) === 0);
  await p.keyboard.press('f'); check('F selects every soldier', (await h.st(() => window.dal.renderer.selected.size)) === 6);
  // attack an enemy by right-click
  await h.st(() => { const g = window.dal.game, ge = g.gateEnt(); const e = g.spawnNear('brute', 1, ge.x + 6.5, ge.z + 1, -1); e.hx = e.x; e.hz = e.z; e.hp = 5000; window.__foe = e.id; for (const u of g.state.entities) if (u.team === 0 && u.kind !== 'gate') { u.order = 1; u.ox = u.x; u.oz = u.z; u.tgt = 0; } });
  await p.waitForTimeout(300);
  const fp = await h.st(() => { const e = window.dal.game.entById.get(window.__foe); return [e.x, e.z]; });
  tgt = await h.scr(fp[0], fp[1]); await p.mouse.click(tgt[0], tgt[1] - 14, { button: 'right' }); await p.waitForTimeout(100);
  check('right-click on an enemy orders an attack on it', (await h.st(() => window.dal.game.state.entities.filter((e) => e.team === 0 && e.order === 2 && e.otgt === window.__foe).length)) === 6);
  await h.st(() => { const e = window.dal.game.entById.get(window.__foe); e.hp = 60; });
  await p.waitForTimeout(6000);
  check('soldiers kill the target', await h.st(() => !window.dal.game.entById.has(window.__foe)));
  // training buttons and queue
  await h.st(() => { const g = window.dal.game, s = g.world.start; for (let r = 4; r < 24; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) if (!g.find('barracks') && g.canPlace('barracks', s.x + dx, s.z + dz).ok) { g.place('barracks', s.x + dx, s.z + dz); } });
  check('training is refused while the barracks has no road', await h.st(async () => { const c = await import('/src/sim/combat.ts'); return /Barracks/.test(c.canTrain(window.dal.game, 'swordsman') || ''); }));
  await h.clickEl('.bbtn[data-k="swordsman"]'); await p.waitForTimeout(200);
  check('clicking Train without a usable barracks explains why', /Barracks/.test(await p.textContent('#toasts')));
  await h.st(() => { const g = window.dal.game; for (let i = 0; i < 8; i++) g.spawnNear('swordsman', 0, 0, 0, -1); });
  // gate panel from the dark world
  tgt = await h.scr(ge[0], ge[1]); await p.keyboard.press('Escape'); await p.mouse.click(tgt[0], tgt[1] - 30); await p.waitForTimeout(300);
  check('clicking the gate in the Dark World opens its panel', /Rift Gate/.test((await p.textContent('#panel h2').catch(() => '')) || ''));
  await p.keyboard.press('Escape');
  // beacon placement
  await h.clickEl('.bbtn[data-t="beacon"]');
  const bs = await h.st(async () => { const c = await import('/src/sim/combat.ts'); const g = window.dal.game, ge = g.gateEnt(); for (let a = 0; a < 6.3; a += 0.4) { const x = ge.x + Math.cos(a) * 3.6, z = ge.z + Math.sin(a) * 3.6; if (!c.canPlaceBeacon(g, x, z)) return [x, z]; } return null; });
  tgt = await h.scr(bs[0], bs[1]); await p.mouse.click(tgt[0], tgt[1]); await p.waitForTimeout(150);
  check('beacon tool places a Light Beacon near the gate', (await h.st(() => window.dal.game.state.entities.filter((e) => e.kind === 'beacon').length)) === 1);
  const far = await h.st(() => { const g = window.dal.game, ge = g.gateEnt(); return [ge.x + 15.5 < 78 ? ge.x + 15.5 : ge.x - 15.5, ge.z]; });
  await h.cam(far[0], far[1]); tgt = await h.scr(far[0], far[1]); await p.mouse.move(tgt[0], tgt[1]); await h.frames(4);
  const hintTxt = await p.textContent('#hint');
  await p.mouse.click(tgt[0], tgt[1]); await p.waitForTimeout(150);
  check('beacon far from the gate is refused with a reason', (await h.st(() => window.dal.game.state.entities.filter((e) => e.kind === 'beacon').length)) === 1, `hint: "${hintTxt}"`);
  await p.keyboard.press('Escape');
  // raid alert in the light world, breach consequences
  await p.keyboard.press('Tab'); await p.waitForTimeout(2200);
  check('Tab returns to the Light World', !(await h.st(() => window.dal.dark)) && !(await p.evaluate(() => document.body.classList.contains('dark'))));
  await h.st(() => { const g = window.dal.game; g.state.entities = g.state.entities.filter((e) => e.team !== 0 || e.kind === 'gate'); g.entById.clear(); for (const e of g.state.entities) g.entById.set(e.id, e); g.state.raidTimer = 0.1; g.state.raidCount = 8; g.state.gold = 5000; });
  await p.waitForTimeout(1500);
  check('a raid shows the alert chip and pulses the world button', (await p.isVisible('#alert')) && /Raid/.test(await p.textContent('#alert')) && (await p.evaluate(() => document.getElementById('worldBtn').classList.contains('pulse'))));
  check('raid toast names the attacking faction', /sends a raid/.test(await p.textContent('#toasts')));
  await h.clickEl('#alert'); await p.waitForTimeout(2200);
  check('clicking the alert jumps into the Dark World', await h.st(() => window.dal.dark));
  await h.st(() => { const g = window.dal.game; for (let i = 0; i < 1500 && !g.gateEnt().down; i++) g.tick(0.1); });
  await p.waitForTimeout(800);
  const br = await h.st(() => ({ down: !!window.dal.game.gateEnt().down, gold: Math.round(window.dal.game.state.gold), raiders: window.dal.game.state.entities.filter((e) => e.raid).length }));
  check('an undefended gate is breached: gold plundered, raiders leave', br.down && br.gold < 4300 && br.raiders === 0 && /breached/.test(await p.textContent('#toasts')), JSON.stringify(br));
  await p.screenshot({ path: `${out}/c-breach.png` });
  await h.st(() => { const g = window.dal.game; for (let i = 0; i < 500; i++) g.tick(0.1); });
  check('the gate restores itself after a breach', await h.st(() => !window.dal.game.gateEnt().down && window.dal.game.gateEnt().hp > 300));
  // victory
  await h.st(() => { const g = window.dal.game; for (const c of g.state.camps) { const e = g.entById.get(c.entId); if (e) e.hp = 0; } for (let i = 0; i < 5; i++) g.tick(0.1); });
  await p.waitForTimeout(900);
  check('destroying the last stronghold shows the victory screen', (await p.isVisible('#modal')) && /Dawn Over All/.test(await p.textContent('#modal')));
  check('all blight is lifted', await h.st(() => !window.dal.game.blight.some((v) => v)));
  await h.clickEl('[data-act="closeModal"]');
  // new island from the menu
  const seed0 = await h.st(() => window.dal.game.state.seed);
  await h.clickEl('[data-act="menu"]'); await h.clickEl('[data-act="newGame"]'); await p.waitForTimeout(1500);
  check('"Start a new island" resets to a fresh game in the Light World', await h.st((s0) => { const S = window.dal.game.state; return S.seed !== s0 && S.buildings.length === 1 && !window.dal.dark && !document.body.classList.contains('dark'); }, seed0));
  check('dark world: no console errors', p.errs.length === 0, p.errs.slice(0, 3).join(' | '));
  await p.context().close();

  // =================== 4. touch ===================
  p = await boot(b, { hasTouch: true, isMobile: false }); h = H(p);
  await p.tap('#btnNew'); await p.waitForTimeout(1200);
  check('touch: tapping New Game starts', await p.evaluate(() => document.body.classList.contains('started')));
  const s4 = await h.st(() => window.dal.game.world.start);
  await p.tap('.bbtn[data-t="house"]'); await p.waitForTimeout(100);
  check('touch: tapping a build button selects the tool', (await h.st(() => window.dal.tool)) === 'house');
  await p.tap('button[data-act="tool"][data-t="road"]');
  let c4 = await h.scr(s4.x + 0.5, s4.z + 3.5); await p.touchscreen.tap(c4[0], c4[1]); await p.waitForTimeout(150);
  check('touch: tapping the ground lays a road tile', (await h.st(() => window.dal.game.state.roads.length)) === 1);
  await p.tap('button[data-act="tool"][data-t="road"]');
  const cdp = await p.context().newCDPSession(p);
  const camA = await h.st(() => ({ ...window.dal.renderer.cam }));
  const tp = (pts) => pts.map(([x, y], i) => ({ x, y, id: i, radiusX: 4, radiusY: 4, force: 1 }));
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp([[600, 300]]) });
  for (let i = 1; i <= 6; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp([[600 - i * 25, 300 + i * 12]]) }); await p.waitForTimeout(40); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await p.waitForTimeout(300);
  const camB = await h.st(() => ({ ...window.dal.renderer.cam }));
  check('touch: one-finger drag pans the camera', Math.hypot(camB.tx - camA.tx, camB.tz - camA.tz) > 1.5, `moved ${Math.hypot(camB.tx - camA.tx, camB.tz - camA.tz).toFixed(1)} tiles`);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: tp([[500, 350], [700, 350]]) });
  for (let i = 1; i <= 6; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: tp([[500 + i * 12, 350], [700 - i * 12, 350]]) }); await p.waitForTimeout(40); }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await p.waitForTimeout(300);
  const camC = await h.st(() => ({ ...window.dal.renderer.cam }));
  check('touch: pinching in zooms out', camC.tdist > camB.tdist * 1.3, `dist ${camB.tdist.toFixed(1)} → ${camC.tdist.toFixed(1)}`);
  check('touch: pinch does not also pan', Math.hypot(camC.tx - camB.tx, camC.tz - camB.tz) < 0.5, `moved ${Math.hypot(camC.tx - camB.tx, camC.tz - camB.tz).toFixed(2)}`);
  check('touch: no console errors', p.errs.length === 0, p.errs.slice(0, 3).join(' | '));
  await p.context().close();

  const failed = results.filter((r) => !r.ok);
  console.log(`\n===== ${results.length - failed.length}/${results.length} checks passed =====`);
  failed.forEach((f) => console.log('FAILED: ' + f.name + (f.detail ? ' — ' + f.detail : '')));
  await b.close();
})().catch((e) => { console.log('SCRIPT CRASH', e); process.exit(1); });
