/** @deprecated Use directory equivalents under src/game/world-map/ and src/game/world-view/ instead */
/**
 * WorldMap 城市生成 - 选址、评分、绘制城市区域
 */

import type { WorldCell, WorldFeatureType, GeneratedCity, WorldCityRank } from './world-map-types';
import type { WorldGenContext, WorldRNG } from './world-map-terrain';
import { WorldPerlinNoise } from './world-map-terrain';

// ─── 城市半径范围（来自配置） ────────────────────────────

type RadiusRange = [number, number];

interface CityRankConfig {
  count: number;
  radius: RadiusRange;
  minDistance: number;
}

function getCityRankConfig(ctx: WorldGenContext, rank: WorldCityRank): CityRankConfig {
  const c = ctx.config.cities;
  switch (rank) {
    case 'capital':   return { count: c.capitalCount,   radius: c.capitalRadius,   minDistance: c.minCapitalDistance };
    case 'major':     return { count: c.majorCityCount,  radius: c.majorRadius,     minDistance: c.minMajorDistance };
    case 'regional':  return { count: c.regionalCityCount, radius: c.regionalRadius, minDistance: c.minRegionalDistance };
    case 'town':      return { count: c.townCount,       radius: c.townRadius,      minDistance: c.minTownDistance };
  }
}

// ─── 城市属性值 ──────────────────────────────────────────

function cityPopulationScore(rank: WorldCityRank): number {
  switch (rank) {
    case 'capital':  return 100;
    case 'major':    return 70;
    case 'regional': return 35;
    case 'town':     return 12;
  }
}

function citySupplyValue(rank: WorldCityRank): number {
  switch (rank) {
    case 'capital':  return 100;
    case 'major':    return 70;
    case 'regional': return 40;
    case 'town':     return 18;
  }
}

function cityVictoryPointValue(rank: WorldCityRank): number {
  switch (rank) {
    case 'capital':  return 100;
    case 'major':    return 70;
    case 'regional': return 35;
    case 'town':     return 12;
  }
}

// ─── 辅助：两点距离 ─────────────────────────────────────

function dist(x1: number, y1: number, x2: number, y2: number): number {
  const dx = x1 - x2;
  const dy = y1 - y2;
  return Math.sqrt(dx * dx + dy * dy);
}

// ─── 辅助：判断格子是否为水域 ───────────────────────────

function isWater(cell: WorldCell): boolean {
  return cell.baseTerrain === 'water';
}

// ─── 辅助：判断格子是否为山地 ───────────────────────────

function isMountain(cell: WorldCell): boolean {
  return cell.baseTerrain === 'mountain';
}

// ─── 辅助：判断格子是否高坡度 ───────────────────────────

function isHighSlope(cell: WorldCell): boolean {
  return cell.slope > 0.12;
}

// ─── 辅助：判断附近是否有河流 ───────────────────────────

function isNearRiver(cells: WorldCell[][], x: number, y: number, w: number, h: number, radius: number): boolean {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      if (dx * dx + dy * dy > radius * radius) continue;
      if (cells[ny][nx].features.includes('river')) return true;
    }
  }
  return false;
}

// ─── 辅助：判断是否在河流上 ─────────────────────────────

function isOnRiver(cell: WorldCell): boolean {
  return cell.features.includes('river');
}

// ─── 辅助：判断附近是否有海岸 ───────────────────────────

function isNearCoast(cells: WorldCell[][], x: number, y: number, w: number, h: number, radius: number): boolean {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      if (dx * dx + dy * dy > radius * radius) continue;
      if (isWater(cells[ny][nx])) return true;
    }
  }
  return false;
}

// ─── 辅助：判断附近是否有平原 ───────────────────────────

function countNearbyPlains(cells: WorldCell[][], x: number, y: number, w: number, h: number, radius: number): number {
  let count = 0;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      if (cells[ny][nx].baseTerrain === 'plains') count++;
    }
  }
  return count;
}

// ─── 辅助：判断是否孤立（周围无陆地） ───────────────────

function isIsolated(cells: WorldCell[][], x: number, y: number, w: number, h: number, radius: number): boolean {
  let landCount = 0;
  const total = (radius * 2 + 1) ** 2;
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      if (!isWater(cells[ny][nx])) landCount++;
    }
  }
  return landCount < total * 0.3;
}

// ─── 城市选址评分 ───────────────────────────────────────

/**
 * 对候选位置进行综合评分
 * 加分：平坦地形、靠近河流但不在河上、靠近海岸、附近有平原、地图中心性、远离已有城市
 * 减分：水域、山地、高坡度、沼泽、沙漠、孤立
 * 城市中心不可在水域/山地/高坡度上
 */
