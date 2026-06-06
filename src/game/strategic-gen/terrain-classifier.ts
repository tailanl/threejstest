import { StrategicGenContext, StrategicBaseTerrainType, forEachCell, getNeighbors8, distance } from './gen-context';
import { create2DArray, clone2D } from './gen-context';

function distanceToRiverOrLake(x: number, y: number, ctx: StrategicGenContext): number {
  if (ctx.riverLayer[y][x].isRiver) return 0;
  if (ctx.lakeMask[y][x]) return 0;
  let minD = 999;
  for (let dy = -8; dy <= 8; dy++) {
    for (let dx = -8; dx <= 8; dx++) {
      const nx = x + dx, ny = y + dy;
      if (nx >= 0 && nx < ctx.width && ny >= 0 && ny < ctx.height) {
        if (ctx.riverLayer[ny][nx].isRiver || ctx.lakeMask[ny][nx]) {
          minD = Math.min(minD, Math.sqrt(dx * dx + dy * dy));
        }
      }
    }
  }
  return minD;
}

function pickMaxScore(scores: Record<string, number>): string {
  let best = '';
  let bestVal = -Infinity;
  for (const [key, val] of Object.entries(scores)) {
    if (val > bestVal) { bestVal = val; best = key; }
  }
  return best;
}

function classifyBaseTerrainAt(x: number, y: number, ctx: StrategicGenContext): StrategicBaseTerrainType {
  const elevation = ctx.elevation[y][x];
  const slope = ctx.slope[y][x];
  const moisture = ctx.moisture[y][x];
  const temperature = ctx.temperature[y][x];

  if (ctx.waterMask[y][x]) return 'water';

  const distRW = distanceToRiverOrLake(x, y, ctx);
  const distBonus = Math.max(0, 1 - distRW / 8);

  const scores: Record<string, number> = {
    mountain: elevation * 70 + slope * 130 - moisture * 8,
    highland: elevation * 55 + slope * 45 - Math.abs(moisture - 0.45) * 10,
    forest: moisture * 80 + temperature * 15 - slope * 25 - Math.max(0, elevation - 0.75) * 30,
    marshland: moisture * 90 - slope * 120 + distBonus * 25 - elevation * 15,
    desert: (1 - moisture) * 85 + temperature * 25 - distBonus * 20,
    plains: 55 - slope * 85 - Math.abs(elevation - 0.42) * 35 + moisture * 10,
  };

  return pickMaxScore(scores) as StrategicBaseTerrainType;
}

export function classifyBaseTerrains(ctx: StrategicGenContext): StrategicBaseTerrainType[][] {
  const result = create2DArray(ctx.width, ctx.height, () => 'plains' as StrategicBaseTerrainType);
  forEachCell(ctx.width, ctx.height, (x, y) => {
    result[y][x] = classifyBaseTerrainAt(x, y, ctx);
  });
  return result;
}

export function smoothBaseTerrain(ctx: StrategicGenContext, iterations: number = 3): void {
  for (let i = 0; i < iterations; i++) {
    const next = clone2D(ctx.baseTerrain);
    forEachCell(ctx.width, ctx.height, (x, y) => {
      if (ctx.waterMask[y][x]) return;
      const neighbors = getNeighbors8({ x, y }, ctx.width, ctx.height);
      const counts: Record<string, number> = {};
      for (const n of neighbors) {
        const t = ctx.baseTerrain[n.y][n.x];
        counts[t] = (counts[t] || 0) + 1;
      }
      const current = ctx.baseTerrain[y][x];
      if ((counts[current] || 0) <= 1) {
        let dominant: StrategicBaseTerrainType = current;
        let maxCount = 0;
        for (const [t, c] of Object.entries(counts)) {
          if (t !== 'water' && c > maxCount) { maxCount = c; dominant = t as StrategicBaseTerrainType; }
        }
        next[y][x] = dominant;
      }
    });
    ctx.baseTerrain = next;
  }
}
