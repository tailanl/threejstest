/** @deprecated Use directory equivalents under src/game/world-map/ and src/game/world-view/ instead */
/**
 * WorldMap 单一母地图类型定义
 *
 * 核心原则：只生成一张真实地图。战略、战役、战术只是这张地图的不同缩放和裁剪视图。
 */

// ─── 底层地形类型 ───────────────────────────────────────

export type WorldTerrainType =
  | 'plains'
  | 'forest'
  | 'mountain'
  | 'water'
  | 'desert'
  | 'marshland'
  | 'highland'
  | 'city';

// ─── 覆盖物特征类型 ─────────────────────────────────────

export type WorldFeatureType =
  | 'river'
  | 'stream'
  | 'main_road'
  | 'secondary_road'
  | 'bridge'
  | 'city_center'
  | 'urban_block'
  | 'suburb'
  | 'industrial'
  | 'fortress'
  | 'airfield'
  | 'supply_depot'
  | 'rail'
  | 'field'
  | 'checkpoint';

// ─── WorldCell ─────────────────────────────────────────

export interface WorldCell {
  x: number;
  y: number;

  baseTerrain: WorldTerrainType;

  features: WorldFeatureType[];

  elevation: number;
  moisture: number;
  slope: number;
  temperature: number;

  movementCost: number;
  defenseBonus: number;
  visionBlock: number;

  owner?: 'player' | 'enemy' | 'neutral';
  unitIds?: string[];
}

// ─── 城市 ──────────────────────────────────────────────

export type WorldCityRank = 'capital' | 'major' | 'regional' | 'town';

export interface GeneratedCity {
  id: string;
  name: string;

  rank: WorldCityRank;

  center: {
    x: number;
    y: number;
  };

  radius: number;

  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };

  populationScore: number;
  supplyValue: number;
  victoryPointValue: number;

  chunkIds: string[];
}

// ─── 道路 ──────────────────────────────────────────────

export interface GeneratedRoad {
  id: string;

  type: 'main' | 'secondary' | 'military';

  fromCityId?: string;
  toCityId?: string;

  path: Array<{
    x: number;
    y: number;
  }>;
}

// ─── 河流 ──────────────────────────────────────────────

export interface GeneratedRiver {
  id: string;

  type: 'main' | 'tributary' | 'stream';

  path: Array<{
    x: number;
    y: number;
  }>;

  widthByIndex: number[];
}

// ─── StrategicChunk ────────────────────────────────────

export interface StrategicChunk {
  id: string;

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
    hasSecondaryRoad: boolean;
    hasBridge: boolean;
    hasFortress: boolean;
    hasAirfield: boolean;
    hasSupplyDepot: boolean;
  };

  cityIds: string[];

  strategicValue: {
    supply: number;
    defense: number;
    movement: number;
    chokepoint: number;
    victoryPoint: number;
  };

  control: 'player' | 'enemy' | 'neutral' | 'contested';
}

// ─── WorldMap ──────────────────────────────────────────

export interface WorldMap {
  id: string;

  seed: number;

  width: number;
  height: number;

  chunkSize: number;

  cells: WorldCell[][];

  chunks: StrategicChunk[][];

  cities: GeneratedCity[];

  roads: GeneratedRoad[];

  rivers: GeneratedRiver[];

  metadata: {
    generatedAt: number;
    generatorVersion: string;
  };
}

// ─── OperationView ─────────────────────────────────────

export interface OperationView {
  id: string;

  worldRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  cells: WorldCell[][];

  sourceChunkIds: string[];

  center: {
    x: number;
    y: number;
  };

  scale: 'operation';
}

// ─── CombatViewport ────────────────────────────────────

export interface CombatViewport {
  id: string;

  worldRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  cells: WorldCell[][];

  center: {
    x: number;
    y: number;
  };

  scale: 'combat';

  sourceOperationViewId?: string;
}
