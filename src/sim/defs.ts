// Static game data: goods, buildings, units, factions, merchants.

export type Good =
  | 'wood' | 'planks' | 'stone' | 'fish' | 'grain' | 'bread'
  | 'wool' | 'cloth' | 'iron' | 'weapons' | 'shards';

export const GOOD_IDS: Good[] = [
  'wood', 'planks', 'stone', 'fish', 'grain', 'bread', 'wool', 'cloth', 'iron', 'weapons', 'shards',
];

export const GOODS: Record<Good, { name: string; icon: string; price: number }> = {
  wood: { name: 'Wood', icon: '🪵', price: 4 },
  planks: { name: 'Planks', icon: '🪚', price: 9 },
  stone: { name: 'Stone', icon: '🪨', price: 8 },
  fish: { name: 'Fish', icon: '🐟', price: 6 },
  grain: { name: 'Grain', icon: '🌾', price: 5 },
  bread: { name: 'Bread', icon: '🍞', price: 12 },
  wool: { name: 'Wool', icon: '🐑', price: 8 },
  cloth: { name: 'Cloth', icon: '🧵', price: 18 },
  iron: { name: 'Iron', icon: '⛏️', price: 14 },
  weapons: { name: 'Weapons', icon: '⚔️', price: 40 },
  shards: { name: 'Umbral Shards', icon: '🔮', price: 90 },
};

export type Cost = Partial<Record<Good, number>>;

export type BuildingId =
  | 'townhall' | 'house' | 'market' | 'chapel' | 'spire' | 'warehouse'
  | 'woodcutter' | 'sawmill' | 'fishery' | 'quarry' | 'farm' | 'bakery'
  | 'sheepfarm' | 'weaver' | 'mine' | 'forge' | 'harbor' | 'gate' | 'barracks'
  | 'forester' | 'garden' | 'fountain' | 'statue';

export type Category = 'civic' | 'production' | 'war' | 'decor';

export interface BuildingDef {
  id: BuildingId;
  name: string;
  desc: string;
  icon: string;
  size: number;
  gold: number;
  cost: Cost;
  upkeep: number; // gold per minute
  workers: number;
  cycle?: number; // seconds per production cycle
  inputs?: Cost;
  outputs?: Cost;
  needs?: 'coast' | 'rock' | 'forest';
  radius?: number; // service radius
  beauty?: number; // charm added to homes nearby
  category: Category;
  unlockPop: number;
  unique?: boolean;
  requires?: BuildingId;
  hidden?: boolean;
}

