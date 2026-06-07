/**
 * CombatViewport → GameMap 转换
 */

import type { CombatViewport } from './combat-viewport';
import type { WorldCell, WorldFeatureType } from '../world-map/world-cell-types';
import type { GameMap, MapCell, TerrainType, Position, TacticalFeatureType } from '../types';

function convertWorldCellToTerrain(cell: WorldCell): TerrainType {
  if (cell.features.includes('bridge')) return 'bridge';
  if (cell.features.includes('fortress') || cell.features.includes('checkpoint')) return 'fortress';
  if (cell.baseTerrain === 'city' || cell.features.includes('city_center') || cell.features.includes('urban_block')) return 'city';
  if ((cell.features.includes('main_road') || cell.features.includes('secondary_road')) && cell.baseTerrain !== 'water') return 'road';
  if (cell.baseTerrain === 'marshland') return 'swamp';
  if (cell.baseTerrain === 'highland') return 'mountain';
  return cell.baseTerrain as TerrainType;
}

function convertFeature(f: WorldFeatureType): TacticalFeatureType | null {
  const map: Partial<Record<WorldFeatureType, TacticalFeatureType>> = {
    river: 'river',
    stream: 'stream',
    main_road: 'main_road',
    secondary_road: 'secondary_road',
    bridge: 'bridge',
    city_center: 'city_center',
    urban_block: 'urban_block',
    suburb: 'suburb',
    industrial: 'industrial',
    checkpoint: 'checkpoint',
    supply_depot: 'supply_point',
  };
  return map[f] ?? null;
}

export function convertCombatViewportToGameMap(viewport: CombatViewport): GameMap {
  const { cells, worldRect } = viewport;
  const height = cells.length;
  const width = height > 0 ? cells[0].length : 0;

  const mapCells: MapCell[][] = [];

  for (let y = 0; y < height; y++) {
    mapCells[y] = [];
    for (let x = 0; x < width; x++) {
      const worldCell = cells[y]?.[x];
      if (!worldCell) {
        mapCells[y][x] = {
          position: { x, z: y },
          terrain: 'plains',
          unit: null,
          fortified: false,
          capturePointId: null,
        };
        continue;
      }

      const terrain = convertWorldCellToTerrain(worldCell);
      const features: TacticalFeatureType[] = [];
      for (const f of worldCell.features) {
        const tf = convertFeature(f);
        if (tf) features.push(tf);
      }

      mapCells[y][x] = {
        position: { x, z: y },
        terrain,
        unit: null,
        fortified: false,
        capturePointId: null,
        isRoad: worldCell.features.includes('main_road') || worldCell.features.includes('secondary_road'),
        roadType: worldCell.features.includes('main_road') ? 'main' : worldCell.features.includes('secondary_road') ? 'secondary' : undefined,
        features: features.length > 0 ? features : undefined,
      };
    }
  }

  return {
    width,
    height,
    cells: mapCells,
  };
}