function scoreCityLocation(
  ctx: WorldGenContext,
  x: number,
  y: number,
  minDistance: number
): number {
  const { cells, width, height } = ctx;
  const cell = cells[y][x];

  // ── 硬性排除条件：城市中心不能在水域、山地或高坡度上 ──
  if (isWater(cell) || isMountain(cell) || isHighSlope(cell)) {
    return -Infinity;
  }

  let score = 0;

  // ── 地形平坦度加分 ──
  if (cell.slope < 0.03) score += 30;
  else if (cell.slope < 0.06) score += 15;
  else if (cell.slope < 0.09) score += 5;

  // ── 靠近河流但不在河上 ──
  const nearRiver = isNearRiver(cells, x, y, width, height, 6);
  const onRiver = isOnRiver(cell);
  if (nearRiver && !onRiver) score += 40;
  else if (onRiver) score += 5; // 在河上也有少量加分，但不如近河不在河上
  else if (!nearRiver) score -= 15;

  // ── 靠近海岸 ──
  if (isNearCoast(cells, x, y, width, height, 10)) score += 20;

  // ── 附近有平原 ──
  const plainsCount = countNearbyPlains(cells, x, y, width, height, 8);
  score += Math.min(plainsCount * 0.5, 25);

  // ── 地图中心性 ──
  const centerDist = dist(x, y, width / 2, height / 2);
  const maxCenterDist = Math.sqrt((width / 2) ** 2 + (height / 2) ** 2);
  const centrality = 1 - centerDist / maxCenterDist;
  score += centrality * 15;

  // ── 远离已有城市 ──
  let closestCityDist = Infinity;
  for (const city of ctx.cities) {
    const d = dist(x, y, city.center.x, city.center.y);
    if (d < closestCityDist) closestCityDist = d;
  }
  if (closestCityDist < minDistance) {
    score -= 200; // 严重惩罚距离过近
  } else {
    // 距离越远越好（适度）
    score += Math.min(closestCityDist * 0.05, 20);
  }

  // ── 惩罚：沼泽 ──
  if (cell.baseTerrain === 'marshland') score -= 40;

  // ── 惩罚：沙漠 ──
  if (cell.baseTerrain === 'desert') score -= 35;

  // ── 惩罚：孤立 ──
  if (isIsolated(cells, x, y, width, height, 10)) score -= 50;

  // ── 低海拔轻微加分（适合聚居） ──
  if (cell.elevation < 0.4) score += 10;

  return score;
}

// ─── 寻找最佳城市位置 ───────────────────────────────────

/**
 * 在全地图中寻找得分最高的城市位置
 * 使用采样+精搜两阶段策略以提升性能
 */
export function findCityLocation(
  ctx: WorldGenContext,
  rank: WorldCityRank,
  minDistance: number
): { x: number; y: number } | null {
  const { width, height } = ctx;

  // 第一阶段：粗采样（每4格采样一次）
  const step = 4;
  const candidates: Array<{ x: number; y: number; score: number }> = [];

  for (let y = 0; y < height; y += step) {
    for (let x = 0; x < width; x += step) {
      const score = scoreCityLocation(ctx, x, y, minDistance);
      if (score > -Infinity) {
        candidates.push({ x, y, score });
      }
    }
  }

  if (candidates.length === 0) return null;

  // 取前20个候选
  candidates.sort((a, b) => b.score - a.score);
  const topCandidates = candidates.slice(0, 20);

  // 第二阶段：在候选点附近精搜
  let bestX = -1;
  let bestY = -1;
  let bestScore = -Infinity;

  for (const cand of topCandidates) {
    const searchRadius = step * 2;
    for (let dy = -searchRadius; dy <= searchRadius; dy++) {
      for (let dx = -searchRadius; dx <= searchRadius; dx++) {
        const nx = cand.x + dx;
        const ny = cand.y + dy;
        if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
        const score = scoreCityLocation(ctx, nx, ny, minDistance);
        if (score > bestScore) {
          bestScore = score;
          bestX = nx;
          bestY = ny;
        }
      }
    }
  }

  if (bestX < 0 || bestScore === -Infinity) return null;
  return { x: bestX, y: bestY };
}

// ─── 绘制城市区域 ───────────────────────────────────────

/**
 * 使用距离+噪声创建有机形状的城市区域
 * - d < radius * 0.25: city_center + urban_block
 * - d < radius * 0.70 + noise: urban_block
 * - d < radius + noise: suburb（60%城市，40%平原+field）
 * 核心区域设置 baseTerrain = 'city'，不覆盖水域
 */