const B = (d: BuildingDef) => d;

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  townhall: B({ id: 'townhall', name: 'Keep', desc: 'The heart of your settlement. Roads must lead here.', icon: '🏰', size: 3, gold: 0, cost: {}, upkeep: 0, workers: 0, category: 'civic', unlockPop: 0, hidden: true }),
  house: B({ id: 'house', name: 'House', desc: 'Home for residents. They pay taxes and work your buildings. Upgrades as needs are met.', icon: '🏠', size: 2, gold: 0, cost: { wood: 2 }, upkeep: 0, workers: 0, category: 'civic', unlockPop: 0 }),
  market: B({ id: 'market', name: 'Market', desc: 'Residents nearby can shop. A basic need of every home.', icon: '🛍️', size: 3, gold: 100, cost: { wood: 8 }, upkeep: 10, workers: 0, radius: 10, category: 'civic', unlockPop: 0 }),
  chapel: B({ id: 'chapel', name: 'Chapel', desc: 'Burghers need a place of quiet. Across the Rift its light heals your soldiers nearby.', icon: '⛪', size: 2, gold: 150, cost: { planks: 8, stone: 6 }, upkeep: 15, workers: 0, radius: 11, category: 'civic', unlockPop: 40 }),
  spire: B({ id: 'spire', name: 'Lumen Spire', desc: 'Burns Umbral Shards into pure light. Luminaries demand it — and in the Dark World it strikes foes that come near.', icon: '🗼', size: 2, gold: 400, cost: { stone: 12, shards: 6 }, upkeep: 30, workers: 0, radius: 11, cycle: 90, inputs: { shards: 1 }, category: 'civic', unlockPop: 80 }),
  warehouse: B({ id: 'warehouse', name: 'Warehouse', desc: 'Raises the storage limit of every good by 40.', icon: '📦', size: 2, gold: 80, cost: { wood: 6 }, upkeep: 8, workers: 0, category: 'civic', unlockPop: 0 }),

  woodcutter: B({ id: 'woodcutter', name: 'Woodcutter', desc: 'Fells trees nearby. More forest in reach means more wood.', icon: '🪓', size: 2, gold: 30, cost: {}, upkeep: 3, workers: 4, cycle: 6, outputs: { wood: 1 }, needs: 'forest', category: 'production', unlockPop: 0 }),
  sawmill: B({ id: 'sawmill', name: 'Sawmill', desc: 'Saws wood into planks.', icon: '🪚', size: 2, gold: 60, cost: { wood: 4 }, upkeep: 5, workers: 4, cycle: 10, inputs: { wood: 1 }, outputs: { planks: 1 }, category: 'production', unlockPop: 0 }),
  fishery: B({ id: 'fishery', name: 'Fishery', desc: 'Catches fish. Must stand on the coast.', icon: '🎣', size: 2, gold: 40, cost: { wood: 4 }, upkeep: 4, workers: 4, cycle: 9, outputs: { fish: 1 }, needs: 'coast', category: 'production', unlockPop: 0 }),
  quarry: B({ id: 'quarry', name: 'Quarry', desc: 'Cuts stone. Must be near mountains.', icon: '🪨', size: 2, gold: 80, cost: { wood: 6 }, upkeep: 8, workers: 6, cycle: 12, outputs: { stone: 1 }, needs: 'rock', category: 'production', unlockPop: 0 }),
  farm: B({ id: 'farm', name: 'Grain Farm', desc: 'Grows grain for the bakery.', icon: '🌾', size: 3, gold: 60, cost: { wood: 6 }, upkeep: 5, workers: 6, cycle: 12, outputs: { grain: 2 }, category: 'production', unlockPop: 30 }),
  bakery: B({ id: 'bakery', name: 'Bakery', desc: 'Bakes grain into bread.', icon: '🍞', size: 2, gold: 90, cost: { planks: 4 }, upkeep: 8, workers: 4, cycle: 12, inputs: { grain: 2 }, outputs: { bread: 2 }, category: 'production', unlockPop: 30 }),
  sheepfarm: B({ id: 'sheepfarm', name: 'Sheep Farm', desc: 'Raises sheep for wool.', icon: '🐑', size: 3, gold: 80, cost: { wood: 6 }, upkeep: 6, workers: 4, cycle: 14, outputs: { wool: 1 }, category: 'production', unlockPop: 30 }),
  weaver: B({ id: 'weaver', name: 'Weaver', desc: 'Weaves wool into cloth.', icon: '🧵', size: 2, gold: 110, cost: { planks: 6 }, upkeep: 10, workers: 6, cycle: 14, inputs: { wool: 1 }, outputs: { cloth: 1 }, category: 'production', unlockPop: 30 }),
  mine: B({ id: 'mine', name: 'Iron Mine', desc: 'Digs iron ore. Must be near mountains.', icon: '⛏️', size: 2, gold: 150, cost: { planks: 8 }, upkeep: 15, workers: 8, cycle: 14, outputs: { iron: 1 }, needs: 'rock', category: 'production', unlockPop: 50 }),
  forge: B({ id: 'forge', name: 'Forge', desc: 'Hammers iron and wood into weapons.', icon: '🔥', size: 2, gold: 180, cost: { planks: 6, stone: 6 }, upkeep: 18, workers: 6, cycle: 18, inputs: { iron: 1, wood: 1 }, outputs: { weapons: 1 }, category: 'production', unlockPop: 50 }),

  forester: B({ id: 'forester', name: 'Forester', desc: 'Plants new trees on open grass nearby, so your woodcutters never run dry.', icon: '🌲', size: 2, gold: 50, cost: { wood: 2 }, upkeep: 4, workers: 2, cycle: 16, category: 'production', unlockPop: 0 }),

  garden: B({ id: 'garden', name: 'Garden', desc: 'Flower beds and hedges. Homes nearby gain charm and pay more tax.', icon: '🌷', size: 1, gold: 15, cost: {}, upkeep: 0, workers: 0, beauty: 1, category: 'decor', unlockPop: 0 }),
  statue: B({ id: 'statue', name: 'Statue', desc: 'A monument to your founders. Adds charm to homes nearby.', icon: '🗿', size: 1, gold: 70, cost: { stone: 3 }, upkeep: 0, workers: 0, beauty: 2.5, category: 'decor', unlockPop: 30 }),
  fountain: B({ id: 'fountain', name: 'Fountain', desc: 'A splashing plaza fountain. Adds much charm to homes nearby.', icon: '⛲', size: 2, gold: 120, cost: { stone: 6 }, upkeep: 2, workers: 0, beauty: 5, category: 'decor', unlockPop: 40 }),

  harbor: B({ id: 'harbor', name: 'Harbor', desc: 'Merchant ships dock here to trade. Must stand on the coast.', icon: '⚓', size: 3, gold: 150, cost: { wood: 10 }, upkeep: 10, workers: 0, needs: 'coast', category: 'war', unlockPop: 16, unique: true }),
  gate: B({ id: 'gate', name: 'Rift Gate', desc: 'A doorway to the Dark World. Once raised, the dark will notice you.', icon: '🌀', size: 3, gold: 300, cost: { planks: 10, stone: 10 }, upkeep: 15, workers: 0, category: 'war', unlockPop: 50, unique: true }),
  barracks: B({ id: 'barracks', name: 'Barracks', desc: 'Trains soldiers who march through the Rift Gate. Each barracks supports 6 soldiers.', icon: '🛡️', size: 3, gold: 200, cost: { planks: 8, stone: 6 }, upkeep: 20, workers: 0, category: 'war', unlockPop: 50, requires: 'gate' }),
};

