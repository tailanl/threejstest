import { StrategicGenContext, create2DArray, forEachCell } from './gen-context';

export function classifyWaterBodies(ctx: StrategicGenContext, seaLevel: number): void {
  const { width, height, elevation } = ctx;

  forEachCell(width, height, (x, y) => {
    ctx.waterMask[y][x] = elevation[y][x] <= seaLevel;
  });

  // Flood fill from edges to find ocean
  const visited = create2DArray(width, height, () => false);
  const queue: [number, number][] = [];

  for (let x = 0; x < width; x++) {
    if (ctx.waterMask[0][x]) { queue.push([x, 0]); visited[0][x] = true; }
    if (ctx.waterMask[height - 1][x]) { queue.push([x, height - 1]); visited[height - 1][x] = true; }
  }
  for (let y = 0; y < height; y++) {
    if (ctx.waterMask[y][0]) { queue.push([0, y]); visited[y][0] = true; }
    if (ctx.waterMask[y][width - 1]) { queue.push([width - 1, y]); visited[y][width - 1] = true; }
  }

  while (queue.length > 0) {
    const [cx, cy] = queue.shift()!;
    ctx.oceanMask[cy][cx] = true;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0) continue;
        const nx = cx + dx, ny = cy + dy;
        if (nx >= 0 && nx < width && ny >= 0 && ny < height && !visited[ny][nx] && ctx.waterMask[ny][nx]) {
          visited[ny][nx] = true;
          queue.push([nx, ny]);
        }
      }
    }
  }

  // Lakes = water that's not ocean
  forEachCell(width, height, (x, y) => {
    ctx.lakeMask[y][x] = ctx.waterMask[y][x] && !ctx.oceanMask[y][x];
  });

  removeTinyLakes(ctx, 4);
}

function removeTinyLakes(ctx: StrategicGenContext, minSize: number): void {
  const { width, height, lakeMask } = ctx;
  const visited = create2DArray(width, height, () => false);

  forEachCell(width, height, (x, y) => {
    if (!lakeMask[y][x] || visited[y][x]) return;

    const cells: [number, number][] = [];
    const queue: [number, number][] = [[x, y]];
    visited[y][x] = true;

    while (queue.length > 0) {
      const [cx, cy] = queue.shift()!;
      cells.push([cx, cy]);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = cx + dx, ny = cy + dy;
          if (nx >= 0 && nx < width && ny >= 0 && ny < height && !visited[ny][nx] && lakeMask[ny][nx]) {
            visited[ny][nx] = true;
            queue.push([nx, ny]);
          }
        }
      }
    }

    if (cells.length < minSize) {
      for (const [lx, ly] of cells) {
        lakeMask[ly][lx] = false;
        ctx.waterMask[ly][lx] = false;
        ctx.elevation[ly][lx] = ctx.elevation[ly][lx] + 0.02; // slightly raise
      }
    }
  });
}
