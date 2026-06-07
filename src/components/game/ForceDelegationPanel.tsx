'use client';

import React from 'react';
import type { ForceCommandState } from '@/game/command/command-types';

interface ForceDelegationPanelProps {
  forceStates: ForceCommandState[];
  onDelegate: (forceId: string, autonomy: ForceCommandState['autonomy'], risk: ForceCommandState['riskTolerance']) => void;
  onRecall: (forceId: string) => void;
}

export default function ForceDelegationPanel({ forceStates, onDelegate, onRecall }: ForceDelegationPanelProps) {
  return (
    <div className="bg-gray-900/80 border border-white/10 rounded-xl p-4 space-y-3">
      <h2 className="text-lg font-semibold text-white/90">🎖️ Force Delegation</h2>

      <div className="space-y-2 max-h-64 overflow-y-auto">
        {forceStates.map(fs => (
          <div key={fs.forceId} className="bg-black/30 rounded p-2 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-white/80">{fs.forceId}</span>
              <span className={`text-xs px-1.5 py-0.5 rounded ${fs.controller === 'player_direct' ? 'bg-blue-800 text-blue-200' : 'bg-purple-800 text-purple-200'}`}>{fs.controller}</span>
            </div>

            {fs.controller === 'player_direct' ? (
              <div className="flex gap-2 items-center">
                <select onChange={e => {}} className="text-xs bg-gray-800 text-white rounded px-1 py-0.5" defaultValue={fs.autonomy}>
                  <option value="strict">Strict</option>
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                </select>
                <select onChange={e => {}} className="text-xs bg-gray-800 text-white rounded px-1 py-0.5" defaultValue={fs.riskTolerance}>
                  <option value="low">Low Risk</option>
                  <option value="medium">Medium</option>
                  <option value="high">High Risk</option>
                </select>
                <button onClick={() => onDelegate(fs.forceId, fs.autonomy, fs.riskTolerance)} className="px-2 py-0.5 rounded text-xs bg-purple-800 text-purple-200 hover:bg-purple-700 cursor-pointer">
                  Delegate to AI
                </button>
              </div>
            ) : (
              <div className="flex gap-2 items-center">
                <span className="text-xs text-white/40">Auto: {fs.autonomy} | Risk: {fs.riskTolerance}</span>
                <button onClick={() => onRecall(fs.forceId)} className="px-2 py-0.5 rounded text-xs bg-blue-800 text-blue-200 hover:bg-blue-700 cursor-pointer">
                  Recall
                </button>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
