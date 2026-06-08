/**
 * RegionTile validation helpers.
 */

import type { RegionGenerationContext } from './world-map-types';

export interface RegionValidationReport {
  invalidBridgeCount: number;
  outOfBoundsRoadPoints: number;
  roadFeatureCellCount: number;
  warnings: string[];
}

export function validateRegionTile(ctx: RegionGenerationContext): RegionValidationReport {
  const { cells, roads, regionSize, worldOrigin } = ctx;
  const warnings: string[] = [];
  let invalidBridgeCount = 0;
  let outOfBoundsRoadPoints = 0;
  let roadFeatureCellCount = 0;

  for (let y = 0; y < cells.length; y++) {
    for (let x = 0; x < cells[y].length; x++) {
      const cell = cells[y][x];
      const hasRoad = cell.features.includes('main_road') || cell.features.includes('secondary_road');
      const hasRiver = cell.features.includes('river') || cell.features.includes('stream');
      if (hasRoad) roadFeatureCellCount++;
      if (cell.features.includes('bridge') && (!hasRoad || !hasRiver)) {
        invalidBridgeCount++;
      }
    }
  }

  for (const road of roads) {
    for (const point of road.path) {
      const localX = point.globalX - worldOrigin.globalX;
      const localY = point.globalY - worldOrigin.globalY;
      if (localX < 0 || localX >= regionSize || localY < 0 || localY >= regionSize) {
        outOfBoundsRoadPoints++;
      }
    }
  }

  if (invalidBridgeCount > 0) warnings.push(`${invalidBridgeCount} bridge feature(s) are not on both road and river cells`);
  if (outOfBoundsRoadPoints > 0) warnings.push(`${outOfBoundsRoadPoints} road path point(s) are outside region bounds`);
  if (roads.length > 0 && roadFeatureCellCount === 0) warnings.push('roads exist but no road features were painted on cells');

  if (warnings.length > 0) {
    console.warn('[RegionTile] validation warnings', warnings);
  }

  return {
    invalidBridgeCount,
    outOfBoundsRoadPoints,
    roadFeatureCellCount,
    warnings,
  };
}
