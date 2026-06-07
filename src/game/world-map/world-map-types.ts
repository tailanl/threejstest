/**
 * RegionTile 类型定义 - 1024×1024 高精度区域
 */

import type { WorldPosition, FactionId } from '../world-atlas/atlas-types';
import type { WorldCell, WorldTerrainType, WorldFeatureType } from './world-cell-types';
import type { StrategicChunk } from '../world-view/strategic-chunks';

export type WorldCityRank = 'capital' | 'major' | 'regional' | 'town';

export interface GeneratedCity {
  id: string;
  name: string;

  rank: WorldCityRank;

  center: WorldPosition;
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

  politicalRegionId?: string;
  economicZoneIds: string[];

  chunkIds: string[];
}

export interface GeneratedRoad {
  id: string;

  type: 'main' | 'secondary' | 'military' | 'rail';

  fromId?: string;
  toId?: string;

  path: WorldPosition[];
}

export interface GeneratedRiver {
  id: string;

  type: 'main' | 'tributary' | 'stream';

  path: WorldPosition[];

  widthByIndex: number[];

  basinId?: string;
}

export interface RegionTile {
  id: string;
  atlasId: string;

  regionX: number;
  regionY: number;

  worldOrigin: WorldPosition;

  width: number;
  height: number;

  cells: WorldCell[][];

  strategicChunks: StrategicChunk[][];

  cities: GeneratedCity[];
  roads: GeneratedRoad[];
  rivers: GeneratedRiver[];

  politicalRegionIds: string[];
  economicZoneIds: string[];
  humanGeographyZoneIds: string[];
}
