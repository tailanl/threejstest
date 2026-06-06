import { StrategicGenContext, create2DArray, forEachCell, clamp01 } from './gen-context';

function computeDistanceToWater(ctx: StrategicGenContext): number[][] {
  const { width, height, waterMask, riverLayer } = ctx;
  const dist = create2DArray(width, height, () => 999);

  // BFS from water and river cells
  const queue: [number, number][] = [];
  forEachCell(width, height, (x, y) => {
    if (waterMask[y][x] || riverLayer[y][x].isRiver) {
      dist[y][x] = 0;
      queue.push([x, y]);
    }
  });

  while (queue.length > 0) {
    const [cx, cy] = queue.shift()!;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cx + dx, ny = cy + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          const nd = dist[cy][cx] + (dx !== 0 && dy !== 0 ? 1.414 : 1);
          if (nd < dist[ny][nx]) {
            dist[ny][nx] = nd;
            queue.push([nx, ny]);
          }
        }
      }
    }
  }

  return dist;
}

export function computeInitialMoisture(ctx: StrategicGenContext): number[][] {
  return create2DArray(ctx.width, ctx.height, () => 0.5);
}

export function computeMoisture(ctx: StrategicGenContext): number[][] {
  const distToWater = computeDistanceToWater(ctx);
  const moisture = create2DArray(ctx.width, ctx.height, () => 0);

  forEachCell(ctx.width, ctx.height, (x, y) => {
    const d = distToWater[y][x];
    const waterMoisture = Math.exp(-d / 8);
    const elevationPenalty = ctx.elevation[y][x] > 0.75 ? 0.18 : 0;
    const noise = ctx.rng.next() * 0.06;
    moisture[y][x] = clamp01(waterMoisture - elevationPenalty + noise);
  });

  return moisture;
}
