/**
 * 视线计算 (Line of Sight)
 */

import type { WorldCell } from '../world-map/world-cell-types';

export interface LOSResult {
  hasLOS: boolean;
  blockedBy?: { x: number; y: number };
  blockingTerrain?: string;
  quality: 'clear' | 'partial' | 'blocked';
}

export function calculateLOS(
  cells: WorldCell[][],
  from: { x: number; y: number },
  to: { x: number; y: number },
  viewerHeight: number = 2,
  targetHeight: number = 2
): LOSResult {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.sqrt(dx * dx + dy * dy);

  if (dist < 1) return { hasLOS: true, quality: 'clear' };

  const steps = Math.ceil(dist * 2);
  const stepX = dx / steps;
  const stepY = dy / steps;

  const fromElev = (cells[from.y]?.[from.x]?.elevation ?? 0) + viewerHeight / 10;
  const toElev = (cells[to.y]?.[to.x]?.elevation ?? 0) + targetHeight / 10;

  for (let i = 1; i < steps; i++) {
    const cx = Math.round(from.x + stepX * i);
    const cy = Math.round(from.y + stepY * i);

    if (cy < 0 || cy >= cells.length || cx < 0 || cx >= (cells[cy]?.length ?? 0)) continue;

    const cell = cells[cy][cx];
    const t = i / steps;
    const expectedElev = fromElev + (toElev - fromElev) * t;
    const terrainElev = cell.elevation + getVisionBlockHeight(cell);

    if (terrainElev > expectedElev) {
      return {
        hasLOS: false,
        blockedBy: { x: cx, y: cy },
        blockingTerrain: cell.baseTerrain,
        quality: 'blocked',
      };
    }
  }

  // Check for partial cover at target
  const targetCell = cells[to.y]?.[to.x];
  if (targetCell && (targetCell.baseTerrain === 'forest' || targetCell.features.includes('urban_block'))) {
    return { hasLOS: true, quality: 'partial' };
  }

  return { hasLOS: true, quality: 'clear' };
}

function getVisionBlockHeight(cell: WorldCell): number {
  switch (cell.baseTerrain) {
    case 'mountain': return 0.3;
    case 'highland': return 0.15;
    case 'forest': return 0.1;
    case 'city': return 0.2;
    default: return 0;
  }
}

export function getVisibleCells(
  cells: WorldCell[][],
  center: { x: number; y: number },
  range: number,
  viewerHeight: number = 2
): Array<{ x: number; y: number; quality: 'clear' | 'partial' | 'blocked' }> {
  const result: Array<{ x: number; y: number; quality: 'clear' | 'partial' | 'blocked' }> = [];

  for (let dy = -range; dy <= range; dy++) {
    for (let dx = -range; dx <= range; dx++) {
      if (dx * dx + dy * dy > range * range) continue;
      const tx = center.x + dx;
      const ty = center.y + dy;
      if (ty < 0 || ty >= cells.length || tx < 0 || tx >= (cells[ty]?.length ?? 0)) continue;

      const los = calculateLOS(cells, center, { x: tx, y: ty }, viewerHeight);
      if (los.hasLOS) {
        result.push({ x: tx, y: ty, quality: los.quality });
      }
    }
  }

  return result;
}
