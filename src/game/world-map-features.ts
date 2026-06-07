/** @deprecated Use directory equivalents under src/game/world-map/ and src/game/world-view/ instead */
/**
 * WorldMap 军事特征放置 - 要塞、机场、补给站
 *
 * 根据地形、道路、城市等条件评分选址，避免水域和重复放置。
 */

import type { WorldFeatureType } from './world-map-types';
import type { WorldGenContext, WorldRNG } from './world-map-terrain';

// ─── 辅助：安全添加特征（避免重复） ──────────────────────

function addFeature(cell: { features: WorldFeatureType[] }, feature: WorldFeatureType): void {
  if (!cell.features.includes(feature)) {
    cell.features.push(feature);
  }
}

// ─── 辅助：判断格子是否为水域 ────────────────────────────

function isWater(baseTerrain: string): boolean {
  return baseTerrain === 'water';
}

// ─── 辅助：判断附近是否有桥梁 ────────────────────────────

function isNearBridge(cells: { features: WorldFeatureType[] }[][], x: number, y: number, w: number, h: number, radius: number): boolean {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      if (cells[ny][nx].features.includes('bridge')) return true;
    }
  }
  return false;
}

// ─── 辅助：判断附近是否有道路 ────────────────────────────

function hasRoadNearby(cells: { features: WorldFeatureType[] }[][], x: number, y: number, w: number, h: number, radius: number): boolean {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      const f = cells[ny][nx].features;
      if (f.includes('main_road') || f.includes('secondary_road')) return true;
    }
  }
  return false;
}

// ─── 辅助：计算8邻域中道路邻居数量 ──────────────────────

function countRoadNeighbors(cells: { features: WorldFeatureType[] }[][], x: number, y: number, w: number, h: number): number {
  let count = 0;
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
  for (const [dx, dy] of dirs) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
    const f = cells[ny][nx].features;
    if (f.includes('main_road') || f.includes('secondary_road')) count++;
  }
  return count;
}

// ─── 辅助：判断是否在城市郊区（近城但非市中心） ────────

function isCityOutskirts(ctx: WorldGenContext, x: number, y: number, minDist: number, maxDist: number): boolean {
  for (const city of ctx.cities) {
    const dx = Math.abs(city.center.x - x);
    const dy = Math.abs(city.center.y - y);
    const manhattan = dx + dy;
    if (manhattan >= minDist && manhattan <= maxDist) return true;
  }
  return false;
}

// ─── 辅助：判断是否在城市中心 ────────────────────────────

function isCityCenter(cell: { features: WorldFeatureType[] }): boolean {
  return cell.features.includes('city_center');
}

// ─── 辅助：判断是否为山地隘口 ────────────────────────────

function isMountainPass(cells: { baseTerrain: string; slope: number; features: WorldFeatureType[] }[][], x: number, y: number, w: number, h: number): boolean {
  const cell = cells[y][x];
  // 自身不是山地但周围有山地 → 可能是隘口
  if (cell.baseTerrain === 'mountain') return false;
  if (cell.slope > 0.10) return false;

  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [-1, 1], [1, -1], [1, 1]];
  let mountainNeighbors = 0;
  for (const [dx, dy] of dirs) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
    if (cells[ny][nx].baseTerrain === 'mountain') mountainNeighbors++;
  }
  return mountainNeighbors >= 3;
}

// ─── 辅助：判断是否在高原边缘 ────────────────────────────

function isHighlandEdge(cells: { baseTerrain: string; features: WorldFeatureType[] }[][], x: number, y: number, w: number, h: number): boolean {
  if (cells[y][x].baseTerrain !== 'highland') return false;
  const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
  for (const [dx, dy] of dirs) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
    const neighborTerrain = cells[ny][nx].baseTerrain;
    if (neighborTerrain !== 'highland' && neighborTerrain !== 'mountain' && neighborTerrain !== 'water') {
      return true;
    }
  }
  return false;
}

// ─── 辅助：距离最近大城市 ────────────────────────────────

