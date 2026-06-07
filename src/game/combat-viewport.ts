/** @deprecated Use directory equivalents under src/game/world-map/ and src/game/world-view/ instead */
import type { WorldMap, CombatViewport } from './world-map-types';

export function getCombatViewport(params: {
  worldMap: WorldMap;
  center: { x: number; y: number };
  width: number;
  height: number;
}): CombatViewport {
  const { worldMap, center, width, height } = params;

  // Calculate rect centered on center
  const rectX = center.x - width / 2;
  const rectY = center.y - height / 2;

  // Clamp to world bounds
  const clampedX = Math.max(0, Math.min(rectX, worldMap.width - width));
  const clampedY = Math.max(0, Math.min(rectY, worldMap.height - height));

  const worldRect = {
    x: clampedX,
    y: clampedY,
    width,
    height,
  };

  // Extract cells from world map, clamped to bounds
  const startX = Math.max(0, Math.floor(clampedX));
  const startY = Math.max(0, Math.floor(clampedY));
  const endX = Math.min(worldMap.width, Math.ceil(clampedX + width));
  const endY = Math.min(worldMap.height, Math.ceil(clampedY + height));

  const cells: CombatViewport['cells'] = [];
  for (let dy = startY; dy < endY; dy++) {
    const row: CombatViewport['cells'][number] = [];
    for (let dx = startX; dx < endX; dx++) {
      if (dy >= 0 && dy < worldMap.height && dx >= 0 && dx < worldMap.width) {
        row.push(worldMap.cells[dy][dx]);
      }
    }
    cells.push(row);
  }

  return {
    id: `combat_${Math.round(clampedX)}_${Math.round(clampedY)}_${width}x${height}`,
    worldRect,
    cells,
    center: {
      x: clampedX + width / 2,
      y: clampedY + height / 2,
    },
    scale: 'combat',
  };
}
