'use client';

import React, { useRef, useEffect, useCallback } from 'react';
import type { WorldMap, WorldCell, WorldTerrainType, WorldFeatureType } from '@/game/world-map-types';

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

const FEATURE_COLORS: Record<string, string> = {
  river: 'rgba(33,150,243,0.5)',
  main_road: 'rgba(255,220,100,0.6)',
  secondary_road: 'rgba(200,180,100,0.4)',
  bridge: 'rgba(212,160,23,0.8)',
  city_center: 'rgba(255,50,50,0.7)',
  fortress: 'rgba(84,110,122,0.7)',
  airfield: 'rgba(255,255,255,0.5)',
  supply_depot: 'rgba(0,200,100,0.5)',
};

interface WorldMapCanvasProps {
  worldMap: WorldMap;
  viewRect: { x: number; y: number; width: number; height: number };
  cellSize: number;
  onCellClick?: (pos: { x: number; y: number }) => void;
  showFeatures?: boolean;
}

export default function WorldMapCanvas({ worldMap, viewRect, cellSize, onCellClick, showFeatures = true }: WorldMapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Draw the visible portion
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const { x: rx, y: ry, width: rw, height: rh } = viewRect;
    canvas.width = rw * cellSize;
    canvas.height = rh * cellSize;

    // Draw terrain base
    for (let dy = 0; dy < rh; dy++) {
      for (let dx = 0; dx < rw; dx++) {
        const wx = rx + dx;
        const wy = ry + dy;
        if (wx < 0 || wx >= worldMap.width || wy < 0 || wy >= worldMap.height) continue;
        const cell = worldMap.cells[wy][wx];
        const color = TERRAIN_COLORS[cell.baseTerrain] || '#333';
        ctx.fillStyle = color;
        ctx.fillRect(dx * cellSize, dy * cellSize, cellSize, cellSize);

        // Draw features overlay
        if (showFeatures && cellSize >= 3) {
          for (const f of cell.features) {
            const fc = FEATURE_COLORS[f];
            if (fc) {
              ctx.fillStyle = fc;
              ctx.fillRect(dx * cellSize, dy * cellSize, cellSize, cellSize);
            }
          }
          // City center marker
          if (cell.features.includes('city_center') && cellSize >= 4) {
            ctx.fillStyle = '#ff3333';
            ctx.font = `${Math.max(6, cellSize - 2)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('★', dx * cellSize + cellSize / 2, dy * cellSize + cellSize / 2);
          }
          // Bridge marker
          if (cell.features.includes('bridge') && cellSize >= 4) {
            ctx.fillStyle = '#d4a017';
            ctx.font = `${Math.max(6, cellSize - 2)}px sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('≋', dx * cellSize + cellSize / 2, dy * cellSize + cellSize / 2);
          }
        }
      }
    }
  }, [worldMap, viewRect, cellSize, showFeatures]);

  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onCellClick) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = Math.floor((e.clientX - rect.left) / cellSize) + viewRect.x;
    const y = Math.floor((e.clientY - rect.top) / cellSize) + viewRect.y;
    onCellClick({ x, y });
  }, [onCellClick, viewRect, cellSize]);

  return (
    <canvas
      ref={canvasRef}
      onClick={handleClick}
      style={{ cursor: onCellClick ? 'pointer' : 'default', imageRendering: 'pixelated' }}
    />
  );
}
