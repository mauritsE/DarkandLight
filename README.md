# Dark & Light

An island city-builder with two worlds. In the **Light World** you lay roads, raise homes and
workshops, and trade with merchant ships. Through the **Rift Gate** lies the **Dark World** — the
same island in shadow — where your soldiers fight three hostile strongholds whose blight keeps
parts of the light island unbuildable.

Built with TypeScript, Vite and three.js. All models, terrain, effects and sound are generated in code.

## Run it

```bash
npm install
```

```bash
npm run dev
```

Then open the printed URL. `npm run build` makes a static bundle in `dist/`, `npm test` runs the simulation tests.

## How to play

**Light World — build and trade**

- Everything must connect by **road** to your Keep. Houses bring residents, who pay taxes and staff your buildings.
- Residents have needs: fish and a market first; bread, cloth and a chapel for **Burghers**; a Lumen Spire for **Luminaries**. Content, full homes upgrade on their own and pay more tax.
- Production chains: woodcutter → sawmill, farm → bakery, sheep farm → weaver, iron mine + wood → forge (weapons).
- Build a **Harbor** and three merchant houses will visit. Click the harbor to sell and buy, or set standing orders ("sell above 40") that run whenever a ship is docked. Merchants also offer timed **contracts** that pay well above market price.
- A **Forester** replants trees so woodcutters never run dry. **Gardens, statues and fountains** give nearby homes charm, which raises their taxes by up to 20%.
- Click the gold counter (or press <kbd>L</kbd>) for the **ledger**: income breakdown and what every good is produced and used at per minute. The quest card lists the city's most pressing problems; click it to jump there.

**Dark World — fight**

- Raise the **Rift Gate**, then press <kbd>Tab</kbd> (or the round button) to cross over. Your city appears as a ghost; only the gate is solid in both worlds.
- Train soldiers at a **Barracks** (each supports 6). They appear at the gate. Drag to select, right-click to move or attack.
- Strongholds send **raids** against your gate. If it is breached, raiders plunder your treasury. Light Beacons and a garrison keep it safe.
- Your city reaches across the Rift: a lit **Lumen Spire** strikes dark creatures near it, and soldiers heal near a **Chapel**. Where you build matters for defence.
- **Shard crystals** glow pink across the dark island. Stand soldiers beside one to harvest it; they regrow after a few minutes.
- <kbd>C</kbd> (or Shift + right-click) orders a **charge**: march and fight everything on the way. <kbd>G</kbd> sends the selection back to the gate to heal.
- Destroying a stronghold lifts its blight from the Light World and yields **Umbral Shards**, which power Lumen Spires and Dawnblade champions. Raze all three to win.

## Controls

| | |
|---|---|
| Move camera | <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / arrows, or drag the ground / minimap |
| Rotate / zoom | <kbd>Q</kbd> <kbd>E</kbd> or right-drag / mouse wheel |
| Switch world | <kbd>Tab</kbd> or <kbd>Space</kbd> |
| Road / demolish tool | <kbd>R</kbd> / <kbd>X</kbd> |
| Cancel, deselect | <kbd>Esc</kbd> or right-click |
| Select all / charge / retreat | <kbd>F</kbd> / <kbd>C</kbd> / <kbd>G</kbd> (Dark World) |
| Ledger | <kbd>L</kbd> |
| Game speed | <kbd>P</kbd> pause, <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> |
| Back to the Keep | <kbd>H</kbd> |

The title screen offers three difficulties: **Peaceful** (no raids — a pure builder), **Standard** and **Relentless**.

The game autosaves to the browser every 20 seconds.

## Testing

```bash
npm test
```

runs 29 simulation tests (about a minute), including:

- **Scripted campaigns** on six different islands and all three difficulties: a rule-following player builds a town from nothing, trades, raises armies and razes all three strongholds, with state invariants checked every few seconds.
- **Monkey testing**: thousands of random actions per island, legal or not, with save/load in the middle. Nothing may throw, and a reloaded game must serialise identically.
- A test per mechanic (housing tiers, contracts, forester, charm, spire and chapel in the Dark World, crystals, orders, difficulty).

`e2e/` holds two browser scripts that use only real mouse, keyboard and touch input: a 105-point checklist of every control, and a full campaign played by clicking. See `e2e/README.md`.

Useful URL switches: `?seed=2024` starts on a specific island, `?gfx=low` turns off shadows and bloom (also in the ☰ menu).

## Code map

- `src/sim/` — the game rules, independent of rendering: `world.ts` (island generation), `economy.ts`, `trade.ts`, `combat.ts`, `quests.ts`, `defs.ts` (all balance numbers).
- `src/render/` — three.js scene: terrain and water, procedural building/unit models, particles, the light/dark switch.
- `src/ui/` — HUD, panels, minimap and procedural audio.
- `tests/` — simulation tests; `e2e/` — browser tests.
