/**
 * StrategicChunk - 每32×32 WorldCell 汇总成1个StrategicChunk
 */

import type { WorldTerrainType } from '../world-map/world-cell-types';
import type { WorldPosition } from '../world-atlas/atlas-types';

export interface StrategicChunk {
  id: string;

  regionX: number;
  regionY: number;

  chunkX: number;
  chunkY: number;

  worldRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  dominantTerrain: WorldTerrainType;
  terrainMix: Record<WorldTerrainType, number>;

  features: {
    hasCity: boolean;
    hasCapital: boolean;
    hasRiver: boolean;
    hasMainRoad: boolean;
    hasBridge: boolean;
    hasFortress: boolean;
    hasAirfield: boolean;
    hasSupplyDepot: boolean;
    hasEconomicTarget: boolean;
  };

  cityIds: string[];

  strategicValue: {
    supply: number;
    defense: number;
    movement: number;
    chokepoint: number;
    victoryPoint: number;
    economic: number;
    political: number;
  };

  control: 'red' | 'blue' | 'neutral' | 'contested';
  knownByPlayer: boolean;
}
