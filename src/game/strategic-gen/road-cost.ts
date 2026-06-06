import { StrategicGenContext, GenPosition, create2DArray, forEachCell } from './gen-context';

function distanceToRiver(x: number, y: number, ctx: StrategicGenContext): number {
  if (ctx.riverLayer[y][x].isRiver) return 0;
  for (let r = 1; r <= 6; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < ctx.width && ny >= 0 && ny < ctx.height) {
          if (ctx.riverLayer[ny][nx].isRiver) return r;
        }
      }
    }
  }
  return 999;
}

function getRoadCostAt(x: number, y: number, ctx: StrategicGenContext): number {
  const terrain = ctx.baseTerrain[y][x];
  if (ctx.oceanMask[y][x]) return 9999;
  if (ctx.lakeMask[y][x]) return 999;

  let cost = 1;
  switch (terrain) {
    case 'plains': cost += 1; break;
    case 'highland': cost += 3; break;
    case 'forest': cost += 5; break;
    case 'desert': cost += 5; break;
    case 'marshland': cost += 10; break;
    case 'mountain': cost += 12; break;
    case 'water': cost += 999; break;
  }

  cost += ctx.slope[y][x] * 45;

  // City cells: very cheap for roads to pass through
  if (ctx.features[y][x].has('city')) cost = 0.5;

  const distRiver = distanceToRiver(x, y, ctx);
  if (distRiver > 0 && distRiver <= 2) cost -= 1.5;

  if (ctx.features[y][x].has('main_road')) cost -= 4;
  if (ctx.features[y][x].has('secondary_road')) cost -= 2;

  return Math.max(0.5, cost);
}

export function computeRoadCostMap(ctx: StrategicGenContext): number[][] {
  const cost = create2DArray(ctx.width, ctx.height, () => 1);
  forEachCell(ctx.width, ctx.height, (x, y) => {
    cost[y][x] = getRoadCostAt(x, y, ctx);
  });
  return cost;
}
