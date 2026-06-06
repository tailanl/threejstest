import type { WorldMap, WorldCell, OperationView } from './world-map-types';

export function getWorldCellsInRect(
  worldMap: WorldMap,
  rect: { x: number; y: number; width: number; height: number },
): WorldCell[][] {
  const startX = Math.max(0, Math.floor(rect.x));
  const startY = Math.max(0, Math.floor(rect.y));
  const endX = Math.min(worldMap.width, Math.ceil(rect.x + rect.width));
  const endY = Math.min(worldMap.height, Math.ceil(rect.y + rect.height));

  const rows = endY - startY;
  const cols = endX - startX;

  const result: WorldCell[][] = [];

  for (let dy = 0; dy < rows; dy++) {
    const row: WorldCell[] = [];
    for (let dx = 0; dx < cols; dx++) {
      const wy = startY + dy;
      const wx = startX + dx;
      if (wy >= 0 && wy < worldMap.height && wx >= 0 && wx < worldMap.width) {
        row.push(worldMap.cells[wy][wx]);
      }
    }
    result.push(row);
  }

  return result;
}

export function getOperationView(params: {
  worldMap: WorldMap;
  center: { x: number; y: number };
  width: number;
  height: number;
}): OperationView {
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

  const cells = getWorldCellsInRect(worldMap, worldRect);

  // Build sourceChunkIds from overlapping chunks
  const sourceChunkIds: string[] = [];
  const chunkSize = worldMap.chunkSize;
  const startChunkX = Math.floor(clampedX / chunkSize);
  const startChunkY = Math.floor(clampedY / chunkSize);
  const endChunkX = Math.floor((clampedX + width - 1) / chunkSize);
  const endChunkY = Math.floor((clampedY + height - 1) / chunkSize);

  for (let cy = startChunkY; cy <= endChunkY; cy++) {
    for (let cx = startChunkX; cx <= endChunkX; cx++) {
      if (cy >= 0 && cy < worldMap.chunks.length && cx >= 0 && cx < worldMap.chunks[0].length) {
        sourceChunkIds.push(worldMap.chunks[cy][cx].id);
      }
    }
  }

  return {
    id: `opview_${Math.round(clampedX)}_${Math.round(clampedY)}_${width}x${height}`,
    worldRect,
    cells,
    sourceChunkIds,
    center: {
      x: clampedX + width / 2,
      y: clampedY + height / 2,
    },
    scale: 'operation',
  };
}
