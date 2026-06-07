'use client';

import React from 'react';
import type { AIReport } from '@/game/reports/report-types';

interface AIReportPanelProps {
  reports: AIReport[];
  onAcknowledge: (reportId: string) => void;
}

const TYPE_COLORS: Record<string, string> = {
  SITREP: 'bg-blue-900/50 border-blue-500/30',
  INTREP: 'bg-yellow-900/50 border-yellow-500/30',
  BDA: 'bg-red-900/50 border-red-500/30',
  LOGREP: 'bg-green-900/50 border-green-500/30',
  REQUEST: 'bg-purple-900/50 border-purple-500/30',
  WARNING: 'bg-orange-900/50 border-orange-500/30',
  ORDER_CONFIRMATION: 'bg-cyan-900/50 border-cyan-500/30',
  AFTER_ACTION: 'bg-gray-800/50 border-gray-500/30',
};

export default function AIReportPanel({ reports, onAcknowledge }: AIReportPanelProps) {
  const [filter, setFilter] = React.useState<string>('all');

  const filtered = filter === 'all' ? reports : reports.filter(r => r.type === filter);

  return (
    <div className="bg-gray-900/80 border border-white/10 rounded-xl p-4 space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white/90">📡 AI Reports</h2>
        <span className="text-xs text-white/40">{reports.length} total</span>
      </div>

      <div className="flex flex-wrap gap-1">
        {['all', 'SITREP', 'INTREP', 'BDA', 'LOGREP', 'REQUEST', 'WARNING'].map(t => (
          <button key={t} onClick={() => setFilter(t)} className={`px-2 py-0.5 rounded text-xs cursor-pointer ${filter === t ? 'bg-white/20 text-white' : 'bg-gray-800 text-gray-400'}`}>{t}</button>
        ))}
      </div>

      <div className="space-y-2 max-h-72 overflow-y-auto">
        {filtered.length === 0 && <div className="text-xs text-white/30 text-center py-4">No reports</div>}
        {filtered.map(report => (
          <div key={report.id} className={`rounded border p-2 space-y-1 ${TYPE_COLORS[report.type] ?? 'bg-gray-800/50'}`}>
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold">{report.type}</span>
              <span className="text-xs text-white/40">Turn {report.turn}</span>
            </div>
            <div className="text-xs font-semibold text-white/80">{report.title}</div>
            <div className="text-xs text-white/60">{report.summary}</div>

            {report.facts.length > 0 && (
              <div className="text-xs text-green-300/70">
                <span className="font-semibold">Facts:</span> {report.facts.join('; ')}
              </div>
            )}
            {report.estimates.length > 0 && (
              <div className="text-xs text-yellow-300/70">
                <span className="font-semibold">Est:</span> {report.estimates.join('; ')}
              </div>
            )}

            <div className="flex gap-2 text-xs text-white/40">
              <span>Ammo: {report.supply.ammoState}</span>
              <span>Fuel: {report.supply.fuelState}</span>
              <span>Confidence: {report.confidence}</span>
            </div>

            {report.recommendations.length > 0 && (
              <div className="space-y-0.5">
                {report.recommendations.map((rec, i) => (
                  <div key={i} className={`text-xs ${rec.urgency === 'critical' ? 'text-red-300' : rec.urgency === 'high' ? 'text-orange-300' : 'text-white/50'}`}>
                    {rec.urgency}: {rec.text}
                  </div>
                ))}
              </div>
            )}

            <button onClick={() => onAcknowledge(report.id)} className="px-2 py-0.5 rounded text-xs bg-gray-700 text-gray-300 hover:bg-gray-600 cursor-pointer">Ack</button>
          </div>
        ))}
      </div>
    </div>
  );
}
