'use client';

import React from 'react';
import type { OperationView } from '@/game/world-view/operation-view';
import type { WorldPosition } from '@/game/world-atlas/atlas-types';

const TERRAIN_COLORS: Record<string, string> = {
  plains: '#82e0aa',
  forest: '#1e8449',
  mountain: '#7f8c8d',
  water: '#1a5276',
  desert: '#f9e79f',
  marshland: '#76d7c4',
  highland: '#aeb6bf',
  city: '#f0b27a',
};

interface OperationViewPanelProps {
  operationView: OperationView | null;
  onClose: () => void;
  onCellClick?: (pos: WorldPosition) => void;
}

export default function OperationViewPanel({ operationView, onClose, onCellClick }: OperationViewPanelProps) {
  if (!operationView) return null;

  const cells = operationView.cells;
  const hasGrid = cells.length > 0 && cells[0]?.length > 0;

  return (
    <div className="bg-gray-900/80 border border-cyan-500/20 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-cyan-300/90">🎯 Operation View</h2>
        <button onClick={onClose} className="px-2 py-1 rounded text-xs bg-gray-700 text-gray-400 hover:bg-gray-600 cursor-pointer">✕</button>
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs text-white/60">
        <div>Area: {operationView.worldRect.width}×{operationView.worldRect.height}</div>
        <div>Chunks: {operationView.involvedChunks.length}</div>
        <div>Objectives: {operationView.objectives.length}</div>
        <div>Enemy: {operationView.knownEnemyForces.length}</div>
        <div>Friendly: {operationView.friendlyForces.length}</div>
        <div>Supply Lines: {operationView.supplyLines.length}</div>
      </div>

      {/* Clickable cell grid */}
      {hasGrid && (
        <div className="overflow-auto max-h-96 border border-gray-700 rounded">
          <div
            className="grid"
            style={{
              gridTemplateColumns: `repeat(${cells[0].length}, 12px)`,
              width: 'fit-content',
            }}
          >
            {cells.flatMap((row, rIdx) =>
              row.map((cell, cIdx) => {
                const color = TERRAIN_COLORS[cell.baseTerrain as string] ?? '#555';
                const hasFeature = cell.features?.length > 0;
                return (
                  <div
                    key={`${rIdx}_${cIdx}`}
                    title={`(${cell.globalX},${cell.globalY}) ${cell.baseTerrain}${hasFeature ? ' ' + cell.features?.join(',') : ''}`}
                    className="cursor-pointer hover:outline hover:outline-1 hover:outline-white"
                    style={{
                      width: 12,
                      height: 12,
                      backgroundColor: color,
                      border: onCellClick ? '0.5px solid rgba(255,255,255,0.05)' : 'none',
                    }}
                    onClick={() => {
                      if (onCellClick) {
                        onCellClick({ globalX: cell.globalX, globalY: cell.globalY });
                      }
                    }}
                  />
                );
              })
            )}
          </div>
        </div>
      )}

      {operationView.objectives.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs text-white/50 font-semibold">Objectives:</div>
          {operationView.objectives.map(obj => (
            <div key={obj.id} className="text-xs text-white/60 bg-black/20 rounded px-2 py-1">
              <span className={`font-semibold ${obj.priority === 'primary' ? 'text-yellow-300' : obj.priority === 'secondary' ? 'text-blue-300' : 'text-gray-400'}`}>{obj.priority}</span> {obj.type.replace(/_/g, ' ')}
            </div>
          ))}
        </div>
      )}

      {operationView.aiPlans.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs text-white/50 font-semibold">AI Plans:</div>
          {operationView.aiPlans.map(plan => (
            <div key={plan.id} className="text-xs text-white/60 bg-black/20 rounded px-2 py-1">
              Phase: {plan.phase} | Forces: {plan.forces.length} | ETA: {plan.estimatedDuration}t
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
