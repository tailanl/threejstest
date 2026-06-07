/** @deprecated Use directory equivalents under src/game/world-map/ and src/game/world-view/ instead */
/**
 * WorldMap 道路网络生成
 *
 * 根据城市层级关系（首都→大城市→区域城市→城镇）构建道路网络，
 * 使用 A* 寻路算法规划道路路径，并在道路与河流交汇处放置桥梁。
 */

import type { WorldCell, WorldFeatureType, GeneratedRoad } from './world-map-types';
import type { WorldGenContext, WorldRNG } from './world-map-terrain';

// ─── 地形移动代价表（用于 A* 寻路） ──────────────────────

const TERRAIN_ROAD_COST: Record<string, number> = {
  city: 0.5,
  plains: 1,
  highland: 3,
  forest: 4,
  desert: 5,
  marshland: 8,
  mountain: 12,
  water: 999,
};

// ─── 并查集（用于 MST 构建） ────────────────────────────

class UnionFind {
  private parent: number[];
  private rank: number[];

  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.rank = new Array(n).fill(0);
  }

  find(u: number): number {
    if (this.parent[u] !== u) this.parent[u] = this.find(this.parent[u]);
    return this.parent[u];
  }

  union(a: number, b: number): boolean {
    const ra = this.find(a);
    const rb = this.find(b);
    if (ra === rb) return false;
    if (this.rank[ra] < this.rank[rb]) this.parent[ra] = rb;
    else if (this.rank[ra] > this.rank[rb]) this.parent[rb] = ra;
    else { this.parent[rb] = ra; this.rank[ra]++; }
    return true;
  }
}

// ─── 辅助函数 ──────────────────────────────────────────

/** 对角线距离（启发函数） */
function diagonalDistance(from: { x: number; y: number }, to: { x: number; y: number }): number {
  const dx = Math.abs(to.x - from.x);
  const dy = Math.abs(to.y - from.y);
  return Math.max(dx, dy) + (Math.SQRT2 - 1) * Math.min(dx, dy);
}

/** 获取8邻域 */
function getNeighbors8(pos: { x: number; y: number }, width: number, height: number): Array<{ x: number; y: number; cost: number }> {
  const dirs = [
    { dx: -1, dy: 0 }, { dx: 1, dy: 0 }, { dx: 0, dy: -1 }, { dx: 0, dy: 1 },
    { dx: -1, dy: -1 }, { dx: -1, dy: 1 }, { dx: 1, dy: -1 }, { dx: 1, dy: 1 },
  ];
  const result: Array<{ x: number; y: number; cost: number }> = [];
  for (const d of dirs) {
    const nx = pos.x + d.dx;
    const ny = pos.y + d.dy;
    if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
    // 对角线移动代价略高
    const moveCost = (d.dx !== 0 && d.dy !== 0) ? Math.SQRT2 : 1;
    result.push({ x: nx, y: ny, cost: moveCost });
  }
  return result;
}

/** 获取某格的道路寻路代价 */
function getCellRoadCost(cell: WorldCell): number {
  // 已有道路的格子代价极低
  if (cell.features.includes('main_road') || cell.features.includes('secondary_road')) {
    return 0.5;
  }
  const base = TERRAIN_ROAD_COST[cell.baseTerrain] ?? 1;
  return base;
}

// ─── A* 寻路 ───────────────────────────────────────────

/**
 * A* 寻路算法，在 WorldMap 网格上寻找从 from 到 to 的最低代价路径
 *
 * @param ctx 生成上下文
 * @param from 起点
 * @param to 终点
 * @param roadType 道路类型（影响代价微调）
 * @returns 路径坐标数组，找不到则返回空数组
 */
