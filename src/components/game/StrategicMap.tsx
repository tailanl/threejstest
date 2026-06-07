'use client';

import { useState, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useStrategicStore, type StrategicSaveSlotInfo } from '@/store/strategic-store';
import { useGameStore } from '@/store/game-store';
import { STRATEGIC_TERRAIN_CONFIGS, StrategicTerrainType, StrategicForce, StrategicPosition, StrategicSector, StrategicPhase, ReinforcementInfo } from '@/game/strategic-types';
import { FORCE_TEMPLATES, getDeploymentBudget } from '@/game/strategic-engine';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { CardHeader, CardTitle } from '@/components/ui/card';
import {
  Shield, Swords, Eye, Footprints, Target, Radar, Wrench, Package, Plane, Rocket,
  ChevronRight, SkipForward, X, MapPin,
  Truck, AlertTriangle, RotateCcw, ArrowLeftRight, Move, Crosshair,
  Zap, Star, FastForward, Check, Wand2, Trash2, Plus, BarChart3, Save,
} from 'lucide-react';
import { UNIT_CONFIGS } from '@/game/config';
import AIReportPanel from './AIReportPanel';
import CommandInputPanel from './CommandInputPanel';
import ForceDelegationPanel from './ForceDelegationPanel';
import OperationViewPanel from './OperationViewPanel';

// ===== Force Type Emoji Mapping for sector cells =====
const FORCE_TYPE_EMOJI: Record<string, string> = {
  armor: '🛡️',
  mech_inf: '🚛',
  artillery: '🎯',
  recon: '👁️',
  air_defense: '📡',
  engineer: '🔧',
  combined: '⚔️',
};

// ===== Detect force template type from force data =====
function getForceTemplateType(force: StrategicForce): string {
  // Use templateKey if available (more reliable than name matching)
  if (force.templateKey) return force.templateKey;
  
  // Fallback: name-based matching
  const name = force.name;
  if (name.includes('装甲') && !name.includes('机械化')) return 'armor';
  if (name.includes('机械化') || (name.includes('步兵') && !name.includes('综合'))) return 'mech_inf';
  if (name.includes('炮兵')) return 'artillery';
  if (name.includes('侦察')) return 'recon';
  if (name.includes('防空')) return 'air_defense';
  if (name.includes('工兵')) return 'engineer';
  if (name.includes('综合')) return 'combined';
  return 'combined';
}

// ===== Unit Icon Mapping =====
const FORCE_TYPE_ICONS: Record<string, React.ReactNode> = {
  tank: <Shield className="w-3 h-3" />,
  ifv: <Truck className="w-3 h-3" />,
  artillery: <Target className="w-3 h-3" />,
  scout: <Eye className="w-3 h-3" />,
  infantry: <Footprints className="w-3 h-3" />,
  sam: <Radar className="w-3 h-3" />,
  engineer: <Wrench className="w-3 h-3" />,
  supply: <Package className="w-3 h-3" />,
  helicopter: <Plane className="w-3 h-3" />,
  mlrs: <Rocket className="w-3 h-3" />,
};

// ===== Terrain Labels (short Chinese) =====
const TERRAIN_SHORT_LABELS: Record<StrategicTerrainType, string> = {
  plains: '原',
  forest: '林',
  mountain: '山',
  water: '水',
  city: '城',
  desert: '漠',
  marshland: '泽',
  highland: '高',
};

const TERRAIN_LABELS: Record<StrategicTerrainType, string> = {
  plains: '平原',
  forest: '森林',
  mountain: '山地',
  water: '水域',
  city: '城市',
  desert: '沙漠',
  marshland: '沼泽',
  highland: '高原',
};

// ===== Terrain thumbnail symbols =====
const TERRAIN_SYMBOLS: Record<StrategicTerrainType, string> = {
  city: '■',
  mountain: '▲',
  forest: '♦',
  water: '~',
  plains: '·',
  desert: '⋯',
  marshland: '≈',
  highland: '▲',
};

// ===== Generate enhanced minimap grid for a sector (6×4) =====
function generateMinimapGrid(sector: StrategicSector): { color: string; symbol: string; terrain: StrategicTerrainType }[][] {
  const seed = sector.tacticalMapSeed;
  const rows = 4;
  const cols = 6;
  const grid: { color: string; symbol: string; terrain: StrategicTerrainType }[][] = [];

  const baseColor = STRATEGIC_TERRAIN_CONFIGS[sector.terrain].color;

  let rng = seed;
  const nextRandom = () => {
    rng = (rng * 1103515245 + 12345) & 0x7fffffff;
    return (rng / 0x7fffffff);
  };

  // Possible terrain variations for each sector type
  const variations: Record<StrategicTerrainType, StrategicTerrainType[]> = {
    plains: ['plains', 'plains', 'plains', 'plains', 'forest', 'plains'],
    forest: ['forest', 'forest', 'forest', 'forest', 'plains', 'mountain'],
    mountain: ['mountain', 'mountain', 'mountain', 'highland', 'forest', 'mountain'],
    water: ['water', 'water', 'water', 'water', 'water', 'plains'],
    city: ['city', 'city', 'plains', 'plains', 'city', 'plains'],
    desert: ['desert', 'desert', 'desert', 'desert', 'plains', 'desert'],
    marshland: ['marshland', 'marshland', 'marshland', 'water', 'plains', 'marshland'],
    highland: ['highland', 'highland', 'mountain', 'highland', 'plains', 'highland'],
  };

  // Special terrain colors for thumbnail
  const terrainThumbnailColors: Record<string, string> = {
    plains: '#7cb342',
    forest: '#2e7d32',
    mountain: '#78909c',
    water: '#1565c0',
    city: '#8d6e63',
    desert: '#fdd835',
    marshland: '#5d4037',
    highland: '#546e7a',
    road: '#9e9e9e',
  };

  for (let r = 0; r < rows; r++) {
    grid[r] = [];
    for (let c = 0; c < cols; c++) {
      const rand = nextRandom();
      const possibleTerrains = variations[sector.terrain];
      const terrainIndex = Math.floor(rand * possibleTerrains.length);
      const cellTerrain = possibleTerrains[terrainIndex];

      // City sectors get a road pattern
      let finalTerrain = cellTerrain;
      if (sector.terrain === 'city' && (r === 1 || r === 2) && (c >= 1 && c <= 4) && rand > 0.4) {
        finalTerrain = 'plains';
      }

      const color = terrainThumbnailColors[finalTerrain] || baseColor;
      const symbol = TERRAIN_SYMBOLS[finalTerrain as StrategicTerrainType] || '·';

      grid[r][c] = { color, symbol, terrain: finalTerrain as StrategicTerrainType };
    }
  }
  return grid;
}

// ===== Combat flash/shake animation keyframes =====
const combatShakeKeyframes = [
  { x: 0, backgroundColor: 'rgba(239,68,68,0.3)' },
  { x: -3 },
  { x: 3 },
  { x: -2 },
  { x: 2 },
  { x: -1 },
  { x: 0, backgroundColor: 'transparent' },
];

// ===== Calculate initial unit count for a force =====
function getInitialUnitCount(force: StrategicForce): number {
  // Estimate initial units based on template type
  const type = getForceTemplateType(force);
  const counts: Record<string, number> = {
    armor: 7,
    mech_inf: 8,
    artillery: 6,
    recon: 5,
    air_defense: 5,
    engineer: 6,
    combined: 8,
  };
  return counts[type] || force.units.reduce((s, u) => s + u.count, 0);
}

