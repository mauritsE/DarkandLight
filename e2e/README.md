# Browser tests

Both scripts drive the real game in headless Chromium with Playwright, using only mouse, keyboard and touch input.
They read game state to decide what to do and to verify each action, but never change it (except where a
check explicitly sets up a scenario, which the script says in place).

Start the dev server first:

```bash
npm run dev -- --port 5173 --strictPort
```

```bash
node e2e/controls.cjs /tmp/shots
```

Runs ~105 checks of every control, panel, shortcut and touch gesture (about 3 minutes).

```bash
node e2e/campaign.cjs /tmp/shots 2024
```

Plays a whole campaign on island 2024 by clicking: builds the town, trades, fulfils contracts, crosses the Rift,
trains, harvests, fights and wins. Game time is fast-forwarded between actions, because headless software
rendering is slow; expect ~25 minutes. Add `war` as a third argument for a military-only run (~3 minutes).

Screenshots land in the folder given as the first argument. Playwright must be installed where Node can find it.
