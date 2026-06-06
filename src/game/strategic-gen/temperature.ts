import { StrategicGenContext, create2DArray, forEachCell, clamp01 } from './gen-context';

export function computeTemperature(ctx: StrategicGenContext): number[][] {
  const temperature = create2DArray(ctx.width, ctx.height, () => 0);

  forEachCell(ctx.width, ctx.height, (x, y) => {
    const latitudeFactor = 1 - y / Math.max(1, ctx.height - 1);
    const elevationPenalty = ctx.elevation[y][x] * 0.25;
    const noise = ctx.rng.next() * 0.05;
    temperature[y][x] = clamp01(latitudeFactor - elevationPenalty + noise);
  });

  return temperature;
}
