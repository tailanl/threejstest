import { create2DArray } from './gen-context';

export function computeSlope(elevation: number[][]): number[][] {
  const height = elevation.length;
  const width = elevation[0].length;
  const slope = create2DArray(width, height, () => 0);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const h0 = elevation[y][x];
      let maxDiff = 0;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          maxDiff = Math.max(maxDiff, Math.abs(h0 - elevation[ny][nx]));
        }
      }
      slope[y][x] = maxDiff;
    }
  }
  return slope;
}
