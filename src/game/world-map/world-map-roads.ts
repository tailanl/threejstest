/**
 * 道路生成 - 使用简化 A* 在城市间寻路
 */

import type { WorldPosition } from '../world-atlas/atlas-types';
import type { RegionGenerationContext, GeneratedCity, GeneratedRoad } from './world-map-types';
import type { WorldCell } from './world-cell-types';

/**
 * A* 寻路：8方向，使用 movementCost 作为代价
 * 限制搜索节点数以避免性能问题
 */
function aStarRoadWithPath(
  cells: WorldCell[][],
  regionSize: number,
  startX: number,
  startY: number,
  endX: number,
  endY: number,
  maxNodes: number = 5000,
): Array<{ x: number; y: number }> | null {
  const key = (x: number, y: number) => y * regionSize + x;
  const closed = new Set<number>();
  const parentMap = new Map<number, number>(); // key -> parentKey
  const gMap = new Map<number, number>(); // key -> g cost
  const open: Array<{ x: number; y: number; f: number }> = [];

  const heuristic = (x: number, y: number) => {
    const dx = Math.abs(x - endX);
    const dy = Math.abs(y - endY);
    return (dx + dy) + (1.414 - 2) * Math.min(dx, dy);
  };

  const startKey = key(startX, startY);
  gMap.set(startKey, 0);
  open.push({ x: startX, y: startY, f: heuristic(startX, startY) });

  const dirs = [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[-1,1],[1,-1],[1,1]];
  let iterations = 0;

  while (open.length > 0 && iterations < maxNodes) {
    iterations++;

    // Find lowest f
    let bestIdx = 0;
    for (let i = 1; i < open.length; i++) {
      if (open[i].f < open[bestIdx].f) bestIdx = i;
    }
    const current = open[bestIdx];
    open.splice(bestIdx, 1);

    const curKey = key(current.x, current.y);
    if (closed.has(curKey)) continue;
    closed.add(curKey);

    if (current.x === endX && current.y === endY) {
      // Reconstruct path
      const path: Array<{ x: number; y: number }> = [];
      let k = curKey;
      while (k !== undefined && k !== startKey) {
        const py = Math.floor(k / regionSize);
        const px = k - py * regionSize;
        path.unshift({ x: px, y: py });
        k = parentMap.get(k)!;
      }
      path.unshift({ x: startX, y: startY });
      return path;
    }

    const curG = gMap.get(curKey) ?? 0;

    for (const [ddx, ddy] of dirs) {
      const nx = current.x + ddx;
      const ny = current.y + ddy;
      if (nx < 0 || nx >= regionSize || ny < 0 || ny >= regionSize) continue;
      const nKey = key(nx, ny);
      if (closed.has(nKey)) continue;

      const cell = cells[ny]?.[nx];
      if (!cell || cell.baseTerrain === 'water') continue;

      const moveCost = cell.movementCost;
      const dist = (ddx !== 0 && ddy !== 0) ? 1.414 : 1;
      const g = curG + dist * moveCost;

      const existingG = gMap.get(nKey);
      if (existingG !== undefined && g >= existingG) continue;

      gMap.set(nKey, g);
      parentMap.set(nKey, curKey);
      open.push({ x: nx, y: ny, f: g + heuristic(nx, ny) });
    }
  }

  return null; // No path found
}

export function generateRegionRoads(ctx: RegionGenerationContext): void {
  const { cells, cities, regionX, regionY } = ctx;
  const roads: GeneratedRoad[] = [];

  const regionSize = cells.length;
  const ox = ctx.worldOrigin.globalX;
  const oy = ctx.worldOrigin.globalY;

  if (cities.length === 0) {
    ctx.roads = roads;
    return;
  }

  if (cities.length === 1) {
    const city = cities[0];
    const start = toLocal(city, ox, oy, regionSize);
    const targets = getNearestEdgeTargets(start, regionSize);

    for (let i = 0; i < targets.length; i++) {
      const path = paintRoadPath(cells, regionSize, start, targets[i], ox, oy, 'secondary_road');
      if (path.length > 1) {
        roads.push({
          id: `road_${regionX}_${regionY}_exit_${i}`,
          type: 'secondary',
          fromId: city.id,
          toId: `region_edge_${i}`,
          path,
        });
      }
    }

    ctx.roads = roads;
    return;
  }

  const edges = buildMinimumRoadNetwork(cities);
  for (const [fromIndex, toIndex] of edges) {
    const from = cities[fromIndex];
    const to = cities[toIndex];
    const start = toLocal(from, ox, oy, regionSize);
    const end = toLocal(to, ox, oy, regionSize);
    const roadType = from.rank === 'regional' && to.rank === 'regional' ? 'main' : 'secondary';
    const feature = roadType === 'main' ? 'main_road' : 'secondary_road';
    const path = paintRoadPath(cells, regionSize, start, end, ox, oy, feature);

    if (path.length > 1) {
      roads.push({
        id: `road_${regionX}_${regionY}_${fromIndex}_${toIndex}`,
        type: roadType,
        fromId: from.id,
        toId: to.id,
        path,
      });
    }
  }

  ctx.roads = roads;
}

