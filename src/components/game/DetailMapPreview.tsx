'use client';

import React from 'react';
import type { DetailMap, DetailMapCell } from '@/game/detail-map-types';
import type { TacticalFeatureType, GameMap } from '@/game/types';
import { generateTacticalMapFromDetailMap, inferBattleTypeFromDetailMap, createDeploymentZonesForTacticalMap, createTacticalObjectives, DEFAULT_TACTICAL_FROM_DETAIL_CONFIG } from '@/game/tactical-from-detail';
import type { TacticalFromDetailConfig, BattleType } from '@/game/tactical-from-detail';

const TERRAIN_COLORS: Record<string, string> = {
  plains: '#7cb342',
  forest: '#2e7d32',
  mountain: '#78909c',
  water: '#1565c0',
  city: '#8d6e63',
  road: '#fdd835',
  swamp: '#5d4037',
  desert: '#fdd835',
  bridge: '#d4a017',
  fortress: '#546e7a',
};

const FEATURE_OVERLAYS: Record<string, { color: string; symbol: string }> = {
  river: { color: 'rgba(33,150,243,0.5)', symbol: '~' },
  stream: { color: 'rgba(33,150,243,0.3)', symbol: '·' },
  main_road: { color: 'rgba(255,220,100,0.6)', symbol: '═' },
  secondary_road: { color: 'rgba(200,180,100,0.4)', symbol: '─' },
  bridge: { color: 'rgba(212,160,23,0.7)', symbol: '≋' },
  city_center: { color: 'rgba(255,50,50,0.5)', symbol: '★' },
  urban_block: { color: 'rgba(150,100,80,0.3)', symbol: '■' },
  suburb: { color: 'rgba(180,160,120,0.2)', symbol: '□' },
  industrial: { color: 'rgba(100,100,100,0.3)', symbol: '⚙' },
  checkpoint: { color: 'rgba(255,100,0,0.5)', symbol: '⛔' },
  supply_point: { color: 'rgba(0,200,100,0.4)', symbol: '📦' },
  hill: { color: 'rgba(100,130,100,0.3)', symbol: '▲' },
  forest_patch: { color: 'rgba(30,100,30,0.3)', symbol: '♣' },
  field: { color: 'rgba(180,200,80,0.2)', symbol: '▫' },
};

const BATTLE_TYPE_LABELS: Record<BattleType, string> = {
  encounter: '遭遇战',
  urban_assault: '城市进攻',
  bridge_crossing: '桥梁争夺',
  hill_assault: '高地进攻',
  forest_fight: '林地战',
  road_ambush: '道路伏击',
  fortress_assault: '要塞进攻',
  open_field: '开阔地',
};

interface DetailMapPreviewProps {
  detailMap: DetailMap;
  cellSize?: number;
  showGrid?: boolean;
  onTacticalMapGenerated?: (tacticalMap: GameMap, config: TacticalFromDetailConfig) => void;
}

