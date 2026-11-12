import type { BuildingId, Good, UnitKind } from './defs';

export type Status = 'ok' | 'noRoad' | 'noInput' | 'full' | 'noWorkers' | 'noResource' | 'paused';

export interface Building {
  id: number;
  type: BuildingId;
  x: number; z: number; // top-left tile
  progress: number;
  status: Status;
  connected: boolean;
  resEff: number;
  paused?: boolean;
  fuel?: number; // spire: seconds of light left
  // houses
  tier?: number;
  residents?: number;
  sat?: number;
  upT?: number;
  cov?: Partial<Record<BuildingId, boolean>>;
  beauty?: number; // 0..1 charm from ornaments nearby
}

export const ORDER = { Idle: 0, Move: 1, Attack: 2, AttackMove: 3 } as const;

export interface Entity {
  id: number;
  kind: UnitKind;
  team: number; // 0 player, 1 dark
  x: number; z: number;
  hp: number;
  cd: number;
  think: number;
  tgt: number;
  otgt?: number; // explicitly ordered attack target
  order: number;
  ox: number; oz: number;
  path: number[] | null;
  pi: number;
  repath: number;
  gx: number; gz: number; // goal the current path was built for
  hx: number; hz: number; // home
  camp: number; // camp index or -1
  raid?: boolean;
  face: number;
  moving?: boolean;
  atkT?: number; // time of last attack (for animation)
  down?: boolean; // gate breached
}

export interface Projectile {
  id: number; x: number; z: number; y: number; tgt: number; dmg: number; team: number; from: number;
}

export interface Ship {
  merchant: number;
  phase: 'away' | 'arriving' | 'docked' | 'leaving';
  t: number; // time left in phase
  stock: Partial<Record<Good, number>>;
}

export interface CampState { alive: boolean; entId: number; respawn: number; well: number }

export interface ShardNode { x: number; z: number; ready: boolean; t: number; prog: number }
export interface Contract { merchant: number; good: Good; qty: number; reward: number; t: number }

export interface TradeOrder { mode: 'none' | 'sell' | 'buy'; level: number }

export interface GameState {
  version: number;
  seed: number;
  time: number;
  gold: number;
  income: number; // gold per minute (display)
  stock: Record<Good, number>;
  buildings: Building[];
  roads: number[];
  tiles: Record<string, number>; // tile type overrides (cleared or planted forest)
  flat: [number, number][];
  nextId: number;
  pop: number;
  peakPop: number;
  jobs: number;
  workEff: number;
  happiness: number;
  needSat: Partial<Record<Good, number>>;
  autoUpgrade: boolean;
  ships: Ship[];
  orders: Partial<Record<Good, TradeOrder>>;
  rep: number[];
  entities: Entity[];
  projectiles: Projectile[];
  camps: CampState[];
  raidTimer: number;
  raidCount: number;
  gateDown: number;
  trainQ: UnitKind[];
  trainT: number;
  quest: number; // first open quest (shown in the HUD)
  qdone: boolean[];
  difficulty: number;
  nodes: ShardNode[];
  contracts: Contract[];
  contractT: number;
  stats: { trades: number; kills: number; trained: number; visitedDark: boolean; t2: number; t3: number; contracts: number; harvested: number };
  won: boolean;
}

export type GameEvent =
  | { t: 'toast'; msg: string; kind: 'info' | 'warn' | 'good' }
  | { t: 'built'; id: number }
  | { t: 'removed'; id: number }
  | { t: 'hit'; x: number; z: number; team: number }
  | { t: 'shot'; x: number; z: number; team: number }
  | { t: 'die'; x: number; z: number; kind: UnitKind; team: number }
  | { t: 'spawn'; x: number; z: number; team: number }
  | { t: 'raid'; camp: number }
  | { t: 'breach' }
  | { t: 'campDown'; camp: number }
  | { t: 'upgrade'; id: number }
  | { t: 'trade' }
  | { t: 'prod'; id: number; good: Good; n: number }
  | { t: 'harvest'; x: number; z: number; n: number }
  | { t: 'loot'; x: number; z: number; n: number }
  | { t: 'quest'; msg: string }
  | { t: 'victory' };
