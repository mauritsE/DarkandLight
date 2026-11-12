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
- Build a **Harbor** and three merchant houses will visit. Click the harbor to sell and buy, or set standing orders ("sell above 40") that run whenever a ship is docked.

**Dark World — fight**

- Raise the **Rift Gate**, then press <kbd>Tab</kbd> (or the round button) to cross over. Your city appears as a ghost; only the gate is solid in both worlds.
- Train soldiers at a **Barracks** (each supports 6). They appear at the gate. Drag to select, right-click to move or attack.
- Strongholds send **raids** against your gate. If it is breached, raiders plunder your treasury. Light Beacons and a garrison keep it safe.
- Destroying a stronghold lifts its blight from the Light World and yields **Umbral Shards**, which power Lumen Spires and Dawnblade champions. Raze all three to win.

## Controls

| | |
|---|---|
| Move camera | <kbd>W</kbd><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd> / arrows, or drag the ground / minimap |
| Rotate / zoom | <kbd>Q</kbd> <kbd>E</kbd> or right-drag / mouse wheel |
| Switch world | <kbd>Tab</kbd> or <kbd>Space</kbd> |
| Road / demolish tool | <kbd>R</kbd> / <kbd>X</kbd> |
| Cancel, deselect | <kbd>Esc</kbd> or right-click |
| Select all soldiers | <kbd>F</kbd> (Dark World) |
| Game speed | <kbd>P</kbd> pause, <kbd>1</kbd> <kbd>2</kbd> <kbd>3</kbd> |
| Back to the Keep | <kbd>H</kbd> |

The game autosaves to the browser every 20 seconds.

## Code map

- `src/sim/` — the game rules, independent of rendering: `world.ts` (island generation), `economy.ts`, `trade.ts`, `combat.ts`, `quests.ts`, `defs.ts` (all balance numbers).
- `src/render/` — three.js scene: terrain and water, procedural building/unit models, particles, the light/dark switch.
- `src/ui/` — HUD, panels, minimap and procedural audio.
- `tests/` — simulation tests, including a scripted player that plays a whole campaign without cheats to keep the balance honest.