export function findPathAStar(
  ctx: WorldGenContext,
  from: { x: number; y: number },
  to: { x: number; y: number },
  roadType: 'main' | 'secondary' | 'military',
): Array<{ x: number; y: number }> {
  const { width, height, cells } = ctx;

  // 起终点相同时直接返回
  if (from.x === to.x && from.y === to.y) {
    return [{ x: from.x, y: from.y }];
  }

  const key = (x: number, y: number) => y * width + x;

  const totalCells = width * height;
  const gScore = new Float64Array(totalCells).fill(Infinity);
  const fScore = new Float64Array(totalCells).fill(Infinity);
  const cameFrom = new Int32Array(totalCells).fill(-1);
  const closed = new Uint8Array(totalCells);

  // 使用简单的二叉堆作为开放列表
  const openHeap: number[] = []; // 存储 flat index

  function heapPush(idx: number): void {
    openHeap.push(idx);
    let i = openHeap.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (fScore[openHeap[i]] < fScore[openHeap[parent]]) {
        [openHeap[i], openHeap[parent]] = [openHeap[parent], openHeap[i]];
        i = parent;
      } else break;
    }
  }

  function heapPop(): number {
    const top = openHeap[0];
    const last = openHeap.pop()!;
    if (openHeap.length > 0) {
      openHeap[0] = last;
      let i = 0;
      while (true) {
        let smallest = i;
        const left = 2 * i + 1;
        const right = 2 * i + 2;
        if (left < openHeap.length && fScore[openHeap[left]] < fScore[openHeap[smallest]]) smallest = left;
        if (right < openHeap.length && fScore[openHeap[right]] < fScore[openHeap[smallest]]) smallest = right;
        if (smallest !== i) {
          [openHeap[i], openHeap[smallest]] = [openHeap[smallest], openHeap[i]];
          i = smallest;
        } else break;
      }
    }
    return top;
  }

  const startIdx = key(from.x, from.y);
  const goalIdx = key(to.x, to.y);

  gScore[startIdx] = 0;
  fScore[startIdx] = diagonalDistance(from, to);
  heapPush(startIdx);

  const maxIter = totalCells * 2;
  let iter = 0;

  while (openHeap.length > 0 && iter < maxIter) {
    iter++;
    const currentIdx = heapPop();

    // 到达终点，重建路径
    if (currentIdx === goalIdx) {
      const path: Array<{ x: number; y: number }> = [];
      let ci: number = goalIdx;
      while (ci !== -1) {
        const cy = Math.floor(ci / width);
        const cx = ci % width;
        path.unshift({ x: cx, y: cy });
        ci = cameFrom[ci];
      }
      return path;
    }

    if (closed[currentIdx]) continue;
    closed[currentIdx] = 1;

    const cx = currentIdx % width;
    const cy = Math.floor(currentIdx / width);
    const currentPos = { x: cx, y: cy };

    for (const neighbor of getNeighbors8(currentPos, width, height)) {
      const nIdx = key(neighbor.x, neighbor.y);
      if (closed[nIdx]) continue;

      const cell = cells[neighbor.y][neighbor.x];
      const terrainCost = getCellRoadCost(cell);

      // 水域不可通行（除非已有桥梁）
      if (terrainCost >= 999 && !cell.features.includes('bridge')) continue;

      const moveCost = terrainCost * neighbor.cost;
      const tentativeG = gScore[currentIdx] + moveCost;

      if (tentativeG < gScore[nIdx]) {
        cameFrom[nIdx] = currentIdx;
        gScore[nIdx] = tentativeG;
        fScore[nIdx] = tentativeG + diagonalDistance(neighbor, to);
        heapPush(nIdx);
      }
    }
  }

  // 未找到路径，返回空数组
  return [];
}

// ─── 道路绘制 ───────────────────────────────────────────

/**
 * 将路径上的格子标记为道路特征
 *
 * - 主干道（capital/major 连接）标记为 main_road
 * - 次要道路标记为 secondary_road
 * - 不覆盖城市的 baseTerrain
 * - 城市格子可以拥有道路特征
 */
export function paintRoadCells(
  ctx: WorldGenContext,
  path: Array<{ x: number; y: number }>,
  roadType: 'main' | 'secondary' | 'military',
): void {
  const { cells } = ctx;
  const feature: WorldFeatureType = roadType === 'main' ? 'main_road' : 'secondary_road';

  for (const pos of path) {
    const cell = cells[pos.y][pos.x];
    // 避免重复添加
    if (!cell.features.includes(feature)) {
      cell.features.push(feature);
    }
  }
}

// ─── 桥梁放置 ───────────────────────────────────────────

/**
 * 在道路与河流重叠的格子放置桥梁
 *
 * 验证：每个桥梁格子必须同时拥有道路和河流特征
 */
export function placeBridges(ctx: WorldGenContext): void {
  const { width, height, cells } = ctx;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = cells[y][x];
      const hasRoad = cell.features.includes('main_road') || cell.features.includes('secondary_road');
      const hasRiver = cell.features.includes('river') || cell.features.includes('stream');

      if (hasRoad && hasRiver && !cell.features.includes('bridge')) {
        cell.features.push('bridge');
      }
    }
  }

  // 验证：确保每个桥梁格子同时有道路和河流
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = cells[y][x];
      if (cell.features.includes('bridge')) {
        const hasRoad = cell.features.includes('main_road') || cell.features.includes('secondary_road');
        const hasRiver = cell.features.includes('river') || cell.features.includes('stream');
        if (!hasRoad || !hasRiver) {
          // 移除无效桥梁
          const idx = cell.features.indexOf('bridge');
          if (idx >= 0) cell.features.splice(idx, 1);
        }
      }
    }
  }
}

// ─── 道路网络构建 ────────────────────────────────────────

/**
 * 构建道路网络
 *
 * 连接顺序：
 * 1. 首都 → 所有大城市（main_road）
 * 2. 大城市之间 MST 连接（main_road）
 * 3. 区域城市 → 最近大城市（secondary_road）
 * 4. 城镇 → 最近区域城市/大城市（secondary_road）
 * 5. 额外冗余道路（根据 extraRoadRatio 概率添加）
 */
