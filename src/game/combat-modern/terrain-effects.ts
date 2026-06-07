/**
 * 地形对战斗的影响
 */

import type { WorldCell, WorldTerrainType } from '../world-map/world-cell-types';

export interface TerrainCombatEffects {
  coverBonus: number;       // 0-50, reduces suppression
  concealmentBonus: number; // 0-50, reduces detection
  movementModifier: number; // multiplier
  defenseBonus: number;     // flat defense bonus
  visionBlock: number;      // 0-1
  vehiclePassable: boolean;
  infantryAdvantage: number;
}

const TERRAIN_EFFECTS: Record<WorldTerrainType, TerrainCombatEffects> = {
  plains: { coverBonus: 0, concealmentBonus: 5, movementModifier: 1, defenseBonus: 0, visionBlock: 0, vehiclePassable: true, infantryAdvantage: 0 },
  forest: { coverBonus: 30, concealmentBonus: 40, movementModifier: 0.5, defenseBonus: 15, visionBlock: 0.5, vehiclePassable: true, infantryAdvantage: 20 },
  mountain: { coverBonus: 25, concealmentBonus: 20, movementModifier: 0.3, defenseBonus: 25, visionBlock: 0.7, vehiclePassable: false, infantryAdvantage: 15 },
  water: { coverBonus: 0, concealmentBonus: 0, movementModifier: 0, defenseBonus: 0, visionBlock: 0, vehiclePassable: false, infantryAdvantage: 0 },
  desert: { coverBonus: 5, concealmentBonus: 0, movementModifier: 0.8, defenseBonus: -5, visionBlock: 0, vehiclePassable: true, infantryAdvantage: -5 },
  marshland: { coverBonus: 10, concealmentBonus: 15, movementModifier: 0.3, defenseBonus: -10, visionBlock: 0.1, vehiclePassable: false, infantryAdvantage: 10 },
  highland: { coverBonus: 20, concealmentBonus: 15, movementModifier: 0.6, defenseBonus: 10, visionBlock: 0.3, vehiclePassable: true, infantryAdvantage: 5 },
  city: { coverBonus: 40, concealmentBonus: 35, movementModifier: 0.7, defenseBonus: 20, visionBlock: 0.4, vehiclePassable: true, infantryAdvantage: 25 },
};

export function getTerrainEffects(terrain: WorldTerrainType): TerrainCombatEffects {
  return TERRAIN_EFFECTS[terrain] ?? TERRAIN_EFFECTS.plains;
}

export function getCellCombatEffects(cell: WorldCell): TerrainCombatEffects {
  const base = getTerrainEffects(cell.baseTerrain);

  // Feature modifiers
  let modified = { ...base };

  if (cell.features.includes('urban_block')) {
    modified.coverBonus += 15;
    modified.concealmentBonus += 10;
  }
  if (cell.features.includes('suburb')) {
    modified.coverBonus += 10;
    modified.concealmentBonus += 5;
  }
  if (cell.features.includes('fortress')) {
    modified.coverBonus += 35;
    modified.defenseBonus += 30;
  }

  return modified;
}
