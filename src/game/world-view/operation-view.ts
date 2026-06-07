/**
 * OperationView - 战役视图，从 RegionTile 裁剪
 */

import type { WorldPosition } from '../world-atlas/atlas-types';
import type { WorldCell } from '../world-map/world-cell-types';
import type { StrategicChunk } from './strategic-chunks';
import type { RegionTile } from '../world-map/world-map-types';

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

  const startX = Math.max(0, center.globalX - Math.floor(width / 2));
  const startY = Math.max(0, center.globalY - Math.floor(height / 2));
  const endX = Math.min(regionTile.width, startX + width);
  const endY = Math.min(regionTile.height, startY + height);

  const cells: WorldCell[][] = [];
  for (let y = startY; y < endY; y++) {
    const row: WorldCell[] = [];
    for (let x = startX; x < endX; x++) {
      if (y < regionTile.cells.length && x < regionTile.cells[y].length) {
        row.push(regionTile.cells[y][x]);
      }
    }
    cells.push(row);
  }

  // Find involved chunks
  const involvedChunks: StrategicChunk[] = [];
  const chunkSize = 32;
  const startChunkX = Math.floor(startX / chunkSize);
  const startChunkY = Math.floor(startY / chunkSize);
  const endChunkX = Math.floor((endX - 1) / chunkSize);
  const endChunkY = Math.floor((endY - 1) / chunkSize);

  for (let cy = startChunkY; cy <= endChunkY; cy++) {
    for (let cx = startChunkX; cx <= endChunkX; cx++) {
      const chunk = regionTile.strategicChunks[cy]?.[cx];
      if (chunk) involvedChunks.push(chunk);
    }
  }

  return {
    id: `opview_${center.globalX}_${center.globalY}_${width}x${height}`,
    worldRect: { x: startX, y: startY, width: endX - startX, height: endY - startY },
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