export default function DetailMapPreview({ detailMap, cellSize = 8, showGrid = false, onTacticalMapGenerated }: DetailMapPreviewProps) {
  const [hoveredCell, setHoveredCell] = React.useState<DetailMapCell | null>(null);
  const [selectedCell, setSelectedCell] = React.useState<DetailMapCell | null>(null);
  const [inferredBattleType, setInferredBattleType] = React.useState<BattleType | null>(null);

  const { width, height, cells } = detailMap;

  const handleCellClick = React.useCallback((cell: DetailMapCell) => {
    setSelectedCell(cell);
    const bt = inferBattleTypeFromDetailMap({
      detailMap,
      center: { x: cell.position.x, z: cell.position.z },
    });
    setInferredBattleType(bt);
  }, [detailMap]);

  const handleGenerateTactical = React.useCallback(() => {
    if (!selectedCell || !inferredBattleType) return;

    const config: TacticalFromDetailConfig = {
      ...DEFAULT_TACTICAL_FROM_DETAIL_CONFIG,
      center: { x: selectedCell.position.x, z: selectedCell.position.z },
      battleType: inferredBattleType,
      attackerDirection: 'west',
      seed: detailMap.seed + selectedCell.position.x * 31 + selectedCell.position.z * 131,
    };

    const tacticalMap = generateTacticalMapFromDetailMap({ detailMap, config });
    onTacticalMapGenerated?.(tacticalMap, config);
  }, [selectedCell, inferredBattleType, detailMap, onTacticalMapGenerated]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between text-xs text-white/70">
        <span>🗺️ {detailMap.title} ({width}×{height})</span>
        <span>Kind: {detailMap.kind} | Scale: 1:{detailMap.metadata.scale}</span>
      </div>

      <div className="overflow-auto bg-black/30 rounded-lg p-2" style={{ maxHeight: '500px' }}>
        <div
          className="inline-grid"
          style={{
            gridTemplateColumns: `repeat(${width}, ${cellSize}px)`,
            gridTemplateRows: `repeat(${height}, ${cellSize}px)`,
            gap: showGrid ? '1px' : '0px',
          }}
        >
          {cells.flat().map((cell, idx) => {
            const bgColor = TERRAIN_COLORS[cell.terrain] || '#333';

            // Check for feature overlays - use most prominent
            let overlayStyle: React.CSSProperties = {};
            let symbol = '';
            for (const f of cell.features) {
              const overlay = FEATURE_OVERLAYS[f];
              if (overlay) {
                if (f === 'city_center' || f === 'bridge' || f === 'checkpoint') {
                  symbol = overlay.symbol;
                }
                if (f === 'main_road' || f === 'secondary_road' || f === 'river') {
                  overlayStyle = { ...overlayStyle, boxShadow: `inset 0 0 0 ${Math.max(1, cellSize / 4)}px ${overlay.color}` };
                }
              }
            }

            const isSelected = selectedCell && selectedCell.position.x === cell.position.x && selectedCell.position.z === cell.position.z;

            return (
              <div
                key={idx}
                onClick={() => handleCellClick(cell)}
                style={{
                  width: `${cellSize}px`,
                  height: `${cellSize}px`,
                  backgroundColor: bgColor,
                  position: 'relative',
                  cursor: 'pointer',
                  outline: isSelected ? '2px solid #ff4444' : undefined,
                  outlineOffset: '-1px',
                  ...overlayStyle,
                }}
                onMouseEnter={() => setHoveredCell(cell)}
                onMouseLeave={() => setHoveredCell(null)}
                title={`(${cell.position.x},${cell.position.z}) ${cell.terrain} [${cell.features.join(',')}]`}
              >
                {symbol && cellSize >= 6 && (
                  <div className="absolute inset-0 flex items-center justify-center leading-none" style={{ fontSize: `${Math.max(4, cellSize - 2)}px`, color: 'white', textShadow: '0 0 2px black' }}>
                    {symbol}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Selected cell + battle type + generate button */}
      {selectedCell && inferredBattleType && (
        <div className="bg-black/40 rounded p-3 space-y-2">
          <div className="flex items-center justify-between">
            <div className="text-xs text-white/70">
              📍 选中: ({selectedCell.position.x}, {selectedCell.position.z}) {selectedCell.terrain}
            </div>
            <div className="text-xs text-yellow-300 font-semibold">
              ⚔️ {BATTLE_TYPE_LABELS[inferredBattleType]}
            </div>
          </div>
          <button
            onClick={handleGenerateTactical}
            className="w-full px-3 py-2 bg-red-700 hover:bg-red-600 text-white text-sm font-semibold rounded cursor-pointer transition-colors"
          >
            生成战术地图 (16×12)
          </button>
        </div>
      )}

      {/* Hover info */}
      {hoveredCell && (
        <div className="bg-black/40 rounded p-2 text-xs text-white/70 grid grid-cols-2 gap-x-4 gap-y-1">
          <div>📍 ({hoveredCell.position.x}, {hoveredCell.position.z})</div>
          <div>🏔️ {hoveredCell.terrain}</div>
          <div>🔧 [{hoveredCell.features.join(', ')}]</div>
          <div>📊 h={hoveredCell.localElevation.toFixed(2)} m={hoveredCell.localMoisture.toFixed(2)}</div>
          <div>🚶 cost={hoveredCell.movementCost.toFixed(1)} 🛡️ +{hoveredCell.defenseBonus}</div>
          <div>📍 sector=({hoveredCell.sourceStrategicSector.x},{hoveredCell.sourceStrategicSector.y})</div>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-2 text-xs text-white/50">
        {Object.entries(TERRAIN_COLORS).slice(0, 8).map(([k, v]) => (
          <span key={k} className="flex items-center gap-1">
            <span className="w-3 h-3 rounded-sm inline-block" style={{ backgroundColor: v }}></span>
            {k}
          </span>
        ))}
        <span className="ml-2">~river ═main ─secondary ≋bridge ★center</span>
      </div>
    </div>
  );
}
