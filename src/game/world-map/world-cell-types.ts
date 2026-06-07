/**
 * WorldCell 类型定义 - RegionTile 中的单个格子
 */

export type WorldTerrainType =
  | 'plains'
  | 'forest'
  | 'mountain'
  | 'water'
  | 'desert'
  | 'marshland'
  | 'highland'
  | 'city';

export type WorldFeatureType =
  | 'river'
  | 'stream'
  | 'main_road'
  | 'secondary_road'
  | 'bridge'
  | 'rail'
  | 'city_center'
  | 'urban_block'
  | 'suburb'
  | 'industrial'
  | 'port'
  | 'airport'
  | 'airfield'
  | 'fortress'
  | 'supply_depot'
  | 'checkpoint'
  | 'power_plant'
  | 'factory'
  | 'admin_center';

export type FactionId = 'red' | 'blue' | 'neutral' | string;

export interface WorldCell {
  globalX: number;
  globalY: number;

  regionX: number;
  regionY: number;
  localX: number;
  localY: number;

  baseTerrain: WorldTerrainType;
  features: WorldFeatureType[];

  elevation: number;
  slope: number;
  moisture: number;
  temperature: number;

  populationDensity: number;
  economicValue: number;
  infrastructureValue: number;

  movementCost: number;
  defenseBonus: number;
  concealment: number;
  cover: number;
  visionBlock: number;

  owner?: FactionId;
  unitIds?: string[];
}