function toLocal(city: GeneratedCity, ox: number, oy: number, regionSize: number): { x: number; y: number } {
  return {
    x: clampLocal(city.center.globalX - ox, regionSize),
    y: clampLocal(city.center.globalY - oy, regionSize),
  };
}

function clampLocal(value: number, regionSize: number): number {
  return Math.max(0, Math.min(regionSize - 1, Math.round(value)));
}

function getNearestEdgeTargets(start: { x: number; y: number }, regionSize: number): Array<{ x: number; y: number }> {
  const horizontal = start.x <= regionSize - 1 - start.x
    ? { x: 0, y: start.y }
    : { x: regionSize - 1, y: start.y };
  const vertical = start.y <= regionSize - 1 - start.y
    ? { x: start.x, y: 0 }
    : { x: start.x, y: regionSize - 1 };
  return [horizontal, vertical];
}

function paintRoadPath(
  cells: WorldCell[][],
  regionSize: number,
  start: { x: number; y: number },
  end: { x: number; y: number },
  ox: number,
  oy: number,
  feature: 'main_road' | 'secondary_road',
): WorldPosition[] {
  const pathResult = aStarRoadWithPath(cells, regionSize, start.x, start.y, end.x, end.y);
  const localPath = pathResult ?? buildStraightPath(start, end, regionSize);
  const path: WorldPosition[] = [];

  for (const pt of localPath) {
    const cell = cells[pt.y]?.[pt.x];
    if (!cell || cell.baseTerrain === 'water') continue;
    if (!cell.features.includes(feature)) cell.features.push(feature);
    path.push({ globalX: ox + pt.x, globalY: oy + pt.y });
  }

  return path;
}

function buildStraightPath(
  start: { x: number; y: number },
  end: { x: number; y: number },
  regionSize: number,
): Array<{ x: number; y: number }> {
  const dist = Math.sqrt((end.x - start.x) * (end.x - start.x) + (end.y - start.y) * (end.y - start.y));
  const steps = Math.max(1, Math.ceil(dist));
  const path: Array<{ x: number; y: number }> = [];

  for (let s = 0; s <= steps; s++) {
    const t = s / steps;
    path.push({
      x: clampLocal(start.x + (end.x - start.x) * t, regionSize),
      y: clampLocal(start.y + (end.y - start.y) * t, regionSize),
    });
  }

  return path;
}

function buildMinimumRoadNetwork(cities: GeneratedCity[]): Array<[number, number]> {
  const connected = new Set<number>([0]);
  const edges: Array<[number, number]> = [];

  while (connected.size < cities.length) {
    let best: [number, number] | null = null;
    let bestDistance = Number.POSITIVE_INFINITY;

    for (const fromIndex of connected) {
      for (let toIndex = 0; toIndex < cities.length; toIndex++) {
        if (connected.has(toIndex)) continue;
        const distance = cityDistance(cities[fromIndex], cities[toIndex]);
        if (distance < bestDistance) {
          bestDistance = distance;
          best = [fromIndex, toIndex];
        }
      }
    }

    if (!best) break;
    edges.push(best);
    connected.add(best[1]);
  }

  return edges;
}

function cityDistance(a: GeneratedCity, b: GeneratedCity): number {
  const dx = a.center.globalX - b.center.globalX;
  const dy = a.center.globalY - b.center.globalY;
  return Math.sqrt(dx * dx + dy * dy);
}