export const ROAD_COST = 2;
export const BASE_STORAGE = 60;
export const WAREHOUSE_STORAGE = 40;

// --- Population ---
export const TIERS = [
  { name: 'Settlers', cap: 8, tax: 1.0, goods: { fish: 0.09 } as Cost, services: ['market'] as BuildingId[], upgrade: {} as Cost },
  { name: 'Burghers', cap: 16, tax: 1.9, goods: { fish: 0.07, bread: 0.06, cloth: 0.03 } as Cost, services: ['market', 'chapel'] as BuildingId[], upgrade: { planks: 3, stone: 2 } as Cost },
  { name: 'Luminaries', cap: 28, tax: 3.2, goods: { fish: 0.06, bread: 0.06, cloth: 0.04 } as Cost, services: ['market', 'chapel', 'spire'] as BuildingId[], upgrade: { planks: 4, stone: 4, cloth: 2 } as Cost },
];

// --- Units ---
export type UnitKind =
  | 'swordsman' | 'archer' | 'knight' | 'beacon' | 'gate'
  | 'ghoul' | 'spitter' | 'brute' | 'sovereign' | 'camp';

export interface UnitDef {
  name: string; icon: string; desc?: string;
  hp: number; dmg: number; range: number; cd: number; speed: number;
  aggro: number; radius: number; ranged?: boolean; aoe?: number;
  gold?: number; cost?: Cost; upkeep?: number;
}

export const UNITS: Record<UnitKind, UnitDef> = {
  swordsman: { name: 'Swordsman', icon: '🗡️', desc: 'Sturdy front-line fighter.', hp: 95, dmg: 11, range: 0.9, cd: 1.0, speed: 2.3, aggro: 7, radius: 0.3, gold: 50, cost: { weapons: 1 }, upkeep: 3 },
  archer: { name: 'Archer', icon: '🏹', desc: 'Strikes from afar. Fragile.', hp: 55, dmg: 9, range: 5.5, cd: 1.3, speed: 2.4, aggro: 7.5, radius: 0.28, ranged: true, gold: 60, cost: { weapons: 1, wood: 2 }, upkeep: 3 },
  knight: { name: 'Dawnblade', icon: '🌟', desc: 'Shard-forged champion of the light.', hp: 240, dmg: 27, range: 1.0, cd: 1.1, speed: 2.7, aggro: 7, radius: 0.36, gold: 150, cost: { weapons: 2, shards: 2 }, upkeep: 8 },
  beacon: { name: 'Light Beacon', icon: '🕯️', desc: 'A tower of light that burns nearby foes. Built in the Dark World.', hp: 260, dmg: 14, range: 6.5, cd: 1.2, speed: 0, aggro: 6.5, radius: 0.5, ranged: true, gold: 120, cost: { stone: 4, shards: 2 }, upkeep: 4 },
  gate: { name: 'Rift Gate', icon: '🌀', hp: 800, dmg: 14, range: 5, cd: 1.0, speed: 0, aggro: 5, radius: 1.3, ranged: true },
  ghoul: { name: 'Hollow Ghoul', icon: '👹', hp: 70, dmg: 8, range: 0.9, cd: 1.1, speed: 2.4, aggro: 8, radius: 0.3 },
  spitter: { name: 'Ash Spitter', icon: '🦂', hp: 55, dmg: 10, range: 5, cd: 1.6, speed: 2.0, aggro: 8, radius: 0.28, ranged: true },
  brute: { name: 'Cinder Brute', icon: '👺', hp: 330, dmg: 24, range: 1.1, cd: 1.6, speed: 1.7, aggro: 8, radius: 0.45 },
  sovereign: { name: 'The Night Sovereign', icon: '👑', hp: 2600, dmg: 46, range: 1.6, cd: 1.5, speed: 1.7, aggro: 9, radius: 0.7, aoe: 2 },
  camp: { name: 'Stronghold', icon: '🏚️', hp: 500, dmg: 13, range: 6, cd: 1.3, speed: 0, aggro: 6, radius: 1.4, ranged: true },
};

