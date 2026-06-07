/**
 * CombatViewport - 战术战斗视口，从 RegionTile 裁剪
 */

import type { WorldPosition } from '../world-atlas/atlas-types';
import type { WorldCell } from '../world-map/world-cell-types';
import type { RegionTile } from '../world-map/world-map-types';
import { getClampedLocalViewRect } from './view-rect-utils';

export type BattleType =
  | 'meeting_engagement'
  | 'urban_assault'
  | 'bridge_crossing'
  | 'hill_assault'
  | 'forest_fight'
  | 'road_ambush'
  | 'fortress_assault'
  | 'open_field'
  | 'convoy_interdiction'
  | 'air_defense_suppression';

export interface CombatViewport {
  id: string;

  worldRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  cells: WorldCell[][];

  center: WorldPosition;

  battleType: BattleType;

  attackerDirection: 'north' | 'south' | 'east' | 'west';

  scale: 'combat';
}

export function getCombatViewportFromOperationCell(params: {
  regionTile: RegionTile;
  cellPosition: WorldPosition;
  width?: number;
  height?: number;
  battleType?: BattleType;
  attackerDirection?: 'north' | 'south' | 'east' | 'west';
}): CombatViewport {
  const { regionTile, cellPosition, width = 64, height = 48, battleType, attackerDirection } = params;
  return getCombatViewport({ regionTile, center: cellPosition, width, height, battleType, attackerDirection });
}

export function getCombatViewport(params: {
  regionTile: RegionTile;
  center: WorldPosition;
  width: number;
  height: number;
  battleType?: BattleType;
  attackerDirection?: 'north' | 'south' | 'east' | 'west';
}): CombatViewport {
  const { regionTile, center, width, height, battleType = 'meeting_engagement', attackerDirection = 'west' } = params;

  // Convert global center to local coordinates within the region tile
  const localCenterX = center.globalX - regionTile.worldOrigin.globalX;
  const localCenterY = center.globalY - regionTile.worldOrigin.globalY;

  const localRect = getClampedLocalViewRect({
    centerX: localCenterX,
    centerY: localCenterY,
    width,
    height,
    maxWidth: regionTile.width,
    maxHeight: regionTile.height,
  });

  const cells: WorldCell[][] = [];
  for (let y = localRect.y; y < localRect.y + localRect.height; y++) {
    const row: WorldCell[] = [];
    for (let x = localRect.x; x < localRect.x + localRect.width; x++) {
      if (y < regionTile.cells.length && x < regionTile.cells[y].length) {
        row.push(regionTile.cells[y][x]);
      }
    }
    cells.push(row);
  }

  return {
    id: `combat_${center.globalX}_${center.globalY}_${width}x${height}`,
    worldRect: {
      x: regionTile.worldOrigin.globalX + localRect.x,
      y: regionTile.worldOrigin.globalY + localRect.y,
      width: localRect.width,
      height: localRect.height,
    },
    cells,
    center,
    battleType,
    attackerDirection,
    scale: 'combat',
  };
}

export function inferBattleTypeFromCells(cells: WorldCell[][]): BattleType {
  let cityCount = 0;
  let bridgeCount = 0;
  let mountainCount = 0;
  let forestCount = 0;
  let roadCount = 0;
  let total = 0;

  for (const row of cells) {
    for (const cell of row) {
      total++;
      if (cell.baseTerrain === 'city') cityCount++;
      if (cell.features.includes('bridge')) bridgeCount++;
      if (cell.baseTerrain === 'mountain' || cell.baseTerrain === 'highland') mountainCount++;
      if (cell.baseTerrain === 'forest') forestCount++;
      if (cell.features.includes('main_road') || cell.features.includes('secondary_road')) roadCount++;
    }
  }

  if (total === 0) return 'meeting_engagement';

  const cityRatio = cityCount / total;
  const bridgeRatio = bridgeCount / total;
  const mountainRatio = mountainCount / total;
  const forestRatio = forestCount / total;
  const roadRatio = roadCount / total;

  if (cityRatio > 0.15) return 'urban_assault';
  if (bridgeRatio > 0.02) return 'bridge_crossing';
  if (mountainRatio > 0.25) return 'hill_assault';
  if (forestRatio > 0.35) return 'forest_fight';
  if (roadRatio > 0.3 && forestRatio < 0.2) return 'road_ambush';
  if (cityRatio > 0.05 && mountainRatio > 0.1) return 'fortress_assault';

  return 'open_field';
}
