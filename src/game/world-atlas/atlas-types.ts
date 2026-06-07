/**
 * WorldAtlas 类型定义
 * 8192×8192 虚拟世界，8×8 RegionGrid，每个 RegionTile 1024×1024
 */

export type FactionId = 'red' | 'blue' | 'neutral' | string;

export interface WorldPosition {
  globalX: number;
  globalY: number;
}

export interface RegionPosition {
  regionX: number;
  regionY: number;
  localX: number;
  localY: number;
}

export interface WorldAtlas {
  id: string;
  seed: number;

  virtualWidth: number;
  virtualHeight: number;

  regionSize: number;
  regionGridWidth: number;
  regionGridHeight: number;

  macroWidth: number;
  macroHeight: number;

  macroCells: MacroCell[][];

  regionIndex: Record<string, RegionTileMeta>;

  politicalRegions: PoliticalRegion[];
  economicZones: EconomicZone[];
  humanGeographyZones: HumanGeographyZone[];

  generatedRegionIds: string[];
}

export interface RegionTileMeta {
  id: string;
  regionX: number;
  regionY: number;

  worldRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  macroRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  generated: boolean;
  cached: boolean;
}

export interface MacroCell {
  x: number;
  y: number;

  elevation: number;
  slope: number;
  moisture: number;
  temperature: number;

  biome:
    | 'ocean'
    | 'coast'
    | 'plains'
    | 'forest'
    | 'mountain'
    | 'desert'
    | 'marshland'
    | 'highland'
    | 'urban_corridor';

  continentId?: string;
  basinId?: string;
  climateZoneId?: string;

  hasMajorRiver: boolean;
  hasMountainRange: boolean;

  settlementPotential: number;
  roadCorridorPotential: number;
  economicValue: number;
  populationPotential: number;
  politicalValue: number;
}

export interface PoliticalRegion {
  id: string;
  name: string;
  factionId: FactionId;

  capitalCityId?: string;

  macroCells: Array<{ x: number; y: number }>;

  stability: number;
  mobilizationLevel: number;
  infrastructureControl: number;
}

export interface EconomicZone {
  id: string;
  name: string;

  type:
    | 'industrial'
    | 'agricultural'
    | 'port'
    | 'mining'
    | 'administrative'
    | 'logistics'
    | 'energy';

  center: WorldPosition;
  radius: number;

  outputValue: number;
  supplyValue: number;
  victoryPointValue: number;
}

export interface HumanGeographyZone {
  id: string;
  name: string;

  center: WorldPosition;
  radius: number;

  populationDensity: number;
  urbanization: number;
  roadDensity: number;
  railDensity: number;
}