// ===== Sector Cell Component (Enhanced) =====
function SectorCell({
  sector,
  isVisible,
  isMovable,
  isAttackable,
  isSelectedForce,
  combatFlashKey,
  moveCost,
  isInTerritory,
  onClick,
}: {
  sector: StrategicSector;
  isVisible: boolean;
  isMovable: boolean;
  isAttackable: boolean;
  isSelectedForce: boolean;
  combatFlashKey: number | null;
  moveCost: number | null;
  isInTerritory: boolean;
  onClick: () => void;
}) {
  const terrainConfig = STRATEGIC_TERRAIN_CONFIGS[sector.terrain];
  const force = sector.force;
  const minimapGrid = useMemo(() => generateMinimapGrid(sector), [sector]);

  const forceType = force && force.isAlive ? getForceTemplateType(force) : null;
  const totalUnits = force && force.isAlive ? force.units.reduce((s, u) => s + u.count, 0) : 0;
  const initialUnits = force && force.isAlive ? getInitialUnitCount(force) : 0;
  const healthPercent = initialUnits > 0 ? Math.round((totalUnits / initialUnits) * 100) : 100;

  return (
    <motion.button
      className={`relative w-full h-full rounded-sm overflow-hidden cursor-pointer
        ${isSelectedForce ? 'z-10' : ''}
        ${!isVisible ? '' : ''}
      `}
      style={{
        backgroundColor: terrainConfig.color,
        borderColor: isSelectedForce ? '#f59e0b' : isAttackable ? '#ef4444' : isMovable ? '#22c55e' : 'rgba(255,255,255,0.12)',
        borderWidth: isSelectedForce ? '2px' : isInTerritory && isVisible ? '1.5px' : '1px',
        borderStyle: 'solid',
        boxShadow: isInTerritory && isVisible && !isSelectedForce
          ? `inset 0 0 4px rgba(251,191,36,0.15), 0 0 3px rgba(251,191,36,0.1)`
          : isSelectedForce
          ? '0 0 8px rgba(245,158,11,0.5)'
          : isAttackable && isVisible
          ? '0 0 6px rgba(239,68,68,0.4)'
          : 'none',
      }}
      onClick={onClick}
      whileHover={{ scale: 1.04, zIndex: 5 }}
      transition={{ duration: 0.1 }}
    >
      {/* Atmospheric fog of war */}
      {!isVisible && (
        <div className="absolute inset-0 z-10"
          style={{
            background: 'repeating-conic-gradient(rgba(20,20,30,0.75) 0% 25%, rgba(15,15,25,0.85) 0% 50%) 0 0 / 4px 4px',
          }}
        />
      )}

      {/* Enhanced minimap grid (6×4) */}
      <div className="absolute top-0 left-0 right-0 bottom-3 z-[1] opacity-70">
        <div className="grid h-full w-full" style={{ gridTemplateColumns: 'repeat(6, 1fr)', gridTemplateRows: 'repeat(4, 1fr)' }}>
          {minimapGrid.flat().map((cell, i) => (
            <div
              key={i}
              className="flex items-center justify-center"
              style={{ backgroundColor: isVisible ? cell.color : '#333', fontSize: '4px', lineHeight: 1 }}
            >
              <span style={{ color: 'rgba(255,255,255,0.5)', fontSize: cell.symbol === '·' ? '3px' : '4px' }}>
                {isVisible ? cell.symbol : ''}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Terrain type label (short) in top-left corner */}
      <div className="absolute top-0 left-0 z-[3] px-0.5 rounded-br-sm"
        style={{
          fontSize: '6px',
          backgroundColor: 'rgba(0,0,0,0.5)',
          color: 'rgba(255,255,255,0.7)',
          lineHeight: 1.2,
        }}
      >
        {TERRAIN_SHORT_LABELS[sector.terrain]}
      </div>

      {/* Sector name */}
      <div className={`absolute bottom-0 left-0 right-0 text-center z-[3] leading-none
        ${sector.terrain === 'city' ? 'font-bold' : ''}`}
        style={{ fontSize: '7px', color: 'rgba(255,255,255,0.9)', textShadow: '0 1px 3px rgba(0,0,0,0.9)' }}
      >
        {sector.name}
      </div>

      {/* Force icon (enhanced with type badge and health bar) */}
      {force && force.isAlive && isVisible && (
        <div className="absolute top-0.5 right-0.5 z-[4] flex flex-col items-center">
          {/* Main icon with type badge */}
          <div className="relative">
            <motion.div
              className={`flex items-center justify-center rounded-full text-white font-bold
                ${force.faction === 'red' ? 'bg-red-600' : 'bg-blue-600'}
                ${force.canMove && force.faction === 'red' ? 'ring-1 ring-green-400' : ''}
              `}
              style={{
                width: '18px',
                height: '18px',
                fontSize: '8px',
                boxShadow: '0 2px 6px rgba(0,0,0,0.6)',
              }}
              animate={isSelectedForce ? { scale: [1, 1.15, 1] } : {}}
              transition={isSelectedForce ? { duration: 1.2, repeat: Infinity, ease: 'easeInOut' } : {}}
            >
              {totalUnits}
            </motion.div>

            {/* Type emoji badge */}
            {forceType && (
              <div className="absolute -top-1 -left-1 z-[5]"
                style={{ fontSize: '7px', lineHeight: 1, filter: 'drop-shadow(0 1px 1px rgba(0,0,0,0.8))' }}
              >
                {FORCE_TYPE_EMOJI[forceType]}
              </div>
            )}

            {/* Faction dot */}
            <div className={`absolute -bottom-0.5 -right-0.5 w-1.5 h-1.5 rounded-full border border-black/30 z-[5]
              ${force.faction === 'red' ? 'bg-red-400' : 'bg-blue-400'}`}
            />
          </div>

          {/* Health bar with percentage label */}
          <div className="flex flex-col items-center">
            <div className="w-4 h-[2px] rounded-full overflow-hidden bg-black/40">
              <div
                className="h-full rounded-full transition-all duration-300"
                style={{
                  width: `${healthPercent}%`,
                  backgroundColor: healthPercent > 60 ? '#22c55e' : healthPercent > 30 ? '#f59e0b' : '#ef4444',
                }}
              />
            </div>
            <span className="leading-none" style={{ fontSize: '4px', color: healthPercent > 60 ? '#86efac' : healthPercent > 30 ? '#fcd34d' : '#fca5a5' }}>{healthPercent}%</span>
          </div>
        </div>
      )}

      {/* Movement cost badge on movable sectors */}
      {isMovable && !isAttackable && isVisible && moveCost !== null && moveCost > 1 && (
        <div className="absolute bottom-2.5 right-0.5 z-[6] flex items-center justify-center rounded-full bg-black/60 border border-green-400/40"
          style={{ width: '11px', height: '11px', fontSize: '6px', color: '#86efac' }}
        >
          {moveCost}
        </div>
      )}

      {/* Movable highlight */}
      {isMovable && !isAttackable && isVisible && (
        <div className="absolute inset-0 bg-green-400/15 z-[5] rounded-sm" />
      )}

      {/* Attackable highlight - pulsing red border animation */}
      {isAttackable && isVisible && (
        <>
          <div className="absolute inset-0 bg-red-400/20 z-[5] rounded-sm" />
          <motion.div
            className="absolute inset-0 border-2 border-red-500 rounded-sm z-[6]"
            animate={{ opacity: [0.4, 1, 0.4] }}
            transition={{ duration: 0.8, repeat: Infinity, ease: 'easeInOut' }}
          />
        </>
      )}

      {/* Selected force pulse */}
      {isSelectedForce && (
        <motion.div
          className="absolute inset-0 border-2 border-amber-400 rounded-sm z-[7]"
          animate={{ opacity: [0.4, 1, 0.4], boxShadow: ['0 0 4px rgba(245,158,11,0.3)', '0 0 12px rgba(245,158,11,0.6)', '0 0 4px rgba(245,158,11,0.3)'] }}
          transition={{ duration: 1.2, repeat: Infinity, ease: 'easeInOut' }}
        />
      )}

      {/* Combat flash/shake overlay — keyed by combatFlashKey to re-trigger animation */}
      {isAttackable && combatFlashKey !== null && (
        <motion.div
          key={`flash-${combatFlashKey}`}
          className="absolute inset-0 z-20 rounded-sm pointer-events-none"
          animate={{ x: [0, -3, 3, -2, 2, -1, 0] }}
          transition={{ duration: 0.4, ease: 'easeOut', times: [0, 0.14, 0.28, 0.42, 0.57, 0.71, 1] }}
        />
      )}
    </motion.button>
  );
}

// ===== Force Info Panel (Enhanced) =====
function ForceInfoPanel({ force, onMove, onAttack }: { force: StrategicForce; onMove?: () => void; onAttack?: () => void }) {
  const totalUnits = force.units.reduce((sum, u) => sum + u.count, 0);
  const initialUnits = getInitialUnitCount(force);
  const healthPercent = Math.round((totalUnits / initialUnits) * 100);
  const combatBarWidth = force.combatPower + force.defensePower > 0
    ? Math.round((force.combatPower / (force.combatPower + force.defensePower)) * 100)
    : 50;

  return (
    <div className="space-y-2">
      {/* Header with faction and name */}
      <div className="flex items-center gap-2">
        <motion.div
          className={`w-4 h-4 rounded-full flex items-center justify-center text-[8px]
            ${force.faction === 'red' ? 'bg-red-600' : 'bg-blue-600'}`}
          animate={{ scale: [1, 1.1, 1] }}
          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
        >
          <span style={{ filter: 'none' }}>
            {FORCE_TYPE_EMOJI[getForceTemplateType(force)]}
          </span>
        </motion.div>
        <span className="text-xs font-bold text-white flex-1">{force.name}</span>
        <Badge variant="outline" className={`text-[9px] px-1 py-0 h-4 ${force.faction === 'red' ? 'border-red-400 text-red-400' : 'border-blue-400 text-blue-400'}`}>
          {force.faction === 'red' ? '红方' : '蓝方'}
        </Badge>
      </div>

      {/* Force composition as unit icons with count badges */}
      <div className="space-y-0.5">
        <div className="text-[9px] text-white/50 font-medium">部队编制</div>
        <div className="flex flex-wrap gap-1">
          {force.units.map((u, i) => {
            const config = UNIT_CONFIGS[u.type];
            if (!config) return null;
            return (
              <div key={i} className="relative flex items-center gap-0.5 px-1 py-0.5 rounded bg-white/5 border border-white/10">
                <span className="text-white/70">{FORCE_TYPE_ICONS[u.type]}</span>
                <span className="text-[9px] text-white/80">{config.name}</span>
                <Badge className="bg-amber-600/80 text-white text-[7px] px-0.5 py-0 h-3 min-w-[12px] flex items-center justify-center">
                  {u.count}
                </Badge>
              </div>
            );
          })}
        </div>
      </div>

      <Separator className="bg-white/10" />

      {/* Combat power bar (attack vs defense) */}
      <div className="space-y-0.5">
        <div className="text-[9px] text-white/50 font-medium">攻防对比</div>
        <div className="flex items-center gap-1">
          <Swords className="w-3 h-3 text-orange-400 flex-shrink-0" />
          <span className="text-[9px] text-orange-400 w-6">{force.combatPower}</span>
          <div className="flex-1 h-2 bg-black/40 rounded-full overflow-hidden flex">
            <div className="h-full bg-gradient-to-r from-orange-500 to-orange-400 rounded-l-full transition-all duration-300"
              style={{ width: `${combatBarWidth}%` }} />
            <div className="h-full bg-gradient-to-r from-blue-400 to-blue-500 rounded-r-full transition-all duration-300"
              style={{ width: `${100 - combatBarWidth}%` }} />
          </div>
          <span className="text-[9px] text-blue-400 w-6 text-right">{force.defensePower}</span>
          <Shield className="w-3 h-3 text-blue-400 flex-shrink-0" />
        </div>
      </div>

      {/* Health bar */}
      <div className="space-y-0.5">
        <div className="flex items-center justify-between">
          <span className="text-[9px] text-white/50">兵力</span>
          <span className={`text-[9px] font-bold ${healthPercent > 60 ? 'text-green-400' : healthPercent > 30 ? 'text-amber-400' : 'text-red-400'}`}>
            {totalUnits}/{initialUnits} ({healthPercent}%)
          </span>
        </div>
        <div className="h-1.5 bg-black/40 rounded-full overflow-hidden">
          <motion.div
            className="h-full rounded-full"
            style={{ backgroundColor: healthPercent > 60 ? '#22c55e' : healthPercent > 30 ? '#f59e0b' : '#ef4444' }}
            initial={{ width: 0 }}
            animate={{ width: `${healthPercent}%` }}
            transition={{ duration: 0.5, ease: 'easeOut' }}
          />
        </div>
      </div>

      <Separator className="bg-white/10" />

      {/* Stats grid */}
      <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[10px]">
        <div className="flex items-center gap-1">
          <Footprints className="w-3 h-3 text-purple-400" />
          <span className="text-white/60">移动</span>
          <span className="text-purple-400 font-bold">{force.moveRange}</span>
        </div>
        <div className="flex items-center gap-1">
          <Eye className="w-3 h-3 text-green-400" />
          <span className="text-white/60">视野</span>
          <span className="text-green-400 font-bold">{force.vision}</span>
        </div>
      </div>

      {/* Status effects as badges */}
      <div className="flex items-center gap-1.5 flex-wrap text-[9px]">
        <span className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-md ${force.canMove ? 'bg-green-900/60 text-green-400 border border-green-500/30' : 'bg-gray-800/60 text-gray-500 border border-gray-600/20'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${force.canMove ? 'bg-green-400 animate-pulse' : 'bg-gray-600'}`} />
          {force.canMove ? '可移动' : '已移动'}
        </span>
        <span className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded-md ${!force.hasAttacked ? 'bg-orange-900/60 text-orange-400 border border-orange-500/30' : 'bg-gray-800/60 text-gray-500 border border-gray-600/20'}`}>
          <span className={`w-1.5 h-1.5 rounded-full ${!force.hasAttacked ? 'bg-orange-400 animate-pulse' : 'bg-gray-600'}`} />
          {!force.hasAttacked ? '可攻击' : '已攻击'}
        </span>
      </div>

      {/* Action buttons */}
      <div className="flex gap-1.5">
        {force.canMove && (
          <Button
            size="sm"
            className="h-6 px-2 bg-green-700 hover:bg-green-600 text-white text-[10px] flex-1"
            onClick={onMove}
          >
            <Move className="w-3 h-3 mr-0.5" />移动
          </Button>
        )}
        {!force.hasAttacked && (
          <Button
            size="sm"
            className="h-6 px-2 bg-red-700 hover:bg-red-600 text-white text-[10px] flex-1"
            onClick={onAttack}
          >
            <Crosshair className="w-3 h-3 mr-0.5" />攻击
          </Button>
        )}
        {!force.canMove && force.hasAttacked && (
          <div className="text-[9px] text-gray-500 flex items-center gap-1 px-2">
            <AlertTriangle className="w-3 h-3" />本回合行动已结束
          </div>
        )}
      </div>
    </div>
  );
}

// ===== Combat Log Entry (Enhanced) =====
function CombatLogEntry({ log, isLatest }: { log: any; isLatest: boolean }) {
  const resultText = log.result === 'attacker_wins' ? '胜利' : log.result === 'defender_wins' ? '失败' : '平局';
  const resultColor = log.result === 'attacker_wins' ? 'text-green-400' : log.result === 'defender_wins' ? 'text-red-400' : 'text-yellow-400';
  const resultBg = log.result === 'attacker_wins' ? 'border-green-500/50 bg-green-900/20' : log.result === 'defender_wins' ? 'border-red-500/50 bg-red-900/20' : 'border-yellow-500/50 bg-yellow-900/20';

  return (
    <motion.div
      className={`text-[10px] py-0.5 px-1.5 rounded border-l-2 ${resultBg} ${isLatest ? 'ring-1 ring-white/10' : ''}`}
      initial={isLatest ? { opacity: 0, x: -10 } : {}}
      animate={isLatest ? { opacity: 1, x: 0 } : {}}
      transition={{ duration: 0.3 }}
    >
      <span className="text-gray-500">T{log.turn}:</span>{' '}
      <span className={`${log.attackerFaction === 'red' ? 'text-red-400' : 'text-blue-400'} font-medium`}>
        {log.attacker}
      </span>
      <span className="text-amber-400 mx-0.5">→</span>
      <span className={`${log.attackerFaction === 'red' ? 'text-blue-400' : 'text-red-400'} font-medium`}>
        {log.defender}
      </span>
      {' '}
      <span className={`${resultColor} font-bold`}>{resultText}</span>
      {' '}
      <span className="text-gray-400 text-[9px]">(损{log.attackerLosses}/敌损{log.defenderLosses})</span>
    </motion.div>
  );
}

// ===== Terrain Legend =====
function TerrainLegend() {
  const terrains: StrategicTerrainType[] = ['plains', 'forest', 'mountain', 'water', 'city', 'desert', 'marshland', 'highland'];

  return (
    <div className="grid grid-cols-4 gap-1 text-[9px]">
      {terrains.map(t => {
        const config = STRATEGIC_TERRAIN_CONFIGS[t];
        return (
          <div key={t} className="flex items-center gap-1">
            <div className="w-2.5 h-2.5 rounded-sm flex-shrink-0 border border-white/20" style={{ backgroundColor: config.color }} />
            <span className="text-white/70">{TERRAIN_LABELS[t]}</span>
          </div>
        );
      })}
    </div>
  );
}

// ===== Battle Choice Dialog =====
function BattleChoiceDialog() {
  const { tacticalBattleConfig } = useStrategicStore();

  if (!tacticalBattleConfig) return null;

  const { attackerForce, defenderForce, sector } = tacticalBattleConfig;
  const attackerTotal = attackerForce.units.reduce((s, u) => s + u.count, 0);
  const defenderTotal = defenderForce.units.reduce((s, u) => s + u.count, 0);
  const terrainConfig = STRATEGIC_TERRAIN_CONFIGS[sector.terrain];

  return (
    <motion.div
      className="absolute inset-0 z-50 flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={() => useStrategicStore.getState().onDismissBattleChoice()}
      />

      {/* Dialog */}
      <motion.div
        className="relative z-10 min-w-[360px] max-w-[440px]"
        initial={{ scale: 0.85, opacity: 0, y: 20 }}
        animate={{ scale: 1, opacity: 1, y: 0 }}
        exit={{ scale: 0.9, opacity: 0, y: -10 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
      >
        <Card className="bg-gray-900/95 backdrop-blur-md text-white shadow-2xl overflow-hidden"
          style={{ borderColor: 'rgba(239,68,68,0.3)', borderWidth: '1px' }}>
          {/* Header banner */}
          <div className="px-4 py-3 bg-gradient-to-r from-red-900/60 via-orange-900/40 to-blue-900/60 border-b border-white/10">
            <div className="flex items-center justify-center gap-2">
              <Swords className="w-4 h-4 text-orange-400" />
              <span className="text-sm font-bold text-orange-300">进入战术战斗?</span>
              <Swords className="w-4 h-4 text-orange-400" />
            </div>
          </div>

          <CardContent className="p-4 space-y-4">
            {/* Sector info */}
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10">
              <div className="w-4 h-4 rounded-sm flex-shrink-0" style={{ backgroundColor: terrainConfig.color }} />
              <span className="text-xs text-gray-400">{TERRAIN_LABELS[sector.terrain]}</span>
              <span className="text-xs text-white/60">·</span>
              <span className="text-xs text-gray-300 font-medium">{sector.name}</span>
            </div>

            {/* Forces comparison */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${attackerForce.faction === 'red' ? 'bg-red-500' : 'bg-blue-500'}`} />
                  <span className="text-xs font-bold text-white">{attackerForce.name}</span>
                </div>
                <span className="text-xs text-gray-500">VS</span>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold text-white">{defenderForce.name}</span>
                  <div className={`w-3 h-3 rounded-full ${defenderForce.faction === 'red' ? 'bg-red-500' : 'bg-blue-500'}`} />
                </div>
              </div>

              {/* Unit counts comparison */}
              <div className="flex items-center gap-2 px-2">
                <div className="flex-1 text-right">
                  <span className={`text-lg font-bold ${attackerForce.faction === 'red' ? 'text-red-400' : 'text-blue-400'}`}>
                    {attackerTotal}
                  </span>
                  <span className="text-[10px] text-gray-500 ml-1">单位</span>
                </div>
                <div className="w-px h-6 bg-white/20" />
                <div className="flex-1 text-left">
                  <span className={`text-lg font-bold ${defenderForce.faction === 'red' ? 'text-red-400' : 'text-blue-400'}`}>
                    {defenderTotal}
                  </span>
                  <span className="text-[10px] text-gray-500 ml-1">单位</span>
                </div>
              </div>

              {/* Force composition previews */}
              <div className="flex gap-2">
                <div className="flex-1 space-y-0.5">
                  {attackerForce.units.map((u, i) => {
                    const config = UNIT_CONFIGS[u.type];
                    if (!config) return null;
                    return (
                      <div key={i} className="flex items-center gap-1 text-[10px]">
                        <span className="text-white/60">{FORCE_TYPE_ICONS[u.type]}</span>
                        <span className="text-white/70 flex-1">{config.name}</span>
                        <span className={`${attackerForce.faction === 'red' ? 'text-red-400' : 'text-blue-400'} font-bold`}>×{u.count}</span>
                      </div>
                    );
                  })}
                </div>
                <div className="w-px bg-white/10" />
                <div className="flex-1 space-y-0.5">
                  {defenderForce.units.map((u, i) => {
                    const config = UNIT_CONFIGS[u.type];
                    if (!config) return null;
                    return (
                      <div key={i} className="flex items-center gap-1 text-[10px]">
                        <span className="text-white/60">{FORCE_TYPE_ICONS[u.type]}</span>
                        <span className="text-white/70 flex-1">{config.name}</span>
                        <span className={`${defenderForce.faction === 'red' ? 'text-red-400' : 'text-blue-400'} font-bold`}>×{u.count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex gap-2 pt-1">
              <motion.div className="flex-1" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Button
                  className="w-full h-9 text-xs font-bold bg-gradient-to-r from-red-700 to-orange-700 hover:from-red-600 hover:to-orange-600 text-white shadow-lg"
                  onClick={() => useStrategicStore.getState().onEnterTacticalBattle()}
                >
                  <Swords className="w-3.5 h-3.5 mr-1.5" />
                  ⚔️ 战术战斗
                </Button>
              </motion.div>
              <motion.div className="flex-1" whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
                <Button
                  className="w-full h-9 text-xs font-bold bg-gradient-to-r from-gray-700 to-gray-600 hover:from-gray-600 hover:to-gray-500 text-white shadow-lg border border-white/10"
                  onClick={() => useStrategicStore.getState().onAutoResolve()}
                >
                  <BarChart3 className="w-3.5 h-3.5 mr-1.5" />
                  📊 自动结算
                </Button>
              </motion.div>
            </div>

            {/* Cancel */}
            <motion.div whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}>
              <Button
                variant="ghost"
                className="w-full h-7 text-[10px] text-gray-500 hover:text-gray-300 hover:bg-white/5"
                onClick={() => useStrategicStore.getState().onDismissBattleChoice()}
              >
                <X className="w-3 h-3 mr-1" /> 取消
              </Button>
            </motion.div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}

// ===== Main StrategicMap Component =====
export default function StrategicMap() {
  const state = useStrategicStore();
  const {
    map, forces, currentFaction, turn, phase,
    selectedForce, movableSectors, attackableSectors,
    winner, combatLog, visibleSectors, isAiProcessing,
    turnTransition, reinforcements,
    showBattleChoiceDialog, tacticalBattleConfig,
    gameSpeed, showSavePanel,
  } = state;

  const worldAtlasMode = useStrategicStore(s => s.worldAtlasMode);
  const selectedOperationView = useStrategicStore(s => s.selectedOperationView);
  const selectedCombatViewport = useStrategicStore(s => s.selectedCombatViewport);
  const aiReports = useStrategicStore(s => s.aiReports);
  const generateWorldAtlasAndRegion = useStrategicStore(s => s.generateWorldAtlasAndRegion);
  const openOperationViewForSector = useStrategicStore(s => s.openOperationViewForSector);
  const openCombatViewportFromOperationCell = useStrategicStore(s => s.openCombatViewportFromOperationCell);
  const closeOperationView = useStrategicStore(s => s.closeOperationView);
  const closeCombatViewport = useStrategicStore(s => s.closeCombatViewport);
  const submitHQCommand = useStrategicStore(s => s.submitHQCommand);
  const delegateForceToAICommand = useStrategicStore(s => s.delegateForceToAICommand);
  const recallForceFromAICommand = useStrategicStore(s => s.recallForceFromAICommand);
  const clearReports = useStrategicStore(s => s.clearReports);
  const toggleWorldAtlasMode = useStrategicStore(s => s.toggleWorldAtlasMode);
  const enterTacticalFromCombatViewport = useGameStore(s => s.enterTacticalFromCombatViewport);

  const [showLegend, setShowLegend] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string | null>(null);
  const [saveToast, setSaveToast] = useState<string | null>(null);

  // Deployment phase state
  const deployment = state.deployment;
  const isDeployment = phase === 'deployment';
  const redBudget = deployment ? deployment.redBudget : 0;
  const blueBudget = deployment ? deployment.blueBudget : 0;
  const deployedRedForces = forces.filter(f => f.faction === 'red');
  const deployedBlueForces = forces.filter(f => f.faction === 'blue');

  // Template costs
  const TEMPLATE_COSTS: Record<string, number> = {
    armor: 25, mech_inf: 20, artillery: 18, recon: 15, air_defense: 14, engineer: 16, combined: 22,
  };

  // Combat flash is derived from combatLog length — used as key for animation
  const combatFlashId = combatLog.length > 0 ? combatLog.length : null;

  const redForces = forces.filter(f => f.faction === 'red' && f.isAlive);
  const blueForces = forces.filter(f => f.faction === 'blue' && f.isAlive);

  // Calculate initial force counts
  const redInitial = 7;
  const blueInitial = 7;

  // Reinforcement info
  const reinInfo = reinforcements || null;
  const turnsUntilReinforcement = reinInfo ? reinInfo.nextReinforcementTurn - turn : 999;
  const showReinforcementPulse = reinInfo && turnsUntilReinforcement >= 1 && turnsUntilReinforcement <= 2;
  const lastReinforcementSpawned = reinInfo ? (combatLog.some(l => l.attacker.includes('增援') && l.turn === turn)) : false;

  // Build sets for quick lookup
  const movableSet = useMemo(() => {
    const set = new Set<string>();
    movableSectors.forEach(p => set.add(`${p.x},${p.y}`));
    return set;
  }, [movableSectors]);

  const attackableSet = useMemo(() => {
    const set = new Set<string>();
    attackableSectors.forEach(p => set.add(`${p.x},${p.y}`));
    return set;
  }, [attackableSectors]);

  // Move cost lookup
  const moveCostMap = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of movableSectors) {
      const sector = state.map.sectors[p.y]?.[p.x];
      if (sector) {
        const cost = STRATEGIC_TERRAIN_CONFIGS[sector.terrain].moveCost;
        map.set(`${p.x},${p.y}`, cost);
      }
    }
    return map;
  }, [movableSectors, state.map]);

  // Territory lookup
  const territorySet = useMemo(() => {
    const set = new Set<string>();
    for (const force of forces) {
      if (!force.isAlive) continue;
      // Sector the force is in and immediate neighbors
      const dirs = [
        { x: 0, y: 0 },
        { x: 0, y: -1 }, { x: 0, y: 1 },
        { x: -1, y: 0 }, { x: 1, y: 0 },
        { x: -1, y: -1 }, { x: 1, y: -1 },
        { x: -1, y: 1 }, { x: 1, y: 1 },
      ];
      for (const d of dirs) {
        const nx = force.position.x + d.x;
        const ny = force.position.y + d.y;
        if (nx >= 0 && nx < state.map.width && ny >= 0 && ny < state.map.height) {
          set.add(`${nx},${ny},${force.faction}`);
        }
      }
    }
    return set;
  }, [forces, state.map]);

  const handleSectorClick = useCallback((pos: StrategicPosition) => {
    if (worldAtlasMode) {
      const sector = map.sectors[pos.y]?.[pos.x];
      const hasCity = sector?.features?.includes('city') || sector?.features?.includes('city_center') || sector?.features?.includes('capital');
      openOperationViewForSector(pos, hasCity ?? false);
    } else {
      useStrategicStore.getState().onSectorClick(pos);
    }
  }, [worldAtlasMode, map, openOperationViewForSector]);

  const handleEndTurn = () => {
    useStrategicStore.getState().onEndTurn();
  };

  const handleDeselect = () => {
    useStrategicStore.getState().deselectForce();
  };

  const handleModeSwitch = () => {
    useStrategicStore.getState().setGameMode('tactical');
  };

  const handleSaveGame = (slot: number) => {
    useStrategicStore.getState().saveGame(slot);
    setSaveToast(`💾 已保存到存档 ${slot}`);
    setTimeout(() => setSaveToast(null), 2000);
  };

  const handleLoadGame = (slot: number) => {
    useStrategicStore.getState().loadGame(slot);
    useStrategicStore.getState().toggleSavePanel();
    setSaveToast(`📂 已读取存档 ${slot}`);
    setTimeout(() => setSaveToast(null), 2000);
  };

  const handleDeleteSave = (slot: number) => {
    useStrategicStore.getState().deleteSave(slot);
    setSaveToast(`🗑️ 已删除存档 ${slot}`);
    setTimeout(() => setSaveToast(null), 2000);
  };

  const handleMoveAction = () => {
    // Select the force if not already selected
    if (selectedForce && selectedForce.canMove) {
      // Force is already selected, movable sectors are shown
      // User just needs to click a sector
    }
  };

  const handleAttackAction = () => {
    // Select the force if not already selected
    if (selectedForce && !selectedForce.hasAttacked) {
      // Attackable sectors are shown, user needs to click
    }
  };

  // Determine current phase text
  const getPhaseText = () => {
    if (phase === 'deployment') return '部署阶段';
    if (phase === 'aiTurn') return 'AI行动';
    if (phase === 'gameOver') return '结束';
    if (phase === 'selectForce') return '选择部队';
    if (phase === 'moveForce') {
      if (selectedForce?.canMove) return '移动阶段';
      if (selectedForce && !selectedForce.hasAttacked) return '攻击阶段';
      return '行动中';
    }
    return '';
  };

  // Handle deployment sector click — deploy template or remove own force
  const handleDeploymentClick = useCallback((pos: StrategicPosition) => {
    if (!isDeployment) return;
    const sector = map.sectors[pos.y]?.[pos.x];
    if (!sector) return;
    // If clicking on an own deployed force, remove it
    if (sector.force && sector.force.faction === 'red') {
      useStrategicStore.getState().onRemoveDeployedForce(sector.force.id);
      return;
    }
    // If template selected, try to deploy
    if (!selectedTemplate) return;
    // Red deploys in x 0-2
    if (pos.x <= 2 && !sector.force && STRATEGIC_TERRAIN_CONFIGS[sector.terrain].isPassable) {
      useStrategicStore.getState().onDeployForce(selectedTemplate, 'red', pos);
    }
  }, [selectedTemplate, isDeployment, map]);

  // Auto deploy balanced force composition: 1 Armor(25) + 1 MechInf(20) + 1 Artillery(18) + 1 Recon(15) + 1 AirDefense(14) = 92/100
  const handleAutoDeploy = useCallback(() => {
    if (!isDeployment) return;
    // First remove any existing red forces to allow clean auto-deploy
    const currentForces = useStrategicStore.getState().forces.filter(f => f.faction === 'red');
    for (const f of currentForces) {
      useStrategicStore.getState().onRemoveDeployedForce(f.id);
    }
    // Balanced composition within 100 budget
    const balancedDeploy = [
      { key: 'armor', cost: 25 },
      { key: 'mech_inf', cost: 20 },
           { key: 'artillery', cost: 18 },
      { key: 'recon', cost: 15 },
      { key: 'air_defense', cost: 14 },
    ];
    let yIndex = 0;
    for (const item of balancedDeploy) {
      let placed = false;
      for (let x = 0; x <= 2 && !placed; x++) {
        for (let y = yIndex; y < map.height && !placed; y++) {
          const sector = map.sectors[y]?.[x];
          if (sector && !sector.force && STRATEGIC_TERRAIN_CONFIGS[sector.terrain].isPassable) {
            useStrategicStore.getState().onDeployForce(item.key, 'red', { x, y });
            placed = true;
            yIndex = y + 1;
          }
        }
      }
    }
  }, [isDeployment, map]);

  // Confirm deployment
  const handleConfirmDeployment = useCallback(() => {
    if (!isDeployment) return;
    useStrategicStore.getState().onConfirmDeployment();
  }, [isDeployment]);

  // Remove deployed force
  const handleRemoveForce = useCallback((forceId: string) => {
    if (!isDeployment) return;
    useStrategicStore.getState().onRemoveDeployedForce(forceId);
  }, [isDeployment]);

  return (
    <div className="w-full h-full flex flex-col bg-gray-900 text-white overflow-hidden">
      {/* ===== TOP BAR (Enhanced) ===== */}
      <div className="flex-shrink-0 flex items-center justify-between px-3 py-1.5 bg-black/60 backdrop-blur-xl border-b border-white/10 shadow-lg z-20">
        <div className="flex items-center gap-2">
          {/* Faction banner/emblem */}
          <motion.div
            className={`flex items-center gap-1 px-2 py-0.5 rounded-md ${
              currentFaction === 'red'
                ? 'bg-red-900/60 border border-red-500/40'
                : 'bg-blue-900/60 border border-blue-500/40'
            }`}
            key={currentFaction}
            initial={{ x: currentFaction === 'red' ? -20 : 20, opacity: 0 }}
            animate={{ x: 0, opacity: 1 }}
            transition={{ duration: 0.3 }}
          >
            {currentFaction === 'red' ? (
              <Star className="w-3.5 h-3.5 text-red-400 fill-red-400" />
            ) : (
              <Shield className="w-3.5 h-3.5 text-blue-400 fill-blue-400" />
            )}
            <span className={`text-xs font-bold ${currentFaction === 'red' ? 'text-red-300' : 'text-blue-300'}`}>
              {currentFaction === 'red' ? '红方' : '蓝方'}
            </span>
          </motion.div>

          {/* Turn counter */}
          <Badge variant="outline" className="text-white border-white/30 text-xs">
            第{turn}回合
          </Badge>

          {/* Current phase */}
          <Badge className={`text-[10px] px-1.5 py-0 ${
            phase === 'deployment' ? 'bg-green-700' :
            phase === 'moveForce' && selectedForce?.canMove ? 'bg-green-700' :
            phase === 'moveForce' && selectedForce && !selectedForce.hasAttacked ? 'bg-orange-700' :
            phase === 'selectForce' ? 'bg-gray-700' :
            'bg-gray-700'
          }`}>
            {getPhaseText()}
          </Badge>

          {phase === 'aiTurn' && (
            <Badge className="bg-yellow-600 animate-pulse text-xs">
              AI行动中
            </Badge>
          )}
          {isAiProcessing && (
            <Badge className="bg-purple-600 animate-pulse text-xs">
              ⏳ AI思考中
            </Badge>
          )}
        </div>

        <div className="flex items-center gap-3">
          {/* Force count — during deployment show deployed counts, otherwise alive/initial */}
          <div className="flex items-center gap-1.5 text-xs text-white">
            {isDeployment ? (
              <span className="text-green-400 font-medium">已部署 {deployedRedForces.length} 支 (预算{redBudget}/{deployment ? 100 : 0})</span>
            ) : (
              <>
                <span className="text-red-400 font-medium">红 {redForces.length}/{redInitial}</span>
                <span className="text-gray-600">|</span>
                <span className="text-blue-400 font-medium">蓝 {blueForces.length}/{blueInitial}</span>
                {reinInfo && !isDeployment && (
                  <>
                    <span className="text-gray-600">|</span>
                    <span className="text-purple-400 font-medium text-[10px]">
                      增援 {reinInfo.redReinforcementsRemaining}/{reinInfo.maxReinforcements}
                    </span>
                    <span className="text-gray-600">|</span>
                    <span className="text-amber-300 text-[10px]">
                      下次: T{reinInfo.nextReinforcementTurn}
                    </span>
                  </>
                )}
              </>
            )}
          </div>

          <div className="flex gap-1">
            {isDeployment ? (
              <>
                <Button
                  size="sm"
                  className="h-6 px-2 bg-green-700 hover:bg-green-600 text-white text-[10px] font-medium"
                  onClick={handleConfirmDeployment}
                  disabled={deployedRedForces.length === 0}
                >
                  <Check className="w-3 h-3 mr-0.5" />确认部署
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 border-green-500/40 text-green-400 hover:bg-green-900/30 text-[10px]"
                  onClick={handleAutoDeploy}
                >
                  <Wand2 className="w-3 h-3 mr-0.5" />自动部署
                </Button>
              </>
            ) : currentFaction === 'red' && phase !== 'gameOver' && !isAiProcessing && (
              <>
                {selectedForce && (
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-white border-white/30 hover:bg-white/10 text-[11px]"
                    onClick={handleDeselect}
                  >
                    <X className="w-3 h-3 mr-0.5" />取消
                  </Button>
                )}
                <motion.button
                  className="h-6 px-1.5 bg-purple-700 hover:bg-purple-600 text-white text-[10px] rounded-md flex items-center gap-0.5 font-medium cursor-pointer"
                  onClick={() => useStrategicStore.getState().onAutoPlayTurn()}
                  title="AI自动执行红方回合"
                >
                  ⏩ 自动
                </motion.button>
                <motion.button
                  className="h-6 px-1.5 bg-red-700 hover:bg-red-600 text-white text-[10px] rounded-md flex items-center gap-0.5 font-medium cursor-pointer"
                  onClick={() => useStrategicStore.getState().onQuickResolve()}
                  title="快速结算所有战斗"
                >
                  ⚡ 快速
                </motion.button>
                <motion.button
                  className="h-6 px-2 bg-amber-600 hover:bg-amber-700 text-white text-[11px] rounded-md flex items-center gap-0.5 font-medium cursor-pointer"
                  onClick={handleEndTurn}
                  animate={{
                    boxShadow: ['0 0 0px rgba(245,158,11,0)', '0 0 8px rgba(245,158,11,0.4)', '0 0 0px rgba(245,158,11,0)'],
                  }}
                  transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                >
                  <SkipForward className="w-3 h-3" />结束回合
                </motion.button>
              </>
            )}

            {/* Game speed control */}
            {!isDeployment && (
              <div className="flex items-center gap-0.5">
                {([1, 2, 3] as const).map(spd => (
                  <motion.button
                    key={spd}
                    className={`h-6 px-1.5 rounded text-[10px] font-bold cursor-pointer flex items-center gap-0.5 ${
                      gameSpeed === spd
                        ? 'bg-amber-600 text-white'
                        : 'bg-white/10 text-gray-400 hover:bg-white/20 hover:text-white'
                    }`}
                    onClick={() => useStrategicStore.getState().setGameSpeed(spd)}
                    title={`游戏速度 ${spd}x`}
                  >
                    <Zap className="w-2.5 h-2.5" />{spd}x
                  </motion.button>
                ))}
              </div>
            )}

            {/* Save/Load button */}
            {!isDeployment && (
              <motion.button
                className="h-6 px-1.5 bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white text-[10px] rounded-md flex items-center gap-0.5 font-medium cursor-pointer"
                onClick={() => useStrategicStore.getState().toggleSavePanel()}
                title="存档/读档"
              >
                <Save className="w-3 h-3" />存档
              </motion.button>
            )}

            {/* WorldAtlas Generate Button */}
            {worldAtlasMode ? (
              <button onClick={toggleWorldAtlasMode} className="px-2 py-1 text-xs bg-cyan-600 text-white rounded cursor-pointer">
                退出地图
              </button>
            ) : (
              <button onClick={generateWorldAtlasAndRegion} className="px-2 py-1 text-xs bg-cyan-600 text-white rounded cursor-pointer">
                🌍 生成WorldAtlas
              </button>
            )}

            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-white border-white/30 hover:bg-white/10 text-[11px]"
              onClick={handleModeSwitch}
            >
              <ArrowLeftRight className="w-3 h-3 mr-0.5" />战术
            </Button>
          </div>
        </div>
      </div>

      {/* ===== Save/Load Panel Overlay ===== */}
      <AnimatePresence>
        {showSavePanel && (
          <motion.div
            className="absolute inset-0 z-[54] flex items-center justify-center"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
          >
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => useStrategicStore.getState().toggleSavePanel()} />
            <Card className="relative bg-black/90 backdrop-blur-md border-amber-500/30 text-white shadow-2xl max-w-sm w-full mx-4">
              <CardHeader className="pb-2 pt-4 px-6">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Save className="w-5 h-5 text-amber-400" />
                    <CardTitle className="text-base">战略存档 / 读档</CardTitle>
                  </div>
                  <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-white" onClick={() => useStrategicStore.getState().toggleSavePanel()}>
                    <X className="w-4 h-4" />
                  </Button>
                </div>
              </CardHeader>
              <CardContent className="px-6 pb-4 space-y-2">
                {([1, 2, 3] as const).map(slot => {
                  const info = (() => {
                    try {
                      const infoStr = localStorage.getItem(`iron-chess-strategic-save-${slot}-info`);
                      return infoStr ? JSON.parse(infoStr) as StrategicSaveSlotInfo : null;
                    } catch {
                      return null;
                    }
                  })();
                  const canSave = phase !== 'gameOver' && phase !== 'deployment' && currentFaction === 'red' && !isAiProcessing;
                  return (
                    <div key={slot} className="bg-white/5 border border-white/10 rounded-lg p-3 space-y-2">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <Badge variant="outline" className="text-amber-400 border-amber-500/40 text-xs font-bold">存档 {slot}</Badge>
                          {info ? (
                            <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
                              <span>第{info.turn}回合</span>
                              <span className="text-gray-600">|</span>
                              <span className="text-red-400">红{info.redForces}</span>
                              <span className="text-gray-600">:</span>
                              <span className="text-blue-400">蓝{info.blueForces}</span>
                            </div>
                          ) : (
                            <span className="text-xs text-gray-600">--- 空 ---</span>
                          )}
                        </div>
                      </div>
                      {info && (
                        <div className="text-[9px] text-gray-500">
                          {new Date(info.timestamp).toLocaleString('zh-CN', { 
                            month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' 
                          })}
                        </div>
                      )}
                      <div className="flex items-center gap-1.5">
                        <Button
                          size="sm"
                          className="h-6 px-2.5 bg-green-700 hover:bg-green-600 text-white text-[10px] flex-1"
                          onClick={() => { handleSaveGame(slot); useStrategicStore.getState().toggleSavePanel(); }}
                          disabled={!canSave}
                        >
                          保存
                        </Button>
                        <Button
                          size="sm"
                          className="h-6 px-2.5 bg-blue-700 hover:bg-blue-600 text-white text-[10px] flex-1"
                          onClick={() => handleLoadGame(slot)}
                          disabled={!info}
                        >
                          读取
                        </Button>
                        {info && (
                          <Button
                            size="sm"
                            variant="ghost"
                            className="h-6 px-2 text-red-400 hover:text-red-300 hover:bg-red-900/30 text-[10px]"
                            onClick={() => handleDeleteSave(slot)}
                          >
                            <Trash2 className="w-3 h-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  );
                })}
                <div className="text-[10px] text-gray-500 mt-2 text-center">
                  仅可在红方回合保存 · 按Esc或点击外部关闭
                </div>
              </CardContent>
            </Card>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== Save Toast ===== */}
      <AnimatePresence>
        {saveToast && (
          <motion.div
            className="absolute top-16 left-1/2 -translate-x-1/2 z-[55] px-4 py-2 rounded-lg bg-black/90 backdrop-blur-md border border-amber-500/30 text-amber-300 text-xs font-bold shadow-xl pointer-events-none"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.3 }}
          >
            {saveToast}
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== DEPLOYMENT BANNER ===== */}
      <AnimatePresence>
        {isDeployment && (
          <motion.div
            className="flex-shrink-0 bg-gradient-to-r from-green-900/80 via-emerald-900/80 to-green-900/80 border-b border-green-500/40 px-3 py-1.5 text-center z-20"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            <div className="flex items-center justify-center gap-2 text-[11px]">
              <Star className="w-3.5 h-3.5 text-green-400 fill-green-400" />
              <span className="text-green-300 font-bold">部署阶段</span>
              <span className="text-green-400/80">— 选择部队模板，然后点击左侧区域(x:0-2)放置</span>
              <Star className="w-3.5 h-3.5 text-green-400 fill-green-400" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== REINFORCEMENT NOTIFICATION ===== */}
      <AnimatePresence>
        {lastReinforcementSpawned && (
          <motion.div
            className="flex-shrink-0 bg-gradient-to-r from-purple-900/80 via-violet-900/80 to-purple-900/80 border-b border-purple-500/40 px-3 py-1.5 text-center z-20"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
          >
            <div className="flex items-center justify-center gap-2 text-[11px]">
              <Zap className="w-3.5 h-3.5 text-purple-400" />
              <span className="text-purple-300 font-bold">增援到达！</span>
              <span className="text-purple-400/80">— 新的增援部队已加入战场</span>
              <Zap className="w-3.5 h-3.5 text-purple-400" />
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== MAIN CONTENT ===== */}
      <div className="flex-1 flex overflow-hidden">
        {/* ===== LEFT PANEL (Enhanced) ===== */}
        <div className="flex-shrink-0 w-52 bg-black/40 backdrop-blur border-r border-white/10 overflow-y-auto">
          {/* Deployment Phase Panel */}
          {isDeployment ? (
            <div className="p-2 space-y-2">
              <div className="text-[11px] font-bold text-green-400 flex items-center gap-1">
                <Star className="w-3.5 h-3.5 fill-green-400" />部署阶段
              </div>

              {/* Budget tracker */}
              <div className="p-2 rounded bg-green-900/30 border border-green-500/30">
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-white/70">红方预算</span>
                  <span className="text-green-400 font-bold text-xs">{redBudget} / 100</span>
                </div>
                <div className="h-1.5 bg-black/40 rounded-full overflow-hidden mt-1">
                  <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${redBudget}%` }} />
                </div>
              </div>

              {/* Available templates */}
              <div className="space-y-1">
                <div className="text-[9px] text-white/50 font-medium">可选部队</div>
                {Object.entries(FORCE_TEMPLATES).map(([key, template]) => {
                  const cost = TEMPLATE_COSTS[key] || 0;
                  const canAfford = redBudget >= cost;
                  const isSelected = selectedTemplate === key;
                  return (
                    <button
                      key={key}
                      className={`w-full flex items-center gap-1.5 px-1.5 py-1 rounded text-[10px] text-left transition-all cursor-pointer
                        ${isSelected ? 'bg-green-800/60 ring-1 ring-green-400' : canAfford ? 'bg-white/5 hover:bg-white/10' : 'bg-white/3 opacity-50 cursor-not-allowed'}
                      `}
                      onClick={() => canAfford && setSelectedTemplate(isSelected ? null : key)}
                      disabled={!canAfford}
                    >
                      <span className="flex-shrink-0">{FORCE_TYPE_EMOJI[key]}</span>
                      <div className="flex-1 min-w-0">
                        <span className="block truncate text-white/90">{template.name}</span>
                        <div className="flex gap-0.5 mt-0.5">
                          {template.units.map((u, i) => (
                            <span key={i} className="text-white/40" title={UNIT_CONFIGS[u.type]?.name}>{FORCE_TYPE_ICONS[u.type]}</span>
                          ))}
                        </div>
                      </div>
                      <Badge className={`text-[7px] px-0.5 py-0 h-3 flex-shrink-0 ${canAfford ? 'bg-amber-600/80 text-white' : 'bg-gray-700 text-gray-400'}`}>
                        {cost}
                      </Badge>
                    </button>
                  );
                })}
              </div>

              <Separator className="bg-white/10" />

              {/* Deployed forces list with position info */}
              <div className="space-y-1">
                <div className="text-[9px] text-white/50 font-medium">已部署 ({deployedRedForces.length})</div>
                <div className="space-y-0.5 max-h-32 overflow-y-auto">
                  {deployedRedForces.map(force => {
                    const sectorName = map.sectors[force.position.y]?.[force.position.x]?.name || '';
                    return (
                      <div key={force.id} className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/5 text-[10px]">
                        <span className="flex-shrink-0">{FORCE_TYPE_EMOJI[getForceTemplateType(force)]}</span>
                        <div className="flex-1 min-w-0">
                          <span className="block truncate text-white/80">{force.name}</span>
                          <span className="block text-[8px] text-white/40 truncate">📍{sectorName} ({force.position.x},{force.position.y})</span>
                        </div>
                        <button
                          className="text-red-400 hover:text-red-300 p-0.5 cursor-pointer flex-shrink-0"
                          onClick={() => handleRemoveForce(force.id)}
                          title="移除"
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    );
                  })}
                  {deployedRedForces.length === 0 && (
                    <div className="text-[9px] text-gray-600 text-center py-1">尚未部署</div>
                  )}
                </div>
              </div>

              <Separator className="bg-white/10" />

              {/* Action buttons */}
              <div className="space-y-1">
                <Button
                  size="sm"
                  className="w-full h-7 bg-green-700 hover:bg-green-600 text-white text-[10px]"
                  onClick={handleConfirmDeployment}
                  disabled={deployedRedForces.length === 0}
                >
                  <Check className="w-3 h-3 mr-1" />确认部署
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="w-full h-7 border-green-500/40 text-green-400 hover:bg-green-900/30 text-[10px]"
                  onClick={handleAutoDeploy}
                >
                  <Wand2 className="w-3 h-3 mr-1" />自动部署
                </Button>
              </div>
            </div>
          ) : (
          <>
          {/* Selected force info */}
          {selectedForce ? (
            <div className="p-2">
              <ForceInfoPanel
                force={selectedForce}
                onMove={handleMoveAction}
                onAttack={handleAttackAction}
              />
            </div>
          ) : (
            <div className="p-3 text-[10px] text-gray-500 text-center">
              <Shield className="w-5 h-5 mx-auto mb-1 text-gray-600" />
              点击己方部队查看详情
            </div>
          )}
          </>
          )}

          <Separator className="bg-white/10" />

          {/* Force list */}
          <div className="p-2">
            <div className="text-[10px] font-bold text-red-400 mb-1 flex items-center gap-1">
              <Star className="w-3 h-3 fill-red-400" />红方部队
            </div>
            <div className="space-y-0.5">
              {redForces.map(force => (
                <motion.div
                  key={force.id}
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] cursor-pointer transition-all hover:bg-white/10
                    ${selectedForce?.id === force.id ? 'bg-red-900/40 ring-1 ring-red-500' : ''}
                    ${!force.canMove && !force.hasAttacked ? 'opacity-60' : ''}
                  `}
                  onClick={() => useStrategicStore.getState().selectForce(force)}
                  whileHover={{ x: 2 }}
                  transition={{ duration: 0.1 }}
                >
                  <div className="w-2 h-2 rounded-full bg-red-500 flex-shrink-0" />
                  <span className="truncate flex-1">{force.name}</span>
                  {force.canMove && (
                    <span className="w-1.5 h-1.5 rounded-full bg-green-400 animate-pulse" />
                  )}
                  {!force.hasAttacked && force.canMove && (
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-400 animate-pulse" />
                  )}
                  <span className="text-white/40 text-[9px]">{force.units.reduce((s, u) => s + u.count, 0)}</span>
                </motion.div>
              ))}
            </div>
          </div>

          <Separator className="bg-white/10" />

          <div className="p-2">
            <div className="text-[10px] font-bold text-blue-400 mb-1 flex items-center gap-1">
              <Shield className="w-3 h-3 fill-blue-400" />蓝方部队
            </div>
            <div className="space-y-0.5">
              {blueForces.map(force => (
                <div
                  key={force.id}
                  className={`flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px]
                    ${!force.canMove ? 'opacity-60' : ''}
                  `}
                >
                  <div className="w-2 h-2 rounded-full bg-blue-500 flex-shrink-0" />
                  <span className="truncate flex-1 text-white/70">{force.name}</span>
                  <span className="text-white/40 text-[9px]">{force.units.reduce((s, u) => s + u.count, 0)}</span>
                </div>
              ))}
            </div>
          </div>

          <Separator className="bg-white/10" />

          {/* Terrain Legend */}
          <div className="p-2">
            <div
              className="flex items-center gap-1 text-[10px] text-white/60 cursor-pointer hover:text-white/80"
              onClick={() => setShowLegend(!showLegend)}
            >
              <MapPin className="w-3 h-3" />
              <span>地形图例</span>
              {showLegend ? <ChevronRight className="w-2.5 h-2.5 rotate-90" /> : <ChevronRight className="w-2.5 h-2.5" />}
            </div>
            {showLegend && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                className="mt-1"
              >
                <TerrainLegend />
              </motion.div>
            )}
          </div>

          {/* Force type legend */}
          <div className="p-2">
            <div className="text-[9px] text-white/50 mb-1">部队类型</div>
            <div className="grid grid-cols-2 gap-0.5 text-[8px]">
              {Object.entries(FORCE_TYPE_EMOJI).map(([key, emoji]) => {
                const names: Record<string, string> = {
                  armor: '装甲营', mech_inf: '机步营', artillery: '炮兵营',
                  recon: '侦察营', air_defense: '防空营', engineer: '工兵营', combined: '综合旅',
                };
                return (
                  <div key={key} className="flex items-center gap-0.5">
                    <span>{emoji}</span>
                    <span className="text-white/60">{names[key]}</span>
                  </div>
                );
              })}
            </div>
          </div>

          {/* AIReportPanel */}
          <div className="mt-4 border-t border-gray-700 pt-3">
            <div className="flex justify-between items-center mb-2">
              <span className="text-xs text-cyan-400 font-bold">📋 情报报告 ({aiReports.length})</span>
              <button onClick={clearReports} className="text-xs text-gray-500 hover:text-red-400 cursor-pointer">清除</button>
            </div>
            <AIReportPanel
              reports={aiReports}
              onAcknowledge={() => {}}
            />
          </div>

          {/* ForceDelegationPanel */}
          {selectedForce && selectedForce.faction === currentFaction && (
            <div className="mt-4 border-t border-gray-700 pt-3">
              <ForceDelegationPanel
                forceStates={[{
                  forceId: selectedForce.id,
                  controller: 'player_direct',
                  currentOrderIds: [],
                  autonomy: 'normal',
                  reportLevel: 'normal',
                  riskTolerance: 'medium',
                }]}
                onDelegate={(forceId, autonomy, riskTolerance) => {
                  delegateForceToAICommand(forceId, autonomy, riskTolerance, 'normal');
                }}
                onRecall={(forceId) => {
                  recallForceFromAICommand(forceId);
                }}
              />
            </div>
          )}
        </div>

        {/* ===== MAP GRID ===== */}
        <div className="flex-1 flex items-center justify-center p-3 overflow-auto">
          <div className="relative">
            {/* Grid container */}
            <div
              className="grid gap-0.5"
              style={{
                gridTemplateColumns: `repeat(${map.width}, minmax(0, 1fr))`,
                gridTemplateRows: `repeat(${map.height}, minmax(0, 1fr))`,
                width: `min(calc(100vw - 240px - 1.5rem), calc((100vh - 120px) / ${map.height} * ${map.width}))`,
                aspectRatio: `${map.width} / ${map.height}`,
              }}
            >
              {map.sectors.flat().map(sector => {
                const key = `${sector.position.x},${sector.position.y}`;
                const isVisible = isDeployment ? true : visibleSectors.has(key);
                const isMovable = movableSet.has(key);
                const isAttackable = attackableSet.has(key);
                const isSelectedForce = selectedForce?.position.x === sector.position.x && selectedForce?.position.y === sector.position.y;
                const isInTerritory = territorySet.has(`${key},${currentFaction}`);
                const moveCost = moveCostMap.get(key) ?? null;
                const isDeployZone = isDeployment && sector.position.x <= 2;
                const isReinforcementPulseSector = showReinforcementPulse && reinInfo && !isDeployment && (
                  (sector.position.x <= 1 && reinInfo.redReinforcementsRemaining > 0) ||
                  (sector.position.x >= 8 && reinInfo.blueReinforcementsRemaining > 0)
                );
                return (
                  <div key={key} className="relative">
                    <SectorCell
                      sector={sector}
                      isVisible={isVisible}
                      isMovable={isMovable}
                      isAttackable={isAttackable}
                      isSelectedForce={isSelectedForce}
                      combatFlashKey={combatFlashId}
                      moveCost={moveCost}
                      isInTerritory={isInTerritory}
                      onClick={() => isDeployment ? handleDeploymentClick(sector.position) : handleSectorClick(sector.position)}
                    />
                    {/* Deployment zone overlay */}
                    {isDeployZone && (
                      <div
                        className={`absolute inset-0 z-[8] rounded-sm pointer-events-none transition-all
                          ${sector.force
                            ? sector.force.faction === 'red'
                              ? 'border-2 border-green-400/60 bg-green-400/10'
                              : 'bg-green-400/5'
                            : STRATEGIC_TERRAIN_CONFIGS[sector.terrain].isPassable
                              ? selectedTemplate
                                ? 'bg-green-400/25 border border-dashed border-green-400/50'
                                : 'bg-green-400/15 border border-green-400/30'
                              : 'bg-green-400/5'
                          }
                        `}
                      >
                        {!sector.force && STRATEGIC_TERRAIN_CONFIGS[sector.terrain].isPassable && selectedTemplate && (
                          <motion.div
                            className="absolute inset-0 flex items-center justify-center"
                            animate={{ opacity: [0.4, 0.8, 0.4] }}
                            transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                          >
                            <Plus className="w-3 h-3 text-green-400/60" />
                          </motion.div>
                        )}
                        {/* Deployed red force indicator */}
                        {sector.force && sector.force.faction === 'red' && (
                          <div className="absolute inset-0 flex items-center justify-center">
                            <div className="w-3.5 h-3.5 rounded-full bg-green-500/30 border border-green-400/50 flex items-center justify-center">
                              <span className="text-[7px] text-green-400 font-bold">✓</span>
                            </div>
                          </div>
                        )}
                      </div>
                    )}
                    {/* Reinforcement spawn pulse indicator */}
                    {isReinforcementPulseSector && !isDeployZone && (
                      <motion.div
                        className="absolute inset-0 z-[8] rounded-sm pointer-events-none border-2 border-purple-400/60"
                        animate={{
                          backgroundColor: ['rgba(168,85,247,0.0)', 'rgba(168,85,247,0.25)', 'rgba(168,85,247,0.0)'],
                          borderColor: ['rgba(168,85,247,0.3)', 'rgba(168,85,247,0.8)', 'rgba(168,85,247,0.3)'],
                        }}
                        transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                      >
                        <motion.div
                          className="absolute inset-0 flex items-center justify-center"
                          animate={{ opacity: [0.3, 1, 0.3], scale: [0.8, 1.1, 0.8] }}
                          transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                        >
                          <span className="text-[8px] text-purple-300 font-bold drop-shadow-lg">增援</span>
                        </motion.div>
                      </motion.div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Turn Transition (Enhanced - slide from left/right based on faction) */}
            <AnimatePresence>
              {turnTransition && (
                <motion.div
                  className="absolute inset-0 z-50 flex items-center justify-center pointer-events-none"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                >
                  <motion.div
                    className={`px-10 py-6 rounded-2xl backdrop-blur-xl border-2 shadow-2xl ${
                      turnTransition.faction === 'red'
                        ? 'bg-red-950/80 border-red-500/50'
                        : 'bg-blue-950/80 border-blue-500/50'
                    }`}
                    initial={{
                      x: turnTransition.faction === 'red' ? -200 : 200,
                      scale: 0.8,
                      opacity: 0,
                    }}
                    animate={{ x: 0, scale: 1, opacity: 1 }}
                    exit={{
                      x: turnTransition.faction === 'red' ? 200 : -200,
                      scale: 0.9,
                      opacity: 0,
                    }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                  >
                    <div className="text-center">
                      <div className="flex items-center justify-center gap-2 mb-2">
                        {turnTransition.faction === 'red' ? (
                          <Star className="w-8 h-8 text-red-400 fill-red-400" />
                        ) : (
                          <Shield className="w-8 h-8 text-blue-400 fill-blue-400" />
                        )}
                      </div>
                      <div className={`text-3xl font-bold mb-1 ${
                        turnTransition.faction === 'red' ? 'text-red-300' : 'text-blue-300'
                      }`}>
                        {turnTransition.faction === 'red' ? '红方回合' : '蓝方回合'}
                      </div>
                      <div className="text-sm text-white/60">
                        第 {turnTransition.turn} 回合
                      </div>
                      <div className="mt-2 text-[10px] text-white/40">
                        {turnTransition.faction === 'red' ? '选择部队执行行动' : 'AI正在思考...'}
                      </div>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>

      {/* WorldAtlas Mode Panels */}
      {selectedOperationView && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center">
          <div className="bg-gray-900 border border-cyan-700 rounded-lg p-4 max-w-5xl w-full max-h-[90vh] overflow-auto">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-cyan-400 font-bold text-lg">
                🔍 OperationView — {selectedOperationView.cells.length > 0 ? `${selectedOperationView.cells.length}x${selectedOperationView.cells[0]?.length ?? 0}` : 'Loading...'}
              </h3>
              <button onClick={closeOperationView} className="text-gray-400 hover:text-white text-xl">&times;</button>
            </div>
            <OperationViewPanel
              operationView={selectedOperationView}
              onClose={closeOperationView}
              onCellClick={(pos) => {
                openCombatViewportFromOperationCell(pos);
              }}
            />
          </div>
        </div>
      )}

      {selectedCombatViewport && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center">
          <div className="bg-gray-900 border border-red-700 rounded-lg p-4 max-w-4xl w-full max-h-[90vh] overflow-auto">
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-red-400 font-bold text-lg">⚔️ CombatViewport {selectedCombatViewport.worldRect.width}x{selectedCombatViewport.worldRect.height}</h3>
              <button onClick={closeCombatViewport} className="text-gray-400 hover:text-white text-xl">&times;</button>
            </div>
            <div className="text-gray-300 text-sm space-y-3">
              <p>Battleground ready. Click below to enter tactical mode.</p>
              <button
                onClick={enterTacticalFromCombatViewport}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white rounded-lg font-bold"
              >
                进入战术战斗
              </button>
            </div>
          </div>
        </div>
      )}

    {/* ===== BOTTOM BAR - Combat Log (Enhanced) ===== */}
    <div className="flex-shrink-0 bg-black/50 backdrop-blur border-t border-white/10 px-3 py-1.5">
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-amber-400 font-bold flex-shrink-0 flex items-center gap-0.5">
            <Zap className="w-3 h-3" />战斗日志
          </span>
          <ScrollArea className="flex-1 max-h-20">
            <div className="space-y-0.5">
              {combatLog.length === 0 ? (
                <div className="text-[10px] text-gray-600">暂无战斗记录</div>
              ) : (
                [...combatLog].reverse().slice(0, 15).map((log, i) => (
                  <CombatLogEntry key={combatLog.length - i} log={log} isLatest={i === 0} />
                ))
              )}
            </div>
          </ScrollArea>
        </div>
      </div>

      {/* Command Input */}
      <div className="flex-shrink-0 bg-black/40 backdrop-blur border-t border-white/10 px-3 py-1.5">
        <CommandInputPanel
          onCommand={(text: string) => {
            const forceIds = selectedForce ? [selectedForce.id] : [];
            submitHQCommand(text, forceIds);
          }}
          selectedForceIds={selectedForce ? [selectedForce.id] : []}
          turn={turn}
        />
      </div>

      {/* ===== GAME OVER OVERLAY ===== */}
      <AnimatePresence>
        {phase === 'gameOver' && winner && (
          <motion.div
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              initial={{ scale: 0.5, y: 50 }}
              animate={{ scale: 1, y: 0 }}
              transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            >
              <Card className="bg-black/80 border-white/20 text-white text-center p-8 min-w-[300px]">
                <CardContent className="space-y-4">
                  <motion.div
                    className="text-6xl mb-2"
                    animate={{ rotate: [0, -10, 10, -10, 0], scale: [1, 1.1, 1] }}
                    transition={{ duration: 0.8, delay: 0.3 }}
                  >
                    🏆
                  </motion.div>
                  <h2 className={`text-3xl font-bold ${winner === 'red' ? 'text-red-400' : 'text-blue-400'}`}>
                    {winner === 'red' ? '红方' : '蓝方'}获胜！
                  </h2>
                  <p className="text-gray-400 text-sm">
                    经过 {turn} 回合的战略博弈，战役结束
                  </p>
                  <div className="flex items-center justify-center gap-4 text-xs">
                    <div className="text-red-400">红方存活 {redForces.length} 支</div>
                    <div className="text-gray-600">|</div>
                    <div className="text-blue-400">蓝方存活 {blueForces.length} 支</div>
                  </div>
                  <Button
                    className="bg-amber-600 hover:bg-amber-700 text-white"
                    onClick={() => useStrategicStore.getState().initStrategic(useStrategicStore.getState().aiDifficulty)}
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    再来一局
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ===== BATTLE CHOICE DIALOG ===== */}
      <AnimatePresence>
        {showBattleChoiceDialog && tacticalBattleConfig && (
          <BattleChoiceDialog />
        )}
      </AnimatePresence>
    </div>
  );
}
