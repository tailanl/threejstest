'use client';

import React from 'react';
import type { OperationView } from '@/game/world-view/operation-view';

interface OperationViewPanelProps {
  operationView: OperationView | null;
  onClose: () => void;
}

export default function OperationViewPanel({ operationView, onClose }: OperationViewPanelProps) {
  if (!operationView) return null;

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
