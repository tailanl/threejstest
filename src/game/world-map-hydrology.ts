/**
 * WorldMap 河流水系生成 - 主河、支流、溪流
 */

import type { WorldCell, WorldFeatureType, GeneratedRiver } from './world-map-types';
import type { WorldGenContext, WorldRNG } from './world-map-terrain';

// ─── 河流源点查找 ───────────────────────────────────────

/**
 * 在指定海拔范围内寻找合适的河流源头
 * 优先选择湿度高的格子，避免水域和已有河流源头
 */
export function findRiverSource(
  ctx: WorldGenContext,
  minElevation: number,
  maxElevation: number,
): { x: number; y: number } | null {
  const { width, height, cells, rng } = ctx;

  // 收集所有候选格子
  const candidates: Array<{ x: number; y: number; moisture: number }> = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = cells[y][x];
      // 跳过水域
      if (cell.baseTerrain === 'water') continue;
      // 跳过已有河流的格子（避免源头重叠）
      if (cell.features.includes('river')) continue;
      // 海拔范围筛选
      if (cell.elevation < minElevation || cell.elevation > maxElevation) continue;

      candidates.push({ x, y, moisture: cell.moisture });
    }
  }

  if (candidates.length === 0) return null;

  // 按湿度降序排列，优先选湿度高的区域
  candidates.sort((a, b) => b.moisture - a.moisture);

  // 从前 30% 高湿度候选中随机选取，增加多样性
  const topCount = Math.max(1, Math.floor(candidates.length * 0.3));
  const idx = rng.nextInt(0, topCount - 1);
  return { x: candidates[idx].x, y: candidates[idx].y };
}

// ─── 沿最陡下降方向流动 ─────────────────────────────────

/**
 * 从起点沿最陡下降方向流动，生成河流路径
 * 允许少量横向偏移产生自然弯曲
 * 到达水域、地图边缘或最大步数时停止
 */
export function flowDownhill(
  ctx: WorldGenContext,
  startX: number,
  startY: number,
  maxSteps: number,
): Array<{ x: number; y: number }> {
  const { width, height, cells, rng } = ctx;
  const path: Array<{ x: number; y: number }> = [{ x: startX, y: startY }];
  const visited = new Set<string>();
  visited.add(`${startX},${startY}`);

  let cx = startX;
  let cy = startY;

  // 8 方向偏移
  const dirs = [
    { dx: -1, dy: 0 },
    { dx: 1, dy: 0 },
    { dx: 0, dy: -1 },
    { dx: 0, dy: 1 },
    { dx: -1, dy: -1 },
    { dx: 1, dy: -1 },
    { dx: -1, dy: 1 },
    { dx: 1, dy: 1 },
  ];

  for (let step = 0; step < maxSteps; step++) {
    const currentCell = cells[cy][cx];

    // 到达水域 → 河流汇入海洋或湖泊，终止
    if (currentCell.baseTerrain === 'water') break;

    // 到达地图边缘 → 终止
    if (cx <= 0 || cx >= width - 1 || cy <= 0 || cy >= height - 1) break;

    // 寻找最陡下降方向
    let bestDir = -1;
    let bestDrop = Infinity; // 负值越大 = 下降越陡
    const alternatives: Array<{ idx: number; drop: number }> = [];

    for (let i = 0; i < dirs.length; i++) {
      const nx = cx + dirs[i].dx;
      const ny = cy + dirs[i].dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      if (visited.has(`${nx},${ny}`)) continue;

      const neighborCell = cells[ny][nx];
      const drop = neighborCell.elevation - currentCell.elevation;
      alternatives.push({ idx: i, drop });

      if (drop < bestDrop) {
        bestDrop = drop;
        bestDir = i;
      }
    }

    // 没有可走的方向
    if (bestDir === -1) break;

    // 如果最陡方向是上升的，河流可能陷入局部洼地，终止
    if (bestDrop > 0) break;

    // 以一定概率选择次优方向，产生自然弯曲
    let chosenDir = bestDir;
    const curveChance = 0.25; // 25% 概率走非最优路径
    if (alternatives.length > 1 && rng.next() < curveChance) {
      // 从下降方向中随机选一个（排除上升方向）
      const downhill = alternatives.filter(a => a.drop <= 0);
      if (downhill.length > 1) {
        const pick = rng.nextInt(0, downhill.length - 1);
        chosenDir = downhill[pick].idx;
      }
    }

    const nextX = cx + dirs[chosenDir].dx;
    const nextY = cy + dirs[chosenDir].dy;

    path.push({ x: nextX, y: nextY });
    visited.add(`${nextX},${nextY}`);
    cx = nextX;
    cy = nextY;
  }

  return path;
}