export const TRAINABLE: UnitKind[] = ['swordsman', 'archer', 'knight'];
export const ARMY_PER_BARRACKS = 6;
export const MAX_BEACONS = 6;
export const TRAIN_TIME = 6;
export const BLIGHT_RADIUS = 7;
export const BEAUTY_RADIUS = 5.5;
export const BEAUTY_FULL = 6; // charm points for the full bonus
export const BEAUTY_TAX = 0.2; // extra tax at full charm
export const SPIRE_RANGE = 7.5;
export const SPIRE_DMG = 16;
export const CHAPEL_RANGE = 6.5;
export const CHAPEL_HEAL = 5; // hp per second
export const DIFFICULTY = [
  { name: 'Peaceful', desc: 'No raids. The strongholds only defend themselves.' },
  { name: 'Standard', desc: 'Raids test your gate now and then.' },
  { name: 'Relentless', desc: 'Bigger raids, more often.' },
];

export interface CampDef {
  id: string; name: string; leader: string; color: number;
  hp: number; dmg: number; respawn: number; guards: UnitKind[]; raid: UnitKind[];
  lootGold: number; lootShards: number;
}

export const CAMPS: CampDef[] = [
  { id: 'hollow', name: 'The Hollow Court', leader: 'Lady Vesper', color: 0xb04cff, hp: 1500, dmg: 12, respawn: 45, guards: ['ghoul', 'ghoul', 'ghoul', 'ghoul', 'ghoul', 'ghoul', 'ghoul'], raid: ['ghoul'], lootGold: 300, lootShards: 8 },
  { id: 'ashen', name: 'The Ashen Brood', leader: 'Karg Cinder-Maw', color: 0xff5a2a, hp: 3600, dmg: 18, respawn: 28, guards: ['ghoul', 'ghoul', 'ghoul', 'ghoul', 'spitter', 'spitter', 'spitter', 'spitter', 'brute', 'brute'], raid: ['ghoul', 'spitter', 'ghoul', 'brute'], lootGold: 600, lootShards: 15 },
  { id: 'sovereign', name: 'The Night Sovereign', leader: 'Nyx-Athar', color: 0xff2a6a, hp: 8000, dmg: 28, respawn: 20, guards: ['sovereign', 'brute', 'brute', 'brute', 'brute', 'spitter', 'spitter', 'spitter', 'spitter', 'spitter', 'ghoul', 'ghoul', 'ghoul', 'ghoul'], raid: ['brute', 'spitter', 'ghoul', 'spitter', 'brute'], lootGold: 1500, lootShards: 30 },
];

// --- Trade ---
export interface MerchantDef {
  id: string; name: string; captain: string; color: number;
  buys: Partial<Record<Good, number>>; // multiplier on base price they pay you (default 0.7)
  sells: Partial<Record<Good, { mult: number; qty: number }>>; // what the ship carries
}

export const MERCHANTS: MerchantDef[] = [
  { id: 'salt', name: 'Salt Guild', captain: 'Captain Maren', color: 0x3d7fd9,
    buys: { cloth: 1.15, bread: 1.1, fish: 0.9, planks: 0.85 },
    sells: { stone: { mult: 1.3, qty: 20 }, iron: { mult: 1.35, qty: 12 }, fish: { mult: 1.3, qty: 25 } } },
  { id: 'verdant', name: 'Verdant League', captain: 'Factor Ilse', color: 0x3fae5a,
    buys: { planks: 1.1, stone: 1.0, weapons: 0.95, wool: 0.9 },
    sells: { wood: { mult: 1.3, qty: 30 }, grain: { mult: 1.3, qty: 24 }, wool: { mult: 1.3, qty: 14 }, bread: { mult: 1.4, qty: 14 } } },
  { id: 'dusk', name: 'Dusk Brokers', captain: 'Broker Sable', color: 0x9a52d6,
    buys: { shards: 1.2, weapons: 1.15, iron: 1.0, cloth: 0.95 },
    sells: { weapons: { mult: 1.5, qty: 8 }, planks: { mult: 1.3, qty: 20 }, cloth: { mult: 1.4, qty: 10 }, shards: { mult: 1.8, qty: 3 } } },
];

export const DEFAULT_BUY_MULT = 0.7;
