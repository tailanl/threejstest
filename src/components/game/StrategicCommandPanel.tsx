'use client';

import React from 'react';
import type { HQOrder, ForceCommandState } from '@/game/command/command-types';

interface StrategicCommandPanelProps {
  orders: HQOrder[];
  forceStates: ForceCommandState[];
  onIssueOrder: (order: HQOrder) => void;
  onRevokeOrder: (orderId: string) => void;
  onApproveOrder: (orderId: string) => void;
}

export default function StrategicCommandPanel({ orders, forceStates, onIssueOrder, onRevokeOrder, onApproveOrder }: StrategicCommandPanelProps) {
  const [selectedTab, setSelectedTab] = React.useState<'orders' | 'forces'>('orders');

  return (
    <div className="bg-gray-900/80 border border-white/10 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white/90">📋 Strategic Command</h2>
        <div className="flex gap-1">
          <button onClick={() => setSelectedTab('orders')} className={`px-3 py-1 rounded text-xs cursor-pointer ${selectedTab === 'orders' ? 'bg-blue-700 text-white' : 'bg-gray-700 text-gray-400'}`}>Orders</button>
          <button onClick={() => setSelectedTab('forces')} className={`px-3 py-1 rounded text-xs cursor-pointer ${selectedTab === 'forces' ? 'bg-blue-700 text-white' : 'bg-gray-700 text-gray-400'}`}>Forces</button>
        </div>
      </div>

      {selectedTab === 'orders' && (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {orders.length === 0 && <div className="text-xs text-white/30 text-center py-4">No active orders</div>}
          {orders.map(order => (
            <div key={order.id} className="bg-black/30 rounded p-2 space-y-1">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-yellow-300">{order.intent.toUpperCase()}</span>
                <span className="text-xs text-white/40">Turn {order.issuedTurn}</span>
              </div>
              <div className="text-xs text-white/60">{order.text}</div>
              <div className="flex gap-1">
                <span className="text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-300">ROE: {order.rulesOfEngagement}</span>
                <span className="text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-300">Risk: {order.riskTolerance}</span>
                <span className="text-xs px-1.5 py-0.5 rounded bg-gray-700 text-gray-300">Auto: {order.autonomy}</span>
              </div>
              <div className="flex gap-1 mt-1">
                <button onClick={() => onApproveOrder(order.id)} className="px-2 py-0.5 rounded text-xs bg-green-800 text-green-200 hover:bg-green-700 cursor-pointer">Approve</button>
                <button onClick={() => onRevokeOrder(order.id)} className="px-2 py-0.5 rounded text-xs bg-red-900 text-red-200 hover:bg-red-800 cursor-pointer">Revoke</button>
              </div>
            </div>
          ))}
        </div>
      )}

      {selectedTab === 'forces' && (
        <div className="space-y-2 max-h-64 overflow-y-auto">
          {forceStates.map(fs => (
            <div key={fs.forceId} className="bg-black/30 rounded p-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold text-white/80">{fs.forceId}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded ${fs.controller === 'player_direct' ? 'bg-blue-800 text-blue-200' : fs.controller === 'ai_delegated' ? 'bg-purple-800 text-purple-200' : 'bg-red-800 text-red-200'}`}>{fs.controller}</span>
              </div>
              <div className="text-xs text-white/40 mt-1">Autonomy: {fs.autonomy} | Risk: {fs.riskTolerance} | Report: {fs.reportLevel}</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