// ─── 绘制河流到地图格子 ─────────────────────────────────

/**
 * 将河流路径绘制到地图格子上
 * 宽河（width >= 2）：将 baseTerrain 设为 water
 * 小河：仅添加 river 特征
 */
function paintRiver(ctx: WorldGenContext, river: GeneratedRiver): void {
  const { cells } = ctx;

  for (let i = 0; i < river.path.length; i++) {
    const { x, y } = river.path[i];
    const width = river.widthByIndex[i];
    const cell = cells[y][x];

    // 跳过已经是水域的格子（海洋/湖泊）
    if (cell.baseTerrain === 'water') continue;

    // 添加河流特征
    if (!cell.features.includes('river')) {
      cell.features.push('river' as WorldFeatureType);
    }

    // 宽河将地形变为水域
    if (width >= 2) {
      cell.baseTerrain = 'water';
    }
  }
}

// ─── 主入口：生成河流水系 ───────────────────────────────

/**
 * 生成主河和支流
 * - 主河：从高海拔高湿度区域发源，流向海洋/湖泊/地图边缘，宽度 2-3
 * - 支流：从中海拔区域发源，汇入主河或海洋，宽度 1
 */
export function generateRivers(ctx: WorldGenContext): void {
  const { config, rng } = ctx;
  const riverConfig = config.rivers;

  // ── 生成主河 ──
  for (let i = 0; i < riverConfig.mainRiverCount; i++) {
    // 主河源头：高海拔 + 高湿度区域
    const source = findRiverSource(ctx, 0.55, 0.95);
    if (!source) continue;

    const maxSteps = rng.nextInt(riverConfig.minMainRiverLength, riverConfig.maxMainRiverLength);
    const path = flowDownhill(ctx, source.x, source.y, maxSteps);

    // 路径太短则跳过
    if (path.length < 10) continue;

    // 主河宽度：起始 2-3，向下游逐渐变宽
    const startWidth = rng.nextInt(2, 3);
    const widthByIndex = computeRiverWidth(path, startWidth, 3);

    const river: GeneratedRiver = {
      id: `river_main_${i}`,
      type: 'main',
      path,
      widthByIndex,
    };

    ctx.rivers.push(river);
    paintRiver(ctx, river);
  }

  // ── 生成支流 ──
  for (let i = 0; i < riverConfig.tributaryCount; i++) {
    // 支流源头：中等海拔区域
    const source = findRiverSource(ctx, 0.35, 0.7);
    if (!source) continue;

    // 支流较短
    const maxSteps = rng.nextInt(
      Math.floor(riverConfig.minMainRiverLength * 0.3),
      Math.floor(riverConfig.maxMainRiverLength * 0.5),
    );
    const path = flowDownhill(ctx, source.x, source.y, maxSteps);

    // 路径太短则跳过
    if (path.length < 5) continue;

    // 支流宽度：起始 1，最宽不超过 2
    const widthByIndex = computeRiverWidth(path, 1, 2);

    const river: GeneratedRiver = {
      id: `river_trib_${i}`,
      type: 'tributary',
      path,
      widthByIndex,
    };

    ctx.rivers.push(river);
    paintRiver(ctx, river);
  }
}

// ─── 河流宽度渐变计算 ───────────────────────────────────

/**
 * 根据河流路径长度计算每个格子的宽度
 * 从 startWidth 开始，向下游逐渐增大，最大不超过 maxWidth
 */
function computeRiverWidth(
  path: Array<{ x: number; y: number }>,
  startWidth: number,
  maxWidth: number,
): number[] {
  const len = path.length;
  const widthByIndex: number[] = new Array(len);

  for (let i = 0; i < len; i++) {
    // 线性渐变：源头窄，下游宽
    const t = len > 1 ? i / (len - 1) : 0;
    const width = startWidth + (maxWidth - startWidth) * t;
    widthByIndex[i] = Math.round(width);
  }

  return widthByIndex;
}
