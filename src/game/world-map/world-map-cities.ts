/**
 * 城市生成 - 使用噪声绘制有机形状的城市区域
 */

import type { RegionGenerationContext, GeneratedCity } from './world-map-types';
import type { WorldCell } from './world-cell-types';
import { regionKey } from '../world-atlas/coordinates';
import { RegionNoise } from '../world-atlas/region-random';

export function generateRegionCities(ctx: RegionGenerationContext): void {
  const { atlas, regionX, regionY, regionSize, cells, rng } = ctx;
  const cities: GeneratedCity[] = [];
  const ox = regionX * regionSize;
  const oy = regionY * regionSize;

  // Place 1-3 cities per region based on macro settlement potential
  const macroRect = atlas.regionIndex[regionKey(regionX, regionY)]?.macroRect;
  if (!macroRect) {
    ctx.cities = cities;
    return;
  }

  let avgSettlement = 0;
  let count = 0;
  for (let my = macroRect.y; my < macroRect.y + macroRect.height; my++) {
    for (let mx = macroRect.x; mx < macroRect.x + macroRect.width; mx++) {
      avgSettlement += atlas.macroCells[my]?.[mx]?.settlementPotential ?? 0;
      count++;
    }
  }
  avgSettlement = count > 0 ? avgSettlement / count : 0;

  const cityCount = avgSettlement > 0.5 ? rng.nextInt(2, 4) : avgSettlement > 0.3 ? rng.nextInt(1, 2) : rng.next() < 0.3 ? 1 : 0;

  // City shape noise (unique per city)
  const cityShapeNoise = new RegionNoise(atlas.seed + 5000);

  for (let i = 0; i < cityCount; i++) {
    // Find best location
    let bestX = regionSize / 2, bestY = regionSize / 2, bestScore = -1;
    for (let attempt = 0; attempt < 200; attempt++) {
      const x = rng.nextInt(50, regionSize - 50);
      const y = rng.nextInt(50, regionSize - 50);
      const cell = cells[y]?.[x];
      if (!cell || cell.baseTerrain === 'water' || cell.baseTerrain === 'mountain') continue;

      let score = cell.elevation < 0.4 ? 20 : 0;
      score += cell.moisture > 0.4 ? 15 : 0;
      if (cell.features.includes('river')) score += 20;
      // Distance from other cities
      let minDist = 999;
      for (const c of cities) {
        const dx = x - (c.center.globalX - ox);
        const dy = y - (c.center.globalY - oy);
        minDist = Math.min(minDist, Math.sqrt(dx * dx + dy * dy));
      }
      if (minDist < 40) continue;
      score += Math.min(20, minDist * 0.2);

      if (score > bestScore) { bestScore = score; bestX = x; bestY = y; }
    }

    // Determine rank
    const rank = i === 0 && avgSettlement > 0.5 ? 'regional' : 'town';
    const radius = rank === 'regional' ? rng.nextInt(12, 25) : rng.nextInt(5, 12);

    // Paint city area using noise for organic shapes
    paintCityArea(cells, regionSize, bestX, bestY, radius, cityShapeNoise, i);

    // Compute bounds
    let minX = bestX, minY = bestY, maxX = bestX, maxY = bestY;
    const scanR = radius + 4;
    for (let dy = -scanR; dy <= scanR; dy++) {
      for (let dx = -scanR; dx <= scanR; dx++) {
        const cx = bestX + dx, cy = bestY + dy;
        if (cx < 0 || cx >= regionSize || cy < 0 || cy >= regionSize) continue;
        const cell = cells[cy][cx];
        if (cell.baseTerrain === 'city' || cell.features.includes('suburb')) {
          minX = Math.min(minX, cx); minY = Math.min(minY, cy);
          maxX = Math.max(maxX, cx); maxY = Math.max(maxY, cy);
        }
      }
    }

    cities.push({
      id: `city_${regionX}_${regionY}_${i}`,
      name: `City_${regionX}_${regionY}_${i}`,
      rank,
      center: { globalX: ox + bestX, globalY: oy + bestY },
      radius,
      bounds: { minX: ox + minX, minY: oy + minY, maxX: ox + maxX, maxY: oy + maxY },
      populationScore: radius * radius * 0.5,
      supplyValue: rank === 'regional' ? 50 : 20,
      victoryPointValue: rank === 'regional' ? 30 : 10,
      economicZoneIds: [],
      chunkIds: [],
    });
  }

  ctx.cities = cities;
}

/**
 * 使用噪声绘制有机形状的城市区域
 * 噪声偏移半径边界，产生不规则的城市轮廓
 */
export function paintCityArea(
  cells: WorldCell[][],
  regionSize: number,
  centerX: number,
  centerY: number,
  radius: number,
  noise: RegionNoise,
  cityIndex: number,
): void {
  const noiseOffset = cityIndex * 137.5; // unique per city
  for (let dy = -radius - 4; dy <= radius + 4; dy++) {
    for (let dx = -radius - 4; dx <= radius + 4; dx++) {
      const cx = centerX + dx, cy = centerY + dy;
      if (cx < 0 || cx >= regionSize || cy < 0 || cy >= regionSize) continue;
      const cell = cells[cy][cx];
      if (cell.baseTerrain === 'water') continue;

      const dist = Math.sqrt(dx * dx + dy * dy);

      // Use noise to perturb the radius boundary for organic shape
      const noiseVal = noise.noise2D(
        (cx + noiseOffset) * 0.1,
        (cy + noiseOffset) * 0.1,
      );
      const effectiveRadius = radius * (0.7 + noiseVal * 0.6);

      if (dist < effectiveRadius * 0.25) {
        cell.baseTerrain = 'city';
        if (!cell.features.includes('city_center')) cell.features.push('city_center');
        if (!cell.features.includes('urban_block')) cell.features.push('urban_block');
      } else if (dist < effectiveRadius * 0.7) {
        cell.baseTerrain = 'city';
        if (!cell.features.includes('urban_block')) cell.features.push('urban_block');
      } else if (dist < effectiveRadius) {
        if (!cell.features.includes('suburb')) cell.features.push('suburb');
      }
    }
  }
}
