/**
 * 坐标转换 - globalX/globalY 与 regionX/regionY/localX/localY
 */

import type { WorldPosition, RegionPosition } from './atlas-types';

export function globalToRegion(
  pos: WorldPosition,
  regionSize: number
): RegionPosition {
  return {
    regionX: Math.floor(pos.globalX / regionSize),
    regionY: Math.floor(pos.globalY / regionSize),
    localX: ((pos.globalX % regionSize) + regionSize) % regionSize,
    localY: ((pos.globalY % regionSize) + regionSize) % regionSize,
  };
}

export function regionToGlobal(params: {
  regionX: number;
  regionY: number;
  localX: number;
  localY: number;
  regionSize: number;
}): WorldPosition {
  return {
    globalX: params.regionX * params.regionSize + params.localX,
    globalY: params.regionY * params.regionSize + params.localY,
  };
}

export function worldPositionKey(pos: WorldPosition): string {
  return `${pos.globalX},${pos.globalY}`;
}

export function regionKey(regionX: number, regionY: number): string {
  return `region_${regionX}_${regionY}`;
}
