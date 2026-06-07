/**
 * OperationView - 战役视图，从 RegionTile 裁剪
 */

import type { WorldPosition } from '../world-atlas/atlas-types';
import type { WorldCell } from '../world-map/world-cell-types';
import type { StrategicChunk } from './strategic-chunks';
import type { RegionTile } from '../world-map/world-map-types';
import { getClampedLocalViewRect } from './view-rect-utils';

export interface OperationObjective {
  id: string;
  type: 'capture_city' | 'hold_bridge' | 'secure_road' | 'defend_area' | 'destroy_enemy';
  position: WorldPosition;
  radius: number;
  priority: 'primary' | 'secondary' | 'tertiary';
}

export interface EnemyEstimate {
  unitType: string;
  estimatedCount: number;
  confidence: 'confirmed' | 'estimated' | 'unknown';
  lastSeenPosition: WorldPosition;
  lastSeenTurn: number;
}

export interface ForceMarker {
  forceId: string;
  faction: 'red' | 'blue' | 'neutral';
  position: WorldPosition;
  unitCount: number;
  combatPower: number;
}

export interface SupplyLine {
  id: string;
  from: WorldPosition;
  to: WorldPosition;
  status: 'active' | 'disrupted' | 'cut';
}

export interface OperationPlan {
  id: string;
  phase: string;
  objectives: string[];
  forces: string[];
  estimatedDuration: number;
}

export interface OperationView {
  id: string;

  worldRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  cells: WorldCell[][];

  involvedChunks: StrategicChunk[];

  objectives: OperationObjective[];

  knownEnemyForces: EnemyEstimate[];

  friendlyForces: ForceMarker[];

  supplyLines: SupplyLine[];

  aiPlans: OperationPlan[];

  scale: 'operation';
}

export function getOperationViewForChunk(regionTile: RegionTile, chunk: StrategicChunk, viewSize: number): OperationView {
  const center: WorldPosition = {
    globalX: chunk.worldRect.x + Math.floor(chunk.worldRect.width / 2),
    globalY: chunk.worldRect.y + Math.floor(chunk.worldRect.height / 2),
  };
  return getOperationView({ regionTile, center, width: viewSize, height: viewSize });
}

export function getOperationView(params: {
  regionTile: RegionTile;
  center: WorldPosition;
  width: number;
  height: number;
}): OperationView {
  const { regionTile, center, width, height } = params;

  // Convert global center to local coordinates within the region tile
  const localCenterX = center.globalX - regionTile.worldOrigin.globalX;
  const localCenterY = center.globalY - regionTile.worldOrigin.globalY;

  const localRect = getClampedLocalViewRect({
    centerX: localCenterX,
    centerY: localCenterY,
    width,
    height,
    maxWidth: regionTile.width,
    maxHeight: regionTile.height,
  });

  const cells: WorldCell[][] = [];
  for (let y = localRect.y; y < localRect.y + localRect.height; y++) {
    const row: WorldCell[] = [];
    for (let x = localRect.x; x < localRect.x + localRect.width; x++) {
      if (y < regionTile.cells.length && x < regionTile.cells[y].length) {
        row.push(regionTile.cells[y][x]);
      }
    }
    cells.push(row);
  }

  // Find involved chunks
  const involvedChunks: StrategicChunk[] = [];
  const chunkSize = 32;
  const startChunkX = Math.floor(localRect.x / chunkSize);
  const startChunkY = Math.floor(localRect.y / chunkSize);
  const endChunkX = Math.floor((localRect.x + localRect.width - 1) / chunkSize);
  const endChunkY = Math.floor((localRect.y + localRect.height - 1) / chunkSize);

  for (let cy = startChunkY; cy <= endChunkY; cy++) {
    for (let cx = startChunkX; cx <= endChunkX; cx++) {
      const chunk = regionTile.strategicChunks[cy]?.[cx];
      if (chunk) involvedChunks.push(chunk);
    }
  }

  return {
    id: `opview_${center.globalX}_${center.globalY}_${width}x${height}`,
    worldRect: {
      x: regionTile.worldOrigin.globalX + localRect.x,
      y: regionTile.worldOrigin.globalY + localRect.y,
      width: localRect.width,
      height: localRect.height,
    },
    cells,
    involvedChunks,
    objectives: [],
    knownEnemyForces: [],
    friendlyForces: [],
    supplyLines: [],
    aiPlans: [],
    scale: 'operation',
  };
}
