// ===== 战略模式类型定义 =====

import { Faction, AIDifficulty, UnitType } from './types';
import type { ForceCommandState } from './command/command-types';

/** Game mode */
export type GameMode = 'tactical' | 'strategic' | 'campaign';

/** Strategic terrain - simplified for the larger map */
export type StrategicTerrainType = 'plains' | 'forest' | 'mountain' | 'water' | 'city' | 'desert' | 'marshland' | 'highland';

/** Strategic position */
export interface StrategicPosition {
  x: number;
  y: number; // Using y instead of z for strategic map
}

/** Strategic unit - simplified unit in a force */
export interface StrategicUnit {
  type: UnitType;
  count: number; // Number of this unit type
}

/** Strategic force - represents a military unit group in a sector */
export interface StrategicForce {
  id: string;
  faction: Faction;
  name: string; // e.g. "第1装甲营", "第3步兵旅"
  units: StrategicUnit[]; // Composition
  position: StrategicPosition;
  canMove: boolean;
  hasAttacked: boolean;
  isAlive: boolean;
  combatPower: number; // Aggregate attack power
  defensePower: number; // Aggregate defense power
  moveRange: number; // How many sectors it can move
  vision: number; // How many sectors it can see
  templateKey?: string; // Force template type key (e.g. 'armor', 'mech_inf')
  command?: ForceCommandState;
}

/** Strategic base terrain type for map generation */
export type StrategicBaseTerrainType = 'plains' | 'forest' | 'mountain' | 'water' | 'desert' | 'marshland' | 'highland' | 'city';

/** Strategic feature type for map generation */
export type StrategicFeatureType = 'river' | 'main_road' | 'secondary_road' | 'bridge' | 'city' | 'city_center' | 'capital' | 'port' | 'fortress' | 'airfield' | 'supply_depot' | 'rail';

/** City rank for strategic map generation */
export type CityRank = 'capital' | 'major' | 'regional' | 'town';

/** Strategic sector - one cell of the strategic map */
export interface StrategicSector {
  position: StrategicPosition;
  terrain: StrategicTerrainType; // keep for backward compat
  force: StrategicForce | null;
  tacticalMapSeed: number; // Seed for generating the tactical minimap
  name: string; // e.g. "首尔", "铁原", "春川"
  // NEW fields (all optional for backward compatibility):
  baseTerrain?: StrategicBaseTerrainType;
  features?: StrategicFeatureType[];
  gen?: {
    elevation: number;
    slope: number;
    moisture: number;
    temperature: number;
    cityScore: number;
    roadCost: number;
    supplyValue: number;
    defensiveValue: number;
    chokepointValue: number;
    riverWidth?: number;
    cityRank?: CityRank;
  };
}

/** Strategic map */
export interface StrategicMap {
  width: number;
  height: number;
  sectors: StrategicSector[][];
}

/** Strategic game phase */
export type StrategicPhase = 'deployment' | 'selectForce' | 'moveForce' | 'aiTurn' | 'gameOver';

/** Strategic deployment state extensions */
export interface StrategicDeploymentInfo {
  redBudget: number;
  blueBudget: number;
  redBudgetUsed: number;
  blueBudgetUsed: number;
  deploymentZones: {
    red: StrategicPosition[];
    blue: StrategicPosition[];
  };
}

/** Force template with cost */
export interface ForceTemplateWithCost extends ForceTemplate {
  cost: number;
}

/** Strategic game state */
export interface StrategicGameState {
  map: StrategicMap;
  forces: StrategicForce[];
  currentFaction: Faction;
  turn: number;
  phase: StrategicPhase;
  selectedForce: StrategicForce | null;
  movableSectors: StrategicPosition[];
  attackableSectors: StrategicPosition[];
  winner: Faction | null;
  combatLog: StrategicCombatLog[];
  aiDifficulty: AIDifficulty;
  visibleSectors: Set<string>;
  // Deployment phase fields
  deployment?: StrategicDeploymentInfo;
  // Reinforcement system
  reinforcements: ReinforcementInfo;
}

/** Reinforcement information */
export interface ReinforcementInfo {
  nextReinforcementTurn: number; // Turn when next reinforcement arrives
  redReinforcementsRemaining: number;
  blueReinforcementsRemaining: number;
  maxReinforcements: number;
  reinforcementForceTemplate: string; // Template key
  lastSpawnPositions: { red: StrategicPosition | null; blue: StrategicPosition | null };
}

/** Strategic combat log */
export interface StrategicCombatLog {
  turn: number;
  attacker: string;
  defender: string;
  attackerFaction: Faction;
  result: 'attacker_wins' | 'defender_wins' | 'draw';
  attackerLosses: number;
  defenderLosses: number;
}

/** Force template for deployment */
export interface ForceTemplate {
  name: string;
  units: StrategicUnit[];
  moveRange: number;
  vision: number;
  cost: number;
}

/** Strategic terrain stats for movement/combat modifiers */
export interface StrategicTerrainStats {
  moveCost: number; // Movement cost to enter this sector
  attackModifier: number; // Attack power multiplier (1.0 = neutral)
  defenseModifier: number; // Defense power multiplier (1.0 = neutral)
  isPassable: boolean; // Whether ground forces can enter
  color: string; // Hex color for rendering
}

/** Strategic terrain configuration table */
export const STRATEGIC_TERRAIN_CONFIGS: Record<StrategicTerrainType, StrategicTerrainStats> = {
  plains: {
    moveCost: 1,
    attackModifier: 1.0,
    defenseModifier: 1.0,
    isPassable: true,
    color: '#7cb342',
  },
  forest: {
    moveCost: 2,
    attackModifier: 0.9,
    defenseModifier: 1.2,
    isPassable: true,
    color: '#2e7d32',
  },
  mountain: {
    moveCost: 3,
    attackModifier: 0.8,
    defenseModifier: 1.4,
    isPassable: true,
    color: '#78909c',
  },
  water: {
    moveCost: 99,
    attackModifier: 1.0,
    defenseModifier: 1.0,
    isPassable: false,
    color: '#1565c0',
  },
  city: {
    moveCost: 1,
    attackModifier: 1.1,
    defenseModifier: 1.3,
    isPassable: true,
    color: '#8d6e63',
  },
  desert: {
    moveCost: 1.5,
    attackModifier: 1.0,
    defenseModifier: 0.9,
    isPassable: true,
    color: '#fdd835',
  },
  marshland: {
    moveCost: 3,
    attackModifier: 0.85,
    defenseModifier: 0.8,
    isPassable: true,
    color: '#5d4037',
  },
  highland: {
    moveCost: 2,
    attackModifier: 0.9,
    defenseModifier: 1.3,
    isPassable: true,
    color: '#546e7a',
  },
};
