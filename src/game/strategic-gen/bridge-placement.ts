import { StrategicGenContext, GenPosition, forEachCell, getNeighbors8 } from './gen-context';
import { StrategicGenConfig } from './strategic-gen-config';

function isNearCity(pos: GenPosition, ctx: StrategicGenContext, radius: number): boolean {
  return ctx.cities.some(c =>
    Math.abs(c.position.x - pos.x) + Math.abs(c.position.y - pos.y) <= radius
  );
}

function removeRoadAt(x: number, y: number, ctx: StrategicGenContext): void {
  ctx.features[y][x].delete('main_road');
  ctx.features[y][x].delete('secondary_road');
  ctx.features[y][x].delete('bridge');
}

export function placeBridges(ctx: StrategicGenContext, config: StrategicGenConfig): void {
  forEachCell(ctx.width, ctx.height, (x, y) => {
    const hasRoad = ctx.features[y][x].has('main_road') || ctx.features[y][x].has('secondary_road');
    const river = ctx.riverLayer[y][x];
    if (!hasRoad || !river.isRiver) return;

    if (river.width <= config.roads.bridgeMaxRiverWidth) {
      ctx.features[y][x].add('bridge');
      return;
    }

    const strategicCrossing = isNearCity({ x, y }, ctx, 4) || ctx.chokepointValue[y][x] > 0.65;
    if (strategicCrossing) {
      ctx.features[y][x].add('bridge');
    } else {
      removeRoadAt(x, y, ctx);
    }
  });
}
