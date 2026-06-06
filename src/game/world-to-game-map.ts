import type { CombatViewport, WorldCell, WorldFeatureType } from './world-map-types';
import type { GameMap, MapCell, TerrainType, Position, TacticalFeatureType } from './types';

function convertWorldCellToTerrain(cell: WorldCell): TerrainType {
  // Bridge feature takes highest priority
  if (cell.features.includes('bridge')) return 'bridge';

  // Fortress / checkpoint
  if (cell.features.includes('fortress') || cell.features.includes('checkpoint')) return 'fortress';

  // City: baseTerrain is city, or has urban features
  if (
    cell.baseTerrain === 'city' ||
    cell.features.includes('urban_block') ||
    cell.features.includes('industrial') ||
    cell.features.includes('city_center')
  ) {
    return 'city';
  }

  // Road features on non-water terrain
  if (
    !isWaterBase(cell.baseTerrain) &&
    (cell.features.includes('main_road') || cell.features.includes('secondary_road'))
  ) {
    return 'road';
  }

  // Marshland → swamp
  if (cell.baseTerrain === 'marshland') return 'swamp';

  // Highland → mountain
  if (cell.baseTerrain === 'highland') return 'mountain';

  // Otherwise map directly
  const directMap: Partial<Record<WorldCell['baseTerrain'], TerrainType>> = {
    plains: 'plains',
    forest: 'forest',
    mountain: 'mountain',
    water: 'water',
    desert: 'desert',
  };

  return directMap[cell.baseTerrain] ?? 'plains';
}

function isWaterBase(terrain: WorldCell['baseTerrain']): boolean {
  return terrain === 'water';
}

function convertFeatureType(f: WorldFeatureType): TacticalFeatureType | null {
  const mapping: Partial<Record<WorldFeatureType, TacticalFeatureType>> = {
    river: 'river',
    stream: 'stream',
    main_road: 'main_road',
    secondary_road: 'secondary_road',
    bridge: 'bridge',
    city_center: 'city_center',
    urban_block: 'urban_block',
    suburb: 'suburb',
    industrial: 'industrial',
    field: 'field',
    checkpoint: 'checkpoint',
  };
  return mapping[f] ?? null;
}

export function convertCombatViewportToGameMap(viewport: CombatViewport): GameMap {
  const height = viewport.cells.length;
  const width = height > 0 ? viewport.cells[0].length : 0;

  const cells: MapCell[][] = [];

  for (let y = 0; y < height; y++) {
    const row: MapCell[] = [];
    for (let x = 0; x < width; x++) {
      const worldCell = viewport.cells[y][x];
      const terrain = convertWorldCellToTerrain(worldCell);

      const position: Position = { x, z: y };

      // Determine road properties
      const isRoad = terrain === 'road';
      let roadType: string | undefined;
      if (worldCell.features.includes('main_road')) {
        roadType = 'main';
      } else if (worldCell.features.includes('secondary_road')) {
        roadType = 'secondary';
      }

      // Convert features
      const features: TacticalFeatureType[] = [];
      for (const f of worldCell.features) {
        const converted = convertFeatureType(f);
        if (converted !== null) {
          features.push(converted);
        }
      }

      // Supply depot maps to supply_point
      if (worldCell.features.includes('supply_depot')) {
        features.push('supply_point');
      }

      // Forest base terrain adds forest_patch
      if (worldCell.baseTerrain === 'forest' && !features.includes('forest_patch')) {
        features.push('forest_patch');
      }

      // Highland adds hill
      if (worldCell.baseTerrain === 'highland' && !features.includes('hill')) {
        features.push('hill');
      }

      const mapCell: MapCell = {
        position,
        terrain,
        unit: null,
        fortified: false,
        capturePointId: null,
        isRoad,
        roadType,
        features,
      };

      row.push(mapCell);
    }
    cells.push(row);
  }

  return {
    width,
    height,
    cells,
  };
}
