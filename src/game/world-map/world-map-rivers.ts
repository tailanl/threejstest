/**
 * 河流生成 - 从高海拔向低海拔追踪河流路径
 */

import type { WorldPosition } from '../world-atlas/atlas-types';
import type { RegionGenerationContext, GeneratedRiver } from './world-map-types';
import { regionKey } from '../world-atlas/coordinates';

export function generateRegionRivers(ctx: RegionGenerationContext): void {
  const { atlas, regionX, regionY, regionSize, cells, rng } = ctx;
  const rivers: GeneratedRiver[] = [];
  const ox = regionX * regionSize;
  const oy = regionY * regionSize;

  // Check macro cells for rivers in this region
  const macroRect = atlas.regionIndex[regionKey(regionX, regionY)]?.macroRect;
  if (!macroRect) {
    ctx.rivers = rivers;
    return;
  }

  let hasRiver = false;
  for (let my = macroRect.y; my < macroRect.y + macroRect.height; my++) {
    for (let mx = macroRect.x; mx < macroRect.x + macroRect.width; mx++) {
      if (atlas.macroCells[my]?.[mx]?.hasMajorRiver) hasRiver = true;
    }
  }

  if (!hasRiver) {
    ctx.rivers = rivers;
    return;
  }

  // Find high elevation start in this region
  let bestX = regionSize / 2, bestY = 0, bestElev = 0;
  for (let y = 0; y < regionSize; y += 8) {
    for (let x = 0; x < regionSize; x += 8) {
      const cell = cells[y]?.[x];
      if (cell && cell.elevation > bestElev && cell.baseTerrain !== 'water') {
        bestElev = cell.elevation;
        bestX = x; bestY = y;
      }
    }
  }

  // Trace river downhill
  const path: WorldPosition[] = [];
  const widths: number[] = [];
  let cx = bestX, cy = bestY;
  for (let step = 0; step < 500; step++) {
    if (cx < 0 || cx >= regionSize || cy < 0 || cy >= regionSize) break;
    const cell = cells[cy]?.[cx];
    if (!cell) break;

    path.push({ globalX: ox + cx, globalY: oy + cy });
    widths.push(path.length < 50 ? 1 : 2);

    if (!cell.features.includes('river')) cell.features.push('river');
    if (widths[widths.length - 1] >= 2) cell.baseTerrain = 'water';

    if (cell.baseTerrain === 'water' && step > 10) break;

    // Move downhill
    let lowestElev = cell.elevation;
    let nextX = cx, nextY = cy;
    for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]] as [number,number][]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx >= 0 && nx < regionSize && ny >= 0 && ny < regionSize) {
        const n = cells[ny][nx];
        if (n.elevation < lowestElev || (n.baseTerrain === 'water' && step > 10)) {
          lowestElev = n.elevation;
          nextX = nx; nextY = ny;
        }
      }
    }
    if (nextX === cx && nextY === cy) break;
    cx = nextX; cy = nextY;
  }

  if (path.length > 10) {
    rivers.push({
      id: `river_${regionX}_${regionY}_0`,
      type: 'main',
      path,
      widthByIndex: widths,
    });
  }

  ctx.rivers = rivers;
}