function distanceToMajorCity(x: number, y: number, cities: Array<{ rank: string; center: { x: number; y: number } }>): number {
  let minD = Infinity;
  for (const c of cities) {
    if (c.rank === 'capital' || c.rank === 'major') {
      const d = Math.abs(c.center.x - x) + Math.abs(c.center.y - y);
      if (d < minD) minD = d;
    }
  }
  return minD;
}

// ─── 辅助：距离最近城市 ──────────────────────────────────

function distanceToNearestCity(x: number, y: number, cities: Array<{ center: { x: number; y: number } }>): number {
  let minD = Infinity;
  for (const c of cities) {
    const d = Math.abs(c.center.x - x) + Math.abs(c.center.y - y);
    if (d < minD) minD = d;
  }
  return minD;
}

// ─── 辅助：判断附近是否有机场或补给站 ────────────────────

function isNearFeature(cells: { features: WorldFeatureType[] }[][], x: number, y: number, w: number, h: number, radius: number, feature: WorldFeatureType): boolean {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      if (cells[ny][nx].features.includes(feature)) return true;
    }
  }
  return false;
}

// ─── 1. 要塞放置 ────────────────────────────────────────

/**
 * 放置要塞：桥头堡、山口、道路交叉点、城市外围、高原边缘
 * 不放置在城市中心
 */
export function placeFortresses(ctx: WorldGenContext): void {
  const { cells, width, height, rng } = ctx;
  const count = ctx.config.features.fortressCount;

  const candidates: Array<{ x: number; y: number; score: number }> = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = cells[y][x];

      // 排除水域
      if (isWater(cell.baseTerrain)) continue;
      // 排除城市中心
      if (isCityCenter(cell)) continue;
      // 排除已有要塞
      if (cell.features.includes('fortress')) continue;

      let score = 0;

      // ── 桥头堡：靠近桥梁 ──
      if (isNearBridge(cells, x, y, width, height, 3)) {
        score += 25;
      }

      // ── 山口 ──
      if (isMountainPass(cells, x, y, width, height)) {
        score += 30;
      }

      // ── 道路交叉点 ──
      const roadNeighbors = countRoadNeighbors(cells, x, y, width, height);
      if (roadNeighbors >= 3) {
        score += 25;
      } else if (roadNeighbors >= 2) {
        score += 12;
      }

      // ── 城市外围 ──
      if (isCityOutskirts(ctx, x, y, 2, 6)) {
        score += 18;
      }

      // ── 高原边缘 ──
      if (isHighlandEdge(cells, x, y, width, height)) {
        score += 15;
      }

      // ── 地形防御加成 ──
      const terrain = cell.baseTerrain;
      if (terrain === 'highland') score += 25;
      else if (terrain === 'mountain') score += 18;
      else if (terrain === 'forest') score += 8;

      // ── 坡度加成（略高坡度利于防御） ──
      if (cell.slope > 0.04 && cell.slope < 0.10) score += 10;

      if (score > 0) {
        candidates.push({ x, y, score });
      }
    }
  }

  // 按评分降序排列
  candidates.sort((a, b) => b.score - a.score);

  // 放置，保持最小间距
  const minDist = 8;
  const placed: Array<{ x: number; y: number }> = [];

  for (const c of candidates) {
    if (placed.length >= count) break;
    // 检查与已放置要塞的距离
    const tooClose = placed.some(p =>
      Math.abs(p.x - c.x) + Math.abs(p.y - c.y) < minDist
    );
    if (tooClose) continue;

    addFeature(cells[c.y][c.x], 'fortress');
    placed.push({ x: c.x, y: c.y });
  }
}

// ─── 2. 机场放置 ────────────────────────────────────────

/**
 * 放置机场：靠近大城市、平坦地形、有道路连接、非水域/山地/沼泽
 */
