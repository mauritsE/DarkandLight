import { describe, expect, it } from 'vitest';
import { campaign } from './helpers';

const fmt = (r: ReturnType<typeof campaign>) =>
  `seed ${r.seed}: built ${r.built}/${r.planned}, gate ${r.gate.toFixed(1)}m, first attack ${r.army.toFixed(1)}m, victory ${r.win ? r.win.toFixed(1) + 'm' : 'NO'}, retreats ${r.retreats}, minGold ${Math.round(r.minGold)}, pop ${r.pop}, income ${Math.round(r.income)}, raids ${r.raids}, army left ${r.left}`;

describe('scripted campaigns (no cheats)', () => {
  for (const seed of [2024, 1, 7, 42, 99, 31337]) {
    it(`standard difficulty, island ${seed}: builds up and razes all three strongholds`, () => {
      const r = campaign(seed, 1);
      console.log(fmt(r));
      expect(r.built).toBe(r.planned);
      expect(r.game.state.won).toBe(true);
      expect(r.minGold).toBeGreaterThan(-300.01); // debt is capped at 300
    }, 180_000);
  }
  it('relentless difficulty is winnable too', () => {
    const r = campaign(2024, 2);
    console.log(fmt(r));
    expect(r.game.state.won).toBe(true);
  }, 180_000);
  it('peaceful difficulty: never raided, still winnable', () => {
    const r = campaign(2024, 0);
    console.log(fmt(r));
    expect(r.raids).toBe(0);
    expect(r.game.state.won).toBe(true);
  }, 180_000);
});