export function buildRoadNetwork(ctx: WorldGenContext): void {
  const { cities, config } = ctx;
  if (cities.length < 2) return;

  const capital = cities.filter(c => c.rank === 'capital');
  const majors = cities.filter(c => c.rank === 'major');
  const regionals = cities.filter(c => c.rank === 'regional');
  const towns = cities.filter(c => c.rank === 'town');

  // 收集所有需要建设的道路对
  const roadPairs: Array<{
    from: typeof cities[number];
    to: typeof cities[number];
    roadType: 'main' | 'secondary' | 'military';
    priority: number;
  }> = [];

  // ── 规则1：首都连接所有大城市 ──
  if (config.roads.connectCapitalToMajors) {
    for (const cap of capital) {
      for (const maj of majors) {
        roadPairs.push({ from: cap, to: maj, roadType: 'main', priority: 100 });
      }
    }
  }

  // ── 规则2：大城市之间 MST 连接 ──
  if (config.roads.connectMajorMST && majors.length >= 2) {
    const majorEdges: Array<{ i: number; j: number; dist: number }> = [];
    for (let i = 0; i < majors.length; i++) {
      for (let j = i + 1; j < majors.length; j++) {
        majorEdges.push({
          i, j,
          dist: diagonalDistance(majors[i].center, majors[j].center),
        });
      }
    }
    majorEdges.sort((a, b) => a.dist - b.dist);

    const uf = new UnionFind(majors.length);
    for (const e of majorEdges) {
      if (uf.union(e.i, e.j)) {
        roadPairs.push({ from: majors[e.i], to: majors[e.j], roadType: 'main', priority: 80 });
      }
    }
  }

  // ── 规则3：区域城市连接最近大城市 ──
  if (config.roads.connectRegionalToMajor) {
    for (const reg of regionals) {
      let nearestMajor: typeof cities[number] | null = null;
      let nearestDist = Infinity;
      for (const maj of majors) {
        const d = diagonalDistance(reg.center, maj.center);
        if (d < nearestDist) {
          nearestDist = d;
          nearestMajor = maj;
        }
      }
      if (nearestMajor) {
        roadPairs.push({ from: reg, to: nearestMajor, roadType: 'secondary', priority: 60 });
      }
    }
  }

  // ── 规则4：城镇连接最近区域城市或大城市 ──
  if (config.roads.connectTownToRegional) {
    for (const town of towns) {
      let nearest: typeof cities[number] | null = null;
      let nearestDist = Infinity;

      // 优先连接区域城市
      for (const reg of regionals) {
        const d = diagonalDistance(town.center, reg.center);
        if (d < nearestDist) {
          nearestDist = d;
          nearest = reg;
        }
      }
      // 也可连接大城市
      for (const maj of majors) {
        const d = diagonalDistance(town.center, maj.center);
        if (d < nearestDist) {
          nearestDist = d;
          nearest = maj;
        }
      }
      if (nearest) {
        roadPairs.push({ from: town, to: nearest, roadType: 'secondary', priority: 40 });
      }
    }
  }

  // ── 规则5：额外冗余道路 ──
  const existingPairs = new Set(roadPairs.map(p => `${p.from.id}-${p.to.id}`));
  const allCityPairs: Array<{ from: typeof cities[number]; to: typeof cities[number]; dist: number }> = [];
  for (let i = 0; i < cities.length; i++) {
    for (let j = i + 1; j < cities.length; j++) {
      const pairKey = `${cities[i].id}-${cities[j].id}`;
      if (existingPairs.has(pairKey) || existingPairs.has(`${cities[j].id}-${cities[i].id}`)) continue;
      allCityPairs.push({
        from: cities[i],
        to: cities[j],
        dist: diagonalDistance(cities[i].center, cities[j].center),
      });
    }
  }
  allCityPairs.sort((a, b) => a.dist - b.dist);

  const maxExtra = Math.floor(cities.length * config.roads.extraRoadRatio);
  let extraCount = 0;
  for (const pair of allCityPairs) {
    if (extraCount >= maxExtra) break;
    // 短距离道路更容易被选中
    const shortBonus = pair.dist < (ctx.width + ctx.height) / 4 ? 1.5 : 1;
    if (ctx.rng.next() < config.roads.extraRoadRatio * shortBonus * 0.3) {
      roadPairs.push({ from: pair.from, to: pair.to, roadType: 'secondary', priority: 20 });
      extraCount++;
    }
  }

  // ── 逐条构建道路 ──
  let roadId = 0;
  for (const pair of roadPairs) {
    const path = findPathAStar(ctx, pair.from.center, pair.to.center, pair.roadType);
    if (path.length < 2) continue;

    const road: GeneratedRoad = {
      id: `road_${++roadId}`,
      type: pair.roadType,
      fromCityId: pair.from.id,
      toCityId: pair.to.id,
      path,
    };

    ctx.roads.push(road);
    paintRoadCells(ctx, path, pair.roadType);
  }

  // ── 放置桥梁 ──
  placeBridges(ctx);
}
