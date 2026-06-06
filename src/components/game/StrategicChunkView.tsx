'use client';

import React from 'react';
import type { WorldMap, StrategicChunk, WorldTerrainType } from '@/game/world-map-types';

const TERRAIN_COLORS: Record<WorldTerrainType, string> = {
  plains: '#7cb342',
  forest: '#2e7d32',
  mountain: '#78909c',
  water: '#1565c0',
  desert: '#fdd835',
  marshland: '#5d4037',
  highland: '#a1887f',
  city: '#8d6e63',
};

interface StrategicChunkViewProps {
  worldMap: WorldMap;
  cellSize?: number;
  onChunkClick?: (chunkX: number, chunkY: number) => void;
  selectedChunk?: { x: number; y: number } | null;
}

export default function StrategicChunkView({ worldMap, cellSize = 12, onChunkClick, selectedChunk }: StrategicChunkViewProps) {
  const { chunks } = worldMap;
  const chunkCountX = chunks[0]?.length ?? 0;
  const chunkCountY = chunks.length;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-white/70">
        <span>🌍 Strategic View ({chunkCountX}×{chunkCountY} chunks)</span>
        <span>Click chunk to view area</span>
      </div>
      <div className="overflow-auto bg-black/30 rounded-lg p-2" style={{ maxHeight: '600px' }}>
        <div className="inline-grid" style={{
          gridTemplateColumns: `repeat(${chunkCountX}, ${cellSize}px)`,
          gridTemplateRows: `repeat(${chunkCountY}, ${cellSize}px)`,
          gap: '1px',
        }}>
          {chunks.flat().map((chunk, idx) => {
            const bgColor = TERRAIN_COLORS[chunk.dominantTerrain] || '#333';
            const isSelected = selectedChunk && selectedChunk.x === chunk.chunkX && selectedChunk.y === chunk.chunkY;

            return (
              <div
                key={chunk.id}
                onClick={() => onChunkClick?.(chunk.chunkX, chunk.chunkY)}
                style={{
                  width: `${cellSize}px`,
                  height: `${cellSize}px`,
                  backgroundColor: bgColor,
                  cursor: 'pointer',
                  outline: isSelected ? '2px solid #ff4444' : undefined,
                  outlineOffset: '-1px',
                  position: 'relative',
                }}
                title={`Chunk (${chunk.chunkX},${chunk.chunkY}) ${chunk.dominantTerrain}${chunk.features.hasCity ? ' 🏙️' : ''}${chunk.features.hasCapital ? ' ★' : ''}${chunk.features.hasRiver ? ' ~' : ''}${chunk.features.hasMainRoad ? ' ═' : ''}${chunk.features.hasBridge ? ' ≋' : ''}`}
              >
                {chunk.features.hasCapital && cellSize >= 8 && (
                  <div className="absolute inset-0 flex items-center justify-center text-yellow-300 font-bold" style={{ fontSize: `${Math.max(6, cellSize - 4)}px`, textShadow: '0 0 2px black' }}>★</div>
                )}
                {chunk.features.hasCity && !chunk.features.hasCapital && cellSize >= 8 && (
                  <div className="absolute inset-0 flex items-center justify-center text-white" style={{ fontSize: `${Math.max(4, cellSize - 4)}px`, textShadow: '0 0 2px black' }}>●</div>
                )}
              </div>
            );
          })}
        </div>
      </div>
      {/* Legend */}
      <div className="flex flex-wrap gap-2 text-xs text-white/50">
        {Object.entries(TERRAIN_COLORS).map(([k, v]) => (
          <span key={k} className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: v }}></span>
            {k}
          </span>
        ))}
        <span className="ml-2">★capital ●city ~river ═road ≋bridge</span>
      </div>
    </div>
  );
}