export function placeAirfields(ctx: WorldGenContext): void {
  const { cells, width, height, rng } = ctx;
  const count = ctx.config.features.airfieldCount;

  const candidates: Array<{ x: number; y: number; score: number }> = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = cells[y][x];

      // 排除水域、山地、沼泽
      if (isWater(cell.baseTerrain)) continue;
      if (cell.baseTerrain === 'mountain') continue;
      if (cell.baseTerrain === 'marshland') continue;
      // 排除已有机场
      if (cell.features.includes('airfield')) continue;

      // 坡度必须足够平坦
      if (cell.slope > 0.08) continue;

      let score = 0;

      // ── 平坦度加分 ──
      const flatness = Math.max(0, 1 - cell.slope / 0.08);
      score += flatness * 45;

      // ── 靠近大城市 ──
      const majorDist = distanceToMajorCity(x, y, ctx.cities);
      if (majorDist <= 8) {
        score += 30;
      } else if (majorDist <= 15) {
        score += 15;
      }

      // ── 有道路连接 ──
      if (hasRoadNearby(cells, x, y, width, height, 3)) {
        score += 20;
      }

      // ── 不在城市中心（机场需要空间） ──
      if (isCityCenter(cell)) {
        score -= 50;
      }

      // ── 平原地形加分 ──
      if (cell.baseTerrain === 'plains') score += 10;

      if (score > 0) {
        candidates.push({ x, y, score });
      }
    }
  }

  // 按评分降序排列
  candidates.sort((a, b) => b.score - a.score);

  // 放置，保持最小间距
  const minDist = 12;
  const placed: Array<{ x: number; y: number }> = [];

  for (const c of candidates) {
    if (placed.length >= count) break;
    const tooClose = placed.some(p =>
      Math.abs(p.x - c.x) + Math.abs(p.y - c.y) < minDist
    );
    if (tooClose) continue;

    addFeature(cells[c.y][c.x], 'airfield');
    placed.push({ x: c.x, y: c.y });
  }
}

// ─── 3. 补给站放置 ──────────────────────────────────────

/**
 * 放置补给站：靠近主干道、靠近城市、后方区域、靠近机场/港口
 */
export function placeSupplyDepots(ctx: WorldGenContext): void {
  const { cells, width, height, rng } = ctx;
  const count = ctx.config.features.supplyDepotCount;

  const candidates: Array<{ x: number; y: number; score: number }> = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = cells[y][x];

      // 排除水域
      if (isWater(cell.baseTerrain)) continue;
      // 排除已有补给站
      if (cell.features.includes('supply_depot')) continue;

      let score = 0;

      // ── 靠近主干道 ──
      if (hasRoadNearby(cells, x, y, width, height, 2)) {
        score += 30;
        // 主干道额外加分
        if (cell.features.includes('main_road')) score += 10;
      }

      // ── 靠近城市 ──
      const cityDist = distanceToNearestCity(x, y, ctx.cities);
      if (cityDist <= 5) {
        score += 20;
      } else if (cityDist <= 10) {
        score += 10;
      }

      // ── 后方区域（不在城市中心，但在城市影响范围内） ──
      if (isCityOutskirts(ctx, x, y, 3, 8)) {
        score += 15;
      }

      // ── 靠近机场 ──
      if (isNearFeature(cells, x, y, width, height, 6, 'airfield')) {
        score += 15;
      }

      // ── 靠近桥梁/港口 ──
      if (isNearBridge(cells, x, y, width, height, 4)) {
        score += 10;
      }

      // ── 不在城市中心 ──
      if (isCityCenter(cell)) {
        score -= 30;
      }

      // ── 惩罚恶劣地形 ──
      if (cell.baseTerrain === 'marshland') score -= 20;
      if (cell.baseTerrain === 'mountain') score -= 15;

      if (score > 0) {
        candidates.push({ x, y, score });
      }
    }
  }

  // 按评分降序排列
  candidates.sort((a, b) => b.score - a.score);

  // 放置，保持最小间距
  const minDist = 6;
  const placed: Array<{ x: number; y: number }> = [];

  for (const c of candidates) {
    if (placed.length >= count) break;
    const tooClose = placed.some(p =>
      Math.abs(p.x - c.x) + Math.abs(p.y - c.y) < minDist
    );
    if (tooClose) continue;

    addFeature(cells[c.y][c.x], 'supply_depot');
    placed.push({ x: c.x, y: c.y });
  }
}
