import type { Game } from './game';

export interface Quest { title: string; text: string; reward: number; done: (g: Game) => boolean }

export const QUESTS: Quest[] = [
  { title: 'First Hearths', text: 'Lay a road from your Keep and build 4 Houses beside it.', reward: 100,
    done: (g) => g.state.buildings.filter((b) => b.type === 'house' && b.connected).length >= 4 },
  { title: 'Timber & Tide', text: 'Build a Woodcutter near forest and a Fishery on the coast. Connect both by road.', reward: 100,
    done: (g) => !!g.state.buildings.find((b) => b.type === 'woodcutter' && b.connected) && !!g.state.buildings.find((b) => b.type === 'fishery' && b.connected) },
  { title: 'Market Day', text: 'Build a Market near your homes and grow to 40 residents.', reward: 150,
    done: (g) => !!g.find('market') && g.state.pop >= 40 },
  { title: 'Sawdust & Stone', text: 'Build a Sawmill and a Quarry.', reward: 150,
    done: (g) => !!g.find('sawmill') && !!g.find('quarry') },
  { title: 'Sails on the Horizon', text: 'Build a Harbor and trade 10 goods with a visiting merchant.', reward: 200,
    done: (g) => g.state.stats.trades >= 10 },
  { title: 'Rising Burghers', text: 'Supply bread and cloth, build a Chapel, and see a home rise to Burgher rank.', reward: 250,
    done: (g) => g.state.stats.t2 >= 1 },
  { title: 'The Other Side', text: 'Raise the Rift Gate, then step into the Dark World (Tab).', reward: 250,
    done: (g) => !!g.find('gate') && g.state.stats.visitedDark },
  { title: 'Steel for the Dark', text: 'Forge weapons, build a Barracks and train 5 soldiers.', reward: 250,
    done: (g) => g.state.stats.trained >= 5 },
  { title: 'Break the Court', text: 'Lead your soldiers in the Dark World and destroy the stronghold of the Hollow Court.', reward: 400,
    done: (g) => !g.state.camps[0].alive },
  { title: 'Light from Shadow', text: 'Build a Lumen Spire to burn shards into light, and see a home rise to Luminary rank.', reward: 500,
    done: (g) => g.state.stats.t3 >= 1 },
  { title: 'Ashes to Ashes', text: 'Destroy the Ashen Brood.', reward: 600,
    done: (g) => !g.state.camps[1].alive },
  { title: 'Dawn Over All', text: 'Slay the Night Sovereign and raze the last stronghold.', reward: 1000,
    done: (g) => g.state.won },
];

export function tickQuests(g: Game) {
  const S = g.state;
  while (S.quest < QUESTS.length && QUESTS[S.quest].done(g)) {
    const q = QUESTS[S.quest];
    S.gold += q.reward; S.quest++;
    g.events.push({ t: 'quest', msg: `${q.title} complete — +${q.reward} gold` });
  }
}