export function paintCityArea(ctx: WorldGenContext, city: GeneratedCity): void {
  const { cells, width, height, rng } = ctx;
  const cx = city.center.x;
  const cy = city.center.y;
  const radius = city.radius;

  // 使用噪声让城市边界更有机
  const noiseGen = new WorldPerlinNoise(rng.nextInt(0, 999999));

  // 遍历城市可能覆盖的范围
  const r = Math.ceil(radius) + 2;
  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

      // 不覆盖水域
      if (isWater(cells[ny][nx])) continue;

      const d = dist(cx, cy, nx, ny);
      // 噪声扰动让边界更自然
      const noiseVal = (noiseGen.noise2D(nx * 0.15, ny * 0.15) - 0.5) * radius * 0.2;

      const cell = cells[ny][nx];

      // ── 核心区：城市中心 + 城市街区 ──
      if (d < radius * 0.25) {
        cell.baseTerrain = 'city';
        if (dx === 0 && dy === 0) {
          // 城市中心点
          addFeature(cell, 'city_center');
          addFeature(cell, 'urban_block');
        } else {
          addFeature(cell, 'urban_block');
        }
      }
      // ── 城区：城市街区 ──
      else if (d < radius * 0.70 + noiseVal) {
        cell.baseTerrain = 'city';
        addFeature(cell, 'urban_block');
      }
      // ── 郊区：混合城市与农田 ──
      else if (d < radius + noiseVal) {
        const suburbNoise = rng.next();
        if (suburbNoise < 0.6) {
          // 60% 城市化
          cell.baseTerrain = 'city';
          addFeature(cell, 'suburb');
        } else {
          // 40% 农田/平原
          if (cell.baseTerrain !== 'city') {
            cell.baseTerrain = 'plains';
          }
          addFeature(cell, 'field');
        }
      }
    }
  }
}

// ─── 辅助：安全添加特征 ─────────────────────────────────

function addFeature(cell: WorldCell, feature: WorldFeatureType): void {
  if (!cell.features.includes(feature)) {
    cell.features.push(feature);
  }
}

// ─── 计算城市边界 ───────────────────────────────────────

/**
 * 找到城市格子（baseTerrain === 'city' 或包含城市相关特征）的包围盒
 */
export function computeCityBounds(
  cells: WorldCell[][],
  centerX: number,
  centerY: number,
  radius: number
): { minX: number; minY: number; maxX: number; maxY: number } {
  const r = Math.ceil(radius) + 2;
  let minX = centerX;
  let minY = centerY;
  let maxX = centerX;
  let maxY = centerY;

  for (let dy = -r; dy <= r; dy++) {
    for (let dx = -r; dx <= r; dx++) {
      const nx = centerX + dx;
      const ny = centerY + dy;
      if (nx < 0 || ny < 0 || ny >= cells.length || nx >= cells[0].length) continue;

      const cell = cells[ny][nx];
      if (cell.baseTerrain === 'city' ||
          cell.features.includes('city_center') ||
          cell.features.includes('urban_block') ||
          cell.features.includes('suburb')) {
        if (nx < minX) minX = nx;
        if (ny < minY) minY = ny;
        if (nx > maxX) maxX = nx;
        if (ny > maxY) maxY = ny;
      }
    }
  }

  return { minX, minY, maxX, maxY };
}

// ─── 主入口：放置所有城市 ───────────────────────────────

/**
 * 按顺序放置城市：首都 → 大城市 → 区域城市 → 城镇
 * 每个城市：寻找最佳位置 → 绘制城市区域 → 记录城市信息
 */
export function placeCities(ctx: WorldGenContext): void {
  const ranks: WorldCityRank[] = ['capital', 'major', 'regional', 'town'];

  for (const rank of ranks) {
    const cfg = getCityRankConfig(ctx, rank);

    for (let i = 0; i < cfg.count; i++) {
      const location = findCityLocation(ctx, rank, cfg.minDistance);
      if (!location) continue; // 找不到合适位置则跳过

      // 随机生成城市半径
      const radius = ctx.rng.nextInt(cfg.radius[0], cfg.radius[1]);

      // 生成城市名称
      const name = `City_${rank}_${i}`;

      // 构建城市对象（先不含bounds，绘制后再算）
      const city: GeneratedCity = {
        id: `city_${rank}_${i}`,
        name,
        rank,
        center: { x: location.x, y: location.y },
        radius,
        bounds: { minX: 0, minY: 0, maxX: 0, maxY: 0 }, // 临时占位
        populationScore: cityPopulationScore(rank),
        supplyValue: citySupplyValue(rank),
        victoryPointValue: cityVictoryPointValue(rank),
        chunkIds: [],
      };

      // 绘制城市区域到地图上
      paintCityArea(ctx, city);

      // 计算城市边界
      city.bounds = computeCityBounds(ctx.cells, location.x, location.y, radius);

      // 记录城市
      ctx.cities.push(city);
    }
  }
}
