import type { TerrainType, TacticalFeatureType } from './types';
import type { CityRank, StrategicPosition } from './strategic-types';

export type DetailMapKind = 'city' | 'sector' | 'battlefield';

export interface DetailMapPosition {
  x: number;
  z: number;
}

export interface DetailMapCell {
  position: DetailMapPosition;
  terrain: TerrainType;
  features: TacticalFeatureType[];
  sourceStrategicSector: StrategicPosition;
  localElevation: number;
  localMoisture: number;
  movementCost: number;
  defenseBonus: number;
  isObjective: boolean;
  isRoad?: boolean;
  roadType?: 'main' | 'secondary';
}

export interface DetailMap {
  id: string;
  kind: DetailMapKind;
  sourceStrategicSector: StrategicPosition;
  includedStrategicSectors: StrategicPosition[];
  width: number;
  height: number;
  cells: DetailMapCell[][];
  seed: number;
  title: string;
  metadata: {
    centerName?: string;
    cityRank?: CityRank;
    generatedFrom: 'strategic_sector';
    scale: number;
  };
}
