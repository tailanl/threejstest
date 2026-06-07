/**
 * 道路生成 - 使用简化 A* 在城市间寻路
 */

import type { WorldPosition } from '../world-atlas/atlas-types';
import type { RegionGenerationContext, GeneratedRoad } from './world-map-types';
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
        const px = k % regionSize;
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
  const { cells, cities, regionX, regionY, rng } = ctx;
  const roads: GeneratedRoad[] = [];
  if (cities.length < 2) {
    ctx.roads = roads;
    return;
  }

  const regionSize = cells.length;
  const ox = ctx.worldOrigin.globalX;
  const oy = ctx.worldOrigin.globalY;

  // Connect cities with A*
  for (let i = 0; i < cities.length; i++) {
    for (let j = i + 1; j < cities.length; j++) {
      const from = cities[i];
      const to = cities[j];

      const fx = from.center.globalX - ox;
      const fy = from.center.globalY - oy;
      const tx = to.center.globalX - ox;
      const ty = to.center.globalY - oy;

      const roadType = (from.rank === 'regional' || to.rank === 'regional') ? 'main' : 'secondary';
      const feature = roadType === 'main' ? 'main_road' : 'secondary_road';

      // Try A* pathfinding
      const pathResult = aStarRoadWithPath(cells, regionSize, fx, fy, tx, ty);

      const path: WorldPosition[] = [];
      if (pathResult) {
        for (const pt of pathResult) {
          const cell = cells[pt.y]?.[pt.x];
          if (!cell) continue;
          if (!cell.features.includes(feature)) cell.features.push(feature);
          path.push({ globalX: ox + pt.x, globalY: oy + pt.y });
        }
      } else {
        // Fallback: straight line
        const dist = Math.sqrt((tx - fx) * (tx - fx) + (ty - fy) * (ty - fy));
        const steps = Math.ceil(dist);
        for (let s = 0; s <= steps; s++) {
          const t = s / steps;
          const x = Math.round(fx + (tx - fx) * t);
          const y = Math.round(fy + (ty - fy) * t);
          if (x < 0 || x >= regionSize || y < 0 || y >= regionSize) continue;
          const cell = cells[y]?.[x];
          if (!cell || cell.baseTerrain === 'water') continue;
          if (!cell.features.includes(feature)) cell.features.push(feature);
          path.push({ globalX: ox + x, globalY: oy + y });
        }
      }

      if (path.length > 1) {
        roads.push({
          id: `road_${regionX}_${regionY}_${i}_${j}`,
          type: roadType,
          fromId: from.id,
          toId: to.id,
          path,
        });
      }
    }
  }

  ctx.roads = roads;
}
