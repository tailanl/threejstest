/**
 * 特征放置 - 桥梁放置和其他特征
 */

import type { RegionGenerationContext } from './world-map-types';

/**
 * 在道路与河流交叉处放置桥梁
 */
export function placeRegionBridges(ctx: RegionGenerationContext): void {
  const { cells } = ctx;
  for (let y = 0; y < cells.length; y++) {
    for (let x = 0; x < cells[y].length; x++) {
      const cell = cells[y][x];
      const hasRoad = cell.features.includes('main_road') || cell.features.includes('secondary_road');
      const hasRiver = cell.features.includes('river');
      if (hasRoad && hasRiver) {
        if (!cell.features.includes('bridge')) cell.features.push('bridge');
      }
    }
  }
}

/**
 * 放置其他区域特征（补给站、检查站等）
 * 当前为占位实现，后续可扩展
 */
export function placeRegionFeatures(ctx: RegionGenerationContext): void {
  const { cells, cities, rng } = ctx;
  const regionSize = cells.length;

  // Place supply depots near regional cities
  for (const city of cities) {
    if (city.rank !== 'regional') continue;
    const cx = city.center.globalX % regionSize;
    const cy = city.center.globalY % regionSize;

    // Try to place a supply depot near the city
    for (let attempt = 0; attempt < 20; attempt++) {
      const dx = rng.nextInt(-city.radius, city.radius);
      const dy = rng.nextInt(-city.radius, city.radius);
      const x = cx + dx;
      const y = cy + dy;
      if (x < 0 || x >= regionSize || y < 0 || y >= regionSize) continue;
      const cell = cells[y][x];
      if (cell.baseTerrain === 'water') continue;
      if (!cell.features.includes('supply_depot')) {
        cell.features.push('supply_depot');
        break;
      }
    }
  }
}
