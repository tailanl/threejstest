'use client';

import React from 'react';
import { parseCommandText, createHQOrderFromParsed } from '@/game/command/command-parser';

interface CommandInputPanelProps {
  onCommand: (text: string) => void;
  selectedForceIds: string[];
  turn: number;
}

export default function CommandInputPanel({ onCommand, selectedForceIds, turn }: CommandInputPanelProps) {
  const [input, setInput] = React.useState('');
  const [preview, setPreview] = React.useState<string>('');

  const handleInputChange = (text: string) => {
    setInput(text);
    if (text.trim()) {
      const parsed = parseCommandText(text);
      setPreview(`Intent: ${parsed.intent} | ROE: ${parsed.rulesOfEngagement} | Risk: ${parsed.riskTolerance} | Conf: ${(parsed.confidence * 100).toFixed(0)}%`);
    } else {
      setPreview('');
    }
  };

  const handleSubmit = () => {
    if (!input.trim() || selectedForceIds.length === 0) return;
    onCommand(input.trim());
    setInput('');
    setPreview('');
  };

  return (
    <div className="bg-gray-900/80 border border-white/10 rounded-xl p-4 space-y-2">
      <h2 className="text-sm font-semibold text-white/90">💬 Command Input</h2>

      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={e => handleInputChange(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && handleSubmit()}
          placeholder="输入命令：侦察/进攻/防守/撤退/支援..."
          className="flex-1 bg-black/40 border border-white/10 rounded px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-cyan-500/50"
        />
        <button
          onClick={handleSubmit}
          disabled={selectedForceIds.length === 0 || !input.trim()}
          className="px-4 py-2 bg-cyan-700 text-white text-sm rounded hover:bg-cyan-600 disabled:bg-gray-700 disabled:text-gray-500 cursor-pointer disabled:cursor-not-allowed"
        >
          发送
        </button>
      </div>

      {preview && (
        <div className="text-xs text-cyan-300/70 bg-black/20 rounded px-2 py-1">{preview}</div>
      )}

      {selectedForceIds.length > 0 && (
        <div className="text-xs text-white/40">Selected forces: {selectedForceIds.join(', ')}</div>
      )}

      <div className="flex flex-wrap gap-1">
        {['侦察前方区域', '进攻目标城市', '防守当前阵地', '炮兵火力支援', '撤退到后方', '自由交战'].map(cmd => (
          <button key={cmd} onClick={() => handleInputChange(cmd)} className="px-2 py-0.5 rounded text-xs bg-gray-800 text-gray-400 hover:bg-gray-700 cursor-pointer">{cmd}</button>
        ))}
      </div>
    </div>
  );
}
