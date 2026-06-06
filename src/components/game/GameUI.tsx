'use client';

import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { useShallow } from 'zustand/react/shallow';
import { useGameStore, type SaveSlotInfo } from '@/store/game-store';
import { useMissionStore } from '@/store/mission-store';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { 
  Swords, Shield, Eye, Footprints, Truck, 
  Target, RotateCcw, SkipForward, ChevronRight,
  MapPin, Mountain, TreePine, Droplets, Building, 
  Route, Waves, Castle, Flag,
  Undo2, Clock, Zap, Crosshair, X, Move, 
  AlertTriangle, ChevronUp, ChevronDown, ArrowUpRight,
  ArrowDownRight, Info, Keyboard, ChevronLeft, PanelLeftClose, PanelLeftOpen,
  Radar, Wrench, Package, Plane, Rocket, Heart, BrickWall, Play, Pause, EyeOff,
  Check, Wand2, Trash2, Star, Plus, Save, Volume2, VolumeX, ArrowLeftRight, Settings, Copy, Trophy, ScrollText, GitCompareArrows, Timer, Home, PlayCircle, GraduationCap, BarChart3, TrendingUp, TrendingDown, Bot, Send, Skull, Bell, BellRing, Sun, Cloud, Users, Flame, Crown
} from 'lucide-react';
import { TACTICAL_UNIT_COSTS, TACTICAL_DEPLOYMENT_BUDGET, CombatLogEntry, TurnSummary, Position, Unit, CombatToast, UnitType, LevelUpNotification as LevelUpNotifType, BattleStats as BattleStatsType, WeatherType, ReplayState, TUTORIAL_STEPS, DamagePopup } from '@/game/types';
import { MORALE_HIGH_THRESHOLD, MORALE_LOW_THRESHOLD, MORALE_CRUSH_THRESHOLD, UNIT_CONFIGS, TERRAIN_CONFIGS, WEATHER_CONFIGS, MAP_WIDTH, MAP_HEIGHT, MAX_LEVEL, LEVEL_XP_THRESHOLDS, LEVEL_UP_BONUSES, FORTIFY_DEFENSE_BONUS, REINFORCEMENT_INTERVAL } from '@/game/config';
import { estimateDamage, getReinforcementInfo, getKillStreakLabel, getVeterancyTitle, calculateKillProbability } from '@/game/engine';
import { getHeroesForFaction, getHeroDefinition } from '@/game/heroes';
import type { HeroDefinition } from '@/game/heroes';
// v90.0: Moved MissionOverlay import above function definition
import MissionOverlay from '@/components/game/MissionOverlay';

// v56.0: Helper to compute effective attack range including hero passive bonuses
// v89.0: Fixed — must check a.type === 'passive' to match game-store.ts logic
// Active abilities with attackRangeBonus should NOT boost range display
function getEffectiveAttackRange(unit: Unit): number {
  const bonus = unit.abilities?.find(a => a.type === 'passive' && a.effect?.attackRangeBonus)?.effect?.attackRangeBonus ?? 0;
  return unit.stats.attackRange + bonus;
}
import {
  type Achievement, type AchievementCategory, type PlayerStats, type GameResult,
  ACHIEVEMENTS, CATEGORY_LABELS,
  loadPlayerStats, savePlayerStats, updateStatsAfterGame,
  getUnlockedAchievements, getNewlyUnlocked, getAchievementProgress,
  resetAllStats, formatStatValue,
} from '@/game/achievements';
import Minimap from '@/components/game/Minimap';

// Unit icon mapping
const UNIT_ICONS: Record<string, React.ReactNode> = {
  tank: <Shield className="w-3.5 h-3.5" />,
  ifv: <Truck className="w-3.5 h-3.5" />,
  artillery: <Target className="w-3.5 h-3.5" />,
  scout: <Eye className="w-3.5 h-3.5" />,
  infantry: <Footprints className="w-3.5 h-3.5" />,
  sam: <Radar className="w-3.5 h-3.5" />,
  engineer: <Wrench className="w-3.5 h-3.5" />,
  supply: <Package className="w-3.5 h-3.5" />,
  helicopter: <Plane className="w-3.5 h-3.5" />,
  mlrs: <Rocket className="w-3.5 h-3.5" />,
};

const TERRAIN_ICONS: Record<string, React.ReactNode> = {
  plains: <MapPin className="w-3 h-3" />,
  forest: <TreePine className="w-3 h-3" />,
  mountain: <Mountain className="w-3 h-3" />,
  water: <Droplets className="w-3 h-3" />,
  city: <Building className="w-3 h-3" />,
  road: <Route className="w-3 h-3" />,
  swamp: <Waves className="w-3 h-3" />,
  bridge: <Flag className="w-3 h-3" />,
  desert: <MapPin className="w-3 h-3" />,
  fortress: <Castle className="w-3 h-3" />,
};

// ===== Keyboard Shortcuts Configuration =====
const SHORTCUTS = [
  // 回合控制
  { key: 'E', description: '结束回合', category: '回合控制', isHelpKey: false },
  { key: 'Z', description: '撤销上一步操作', category: '回合控制', isHelpKey: false },
  // 单位操作
  { key: 'Click', description: '选择单位', category: '单位操作', isHelpKey: false },
  { key: 'Click', description: '移动/攻击单位', category: '单位操作', isHelpKey: false },
  { key: 'R-Click', description: '自动寻路攻击敌人', category: '单位操作', isHelpKey: false },
  { key: 'F', description: '修建工事（工程车）', category: '单位操作', isHelpKey: false },
  { key: 'Q', description: '英雄技能（英雄选择阶段）', category: '单位操作', isHelpKey: false },
  { key: 'H', description: '进入隐蔽', category: '单位操作', isHelpKey: false },
  { key: 'W', description: '待机/跳过', category: '单位操作', isHelpKey: false },
  { key: 'S', description: '跳过当前单位', category: '单位操作', isHelpKey: false },
  { key: 'G', description: '排雷（工程车）', category: '单位操作', isHelpKey: false },
  { key: 'M', description: '移动模式', category: '单位操作', isHelpKey: false },
  { key: 'A', description: '攻击模式', category: '单位操作', isHelpKey: false },
  { key: 'Shift+A', description: 'AI 战术顾问', category: '信息面板', isHelpKey: false },
  // 视角控制
  { key: 'R-Drag', description: '平移视角', category: '视角控制', isHelpKey: false },
  { key: 'Scroll', description: '缩放视角', category: '视角控制', isHelpKey: false },
  { key: 'R', description: '重置视角', category: '视角控制', isHelpKey: false },
  { key: 'Tab', description: '循环切换单位', category: '视角控制', isHelpKey: false },
  // 信息面板
  { key: 'C', description: '坐标叠加 / 单位对比', category: '信息面板', isHelpKey: false },
  { key: 'Hover', description: '地形信息', category: '信息面板', isHelpKey: false },

  { key: 'B', description: '战斗统计标签页', category: '信息面板', isHelpKey: false },
  { key: 'T', description: '切换威胁范围', category: '信息面板', isHelpKey: false },
  { key: 'D', description: '切换地形防御覆盖', category: '信息面板', isHelpKey: false },
  { key: 'N', description: '通知中心', category: '信息面板', isHelpKey: false },
  { key: 'L', description: '全军总览', category: '信息面板', isHelpKey: false },
  // 系统
  { key: '?', description: '快捷键帮助', category: '系统', isHelpKey: true },
  { key: 'F1 / Esc', description: '暂停/继续', category: '系统', isHelpKey: false },
  { key: 'Shift+M', description: '静音切换', category: '系统', isHelpKey: false },
  { key: 'Esc', description: '取消/关闭面板', category: '系统', isHelpKey: false },
  { key: 'O', description: '设置面板', category: '系统', isHelpKey: false },
  { key: 'P', description: '存档/读档面板', category: '系统', isHelpKey: false },
  { key: '1-0', description: '按类型筛选单位', category: '系统', isHelpKey: false },
];

// ===== Faction Power Balance Gauge (实时战力对比仪) =====

// v76.0: Extracted default settings to avoid 4x duplication
const DEFAULT_SETTINGS = {
  volume: 80,
  confirmEndTurn: false,
  showDamageNumbers: true,
  showGridLines: true,
  showTurnTimer: true,
  autoSelectNextUnit: false,
  showCoordinates: false,
};

function PowerBalanceGauge() {
  // v53.0: Optimized selector — compute power scores inside store selector to avoid re-render on every unit change
  // v89.0: Removed capturePoints from selector — it was unused in this component
  // and caused unnecessary re-renders on every capture state change
  const { units } = useGameStore(useShallow(s => ({ units: s.units })));
  const redPower = useMemo(() => {
    const factionUnits = units.filter(u => u.faction === 'red' && u.isAlive);
    const totalHP = factionUnits.reduce((sum, u) => sum + u.stats.hp, 0);
    const heroBonus = factionUnits.filter(u => u.isHero).length * 20;
    const countBonus = factionUnits.length * 3;
    return totalHP + heroBonus + countBonus;
  }, [units]);
  const bluePower = useMemo(() => {
    const factionUnits = units.filter(u => u.faction === 'blue' && u.isAlive);
    const totalHP = factionUnits.reduce((sum, u) => sum + u.stats.hp, 0);
    const heroBonus = factionUnits.filter(u => u.isHero).length * 20;
    const countBonus = factionUnits.length * 3;
    return totalHP + heroBonus + countBonus;
  }, [units]);

  const total = redPower + bluePower || 1;
  const redPct = (redPower / total) * 100;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1 w-28 h-5 cursor-default">
          <div className="text-[9px] font-bold text-red-400 w-5 text-right shrink-0">{redPower}</div>
          <div className="relative flex-1 h-3.5 bg-gray-700/40 rounded-full overflow-hidden">
            <motion.div
              className="absolute inset-y-0 left-0 bg-gradient-to-r from-red-600 to-red-500 rounded-full"
              animate={{ width: `${redPct}%` }}
              transition={{ type: 'spring', stiffness: 200, damping: 25 }}
              style={{ boxShadow: '0 0 8px rgba(239,68,68,0.3)' }}
            />
            {/* Center marker */}
            <div className="absolute inset-y-0 left-1/2 w-px h-full bg-white/30 -translate-x-1/2 z-10" />
          </div>
          <div className="text-[9px] font-bold text-blue-400 w-5 text-left shrink-0">{bluePower}</div>
        </div>
      </TooltipTrigger>
      <TooltipContent>实时战力对比 (HP + 英雄 + 单位数)</TooltipContent>
    </Tooltip>
  );
}

// ===== Turn Number Indicator with Progress Ring (v25.0: AI difficulty badge) =====
function TurnIndicator({ turn, currentFaction, phase, units }: { turn: number; currentFaction: string; phase: string; units: any[] }) {
  const isAiTurn = phase === 'aiTurn';
  const totalUnits = units.filter((u: any) => u.faction === 'red' && u.isAlive).length;
  // v55.0: Count units that have used ANY action (partial or full) for accurate progress
  // v89.0: Count only FULLY exhausted units (both canMove AND canAttack are false)
  // Previously used OR which overcounted, showing 100% prematurely
  const actedUnits = units.filter((u: any) => u.faction === 'red' && u.isAlive && !u.canMove && !u.canAttack).length;
  const progress = totalUnits > 0 ? actedUnits / totalUnits : 0;
  
  // v25.0: AI dynamic difficulty — v31.0: merged with useShallow
  const { aiDynamicDifficulty, aiDifficulty } = useGameStore(useShallow(s => ({
    aiDynamicDifficulty: s.aiDynamicDifficulty,
    aiDifficulty: s.aiDifficulty,
  })));
  const displayDifficulty = aiDynamicDifficulty?.currentDifficulty ?? aiDifficulty;
  const hasAdjusted = aiDynamicDifficulty ? aiDynamicDifficulty.metrics.adjustmentCount > 0 : false;

  // SVG progress ring params
  const size = 28;
  const strokeWidth = 2.5;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference * (1 - progress);

  const diffLabel = displayDifficulty === 'easy' ? '简单' : displayDifficulty === 'normal' ? '普通' : '困难';
  const diffColor = displayDifficulty === 'easy' ? 'text-green-400 border-green-500/40 bg-green-500/20' : displayDifficulty === 'normal' ? 'text-yellow-400 border-yellow-500/40 bg-yellow-500/20' : 'text-red-400 border-red-500/40 bg-red-500/20';

  return (
    <div className={`relative flex items-center gap-1.5 ${isAiTurn ? 'opacity-50' : ''}`}>
      {/* Progress ring SVG */}
      <div className={`relative ${isAiTurn ? 'animate-spin' : ''}`} style={{ width: size, height: size, animationDuration: isAiTurn ? '2s' : '0s' }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle
            cx={size / 2} cy={size / 2} r={radius}
            fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={strokeWidth}
          />
          {!isAiTurn && (
            <circle
              cx={size / 2} cy={size / 2} r={radius}
              fill="none" stroke={currentFaction === 'red' ? '#ef4444' : '#3b82f6'} strokeWidth={strokeWidth}
              strokeDasharray={circumference} strokeDashoffset={offset}
              strokeLinecap="round"
              className="transition-all duration-500"
            />
          )}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          {isAiTurn ? (
            <span className="text-[8px]">⏳</span>
          ) : (
            <span className="text-[8px] text-white/80 font-bold">{actedUnits}</span>
          )}
        </div>
      </div>
      <div className="text-xs text-white font-medium whitespace-nowrap">
        第 {turn} 回合
      </div>
      {/* v25.0: AI difficulty badge */}
      <motion.div
        key={displayDifficulty}
        initial={hasAdjusted ? { scale: 1.2, opacity: 0 } : false}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 400, damping: 20 }}
        className={`text-[9px] px-1.5 py-0 rounded border ${diffColor}`}
        title={`AI难度: ${diffLabel}${hasAdjusted ? ' (已动态调整)' : ''}`}
      >
        🤖 {diffLabel}
        {hasAdjusted && <span className="ml-0.5 text-[8px]">⚡</span>}
      </motion.div>
      {/* v27.0: Unit exhaustion badge when all units acted */}
      {progress >= 1 && !isAiTurn && totalUnits > 0 && (
        <motion.div
          initial={{ scale: 0.8, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          className="text-[9px] px-1.5 py-0 rounded border text-green-400 border-green-500/40 bg-green-500/20"
        >
          ✓ 全部行动
        </motion.div>
      )}
    </div>
  );
}

// ===== Collapsible Panel Wrapper =====
function CollapsiblePanel({ 
  title, 
  summary, 
  defaultOpen, 
  children,
  headerClassName = '',
  className = '',
}: { 
  title: React.ReactNode; 
  summary?: React.ReactNode;
  defaultOpen: boolean;
  children: React.ReactNode;
  headerClassName?: string;
  className?: string;
}) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <Card className={`bg-black/40 backdrop-blur-xl border border-white/10 text-white shadow-xl shadow-black/20 overflow-hidden ${className}`}>
      <div className="h-0.5 bg-gradient-to-r from-transparent via-white/20 to-transparent" />
      <div
        className={`flex items-center gap-1.5 px-3 py-1.5 cursor-pointer hover:bg-white/5 transition-colors ${headerClassName}`}
        onClick={() => setIsOpen(!isOpen)}
      >
        <span className="text-xs font-medium text-white/80 flex-1">{title}</span>
        {summary && !isOpen && <span className="text-[10px] text-gray-400">{summary}</span>}
        {isOpen ? <ChevronUp className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
      </div>
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2, ease: 'easeInOut' }}
            className="overflow-hidden"
          >
            {children}
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}

// ===== Combat Log Entry Component (v25.0: Click-to-focus) =====
const CombatLogItem = React.memo(function CombatLogItem({ log, currentWeather }: { log: CombatLogEntry; currentWeather?: string }) {
  const isDestroy = log.eventType === 'destroy';
  const hasCounter = log.counterDamage && log.counterDamage > 0;
  const isCounter = log.eventType === 'counter';
  const isRetreat = log.action === 'retreat';
  const isWeatherAffected = currentWeather && currentWeather !== 'clear';
  const hasPosition = !!(log.attackerPosition || log.defenderPosition || log.attackerUnitId || log.defenderUnitId);
  // v49.0: Only subscribe to the specific unit needed for tooltip, not the full units array
  const tooltipUnitId = log.defenderUnitId || log.attackerUnitId;
  const tooltipUnit = useGameStore(s => {
    if (!tooltipUnitId) return null;
    return s.units.find(u => u.id === tooltipUnitId && u.isAlive) ?? null;
  });
  const { focusOnUnit, focusOnPosition } = useGameStore(useShallow(s => ({
    focusOnUnit: s.focusOnUnit,
    focusOnPosition: s.focusOnPosition,
  })));

  const handleClick = () => {
    if (!hasPosition) return;
    if (log.defenderUnitId) focusOnUnit(log.defenderUnitId!);
    else if (log.attackerUnitId) focusOnUnit(log.attackerUnitId!);
    else if (log.defenderPosition) focusOnPosition(log.defenderPosition);
    else if (log.attackerPosition) focusOnPosition(log.attackerPosition);
  };

  const tooltipContent = tooltipUnit ? (
    <div className="text-[10px] space-y-0.5 min-w-[120px]">
      <div className="flex items-center gap-1">
        <span className={tooltipUnit.faction === 'red' ? 'text-red-400' : 'text-blue-400'}>
          {tooltipUnit.name}
        </span>
        <span className="text-gray-500">Lv.{tooltipUnit.level}</span>
      </div>
      <div className="flex items-center gap-1">
        <span className="text-gray-400">HP:</span>
        <span className={tooltipUnit.stats.hp / tooltipUnit.stats.maxHp > 0.7 ? 'text-green-400' : tooltipUnit.stats.hp / tooltipUnit.stats.maxHp > 0.3 ? 'text-yellow-400' : 'text-red-400'}>
          {tooltipUnit.stats.hp}/{tooltipUnit.stats.maxHp}
        </span>
      </div>
      <div className="flex gap-2 text-gray-500">
        <span>⚔️{tooltipUnit.stats.attack}</span>
        <span>🛡️{tooltipUnit.stats.defense}</span>
        <span>👁️{tooltipUnit.stats.vision}</span>
      </div>
    </div>
  ) : null;

  if (isRetreat) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <div 
            className={`text-[11px] py-0.5 px-1.5 rounded transition-all duration-300 bg-gray-900/30 border-l-2 border-gray-500 ${hasPosition ? 'cursor-pointer hover:bg-gray-800/50' : ''}`}
            onClick={handleClick}
          >
            <span className="text-gray-500">[回合{log.turn}]</span>{' '}
            <span className={log.attackerFaction === 'red' ? 'text-red-400' : 'text-blue-400'}>
              {log.attacker}
            </span>
            {' '}
            <span className="text-gray-400">🚩 撤退</span>
            {hasPosition && <span className="text-gray-600 ml-1 text-[9px]">🎯</span>}
          </div>
        </TooltipTrigger>
        {tooltipContent && <TooltipContent side="right" className="bg-gray-900 border-gray-700 text-gray-200">{tooltipContent}</TooltipContent>}
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div 
          className={`text-[11px] py-0.5 px-1.5 rounded transition-all duration-300 ${
            isDestroy ? 'bg-red-900/40 border-l-2 border-red-500' : 
            isCounter ? 'bg-yellow-900/20 border-l-2 border-yellow-500' : 
            'bg-orange-900/20 border-l-2 border-orange-500'
          } ${hasPosition ? 'cursor-pointer hover:brightness-125' : ''}`}
          onClick={handleClick}
        >
          <span className="text-gray-500">[回合{log.turn}]</span>{' '}
          <span className={log.attackerFaction === 'red' ? 'text-red-400' : 'text-blue-400'}>
            {log.attacker}
          </span>
          {' ⚔️ '}
          <span className={log.attackerFaction === 'red' ? 'text-blue-400' : 'text-red-400'}>
            {log.defender}
          </span>
          {' '}
          <span className={`${isDestroy ? 'text-red-400' : 'text-orange-400'} font-bold`}>{log.damage}</span>
          {isDestroy && <Skull className="w-3.5 h-3.5 inline-block align-[-3px] text-red-400 ml-0.5" />}
          {hasCounter && (
            <span className="text-yellow-300">
              {' 反击'}
              <span className="font-bold">{log.counterDamage}</span>
              {log.wasCounterKill && <Skull className="w-3.5 h-3.5 inline-block align-[-3px] text-red-400 ml-0.5" />}
            </span>
          )}
          {/* v63.0→v69.0: Remaining HP bar in combat log (accurate + animated) */}
          {log.defenderRemainingHp > 0 && log.defenderRemainingHp < 9999 && (() => {
            const hpRatio = (log.defenderMaxHp || 0) > 0 ? log.defenderRemainingHp / (log.defenderMaxHp || 1) : 0.5;
            return (
            <span className="inline-flex items-center gap-0.5 ml-1">
              <span className="inline-block w-8 h-1 bg-gray-700 rounded-full overflow-hidden">
                <span
                  className="block h-full rounded-full transition-all duration-500 ease-out"
                  style={{
                    width: `${Math.min(100, (log.defenderRemainingHp / (log.defenderMaxHp || (log.defenderRemainingHp + log.damage))) * 100)}%`,
                    backgroundColor: hpRatio > 0.7 ? '#4ade80' : hpRatio > 0.3 ? '#fbbf24' : '#ef4444',
                  }}
                />
              </span>
              <span className="text-[9px] text-gray-500">{log.defenderRemainingHp}/{log.defenderMaxHp || '?'}</span>
            </span>
            );
          })()}
          {/* Enhancement icons */}
          {isWeatherAffected && <span className="text-blue-300 ml-0.5" title="天气影响">{currentWeather ? WEATHER_CONFIGS[currentWeather]?.icon || '🌧️' : '🌧️'}</span>}
          {hasPosition && <span className="text-gray-600 ml-0.5 text-[9px]">🎯</span>}
        </div>
      </TooltipTrigger>
      {tooltipContent && <TooltipContent side="right" className="bg-gray-900 border-gray-700 text-gray-200">{tooltipContent}</TooltipContent>}
    </Tooltip>
  );
});

// ===== Turn Summary Overlay (Enhanced v2) =====
const EVENT_ICONS: Record<string, { icon: React.ReactNode; color: string }> = {
  attack: { icon: <Swords className="w-3 h-3" />, color: 'text-orange-400' },
  destroy: { icon: <Skull className="w-3 h-3" />, color: 'text-red-400' },
  counter: { icon: <Shield className="w-3 h-3" />, color: 'text-yellow-400' },
  counter_destroy: { icon: <Skull className="w-3 h-3" />, color: 'text-red-500' },
  heal: { icon: <Heart className="w-3 h-3" />, color: 'text-green-400' },
  ability: { icon: <Zap className="w-3 h-3" />, color: 'text-purple-400' },
  capture: { icon: <Flag className="w-3 h-3" />, color: 'text-amber-400' },
  retreat: { icon: <ChevronLeft className="w-3 h-3" />, color: 'text-gray-400' },
};

const TurnSummaryOverlayInner = React.memo(function TurnSummaryOverlayInner({ summary, onDismiss }: { 
  summary: TurnSummary; 
  onDismiss: () => void;
}) {
  const isRed = summary.faction === 'red';
  const [sparkleKey, setSparkleKey] = useState(0);
  
  // Compute attack count from events
  const attackCount = summary.events.filter(e => e.type === 'attack').length;

  // Trigger sparkle animation
  useEffect(() => {
    // v72.0: Increased sparkle interval to match longest animation duration (2s)
    const interval = setInterval(() => setSparkleKey(k => k + 1), 2200);
    return () => clearInterval(interval);
  }, []);

  // Build stat rows for staggered animation
  const statRows = useMemo(() => {
    const rows: { label: string; value: number | string; icon: React.ReactNode; color: string; highlight: boolean }[] = [];
    rows.push({ label: '造成伤害', value: summary.totalDamageDealt, icon: <Swords className="w-3.5 h-3.5" />, color: 'text-orange-400', highlight: false });
    rows.push({ label: '承受伤害', value: summary.totalDamageReceived, icon: <Shield className="w-3.5 h-3.5" />, color: 'text-yellow-400', highlight: summary.totalDamageReceived > summary.totalDamageDealt });
    rows.push({ label: '击毁敌方', value: summary.unitsDestroyed, icon: <Target className="w-3.5 h-3.5" />, color: 'text-red-400', highlight: summary.unitsDestroyed > 0 });
    rows.push({ label: '损失单位', value: (summary as TurnSummary).unitsLost ?? 0, icon: <AlertTriangle className="w-3.5 h-3.5" />, color: 'text-red-500', highlight: ((summary as TurnSummary).unitsLost ?? 0) > 0 });
    if ((summary as TurnSummary).totalHealing > 0) {
      rows.push({ label: '单位治疗', value: `+${(summary as TurnSummary).totalHealing}`, icon: <Heart className="w-3.5 h-3.5" />, color: 'text-green-400', highlight: false });
    }
    rows.push({ label: '攻击次数', value: attackCount, icon: <Crosshair className="w-3.5 h-3.5" />, color: 'text-cyan-400', highlight: false });
    rows.push({ label: '行动单位', value: summary.unitsMoved, icon: <Footprints className="w-3.5 h-3.5" />, color: 'text-blue-300', highlight: false });
    if (((summary as TurnSummary).capturesGained ?? 0) > 0 || ((summary as TurnSummary).capturesLost ?? 0) > 0) {
      const gained = (summary as TurnSummary).capturesGained ?? 0;
      const lost = (summary as TurnSummary).capturesLost ?? 0;
      const capStr = gained > 0 && lost > 0 ? `+${gained}/-${lost}` : gained > 0 ? `+${gained}` : `-${lost}`;
      rows.push({ label: '据点变化', value: capStr, icon: <Flag className="w-3.5 h-3.5" />, color: gained >= lost ? 'text-amber-400' : 'text-orange-400', highlight: true });
    }
    if (((summary as TurnSummary).abilitiesUsed ?? []).length > 0) {
      rows.push({ label: '英雄技能', value: ((summary as TurnSummary).abilitiesUsed ?? []).join(', '), icon: <Zap className="w-3.5 h-3.5" />, color: 'text-purple-400', highlight: true });
    }
    return rows;
  }, [summary, attackCount]);

  const hasTimeline = summary.events.length > 0;

  return (
    <motion.div
      className="absolute inset-0 z-50 flex items-start justify-center pt-12 pointer-events-none"
      initial={{ opacity: 0, y: -20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={{ duration: 0.35, ease: 'easeOut' }}
    >
      <motion.div
        className="pointer-events-auto w-[380px] max-w-[95vw]"
        initial={{ scale: 0.92, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
      >
        <div className="bg-black/92 backdrop-blur-xl text-white shadow-2xl overflow-hidden rounded-lg"
          style={{ border: `1px solid ${isRed ? 'rgba(239,68,68,0.35)' : 'rgba(59,130,246,0.35)'}` }}
        >
          {/* ===== HEADER: Faction gradient banner ===== */}
          <div className={`relative px-5 py-3.5 flex items-center gap-3 overflow-hidden ${
            isRed 
              ? 'bg-gradient-to-r from-red-950 via-red-800/70 to-red-950' 
              : 'bg-gradient-to-r from-blue-950 via-blue-800/70 to-blue-950'
          }`}>
            {/* Animated sparkle particles */}
            <div className="absolute inset-0 overflow-hidden" key={sparkleKey}>
              {[...Array(8)].map((_, i) => (
                <motion.div
                  key={i}
                  className="absolute w-0.5 h-0.5 rounded-full bg-white/30"
                  initial={{ 
                    x: `${10 + Math.random() * 80}%`, y: '110%',
                    opacity: 0, scale: 0 
                  }}
                  animate={{ 
                    y: '-10%',
                    opacity: [0, 0.7, 0],
                    scale: [0, 1.8, 0],
                  }}
                  transition={{ 
                    duration: 1 + Math.random() * 1, 
                    delay: Math.random() * 0.6,
                    ease: 'easeOut' 
                  }}
                />
              ))}
            </div>
            {/* Decorative line at bottom of header */}
            <div className={`absolute bottom-0 left-0 right-0 h-px ${
              isRed ? 'bg-gradient-to-r from-transparent via-red-500/50 to-transparent' : 'bg-gradient-to-r from-transparent via-blue-500/50 to-transparent'
            }`} />
            <div className={`w-11 h-11 rounded-xl flex items-center justify-center shadow-lg ${
              isRed ? 'bg-red-600/50 border border-red-500/30' : 'bg-blue-600/50 border border-blue-500/30'
            }`}>
              <Flag className="w-5 h-5 text-white" />
            </div>
            <div className="relative z-10 flex-1">
              <div className="flex items-center gap-2">
                <span className={`text-lg font-extrabold tracking-wide ${isRed ? 'text-red-300' : 'text-blue-300'}`}>
                  {isRed ? '红方' : '蓝方'}战报
                </span>
                <Badge variant="outline" className={`text-[9px] px-1.5 py-0 h-4 font-normal ${
                  isRed ? 'border-red-500/40 text-red-400/80' : 'border-blue-500/40 text-blue-400/80'
                }`}>
                  TURN {summary.turn}
                </Badge>
              </div>
              <div className="text-[11px] text-white/50 mt-0.5">
                第 {summary.turn} 回合 · {isRed ? 'RED' : 'BLUE'} ARMY
              </div>
            </div>
            {/* Attack / Defense mini indicator */}
            <div className="relative z-10 flex flex-col items-end gap-0.5">
              <div className="flex items-center gap-1 text-[10px]">
                <Swords className="w-3 h-3 text-orange-400" />
                <span className="text-orange-300 font-bold">{summary.totalDamageDealt}</span>
              </div>
              <div className="flex items-center gap-1 text-[10px]">
                <Shield className="w-3 h-3 text-yellow-400" />
                <span className="text-yellow-300 font-bold">{summary.totalDamageReceived}</span>
              </div>
            </div>
          </div>

          {/* ===== STATS TABLE ===== */}
          <div className="px-4 pt-3 pb-2">
            {/* Stat rows with staggered animation */}
            <div className="space-y-1.5">
              {statRows.map((row, i) => (
                <motion.div
                  key={row.label}
                  className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-xs ${
                    row.highlight ? 'bg-white/[0.06]' : 'bg-white/[0.02]'
                  }`}
                  initial={{ opacity: 0, x: -12 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.3, delay: 0.08 + i * 0.05, ease: 'easeOut' }}
                >
                  <span className={row.color}>{row.icon}</span>
                  <span className="text-gray-400 text-[11px] w-16 shrink-0">{row.label}</span>
                  <span className={`ml-auto font-bold text-[12px] ${row.color}`}>{row.value}</span>
                </motion.div>
              ))}
            </div>
          </div>

          {/* ===== MINI TIMELINE ===== */}
          {hasTimeline && (
            <motion.div
              className="px-4 pb-2"
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              transition={{ duration: 0.3, delay: 0.08 + statRows.length * 0.05 }}
            >
              <div className={`h-px mb-2 ${
                isRed ? 'bg-gradient-to-r from-red-500/20 via-red-500/10 to-transparent' : 'bg-gradient-to-r from-blue-500/20 via-blue-500/10 to-transparent'
              }`} />
              <div className="text-[10px] text-gray-500 font-medium mb-1.5 flex items-center gap-1">
                <Timer className="w-3 h-3" />
                行动时间线
              </div>
              <div className="max-h-[140px] overflow-y-auto space-y-0.5 pr-1 custom-scrollbar-thin">
                {summary.events.map((event, i) => {
                  const evtStyle = EVENT_ICONS[event.type] || EVENT_ICONS.attack;
                  return (
                    <motion.div
                      key={i}
                      className={`flex items-start gap-2 px-2 py-1 rounded text-[11px] transition-colors ${
                        event.type === 'destroy' ? 'bg-red-950/40 hover:bg-red-950/60' :
                        event.type === 'heal' ? 'bg-green-950/30 hover:bg-green-950/50' :
                        event.type === 'ability' ? 'bg-purple-950/30 hover:bg-purple-950/50' :
                        event.type === 'capture' ? 'bg-amber-950/30 hover:bg-amber-950/50' :
                        'bg-white/[0.03] hover:bg-white/[0.06]'
                      }`}
                      initial={{ opacity: 0, x: -8 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ duration: 0.2, delay: 0.15 + statRows.length * 0.05 + i * 0.04 }}
                    >
                      <span className={`${evtStyle.color} mt-0.5 shrink-0`}>{evtStyle.icon}</span>
                      <span className="text-white/70 leading-tight flex-1">{event.description}</span>
                      {event.value !== undefined && event.type !== 'retreat' && event.type !== 'ability' && event.type !== 'capture' && (
                        <span className={`font-bold shrink-0 ${
                          event.type === 'destroy' ? 'text-red-400' :
                          event.type === 'counter' ? 'text-yellow-400' :
                          event.type === 'heal' ? 'text-green-400' :
                          'text-orange-400'
                        }`}>
                          {event.type === 'heal' ? '+' : '-'}{event.value}
                        </span>
                      )}
                    </motion.div>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* ===== CONTINUE BUTTON ===== */}
          <div className="px-4 pb-4 pt-2">
            <motion.div 
              whileHover={{ scale: 1.02 }} 
              whileTap={{ scale: 0.97 }}
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3, delay: 0.15 + (hasTimeline ? statRows.length * 0.05 + Math.min(summary.events.length, 6) * 0.04 : statRows.length * 0.05) }}
            >
              <Button
                size="sm"
                className={`w-full h-9 text-xs font-bold transition-all duration-300 tracking-wide ${
                  isRed 
                    ? 'bg-gradient-to-r from-red-700 to-red-600 hover:from-red-600 hover:to-red-500 shadow-lg shadow-red-900/40 hover:shadow-red-800/60' 
                    : 'bg-gradient-to-r from-blue-700 to-blue-600 hover:from-blue-600 hover:to-blue-500 shadow-lg shadow-blue-900/40 hover:shadow-blue-800/60'
                } text-white border border-white/10`}
                onClick={onDismiss}
              >
                <Play className="w-3.5 h-3.5 mr-1.5" />
                继续
              </Button>
            </motion.div>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
});

function TurnSummaryOverlay({ summary, onDismiss }: { 
  summary: TurnSummary | null; 
  onDismiss: () => void;
}) {
  if (!summary) return null;
  return (
    <TurnSummaryOverlayInner 
      key={`${summary.turn}-${summary.faction}`} 
      summary={summary} 
      onDismiss={onDismiss} 
    />
  );
}

// ===== Turn Transition Animation (v86.0: Cinematic sliding banner) =====
function TurnTransition({ transition }: { transition: { faction: string; turn: number; weatherChanged?: string; previousWeather?: string } | null }) {
  const [dismissed, setDismissed] = useState(false);

  // Reset dismissed state when transition changes
  useEffect(() => {
    if (transition) setDismissed(false);
  }, [transition]);

  if (!transition || dismissed) return null;

  const isRed = transition.faction === 'red';
  const slideFromX = isRed ? '-100%' : '100%';

  // Weather info for the banner
  const weatherName = transition.weatherChanged
    ? (WEATHER_CONFIGS[transition.weatherChanged as keyof typeof WEATHER_CONFIGS]?.name ?? transition.weatherChanged)
    : null;
  const weatherIcon = transition.weatherChanged
    ? (WEATHER_CONFIGS[transition.weatherChanged as keyof typeof WEATHER_CONFIGS]?.icon ?? '🌤️')
    : null;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed inset-0 z-[60] pointer-events-auto cursor-pointer"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.3 }}
        onClick={() => setDismissed(true)}
      >
        {/* Dark vignette background */}
        <motion.div
          className="absolute inset-0"
          style={{
            background: isRed
              ? 'radial-gradient(ellipse at center, rgba(185,28,28,0.2) 0%, rgba(0,0,0,0.6) 100%)'
              : 'radial-gradient(ellipse at center, rgba(21,101,192,0.2) 0%, rgba(0,0,0,0.6) 100%)',
          }}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.4 }}
        />
        {/* v86.0: Cinematic banner sliding in from side */}
        <motion.div
          className={`absolute inset-y-0 w-[380px] max-w-[80vw] flex items-center ${
            isRed ? 'left-0' : 'right-0'
          }`}
          initial={{ x: slideFromX }}
          animate={{ x: 0 }}
          exit={{ x: slideFromX, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 180, damping: 22, duration: 0.6 }}
        >
          <div className={`relative w-full h-full flex flex-col justify-center px-10 py-16 ${
            isRed
              ? 'bg-gradient-to-r from-red-950/95 via-red-900/85 to-transparent'
              : 'bg-gradient-to-l from-blue-950/95 via-blue-900/85 to-transparent'
          }`}>
            {/* Decorative accent line */}
            <motion.div
              className={`absolute ${isRed ? 'right-0 top-0 bottom-0' : 'left-0 top-0 bottom-0'} w-1`}
              style={{
                background: isRed
                  ? 'linear-gradient(to bottom, transparent, #ef4444, #f97316, transparent)'
                  : 'linear-gradient(to bottom, transparent, #3b82f6, #60a5fa, transparent)',
              }}
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ duration: 0.5, delay: 0.2 }}
            />

            {/* Faction emoji icon */}
            <motion.div
              className={`text-3xl mb-3 ${isRed ? 'text-red-400' : 'text-blue-400'}`}
              initial={{ opacity: 0, scale: 0, rotate: -180 }}
              animate={{ opacity: 1, scale: 1, rotate: 0 }}
              transition={{ duration: 0.5, delay: 0.1, type: 'spring', stiffness: 200 }}
            >
              {isRed ? '🔴' : '🔵'}
            </motion.div>

            {/* Faction name — large cinematic text */}
            <motion.div
              className={`text-5xl font-black tracking-wider mb-2 ${
                isRed ? 'text-red-300 drop-shadow-[0_0_20px_rgba(239,68,68,0.5)]' : 'text-blue-300 drop-shadow-[0_0_20px_rgba(59,130,246,0.5)]'
              }`}
              initial={{ opacity: 0, x: isRed ? -30 : 30 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.5, delay: 0.15 }}
            >
              {isRed ? '红方回合' : '蓝方回合'}
            </motion.div>

            {/* Turn number */}
            <motion.div
              className="flex items-center gap-3 mb-3"
              initial={{ opacity: 0, x: isRed ? -20 : 20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.4, delay: 0.25 }}
            >
              <div className={`h-px w-10 ${isRed ? 'bg-red-500/50' : 'bg-blue-500/50'}`} />
              <span className="text-xl font-mono text-white/90 font-bold">第 {transition.turn} 回合</span>
              <div className={`h-px w-10 ${isRed ? 'bg-red-500/50' : 'bg-blue-500/50'}`} />
            </motion.div>

            {/* v86.0: Weather change indicator */}
            {transition.weatherChanged && (
              <motion.div
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-medium ${
                  isRed
                    ? 'bg-red-800/40 text-red-200 border border-red-500/30'
                    : 'bg-blue-800/40 text-blue-200 border border-blue-500/30'
                }`}
                initial={{ opacity: 0, y: 10, scale: 0.8 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.3, delay: 0.4, type: 'spring' }}
              >
                <span className="text-base">{weatherIcon}</span>
                <span>天气变化: {weatherName}</span>
              </motion.div>
            )}

            {/* Dismiss hint */}
            <motion.div
              className="text-[10px] text-white/30 mt-6"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.6 }}
            >
              点击任意处跳过
            </motion.div>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ===== Army Roster Panel (全军总览面板) =====
// v73.0: Unit type icon color coding for quick visual identification
const UNIT_TYPE_ICON_COLORS: Record<string, string> = {
  tank: 'text-red-400',
  ifv: 'text-amber-400',
  artillery: 'text-orange-500',
  mlrs: 'text-orange-600',
  sam: 'text-yellow-400',
  scout: 'text-cyan-400',
  infantry: 'text-green-400',
  engineer: 'text-emerald-400',
  supply: 'text-pink-400',
  helicopter: 'text-violet-400',
};

function ArmyRosterPanel() {
  const { show, units, currentFaction, selectedUnit, focusOnUnit } = useGameStore(useShallow(s => ({
    show: s.showArmyRoster,
    units: s.units,
    currentFaction: s.currentFaction,
    selectedUnit: s.selectedUnit,
    focusOnUnit: s.focusOnUnit,
  })));

  const friendlyUnits = useMemo(() => units.filter(u => u.faction === currentFaction && u.isAlive), [units, currentFaction]);
  const available = useMemo(() => friendlyUnits.filter(u => u.canMove || u.canAttack), [friendlyUnits]);
  const exhausted = useMemo(() => friendlyUnits.filter(u => !u.canMove && !u.canAttack), [friendlyUnits]);
  const sorted = useMemo(() => [...available, ...exhausted], [available, exhausted]);

  const ICON_MAP: Record<string, React.ReactNode> = UNIT_ICONS;

  return (
    <motion.div
      initial={{ x: -220 }}
      animate={{ x: show ? 0 : -220 }}
      transition={{ type: 'spring', stiffness: 300, damping: 30 }}
      className="fixed left-0 top-12 bottom-16 z-20 w-[200px] bg-black/80 backdrop-blur-xl border-r border-white/10 flex flex-col"
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10">
        <span className="text-xs font-bold text-gray-300 flex items-center gap-1.5">
          <Users className="w-3.5 h-3.5 text-amber-400" /> 全军总览
        </span>
        <span className="text-[10px] text-gray-500">{available.length}/{friendlyUnits.length}</span>
      </div>

      {/* Unit List */}
      <div className="flex-1 overflow-y-auto px-1 py-1 space-y-0.5" style={{ scrollbarWidth: 'thin' as const }}>
        {sorted.map(unit => {
          const hpPct = Math.max(0, unit.stats.hp / unit.stats.maxHp);
          const isSelected = selectedUnit?.id === unit.id;
          const isAvailable = unit.canMove || unit.canAttack;
          const IconEl = ICON_MAP[unit.type] || <Swords className="w-3.5 h-3.5" />;

          // HP color
          // v76.0: HP threshold aligned to 0.7/0.3 (matching GameScene getHpColor)
          const hpColor = hpPct > 0.7 ? 'bg-green-500' : hpPct > 0.3 ? 'bg-yellow-500' : 'bg-red-500';
          // v72.0: Low HP warning flag for pulse animation
          const isLowHp = hpPct > 0 && hpPct <= 0.3;

          return (
            <motion.div
              key={unit.id}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={() => { focusOnUnit(unit.id); }}
              className={`relative rounded-md p-1.5 cursor-pointer transition-all border ${
                isSelected
                  ? 'border-amber-400 bg-amber-500/10 shadow-sm shadow-amber-400/20'
                  : isLowHp && isAvailable
                    ? 'border-red-500/60 bg-red-500/5 hover:border-red-400/80'
                    : isAvailable
                      ? 'border-white/10 bg-white/5 hover:border-white/20 hover:bg-white/10'
                      : 'border-white/5 bg-white/[0.02] opacity-60'
              }`}
              // v72.0: Subtle pulse for low HP available units
              animate={isLowHp && isAvailable && !isSelected ? { boxShadow: ['0 0 0px rgba(239,68,68,0)', '0 0 6px rgba(239,68,68,0.3)', '0 0 0px rgba(239,68,68,0)'] } : {}}
              transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
            >
              {/* Hero badge */}
              {unit.isHero && (
                <div className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-amber-500 rounded-full flex items-center justify-center">
                  <Star className="w-2 h-2 text-white" />
                </div>
              )}

              <div className="flex items-center gap-1.5">
                <span className={`flex-shrink-0 ${isAvailable ? UNIT_TYPE_ICON_COLORS[unit.type] || 'text-gray-300' : 'text-gray-600'}`}>
                  {IconEl}
                </span>
                <div className="flex-1 min-w-0">
                  {/* Unit name + veterancy title */}
                  <div className="text-[10px] font-medium text-gray-300 truncate flex items-center gap-1">
                    <span className="truncate">
                      {unit.isHero ? `★ ${unit.name || unit.type}` : unit.name}
                    </span>
                    {/* v67.0: Veterancy title badge */}
                    {getVeterancyTitle(unit) && (
                      <span className={`flex-shrink-0 text-[7px] px-1 rounded-full font-bold ${
                        unit.killCount >= 5 ? 'bg-gradient-to-r from-yellow-500/30 to-red-500/30 text-amber-200' :
                        unit.killCount >= 3 ? 'bg-purple-500/20 text-purple-300' :
                        'bg-green-500/20 text-green-300'
                      }`}>{getVeterancyTitle(unit)}</span>
                    )}
                    {unit.level > 1 && (
                      <span className={`flex-shrink-0 text-[7px] px-0.5 rounded ${
                        unit.level >= 4 ? 'text-yellow-400' : unit.level >= 3 ? 'text-purple-400' : 'text-blue-400'
                      }`}>Lv{unit.level}</span>
                    )}
                  </div>
                  {/* HP bar */}
                  {/* v89.0: Added pulse animation for low-HP health bars */}
                  <div className={`mt-0.5 h-1 bg-white/10 rounded-full overflow-hidden ${isLowHp ? 'animate-pulse' : ''}`}>
                    <motion.div
                      className={`h-full rounded-full ${hpColor}`}
                      animate={{ width: `${hpPct * 100}%` }}
                      transition={{ duration: 0.3 }}
                    />
                  </div>
                  {/* Mini stats row */}
                  <div className="flex items-center gap-1.5 mt-0.5 text-[8px]">
                    <span className={isLowHp ? 'text-red-400 font-bold' : 'text-gray-500'}>❤️{unit.stats.hp}/{unit.stats.maxHp}</span>
                    {unit.stats.ammo !== undefined && unit.stats.ammo >= 0 && (
                      <span className="text-gray-500">🔫{unit.stats.ammo}</span>
                    )}
                    {/* v67.0: Kill count in army roster */}
                    {unit.killCount > 0 && (
                      <span className="text-gray-500" title="击杀数">💀{unit.killCount}</span>
                    )}
                    {unit.stats.morale !== undefined && (
                      <span className={unit.stats.morale < 30 ? 'text-red-400' : 'text-gray-500'}>
                        💪{unit.stats.morale}
                      </span>
                    )}
                    {/* v59.0: Action availability badges */}
                    {unit.canMove && <span className="text-green-500" title="可移动">👣</span>}
                    {unit.canAttack && <span className="text-orange-400" title="可攻击">⚔️</span>}
                    {unit.isStealthed && unit.faction === 'red' && <span className="text-purple-400" title="隐身中">👤</span>}
                  </div>
                  {/* v68.0: XP progress bar for non-max-level units */}
                  {unit.level < MAX_LEVEL && unit.xpToNextLevel > 0 && (
                    <div className="mt-0.5 flex items-center gap-1">
                      <div className="flex-1 h-0.5 bg-white/5 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${Math.min(100, (unit.xp / unit.xpToNextLevel) * 100)}%`,
                            backgroundColor: unit.level >= 3 ? '#a78bfa' : '#818cf8',
                          }}
                        />
                      </div>
                      <span className="text-[7px] text-gray-600 flex-shrink-0">{unit.xp}/{unit.xpToNextLevel}</span>
                    </div>
                  )}
                </div>
                {/* Status dot */}
                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${
                  isAvailable ? 'bg-green-400 animate-pulse' : 'bg-gray-600'
                }`} />
              </div>
            </motion.div>
          );
        })}
      </div>
    </motion.div>
  );
}

// ===== v19.0: Battle Statistics Dashboard =====
function BattleStatsDashboard() {
  const { showStatsDashboard, battleStats, turnSummaries, turn, currentFaction, units } = useGameStore(useShallow(s => ({
    showStatsDashboard: s.showStatsDashboard,
    battleStats: s.battleStats,
    turnSummaries: s.turnSummaries,
    turn: s.turn,
    currentFaction: s.currentFaction,
    units: s.units,
  })));
  const toggleStatsDashboard = useGameStore(s => s.toggleStatsDashboard);

  const unitRanking = useMemo(() => {
    return [...units].sort((a, b) => ((b.killCount || 0) - (a.killCount || 0))).map(u => ({
      id: u.id, type: u.type, faction: u.faction, name: u.name,
      killCount: u.killCount || 0, totalDamageDealt: u.totalDamageDealt || 0, isAlive: u.isAlive,
    }));
  }, [units]);

  const redSurvival = useMemo(() => units.filter(u => u.faction === 'red' && u.isAlive).length, [units]);
  const blueSurvival = useMemo(() => units.filter(u => u.faction === 'blue' && u.isAlive).length, [units]);
  const redTotal = useMemo(() => units.filter(u => u.faction === 'red').length, [units]);
  const blueTotal = useMemo(() => units.filter(u => u.faction === 'blue').length, [units]);

  const red = battleStats.red;
  const blue = battleStats.blue;

  // Per-turn damage data for line chart
  const maxTurnDamage = useMemo(() => {
    let max = 1;
    for (const ts of turnSummaries) {
      max = Math.max(max, ts.totalDamageDealt, ts.totalDamageReceived);
    }
    return max;
  }, [turnSummaries]);

  // Damage efficiency
  const redEfficiency = red.damageReceived > 0 ? (red.damageDealt / red.damageReceived).toFixed(2) : '∞';
  const blueEfficiency = blue.damageReceived > 0 ? (blue.damageDealt / blue.damageReceived).toFixed(2) : '∞';

  const killEfficiency = (lost: number, kills: number) => lost > 0 ? (kills / lost).toFixed(2) : '∞';

  const statItems = [
    { label: '造成伤害', red: red.damageDealt, blue: blue.damageDealt },
    { label: '受到伤害', red: red.damageReceived, blue: blue.damageReceived },
    { label: '击毁单位', red: red.unitsDestroyed, blue: blue.unitsDestroyed },
    { label: '损失单位', red: red.unitsLost, blue: blue.unitsLost },
    { label: '治疗量', red: red.healingDone, blue: blue.healingDone },
    { label: '攻击次数', red: red.attacks, blue: blue.attacks },
    { label: '修建工事', red: red.fortsBuilt, blue: blue.fortsBuilt },
    { label: '撤退次数', red: red.retreated, blue: blue.retreated },
  ];

  return (
    <AnimatePresence>
      {showStatsDashboard && (
        <motion.div
          className="absolute inset-y-0 right-0 z-[45] pointer-events-auto"
          initial={{ x: '100%' }}
          animate={{ x: 0 }}
          exit={{ x: '100%' }}
          transition={{ type: 'spring', damping: 25, stiffness: 300 }}
        >
          <div className="h-full w-[340px] sm:w-[400px] bg-gray-900/95 backdrop-blur-xl border-l border-white/10 text-white overflow-hidden flex flex-col shadow-2xl shadow-black/50">
            {/* Header */}
            <div className="flex items-center justify-between px-4 py-3 bg-gray-800/80 border-b border-white/10 shrink-0">
              <div className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-cyan-400" />
                <span className="text-sm font-bold">战斗统计仪表盘</span>
              </div>
              <Button
                size="sm"
                variant="ghost"
                className="h-7 w-7 p-0 text-gray-400 hover:text-white"
                onClick={toggleStatsDashboard}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>

            {/* Scrollable content */}
            <ScrollArea className="flex-1">
              <div className="p-4 space-y-4">

                {/* Red vs Blue comparison */}
                <div>
                  <div className="text-xs font-bold text-gray-400 mb-2 flex items-center gap-1.5">
                    <span className="w-2 h-2 rounded-full bg-red-500" />
                    <span>红方 vs 蓝方 对比</span>
                  </div>
                  <div className="space-y-1.5">
                    {statItems.map(item => {
                      const maxVal = Math.max(item.red, item.blue, 1);
                      return (
                        <div key={item.label} className="space-y-0.5">
                          <div className="flex items-center justify-between text-[10px] text-gray-400 mb-0.5">
                            <span>{item.label}</span>
                          </div>
                          <div className="flex gap-1 items-center">
                            {/* Red bar */}
                            <div className="flex-1 flex items-center gap-1">
                              <span className="text-[10px] text-red-400 w-6 text-right">{item.red}</span>
                              <div className="flex-1 h-3 bg-white/10 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-red-500/70 transition-all duration-500"
                                  style={{ width: `${(item.red / maxVal) * 100}%` }}
                                />
                              </div>
                            </div>
                            {/* Blue bar */}
                            <div className="flex-1 flex items-center gap-1">
                              <div className="flex-1 h-3 bg-white/10 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-blue-500/70 transition-all duration-500"
                                  style={{ width: `${(item.blue / maxVal) * 100}%` }}
                                />
                              </div>
                              <span className="text-[10px] text-blue-400 w-6">{item.blue}</span>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <Separator className="bg-white/10" />

                {/* Turn damage trend */}
                <div>
                  <div className="text-xs font-bold text-gray-400 mb-2 flex items-center gap-1.5">
                    <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
                    <span>每回合伤害趋势</span>
                </div>
                  {turnSummaries.length > 1 ? (
                    <svg viewBox="0 0 280 100" className="w-full h-24 bg-white/5 rounded-lg p-1">
                      {/* Y axis labels */}
                      <text x="2" y="10" fill="currentColor" fontSize="7" className="text-gray-500">0</text>
                      <text x="2" y="50" fill="currentColor" fontSize="7" className="text-gray-500">{maxTurnDamage}</text>
                      {/* Grid lines */}
                      <line x1="20" y1="5" x2="20" y2="95" stroke="rgba(255,255,255,0.1)" strokeWidth="0.5" />
                      <line x1="20" y1="50" x2="278" y2="50" stroke="rgba(255,255,255,0.08)" strokeWidth="0.5" />
                      {/* Red line */}
                      <polyline
                        fill="none"
                        stroke="#ef4444"
                        strokeWidth="1.5"
                        strokeLinejoin="round"
                        points={turnSummaries.map((ts, i) => {
                          const x = 22 + (i / Math.max(turnSummaries.length - 1, 1)) * 254;
                          const y = 95 - (ts.totalDamageDealt / maxTurnDamage) * 85;
                          return `${x},${y}`;
                        }).join(' ')}
                      />
                      {/* Blue line */}
                      <polyline
                        fill="none"
                        stroke="#3b82f6"
                        strokeWidth="1.5"
                        strokeLinejoin="round"
                        points={turnSummaries.map((ts, i) => {
                          const x = 22 + (i / Math.max(turnSummaries.length - 1, 1)) * 254;
                          const y = 95 - (ts.totalDamageReceived / maxTurnDamage) * 85;
                          return `${x},${y}`;
                        }).join(' ')}
                      />
                      {/* Turn labels */}
                      {turnSummaries.map((ts, i) => {
                        const x = 22 + (i / Math.max(turnSummaries.length - 1, 1)) * 254;
                        return (
                          <text key={i} x={x} y="97" fill="currentColor" fontSize="6" className="text-gray-500" textAnchor="middle">
                            {ts.turn}
                          </text>
                        );
                      })}
                      {/* Legend */}
                      <line x1="60" y1="3" x2="72" y2="3" stroke="#ef4444" strokeWidth="1.5" />
                      <text x="74" y="5" fill="currentColor" fontSize="6" className="text-gray-400">红方</text>
                      <line x1="100" y1="3" x2="112" y2="3" stroke="#3b82f6" strokeWidth="1.5" />
                      <text x="114" y="5" fill="currentColor" fontSize="6" className="text-gray-400">蓝方</text>
                    </svg>
                  ) : (
                    <div className="text-[10px] text-gray-500 text-center py-4">暂无伤害数据</div>
                  )}
                </div>

                <Separator className="bg-white/10" />

                {/* Unit kill ranking */}
                <div>
                  <div className="text-xs font-bold text-gray-400 mb-2 flex items-center gap-1.5">
                    <Trophy className="w-3.5 h-3.5 text-amber-400" />
                    <span>单位击杀排行</span>
                  </div>
                  <div className="space-y-1 max-h-36 overflow-y-auto">
                    {unitRanking.filter(u => u.killCount > 0 || u.totalDamageDealt > 0).map((unit, idx) => {
                      const isMvp = idx === 0;
                      const iconKey = unit.type;
                      return (
                        <div
                          key={unit.id}
                          className={`flex items-center gap-1.5 px-2 py-1 rounded text-[11px] ${
                            isMvp ? 'bg-amber-900/30 border border-amber-500/40' : 'bg-white/5'
                          }`}
                        >
                          {isMvp && <span className="text-amber-400">👑</span>}
                          <span className={unit.faction === 'red' ? 'text-red-400' : 'text-blue-400'}>
                            {UNIT_ICONS[iconKey]}
                          </span>
                          <span className="text-white/80 flex-1 truncate">{unit.name}</span>
                          <Badge variant="outline" className="text-[9px] px-1 py-0 h-4 border-white/20 text-amber-300">
                            {unit.killCount}杀
                          </Badge>
                          <span className="text-[10px] text-gray-400">{unit.totalDamageDealt}伤</span>
                          <span className={`text-[9px] ${unit.isAlive ? 'text-green-400' : 'text-red-400/60'}`}>
                            {unit.isAlive ? '存活' : '阵亡'}
                          </span>
                        </div>
                      );
                    })}
                    {unitRanking.filter(u => u.killCount > 0 || u.totalDamageDealt > 0).length === 0 && (
                      <div className="text-[10px] text-gray-500 text-center py-2">暂无击杀数据</div>
                    )}
                  </div>
                </div>

                <Separator className="bg-white/10" />

                {/* Efficiency metrics */}
                <div>
                  <div className="text-xs font-bold text-gray-400 mb-2 flex items-center gap-1.5">
                    <Zap className="w-3.5 h-3.5 text-green-400" />
                    <span>战斗效率指标</span>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="bg-white/5 rounded p-2">
                      <div className="text-[10px] text-gray-500 mb-0.5">伤害效率</div>
                      <div className="flex gap-2 items-baseline">
                        <span className="text-sm font-bold text-red-400">{redEfficiency}</span>
                        <span className="text-[10px] text-gray-500">vs</span>
                        <span className="text-sm font-bold text-blue-400">{blueEfficiency}</span>
                      </div>
                    </div>
                    <div className="bg-white/5 rounded p-2">
                      <div className="text-[10px] text-gray-500 mb-0.5">击杀效率</div>
                      <div className="flex gap-2 items-baseline">
                        <span className="text-sm font-bold text-red-400">{killEfficiency(red.unitsLost, red.kills)}</span>
                        <span className="text-[10px] text-gray-500">vs</span>
                        <span className="text-sm font-bold text-blue-400">{killEfficiency(blue.unitsLost, blue.kills)}</span>
                      </div>
                    </div>
                    <div className="bg-white/5 rounded p-2">
                      <div className="text-[10px] text-gray-500 mb-0.5">存活率</div>
                      <div className="flex gap-2 items-baseline">
                        <span className="text-sm font-bold text-red-400">{redTotal > 0 ? Math.round((redSurvival / redTotal) * 100) : 0}%</span>
                        <span className="text-[10px] text-gray-500">vs</span>
                        <span className="text-sm font-bold text-blue-400">{blueTotal > 0 ? Math.round((blueSurvival / blueTotal) * 100) : 0}%</span>
                      </div>
                    </div>
                    <div className="bg-white/5 rounded p-2">
                      <div className="text-[10px] text-gray-500 mb-0.5">当前回合</div>
                      <div className="text-sm font-bold text-white">
                        第 {turn} 回合
                      </div>
                    </div>
                  </div>
                </div>

              </div>
            </ScrollArea>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ===== Combat Statistics HUD Overlay =====
function CombatStatsHUD() {
  const [isExpanded, setIsExpanded] = useState(true);

  // v89.0: Optimized selector — compute derived values inside to avoid re-render on every unit change
  // Previously subscribed to full `units` array causing expensive re-renders
  // v90.0: Also moved redDamageStats computation into selector to avoid combatLog array reference change re-renders
  const { turn, currentFaction, units, combatLog, currentWeather, weatherTurnsRemaining, nextWeather, capturePoints, selectedUnit, phase, battleStats } = useGameStore(useShallow(s => ({
    turn: s.turn,
    currentFaction: s.currentFaction,
    units: s.units,
    combatLog: s.combatLog,
    currentWeather: s.currentWeather,
    weatherTurnsRemaining: s.weatherTurnsRemaining,
    nextWeather: s.nextWeather,
    capturePoints: s.capturePoints,
    selectedUnit: s.selectedUnit,
    phase: s.phase,
    battleStats: s.battleStats,
  })));

  const redAlive = useMemo(() => units.filter(u => u.faction === 'red' && u.isAlive).length, [units]);
  const blueAlive = useMemo(() => units.filter(u => u.faction === 'blue' && u.isAlive).length, [units]);
  const hpRatio = useMemo(() => {
    const redAliveUnits = units.filter(u => u.faction === 'red' && u.isAlive);
    const blueAliveUnits = units.filter(u => u.faction === 'blue' && u.isAlive);
    const totalRedHp = redAliveUnits.reduce((sum, u) => sum + u.stats.hp, 0);
    const totalBlueHp = blueAliveUnits.reduce((sum, u) => sum + u.stats.hp, 0);
    const totalRedMaxHp = redAliveUnits.reduce((sum, u) => sum + u.stats.maxHp, 0);
    const totalBlueMaxHp = blueAliveUnits.reduce((sum, u) => sum + u.stats.maxHp, 0);
    const totalHp = totalRedHp + totalBlueHp;
    return totalHp > 0 ? {
      totalRedHp, totalBlueHp, totalRedMaxHp, totalBlueMaxHp,
      ratio: totalRedHp / totalHp,
      pctAdvantage: Math.abs(Math.round((totalRedHp - totalBlueHp) / Math.max(totalRedHp, totalBlueHp) * 100)),
    } : { totalRedHp: 0, totalBlueHp: 0, totalRedMaxHp: 0, totalBlueMaxHp: 0, ratio: 0.5, pctAdvantage: 0 };
  }, [units]);
  const redDamageStats = useMemo(() => {
    let _dealt = 0;
    let _received = 0;
    for (const entry of combatLog) {
      if (entry.eventType === 'counter') continue;
      if (entry.attackerFaction === 'red') {
        _dealt += entry.damage;
      } else {
        _received += entry.damage;
      }
    }
    for (const entry of combatLog) {
      if (entry.eventType === 'counter' && entry.counterDamage) {
        if (entry.attackerFaction === 'blue') {
          _dealt += entry.counterDamage;
        } else {
          _received += entry.counterDamage;
        }
      }
    }
    return { dealt: _dealt, received: _received };
  }, [combatLog]);
  const heroCount = useMemo(() => units.filter(u => u.isHero).length, [units]);

  const currentMission = useMissionStore(s => s.currentMission);

  // v90.0: redDamageStats now computed inside selector above (removed useMemo that depended on combatLog)

  // v89.0: redAlive, blueAlive, hpRatio now computed in the selector above (removed useMemo)

  // Weather info
  const weatherConfig = WEATHER_CONFIGS[currentWeather];
  // v89.0: Compute next weather config for forecast display
  const nextWeatherConfig = nextWeather ? WEATHER_CONFIGS[nextWeather] : null;

  // v89.0: heroCount now computed in selector; heroes list from separate lightweight selector
  const heroes = useMemo(() => units.filter(u => u.isHero), [units]);

  // v91.0: Subscribe to previousTurnState for undo indicator
  const previousTurnState = useGameStore(s => s.previousTurnState);

  // Campaign mission objective text
  const missionObjective = useMemo(() => {
    if (!currentMission || currentMission.objectives.length === 0) return null;
    return currentMission.objectives[0].description;
  }, [currentMission]);

  return (
    <div className="absolute bottom-3 right-3 z-[42] pointer-events-auto">
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, y: 10, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 10, scale: 0.95 }}
            transition={{ duration: 0.2, ease: 'easeOut' }}
            className="mb-1"
          >
            <div className={`w-[200px] bg-gray-900/80 backdrop-blur-sm rounded-lg border text-white shadow-lg shadow-black/30 transition-colors duration-500 ${currentFaction === 'red' ? 'border-red-500/30' : 'border-blue-500/30'}`}>
              {/* Turn counter with faction color */}
              <div className="px-2.5 py-1.5 border-b border-white/10 flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <span
                    className="w-2 h-2 rounded-full"
                    style={{ backgroundColor: currentFaction === 'red' ? '#ef4444' : '#3b82f6' }}
                  />
                  <span className="text-[11px] font-bold text-white/90">{currentFaction === 'red' ? '红方' : '蓝方'}</span>
                </div>
                <span className="text-[10px] text-white/60">回合 {turn}</span>
              </div>

              {/* HP Advantage Bar */}
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="h-1 w-full">
                    <div
                      className="h-full rounded-full transition-all duration-500"
                      style={{
                        width: `${hpRatio.ratio * 100}%`,
                        background: `linear-gradient(to right, #dc2626 ${Math.min(100, (hpRatio.ratio / 1) * 100)}%, #2563eb ${Math.min(100, ((1 - hpRatio.ratio) / 1) * 100)}%)`,
                      }}
                    />
                  </div>
                </TooltipTrigger>
                <TooltipContent side="top" className="text-[10px] space-y-1 max-w-[200px]">
                  <div className="font-bold text-white/90 mb-1">📊 军队对比</div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                    <span className="text-red-400">红方: {redAlive}单位 | HP: {hpRatio.totalRedHp}/{hpRatio.totalRedMaxHp}</span>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                    <span className="text-blue-400">蓝方: {blueAlive}单位 | HP: {hpRatio.totalBlueHp}/{hpRatio.totalBlueMaxHp}</span>
                  </div>
                  {hpRatio.pctAdvantage > 0 && (
                    <div className={`text-[9px] pt-0.5 border-t border-white/10 ${hpRatio.totalRedHp > hpRatio.totalBlueHp ? 'text-red-400' : 'text-blue-400'}`}>
                      {hpRatio.totalRedHp > hpRatio.totalBlueHp ? '红方' : '蓝方'}HP优势 {hpRatio.pctAdvantage}%
                    </div>
                  )}
                </TooltipContent>
              </Tooltip>

              <div className="px-2.5 py-2 space-y-2">
                {/* Units remaining */}
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-gray-400">存活单位</span>
                  <div className="flex items-center gap-2">
                    <span className="flex items-center gap-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                      <span className="text-red-400 font-bold">{redAlive}</span>
                    </span>
                    <span className="text-gray-600">/</span>
                    <span className="flex items-center gap-0.5">
                      <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                      <span className="text-blue-400 font-bold">{blueAlive}</span>
                    </span>
                  </div>
                </div>

                {/* v62.0: Capture point control summary */}
                {capturePoints && capturePoints.length > 0 && (
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-gray-400">据点控制</span>
                  <div className="flex items-center gap-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex items-center gap-0.5 cursor-default">
                          <span className="w-1.5 h-1.5 rounded-full bg-red-500" />
                          <span className="text-red-400 font-bold">{capturePoints.filter(cp => cp.owner === 'red').length}</span>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="text-[10px]">红方控制的据点数</TooltipContent>
                    </Tooltip>
                    <span className="text-gray-600">/</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="flex items-center gap-0.5 cursor-default">
                          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
                          <span className="text-blue-400 font-bold">{capturePoints.filter(cp => cp.owner === 'blue').length}</span>
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="text-[10px]">蓝方控制的据点数</TooltipContent>
                    </Tooltip>
                    <span className="text-gray-600">/</span>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-gray-400 font-bold">{capturePoints.filter(cp => cp.owner === null).length}</span>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="text-[10px]">中立据点数</TooltipContent>
                    </Tooltip>
                  </div>
                </div>
                )}

                {/* Total damage dealt/received by red */}
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-gray-400">红方伤害</span>
                  <div className="flex items-center gap-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-orange-400 font-bold cursor-default">造成 {redDamageStats.dealt}</span>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="text-[10px]">红方累计造成伤害</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className="text-yellow-400 font-bold cursor-default">受到 {redDamageStats.received}</span>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="text-[10px]">红方累计受到伤害</TooltipContent>
                    </Tooltip>
                  </div>
                </div>

                {/* v68.0: KD Ratio display */}
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-gray-400">击杀比 (K/D)</span>
                  <div className="flex items-center gap-2">
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className={`${battleStats.red.kills > battleStats.blue.kills ? 'text-green-400' : 'text-red-400'} font-bold cursor-default`}>
                          {battleStats.red.kills} / {battleStats.blue.kills}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="text-[10px]">红方 / 蓝方击杀</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <span className={`${battleStats.red.kills > battleStats.blue.kills ? 'text-green-400' : 'text-red-400'} font-bold cursor-default`}>
                          {battleStats.red.kills > 0 && battleStats.blue.kills > 0
                            ? (battleStats.red.kills / battleStats.blue.kills).toFixed(1)
                            : battleStats.red.kills > 0 ? '∞' : '-'}
                        </span>
                      </TooltipTrigger>
                      <TooltipContent side="left" className="text-[10px]">红方击杀率</TooltipContent>
                    </Tooltip>
                  </div>
                </div>

                {/* v68.0: Damage efficiency (damage dealt vs received) */}
                {(() => {
                  const redDealt = battleStats.red.damageDealt || 0;
                  const redRecv = battleStats.red.damageReceived || 0;
                  const efficiency = redRecv > 0 ? (redDealt / redRecv).toFixed(1) : redDealt > 0 ? '∞' : '-';
                  const isPositive = redDealt > redRecv;
                  return (
                    <div className="flex items-center justify-between text-[10px]">
                      <span className="text-gray-400">伤害效率</span>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className={`${isPositive ? 'text-green-400' : 'text-red-400'} font-bold cursor-default`}>
                            {efficiency}
                            <span className="text-gray-500 ml-0.5 text-[8px]">({redDealt}/{redRecv})</span>
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="text-[10px]">红方造成/承受伤害比</TooltipContent>
                      </Tooltip>
                    </div>
                  );
                })()}

                {/* Weather with forecast */}
                <div className="flex items-center justify-between text-[10px]">
                  <span className="text-gray-400">天气</span>
                  <div className="flex items-center gap-1">
                    <span>{weatherConfig.icon}</span>
                    <span className="text-white/80 font-medium">{weatherConfig.name}</span>
                    {weatherTurnsRemaining != null && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="text-gray-500 cursor-help">
                            ({weatherTurnsRemaining}回合)
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="text-[10px]">
                          {weatherTurnsRemaining > 0
                            ? `${weatherTurnsRemaining} 回合后天气变化`
                            : '下回合天气将变化'}
                        </TooltipContent>
                      </Tooltip>
                    )}
                    {/* v89.0: Next weather forecast indicator */}
                    {nextWeatherConfig && nextWeather !== currentWeather && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <span className="flex items-center gap-0.5 text-white/30 text-[9px] cursor-help">
                            → {nextWeatherConfig.icon}
                          </span>
                        </TooltipTrigger>
                        <TooltipContent side="left" className="text-[10px]">
                          下次天气: {nextWeatherConfig.icon} {nextWeatherConfig.name}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </div>
                </div>

                {/* Campaign mission objective */}
                {missionObjective && (
                  <div className="pt-1 border-t border-white/10">
                    <div className="text-[9px] text-amber-400 font-bold mb-0.5 flex items-center gap-1">
                      <ScrollText className="w-2.5 h-2.5" />
                      任务目标
                    </div>
                    <div className="text-[10px] text-white/70 leading-tight">
                      {missionObjective}
                    </div>
                  </div>
                )}

                {/* Hero status */}
                {heroes.length > 0 && (
                  <div className="pt-1 border-t border-white/10">
                    <div className="text-[9px] text-purple-400 font-bold mb-0.5 flex items-center gap-1">
                      <Star className="w-2.5 h-2.5" />
                      英雄状态
                    </div>
                    {heroes.map(hero => {
                      const hpPercent = hero.isAlive
                        ? Math.round((hero.stats.hp / hero.stats.maxHp) * 100)
                        : 0;
                      const statusLabel = !hero.isAlive
                        ? '阵亡'
                        : hpPercent < 30
                          ? '重伤'
                          : '活跃';
                      const statusColor = !hero.isAlive
                        ? 'text-red-400'
                        : hpPercent < 30
                          ? 'text-yellow-400'
                          : 'text-green-400';
                      return (
                        <div key={hero.id} className="flex items-center justify-between text-[10px]">
                          <span className={hero.faction === 'red' ? 'text-red-400' : 'text-blue-400'}>
                            {hero.name}
                          </span>
                          <span className={`${statusColor} font-medium`}>
                            {statusLabel}
                            {hero.isAlive && ` (${hpPercent}%)`}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
                {/* v64.0: Selected unit action summary */}
                {selectedUnit && selectedUnit.isAlive && currentFaction === 'red' &&
                  (phase === 'selectUnit' || phase === 'moveUnit' || phase === 'attackUnit') && (
                  <div className="mt-1.5 pt-1.5 border-t border-white/10 space-y-1">
                    <div className="text-[9px] text-cyan-400 font-bold mb-0.5 flex items-center gap-1">
                      🎯 当前选中
                      {/* v91.0: Undo stack visual indicator */}
                      {previousTurnState && (
                        <span className="text-[10px] text-yellow-400/60 ml-1">↩ 可撤销</span>
                      )}
                    </div>
                    <div className="text-[10px] text-white font-medium flex items-center gap-1.5">
                      {/* v68.0: Unit type icon */}
                      <span className="flex-shrink-0">{UNIT_ICONS[selectedUnit.type] || <span className="text-[8px]">?</span>}</span>
                      {selectedUnit.name}
                      {selectedUnit.killCount > 0 && (
                        <span className="text-[9px] px-1 py-0.5 rounded-full bg-gradient-to-r from-orange-600/60 to-red-600/60 text-orange-200 font-bold border border-orange-500/40 leading-tight">
                          🔥{selectedUnit.killCount}
                        </span>
                      )}
                      {selectedUnit.level > 1 && (
                        <span className={`text-[8px] px-1 py-0.5 rounded-full ${
                          selectedUnit.level >= 4 ? 'bg-yellow-500/30 text-yellow-300' :
                          selectedUnit.level >= 3 ? 'bg-purple-500/30 text-purple-300' :
                          'bg-blue-500/30 text-blue-300'
                        }`}>Lv.{selectedUnit.level}</span>
                      )}
                      {/* v67.0: Veterancy title */}
                      {getVeterancyTitle(selectedUnit) && (
                        <span className={`text-[8px] px-1 py-0.5 rounded-full font-bold ${
                          selectedUnit.killCount >= 5 ? 'bg-gradient-to-r from-yellow-500/40 to-red-500/40 text-amber-200' :
                          selectedUnit.killCount >= 3 ? 'bg-purple-500/30 text-purple-200' :
                          'bg-green-500/30 text-green-200'
                        }`}>{getVeterancyTitle(selectedUnit)}</span>
                      )}
                    </div>
                    {/* v66.0: HP bar for selected unit */}
                    <div className="w-full">
                      <div className="flex items-center justify-between text-[8px] mb-0.5">
                        <span className="text-gray-400">HP</span>
                        <span className={selectedUnit.stats.hp / selectedUnit.stats.maxHp > 0.7 ? 'text-green-400' : selectedUnit.stats.hp / selectedUnit.stats.maxHp > 0.3 ? 'text-yellow-400' : 'text-red-400'}>
                          {selectedUnit.stats.hp}/{selectedUnit.stats.maxHp}
                        </span>
                      </div>
                      <div className="h-1 bg-gray-700 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-300" style={{
                          width: `${(selectedUnit.stats.hp / selectedUnit.stats.maxHp) * 100}%`,
                          backgroundColor: selectedUnit.stats.hp / selectedUnit.stats.maxHp > 0.7 ? '#4ade80' : selectedUnit.stats.hp / selectedUnit.stats.maxHp > 0.3 ? '#facc15' : '#f87171',
                        }} />
                      </div>
                    </div>
                    <div className="flex items-center gap-1.5 text-[10px]">
                      <span className={selectedUnit.canMove ? 'text-green-400' : 'text-gray-500'}>
                        👣 {selectedUnit.canMove ? '可移动' : '已移动'}
                      </span>
                      <span className={selectedUnit.canAttack ? 'text-orange-400' : 'text-gray-500'}>
                        ⚔️ {selectedUnit.canAttack ? '可攻击' : '已攻击'}
                      </span>
                      {selectedUnit.isStealthed && (
                        <span className="text-purple-400">👤 隐身中</span>
                      )}
                    </div>
                    {/* v83.0: Action points status badge */}
                    <div className="mt-0.5">
                      {selectedUnit.canMove && selectedUnit.canAttack ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/30 font-bold animate-pulse">待命</span>
                      ) : !selectedUnit.canMove && selectedUnit.canAttack ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-green-500/20 text-green-300 border border-green-500/30">移动✓</span>
                      ) : !selectedUnit.canMove && !selectedUnit.canAttack ? (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-gray-500/15 text-gray-500 border border-gray-500/20">已行动</span>
                      ) : (
                        <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-orange-500/20 text-orange-300 border border-orange-500/30">攻击✓</span>
                      )}
                    </div>
                    {/* v66.0: Ammo indicator */}
                    {selectedUnit.stats.ammo !== undefined && selectedUnit.stats.maxAmmo !== undefined && selectedUnit.stats.maxAmmo > 0 && (
                      <div className="flex items-center gap-1 text-[9px]">
                        <span className={selectedUnit.stats.ammo === 0 ? 'text-red-400' : 'text-gray-400'}>
                          🔫 {selectedUnit.stats.ammo}/{selectedUnit.stats.maxAmmo}
                        </span>
                        {selectedUnit.stats.ammo === 0 && <span className="text-red-400/70 text-[8px]">弹药耗尽</span>}
                      </div>
                    )}
                    {/* v66.0: Morale indicator */}
                    {selectedUnit.stats.morale !== undefined && selectedUnit.stats.morale !== null && (
                      <div className="flex items-center gap-1 text-[9px]">
                        <span className={
                          (selectedUnit.stats.morale ?? 100) >= MORALE_HIGH_THRESHOLD ? 'text-green-400' :
                          (selectedUnit.stats.morale ?? 100) >= MORALE_LOW_THRESHOLD ? 'text-yellow-400' :
                          'text-red-400'
                        }>
                          {(selectedUnit.stats.morale ?? 100) >= MORALE_HIGH_THRESHOLD ? '😊' :
                           (selectedUnit.stats.morale ?? 100) >= MORALE_LOW_THRESHOLD ? '😐' : '😰'}
                          {' '}{selectedUnit.stats.morale}
                        </span>
                      </div>
                    )}
                    {/* v68.0: XP progress for selected unit */}
                    {selectedUnit.level < MAX_LEVEL && selectedUnit.xpToNextLevel > 0 && (
                      <div className="mt-0.5">
                        <div className="flex items-center justify-between text-[8px] mb-0.5">
                          <span className="text-gray-500">EXP</span>
                          <span className="text-gray-400">{selectedUnit.xp}/{selectedUnit.xpToNextLevel}</span>
                        </div>
                        <div className="h-0.5 bg-gray-700 rounded-full overflow-hidden">
                          <div className="h-full rounded-full transition-all duration-300" style={{
                            width: `${Math.min(100, (selectedUnit.xp / selectedUnit.xpToNextLevel) * 100)}%`,
                            backgroundColor: selectedUnit.level >= 3 ? '#a78bfa' : '#818cf8',
                          }} />
                        </div>
                      </div>
                    )}
                    {/* v69.0: Hero ability cooldown display for selected unit */}
                    {selectedUnit.isHero && selectedUnit.abilities.filter(a => a.type === 'active').length > 0 && (
                      <div className="mt-1 space-y-0.5">
                        <div className="text-[8px] text-gray-500">技能</div>
                        <div className="flex gap-1">
                          {selectedUnit.abilities.filter(a => a.type === 'active').map((ability, i) => (
                            <Tooltip key={i}>
                              <TooltipTrigger asChild>
                                <div className={`relative w-6 h-6 rounded flex items-center justify-center text-xs border ${
                                  ability.currentCooldown > 0
                                    ? 'bg-gray-800 border-gray-600 text-gray-500 opacity-60'
                                    : 'bg-purple-900/40 border-purple-500/30 text-purple-300'
                                }`}>
                                  <span>{ability.icon}</span>
                                  {ability.currentCooldown > 0 && (
                                    <span className="absolute -top-1 -right-1 text-[7px] bg-red-500 text-white rounded-full w-3 h-3 flex items-center justify-center font-bold">
                                      {ability.currentCooldown}
                                    </span>
                                  )}
                                </div>
                              </TooltipTrigger>
                              <TooltipContent side="bottom" className="bg-gray-900 border-gray-700 text-gray-200 text-[10px] max-w-[200px]">
                                <div className="font-medium">{ability.icon} {ability.name}</div>
                                <div className="text-gray-400 mt-0.5">{ability.description}</div>
                                {ability.currentCooldown > 0 && (
                                  <div className="text-red-400 mt-0.5">冷却中: {ability.currentCooldown} 回合</div>
                                )}
                                {ability.currentCooldown === 0 && (
                                  <div className="text-green-400 mt-0.5">✓ 可使用</div>
                                )}
                              </TooltipContent>
                            </Tooltip>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Toggle button */}
      <motion.button
        className="absolute -top-8 right-0 w-7 h-7 rounded-md bg-gray-900/80 backdrop-blur-sm border border-white/10 text-white/70 hover:text-white hover:bg-gray-800/90 transition-colors flex items-center justify-center shadow-md"
        onClick={() => setIsExpanded(prev => !prev)}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.95 }}
        aria-label={isExpanded ? '收起统计面板' : '展开统计面板'}
      >
        <BarChart3 className="w-3.5 h-3.5" />
      </motion.button>
    </div>
  );
}

// ===== Keyboard Shortcuts Help Overlay =====
const SHORTCUT_CATEGORY_ICONS: Record<string, React.ReactNode> = {
  '回合控制': <Clock className="w-4 h-4 text-amber-400" />,
  '单位操作': <Swords className="w-4 h-4 text-orange-400" />,
  '视角控制': <Move className="w-4 h-4 text-cyan-400" />,
  '信息面板': <Info className="w-4 h-4 text-green-400" />,
  '系统': <Keyboard className="w-4 h-4 text-purple-400" />,
};

const SHORTCUT_CATEGORY_ORDER = ['回合控制', '单位操作', '视角控制', '信息面板', '系统'];

const PHASE_LABELS: Record<string, string> = {
  heroSelection: '英雄选择阶段',
  deployment: '部署阶段',
  selectUnit: '选择阶段',
  moveUnit: '移动阶段',
  attackUnit: '攻击阶段',
  aiTurn: 'AI行动阶段',
  gameOver: '游戏结束',
};

const KeyBadge = React.memo(function KeyBadge({ children, isHelpKey = false }: { children: React.ReactNode; isHelpKey?: boolean }) {
  return (
    <span
      className={`
        inline-flex items-center justify-center
        px-2.5 py-1 rounded-md
        font-mono text-xs font-bold
        min-w-[36px] select-none
        border border-white/20
        ${isHelpKey
          ? 'bg-gradient-to-b from-amber-500/30 via-amber-600/20 to-amber-700/30 border-amber-400/50 text-amber-300 shadow-[0_2px_0_0_rgba(245,158,11,0.5)]'
          : 'bg-gradient-to-b from-gray-700/80 via-gray-800/90 to-gray-900 border-gray-600/40 text-gray-200 shadow-[0_2px_0_0_rgba(0,0,0,0.6)]'
        }
      `}
    >
      {children}
    </span>
  );
});

function ShortcutsHelpOverlay({ onClose }: { onClose: () => void }) {
  // v48.0: Use useShallow for object selector to prevent re-renders on every store change
  // v90.0: Moved unit-derived computations into selector — only scalars returned, no full units array
  const { currentFaction, turn, phase, units } = useGameStore(useShallow(s => ({
    currentFaction: s.currentFaction,
    turn: s.turn,
    phase: s.phase,
    units: s.units,
  })));
  const totalUnits = useMemo(() => units.filter((u: any) => u.faction === 'red' && u.isAlive).length, [units]);
  const actedUnits = useMemo(() => units.filter((u: any) => u.faction === 'red' && u.isAlive && !u.canMove && !u.canAttack).length, [units]);

  const progress = totalUnits > 0 ? actedUnits / totalUnits : 0;

  useEffect(() => {
    const handleAnyKey = (e: KeyboardEvent) => {
      if (e.key === '?') return; // toggle key handled by parent (v74.0: H now handled by parent too)
      onClose();
    };
    const timer = setTimeout(() => {
      window.addEventListener('keydown', handleAnyKey);
    }, 200);
    return () => {
      clearTimeout(timer);
      window.removeEventListener('keydown', handleAnyKey);
    };
  }, [onClose]);

  const factionLabel = currentFaction === 'red' ? '红方' : currentFaction === 'blue' ? '蓝方' : '';
  const phaseLabel = PHASE_LABELS[phase] || phase;
  const phaseDisplay = `${factionLabel}回合 — ${phaseLabel}`;

  return (
    <motion.div
      className="absolute inset-0 z-[55] flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      {/* Backdrop */}
      <motion.div
        className="absolute inset-0 bg-gray-900/95 backdrop-blur-md"
        onClick={onClose}
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.15 }}
      />

      {/* Panel */}
      <motion.div
        className="shortcuts-panel relative max-w-2xl w-full mx-4 max-h-[85vh] overflow-hidden rounded-xl bg-gray-900/95 backdrop-blur-xl border border-white/10 shadow-2xl shadow-black/60"
        initial={{ scale: 0.85, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ type: 'spring', damping: 25, stiffness: 350 }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/10">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-purple-500/20 to-purple-700/20 border border-purple-500/30 flex items-center justify-center">
              <Keyboard className="w-5 h-5 text-purple-400" />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">键盘快捷键</h2>
              <p className="text-[11px] text-gray-500 mt-0.5">所有可用操作一览</p>
            </div>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 w-8 p-0 text-gray-500 hover:text-white hover:bg-white/10 rounded-lg"
            onClick={onClose}
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Game phase indicator */}
        <div className="mx-6 mt-3 px-3 py-2 rounded-lg bg-white/5 border border-white/10">
          <div className="flex items-center gap-2">
            <div className={`w-2 h-2 rounded-full ${currentFaction === 'red' ? 'bg-red-500' : currentFaction === 'blue' ? 'bg-blue-500' : 'bg-gray-500'}`} />
            <span className="text-xs text-gray-300 font-medium">{phaseDisplay}</span>
            <span className="text-xs text-gray-600 ml-auto">第 {turn} 回合</span>
          </div>
          {/* v59.0: Turn action progress bar */}
          {currentFaction === 'red' && (phase === 'selectUnit' || phase === 'moveUnit' || phase === 'attackUnit') && (
            <div className="mt-2">
              <div className="flex justify-between text-[10px] text-gray-500 mb-0.5">
                <span>行动进度</span>
                <span>{actedUnits}/{totalUnits}</span>
              </div>
              <div className="w-full h-1 bg-gray-700/50 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-300"
                  style={{
                    width: `${progress * 100}%`,
                    backgroundColor: progress >= 1 ? '#4ade80' : progress > 0.5 ? '#fbbf24' : '#60a5fa',
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Categories */}
        <ScrollArea className="max-h-[55vh] px-6 py-4">
          <div className="space-y-5">
            {SHORTCUT_CATEGORY_ORDER.filter(cat => SHORTCUTS.some(s => s.category === cat)).map(cat => {
              const categoryShortcuts = SHORTCUTS.filter(s => s.category === cat);
              return (
                <div key={cat} className="rounded-lg bg-white/[0.03] border border-white/5 px-3 py-2.5">
                  <div className="flex items-center gap-2 mb-2">
                    <div className="w-6 h-6 rounded-md bg-white/5 flex items-center justify-center">
                      {SHORTCUT_CATEGORY_ICONS[cat]}
                    </div>
                    <span className="text-sm font-bold text-white">{cat}</span>
                    <span className="text-[10px] text-gray-500 ml-auto">{categoryShortcuts.length} 项</span>
                    <div className="flex-1 h-px bg-white/5" />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {categoryShortcuts.map(s => (
                      <div
                        key={`${s.category}-${s.key}-${s.description}`}
                        className="flex items-center gap-3 text-sm py-1 rounded-md hover:bg-white/5 transition-colors"
                      >
                        <KeyBadge isHelpKey={s.isHelpKey}>{s.key}</KeyBadge>
                        <span className="text-gray-300 text-xs">{s.description}</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </ScrollArea>

        {/* Footer */}
        <div className="px-6 py-3 border-t border-white/10 flex items-center justify-between">
          <p className="text-[10px] text-gray-600">按任意键或点击外部关闭</p>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-gray-500">随时按</span>
            <KeyBadge isHelpKey>?</KeyBadge>
            <span className="text-[10px] text-gray-500">/</span>
            <KeyBadge>H</KeyBadge>
            <span className="text-[10px] text-gray-500">切换</span>
          </div>
        </div>
      </motion.div>
    </motion.div>
  );
}

// ===== Battle Replay Overlay =====
function ReplayOverlay({ replayState, onNext, onEnd }: {
  replayState: ReplayState;
  onNext: () => void;
  onEnd: () => void;
}) {
  const { replayActions, currentReplayStep, turnNumber, faction } = replayState;
  const currentAction = replayActions[currentReplayStep];
  const isLast = currentReplayStep >= replayActions.length - 1;
  const isRed = faction === 'red';

  return (
    <motion.div
      className="absolute inset-0 z-[65] flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.3 }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" />
      <motion.div
        className="relative z-10 min-w-[340px] max-w-[420px]"
        initial={{ scale: 0.9, y: 20 }}
        animate={{ scale: 1, y: 0 }}
        transition={{ duration: 0.4, ease: 'easeOut' }}
      >
        <Card
          className="bg-black/95 backdrop-blur-xl text-white shadow-2xl overflow-hidden"
          style={{
            borderColor: isRed ? 'rgba(239,68,68,0.4)' : 'rgba(59,130,246,0.4)',
            borderWidth: '1px',
          }}
        >
          <div
            className={`px-4 py-3 flex items-center gap-3 ${
              isRed
                ? 'bg-gradient-to-r from-red-900/80 via-red-800/50 to-red-900/80'
                : 'bg-gradient-to-r from-blue-900/80 via-blue-800/50 to-blue-900/80'
            }`}
          >
            <div className={`w-9 h-9 rounded-full flex items-center justify-center ${isRed ? 'bg-red-600/60' : 'bg-blue-600/60'}`}>
              <ScrollText className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className={`text-base font-bold ${isRed ? 'text-red-300' : 'text-blue-300'}`}>
                战斗回放
              </div>
              <div className="text-[11px] text-white/60">
                第 {turnNumber} 回合 · {isRed ? '红方' : '蓝方'}
              </div>
            </div>
          </div>

          <CardContent className="p-4 space-y-3">
            {/* Action description */}
            {currentAction && (
              <motion.div
                key={currentReplayStep}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.2 }}
                className="p-3 rounded-lg bg-white/5 border border-white/10"
              >
                <div className="flex items-center gap-2 mb-1">
                  <Badge
                    variant="outline"
                    className={`text-[10px] ${
                      currentAction.type === 'destroy'
                        ? 'border-red-500/50 text-red-400 bg-red-900/20'
                        : currentAction.type === 'attack'
                          ? 'border-orange-500/50 text-orange-400 bg-orange-900/20'
                          : 'border-gray-500/50 text-gray-400 bg-gray-900/20'
                    }`}
                  >
                    {currentAction.type === 'destroy' ? '💀 击毁' : currentAction.type === 'attack' ? '⚔️ 攻击' : '🔄 移动'}
                  </Badge>
                  {currentAction.damage && (
                    <Badge variant="outline" className="text-[10px] border-red-500/50 text-red-300 bg-red-900/20">
                      -{currentAction.damage} 伤害
                    </Badge>
                  )}
                </div>
                <div className="text-xs text-gray-200 leading-relaxed">
                  {currentAction.description}
                </div>
              </motion.div>
            )}

            {/* Progress bar */}
            <div className="space-y-1">
              <div className="flex items-center justify-between text-[10px] text-gray-500">
                <span>步骤 {currentReplayStep + 1}</span>
                <span>共 {replayActions.length} 步</span>
              </div>
              <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                <motion.div
                  className={`h-full rounded-full ${isRed ? 'bg-red-500' : 'bg-blue-500'}`}
                  animate={{ width: `${((currentReplayStep + 1) / replayActions.length) * 100}%` }}
                  transition={{ duration: 0.3 }}
                />
              </div>
            </div>

            {/* Buttons */}
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className={`flex-1 h-9 text-xs font-bold transition-all ${
                  isLast
                    ? 'bg-gray-700 text-gray-400 cursor-not-allowed'
                    : `bg-gradient-to-r ${isRed ? 'from-red-700 to-red-600 hover:from-red-600 hover:to-red-500' : 'from-blue-700 to-blue-600 hover:from-blue-600 hover:to-blue-500'} text-white`
                }`}
                onClick={onNext}
                disabled={isLast}
              >
                <PlayCircle className="w-3.5 h-3.5 mr-1.5" />
                {isLast ? '回放结束' : '▶ 下一步'}
              </Button>
              <Button
                size="sm"
                variant="outline"
                className="h-9 px-4 text-xs border-white/20 text-gray-300 hover:bg-white/10 hover:text-white"
                onClick={onEnd}
              >
                <SkipForward className="w-3.5 h-3.5 mr-1" />
                结束回放
              </Button>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}

// ===== Tutorial Overlay =====
function TutorialOverlay({ step, onAdvance, onDismiss }: {
  step: typeof TUTORIAL_STEPS[number];
  onAdvance: () => void;
  onDismiss: () => void;
}) {
  const positionClasses = {
    center: 'items-center justify-center',
    top: 'items-start justify-center pt-20',
    bottom: 'items-end justify-center pb-28',
    left: 'items-center justify-start pl-16',
    right: 'items-center justify-end pr-16',
  };

  return (
    <motion.div
      className={`absolute inset-0 z-[70] flex ${positionClasses[step.position]} pointer-events-auto`}
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.35 }}
    >
      <div className="absolute inset-0 bg-black/40 backdrop-blur-[2px]" onClick={onDismiss} />
      <motion.div
        className="relative z-10 max-w-sm mx-4"
        initial={{ y: 30, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 30, opacity: 0 }}
        transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        <Card className="bg-gray-900/95 backdrop-blur-xl border-amber-500/40 text-white shadow-2xl overflow-hidden">
          <div className="h-1 bg-gradient-to-r from-amber-500 via-yellow-400 to-amber-500" />
          <CardContent className="p-5 space-y-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-amber-500/20 border border-amber-500/40 flex items-center justify-center flex-shrink-0">
                <GraduationCap className="w-5 h-5 text-amber-400" />
              </div>
              <div>
                <div className="text-[10px] text-amber-500 font-bold uppercase tracking-wider">
                  新手引导 · 步骤 {step.id + 1}/{TUTORIAL_STEPS.length}
                </div>
                <div className="text-base font-bold">{step.title}</div>
              </div>
            </div>
            <p className="text-sm text-gray-300 leading-relaxed">{step.description}</p>
            <div className="flex items-center gap-2">
              <Button
                size="sm"
                className="flex-1 h-9 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-black text-xs font-bold shadow-lg shadow-amber-900/30"
                onClick={onAdvance}
              >
                {step.id < TUTORIAL_STEPS.length - 1 ? '下一步 →' : '开始战斗! 🎮'}
              </Button>
              <Button
                size="sm"
                variant="ghost"
                className="h-9 px-3 text-xs text-gray-500 hover:text-gray-300"
                onClick={onDismiss}
              >
                跳过引导
              </Button>
            </div>
            {/* Step dots */}
            <div className="flex items-center justify-center gap-1.5 pt-1">
              {TUTORIAL_STEPS.map((s) => (
                <div
                  key={s.id}
                  className={`w-1.5 h-1.5 rounded-full transition-all duration-300 ${
                    s.id === step.id ? 'bg-amber-400 w-4' : s.id < step.id ? 'bg-amber-400/40' : 'bg-white/20'
                  }`}
                />
              ))}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}

// ===== Unit Comparison Panel (compact) =====
const UnitComparisonPanel = React.memo(function UnitComparisonPanel({ selectedUnit, hoveredUnit }: { selectedUnit: Unit; hoveredUnit: Unit }) {
  const isEnemy = selectedUnit.faction !== hoveredUnit.faction;
  
  const compareStat = (icon: React.ReactNode, a: number, b: number) => {
    const diff = a - b;
    const color = diff > 0 ? 'text-green-400' : diff < 0 ? 'text-red-400' : 'text-gray-400';
    return (
      <span key={String(icon)} className={`flex items-center gap-0.5 ${color}`}>
        {icon}
        <span className={selectedUnit.faction === 'red' ? 'text-red-400' : 'text-blue-400'}>{a}</span>
        <span className="text-gray-600">vs</span>
        <span className={hoveredUnit.faction === 'red' ? 'text-red-400' : 'text-blue-400'}>{b}</span>
        {diff !== 0 && <span className="text-[10px]">{diff > 0 ? `+${diff}` : diff}</span>}
      </span>
    );
  };

  return (
    <div className="px-3 pb-2 space-y-0.5">
      <div className="flex items-center gap-1.5 text-[11px]">
        <Crosshair className="w-3 h-3 text-amber-400" />
        <span className="text-amber-400 font-medium">{isEnemy ? '敌方对比' : '友方对比'}</span>
      </div>
      <div className="flex items-center gap-1 text-[11px]">
        <span className={selectedUnit.faction === 'red' ? 'text-red-400' : 'text-blue-400'}>{selectedUnit.name}</span>
        <span className="text-gray-600">vs</span>
        <span className={hoveredUnit.faction === 'red' ? 'text-red-400' : 'text-blue-400'}>{hoveredUnit.name}</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px]">
        {compareStat(<Swords className="w-2.5 h-2.5 text-orange-400" />, selectedUnit.stats.attack, hoveredUnit.stats.attack)}
        {compareStat(<Shield className="w-2.5 h-2.5 text-blue-400" />, selectedUnit.stats.defense, hoveredUnit.stats.defense)}
        {compareStat(<BrickWall className="w-2.5 h-2.5 text-amber-400" />, selectedUnit.stats.armor, hoveredUnit.stats.armor)}
        {compareStat(<Zap className="w-2.5 h-2.5 text-cyan-400" />, selectedUnit.stats.armorPenetration, hoveredUnit.stats.armorPenetration)}
        {compareStat(<span className="text-green-400 text-[10px]">👁</span>, selectedUnit.stats.vision, hoveredUnit.stats.vision)}
        {compareStat(<Footprints className="w-2.5 h-2.5 text-purple-400" />, selectedUnit.stats.moveRange, hoveredUnit.stats.moveRange)}
        {compareStat(<Target className="w-2.5 h-2.5 text-red-400" />, getEffectiveAttackRange(selectedUnit), getEffectiveAttackRange(hoveredUnit))}
      </div>
    </div>
  );
});

// ===== Combat Result Toast (Enhanced) =====
const CombatResultToast = React.memo(function CombatResultToast({ toast, onDismiss }: { toast: CombatToast; onDismiss: (id: number) => void }) {
  const [fadingOut, setFadingOut] = useState(false);
  const isRed = toast.attackerFaction === 'red';
  const hasCounter = toast.counterDamage && toast.counterDamage > 0;
  // v89.0: Get defender unit type icon for kill notifications
  const defenderTypeIcon = toast.wasKill && toast.defenderType ? UNIT_ICONS[toast.defenderType] : null;

  useEffect(() => {
    // Start fade-out at 3.5s, remove at 4s
    const fadeTimer = setTimeout(() => setFadingOut(true), 3500);
    const removeTimer = setTimeout(() => onDismiss(toast.id), 4000);
    return () => { clearTimeout(fadeTimer); clearTimeout(removeTimer); };
  }, [toast.id, onDismiss]);

  return (
    <motion.div
      initial={{ x: 80, opacity: 0, scale: 0.9 }}
      animate={{ x: 0, opacity: 1, scale: 1 }}
      exit={{ x: 80, opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.35, ease: [0.25, 0.46, 0.45, 0.94] }}
      className="pointer-events-auto bg-black/90 backdrop-blur-md border rounded-lg shadow-2xl overflow-hidden max-w-[270px]"
      style={{ 
        // v89.0: Brief golden border flash for kill toasts
        borderColor: toast.wasKill ? 'rgba(234,179,8,0.5)' : isRed ? 'rgba(239,68,68,0.35)' : 'rgba(59,130,246,0.35)',
        opacity: fadingOut ? 0 : 1,
        transition: 'opacity 0.5s ease-out, border-color 0.3s ease-out',
      }}
    >
      <div className={`h-0.5 ${isRed ? 'bg-gradient-to-r from-red-600 via-red-400 to-red-600' : 'bg-gradient-to-r from-blue-600 via-blue-400 to-blue-600'}`} />
      <div className="p-2.5 space-y-1">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Swords className="w-3.5 h-3.5 text-orange-400" />
            <span className="text-xs font-bold text-white">战斗结果</span>
          </div>
          <Button
            size="sm"
            variant="ghost"
            className="h-4 w-4 p-0 text-gray-400 hover:text-white"
            onClick={() => onDismiss(toast.id)}
          >
            <X className="w-2.5 h-2.5" />
          </Button>
        </div>
        <div className="text-[11px] space-y-0.5">
          <div className="flex items-center gap-1">
            <Swords className="w-3 h-3 flex-shrink-0" style={{ color: isRed ? '#f87171' : '#60a5fa' }} />
            <span className={`font-semibold ${isRed ? 'text-red-400' : 'text-blue-400'}`}>
              {toast.attackerName}
            </span>
            <span className="text-gray-500">→</span>
            <span className={`font-semibold ${isRed ? 'text-blue-400' : 'text-red-400'}`}>
              {toast.defenderName}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-red-400 font-bold">-{toast.damage}</span>
            <span className="text-gray-500">|</span>
            <span className={`text-[10px] ${toast.defenderRemainingHp > 0 ? 'text-gray-300' : 'text-red-500'}`}>
              HP {toast.defenderRemainingHp}{toast.wasKill ? ' 💀' : ''}
            </span>
            {/* v89.0: Unit type icon alongside kill indicator */}
            {toast.wasKill && defenderTypeIcon && (
              <span className="text-white/40" title={`击杀 ${toast.defenderType}`}>{defenderTypeIcon}</span>
            )}
          </div>
          {hasCounter && (
            <div className="flex items-center gap-2 mt-0.5 pt-0.5 border-t border-white/10">
              <Shield className="w-3 h-3 text-yellow-400 flex-shrink-0" />
              <span className="text-yellow-400 font-bold text-[10px]">反击 -{toast.counterDamage}</span>
              <span className="text-gray-500">|</span>
              <span className={`text-[10px] ${toast.attackerRemainingHp !== undefined && toast.attackerRemainingHp > 0 ? 'text-gray-300' : 'text-red-500'}`}>
                HP {toast.attackerRemainingHp ?? '?'}{toast.wasCounterKill ? ' 💀' : ''}
              </span>
            </div>
          )}
          {/* v76.0: Kill streak display */}
          {toast.wasKill && (toast.attackerKillCount ?? 0) >= 3 && (
            <div className="flex items-center gap-1 mt-0.5 pt-0.5 border-t border-white/10">
              <Flame className="w-3 h-3 text-orange-400 flex-shrink-0" />
              <span className={`font-bold text-[10px] ${
                (toast.attackerKillCount ?? 0) >= 5 ? 'text-red-400' :
                (toast.attackerKillCount ?? 0) >= 4 ? 'text-orange-400' : 'text-amber-400'
              }`}>
                {(toast.attackerKillCount ?? 0) >= 5 ? '无人可挡' :
                 (toast.attackerKillCount ?? 0) >= 4 ? '势不可挡' : '连续击杀'}
                {' '}x{toast.attackerKillCount}
              </span>
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
});

// ===== Level Up Notification Item (Enhanced) =====
const LevelUpNotificationItem = React.memo(function LevelUpNotificationItem({ notification }: { notification: LevelUpNotifType }) {
  const [isVisible, setIsVisible] = useState(true);
  const isRed = notification.faction === 'red';

  const unitType = Object.keys(UNIT_ICONS).find(k => notification.unitName.includes(UNIT_CONFIGS[k]?.name ?? '')) || 'infantry';

  useEffect(() => {
    const fadeTimer = setTimeout(() => setIsVisible(false), 3500);
    // v77.0: Fixed — removeTimer now does nothing (store handles cleanup via slice cap)
    // Previously both timers called setIsVisible(false) — removeTimer was meant to remove from store
    return () => { clearTimeout(fadeTimer); };
  }, [notification.id]);

  const statBadges = [
    { label: 'ATK', value: notification.bonus.attack, color: 'text-orange-400' },
    { label: 'DEF', value: notification.bonus.defense, color: 'text-blue-400' },
    { label: '装甲', value: notification.bonus.armor, color: 'text-amber-400' },
    { label: 'HP', value: notification.bonus.maxHp, color: 'text-green-400' },
    { label: '穿甲', value: notification.bonus.armorPenetration, color: 'text-cyan-400' },
    { label: '视野', value: notification.bonus.vision, color: 'text-purple-400' },
    { label: '机动', value: notification.bonus.moveRange, color: 'text-lime-400' },
    { label: '射程', value: notification.bonus.attackRange, color: 'text-rose-400' },
  ].filter(s => s.value > 0);

  // v49.0: Use timer-based state instead of Date.now() in selector to prevent per-render changes
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(timer);
  }, []);

  const stackIndex = useGameStore(s =>
    s.levelUpNotifications?.filter(n => now - n.timestamp < 4000 && n.id < notification.id).length ?? 0
  );

  return (
    <motion.div
      className="absolute top-14 left-4 right-4 z-50 pointer-events-none"
      initial={{ x: '-100%', opacity: 0, scale: 0.95 }}
      animate={{ x: 0, opacity: isVisible ? 1 : 0, scale: 1, y: stackIndex * 70 }}
      exit={{ x: '100%', opacity: 0, scale: 0.95 }}
      transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <div 
        className="mx-auto max-w-md rounded-xl px-4 py-3 shadow-2xl relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, rgba(120,90,10,0.9) 0%, rgba(50,40,5,0.95) 100%)',
          border: '2px solid rgba(234,179,8,0.5)',
          boxShadow: isVisible 
            ? '0 0 20px rgba(234,179,8,0.3), 0 0 40px rgba(234,179,8,0.1), inset 0 1px 0 rgba(255,255,255,0.1)' 
            : 'none',
          opacity: isVisible ? 1 : 0,
          transition: 'opacity 0.5s ease-out, box-shadow 0.5s ease-out',
        }}
      >
        {/* Golden glow animation */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <motion.div
            className="absolute inset-0"
            animate={{ 
              background: [
                'linear-gradient(90deg, transparent 0%, rgba(234,179,8,0.1) 50%, transparent 100%)',
                'linear-gradient(90deg, transparent 30%, rgba(234,179,8,0.2) 70%, transparent 100%)',
                'linear-gradient(90deg, transparent 0%, rgba(234,179,8,0.1) 50%, transparent 100%)',
              ],
            }}
            transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
          />
        </div>

        <div className="relative z-10 flex items-center gap-3">
          {/* Unit icon */}
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0 ${
            isRed ? 'bg-red-900/60' : 'bg-blue-900/60'
          }`}>
            <span className={isRed ? 'text-red-400' : 'text-blue-400'}>
              {UNIT_ICONS[unitType]}
            </span>
          </div>

          {/* Level info */}
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <span className={`font-bold text-sm ${isRed ? 'text-red-300' : 'text-blue-300'}`}>
                {notification.unitName}
              </span>
              <span className="text-yellow-500/60 text-xs">Lv.{notification.oldLevel}</span>
              <span className="text-yellow-400 font-bold text-sm">→</span>
              <span className="text-yellow-300 font-bold text-base">Lv.{notification.newLevel}</span>
              <span className="text-yellow-500 font-bold text-lg ml-1">⬆</span>
            </div>
            {/* Stat badges */}
            <div className="flex items-center gap-1 mt-1 flex-wrap">
              {statBadges.map(s => (
                <span key={s.label} className={`text-[10px] px-1.5 py-0.5 rounded-full bg-green-900/40 border border-green-500/30 font-bold ${s.color}`}>
                  +{s.value} {s.label}
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </motion.div>
  );
});

// ===== Unit Type Ability Descriptions =====
const ABILITY_DESCRIPTIONS: Record<string, string> = {
  tank: '重装甲、高穿甲，地面突击核心',
  ifv: '均衡机动，搭载步兵',
  artillery: '远程火力支援，高爆弹溅射伤害',
  scout: '高速侦察，可隐蔽，大视野',
  infantry: '轻装步兵，可隐蔽，反坦克导弹',
  sam: '区域防空，范围2格内直升机伤害-30%',
  engineer: '修建工事，增强防御+20',
  supply: '每回合治疗相邻友军10HP，恢复已攻击友军弹药',
  helicopter: '无视地形，高机动，反坦克',
  mlrs: '超远程火力，高爆弹溅射伤害',
};

// ===== Capture Point Type Icons =====
const CP_TYPE_CONFIG: Record<string, { icon: string; label: string }> = {
  stronghold: { icon: '🏰', label: '要塞' },
  bridgehead: { icon: '🌉', label: '桥头堡' },
  supply_base: { icon: '📦', label: '补给' },
  comm_hub: { icon: '📡', label: '通信' },
};

// ===== Timer Helper =====
function formatElapsedTime(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

// ===== Battle Stats Sub-components =====
const StatsStatRow = React.memo(function StatsStatRow({ label, redVal, blueVal, icon }: { label: string; redVal: number; blueVal: number; icon: string }) {
  return (
    <div className="flex items-center gap-1 text-[10px]">
      <span className="w-12 text-right text-red-400 font-bold">{redVal}</span>
      <span className="text-gray-500 w-10 text-center">{icon} {label}</span>
      <span className="w-12 text-left text-blue-400 font-bold">{blueVal}</span>
    </div>
  );
});

const StatsDamageBar = React.memo(function StatsDamageBar({ label, redVal, blueVal, icon }: { label: string; redVal: number; blueVal: number; icon: string }) {
  const max = Math.max(redVal, blueVal, 1);
  const redPct = Math.round((redVal / max) * 100);
  const bluePct = Math.round((blueVal / max) * 100);
  return (
    <div className="space-y-0.5">
      <div className="flex items-center gap-1 text-[10px]">
        <span className="w-12 text-right text-red-400 font-bold">{redVal}</span>
        <span className="text-gray-500 w-10 text-center">{icon} {label}</span>
        <span className="w-12 text-left text-blue-400 font-bold">{blueVal}</span>
      </div>
      <div className="flex items-center gap-1 px-12">
        <div className="flex-1 flex gap-0.5">
          <div className="h-1 rounded-full bg-red-500/60 transition-all" style={{ width: `${redPct}%` }} />
        </div>
        <div className="flex-1 flex gap-0.5 justify-end">
          <div className="h-1 rounded-full bg-blue-500/60 transition-all" style={{ width: `${bluePct}%` }} />
        </div>
      </div>
    </div>
  );
});

// ===== Battle Statistics Panel =====
function BattleStatsPanel({ battleStats }: { battleStats: BattleStatsType }) {
  const [isOpen, setIsOpen] = useState(false);

  const red = battleStats.red;
  const blue = battleStats.blue;

  // v89.0: Removed redundant top-12 class (inline style top:200px takes precedence)
  return (
    <div className="pointer-events-auto absolute right-2 z-10 w-48" style={{ top: '200px' }}>
      <Card className="bg-black/50 backdrop-blur-xl border border-white/10 text-white shadow-xl shadow-black/20 overflow-hidden">
        <div className="h-0.5 bg-gradient-to-r from-red-500/30 via-white/10 to-blue-500/30" />
        <div
          className="flex items-center gap-1.5 px-2.5 py-1.5 cursor-pointer hover:bg-white/5 transition-colors"
          onClick={() => setIsOpen(!isOpen)}
        >
          <span className="text-xs font-medium text-white/80 flex-1">📊 战斗统计</span>
          {!isOpen && (
            <span className="text-[10px] text-gray-400">
              💀{red.kills + blue.kills} 💥{red.damageDealt + blue.damageDealt}
            </span>
          )}
          {isOpen ? <ChevronUp className="w-3 h-3 text-gray-400" /> : <ChevronRight className="w-3 h-3 text-gray-400" />}
        </div>
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.2, ease: 'easeInOut' }}
              className="overflow-hidden"
            >
              <div className="px-2.5 pb-2.5 space-y-1.5">
                {/* Column headers */}
                <div className="flex items-center gap-1 text-[10px] text-gray-500 border-b border-white/5 pb-1 mb-1">
                  <span className="w-12 text-right text-red-400">🔴 红方</span>
                  <span className="w-10 text-center">统计</span>
                  <span className="w-12 text-left text-blue-400">🔵 蓝方</span>
                </div>

                {/* Damage comparison with bar chart */}
                <StatsDamageBar label="伤害" redVal={red.damageDealt} blueVal={blue.damageDealt} icon="💥" />
                <StatsDamageBar label="承伤" redVal={red.damageReceived} blueVal={blue.damageReceived} icon="🛡️" />

                <Separator className="bg-white/5" />

                {/* Kill counts */}
                <StatsStatRow label="击杀" redVal={red.kills} blueVal={blue.kills} icon="💀" />
                <StatsStatRow label="损失" redVal={red.unitsLost} blueVal={blue.unitsLost} icon="❌" />
                <StatsStatRow label="击毁" redVal={red.unitsDestroyed} blueVal={blue.unitsDestroyed} icon="🎯" />

                <Separator className="bg-white/5" />

                {/* Other stats */}
                <StatsStatRow label="攻击" redVal={red.attacks} blueVal={blue.attacks} icon="⚔️" />
                <StatsStatRow label="治疗" redVal={red.healingDone} blueVal={blue.healingDone} icon="💚" />
                <StatsStatRow label="工事" redVal={red.fortsBuilt} blueVal={blue.fortsBuilt} icon="🧱" />
                <StatsStatRow label="撤退" redVal={red.retreated} blueVal={blue.retreated} icon="🚩" />
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </Card>
    </div>
  );
}

// ===== Career Stats Summary (shown in Game Over Panel) =====
function CareerStatsSummary() {
  const stats = useMemo(() => loadPlayerStats(), []);

  if (!stats || stats.totalGames === 0) return null;

  const winRate = stats.totalGames > 0 ? Math.round((stats.totalWins / stats.totalGames) * 100) : 0;
  const unlockedAchCount = stats.achievements.length;

  return (
    <div className="bg-white/5 rounded-lg p-3 border border-white/10">
      <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-2">
        📊 历史成绩
      </div>
      <div className="grid grid-cols-4 gap-3 text-center">
        <div>
          <div className="text-base font-bold text-white">{stats.totalGames}</div>
          <div className="text-[9px] text-gray-500">总局数</div>
        </div>
        <div>
          <div className="text-base font-bold text-green-400">{winRate}%</div>
          <div className="text-[9px] text-gray-500">胜率</div>
        </div>
        <div>
          <div className="text-base font-bold text-amber-400">{stats.winStreak}</div>
          <div className="text-[9px] text-gray-500">最长连胜</div>
        </div>
        <div>
          <div className="text-base font-bold text-orange-400">{unlockedAchCount}</div>
          <div className="text-[9px] text-gray-500">成就</div>
        </div>
      </div>
    </div>
  );
}

function GameOverPanel({ winner, turn, victoryReason, battleStats, redAlive, redLost, blueAlive, blueLost, capturePoints, onRestart, onReturnHome, isStrategicTacticalBattle, allUnits, gameStartTime, currentWeather }: {
  winner: 'red' | 'blue';
  turn: number;
  victoryReason?: string | null;
  battleStats: BattleStatsType;
  redAlive: number;
  redLost: number;
  blueAlive: number;
  blueLost: number;
  capturePoints: { id: string; owner: string | null }[] | null;
  onRestart: () => void;
  onReturnHome?: () => void;
  isStrategicTacticalBattle?: boolean;
  allUnits?: Unit[];
  gameStartTime?: number | null;
  currentWeather?: WeatherType;
}) {
  const isRed = winner === 'red';
  const isPlayerWin = isRed; // Player is always red
  const [showDetailedStats, setShowDetailedStats] = useState(false);
  const [copyToast, setCopyToast] = useState(false);

  // v51.0: Dynamic elapsed time (updates every second, doesn't freeze)
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  // Elapsed time
  const elapsedMs = gameStartTime ? now - gameStartTime : 0;
  const elapsedMin = Math.floor(elapsedMs / 60000);
  const elapsedSec = Math.floor((elapsedMs % 60000) / 1000);
  const elapsedStr = `${String(elapsedMin).padStart(2, '0')}:${String(elapsedSec).padStart(2, '0')}`;

  // Weather display
  const weatherConfig = currentWeather ? WEATHER_CONFIGS[currentWeather] : WEATHER_CONFIGS.clear;

  // Capture points
  const redCps = capturePoints ? capturePoints.filter(cp => cp.owner === 'red').length : 0;
  const blueCps = capturePoints ? capturePoints.filter(cp => cp.owner === 'blue').length : 0;

  // v89.0: Performance rating — always grade the PLAYER (red), not the winner
  // Previously, winner stats were used, so a player who barely lost got a D rating.
  // Now we always evaluate red's performance relative to the opponent.
  const playerStats = battleStats.red;
  const opponentStats = battleStats.blue;
  const playerSurvived = redAlive;
  const playerTotal = redAlive + redLost;
  const survivedRatio = playerTotal > 0 ? playerSurvived / playerTotal : 0;
  const damageEfficiency = Math.min(playerStats.damageDealt / Math.max(opponentStats.damageDealt, 1), 3) / 3;
  const turnEfficiency = Math.max(0, 1 - (turn - 10) / 40);
  const score = (survivedRatio * 50) + (damageEfficiency * 30) + (turnEfficiency * 20);

  const getRating = (s: number) => {
    if (s >= 90) return { letter: 'S', label: '完美指挥', color: 'text-yellow-400', border: 'border-yellow-400', bg: 'bg-yellow-400/10' };
    if (s >= 75) return { letter: 'A', label: '出色表现', color: 'text-green-400', border: 'border-green-400', bg: 'bg-green-400/10' };
    if (s >= 60) return { letter: 'B', label: '稳健指挥', color: 'text-blue-400', border: 'border-blue-400', bg: 'bg-blue-400/10' };
    if (s >= 40) return { letter: 'C', label: '尚可一战', color: 'text-gray-400', border: 'border-gray-400', bg: 'bg-gray-400/10' };
    return { letter: 'D', label: '需要改进', color: 'text-red-400', border: 'border-red-400', bg: 'bg-red-400/10' };
  };
  const rating = getRating(score);

  // ===== MVP Awards (useMemo for expensive calculations) =====
  const mvpAwards = useMemo(() => {
    if (!allUnits || allUnits.length === 0) return [];
    const awards: { emoji: string; title: string; description: string; unitName?: string; factionName?: string; value: string; color: string }[] = [];

    // 🎯 Top Killer: unit with most kills across all factions
    const topKiller = [...allUnits].filter(u => u.killCount > 0).sort((a, b) => b.killCount - a.killCount)[0];
    if (topKiller) {
      awards.push({
        emoji: '🎯', title: '最佳杀手',
        description: `击杀数最多的单位`,
        unitName: topKiller.name,
        factionName: topKiller.faction === 'red' ? '红方' : '蓝方',
        value: `${topKiller.killCount} 击杀`,
        color: topKiller.faction === 'red' ? 'border-red-500/30 bg-red-500/5' : 'border-blue-500/30 bg-blue-500/5',
      });
    }

    // 🛡️ Tank: unit that received most damage and survived
    // v89.0: Steel Fortress = unit that absorbed most damage AND survived (not most damage dealt)
    const topTank = [...allUnits].filter(u => u.isAlive).sort((a, b) => {
      // Use hp lost as proxy: maxHp - hp = total damage absorbed
      const aAbsorbed = a.stats.maxHp - a.stats.hp;
      const bAbsorbed = b.stats.maxHp - b.stats.hp;
      return bAbsorbed - aAbsorbed;
    })[0];
    if (topTank) {
      const absorbed = topTank.stats.maxHp - topTank.stats.hp;
      if (absorbed > 0) {
        awards.push({
          emoji: '🛡️', title: '钢铁堡垒',
          description: `承受伤害最多并存活`,
          unitName: topTank.name,
          factionName: topTank.faction === 'red' ? '红方' : '蓝方',
          value: `${absorbed} 承伤`,
          color: topTank.faction === 'red' ? 'border-red-500/30 bg-red-500/5' : 'border-blue-500/30 bg-blue-500/5',
        });
      }
    }

    // ⚔️ Damage Dealer: faction that dealt more total damage
    const damageWinner = battleStats.red.damageDealt >= battleStats.blue.damageDealt ? 'red' : 'blue';
    awards.push({
      emoji: '⚔️', title: '火力之王',
      description: `造成伤害最多的阵营`,
      factionName: damageWinner === 'red' ? '红方' : '蓝方',
      value: `${damageWinner === 'red' ? battleStats.red.damageDealt : battleStats.blue.damageDealt} 伤害`,
      color: damageWinner === 'red' ? 'border-red-500/30 bg-red-500/5' : 'border-blue-500/30 bg-blue-500/5',
    });

    // 🏃 Most Active: unit with highest total damage dealt (across all units)
    const allSortedByDmg = [...allUnits].sort((a, b) => b.totalDamageDealt - a.totalDamageDealt);
    const topDmgUnit = allSortedByDmg[0];
    if (topDmgUnit && topDmgUnit.totalDamageDealt > 0 && (!topKiller || topDmgUnit.id !== topKiller.id)) {
      awards.push({
        emoji: '💥', title: '输出之星',
        description: `总伤害最高的单位`,
        unitName: topDmgUnit.name,
        factionName: topDmgUnit.faction === 'red' ? '红方' : '蓝方',
        value: `${topDmgUnit.totalDamageDealt} 伤害`,
        color: topDmgUnit.faction === 'red' ? 'border-red-500/30 bg-red-500/5' : 'border-blue-500/30 bg-blue-500/5',
      });
    }

    return awards.slice(0, 4);
  }, [allUnits, battleStats]);

  // ===== Comparison stats for the table =====
  const comparisonRows = useMemo(() => [
    { label: '伤害输出', icon: '💥', red: battleStats.red.damageDealt, blue: battleStats.blue.damageDealt },
    { label: '承受伤害', icon: '🛡️', red: battleStats.red.damageReceived, blue: battleStats.blue.damageReceived },
    { label: '击毁敌军', icon: '💀', red: battleStats.red.kills, blue: battleStats.blue.kills },
    { label: '部队损失', icon: '🔥', red: battleStats.red.unitsLost, blue: battleStats.blue.unitsLost },
    { label: '治疗恢复', icon: '💚', red: battleStats.red.healingDone, blue: battleStats.blue.healingDone },
    { label: '攻击次数', icon: '⚔️', red: battleStats.red.attacks, blue: battleStats.blue.attacks },
    { label: '修建工事', icon: '🧱', red: battleStats.red.fortsBuilt, blue: battleStats.blue.fortsBuilt },
    { label: '撤退次数', icon: '🚩', red: battleStats.red.retreated, blue: battleStats.blue.retreated },
  ], [battleStats]);

  // ===== Unit Summary grid =====
  const unitSummary = useMemo(() => {
    if (!allUnits) return [];
    return allUnits.map(u => {
      const config = UNIT_CONFIGS[u.type];
      return {
        id: u.id,
        name: config?.name ?? u.type,
        type: u.type,
        faction: u.faction,
        isAlive: u.isAlive,
        level: u.level,
        killCount: u.killCount,
        hp: u.stats.hp,
        maxHp: u.stats.maxHp,
        totalDamageDealt: u.totalDamageDealt,
      };
    });
  }, [allUnits]);

  const handleCopyReport = useCallback(() => {
    const report = `⚔️ 铁甲战棋 - 战报\n🏆 ${isRed ? '红' : '蓝'}方胜利 | 评级: ${rating.letter}\n📅 第${turn}回合 | ⏱️ 用时${elapsedStr} | 🌤️ ${weatherConfig.name}\n🔴 红方: ${redAlive}存活/${redLost}损失 | 击毁${battleStats.red.kills} | 伤害${battleStats.red.damageDealt}\n🔵 蓝方: ${blueAlive}存活/${blueLost}损失 | 击毁${battleStats.blue.kills} | 伤害${battleStats.blue.damageDealt}\n${victoryReason ? `📝 ${victoryReason}` : ''}`;
    try {
      navigator.clipboard.writeText(report);
      setCopyToast(true);
      setTimeout(() => setCopyToast(false), 2000);
    } catch { /* ignore */ }
  }, [isRed, turn, elapsedStr, weatherConfig.name, redAlive, redLost, blueAlive, blueLost, battleStats, rating.letter, victoryReason]);

  // Progress bar helper
  const ComparisonBar = ({ redVal, blueVal }: { redVal: number; blueVal: number }) => {
    const total = Math.max(redVal + blueVal, 1);
    const redPct = (redVal / total) * 100;
    const bluePct = (blueVal / total) * 100;
    const redHighlight = redVal >= blueVal;
    const blueHighlight = blueVal >= redVal;
    return (
      <div className="flex items-center gap-0.5 h-2 w-full rounded-full overflow-hidden bg-white/5">
        <div
          className={`h-full rounded-l-full transition-all duration-700 ${redHighlight ? 'bg-red-500' : 'bg-red-500/40'}`}
          style={{ width: `${Math.max(redPct, 2)}%` }}
        />
        <div
          className={`h-full rounded-r-full transition-all duration-700 ${blueHighlight ? 'bg-blue-500' : 'bg-blue-500/40'}`}
          style={{ width: `${Math.max(bluePct, 2)}%` }}
        />
      </div>
    );
  };

  return (
    <AnimatePresence>
      <motion.div
        className="absolute inset-0 z-[65] flex items-start justify-center overflow-y-auto"
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        transition={{ duration: 0.4 }}
      >
        <div className="absolute inset-0 bg-black/80 backdrop-blur-md" />
        <motion.div
          className="relative z-10 w-full max-w-2xl mx-auto my-6 px-4"
          initial={{ scale: 0.85, opacity: 0, y: 40 }}
          animate={{ scale: 1, opacity: 1, y: 0 }}
          exit={{ scale: 0.95, opacity: 0, y: -20 }}
          transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        >
          {/* ===== WINNER BANNER ===== */}
          <motion.div
            className={`relative rounded-t-2xl overflow-hidden px-6 py-8 text-center ${
              isRed
                ? 'bg-gradient-to-br from-red-900/80 via-red-800/50 to-red-950/80'
                : 'bg-gradient-to-br from-blue-900/80 via-blue-800/50 to-blue-950/80'
            }`}
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            {/* Animated glow */}
            <motion.div
              className="absolute inset-0 pointer-events-none"
              animate={{ opacity: [0.3, 0.6, 0.3] }}
              transition={{ duration: 2.5, repeat: Infinity, ease: 'easeInOut' }}
              style={{
                background: isRed
                  ? 'radial-gradient(circle at 50% 40%, rgba(239,68,68,0.2) 0%, transparent 70%)'
                  : 'radial-gradient(circle at 50% 40%, rgba(59,130,246,0.2) 0%, transparent 70%)',
              }}
            />
            {/* Trophy icon */}
            <motion.div
              className="text-7xl mb-3 relative z-10"
              initial={{ rotate: [0], scale: 0 }}
              animate={{ rotate: [0, -10, 10, -10, 0], scale: [0, 1] }}
              transition={{ scale: { duration: 0.5, ease: 'easeOut' }, rotate: { duration: 0.8, delay: 0.4 } }}
            >
              {isPlayerWin ? '🏆' : '💀'}
            </motion.div>
            <motion.div
              className="relative z-10"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.3 }}
            >
              <h2 className={`text-3xl sm:text-4xl font-extrabold tracking-wide ${isRed ? 'text-red-300' : 'text-blue-300'}`}>
                {isPlayerWin ? '🎉 胜利!' : '💔 战败'}
              </h2>
              <p className={`text-sm mt-1 ${isRed ? 'text-red-400/70' : 'text-blue-400/70'}`}>
                {isRed ? '红方' : '蓝方'}取得胜利
              </p>
              {victoryReason && (
                <motion.p
                  className="text-white/60 text-xs mt-2 max-w-md mx-auto"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  transition={{ delay: 0.5 }}
                >
                  📝 {victoryReason}
                </motion.p>
              )}
            </motion.div>
            {/* Rating badge */}
            <motion.div
              className="mt-4 relative z-10 inline-flex items-center gap-2"
              initial={{ opacity: 0, scale: 0.8 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: 0.6 }}
            >
              <Badge className={`text-2xl font-extrabold px-4 py-1.5 border-2 ${rating.color} ${rating.border} bg-transparent`}>
                {rating.letter}
              </Badge>
              <span className="text-xs text-white/60">{rating.label}</span>
            </motion.div>
          </motion.div>

          {/* ===== MAIN CONTENT CARD ===== */}
          <Card className="rounded-t-none bg-black/80 backdrop-blur-md text-white shadow-2xl overflow-hidden border-t-0"
            style={{ borderColor: isRed ? 'rgba(239,68,68,0.3)' : 'rgba(59,130,246,0.3)', borderWidth: '1px', borderTopWidth: 0 }}
          >
            <CardContent className="p-4 sm:p-6 space-y-5">

              {/* ===== SUMMARY ROW: 3 stat cards ===== */}
              <motion.div
                className="grid grid-cols-3 gap-3"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
              >
                {[
                  { icon: <Timer className="w-4 h-4 text-amber-400" />, label: '总回合数', value: `${turn}`, sub: '回合' },
                  { icon: <Clock className="w-4 h-4 text-green-400" />, label: '游戏时长', value: elapsedStr, sub: '分:秒' },
                  { icon: <span className="text-sm">{weatherConfig.icon}</span>, label: '最终天气', value: weatherConfig.name, sub: currentWeather === 'clear' ? '无影响' : '有影响' },
                ].map((s) => (
                  <div key={s.label} className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      {s.icon}
                      <span className="text-[10px] text-gray-500">{s.label}</span>
                    </div>
                    <div className="text-xl sm:text-2xl font-bold text-white">{s.value}</div>
                    <div className="text-[10px] text-gray-600">{s.sub}</div>
                  </div>
                ))}
              </motion.div>

              {/* v83.0: Enhanced stats row - kill streak, hero level, capture points */}
              <motion.div
                className="grid grid-cols-3 gap-3"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.32 }}
              >
                {(() => {
                  // Compute highest kill streak from allUnits
                  const maxKills = allUnits && allUnits.length > 0
                    ? Math.max(...allUnits.map(u => u.killCount || 0))
                    : 0;
                  // Compute highest hero level from red units
                  const heroLevel = allUnits && allUnits.length > 0
                    ? Math.max(...allUnits.filter(u => u.faction === 'red' && u.isHero && u.isAlive).map(u => u.level || 1))
                    : 0;
                  const hasHeroes = allUnits?.some(u => u.isHero) ?? false;
                  return [
                    { icon: <Flame className="w-4 h-4 text-red-400" />, label: '最高连杀', value: `${maxKills}`, sub: maxKills >= 3 ? '🔥精英' : '击杀', highlight: maxKills >= 3 },
                    ...(hasHeroes ? [{ icon: <Crown className="w-4 h-4 text-yellow-400" />, label: '英雄等级', value: `${heroLevel}`, sub: heroLevel >= 3 ? '精英' : '成长中', highlight: heroLevel >= 3 }] : []),
                    { icon: <Flag className="w-4 h-4 text-purple-400" />, label: '占领据点', value: `${redCps}`, sub: capturePoints ? `共${capturePoints.length}个` : '无', highlight: redCps > 0 },
                  ].filter((_, i) => i < 3);
                })().map((s: { icon: React.ReactNode; label: string; value: string; sub: string; highlight?: boolean }) => (
                  <div key={s.label} className="bg-white/5 border border-white/10 rounded-xl p-3 text-center">
                    <div className="flex items-center justify-center gap-1.5 mb-1">
                      {s.icon}
                      <span className="text-[10px] text-gray-500">{s.label}</span>
                    </div>
                    <div className={`text-xl sm:text-2xl font-bold ${s.highlight ? 'text-amber-300' : 'text-white'}`}>{s.value}</div>
                    <div className="text-[10px] text-gray-600">{s.sub}</div>
                  </div>
                ))}
              </motion.div>

              {/* ===== SURVIVING UNITS QUICK VIEW ===== */}
              <motion.div
                className="flex items-center justify-center gap-4 text-sm"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.35 }}
              >
                <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2 border border-red-500/20">
                  <div className="w-3 h-3 rounded-full bg-red-500" />
                  <span className="text-red-400 font-bold text-lg">{redAlive}</span>
                  <span className="text-gray-500 text-xs">存活</span>
                  <span className="text-gray-700">|</span>
                  <span className="text-gray-500 text-xs">损失 {redLost}</span>
                </div>
                <span className="text-gray-700 font-bold">VS</span>
                <div className="flex items-center gap-2 bg-white/5 rounded-lg px-3 py-2 border border-blue-500/20">
                  <div className="w-3 h-3 rounded-full bg-blue-500" />
                  <span className="text-blue-400 font-bold text-lg">{blueAlive}</span>
                  <span className="text-gray-500 text-xs">存活</span>
                  <span className="text-gray-700">|</span>
                  <span className="text-gray-500 text-xs">损失 {blueLost}</span>
                </div>
              </motion.div>

              <Separator className="bg-white/10" />

              {/* ===== COMPARISON TABLE ===== */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.4 }}
              >
                <div className="text-xs font-bold text-gray-400 uppercase tracking-wider text-center mb-3">
                  📊 战斗数据对比
                </div>

                {/* Column headers */}
                <div className="grid grid-cols-[60px_1fr_60px] gap-2 items-center mb-2 text-[10px] text-gray-500">
                  <div className="text-right text-red-400 font-bold">红方</div>
                  <div className="text-center">项目</div>
                  <div className="text-left text-blue-400 font-bold">蓝方</div>
                </div>

                <div className="space-y-2.5">
                  {comparisonRows.map((row) => {
                    const redIsHigher = row.red >= row.blue;
                    return (
                      <div key={row.label} className="grid grid-cols-[60px_1fr_60px] gap-2 items-center">
                        <div className={`text-right text-sm font-bold ${redIsHigher ? 'text-red-300' : 'text-red-400/60'}`}>
                          {row.red}
                        </div>
                        <div className="space-y-0.5">
                          <div className="text-center text-[10px] text-gray-500">
                            {row.icon} {row.label}
                          </div>
                          <ComparisonBar redVal={row.red} blueVal={row.blue} />
                        </div>
                        <div className={`text-left text-sm font-bold ${!redIsHigher ? 'text-blue-300' : 'text-blue-400/60'}`}>
                          {row.blue}
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Capture points held */}
                {capturePoints && capturePoints.length > 0 && (
                  <div className="flex items-center justify-center gap-3 pt-3 text-xs">
                    <span className="text-red-400 font-bold">🚩 {redCps}</span>
                    <span className="text-gray-500">据点占领</span>
                    <span className="text-blue-400 font-bold">{blueCps} 🚩</span>
                  </div>
                )}
              </motion.div>

              <Separator className="bg-white/10" />

              {/* ===== MVP AWARDS SECTION ===== */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.45 }}
              >
                <div className="text-xs font-bold text-gray-400 uppercase tracking-wider text-center mb-3">
                  🏅 战斗荣誉
                </div>
                <div className="grid grid-cols-2 gap-2">
                  {mvpAwards.map((award, i) => (
                    <motion.div
                      key={award.title}
                      className={`rounded-lg border p-3 ${award.color} transition-all duration-200 hover:scale-[1.02]`}
                      initial={{ opacity: 0, x: i % 2 === 0 ? -10 : 10 }}
                      animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.5 + i * 0.1 }}
                    >
                      <div className="flex items-center gap-1.5 mb-1">
                        <span className="text-lg">{award.emoji}</span>
                        <span className="text-xs font-bold text-white">{award.title}</span>
                      </div>
                      <div className="text-[10px] text-gray-500 mb-1">{award.description}</div>
                      {award.unitName && (
                        <div className="text-[11px] text-gray-300 font-medium truncate">
                          {award.unitName} <span className={`text-[10px] ${award.factionName === '红方' ? 'text-red-400' : 'text-blue-400'}`}>({award.factionName})</span>
                        </div>
                      )}
                      {!award.unitName && award.factionName && (
                        <div className={`text-[11px] font-bold ${award.factionName === '红方' ? 'text-red-400' : 'text-blue-400'}`}>
                          {award.factionName}
                        </div>
                      )}
                      <div className="text-[10px] text-amber-400 font-bold mt-0.5">{award.value}</div>
                    </motion.div>
                  ))}
                </div>
              </motion.div>

              <Separator className="bg-white/10" />

              {/* ===== EXPANDABLE DETAILED STATS ===== */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.5 }}
              >
                <button
                  className="w-full flex items-center justify-between text-xs py-1.5 px-2 hover:bg-white/5 rounded-lg transition-colors cursor-pointer"
                  onClick={() => setShowDetailedStats(!showDetailedStats)}
                >
                  <span className="text-gray-400 flex items-center gap-1.5">
                    <ScrollText className="w-3.5 h-3.5" />
                    📋 单位详情与详细战报
                  </span>
                  <ChevronDown className={`w-3.5 h-3.5 text-gray-500 transition-transform duration-200 ${showDetailedStats ? 'rotate-180' : ''}`} />
                </button>

                <AnimatePresence>
                  {showDetailedStats && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={{ duration: 0.3 }}
                      className="overflow-hidden"
                    >
                      <div className="pt-3 space-y-4">
                        {/* v69.0: MVP Unit Display */}
                        {(() => {
                          const mvpUnit = unitSummary
                            .filter(u => u.faction === winner && u.killCount > 0)
                            .sort((a, b) => b.killCount - a.killCount)[0];
                          const topDamager = unitSummary
                            .filter(u => u.faction === winner && u.isAlive && (u.totalDamageDealt || 0) > 0)
                            .sort((a, b) => (b.totalDamageDealt || 0) - (a.totalDamageDealt || 0))[0];
                          if (!mvpUnit && !topDamager) return null;
                          return (
                            <div>
                              <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-2">
                                ⭐ 本局之星
                              </div>
                              <div className="flex gap-2">
                                {mvpUnit && (
                                  <div className="flex-1 bg-gradient-to-br from-yellow-500/10 to-amber-500/5 border border-yellow-500/20 rounded-lg px-3 py-2">
                                    <div className="text-[9px] text-yellow-400/70 mb-1">🏆 击杀王</div>
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-yellow-300">{UNIT_ICONS[mvpUnit.type]}</span>
                                      <div>
                                        <div className="text-[11px] text-white font-medium">{mvpUnit.name}</div>
                                        <div className="text-[9px] text-yellow-400">💀 {mvpUnit.killCount} 击杀 · Lv.{mvpUnit.level}</div>
                                      </div>
                                    </div>
                                  </div>
                                )}
                                {topDamager && topDamager.id !== mvpUnit?.id && (
                                  <div className="flex-1 bg-gradient-to-br from-orange-500/10 to-red-500/5 border border-orange-500/20 rounded-lg px-3 py-2">
                                    <div className="text-[9px] text-orange-400/70 mb-1">🔥 伤害王</div>
                                    <div className="flex items-center gap-1.5">
                                      <span className="text-orange-300">{UNIT_ICONS[topDamager.type]}</span>
                                      <div>
                                        <div className="text-[11px] text-white font-medium">{topDamager.name}</div>
                                        <div className="text-[9px] text-orange-400">⚔️ {topDamager.totalDamageDealt || 0} 伤害</div>
                                      </div>
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>
                          );
                        })()}
                        {/* Unit Summary Grid */}
                        <div>
                          <div className="text-[10px] text-gray-500 font-bold uppercase tracking-wider mb-2">
                            👥 单位总览 ({unitSummary.length})
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-1.5 max-h-64 overflow-y-auto pr-1">
                            {unitSummary.map(u => (
                              <div
                                key={u.id}
                                className={`flex items-center gap-1.5 px-2 py-1.5 rounded-lg border text-[10px] transition-colors ${
                                  u.isAlive
                                    ? u.faction === 'red'
                                      ? 'bg-red-500/5 border-red-500/15 hover:bg-red-500/10'
                                      : 'bg-blue-500/5 border-blue-500/15 hover:bg-blue-500/10'
                                    : 'bg-white/3 border-white/5 opacity-50'
                                }`}
                              >
                                <span className={u.faction === 'red' ? 'text-red-400' : 'text-blue-400'}>
                                  {UNIT_ICONS[u.type]}
                                </span>
                                <div className="flex-1 min-w-0">
                                  <div className="text-gray-300 font-medium truncate">{u.name}</div>
                                  <div className="flex items-center gap-1 text-[9px]">
                                    <span className="text-gray-500">Lv.{u.level}</span>
                                    {u.killCount > 0 && <span className="text-red-400">💀{u.killCount}</span>}
                                    <span className={u.isAlive ? 'text-green-500' : 'text-gray-600'}>
                                      {u.isAlive ? `${u.hp}/${u.maxHp}` : '击毁'}
                                    </span>
                                  </div>
                                </div>
                                {/* Alive/Dead indicator dot */}
                                <div className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${u.isAlive ? 'bg-green-500' : 'bg-gray-600'}`} />
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>

              <Separator className="bg-white/10" />

              {/* ===== Career Stats (Achievement System) ===== */}
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.45 }}
              >
                <CareerStatsSummary />
              </motion.div>

              {/* ===== ACTION BUTTONS ===== */}
              <motion.div
                className="space-y-2.5"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6 }}
              >
                {/* Play Again button */}
                <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                  <Button
                    className={`w-full h-11 text-sm font-bold transition-all duration-300 ${
                      isRed
                        ? 'bg-gradient-to-r from-red-700 to-red-600 hover:from-red-600 hover:to-red-500 shadow-lg shadow-red-900/30 hover:shadow-red-800/50'
                        : 'bg-gradient-to-r from-blue-700 to-blue-600 hover:from-blue-600 hover:to-blue-500 shadow-lg shadow-blue-900/30 hover:shadow-blue-800/50'
                    } text-white`}
                    onClick={onRestart}
                  >
                    <RotateCcw className="w-4 h-4 mr-2" />
                    🔄 再来一局
                  </Button>
                </motion.div>

                <div className="grid grid-cols-2 gap-2">
                  {/* Return Home button */}
                  <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                    <Button
                      variant="outline"
                      className="w-full h-9 text-xs font-bold border-white/20 hover:bg-white/10 text-gray-300 hover:text-white"
                      onClick={() => {
                        if (onReturnHome) onReturnHome();
                        else window.dispatchEvent(new CustomEvent('game:returnHome'));
                      }}
                    >
                      <Home className="w-3.5 h-3.5 mr-1.5" />
                      🏠 返回主页
                    </Button>
                  </motion.div>

                  {/* Copy Report button */}
                  <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                    <Button
                      variant="outline"
                      className="w-full h-9 text-xs font-bold border-white/20 hover:bg-white/10 text-gray-300 hover:text-white"
                      onClick={handleCopyReport}
                    >
                      <Copy className="w-3.5 h-3.5 mr-1.5" />
                      {copyToast ? '✅ 已复制!' : '📋 复制战报'}
                    </Button>
                  </motion.div>
                </div>

                {/* Return to strategic mode button (only when launched from strategic) */}
                {isStrategicTacticalBattle && (
                  <motion.div whileHover={{ scale: 1.01 }} whileTap={{ scale: 0.99 }}>
                    <Button
                      className="w-full h-9 text-xs font-bold transition-all duration-300 bg-gradient-to-r from-amber-700 to-amber-600 hover:from-amber-600 hover:to-amber-500 shadow-lg shadow-amber-900/30 hover:shadow-amber-800/50 text-white"
                      onClick={() => useGameStore.getState().returnToStrategic()}
                    >
                      <ArrowLeftRight className="w-3.5 h-3.5 mr-1.5" />
                      返回战略模式
                    </Button>
                  </motion.div>
                )}
              </motion.div>

            </CardContent>
          </Card>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

// ===== Unit Comparison Full Modal =====
function UnitCompareModal({ unitA, unitB, onClose }: { unitA: Unit; unitB: Unit; onClose: () => void }) {
  const map = useGameStore(s => s.map);
  const currentWeather = useGameStore(s => s.currentWeather);
  const allUnits = useGameStore(s => s.units);

  // Terrain info for each unit
  const cellA = map.cells[unitA.position.z]?.[unitA.position.x];
  const cellB = map.cells[unitB.position.z]?.[unitB.position.x];
  const terrainA = cellA ? TERRAIN_CONFIGS[cellA.terrain] : null;
  const terrainB = cellB ? TERRAIN_CONFIGS[cellB.terrain] : null;

  // Predicted damage A→B and B→A
  const damageAB = cellB ? estimateDamage(unitA, unitB, cellB, false, currentWeather, allUnits, cellA?.terrain) : null;
  const damageBA = cellA ? estimateDamage(unitB, unitA, cellA, false, currentWeather, allUnits, cellB?.terrain) : null;
  const avgDamageAB = damageAB ? Math.round((damageAB.min + damageAB.max) / 2) : 0;
  const avgDamageBA = damageBA ? Math.round((damageBA.min + damageBA.max) / 2) : 0;

  // Simulate 1v1 outcome (A attacks first, alternating)
  let simHpA = unitA.stats.hp;
  let simHpB = unitB.stats.hp;
  let simRounds = 0;
  const maxSimRounds = 20;
  for (let i = 0; i < maxSimRounds && simHpA > 0 && simHpB > 0; i++) {
    simHpB = Math.max(0, simHpB - avgDamageAB);
    simRounds++;
    if (simHpB <= 0) break;
    simHpA = Math.max(0, simHpA - avgDamageBA);
    simRounds++;
  }
  const duelWinner = simHpA > 0 && simHpB <= 0 ? 'A' : simHpB > 0 && simHpA <= 0 ? 'B' : 'draw';
  const duelRemaining = duelWinner === 'A' ? simHpA : duelWinner === 'B' ? simHpB : 0;

  // Hero info
  const heroDefA = unitA.isHero && unitA.heroId ? getHeroDefinition(unitA.heroId) : null;
  const heroDefB = unitB.isHero && unitB.heroId ? getHeroDefinition(unitB.heroId) : null;

  const stats = [
    { key: 'HP', icon: <Heart className="w-3 h-3 text-green-400" />, a: unitA.stats.hp, b: unitB.stats.hp, maxA: unitA.stats.maxHp, maxB: unitB.stats.maxHp },
    { key: 'ATK', icon: <Swords className="w-3 h-3 text-orange-400" />, a: unitA.stats.attack, b: unitB.stats.attack },
    { key: 'DEF', icon: <Shield className="w-3 h-3 text-blue-400" />, a: unitA.stats.defense, b: unitB.stats.defense },
    { key: 'MOV', icon: <Footprints className="w-3 h-3 text-purple-400" />, a: unitA.stats.moveRange, b: unitB.stats.moveRange },
    { key: 'RNG', icon: <Target className="w-3 h-3 text-red-400" />, a: getEffectiveAttackRange(unitA), b: getEffectiveAttackRange(unitB) },
    { key: 'VIS', icon: <Eye className="w-3 h-3 text-green-400" />, a: unitA.stats.vision, b: unitB.stats.vision },
    { key: 'Armor', icon: <BrickWall className="w-3 h-3 text-amber-400" />, a: unitA.stats.armor, b: unitB.stats.armor },
    { key: 'AP', icon: <Zap className="w-3 h-3 text-cyan-400" />, a: unitA.stats.armorPenetration, b: unitB.stats.armorPenetration },
  ];

  const renderStatBar = (a: number, b: number, isHP?: { maxA: number; maxB: number }) => {
    const valA = a;
    const valB = b;
    const max = Math.max(valA, valB, 1);
    const pctA = (valA / max) * 100;
    const pctB = (valB / max) * 100;
    return (
      <div className="flex items-center gap-1">
        <span className="w-8 text-right text-xs font-bold text-red-400">
          {isHP ? `${a}/${isHP.maxA}` : a}
        </span>
        <div className="w-20 h-2 bg-gray-800 rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-red-500 transition-all duration-300" style={{ width: `${pctA}%` }} />
        </div>
        <div className="w-20 h-2 bg-gray-800 rounded-full overflow-hidden">
          <div className="h-full rounded-full bg-blue-500 transition-all duration-300" style={{ width: `${pctB}%` }} />
        </div>
        <span className="w-8 text-left text-xs font-bold text-blue-400">
          {isHP ? `${b}/${isHP.maxB}` : b}
        </span>
      </div>
    );
  };

  const renderTerrainInfo = (unit: Unit, terrain: typeof terrainA, cell: typeof cellA, label: string) => {
    if (!terrain || !cell) return null;
    const defBonus = terrain.stats.defenseBonus;
    const atkBonus = terrain.stats.attackBonus;
    const visBonus = terrain.stats.visionBonus;
    const hasBonus = defBonus !== 0 || atkBonus !== 0 || visBonus !== 0;
    const isFortified = cell.fortified;
    return (
      <div className="flex items-center gap-1.5 text-[10px]">
        <span className="text-gray-500 font-medium">{label}:</span>
        <span className="flex items-center gap-0.5">
          {(TERRAIN_ICONS[cell.terrain] as React.ReactNode) || <MapPin className="w-3 h-3" />}
          <span className="text-gray-300">{terrain.name}</span>
        </span>
        {hasBonus && (
          <span className="flex items-center gap-1">
            {defBonus !== 0 && <span className={defBonus > 0 ? 'text-green-400' : 'text-red-400'}>防{defBonus > 0 ? '+' : ''}{defBonus}</span>}
            {atkBonus !== 0 && <span className={atkBonus > 0 ? 'text-green-400' : 'text-red-400'}>攻{atkBonus > 0 ? '+' : ''}{atkBonus}</span>}
            {visBonus > 0 && <span className="text-cyan-400">视+{visBonus}</span>}
          </span>
        )}
        {isFortified && <span className="text-amber-400">🛡工事+20</span>}
      </div>
    );
  };

  const renderHeroAbilities = (unit: Unit, heroDef: typeof heroDefA) => {
    if (!heroDef) return null;
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <span className="text-amber-400">{heroDef.portraitIcon}</span>
          <span className="text-xs font-bold text-amber-300">{heroDef.name}</span>
          <span className="text-[9px] text-gray-500">{heroDef.title}</span>
        </div>
        <div className="space-y-0.5">
          {unit.abilities.map(ability => (
            <div key={ability.id} className="flex items-center gap-1.5 text-[10px]">
              <span>{ability.icon}</span>
              <span className={ability.type === 'active' ? 'text-cyan-400' : 'text-gray-400'}>{ability.name}</span>
              {ability.currentCooldown > 0 && (
                <span className="text-gray-600">CD:{ability.currentCooldown}</span>
              )}
              <span className="text-gray-600">{ability.description}</span>
            </div>
          ))}
        </div>
      </div>
    );
  };

  return (
    <motion.div
      className="absolute inset-0 z-[57] flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ scale: 0.9, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.9, opacity: 0 }}
        transition={{ duration: 0.3, ease: [0.25, 0.46, 0.45, 0.94] }}
      >
        <Card className="relative bg-gray-900/95 backdrop-blur-md border border-white/10 text-white shadow-2xl max-w-lg w-full mx-4">
          <CardHeader className="pb-2 pt-4 px-6">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <GitCompareArrows className="w-5 h-5 text-amber-400" />
                <CardTitle className="text-base">单位对比</CardTitle>
                <kbd className="px-1 py-0 rounded bg-white/10 border border-white/20 text-amber-300 font-mono text-[10px]">C</kbd>
              </div>
              <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-white" onClick={onClose}>
                <X className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent className="px-6 pb-4">
            {/* Header: Unit A vs Unit B with faction color badges */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <span className={unitA.faction === 'red' ? 'text-red-400' : 'text-blue-400'}>
                  {UNIT_ICONS[unitA.type]}
                </span>
                <div>
                  <div className="text-sm font-bold flex items-center gap-1.5">
                    {unitA.name}
                    <Badge className={`text-[9px] px-1 py-0 h-4 ${unitA.faction === 'red' ? 'bg-red-600/60 text-red-200 border border-red-500/40' : 'bg-blue-600/60 text-blue-200 border border-blue-500/40'}`}>
                      {unitA.faction === 'red' ? '红方' : '蓝方'}
                    </Badge>
                    {unitA.isHero && <span className="text-amber-400 text-xs">HERO</span>}
                  </div>
                  <div className="text-[10px] text-gray-400">
                    Lv.{unitA.level} · {UNIT_CONFIGS[unitA.type]?.name ?? unitA.type}
                  </div>
                </div>
              </div>
              <span className="text-gray-600 text-xs font-bold">VS</span>
              <div className="flex items-center gap-2">
                <div className="text-right">
                  <div className="text-sm font-bold flex items-center gap-1.5 justify-end">
                    {unitB.isHero && <span className="text-amber-400 text-xs">HERO</span>}
                    {unitB.name}
                    <Badge className={`text-[9px] px-1 py-0 h-4 ${unitB.faction === 'red' ? 'bg-red-600/60 text-red-200 border border-red-500/40' : 'bg-blue-600/60 text-blue-200 border border-blue-500/40'}`}>
                      {unitB.faction === 'red' ? '红方' : '蓝方'}
                    </Badge>
                  </div>
                  <div className="text-[10px] text-gray-400">
                    Lv.{unitB.level} · {UNIT_CONFIGS[unitB.type]?.name ?? unitB.type}
                  </div>
                </div>
                <span className={unitB.faction === 'red' ? 'text-red-400' : 'text-blue-400'}>
                  {UNIT_ICONS[unitB.type]}
                </span>
              </div>
            </div>

            {/* Column headers: Attacker (red) vs Defender (blue) */}
            <div className="flex items-center justify-center gap-1 text-[10px] mb-2">
              <span className="w-20 text-right text-red-400 font-bold">{unitA.name}</span>
              <span className="w-4" />
              <span className="w-4" />
              <span className="w-20 text-left text-blue-400 font-bold">{unitB.name}</span>
            </div>

            {/* Stats comparison bars (red for A/left, blue for B/right) */}
            <div className="space-y-1.5">
              {stats.map(s => (
                <div key={s.key} className="flex items-center gap-1">
                  <div className="w-6 flex items-center justify-center">{s.icon}</div>
                  <span className="w-5 text-[9px] text-gray-500 text-center">{s.key}</span>
                  {s.key === 'HP' ? renderStatBar(s.a, s.b, { maxA: s.maxA!, maxB: s.maxB! }) : renderStatBar(s.a, s.b)}
                </div>
              ))}
            </div>

            {/* Terrain bonuses */}
            <div className="mt-3 pt-3 border-t border-white/10 space-y-1">
              <div className="text-[10px] text-gray-500 font-medium mb-1">地形加成</div>
              {renderTerrainInfo(unitA, terrainA, cellA, unitA.name)}
              {renderTerrainInfo(unitB, terrainB, cellB, unitB.name)}
            </div>

            {/* Predicted damage outcome */}
            <div className="mt-3 pt-3 border-t border-white/10">
              <div className="text-[10px] text-gray-500 font-medium mb-1.5">预测伤害</div>
              <div className="flex items-center justify-between text-[11px]">
                <div className="flex items-center gap-1">
                  <Swords className="w-3 h-3 text-red-400" />
                  <span className="text-red-400">{unitA.name}</span>
                  <span className="text-gray-500">→</span>
                  <span className="text-blue-400">{unitB.name}</span>
                  <span className="text-white font-bold">{damageAB ? `${damageAB.min}-${damageAB.max}` : '—'}</span>
                  {damageAB && <span className="text-gray-600 text-[9px]">(减伤{damageAB.reduction}%)</span>}
                </div>
              </div>
              <div className="flex items-center justify-between text-[11px] mt-1">
                <div className="flex items-center gap-1">
                  <Swords className="w-3 h-3 text-blue-400" />
                  <span className="text-blue-400">{unitB.name}</span>
                  <span className="text-gray-500">→</span>
                  <span className="text-red-400">{unitA.name}</span>
                  <span className="text-white font-bold">{damageBA ? `${damageBA.min}-${damageBA.max}` : '—'}</span>
                  {damageBA && <span className="text-gray-600 text-[9px]">(减伤{damageBA.reduction}%)</span>}
                </div>
              </div>

              {/* 1v1 duel prediction */}
              <div className={`mt-2 px-3 py-2 rounded-lg border ${
                duelWinner === 'A' ? 'bg-red-900/20 border-red-500/30' :
                duelWinner === 'B' ? 'bg-blue-900/20 border-blue-500/30' :
                'bg-gray-800/30 border-gray-600/30'
              }`}>
                <div className="flex items-center justify-between">
                  <span className="text-[10px] text-gray-400">1v1 预测 ({simRounds}回合)</span>
                  <span className={`text-xs font-bold ${
                    duelWinner === 'A' ? 'text-red-400' :
                    duelWinner === 'B' ? 'text-blue-400' :
                    'text-gray-400'
                  }`}>
                    {duelWinner === 'A' ? `${unitA.name} 胜出` :
                     duelWinner === 'B' ? `${unitB.name} 胜出` :
                     '势均力敌'}
                    {duelWinner !== 'draw' && <span className="text-gray-500 ml-1 font-normal">(剩{duelRemaining}HP)</span>}
                  </span>
                </div>
              </div>
            </div>

            {/* Hero abilities display */}
            {(heroDefA || heroDefB) && (
              <div className="mt-3 pt-3 border-t border-white/10 space-y-2">
                <div className="text-[10px] text-gray-500 font-medium">英雄技能</div>
                {heroDefA && (
                  <div className={`px-2 py-1.5 rounded ${unitA.faction === 'red' ? 'bg-red-900/20 border border-red-500/20' : 'bg-blue-900/20 border border-blue-500/20'}`}>
                    {renderHeroAbilities(unitA, heroDefA)}
                  </div>
                )}
                {heroDefB && (
                  <div className={`px-2 py-1.5 rounded ${unitB.faction === 'red' ? 'bg-red-900/20 border border-red-500/20' : 'bg-blue-900/20 border border-blue-500/20'}`}>
                    {renderHeroAbilities(unitB, heroDefB)}
                  </div>
                )}
              </div>
            )}

            {/* Ability descriptions */}
            <div className="mt-3 pt-3 border-t border-white/10 space-y-1">
              <div className="text-[10px] text-gray-500">
                <span className={unitA.faction === 'red' ? 'text-red-400' : 'text-blue-400'}>{unitA.name}</span>: {ABILITY_DESCRIPTIONS[unitA.type] || '无特殊能力'}
              </div>
              <div className="text-[10px] text-gray-500">
                <span className={unitB.faction === 'red' ? 'text-red-400' : 'text-blue-400'}>{unitB.name}</span>: {ABILITY_DESCRIPTIONS[unitB.type] || '无特殊能力'}
              </div>
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </motion.div>
  );
}

// ===== Achievement Unlock Toast =====
function AchievementUnlockToast({ achievement, onDismiss, delay = 0 }: {
  achievement: Achievement;
  onDismiss: () => void;
  delay?: number;
}) {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    const showTimer = setTimeout(() => setIsVisible(true), delay);
    const hideTimer = setTimeout(() => {
      setIsVisible(false);
      setTimeout(onDismiss, 500);
    }, delay + 4000);
    return () => {
      clearTimeout(showTimer);
      clearTimeout(hideTimer);
    };
  }, [delay, onDismiss]);

  return (
    <motion.div
      className="pointer-events-auto min-w-[260px] max-w-[300px]"
      initial={{ x: 300, opacity: 0, scale: 0.9 }}
      animate={isVisible ? { x: 0, opacity: 1, scale: 1 } : { x: 300, opacity: 0, scale: 0.9 }}
      transition={{ duration: 0.5, ease: [0.25, 0.46, 0.45, 0.94] }}
    >
      <div
        className="rounded-xl px-4 py-3 shadow-2xl relative overflow-hidden"
        style={{
          background: 'linear-gradient(135deg, rgba(120,90,10,0.95) 0%, rgba(40,30,5,0.98) 100%)',
          border: '2px solid rgba(234,179,8,0.6)',
        }}
      >
        {/* Golden shimmer */}
        <motion.div
          className="absolute inset-0 pointer-events-none"
          animate={{
            background: [
              'linear-gradient(90deg, transparent 0%, rgba(234,179,8,0.15) 50%, transparent 100%)',
              'linear-gradient(90deg, transparent 30%, rgba(234,179,8,0.25) 70%, transparent 100%)',
              'linear-gradient(90deg, transparent 0%, rgba(234,179,8,0.15) 50%, transparent 100%)',
            ],
          }}
          transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
        />
        <div className="relative z-10 flex items-center gap-3">
          <div className="text-3xl flex-shrink-0">{achievement.icon}</div>
          <div className="flex-1 min-w-0">
            <div className="text-[10px] text-yellow-500/70 font-bold uppercase tracking-wider">成就解锁!</div>
            <div className="text-sm font-bold text-yellow-300 truncate">{achievement.name}</div>
            <div className="text-[10px] text-gray-300 truncate">{achievement.description}</div>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

// ===== Achievement Browser Modal =====
function AchievementBrowserModal({ stats, onClose, onReset }: { stats: PlayerStats; onClose: () => void; onReset: () => void }) {
  const [activeCategory, setActiveCategory] = useState<AchievementCategory | 'all'>('all');

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.achievement-browser-panel')) return;
      onClose();
    };
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose]);

  const unlockedIds = new Set(stats.achievements);

  const filteredAchievements = activeCategory === 'all'
    ? ACHIEVEMENTS
    : ACHIEVEMENTS.filter(a => a.category === activeCategory);

  const unlockedCount = unlockedIds.size;
  const totalCount = ACHIEVEMENTS.length;

  const categories: (AchievementCategory | 'all')[] = ['all', 'combat', 'strategy', 'special', 'streak'];

  return (
    <motion.div
      className="absolute inset-0 z-[75] flex items-center justify-center"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
    >
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <Card className="achievement-browser-panel relative bg-black/95 backdrop-blur-md border-amber-500/30 text-white shadow-2xl max-w-2xl w-full mx-4 max-h-[85vh] flex flex-col">
        <CardHeader className="pb-2 pt-4 px-6 flex-shrink-0">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="w-5 h-5 text-amber-400" />
              <CardTitle className="text-base">📊 成绩与成就</CardTitle>
              <Badge variant="outline" className="text-amber-400 border-amber-500/40 text-[10px]">
                {unlockedCount}/{totalCount}
              </Badge>
            </div>
            <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-white" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent className="px-6 pb-4 flex flex-col gap-4 overflow-hidden flex-1">
          {/* ===== Summary Stats ===== */}
          <div className="grid grid-cols-5 gap-2 bg-white/5 rounded-lg p-3 border border-white/10">
            <div className="text-center">
              <div className="text-lg font-bold text-white">{stats.totalGames}</div>
              <div className="text-[10px] text-gray-500">总局数</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-green-400">{stats.totalWins}</div>
              <div className="text-[10px] text-gray-500">胜利</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-red-400">{stats.totalLosses}</div>
              <div className="text-[10px] text-gray-500">失败</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-amber-400">{stats.totalGames > 0 ? Math.round((stats.totalWins / stats.totalGames) * 100) : 0}%</div>
              <div className="text-[10px] text-gray-500">胜率</div>
            </div>
            <div className="text-center">
              <div className="text-lg font-bold text-orange-400">{stats.totalKills}</div>
              <div className="text-[10px] text-gray-500">总击杀</div>
            </div>
          </div>

          {/* Extra stats row */}
          <div className="flex items-center gap-3 text-[10px] text-gray-400 flex-wrap">
            <span>🏆 最长连胜: <span className="text-amber-400 font-bold">{stats.winStreak}</span></span>
            <span className="text-gray-600">|</span>
            <span>⚡ 最快胜利: <span className="text-green-400 font-bold">{stats.fastestWin > 0 ? `${stats.fastestWin}回合` : '---'}</span></span>
            <span className="text-gray-600">|</span>
            <span>🛡️ 完美胜利: <span className="text-yellow-400 font-bold">{stats.perfectGames}</span></span>
            <span className="text-gray-600">|</span>
            <span>🔥 最长对局: <span className="text-purple-400 font-bold">{stats.longestGame}回合</span></span>
          </div>

          <Separator className="bg-white/10" />

          {/* ===== Category Tabs ===== */}
          <div className="flex items-center gap-1 flex-shrink-0">
            {categories.map(cat => {
              const isActive = activeCategory === cat;
              const catInfo = cat === 'all' ? { label: '全部', icon: '📋' } : CATEGORY_LABELS[cat];
              const catCount = cat === 'all'
                ? totalCount
                : ACHIEVEMENTS.filter(a => a.category === cat).length;
              const catUnlocked = cat === 'all'
                ? unlockedCount
                : ACHIEVEMENTS.filter(a => a.category === cat && unlockedIds.has(a.id)).length;
              return (
                <button
                  key={cat}
                  className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all duration-200 cursor-pointer ${
                    isActive
                      ? 'bg-amber-600 text-white shadow-lg shadow-amber-900/30'
                      : 'bg-white/5 text-gray-400 hover:bg-white/10 hover:text-white'
                  }`}
                  onClick={() => setActiveCategory(cat)}
                >
                  {catInfo.icon} {catInfo.label}
                  <span className={`ml-1 text-[10px] ${isActive ? 'text-amber-200' : 'text-gray-600'}`}>
                    {catUnlocked}/{catCount}
                  </span>
                </button>
              );
            })}
          </div>

          {/* ===== Achievement Grid ===== */}
          <ScrollArea className="flex-1 -mx-6 px-6">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pb-4">
              {filteredAchievements.map(ach => {
                const isUnlocked = unlockedIds.has(ach.id);
                const progress = getAchievementProgress(stats, ach);
                const isHidden = ach.hidden && !isUnlocked;
                return (
                  <motion.div
                    key={ach.id}
                    className={`rounded-lg border p-3 transition-all duration-200 ${
                      isUnlocked
                        ? 'bg-amber-500/10 border-amber-500/30 hover:bg-amber-500/15'
                        : 'bg-white/3 border-white/8 hover:bg-white/5'
                    }`}
                    initial={{ opacity: 0, y: 5 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.15 }}
                  >
                    <div className="flex items-start gap-2.5">
                      <div className={`text-2xl flex-shrink-0 ${isUnlocked ? '' : isHidden ? 'grayscale opacity-30' : 'opacity-40'}`}>
                        {isHidden ? '❓' : ach.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className={`text-xs font-bold truncate ${isUnlocked ? 'text-yellow-300' : isHidden ? 'text-gray-600' : 'text-gray-400'}`}>
                          {isHidden ? '???' : ach.name}
                        </div>
                        <div className={`text-[10px] mt-0.5 ${isHidden ? 'text-gray-700' : 'text-gray-500'}`}>
                          {isHidden ? '隐藏成就 — 达成条件未知' : ach.description}
                        </div>
                        {!isUnlocked && !isHidden && progress > 0 && (
                          <div className="mt-1.5">
                            <div className="w-full h-1 bg-white/10 rounded-full overflow-hidden">
                              <motion.div
                                className="h-full bg-amber-500/60 rounded-full"
                                initial={{ width: 0 }}
                                animate={{ width: `${Math.round(progress * 100)}%` }}
                                transition={{ duration: 0.5, ease: 'easeOut' }}
                              />
                            </div>
                            <div className="text-[9px] text-gray-600 mt-0.5">
                              {Math.round(progress * 100)}%
                            </div>
                          </div>
                        )}
                        {isUnlocked && ach.reward && (
                          <div className="text-[9px] text-amber-500/60 mt-0.5 italic">
                            ✨ {ach.reward}
                          </div>
                        )}
                      </div>
                      {isUnlocked && (
                        <div className="text-green-400 text-xs flex-shrink-0">✅</div>
                      )}
                    </div>
                  </motion.div>
                );
              })}
            </div>
          </ScrollArea>

          {/* ===== Reset Stats Button ===== */}
          <div className="flex items-center justify-between pt-2 border-t border-white/10 flex-shrink-0">
            <div className="text-[9px] text-gray-600">
              {stats.lastUpdated > 0
                ? `上次更新: ${new Date(stats.lastUpdated).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}`
                : '暂无数据'}
            </div>
            <Button
              size="sm"
              variant="ghost"
              className="h-6 px-2 text-red-400/60 hover:text-red-400 hover:bg-red-900/20 text-[10px]"
              onClick={() => {
                if (window.confirm('确定要重置所有成绩和成就数据吗？此操作不可撤销。')) {
                  resetAllStats();
                  onReset();
                }
              }}
            >
              <Trash2 className="w-3 h-3 mr-1" />
              重置数据
            </Button>
          </div>
        </CardContent>
      </Card>
    </motion.div>
  );
}

// ===== Terrain Effects Panel (cursor-following tooltip) =====
const TerrainEffectsPanel = React.memo(function TerrainEffectsPanel({
  hoveredCell,
  movementAnimation,
  mousePos,
  mapCells,
  capturePoints,
  currentFaction,
  currentWeather,
  units,
  phase,
  selectedUnit,
  movablePositions,
}: {
  hoveredCell: { x: number; z: number } | null;
  movementAnimation: any;
  mousePos: { x: number; y: number };
  mapCells: any[][];
  capturePoints: any[];
  currentFaction: string;
  currentWeather?: WeatherType;
  units: Unit[];
  phase?: string;
  selectedUnit?: Unit | null;
  movablePositions?: Position[];
}) {
  if (!hoveredCell || movementAnimation) return null;
  if (phase === 'attackUnit') return null;
  const cell = mapCells[hoveredCell.z]?.[hoveredCell.x];
  if (!cell) return null;
  const terrainCfg = TERRAIN_CONFIGS[cell.terrain];
  if (!terrainCfg) return null;

  const hoveredUnit = cell.unit && cell.unit.isAlive ? cell.unit : null;
  const terrainStats = terrainCfg.stats;
  const isImpassable = !terrainStats.isPassable;
  const isVehicleOnlyTerrain = terrainStats.isPassable && !terrainStats.isPassableByVehicle;
  const hasVisionBlock = terrainStats.visionBlock > 0;
  const cpForCell = cell.capturePointId ? capturePoints.find((cp: any) => cp.id === cell.capturePointId) : null;

  // Danger zone: count enemy units that can attack this cell
  const threateningUnits = useMemo(() => {
    if (!units || !hoveredCell) return 0;
    const enemyFaction = currentFaction === 'red' ? 'blue' : 'red';
    return units.filter(u => {
      if (!u.isAlive || u.faction !== enemyFaction) return false;
      const range = getEffectiveAttackRange(u);
      const dx = Math.abs(u.position.x - hoveredCell.x);
      const dz = Math.abs(u.position.z - hoveredCell.z);
      return dx + dz <= range;
    }).length;
  }, [units, hoveredCell, currentFaction]);

  // Weather configuration
  const weatherConf = currentWeather ? WEATHER_CONFIGS[currentWeather] : null;
  const isWeatherActive = weatherConf && currentWeather !== 'clear';
  const effectiveMoveCost = isWeatherActive
    ? Math.round(terrainStats.moveCost * weatherConf.movementModifier * 10) / 10
    : terrainStats.moveCost;

  // Defense level indicator (green=high defense, red=low/no defense)
  const defenseLevel = terrainStats.defenseBonus;
  const defenseDotColor = defenseLevel >= 15 ? '#22c55e' : defenseLevel >= 5 ? '#84cc16' : defenseLevel > 0 ? '#eab308' : defenseLevel === 0 ? '#6b7280' : '#ef4444';

  // Determine position - clamp to viewport
  const panelWidth = 220;
  const panelHeight = 460;
  const viewW = typeof window !== 'undefined' ? window.innerWidth : 1200;
  const viewH = typeof window !== 'undefined' ? window.innerHeight : 800;
  let posX = mousePos.x + 18;
  let posY = mousePos.y - 10;
  if (posX + panelWidth > viewW - 10) posX = mousePos.x - panelWidth - 10;
  if (posY + panelHeight > viewH - 10) posY = viewH - panelHeight - 10;
  if (posY < 10) posY = 10;

  return (
    <AnimatePresence>
      <motion.div
        className="fixed pointer-events-none z-50"
        style={{ left: posX, top: posY }}
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 4 }}
        transition={{ duration: 0.15, ease: 'easeOut' }}
      >
        <div className="bg-gray-800/95 backdrop-blur-sm rounded-lg border border-white/10 text-white shadow-xl shadow-black/40 min-w-[185px] max-w-[220px]">
          {/* Header: terrain name + icon + color swatch */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-white/10">
            <div className="w-5 h-5 rounded flex-shrink-0" style={{ backgroundColor: terrainStats.color }} />
            <div className="flex items-center gap-1.5 flex-1 min-w-0">
              <span className="text-xs font-bold text-white truncate">{terrainCfg.name}</span>
              {TERRAIN_ICONS[cell.terrain]}
            </div>
            {isImpassable && <span className="text-[10px] text-red-400 font-medium flex-shrink-0">⛔ 不可通行</span>}
            {isVehicleOnlyTerrain && (
              <span className="text-[10px] text-yellow-400 font-medium flex-shrink-0">🚫 仅步兵</span>
            )}
          </div>

          {/* Terrain stats */}
          <div className="px-3 py-2 space-y-1">
            {/* Movement cost with modifier display */}
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-gray-400 flex items-center gap-1">
                <Footprints className="w-3 h-3" /> 移动消耗
              </span>
              <span className={terrainStats.moveCost > 1 ? 'text-yellow-400 font-medium' : 'text-white'}>
                {isImpassable ? '∞ 无法通行' : (
                  isWeatherActive && terrainStats.moveCost > 0 ? (
                    <span>
                      <span className={effectiveMoveCost !== terrainStats.moveCost ? 'line-through text-gray-500 text-[9px] mr-1' : ''}>{terrainStats.moveCost}</span>
                      <span>×{weatherConf.movementModifier} = </span>
                      <span className={effectiveMoveCost > terrainStats.moveCost ? 'text-orange-400' : effectiveMoveCost < terrainStats.moveCost ? 'text-green-400' : ''}>{effectiveMoveCost}</span>
                    </span>
                  ) : (
                    <span>×{terrainStats.moveCost === 1 ? '1.0' : terrainStats.moveCost}</span>
                  )
                )}
              </span>
            </div>
            {/* Attack bonus */}
            {terrainStats.attackBonus !== 0 && (
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-gray-400 flex items-center gap-1">
                  <Swords className="w-3 h-3" /> 攻击加成
                </span>
                <span className={terrainStats.attackBonus > 0 ? 'text-green-400 font-medium' : 'text-red-400 font-medium'}>
                  {terrainStats.attackBonus > 0 ? '+' : ''}{terrainStats.attackBonus}
                </span>
              </div>
            )}
            {/* Defense bonus with colored dot indicator */}
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-gray-400 flex items-center gap-1.5">
                <span className="relative flex h-3 w-3">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-40" style={{ backgroundColor: defenseDotColor }} />
                  <span className="relative inline-flex h-3 w-3 rounded-full" style={{ backgroundColor: defenseDotColor }} />
                </span>
                <Shield className="w-3 h-3" /> 防御加成
              </span>
              <span className={terrainStats.defenseBonus > 0 ? 'text-green-400 font-medium' : terrainStats.defenseBonus < 0 ? 'text-red-400 font-medium' : 'text-gray-500'}>
                {terrainStats.defenseBonus > 0 ? '+' : ''}{terrainStats.defenseBonus}
                <span className="text-[9px] ml-1 opacity-60">{defenseLevel >= 15 ? '极佳' : defenseLevel >= 5 ? '良好' : defenseLevel > 0 ? '一般' : defenseLevel === 0 ? '无' : '危险'}</span>
              </span>
            </div>
            {/* Vision bonus */}
            <div className="flex items-center justify-between text-[11px]">
              <span className="text-gray-400 flex items-center gap-1">
                <Eye className="w-3 h-3" /> 视野加成
              </span>
              <span className={terrainStats.visionBonus > 0 ? 'text-green-400 font-medium' : terrainStats.visionBonus < 0 ? 'text-red-400 font-medium' : 'text-gray-500'}>
                {terrainStats.visionBonus > 0 ? '+' : ''}{terrainStats.visionBonus}
              </span>
            </div>
            {/* Vision block */}
            {hasVisionBlock && (
              <div className="flex items-center justify-between text-[11px]">
                <span className="text-gray-400 flex items-center gap-1">
                  <Eye className="w-3 h-3 opacity-60" /> 视野阻挡
                </span>
                <span className="text-orange-400 font-medium">
                  {terrainStats.visionBlock >= 99 ? '完全' : terrainStats.visionBlock}
                </span>
              </div>
            )}
          </div>

          {/* Danger zone indicator */}
          {threateningUnits > 0 && (
            <div className="px-3 py-1.5 border-t border-white/10">
              <div className="flex items-center gap-1.5 text-[11px] text-red-400">
                <AlertTriangle className="w-3.5 h-3.5" />
                <span className="font-medium">⚠ 危险区域</span>
                <span className="ml-auto text-[10px] text-red-300 bg-red-500/20 px-1.5 py-0 rounded">
                  {threateningUnits} 威胁单位
                </span>
              </div>
            </div>
          )}

          {/* Weather effect on terrain */}
          {isWeatherActive && (
            <div className="px-3 py-1.5 border-t border-white/10">
              <div className="flex items-center gap-1.5 text-[11px] mb-1">
                <span>{weatherConf.icon}</span>
                <span className="text-blue-300 font-medium">{weatherConf.name}</span>
                <span className="text-gray-500 text-[9px]">天气效果</span>
              </div>
              <div className="text-[10px] text-blue-200 bg-blue-500/10 px-1.5 py-0.5 rounded">
                {weatherConf.icon} {weatherConf.name} 移动力×{weatherConf.movementModifier}{weatherConf.attackModifier !== 1 ? ` | 攻击力×${weatherConf.attackModifier}` : ''}
              </div>
              <div className="space-y-0.5 text-[10px] mt-1">
                {weatherConf.movementModifier !== 1 && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">移动修正</span>
                    <span className={weatherConf.movementModifier > 1 ? 'text-orange-400' : 'text-green-400'}>×{weatherConf.movementModifier}</span>
                  </div>
                )}
                {weatherConf.attackModifier !== 1 && (
                  <div className="flex items-center justify-between">
                    <span className="text-gray-400">攻击修正</span>
                    <span className={weatherConf.attackModifier > 1 ? 'text-green-400' : 'text-red-400'}>×{weatherConf.attackModifier}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Special effects */}
          {(cell.fortified || cell.hasMinefield || cpForCell) && (
            <div className="px-3 py-1.5 border-t border-white/10 space-y-1">
              {cell.fortified && (
                <div className="flex items-center gap-1 text-[11px] text-amber-400">
                  <BrickWall className="w-3 h-3" />
                  <span>工事防御 +20</span>
                </div>
              )}
              {cell.hasMinefield && (
                <div className="flex items-center gap-1 text-[11px] text-red-400">
                  💣
                  <span>雷区 ({cell.minefieldOwner === 'red' ? '红方' : '蓝方'}埋设)</span>
                </div>
              )}
              {cpForCell && (
                <div className="space-y-1">
                  <div className="flex items-center gap-1 text-[11px]">
                    <span className="text-cyan-400">📡</span>
                    <span className="text-gray-300">据点 {cpForCell.type}</span>
                    {cpForCell.owner ? (
                      <span className={cpForCell.owner === 'red' ? 'text-red-400' : 'text-blue-400'}>
                        ({cpForCell.owner === 'red' ? '红方' : '蓝方'}控制)
                      </span>
                    ) : (
                      <span className="text-gray-500">(中立)</span>
                    )}
                  </div>
                  {cpForCell.captureProgress && (
                    <div className="flex items-center gap-2 text-[10px] pl-4">
                      <div className="flex items-center gap-1 flex-1">
                        <span className="text-red-400 text-[9px] w-3">红</span>
                        <div className="flex-1 h-1 bg-gray-700 rounded-full overflow-hidden">
                          <div className="h-full bg-red-500 rounded-full" style={{ width: `${(cpForCell.captureProgress.red || 0) * 100}%` }} />
                        </div>
                        <span className="text-gray-500 w-6 text-right">{Math.round((cpForCell.captureProgress.red || 0) * 100)}%</span>
                      </div>
                      <div className="flex items-center gap-1 flex-1">
                        <span className="text-blue-400 text-[9px] w-3">蓝</span>
                        <div className="flex-1 h-1 bg-gray-700 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${(cpForCell.captureProgress.blue || 0) * 100}%` }} />
                        </div>
                        <span className="text-gray-500 w-6 text-right">{Math.round((cpForCell.captureProgress.blue || 0) * 100)}%</span>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {hoveredUnit && (
            <div className="px-3 py-2 border-t border-white/10 space-y-1.5">
              <div className="flex items-center gap-2">
                <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${hoveredUnit.faction === 'red' ? 'bg-red-500/20' : 'bg-blue-500/20'}`}>
                  <span className={hoveredUnit.faction === 'red' ? 'text-red-400' : 'text-blue-400'}>
                    {UNIT_ICONS[hoveredUnit.type] || <Shield className="w-4 h-4" />}
                  </span>
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-bold text-white truncate">{hoveredUnit.name || UNIT_CONFIGS[hoveredUnit.type as keyof typeof UNIT_CONFIGS]?.name || hoveredUnit.type}</span>
                    {hoveredUnit.level > 1 && <span className="text-[9px] text-purple-400 bg-purple-500/10 px-1 rounded">Lv.{hoveredUnit.level}</span>}
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-[9px] text-gray-500">{hoveredUnit.faction === 'red' ? '红方' : '蓝方'} · {hoveredUnit.type}</span>
                    {hoveredUnit.level > 1 && getVeterancyTitle(hoveredUnit) && (
                      <span className={`text-[8px] px-1 rounded font-medium ${
                        hoveredUnit.killCount >= 5 ? 'bg-gradient-to-r from-yellow-500/30 to-red-500/30 text-amber-200' :
                        hoveredUnit.killCount >= 3 ? 'bg-purple-500/20 text-purple-300' :
                        'bg-green-500/20 text-green-300'
                      }`}>{getVeterancyTitle(hoveredUnit)}</span>
                    )}
                  </div>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-[9px] mb-0.5">
                  <span className="text-gray-400">HP</span>
                  <span className={(hoveredUnit.stats.hp / hoveredUnit.stats.maxHp) > 0.7 ? 'text-green-400' : (hoveredUnit.stats.hp / hoveredUnit.stats.maxHp) > 0.3 ? 'text-yellow-400' : 'text-red-400'}>
                    {hoveredUnit.stats.hp}/{hoveredUnit.stats.maxHp}
                  </span>
                </div>
                <div className="h-1.5 bg-white/10 rounded-full overflow-hidden">
                  <div
                    className={`h-full rounded-full transition-all duration-300 ${
                      (hoveredUnit.stats.hp / hoveredUnit.stats.maxHp) > 0.7 ? 'bg-green-500' : (hoveredUnit.stats.hp / hoveredUnit.stats.maxHp) > 0.3 ? 'bg-yellow-500' : 'bg-red-500'
                    }`}
                    style={{ width: `${(hoveredUnit.stats.hp / hoveredUnit.stats.maxHp) * 100}%` }}
                  />
                </div>
              </div>
              <div className="grid grid-cols-3 gap-1 text-center">
                {[
                  { label: '攻击', value: hoveredUnit.stats.attack, color: 'text-orange-400' },
                  { label: '防御', value: hoveredUnit.stats.defense, color: 'text-blue-400' },
                  { label: '移动', value: hoveredUnit.stats.moveRange, color: 'text-green-400' },
                  { label: '射程', value: getEffectiveAttackRange(hoveredUnit), color: 'text-red-400', bonus: getEffectiveAttackRange(hoveredUnit) !== hoveredUnit.stats.attackRange ? `+${getEffectiveAttackRange(hoveredUnit) - hoveredUnit.stats.attackRange}` : undefined },
                  { label: '视野', value: hoveredUnit.stats.vision ?? UNIT_CONFIGS[hoveredUnit.type as keyof typeof UNIT_CONFIGS]?.stats.vision ?? 3, color: 'text-cyan-400' },
                  { label: '士气', value: hoveredUnit.stats.morale ?? 100, color: (hoveredUnit.stats.morale ?? 100) > 70 ? 'text-green-400' : (hoveredUnit.stats.morale ?? 100) > 40 ? 'text-yellow-400' : 'text-red-400' },
                ].map(stat => (
                  <div key={stat.label} className="bg-white/5 rounded px-1 py-0.5">
                    <div className="text-[8px] text-gray-500">{stat.label}</div>
                    <div className={`text-[10px] font-bold ${stat.color}`}>
                      {stat.value}
                      {stat.bonus && <span className="text-[8px] text-green-400 ml-0.5">({stat.bonus})</span>}
                    </div>
                  </div>
                ))}
              </div>
              <div className="flex items-center gap-1 flex-wrap">
                {hoveredUnit.canMove && <Badge className="text-[7px] h-3 px-1 bg-green-500/20 text-green-400 border-green-500/30">可移动</Badge>}
                {hoveredUnit.canAttack && <Badge className="text-[7px] h-3 px-1 bg-orange-500/20 text-orange-400 border-orange-500/30">可攻击</Badge>}
                {!hoveredUnit.canMove && hoveredUnit.canAttack && <Badge className="text-[7px] h-3 px-1 bg-blue-500/20 text-blue-400 border-blue-500/30">已移动</Badge>}
                {!hoveredUnit.canMove && !hoveredUnit.canAttack && <Badge className="text-[7px] h-3 px-1 bg-gray-500/20 text-gray-400 border-gray-500/30">已行动</Badge>}
                {hoveredUnit.isStealthed && <Badge className="text-[7px] h-3 px-1 bg-purple-500/20 text-purple-400 border-purple-500/30">隐蔽</Badge>}
                {mapCells[hoveredUnit.position.z]?.[hoveredUnit.position.x]?.fortified && <Badge className="text-[7px] h-3 px-1 bg-amber-500/20 text-amber-400 border-amber-500/30">工事</Badge>}
                {hoveredUnit.stats.ammo !== undefined && hoveredUnit.stats.ammo !== null && hoveredUnit.stats.maxAmmo !== undefined && hoveredUnit.stats.maxAmmo > 0 && (
                  <Badge className={`text-[7px] h-3 px-1 border ${
                    hoveredUnit.stats.ammo === 0 ? 'bg-red-500/20 text-red-400 border-red-500/30' :
                    hoveredUnit.stats.ammo <= hoveredUnit.stats.maxAmmo * 0.3 ? 'bg-orange-500/20 text-orange-400 border-orange-500/30' :
                    'bg-gray-500/20 text-gray-400 border-gray-500/30'
                  }`}>
                    🔫{hoveredUnit.stats.ammo}/{hoveredUnit.stats.maxAmmo}
                  </Badge>
                )}
              </div>
            </div>
          )}

          {/* ===== Move-Phase Damage Preview ===== */}
          {phase === 'moveUnit' && selectedUnit && selectedUnit.canAttack && hoveredUnit &&
            hoveredUnit.isAlive && hoveredUnit.faction !== currentFaction &&
            movablePositions && movablePositions.length > 0 && (() => {
              // Find the closest movable position within attack range of the hovered enemy
              const attackRange = getEffectiveAttackRange(selectedUnit);
              let closestDist = Infinity;
              let bestMovePos: Position | null = null;
              for (const mp of movablePositions) {
                const distToEnemy = Math.abs(mp.x - hoveredUnit.position.x) + Math.abs(mp.z - hoveredUnit.position.z);
                if (distToEnemy >= 1 && distToEnemy <= attackRange && distToEnemy < closestDist) {
                  closestDist = distToEnemy;
                  bestMovePos = mp;
                }
              }
              // Also check current position (unit hasn't moved yet, can attack from here)
              const currentDistToEnemy = Math.abs(selectedUnit.position.x - hoveredUnit.position.x) +
                Math.abs(selectedUnit.position.z - hoveredUnit.position.z);
              if (currentDistToEnemy >= 1 && currentDistToEnemy <= attackRange && currentDistToEnemy < closestDist) {
                closestDist = currentDistToEnemy;
                bestMovePos = selectedUnit.position;
              }

              if (!bestMovePos) return null;

              // Build a simulated attacker at the best move position
              const simAttacker = { ...selectedUnit, position: { ...bestMovePos }, canMove: false };
              const defenderCell = cell;
              const result = estimateDamage(
                simAttacker, hoveredUnit, defenderCell, true,
                currentWeather, units,
                mapCells[bestMovePos.z]?.[bestMovePos.x]?.terrain
              );
              const killProb = calculateKillProbability(
                simAttacker, hoveredUnit, defenderCell, false,
                currentWeather,
                mapCells[bestMovePos.z]?.[bestMovePos.x]?.terrain,
                units
              );
              const avgDmg = Math.round((result.min + result.max) / 2);
              const moveDist = bestMovePos.x === selectedUnit.position.x && bestMovePos.z === selectedUnit.position.z
                ? 0
                : Math.abs(bestMovePos.x - selectedUnit.position.x) + Math.abs(bestMovePos.z - selectedUnit.position.z);

              return (
                <div className="px-3 py-2 border-t border-orange-500/30 bg-orange-500/5 space-y-1">
                  <div className="flex items-center gap-1.5 text-[11px] text-orange-300 font-medium">
                    <Crosshair className="w-3 h-3" />
                    <span>移动攻击预览</span>
                  </div>
                  {moveDist > 0 && (
                    <div className="text-[10px] text-gray-400">
                      移动 {moveDist} 格后攻击 (距离 {closestDist})
                    </div>
                  )}
                  <div className="flex items-center gap-1.5 text-xs">
                    <span className="text-gray-400">预估伤害:</span>
                    <span className="font-bold text-orange-400">{result.min}-{result.max}</span>
                    <span className="text-[10px] text-gray-500">(均{avgDmg})</span>
                  </div>
                  <div className="flex items-center gap-1.5 text-[10px]">
                    <span className="text-gray-400">击杀概率:</span>
                    <span className={`font-bold ${killProb.killProbability >= 70 ? 'text-red-400' : killProb.killProbability >= 30 ? 'text-orange-400' : 'text-gray-300'}`}>
                      {killProb.killProbability}%
                    </span>
                    {result.reduction > 0 && (
                      <span className="text-gray-500 ml-auto">
                        <BrickWall className="w-2.5 h-2.5 inline-block text-amber-400" /> {result.reduction}%
                      </span>
                    )}
                  </div>
                </div>
              );
            })()
          }
        </div>
      </motion.div>
    </AnimatePresence>
  );
});

// ===== Casualty Report Panel (v23.0) =====
interface CasualtyEntry {
  unitId: string;
  unitType: UnitType;
  unitName: string;
  faction: 'red' | 'blue';
  level: number;
  killerName?: string;
  killerType?: string;
  turnDestroyed: number;
}

function CasualtyReportPanel({ isOpen, onClose, casualties }: {
  isOpen: boolean;
  onClose: () => void;
  casualties: CasualtyEntry[];
}) {
  if (!isOpen) return null;
  const redCasualties = casualties.filter(c => c.faction === 'red');
  const blueCasualties = casualties.filter(c => c.faction === 'blue');

  const unitCost = (type: UnitType) => {
    const costs: Record<string, number> = { tank: 100, ifv: 70, artillery: 90, scout: 50, infantry: 30, sam: 80, engineer: 60, supply: 40, helicopter: 120, mlrs: 110 };
    return costs[type] || 50;
  };

  const redCostLoss = redCasualties.reduce((sum, c) => sum + unitCost(c.unitType), 0);
  const blueCostLoss = blueCasualties.reduce((sum, c) => sum + unitCost(c.unitType), 0);

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 10 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 10 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="fixed top-14 left-3 z-[60] w-72 rounded-xl border border-white/10 bg-gray-900/95 backdrop-blur-xl shadow-2xl shadow-black/50 max-h-[60vh] flex flex-col"
          style={{ pointerEvents: 'auto' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-2.5 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Skull className="w-4 h-4 text-red-400" />
              <span className="text-sm font-bold text-white">阵亡报告</span>
            </div>
            <button onClick={onClose} className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
              <X className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* Summary stats */}
          <div className="grid grid-cols-2 gap-2 px-3 py-2 border-b border-white/5">
            <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2 text-center">
              <div className="text-[10px] text-red-400 mb-0.5">红方损失</div>
              <div className="text-lg font-bold text-red-300">{redCasualties.length}</div>
              <div className="text-[9px] text-gray-500">资源 {redCostLoss}</div>
            </div>
            <div className="bg-blue-500/10 border border-blue-500/20 rounded-lg p-2 text-center">
              <div className="text-[10px] text-blue-400 mb-0.5">蓝方损失</div>
              <div className="text-lg font-bold text-blue-300">{blueCasualties.length}</div>
              <div className="text-[9px] text-gray-500">资源 {blueCostLoss}</div>
            </div>
          </div>

          {/* Loss ratio bar */}
          <div className="px-3 py-1.5">
            <div className="flex items-center gap-1 text-[9px] text-gray-500 mb-1">
              <span>损失比</span>
              <span className="text-gray-400">{redCasualties.length}:{blueCasualties.length}</span>
            </div>
            <div className="h-2 bg-white/5 rounded-full overflow-hidden flex">
              {redCasualties.length + blueCasualties.length > 0 ? (
                <>
                  <div className="bg-red-500 h-full transition-all duration-500" style={{ width: `${(redCasualties.length / (redCasualties.length + blueCasualties.length)) * 100}%` }} />
                  <div className="bg-blue-500 h-full transition-all duration-500" style={{ width: `${(blueCasualties.length / (redCasualties.length + blueCasualties.length)) * 100}%` }} />
                </>
              ) : (
                <div className="bg-gray-600 h-full w-full" />
              )}
            </div>
          </div>

          {/* Casualty list */}
          <ScrollArea className="flex-1">
            <div className="px-2 py-1 space-y-0.5">
              {casualties.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-6 text-gray-500">
                  <Shield className="w-6 h-6 mb-1 opacity-30" />
                  <span className="text-[10px]">暂无阵亡单位</span>
                </div>
              ) : (
                [...casualties].reverse().map(c => (
                  <div key={c.unitId} className="flex items-center gap-2 px-2 py-1.5 rounded-md hover:bg-white/5 transition-colors">
                    <div className={`shrink-0 ${c.faction === 'red' ? 'text-red-400' : 'text-blue-400'}`}>
                      {UNIT_ICONS[c.unitType] || <Shield className="w-3.5 h-3.5" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1">
                        <span className={`text-[10px] font-medium ${c.faction === 'red' ? 'text-red-300' : 'text-blue-300'}`}>
                          {c.unitName}
                        </span>
                        {c.level > 1 && (
                          <span className="text-[8px] text-purple-400">Lv.{c.level}</span>
                        )}
                        <span className="text-[9px] text-gray-600">R{c.turnDestroyed}</span>
                      </div>
                      {c.killerName && (
                        <div className="text-[9px] text-gray-500">
                          <Skull className="w-2 h-2 inline mr-0.5" />
                          {c.killerName}
                        </div>
                      )}
                    </div>
                    <div className="text-[9px] text-gray-600">
                      {unitCost(c.unitType)}
                    </div>
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ===== Notification Center =====
interface GameNotification {
  id: string;
  type: 'combat' | 'system' | 'achievement' | 'weather' | 'capture' | 'levelup' | 'reinforcement';
  title: string;
  description: string;
  icon: React.ReactNode;
  timestamp: number;
  read: boolean;
  priority?: 'low' | 'normal' | 'high' | 'critical';
}

function NotificationCenter({ isOpen, onClose, notifications, onMarkAllRead, onClearAll }: {
  isOpen: boolean;
  onClose: () => void;
  notifications: GameNotification[];
  onMarkAllRead: () => void;
  onClearAll: () => void;
}) {
  const [activeTab, setActiveTab] = useState<string>('all');

  const typeColors: Record<string, string> = {
    combat: 'text-red-400',
    system: 'text-blue-400',
    achievement: 'text-yellow-400',
    weather: 'text-cyan-400',
    capture: 'text-emerald-400',
    levelup: 'text-purple-400',
    reinforcement: 'text-amber-400',
  };

  const typeBg: Record<string, string> = {
    combat: 'bg-red-500/10 border-red-500/20',
    system: 'bg-blue-500/10 border-blue-500/20',
    achievement: 'bg-yellow-500/10 border-yellow-500/20',
    weather: 'bg-cyan-500/10 border-cyan-500/20',
    capture: 'bg-emerald-500/10 border-emerald-500/20',
    levelup: 'bg-purple-500/10 border-purple-500/20',
    reinforcement: 'bg-amber-500/10 border-amber-500/20',
  };

  const typeLabels: Record<string, string> = {
    combat: '战斗',
    system: '系统',
    achievement: '成就',
    weather: '天气',
    capture: '据点',
    levelup: '升级',
    reinforcement: '增援',
  };

  const tabs = [
    { key: 'all', label: '全部' },
    { key: 'combat', label: '战斗' },
    { key: 'system', label: '系统' },
    { key: 'achievement', label: '成就' },
    { key: 'weather', label: '天气' },
    { key: 'capture', label: '据点' },
    { key: 'levelup', label: '升级' },
    { key: 'reinforcement', label: '增援' },
  ];

  const filtered = activeTab === 'all' ? notifications : notifications.filter(n => n.type === activeTab);
  const unreadCount = notifications.filter(n => !n.read).length;

  const formatTime = (ts: number) => {
    const now = Date.now();
    const diff = now - ts;
    if (diff < 60000) return '刚刚';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}分前`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}时前`;
    return `${Math.floor(diff / 86400000)}天前`;
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ x: 320, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: 320, opacity: 0 }}
          transition={{ type: 'spring', stiffness: 300, damping: 30 }}
          className="fixed top-14 right-3 z-[60] w-80 rounded-xl border border-white/10 bg-gray-900/95 backdrop-blur-xl shadow-2xl shadow-black/50 flex flex-col max-h-[70vh]"
          style={{ pointerEvents: 'auto' }}
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <BellRing className="w-4 h-4 text-amber-400" />
              <span className="text-sm font-bold text-white">通知中心</span>
              {unreadCount > 0 && (
                <Badge className="bg-red-500 text-white text-[10px] h-4 px-1.5 animate-pulse">
                  {unreadCount}
                </Badge>
              )}
            </div>
            <div className="flex items-center gap-1">
              <TooltipProvider><Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={onMarkAllRead}
                    className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                  >
                    <Check className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent><span className="text-xs">全部已读</span></TooltipContent>
              </Tooltip></TooltipProvider>
              <TooltipProvider><Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={onClearAll}
                    className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </TooltipTrigger>
                <TooltipContent><span className="text-xs">清空通知</span></TooltipContent>
              </Tooltip></TooltipProvider>
              <button onClick={onClose} className="p-1 rounded hover:bg-white/10 text-gray-400 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Tab bar */}
          <div className="flex items-center gap-1 px-3 py-2 border-b border-white/5 overflow-x-auto">
            {tabs.map(tab => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`px-2 py-0.5 rounded-md text-[10px] font-medium whitespace-nowrap transition-all ${
                  activeTab === tab.key
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30'
                    : 'text-gray-500 hover:text-gray-300 hover:bg-white/5 border border-transparent'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Notification list */}
          <ScrollArea className="flex-1 max-h-[55vh]">
            <div className="p-2 space-y-1.5">
              {filtered.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 text-gray-500">
                  <Bell className="w-8 h-8 mb-2 opacity-30" />
                  <span className="text-xs">暂无通知</span>
                </div>
              ) : (
                filtered.map(notif => (
                  <motion.div
                    key={notif.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    className={`rounded-lg border p-2.5 transition-all hover:bg-white/5 cursor-default ${
                      notif.read ? 'bg-transparent border-white/5' : `border-l-2 ${typeBg[notif.type]}`
                    }`}
                  >
                    <div className="flex items-start gap-2">
                      <div className={`mt-0.5 shrink-0 ${typeColors[notif.type]}`}>
                        {notif.icon}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="text-xs font-semibold text-white truncate">{notif.title}</span>
                          <span className="text-[9px] text-gray-600 whitespace-nowrap">{formatTime(notif.timestamp)}</span>
                        </div>
                        <p className="text-[10px] text-gray-400 leading-relaxed mt-0.5 line-clamp-2">{notif.description}</p>
                        <div className="flex items-center gap-1.5 mt-1">
                          <Badge className={`text-[8px] h-3.5 px-1 font-normal ${typeBg[notif.type]} ${typeColors[notif.type]} border`}>
                            {typeLabels[notif.type]}
                          </Badge>
                          {notif.priority === 'critical' && (
                            <Badge className="text-[8px] h-3.5 px-1 bg-red-500/20 text-red-400 border border-red-500/30 animate-pulse">
                              紧急
                            </Badge>
                          )}
                        </div>
                      </div>
                      {!notif.read && (
                        <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0 animate-pulse" />
                      )}
                    </div>
                  </motion.div>
                ))
              )}
            </div>
          </ScrollArea>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

// ===== Floating Damage Number (Animated with framer-motion) =====
const FloatingDamageNumber = React.memo(function FloatingDamageNumber({ popup }: { popup: DamagePopup }) {
  // Map cell position to approximate screen position (percentage-based)
  const screenX = ((popup.x + 0.5) / MAP_WIDTH) * 100;
  const screenY = ((popup.z + 0.5) / MAP_HEIGHT) * 100;

  const isHeal = popup.type === 'heal';
  const isDamage = popup.type === 'damage';
  const isCounter = popup.type === 'counter';
  const isXp = popup.type === 'xp';
  const isLevelUp = popup.type === 'levelup';
  const isResupply = popup.type === 'resupply' || popup.type === 'ammo';
  const isMorale = popup.type === 'morale';

  // Critical hit detection: high damage values are considered crits
  const isCrit = isDamage && popup.value >= 30;

  // Determine visual properties based on popup type
  let color: string;
  let label: string;
  let icon: string;
  if (isHeal) {
    color = '#4caf50'; label = `+${popup.value}`; icon = '💚';
  } else if (isCrit) {
    color = '#ff1744'; label = `-${popup.value}`; icon = '💥';
  } else if (isDamage) {
    color = '#ff5252'; label = `-${popup.value}`; icon = '';
  } else if (isCounter) {
    color = '#fbbf24'; label = `-${popup.value}`; icon = '⚔️';
  } else if (isXp) {
    color = '#facc15'; label = `+${popup.value} XP`; icon = '✨';
  } else if (isLevelUp) {
    color = '#fbbf24'; label = `LEVEL UP!`; icon = '⬆️';
  } else if (isResupply) {
    color = '#42a5f5'; label = '+弹药'; icon = '📦';
  } else if (isMorale) {
    color = popup.value > 0 ? '#ab47bc' : '#ef5350'; label = popup.value > 0 ? '+士气' : '-士气'; icon = popup.value > 0 ? '📈' : '📉';
  } else {
    color = '#ffffff'; label = `${popup.value}`; icon = '';
  }

  const fontSize = isCrit ? 28 : isLevelUp ? 22 : isHeal ? 18 : isXp ? 16 : 20;

  return (
    <motion.div
      key={popup.id}
      className="absolute pointer-events-none z-30 font-bold whitespace-nowrap"
      style={{ left: `${screenX}%`, top: `${screenY}%` }}
      initial={{ opacity: 0, y: 0, scale: isCrit ? 0.2 : 0.5 }}
      animate={{
        opacity: [0, 1, 1, 0.8, 0],
        y: [0, -15, -35, -50, -65],
        scale: isCrit ? [0.2, 2.0, 1.2, 1.0, 0.7] : [0.5, 1.2, 1.0, 1.0, 0.7],
      }}
      transition={{
        duration: 2.0,
        times: [0, 0.08, 0.25, 0.65, 1],
        ease: 'easeOut',
      }}
    >
      {/* Critical hit radial flash */}
      {isCrit && (
        <motion.div
          className="absolute inset-0 -m-3 rounded-full"
          initial={{ opacity: 0.7, scale: 0.5 }}
          animate={{ opacity: 0, scale: 3.5 }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
          style={{ backgroundColor: 'rgba(255,23,68,0.25)' }}
        />
      )}
      <span
        style={{
          color,
          fontSize: `${fontSize}px`,
          textShadow: `0 2px 4px rgba(0,0,0,0.9), 0 0 ${isCrit ? 20 : 10}px ${color}60`,
          position: 'relative',
        }}
      >
        {icon && <span className="mr-0.5">{icon}</span>}
        {label}
        {isCrit && (
          <motion.span
            className="ml-1 text-[10px] text-yellow-300"
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 1, 0] }}
            transition={{ duration: 1.5, times: [0, 0.15, 0.5, 1] }}
          >
            暴击!
          </motion.span>
        )}
      </span>
    </motion.div>
  );
});

// ===== Damage Popup Overlay (subscribes to store independently) =====
function DamagePopupOverlay({ show }: { show: boolean }) {
  const damagePopups = useGameStore(s => s.damagePopups);

  // v57.0: Auto-cleanup expired popups — removed forceUpdate polling.
  // The store mutation itself triggers re-render when popups are removed.
  useEffect(() => {
    if (!show) return;
    const timer = setInterval(() => {
      const popups = useGameStore.getState().damagePopups;
      const now = Date.now();
      // Clean up popups older than animation duration (2s) + buffer
      const active = (popups || []).filter(p => now - p.timestamp < 2500);
      if (active.length !== (popups || []).length) {
        useGameStore.setState({ damagePopups: active });
      }
    }, 1000);
    return () => clearInterval(timer);
  }, [show]);

  if (!show) return null;

  // Show popups that are still within display window
  const now = Date.now();
  const activePopups = (damagePopups || []).filter(p => now - p.timestamp < 2500);
  if (activePopups.length === 0) return null;

  return (
    <div className="absolute inset-0 pointer-events-none z-30 overflow-hidden">
      {activePopups.map(popup => (
        <FloatingDamageNumber key={popup.id} popup={popup} />
      ))}
    </div>
  );
}

// ===== Unit Action Queue Panel (v50.0) =====
const UnitActionQueue = React.memo(function UnitActionQueue() {
  const { units, selectedUnit, phase, currentFaction, isAiProcessing } = useGameStore(useShallow(s => ({
    units: s.units, selectedUnit: s.selectedUnit, phase: s.phase,
    currentFaction: s.currentFaction, isAiProcessing: s.isAiProcessing,
  })));

  if (currentFaction !== 'red' || isAiProcessing || phase === 'gameOver' || phase === 'deployment' || phase === 'heroSelection') return null;

  const actionableUnits = units.filter(u =>
    u.faction === 'red' && u.isAlive && (u.canMove || u.canAttack)
  );
  if (actionableUnits.length === 0) return null;

  // Sort: canMove+canAttack first, then canAttack only, then canMove only
  const sorted = [...actionableUnits].sort((a, b) => {
    const aScore = (a.canMove ? 2 : 0) + (a.canAttack ? 1 : 0);
    const bScore = (b.canMove ? 2 : 0) + (b.canAttack ? 1 : 0);
    return bScore - aScore;
  });

  const handleUnitClick = (unitId: string) => {
    const store = useGameStore.getState();
    const unit = store.units.find(u => u.id === unitId);
    if (unit) {
      store.focusOnUnit(unitId);
    }
  };

  return (
    <motion.div
      className="fixed right-3 bottom-16 z-40 pointer-events-auto"
      initial={{ opacity: 0, x: 40 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0, x: 40 }}
      transition={{ duration: 0.2 }}
    >
      <div className="bg-gray-900/90 backdrop-blur-md border border-white/10 rounded-lg p-1.5 shadow-xl shadow-black/20 w-36 max-h-60 overflow-y-auto custom-scrollbar">
        <div className="text-[9px] text-gray-400 font-bold px-1.5 mb-1 flex items-center gap-1">
          <Zap className="w-3 h-3 text-amber-400" />
          待行动 ({sorted.length})
        </div>
        {sorted.map((unit, idx) => {
          const isSelected = selectedUnit?.id === unit.id;
          const hpPct = Math.round((unit.stats.hp / unit.stats.maxHp) * 100);
          // v75.0: Aligned with getHpColor thresholds (0.7/0.3)
          const hpColor = hpPct > 70 ? 'bg-green-500' : hpPct > 30 ? 'bg-yellow-500' : 'bg-red-500';
          const iconKey = Object.keys(UNIT_ICONS).find(k => unit.name.includes(UNIT_CONFIGS[k]?.name ?? '')) || unit.type;
          return (
            <motion.button
              key={unit.id}
              className={`w-full flex items-center gap-1.5 px-1.5 py-1 rounded text-left transition-colors duration-100 ${
                isSelected
                  ? 'bg-amber-500/20 border border-amber-400/40'
                  : 'hover:bg-white/5 border border-transparent'
              }`}
              onClick={() => handleUnitClick(unit.id)}
              whileTap={{ scale: 0.97 }}
              initial={{ opacity: 0, y: 5 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: idx * 0.03 }}
            >
              <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                {UNIT_ICONS[iconKey] || <span className="text-[8px] text-gray-400">?</span>}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[10px] text-gray-200 truncate leading-tight">{unit.name}</div>
                <div className="flex items-center gap-0.5 mt-0.5">
                  <div className="flex-1 h-1 bg-gray-700 rounded-full overflow-hidden">
                    <div className={`h-full ${hpColor} rounded-full transition-all duration-300`} style={{ width: `${hpPct}%` }} />
                  </div>
                  <span className="text-[8px] text-gray-500 tabular-nums">{unit.stats.hp}</span>
                </div>
                <div className="flex gap-0.5 mt-0.5">
                  {unit.canMove && <span className="text-[7px] px-0.5 rounded bg-blue-500/20 text-blue-300">移</span>}
                  {unit.canAttack && <span className="text-[7px] px-0.5 rounded bg-red-500/20 text-red-300">攻</span>}
                  {unit.isStealthed && <span className="text-[7px] px-0.5 rounded bg-purple-500/20 text-purple-300">隐</span>}
                  {unit.isHero && <span className="text-[7px] px-0.5 rounded bg-amber-500/20 text-amber-300">英</span>}
                </div>
              </div>
            </motion.button>
          );
        })}
        {/* v75.0: Skip All Remaining button */}
        {sorted.length > 1 && (
          <button
            onClick={() => {
              const store = useGameStore.getState();
              const remainingIds = new Set(
                store.units.filter(u => u.faction === 'red' && u.isAlive && (u.canMove || u.canAttack)).map(u => u.id)
              );
              if (remainingIds.size === 0) return;
              // v89.0: Save undo snapshot before mass-skip (previously skipped, could be catastrophic)
              const snapshot = { ...store, previousState: null, previousTurnState: null };
              useGameStore.setState(s => ({
                units: s.units.map(unit =>
                  remainingIds.has(unit.id) ? { ...unit, canMove: false, canAttack: false } : unit
                ),
                previousTurnState: snapshot,
              }));
              useGameStore.getState().onDeselect();
            }}
            className="w-full mt-1 py-1 text-[8px] text-gray-400 hover:text-gray-200 bg-white/5 hover:bg-white/10 rounded transition-colors"
          >
            跳过全部 ({sorted.length})
          </button>
        )}
      </div>
    </motion.div>
  );
});


const LEFT_BOTTOM_BAR_TABS = [
  { id: 'action', icon: '🎯', label: '待行动' },
  { id: 'minimap', icon: '🗺️', label: '小地图' },
  { id: 'stats', icon: '📊', label: '战斗统计' },
  { id: 'capture', icon: '🏴', label: '据点' },
  { id: 'forces', icon: '👥', label: '部队' },
] as const;

type LeftBottomBarTabId = typeof LEFT_BOTTOM_BAR_TABS[number]['id'];

const LeftBottomBar = React.memo(function LeftBottomBar({
  activeTab,
  onTabChange,
  unitFilter,
  setUnitFilter,
}: {
  activeTab: LeftBottomBarTabId;
  onTabChange: (tab: LeftBottomBarTabId) => void;
  unitFilter: UnitType | null;
  setUnitFilter: (filter: UnitType | null) => void;
}) {
  const { units, selectedUnit, phase, currentFaction, isAiProcessing,
          capturePoints, battleStats, turnSummaries, turn } = useGameStore(useShallow(s => ({
    units: s.units, selectedUnit: s.selectedUnit, phase: s.phase,
    currentFaction: s.currentFaction, isAiProcessing: s.isAiProcessing,
    capturePoints: s.capturePoints, battleStats: s.battleStats,
    turnSummaries: s.turnSummaries, turn: s.turn,
  })));

  const hpColorFn = (hp: number, maxHp: number) =>
    hp / maxHp > 0.7 ? 'text-green-400' : hp / maxHp > 0.3 ? 'text-yellow-400' : 'text-red-400';

  const redUnits = useMemo(() => units.filter(u => u.faction === 'red' && u.isAlive), [units]);
  const blueUnits = useMemo(() => units.filter(u => u.faction === 'blue' && u.isAlive), [units]);
  const redLost = useMemo(() => units.filter(u => u.faction === 'red' && !u.isAlive).length, [units]);
  const blueLost = useMemo(() => units.filter(u => u.faction === 'blue' && !u.isAlive).length, [units]);
  const filteredRedUnits = useMemo(() => {
    if (!unitFilter) return redUnits;
    return redUnits.filter(u => u.type === unitFilter);
  }, [redUnits, unitFilter]);
  const filteredBlueUnits = useMemo(() => {
    if (!unitFilter) return blueUnits;
    return blueUnits.filter(u => u.type === unitFilter);
  }, [blueUnits, unitFilter]);

  const actionableUnits = useMemo(() => {
    if (currentFaction !== 'red' || isAiProcessing || phase === 'gameOver' || phase === 'deployment' || phase === 'heroSelection') return [];
    return units.filter(u => u.faction === 'red' && u.isAlive && (u.canMove || u.canAttack))
      .sort((a, b) => {
        const aScore = (a.canMove ? 2 : 0) + (a.canAttack ? 1 : 0);
        const bScore = (b.canMove ? 2 : 0) + (b.canAttack ? 1 : 0);
        return bScore - aScore;
      });
  }, [units, currentFaction, isAiProcessing, phase]);

  const red = battleStats.red;
  const blue = battleStats.blue;
  const statItems = useMemo(() => [
    { label: '造成伤害', red: red.damageDealt, blue: blue.damageDealt },
    { label: '受到伤害', red: red.damageReceived, blue: blue.damageReceived },
    { label: '击毁单位', red: red.unitsDestroyed, blue: blue.unitsDestroyed },
    { label: '损失单位', red: red.unitsLost, blue: blue.unitsLost },
    { label: '治疗量', red: red.healingDone, blue: blue.healingDone },
    { label: '攻击次数', red: red.attacks, blue: blue.attacks },
  ], [red, blue]);

  const unitRanking = useMemo(() => {
    return [...units].sort((a, b) => ((b.killCount || 0) - (a.killCount || 0))).map(u => ({
      id: u.id, type: u.type, faction: u.faction, name: u.name,
      killCount: u.killCount || 0, totalDamageDealt: u.totalDamageDealt || 0, isAlive: u.isAlive,
    }));
  }, [units]);

  const captureData = useMemo(() => {
    if (!capturePoints || capturePoints.length === 0) return null;
    const redCPs = capturePoints.filter(cp => cp.owner === 'red').length;
    const blueCPs = capturePoints.filter(cp => cp.owner === 'blue').length;
    const neutralCPs = capturePoints.length - redCPs - blueCPs;
    return { redCPs, blueCPs, neutralCPs, total: capturePoints.length };
  }, [capturePoints]);

  const getContestedStatus = useCallback((cp: typeof capturePoints[number]) => {
    let redNearby = 0;
    let blueNearby = 0;
    for (const u of units) {
      if (!u.isAlive) continue;
      const dist = Math.abs(u.position.x - cp.position.x) + Math.abs(u.position.z - cp.position.z);
      if (dist <= cp.captureRadius) {
        if (u.faction === 'red') redNearby++;
        else blueNearby++;
      }
    }
    return { redNearby, blueNearby, isContested: redNearby > 0 && blueNearby > 0 };
  }, [units]);

  const redEfficiency = red.damageReceived > 0 ? (red.damageDealt / red.damageReceived).toFixed(2) : '∞';
  const blueEfficiency = blue.damageReceived > 0 ? (blue.damageDealt / blue.damageReceived).toFixed(2) : '∞';

  return (
    <div className="fixed left-0 bottom-0 z-20 pointer-events-auto" style={{ width: 248 }}>
      <div className="bg-gray-900/90 backdrop-blur-xl border-t border-r border-white/10 rounded-tr-lg shadow-xl shadow-black/30 flex flex-col" style={{ height: 268 }}>
        <div className="flex items-center border-b border-white/10 shrink-0">
          {LEFT_BOTTOM_BAR_TABS.map(tab => (
            <button
              key={tab.id}
              onClick={() => onTabChange(tab.id)}
              className={`flex-1 px-0.5 py-1 text-center transition-colors ${
                activeTab === tab.id
                  ? 'text-amber-400 bg-white/5 border-b-2 border-amber-400'
                  : 'text-gray-500 hover:text-gray-300 hover:bg-white/5'
              }`}
            >
              <span className="block text-xs leading-none">{tab.icon}</span>
              <span className="block text-[8px] mt-0.5 leading-none">{tab.label}</span>
            </button>
          ))}
        </div>

        <div className="flex-1 overflow-hidden">
          {activeTab === 'action' && (
            <ScrollArea className="h-full">
              <div className="p-1.5">
                {actionableUnits.length === 0 ? (
                  <div className="text-[10px] text-gray-500 text-center py-6">无待行动单位</div>
                ) : (
                  <>
                    <div className="text-[9px] text-gray-400 font-bold px-1 mb-1 flex items-center gap-1">
                      <Zap className="w-3 h-3 text-amber-400" />
                      待行动 ({actionableUnits.length})
                    </div>
                    {actionableUnits.map((unit, idx) => {
                      const isSelected = selectedUnit?.id === unit.id;
                      const hpPct = Math.round((unit.stats.hp / unit.stats.maxHp) * 100);
                      const hpBarColor = hpPct > 70 ? 'bg-green-500' : hpPct > 30 ? 'bg-yellow-500' : 'bg-red-500';
                      const iconKey = Object.keys(UNIT_ICONS).find(k => unit.name.includes(UNIT_CONFIGS[k]?.name ?? '')) || unit.type;
                      return (
                        <motion.button
                          key={unit.id}
                          className={`w-full flex items-center gap-1.5 px-1.5 py-1 rounded text-left transition-colors duration-100 ${
                            isSelected ? 'bg-amber-500/20 border border-amber-400/40' : 'hover:bg-white/5 border border-transparent'
                          }`}
                          onClick={() => { useGameStore.getState().focusOnUnit(unit.id); }}
                          whileTap={{ scale: 0.97 }}
                          initial={{ opacity: 0, y: 5 }}
                          animate={{ opacity: 1, y: 0 }}
                          transition={{ delay: idx * 0.03 }}
                        >
                          <div className="flex-shrink-0 w-5 h-5 flex items-center justify-center">
                            {UNIT_ICONS[iconKey] || <span className="text-[8px] text-gray-400">?</span>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-[10px] text-gray-200 truncate leading-tight">{unit.name}</div>
                            <div className="flex items-center gap-0.5 mt-0.5">
                              <div className="flex-1 h-1 bg-gray-700 rounded-full overflow-hidden">
                                <div className={`h-full ${hpBarColor} rounded-full transition-all duration-300`} style={{ width: `${hpPct}%` }} />
                              </div>
                              <span className="text-[8px] text-gray-500 tabular-nums">{unit.stats.hp}</span>
                            </div>
                            <div className="flex gap-0.5 mt-0.5">
                              {unit.canMove && <span className="text-[7px] px-0.5 rounded bg-blue-500/20 text-blue-300">移</span>}
                              {unit.canAttack && <span className="text-[7px] px-0.5 rounded bg-red-500/20 text-red-300">攻</span>}
                              {unit.isStealthed && <span className="text-[7px] px-0.5 rounded bg-purple-500/20 text-purple-300">隐</span>}
                              {unit.isHero && <span className="text-[7px] px-0.5 rounded bg-amber-500/20 text-amber-300">英</span>}
                            </div>
                          </div>
                        </motion.button>
                      );
                    })}
                    {actionableUnits.length > 1 && (
                      <button
                        onClick={() => {
                          const store = useGameStore.getState();
                          const remainingIds = new Set(
                            store.units.filter(u => u.faction === 'red' && u.isAlive && (u.canMove || u.canAttack)).map(u => u.id)
                          );
                          if (remainingIds.size === 0) return;
                          const snapshot = { ...store, previousState: null, previousTurnState: null };
                          useGameStore.setState(s => ({
                            units: s.units.map(unit =>
                              remainingIds.has(unit.id) ? { ...unit, canMove: false, canAttack: false } : unit
                            ),
                            previousTurnState: snapshot,
                          }));
                          useGameStore.getState().onDeselect();
                        }}
                        className="w-full mt-1 py-1 text-[8px] text-gray-400 hover:text-gray-200 bg-white/5 hover:bg-white/10 rounded transition-colors"
                      >
                        跳过全部 ({actionableUnits.length})
                      </button>
                    )}
                  </>
                )}
              </div>
            </ScrollArea>
          )}

          {activeTab === 'minimap' && (
            <div className="p-2 h-full flex flex-col">
              <div className="flex items-center justify-between mb-1">
                <span className="text-[10px] font-medium text-white/60">🗺️ 小地图</span>
                <div className="flex items-center gap-2">
                  <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/15 border border-red-500/20">
                    <span className="text-[9px] font-bold text-red-400">{units.filter(u => u.faction === 'red' && u.isAlive).length}</span>
                  </div>
                  <div className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-500/15 border border-blue-500/20">
                    <span className="text-[9px] font-bold text-blue-400">{units.filter(u => u.faction === 'blue' && u.isAlive).length}</span>
                  </div>
                </div>
              </div>
              <div className="flex-1 flex items-center justify-center">
                <Minimap />
              </div>
            </div>
          )}

          {activeTab === 'stats' && (
            <ScrollArea className="h-full">
              <div className="p-2 space-y-2">
                <div className="text-[10px] font-bold text-gray-400 flex items-center gap-1">
                  <BarChart3 className="w-3 h-3 text-cyan-400" />
                  红 vs 蓝 对比
                </div>
                <div className="space-y-1">
                  {statItems.map(item => {
                    const maxVal = Math.max(item.red, item.blue, 1);
                    return (
                      <div key={item.label}>
                        <div className="text-[9px] text-gray-500 mb-0.5">{item.label}</div>
                        <div className="flex gap-0.5 items-center">
                          <span className="text-[8px] text-red-400 w-6 text-right">{item.red}</span>
                          <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-red-500/70 transition-all duration-500" style={{ width: `${(item.red / maxVal) * 100}%` }} />
                          </div>
                          <div className="flex-1 h-2 bg-white/10 rounded-full overflow-hidden">
                            <div className="h-full rounded-full bg-blue-500/70 transition-all duration-500" style={{ width: `${(item.blue / maxVal) * 100}%` }} />
                          </div>
                          <span className="text-[8px] text-blue-400 w-6">{item.blue}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
                <Separator className="bg-white/10" />
                <div>
                  <div className="text-[10px] font-bold text-gray-400 flex items-center gap-1 mb-1">
                    <Trophy className="w-3 h-3 text-amber-400" />
                    击杀排行
                  </div>
                  <div className="space-y-0.5 max-h-28 overflow-y-auto">
                    {unitRanking.filter(u => u.killCount > 0 || u.totalDamageDealt > 0).slice(0, 8).map((unit, idx) => (
                      <div key={unit.id} className={`flex items-center gap-1 px-1 py-0.5 rounded text-[9px] ${idx === 0 ? 'bg-amber-900/30 border border-amber-500/40' : 'bg-white/5'}`}>
                        {idx === 0 && <span className="text-amber-400">👑</span>}
                        <span className={unit.faction === 'red' ? 'text-red-400' : 'text-blue-400'}>{UNIT_ICONS[unit.type]}</span>
                        <span className="text-white/80 flex-1 truncate">{unit.name}</span>
                        <span className="text-amber-300">{unit.killCount}杀</span>
                        <span className="text-gray-400">{unit.totalDamageDealt}伤</span>
                      </div>
                    ))}
                    {unitRanking.filter(u => u.killCount > 0 || u.totalDamageDealt > 0).length === 0 && (
                      <div className="text-[9px] text-gray-500 text-center py-2">暂无击杀数据</div>
                    )}
                  </div>
                </div>
                <Separator className="bg-white/10" />
                <div>
                  <div className="text-[10px] font-bold text-gray-400 flex items-center gap-1 mb-1">
                    <Zap className="w-3 h-3 text-green-400" />
                    效率指标
                  </div>
                  <div className="grid grid-cols-2 gap-1">
                    <div className="bg-white/5 rounded p-1.5">
                      <div className="text-[8px] text-gray-500">伤害效率</div>
                      <div className="flex gap-1 items-baseline">
                        <span className="text-[10px] font-bold text-red-400">{redEfficiency}</span>
                        <span className="text-[8px] text-gray-500">vs</span>
                        <span className="text-[10px] font-bold text-blue-400">{blueEfficiency}</span>
                      </div>
                    </div>
                    <div className="bg-white/5 rounded p-1.5">
                      <div className="text-[8px] text-gray-500">当前回合</div>
                      <div className="text-[10px] font-bold text-white">第 {turn} 回合</div>
                    </div>
                  </div>
                </div>
              </div>
            </ScrollArea>
          )}

          {activeTab === 'capture' && (
            <ScrollArea className="h-full">
              <div className="p-2">
                {!captureData ? (
                  <div className="text-[10px] text-gray-500 text-center py-6">本关无据点</div>
                ) : (
                  <>
                    <div className="text-[10px] text-amber-400 font-bold mb-1 flex items-center gap-1">🏴 据点控制</div>
                    <div className="flex items-center justify-between text-[9px] mb-1.5 px-1 py-0.5 rounded bg-white/5">
                      <span className="text-red-400 font-bold">{captureData.redCPs}/{captureData.total}</span>
                      <span className="text-gray-500">红方</span>
                      <span className="text-gray-600">|</span>
                      <span className="text-blue-400 font-bold">{captureData.blueCPs}/{captureData.total}</span>
                      <span className="text-gray-500">蓝方</span>
                      {captureData.neutralCPs > 0 && (
                        <>
                          <span className="text-gray-600">|</span>
                          <span className="text-gray-400">{captureData.neutralCPs}中立</span>
                        </>
                      )}
                    </div>
                    <div className="space-y-1">
                      {capturePoints!.map(cp => {
                        const isOwned = cp.owner === 'red';
                        const isEnemy = cp.owner === 'blue';
                        const isNeutral = cp.owner === null;
                        const progressRed = cp.captureProgress.red;
                        const progressBlue = cp.captureProgress.blue;
                        const cpTypeConf = CP_TYPE_CONFIG[cp.type] || { icon: '🏴', label: '据点' };
                        const contested = getContestedStatus(cp);
                        const nearbyCount = contested.redNearby + contested.blueNearby;
                        const captureRate = contested.redNearby && !contested.blueNearby
                          ? `+${nearbyCount * 15}/回合`
                          : contested.blueNearby && !contested.redNearby
                            ? `-${nearbyCount * 15}/回合`
                            : contested.isContested ? '争夺中' : '';
                        return (
                          <div key={cp.id} className={`p-1.5 rounded text-[9px] border transition-all duration-500 ${
                            isOwned ? 'bg-red-900/30 border-red-500/30' :
                            isEnemy ? 'bg-blue-900/30 border-blue-500/30' :
                            'bg-white/5 border-white/10'
                          } ${contested.isContested ? 'animate-capture-pulse' : ''}`}>
                            <div className="flex items-center gap-1 mb-0.5">
                              <span className="text-xs flex-shrink-0">{cpTypeConf.icon}</span>
                              <span className="text-white font-medium truncate flex-1">{cp.name}</span>
                              {cp.providesVision > 0 && (
                                <Tooltip>
                                  <TooltipTrigger asChild>
                                    <Eye className="w-2.5 h-2.5 text-green-400/60 flex-shrink-0" />
                                  </TooltipTrigger>
                                  <TooltipContent className="text-[10px]">提供{cp.providesVision}格视野</TooltipContent>
                                </Tooltip>
                              )}
                            </div>
                            <div className="flex gap-0.5 h-1">
                              <div className="flex-1 bg-black/40 rounded-full overflow-hidden">
                                <div className="h-full bg-red-500 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, progressRed / (cp.captureThreshold || 1) * 100)}%` }} />
                              </div>
                              <div className="flex-1 bg-black/40 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-500 rounded-full transition-all duration-500" style={{ width: `${Math.min(100, progressBlue / (cp.captureThreshold || 1) * 100)}%` }} />
                              </div>
                            </div>
                            <div className="flex items-center justify-between mt-0.5">
                              <span className="text-red-400 text-[8px]">{progressRed}%</span>
                              {captureRate && (
                                <span className={`text-[8px] font-medium inline-flex items-center gap-0.5 ${
                                  captureRate.includes('争夺') ? 'text-yellow-400' :
                                  captureRate.startsWith('+') ? 'text-green-400' :
                                  'text-red-400'
                                }`}>
                                  {captureRate.includes('争夺') && (
                                    <span className="inline-block w-1 h-1 rounded-full bg-yellow-400 animate-pulse" />
                                  )}
                                  {captureRate}
                                </span>
                              )}
                              <span className="text-blue-400 text-[8px]">{progressBlue}%</span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </>
                )}
              </div>
            </ScrollArea>
          )}

          {activeTab === 'forces' && (
            <ScrollArea className="h-full">
              <div className="p-2 space-y-1.5">
                <div>
                  <div className="text-[10px] text-red-400 mb-0.5 font-medium">🔴 红方 {filteredRedUnits.length}存活 {redLost > 0 ? `/${redLost}损失` : ''}</div>
                  <div className="space-y-0.5 max-h-28 overflow-y-auto">
                    {filteredRedUnits.map(unit => (
                      <div
                        key={unit.id}
                        className={`flex items-center gap-1 px-1 py-0.5 rounded text-[10px] cursor-pointer hover:bg-red-900/30 ${selectedUnit?.id === unit.id ? 'bg-red-900/40 ring-1 ring-red-500' : ''}`}
                        onClick={() => useGameStore.getState().onCellClick(unit.position)}
                      >
                        <span className="text-red-400">{UNIT_ICONS[unit.type]}</span>
                        <span className="flex-1 truncate">{unit.name}</span>
                        <span className="text-amber-400 text-[9px]">Lv.{unit.level || 1}</span>
                        {unit.killCount > 0 && <span className="text-red-400 text-[9px]">💀{unit.killCount}</span>}
                        {(unit.canMove || unit.canAttack) && (
                          <span className="flex items-center gap-0.5">
                            {unit.canMove && <span className="text-[8px] text-green-400">👣</span>}
                            {unit.canAttack && <span className="text-[8px] text-red-400">⚔️</span>}
                          </span>
                        )}
                        <span className={hpColorFn(unit.stats.hp, unit.stats.maxHp)}>{unit.stats.hp}</span>
                      </div>
                    ))}
                  </div>
                </div>
                <Separator className="bg-white/10" />
                <div>
                  <div className="text-[10px] text-blue-400 mb-0.5 font-medium">🔵 蓝方 {filteredBlueUnits.length}存活 {blueLost > 0 ? `/${blueLost}损失` : ''}</div>
                  <div className="space-y-0.5 max-h-28 overflow-y-auto">
                    {filteredBlueUnits.map(unit => (
                      <div
                        key={unit.id}
                        className={`flex items-center gap-1 px-1 py-0.5 rounded text-[10px] cursor-pointer hover:bg-blue-900/30 ${selectedUnit?.id === unit.id ? 'bg-blue-900/40 ring-1 ring-blue-500' : ''}`}
                        onClick={() => useGameStore.getState().onCellClick(unit.position)}
                      >
                        <span className="text-blue-400">{UNIT_ICONS[unit.type]}</span>
                        <span className="flex-1 truncate">{unit.name}</span>
                        <span className="text-amber-400 text-[9px]">Lv.{unit.level || 1}</span>
                        {unit.killCount > 0 && <span className="text-red-400 text-[9px]">💀{unit.killCount}</span>}
                        {(unit.canMove || unit.canAttack) && currentFaction === 'blue' && (
                          <span className="flex items-center gap-0.5">
                            {unit.canMove && <span className="text-[8px] text-green-400">👣</span>}
                            {unit.canAttack && <span className="text-[8px] text-red-400">⚔️</span>}
                          </span>
                        )}
                        <span className={hpColorFn(unit.stats.hp, unit.stats.maxHp)}>{unit.stats.hp}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </ScrollArea>
          )}
        </div>
      </div>
    </div>
  );
});


// v82.0: Error boundary to catch and display render errors for debugging
class GameUIErrorBoundary extends React.Component<{ children: React.ReactNode }, { hasError: boolean; error: Error | null }> {
  state = { hasError: false, error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="fixed inset-0 z-[999] bg-red-950/95 flex flex-col items-center justify-center text-white p-8">
          <div className="text-xl font-bold mb-4">GameUI 渲染错误</div>
          <div className="text-sm text-red-200 mb-2 font-mono break-all">{this.state.error?.message}</div>
          {/* v89.0: Only show stack trace in development — don't leak implementation details in production */}
          {process.env.NODE_ENV === 'development' && (
            <div className="text-xs text-red-300 font-mono break-all max-h-[60vh] overflow-auto">{this.state.error?.stack}</div>
          )}
          <div className="mt-4 text-xs text-red-300">请刷新页面重试</div>
        </div>
      );
    }
    return this.props.children;
  }
}

// Wrapper component: GameUIInner wrapped in error boundary for crash diagnostics
export default function GameUI() {
  return (
    <GameUIErrorBoundary>
      <GameUIInner />
    </GameUIErrorBoundary>
  );
}

function GameUIInner() {
  // v50.0: Replace full-store subscription with useShallow selector covering all used fields
  // Previously: `const state = useGameStore()` — caused re-render on EVERY store mutation
  const state = useGameStore(useShallow(s => ({
    currentFaction: s.currentFaction, turn: s.turn, phase: s.phase,
    selectedUnit: s.selectedUnit, combatLog: s.combatLog, winner: s.winner,
    isAiProcessing: s.isAiProcessing, isAnimating: s.isAnimating, units: s.units,
    hoveredCell: s.hoveredCell, shakeActive: s.shakeActive,
    lastTurnSummary: s.lastTurnSummary, previousState: s.previousState,
    turnTransition: s.turnTransition, showShortcuts: s.showShortcuts,
    combatToasts: s.combatToasts, capturePoints: s.capturePoints,
    victoryReason: s.victoryReason, movementAnimation: s.movementAnimation,
    gameStartTime: s.gameStartTime, previousTurnState: s.previousTurnState,
    // Fields accessed via state.XXX in JSX/logic:
    deployment: s.deployment, selectedDeploymentType: s.selectedDeploymentType,
    battleStats: s.battleStats, aiDifficulty: s.aiDifficulty,
    isStrategicTacticalBattle: s.isStrategicTacticalBattle,
    map: s.map, currentWeather: s.currentWeather, weatherTurnsRemaining: s.weatherTurnsRemaining, isPaused: s.isPaused,
    replayState: s.replayState, tutorialEnabled: s.tutorialEnabled,
    tutorialStep: s.tutorialStep, levelUpNotifications: s.levelUpNotifications,
    attackablePositions: s.attackablePositions, reinforcements: s.reinforcements,
    reinforcementBudget: s.reinforcementBudget, mapType: s.mapType,
    // v67.0: Kill streak tracking
    turnKillCounts: s.turnKillCounts,
    // v72.0: Deploy error toast
    deployErrorToast: s.deployErrorToast,
    // v84.0: Hovered move path for path distance display
    hoveredMovePath: s.hoveredMovePath,
    // Move-phase damage preview
    movablePositions: s.movablePositions,
    // v88.0: Toolbar overlay toggles (reactive state for button active styling)
    showArmyRoster: s.showArmyRoster,
    showDefenseOverlay: s.showDefenseOverlay,
    showThreatOverlay: s.showThreatOverlay,
  })));
  // v31.0: Merge hero selection selectors with useShallow
  const {
    gameSpeed, comparingUnit, heroPhase, selectedHeroId,
    heroSelectionMode, heroTargetingAbilityId,
  } = useGameStore(useShallow(s => ({
    gameSpeed: s.gameSpeed,
    comparingUnit: s.comparingUnit,
    heroPhase: s.heroPhase,
    selectedHeroId: s.selectedHeroId,
    heroSelectionMode: s.heroSelectionMode,
    heroTargetingAbilityId: s.heroTargetingAbilityId,
  })));
  const selectHero = useGameStore(s => s.selectHero);
  const confirmHeroSelection = useGameStore(s => s.confirmHeroSelection);
  const heroAbilityUse = useGameStore(s => s.heroAbilityUse);
  const cancelHeroTargeting = useGameStore(s => s.cancelHeroTargeting);
  const {
    currentFaction, turn, phase, selectedUnit,
    combatLog, winner, isAiProcessing, isAnimating, units,
    hoveredCell, shakeActive, lastTurnSummary, previousState,
    turnTransition, showShortcuts, combatToasts,
    capturePoints, victoryReason, movementAnimation, gameStartTime,
    previousTurnState,
  } = state;

  // Hero selection state
  const isHeroSelection = phase === 'heroSelection';
  const redHeroes = getHeroesForFaction('red');
  const blueHeroes = getHeroesForFaction('blue');

  // Deployment phase state
  const isDeployment = phase === 'deployment';
  const deployment = state.deployment;
  const selectedDeploymentType = state.selectedDeploymentType;
  const redBudget = deployment ? TACTICAL_DEPLOYMENT_BUDGET - deployment.redBudgetUsed : 0;
  const redDeployedUnits = units.filter(u => u.faction === 'red');

  // Panel collapse states
  const [unitInfoOpen, setUnitInfoOpen] = useState(true);
  const [leftBottomBarTab, setLeftBottomBarTab] = useState<LeftBottomBarTabId>('action');
  const [combatLogOpen, setCombatLogOpen] = useState(false);
  const [combatLogFilter, setCombatLogFilter] = useState<'all' | 'attack' | 'movement' | 'special' | 'destroy'>('all');
  // v84.0: Track unread combat log entries
  const lastSeenLogCountRef = useRef(combatLog.length);
  const [unreadLogCount, setUnreadLogCount] = useState(0);
  useEffect(() => {
    if (combatLogOpen) {
      lastSeenLogCountRef.current = combatLog.length;
      setUnreadLogCount(0);
    } else if (combatLog.length > lastSeenLogCountRef.current) {
      setUnreadLogCount(combatLog.length - lastSeenLogCountRef.current);
    }
  }, [combatLog.length, combatLogOpen]);
  const [mapLegendOpen, setMapLegendOpen] = useState(false);
  const [bottomTab, setBottomTab] = useState<'log' | 'legend' | 'unit'>('log');
  const [showActionHistory, setShowActionHistory] = useState(true);
  const [showSavePanel, setShowSavePanel] = useState(false);
  const showSavePanelRef = useRef(false);
  useEffect(() => { showSavePanelRef.current = showSavePanel; }, [showSavePanel]);
  const [saveToast, setSaveToast] = useState<string | null>(null);
  const [undoToast, setUndoToast] = useState(false);
  const [deployErrorToast, setDeployErrorToast] = useState<string | null>(null);
  const [showSettingsPanel, setShowSettingsPanel] = useState(false);
  const showSettingsPanelRef = useRef(false);
  useEffect(() => { showSettingsPanelRef.current = showSettingsPanel; }, [showSettingsPanel]);
  const [showEndTurnConfirm, setShowEndTurnConfirm] = useState(false);
  // v91.0: Retreat confirmation dialog state
  const [showRetreatConfirm, setShowRetreatConfirm] = useState(false);
  // v79.0: Auto-dismiss end turn confirm after 5s
  useEffect(() => {
    if (!showEndTurnConfirm) return;
    const timer = setTimeout(() => setShowEndTurnConfirm(false), 5000);
    return () => clearTimeout(timer);
  }, [showEndTurnConfirm]);
  const [showAchievementBrowser, setShowAchievementBrowser] = useState(false);
  const [showAdvisor, setShowAdvisor] = useState(false);
  const [advisorAdvice, setAdvisorAdvice] = useState('');
  const advisorAdviceRef = useRef('');
  // v91.0: Keep showAdvisor ref in sync for Escape key handler
  const showAdvisorRef = useRef(false);
  useEffect(() => { showAdvisorRef.current = showAdvisor; }, [showAdvisor]);
  // Keep ref in sync to avoid stale closure in keyboard handler
  useEffect(() => { advisorAdviceRef.current = advisorAdvice; }, [advisorAdvice]);
  const [advisorLoading, setAdvisorLoading] = useState(false);
  const [advisorQuestion, setAdvisorQuestion] = useState('');
  const [advisorHistory, setAdvisorHistory] = useState<{ question: string; answer: string; timestamp: number }[]>([]);
  const [achievementNotifications, setAchievementNotifications] = useState<Achievement[]>([]);
  const [playerStats, setPlayerStats] = useState<PlayerStats | null>(null);
  const achievementProcessedRef = useRef(false);
  const [settings, setSettings] = useState(() => {
    if (typeof window === 'undefined') return { ...DEFAULT_SETTINGS };
    try {
      const saved = localStorage.getItem('iron-chess-settings');
      return saved ? { ...DEFAULT_SETTINGS, ...JSON.parse(saved) } : { ...DEFAULT_SETTINGS };
    } catch { return { ...DEFAULT_SETTINGS }; }
  });
  const updateSetting = useCallback((key: string, value: unknown) => {
    setSettings(prev => {
      const next = { ...prev, [key]: value };
      try { localStorage.setItem('iron-chess-settings', JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }, []);

  // v27.0: Auto-end-turn detection — all player units exhausted
  const allUnitsExhausted = useMemo(() => {
    if (currentFaction !== 'red' || phase === 'aiTurn' || phase === 'gameOver' || phase === 'heroSelection' || phase === 'deployment') return false;
    const aliveUnits = units.filter(u => u.faction === 'red' && u.isAlive);
    return aliveUnits.length > 0 && aliveUnits.every(u => !u.canMove && !u.canAttack);
  }, [currentFaction, phase, units]);

  // v50.0: Auto-end-turn countdown when all units exhausted (3-second delay with toast)
  // v51.0: Guard against double-trigger when player manually ends turn during countdown
  // v76.0: Refactored to use ref-based counter to avoid effect re-entrancy bug
  const [autoEndCountdown, setAutoEndCountdown] = useState<number | null>(null);
  const autoEndIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const allUnitsExhaustedRef = useRef(allUnitsExhausted);
  useEffect(() => { allUnitsExhaustedRef.current = allUnitsExhausted; }, [allUnitsExhausted]);
  const isAiProcessingRef = useRef(isAiProcessing);
  useEffect(() => { isAiProcessingRef.current = isAiProcessing; }, [isAiProcessing]);
  useEffect(() => {
    if (allUnitsExhausted && !isAiProcessing) {
      // Start countdown using ref-based approach to avoid re-entrancy
      setAutoEndCountdown(3);
      let count = 3;
      autoEndIntervalRef.current = setInterval(() => {
        count--;
        if (count <= 0) {
          if (autoEndIntervalRef.current) clearInterval(autoEndIntervalRef.current);
          autoEndIntervalRef.current = null;
          // Double-check phase and exhaustion state before ending turn
          if (allUnitsExhaustedRef.current && !isAiProcessingRef.current) {
            const s = useGameStore.getState();
            if (s.phase === 'selectUnit' && s.currentFaction === 'red' && !s.isAiProcessing && !s.isPaused) {
              s.onEndTurn();
            }
          }
          setAutoEndCountdown(null);
        } else {
          setAutoEndCountdown(count);
        }
      }, 1000);
    } else if (!allUnitsExhausted && autoEndIntervalRef.current) {
      // Player made a move/undo — cancel countdown
      if (autoEndIntervalRef.current) clearInterval(autoEndIntervalRef.current);
      autoEndIntervalRef.current = null;
      setAutoEndCountdown(null);
    }
    return () => {
      if (autoEndIntervalRef.current) clearInterval(autoEndIntervalRef.current);
    };
  }, [allUnitsExhausted, isAiProcessing]);

  // v52.0: Auto-select next idle unit when enabled in settings
  useEffect(() => {
    if (!settings.autoSelectNextUnit) return;
    const phase = useGameStore.getState().phase;
    const currentFaction = useGameStore.getState().currentFaction;
    const isAiProcessing = useGameStore.getState().isAiProcessing;
    if (phase !== 'selectUnit' || currentFaction !== 'red' || isAiProcessing) return;

    const state = useGameStore.getState();
    const allUnitsExhausted = state.units.filter(u => u.faction === 'red' && u.isAlive).every(u => !u.canMove && !u.canAttack);
    if (allUnitsExhausted) return;

    // Find next actionable unit (not already selected)
    const nextUnit = state.units.find(u =>
      u.faction === 'red' && u.isAlive && (u.canMove || u.canAttack) && (!state.selectedUnit || u.id !== state.selectedUnit.id)
    );

    if (nextUnit) {
      const timer = setTimeout(() => {
        const s = useGameStore.getState();
        if (s.phase === 'selectUnit' && s.currentFaction === 'red' && !s.isAiProcessing &&
            s.selectedUnit?.id !== nextUnit.id) {
          s.focusOnUnit(nextUnit.id);
        }
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [settings.autoSelectNextUnit, phase, currentFaction, isAiProcessing, selectedUnit]);

  // v65.0: Auto-end-turn when all friendly units have exhausted actions
  // v75.0: REMOVED duplicate auto-end-turn effect — the v50 countdown (above) already handles this.
  // The v65 effect was causing a race condition where onEndTurn() could fire from either mechanism.
  // The v50 countdown is superior (shows countdown, allows cancellation on undo).

  // Sync settings to window globals for GameScene access + apply volume on mount
  useEffect(() => {
    try {
      (window as any).__ironChessSettings = settings;
      import('@/game/audio').then(({ setVolume }) => {
        setVolume(settings.volume / 100);
      }).catch(() => {});
    } catch {}
  }, [settings]);

  // Unit filter state (Feature 5)
  const [unitFilter, setUnitFilter] = useState<UnitType | null>(null);

  // Shift key + cursor tooltip state (Feature 6)
  // v76.0: cursorPos uses ref + direct DOM manipulation to avoid per-frame re-renders
  const [shiftHeld, setShiftHeld] = useState(false);
  const cursorTooltipRef = useRef<HTMLDivElement>(null);

  // Notification Center state (v23.0)
  const [showNotificationCenter, setShowNotificationCenter] = useState(false);
  const showNotificationCenterRef = useRef(false);
  useEffect(() => { showNotificationCenterRef.current = showNotificationCenter; }, [showNotificationCenter]);
  const [gameNotifications, setGameNotifications] = useState<GameNotification[]>([]);
  const notifIdRef = useRef(0);
  const addNotification = useCallback((notif: Omit<GameNotification, 'id' | 'timestamp' | 'read'>) => {
    const id = `notif-${++notifIdRef.current}-${Date.now()}`;
    setGameNotifications(prev => [{
      ...notif,
      id,
      timestamp: Date.now(),
      read: false,
    }, ...prev].slice(0, 100)); // Keep max 100 notifications
  }, []);
  const markAllNotificationsRead = useCallback(() => {
    setGameNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }, []);
  const clearAllNotifications = useCallback(() => {
    setGameNotifications([]);
  }, []);

  // Casualty Report state (v23.0)
  const [showCasualtyReport, setShowCasualtyReport] = useState(false);
  const [casualties, setCasualties] = useState<CasualtyEntry[]>([]);
  const processedDeathIdsRef = useRef<Set<string>>(new Set());

  // Casualty Report: track destroyed units (v23.0)
  useEffect(() => {
    const deadUnits = units.filter(u => !u.isAlive && !processedDeathIdsRef.current.has(u.id));
    if (deadUnits.length === 0) return;
    const newEntries: CasualtyEntry[] = deadUnits.map(u => {
      // v89.0: Use defenderUnitId for accurate killer matching (name/type is ambiguous with duplicates)
      const relatedLog = (state.combatLog || []).find((log: CombatLogEntry) =>
        log.defenderUnitId === u.id
      );
      return {
        unitId: u.id,
        unitType: u.type,
        unitName: u.name || UNIT_CONFIGS[u.type as keyof typeof UNIT_CONFIGS]?.name || u.type,
        faction: u.faction as 'red' | 'blue',
        level: u.level || 1,
        killerName: relatedLog ? relatedLog.attacker : undefined,
        killerType: undefined,
        turnDestroyed: turn,
      };
    });
    if (newEntries.length > 0) {
      deadUnits.forEach(u => processedDeathIdsRef.current.add(u.id));
      setCasualties(prev => [...prev, ...newEntries]);
    }
  }, [units, turn, state.combatLog]);
  const [mousePos, setMousePos] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  // v50.0: Throttle mousePos updates to ~30fps instead of every mousemove event (~300fps)
  const mousePosRafRef = useRef<number | null>(null);
  const mousePosRef = useRef({ x: 0, y: 0 });
  const updateMousePosRef = useRef((x: number, y: number) => {
    mousePosRef.current = { x, y };
    if (!mousePosRafRef.current) {
      mousePosRafRef.current = requestAnimationFrame(() => {
        setMousePos({ ...mousePosRef.current });
        mousePosRafRef.current = null;
      });
    }
  });

  // Game timer state (Enhancement 1)
  const [elapsedTime, setElapsedTime] = useState('00:00');

  // Turn timer state
  const [turnElapsed, setTurnElapsed] = useState(0);
  const turnStartTimeRef = useRef<number>(Date.now());
  const turnTimeLimitRef = useRef<number | null>(null); // in ms, null = unlimited

  // Get turn time limit from settings
  useEffect(() => {
    const limit = (settings as Record<string, unknown>).turnTimeLimit as number | undefined;
    turnTimeLimitRef.current = (limit && limit > 0) ? limit * 1000 : null;
  }, [settings]);

  // Reset turn timer when turn changes
  useEffect(() => {
    turnStartTimeRef.current = Date.now();
    setTurnElapsed(0);
  }, [turn]);

  // Tick turn timer every second, pause during AI, auto-end on countdown expire
  const timerWarningRef = useRef(false); // v49.0: track if warning beep already played this turn
  const audioCtxRef = useRef<AudioContext | null>(null); // v83: reuse single AudioContext
  const audioCtxCloseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null); // v83: track pending close
  const innerBeepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null); // track nested setTimeout for second warning beep
  useEffect(() => {
    const interval = setInterval(() => {
      if (!isAiProcessing && !isAnimating && phase !== 'gameOver' && phase !== 'deployment' && !useGameStore.getState().isPaused) {
        const elapsed = Date.now() - turnStartTimeRef.current;
        setTurnElapsed(elapsed);
        // v49.0: Audio warning when timer drops to 10 seconds
        if (turnTimeLimitRef.current && currentFaction === 'red') {
          const remaining = turnTimeLimitRef.current - elapsed;
          if (remaining <= 10000 && remaining > 0 && !timerWarningRef.current) {
            timerWarningRef.current = true;
            try {
              // v83: reuse single AudioContext, resume if suspended
              if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
                audioCtxRef.current = new AudioContext();
              }
              const ctx = audioCtxRef.current;
              if (ctx.state === 'suspended') ctx.resume();
              const osc = ctx.createOscillator();
              const gain = ctx.createGain();
              osc.connect(gain);
              gain.connect(ctx.destination);
              osc.frequency.value = 880;
              gain.gain.value = 0.15;
              osc.start(ctx.currentTime);
              osc.stop(ctx.currentTime + 0.15);
              // Second beep
              if (innerBeepTimerRef.current) clearTimeout(innerBeepTimerRef.current);
              innerBeepTimerRef.current = setTimeout(() => {
                try {
                  if (ctx.state === 'closed') return;
                  const osc2 = ctx.createOscillator();
                  const gain2 = ctx.createGain();
                  osc2.connect(gain2);
                  gain2.connect(ctx.destination);
                  osc2.frequency.value = 660;
                  gain2.gain.value = 0.15;
                  osc2.start(ctx.currentTime);
                  osc2.stop(ctx.currentTime + 0.2);
                } catch {}
                // v83: schedule AudioContext close (tracked for cleanup)
                if (audioCtxCloseTimerRef.current) clearTimeout(audioCtxCloseTimerRef.current);
                audioCtxCloseTimerRef.current = setTimeout(() => { try { ctx.close(); } catch {} }, 300);
              }, 200);
            } catch {}
          }
        }
        // Auto-end turn when countdown expires (only for red player)
        if (turnTimeLimitRef.current && elapsed >= turnTimeLimitRef.current && currentFaction === 'red') {
          const storeState = useGameStore.getState();
          if (storeState.phase !== 'gameOver' && !storeState.isAiProcessing) {
            storeState.onEndTurn();
            addNotification({ type: 'system', title: '回合超时', description: `回合时间 ${Math.floor(turnTimeLimitRef.current / 1000)} 秒已到，自动结束回合`, icon: <Timer className="w-3.5 h-3.5" />, priority: 'high' });
          }
        }
      }
    }, 1000);
    return () => {
      clearInterval(interval);
      // v83: clean up pending AudioContext close timeout
      if (audioCtxCloseTimerRef.current) {
        clearTimeout(audioCtxCloseTimerRef.current);
        audioCtxCloseTimerRef.current = null;
      }
      // Clean up nested setTimeout for second warning beep
      if (innerBeepTimerRef.current) {
        clearTimeout(innerBeepTimerRef.current);
        innerBeepTimerRef.current = null;
      }
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        try { audioCtxRef.current.close(); } catch {}
        audioCtxRef.current = null;
      }
    };
  }, [isAiProcessing, isAnimating, phase, currentFaction, addNotification]);

  // v49.0: Reset timer warning flag when turn changes
  useEffect(() => {
    timerWarningRef.current = false;
  }, [turn]);

  // Capture points snapshot before turn (Feature 1)
  const capturePointsBeforeRef = useRef<Record<string, string | null> | undefined>(undefined);

  // Weather change notification toast
  const [weatherToast, setWeatherToast] = useState<{ icon: string; name: string; description: string } | null>(null);
  const prevWeatherRef = useRef<string | null>(null);
  const currentWeather = state.currentWeather ?? 'clear';
  useEffect(() => {
    if (prevWeatherRef.current !== null && prevWeatherRef.current !== currentWeather) {
      const wConfig = WEATHER_CONFIGS[currentWeather as keyof typeof WEATHER_CONFIGS];
      if (wConfig && currentWeather !== 'clear') {
        setWeatherToast({ icon: wConfig.icon, name: wConfig.name, description: wConfig.description });
        addNotification({ type: 'weather', title: `天气变化: ${wConfig.name}`, description: wConfig.description, icon: <Waves className="w-3.5 h-3.5" />, priority: 'normal' });
        const timer = setTimeout(() => setWeatherToast(null), 3500);
        return () => clearTimeout(timer);
      } else if (wConfig) {
        setWeatherToast({ icon: wConfig.icon, name: wConfig.name, description: '天气恢复正常' });
        addNotification({ type: 'weather', title: '天气恢复', description: '天气已恢复正常，所有属性加成消除', icon: <Sun className="w-3.5 h-3.5" />, priority: 'low' });
        const timer = setTimeout(() => setWeatherToast(null), 2500);
        return () => clearTimeout(timer);
      }
    }
    prevWeatherRef.current = currentWeather;
  }, [currentWeather, addNotification]);

  // Combat notification tracking (v23.0)
  const combatToastIdRef = useRef(0);
  // v92.0: Kill streak banner state
  const [killStreakBanner, setKillStreakBanner] = useState<{ label: string; icon: string; attackerName: string; key: number } | null>(null);
  const killStreakKeyRef = useRef(0);
  const prevStreakToastIdRef = useRef<number | null>(null);

  useEffect(() => {
    if (!combatToasts || combatToasts.length === 0) return;
    const latestToast = combatToasts[combatToasts.length - 1];
    if (latestToast.id <= combatToastIdRef.current) return;
    combatToastIdRef.current = latestToast.id;
    if (latestToast.wasKill) {
      const isHeroKill = latestToast.defenderName.includes('英雄') || latestToast.defenderName.includes('Hero');
      addNotification({
        type: 'combat',
        title: isHeroKill
          ? `🎯 ${latestToast.attackerName} 击杀敌方英雄!`
          : `${latestToast.attackerName} 击毁 ${latestToast.defenderName}`,
        description: `造成 ${latestToast.damage} 点伤害，目标被摧毁`,
        icon: isHeroKill ? <Trophy className="w-3.5 h-3.5 text-yellow-400" /> : <Skull className="w-3.5 h-3.5" />,
        priority: isHeroKill ? 'critical' : 'high',
      });
      // v92.0: Kill streak detection — show center-screen banner for 3+ kills in one turn
      if (latestToast.attackerKillCount !== undefined && latestToast.attackerKillCount >= 3 && latestToast.id !== prevStreakToastIdRef.current) {
        prevStreakToastIdRef.current = latestToast.id;
        const streak = getKillStreakLabel(latestToast.attackerKillCount);
        if (streak) {
          killStreakKeyRef.current++;
          setKillStreakBanner({
            label: streak.label,
            icon: streak.icon,
            attackerName: latestToast.attackerName,
            key: killStreakKeyRef.current,
          });
          setTimeout(() => setKillStreakBanner(null), 2000);
        }
      }
    } else {
      addNotification({
        type: 'combat',
        title: `${latestToast.attackerName} → ${latestToast.defenderName}`,
        description: `造成 ${latestToast.damage} 伤害，剩余 HP: ${latestToast.defenderRemainingHp}${latestToast.counterDamage ? ` | 反击: ${latestToast.counterDamage}` : ''}`,
        icon: <Crosshair className="w-3.5 h-3.5" />,
        priority: 'normal',
      });
    }
  }, [combatToasts, addNotification]);

  // v72.0: Sync deploy error toast from store
  const prevDeployErrorRef = useRef<string | null>(null);
  useEffect(() => {
    if (state.deployErrorToast && state.deployErrorToast !== prevDeployErrorRef.current) {
      prevDeployErrorRef.current = state.deployErrorToast;
      setDeployErrorToast(state.deployErrorToast);
      useGameStore.getState().dismissDeployErrorToast();
      const tid = setTimeout(() => {
        setDeployErrorToast(null);
        prevDeployErrorRef.current = null;
      }, 2500);
      return () => clearTimeout(tid);
    }
  }, [state.deployErrorToast]);

  // v67.0: Kill streak notification
  const prevKillCountRef = useRef<{ red: number; blue: number }>({ red: 0, blue: 0 });
  useEffect(() => {
    if (!state.turnKillCounts) return;
    const faction = currentFaction;
    const kills = state.turnKillCounts[faction] || 0;
    const prevKills = prevKillCountRef.current[faction] || 0;
    if (kills > prevKills && kills >= 2) {
      const streak = getKillStreakLabel(kills);
      if (streak) {
        addNotification({
          type: 'achievement',
          title: `${streak.icon} ${streak.label}!`,
          description: `本回合已击毁 ${kills} 个敌方单位`,
          icon: <Flame className="w-3.5 h-3.5 text-orange-400" />,
          priority: kills >= 3 ? 'critical' : 'high',
        });
      }
    }
    prevKillCountRef.current = { ...state.turnKillCounts };
  }, [state.turnKillCounts, currentFaction, addNotification]);

  // v82.0: Reinforcement arrival notification — detect unit count increase per faction
  const prevRedCountRef = useRef(0);
  const prevBlueCountRef = useRef(0);
  const [reinforcementNotif, setReinforcementNotif] = useState<{faction: string; count: number} | null>(null);
  const reinforcementTimerRef = useRef<number>(0);
  useEffect(() => {
    const redCount = units.filter(u => u.faction === 'red' && u.isAlive).length;
    const blueCount = units.filter(u => u.faction === 'blue' && u.isAlive).length;
    if (redCount > prevRedCountRef.current && prevRedCountRef.current > 0) {
      setReinforcementNotif({ faction: 'red', count: redCount - prevRedCountRef.current });
      clearTimeout(reinforcementTimerRef.current);
      reinforcementTimerRef.current = window.setTimeout(() => setReinforcementNotif(null), 3000);
    }
    if (blueCount > prevBlueCountRef.current && prevBlueCountRef.current > 0) {
      setReinforcementNotif({ faction: 'blue', count: blueCount - prevBlueCountRef.current });
      clearTimeout(reinforcementTimerRef.current);
      reinforcementTimerRef.current = window.setTimeout(() => setReinforcementNotif(null), 3000);
    }
    prevRedCountRef.current = redCount;
    prevBlueCountRef.current = blueCount;
    return () => clearTimeout(reinforcementTimerRef.current);
  }, [units]);

  // v82.0: Weather transition full-screen overlay effect
  const prevOverlayWeatherRef = useRef<string | null>(null);
  const [weatherTransition, setWeatherTransition] = useState<string | null>(null);
  useEffect(() => {
    const current = state.currentWeather || 'clear';
    if (prevOverlayWeatherRef.current !== null && prevOverlayWeatherRef.current !== current && current !== 'clear') {
      setWeatherTransition(current);
      const timer = setTimeout(() => setWeatherTransition(null), 2500);
      return () => clearTimeout(timer);
    }
    prevOverlayWeatherRef.current = current;
  }, [state.currentWeather]);

  // v31.0: Merge sound/pause state with useShallow
  const { isMuted, isPaused } = useGameStore(useShallow(s => ({
    isMuted: s.isMuted,
    isPaused: s.isPaused,
  })));

  // ===== Achievement & Stats Tracking on Game Over =====
  useEffect(() => {
    if (phase === 'gameOver' && !achievementProcessedRef.current) {
      achievementProcessedRef.current = true;
      const redStats = state.battleStats.red;
      const isWin = winner === 'red';
      const isDraw = !winner;
      const result: GameResult = {
        won: isWin,
        isDraw: isDraw,
        turns: turn,
        kills: redStats.kills,
        losses: redStats.unitsLost,
        damageDealt: redStats.damageDealt,
        damageReceived: redStats.damageReceived,
        healing: redStats.healingDone,
        fortsBuilt: redStats.fortsBuilt,
        retreats: redStats.retreated,
        difficulty: state.aiDifficulty,
        isStrategic: state.isStrategicTacticalBattle,
        remainingUnits: units.filter(u => u.faction === 'red' && u.isAlive).length,
      };
      const previousStats = loadPlayerStats();
      const updatedStats = updateStatsAfterGame(previousStats, result);
      savePlayerStats(updatedStats);
      setPlayerStats(updatedStats);
      const newlyUnlocked = getNewlyUnlocked(previousStats.achievements, updatedStats.achievements);
      if (newlyUnlocked.length > 0) {
        // Stagger notifications
        setAchievementNotifications(newlyUnlocked);
        newlyUnlocked.forEach(ach => {
          addNotification({ type: 'achievement', title: `成就解锁: ${ach.name}`, description: ach.description, icon: <Trophy className="w-3.5 h-3.5" />, priority: 'high' });
        });
      }
    }
    // Reset the processed flag when game is not over
    if (phase !== 'gameOver') {
      achievementProcessedRef.current = false;
    }
  }, [phase, winner, turn, state.battleStats, state.aiDifficulty, state.isStrategicTacticalBattle, units]);

  // v68.0: Auto-save failure toast notification
  useEffect(() => {
    const handler = () => {
      addNotification({
        type: 'system',
        title: '自动保存失败',
        description: '游戏进度未能自动保存，请手动保存 (Ctrl+S)',
        icon: <AlertTriangle className="w-3.5 h-3.5 text-red-400" />,
        priority: 'high',
      });
    };
    window.addEventListener('autosave-failed', handler);
    return () => window.removeEventListener('autosave-failed', handler);
  }, [addNotification]);

  // Load player stats when opening achievement browser
  useEffect(() => {
    if (showAchievementBrowser && !playerStats) {
      setPlayerStats(loadPlayerStats());
    }
  }, [showAchievementBrowser, playerStats]);

  // AI 战术顾问请求
  const advisorLoadingRef = useRef(false);
  const requestAdvisor = useCallback(async (customQuestion?: string) => {
    if (advisorLoadingRef.current) return;
    advisorLoadingRef.current = true;
    setAdvisorLoading(true);
    setAdvisorAdvice('');
    try {
      const currentState = useGameStore.getState();
      // 只发送必要的状态数据，避免发送大量不必要字段
      const minimalState = {
        turn: currentState.turn,
        currentFaction: currentState.currentFaction,
        phase: currentState.phase,
        weather: currentState.currentWeather,
        units: currentState.units.map(u => ({
          id: u.id, type: u.type, faction: u.faction, hp: u.stats.hp, maxHp: u.stats.maxHp,
          position: u.position, canMove: u.canMove, canAttack: u.canAttack,
          isHero: u.isHero, isAlive: u.isAlive,
        })),
        capturePoints: currentState.capturePoints?.map(cp => ({
          position: cp.position, owner: cp.owner, captureProgress: cp.captureProgress,
        })),
        map: {
          cells: (currentState.map?.cells || []).map(row => 
            row.map(cell => ({ terrain: cell.terrain, position: cell.position, fortified: cell.fortified }))
          ),
        },
      };
      const res = await fetch('/api/advisor', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ gameState: minimalState, question: customQuestion || undefined }),
      });
      const data = await res.json();
      if (data.advice) {
        setAdvisorAdvice(data.advice);
        setAdvisorHistory(prev => [{
          question: customQuestion || '分析局势',
          answer: data.advice,
          timestamp: Date.now(),
        }, ...prev].slice(0, 10));
      }
    } catch {
      setAdvisorAdvice('⚠️ 连接顾问失败，请检查网络后重试。');
    } finally {
      setAdvisorLoading(false);
      advisorLoadingRef.current = false;
    }
  }, []);

  // Auto-clear shake after animation
  useEffect(() => {
    if (shakeActive) {
      const timer = setTimeout(() => {
        useGameStore.getState().clearShake();
      }, 400);
      return () => clearTimeout(timer);
    }
  }, [shakeActive]);

  // Game start notification (v23.0)
  const gameStartNotifRef = useRef(false);
  useEffect(() => {
    if (gameStartTime && !gameStartNotifRef.current && (phase === 'selectUnit' || phase === 'moveUnit')) {
      gameStartNotifRef.current = true;
      addNotification({ type: 'system', title: '战斗开始', description: `难度: ${state.aiDifficulty === 'easy' ? '简单' : state.aiDifficulty === 'normal' ? '中等' : '困难'} | 地图: ${state.mapType}`, icon: <Swords className="w-3.5 h-3.5" />, priority: 'normal' });
    }
    if (phase === 'gameOver') gameStartNotifRef.current = false;
  }, [gameStartTime, phase, state.aiDifficulty, state.mapType, addNotification]);

  // Game timer tick (Enhancement 1)
  useEffect(() => {
    if (!gameStartTime) return;
    const update = () => setElapsedTime(formatElapsedTime(Date.now() - gameStartTime));
    update();
    const interval = setInterval(update, 1000);
    return () => clearInterval(interval);
  }, [gameStartTime]);

  const redUnits = units.filter(u => u.faction === 'red' && u.isAlive);
  const blueUnits = units.filter(u => u.faction === 'blue' && u.isAlive);
  const redLost = units.filter(u => u.faction === 'red' && !u.isAlive).length;
  const blueLost = units.filter(u => u.faction === 'blue' && !u.isAlive).length;

  // Get hovered cell's unit for comparison
  const hoveredUnit = hoveredCell ? 
    state.map?.cells?.[hoveredCell.z]?.[hoveredCell.x]?.unit : null;
  const showComparison = selectedUnit && hoveredUnit && hoveredUnit.isAlive && hoveredUnit.id !== selectedUnit.id;

  const handleDismissSummary = useCallback(() => {
    useGameStore.getState().dismissTurnSummary();
  }, []);

  // Snapshot capture points before turn changes (Feature 1)
  useEffect(() => {
    if (lastTurnSummary && !capturePointsBeforeRef.current) {
      capturePointsBeforeRef.current = Object.fromEntries(
        capturePoints.map(cp => [cp.id, cp.owner])
      );
    }
    if (!lastTurnSummary) {
      capturePointsBeforeRef.current = undefined;
    }
  }, [lastTurnSummary, capturePoints]);

  // Shift key handler for shortcut tooltip (Feature 6)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftHeld(true);
    };
    const handleKeyUp = (e: KeyboardEvent) => {
      if (e.key === 'Shift') setShiftHeld(false);
    };
    const handleMouseMove = (e: MouseEvent) => {
      // v76.0: Use direct DOM manipulation instead of setState for cursor position
      if (cursorTooltipRef.current) {
        cursorTooltipRef.current.style.left = `${e.clientX + 12}px`;
        cursorTooltipRef.current.style.top = `${e.clientY + 12}px`;
      }
      updateMousePosRef.current(e.clientX, e.clientY);
    };
    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('mousemove', handleMouseMove);
    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('mousemove', handleMouseMove);
      if (mousePosRafRef.current) cancelAnimationFrame(mousePosRafRef.current);
    };
  }, []);

  // Context-aware shortcuts for Shift tooltip
  const contextShortcuts = useMemo(() => {
    const common = [
      { key: 'Enter/Space', desc: '结束回合' },
      { key: 'Esc', desc: '取消选择' },
      { key: 'Tab', desc: '切换单位 (Shift+Tab 按血量排序)' },
      { key: 'Ctrl+Z', desc: '撤销操作' },
      { key: 'Ctrl+S', desc: '快速保存' },
      { key: '?', desc: '全部快捷键' },
    ];
    switch (phase) {
      case 'selectUnit':
        return [...common, { key: 'M', desc: '移动模式' }, { key: '1-0', desc: '筛选单位类型' }];
      case 'moveUnit':
        return [...common, { key: 'A', desc: '攻击模式' }, { key: 'Z', desc: '撤销移动' }];
      case 'attackUnit':
        return [...common, { key: 'Z', desc: '撤销移动' }, { key: 'W', desc: '待机' }];
      case 'aiTurn':
        return [{ key: '', desc: 'AI行动中...' }];
      default:
        return common;
    }
  }, [phase]);

  // Filtered unit lists for Force Overview (Feature 5)
  const filteredRedUnits = useMemo(() => {
    if (!unitFilter) return redUnits;
    return redUnits.filter(u => u.type === unitFilter);
  }, [redUnits, unitFilter]);
  const filteredBlueUnits = useMemo(() => {
    if (!unitFilter) return blueUnits;
    return blueUnits.filter(u => u.type === unitFilter);
  }, [blueUnits, unitFilter]);

  // Unit type counts for filter buttons
  const unitTypeCounts = useMemo(() => {
    const counts: Record<string, { red: number; blue: number }> = {};
    for (const u of units) {
      if (!u.isAlive) continue;
      if (!counts[u.type]) counts[u.type] = { red: 0, blue: 0 };
      counts[u.type][u.faction]++;
    }
    return counts;
  }, [units]);

  // ===== Keyboard Shortcuts =====
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const store = useGameStore.getState();
      
      // v61.0: Broader form element guard — prevent shortcuts in select/contenteditable
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement ||
          e.target instanceof HTMLSelectElement || (e.target as HTMLElement).isContentEditable) return;

      // v87.0: Ctrl+S quick save, Ctrl+Z undo (before showShortcuts guard so they work everywhere)
      if ((e.ctrlKey || e.metaKey) && (e.key === 's' || e.key === 'S')) {
        e.preventDefault();
        if (store.phase !== 'gameOver' && store.phase !== 'heroSelection' && store.phase !== 'deployment') {
          const slot = 1; // v91.0: Fixed — slot 0 was rejected by store (valid range is 1-3)
          store.saveGame(slot);
          setSaveToast('Ctrl+S 快速保存成功');
          setTimeout(() => setSaveToast(null), 2000);
        }
        return;
      }
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z') && !e.shiftKey) {
        e.preventDefault();
        if (store.previousState) {
          store.undoLastAction();
          setUndoToast(true);
          setTimeout(() => setUndoToast(false), 1500);
        }
        return;
      }

      // v73.0: Block ALL shortcuts when shortcuts help panel is open (prevent key leaks)
      if (store.showShortcuts) {
        if (e.key === 'Escape' || e.key === '?' || e.key === 'h' || e.key === 'H') {
          e.preventDefault();
          store.setShowShortcuts(false);
        }
        return;
      }

      if (e.key === 'c' || e.key === 'C') {
        e.preventDefault();
        // v70.0: C key has dual purpose — unit compare or coordinate toggle
        if (store.comparingUnit) {
          // Already comparing — cancel comparison
          store.setComparingUnit(null);
        } else if (store.selectedUnit && (store.phase === 'selectUnit' || store.phase === 'moveUnit' || store.phase === 'attackUnit')) {
          // Unit selected in action phase — toggle unit comparison
          store.setComparingUnit(store.selectedUnit);
        } else {
          // No unit in action phase — toggle coordinate overlay
          // v83: Read settings from localStorage to avoid stale closure
          let showCoords = false;
          try {
            const saved = localStorage.getItem('iron-chess-settings');
            if (saved) showCoords = JSON.parse(saved).showCoordinates || false;
          } catch { /* ignore */ }
          updateSetting('showCoordinates', !showCoords);
        }
        return;
      }

      if (e.key === '?') {
        e.preventDefault();
        store.setShowShortcuts(!store.showShortcuts);
        return;
      }

      // H is now used for stealth mode (unit operation), no longer for help

      // T: Toggle threat heatmap overlay
      if (e.key === 't' || e.key === 'T') {
        e.preventDefault();
        store.toggleThreatOverlay();
        return;
      }

      // D: Toggle terrain defense bonus overlay
      if (e.key === 'd' || e.key === 'D') {
        e.preventDefault();
        store.toggleDefenseOverlay();
        return;
      }

      // B: Switch to battle stats tab in left bottom bar
      if (e.key === 'b' || e.key === 'B') {
        e.preventDefault();
        setLeftBottomBarTab(prev => prev === 'stats' ? 'action' : 'stats');
        return;
      }

      // N: Toggle notification center
      if (e.key === 'n' || e.key === 'N') {
        e.preventDefault();
        setShowNotificationCenter(prev => !prev);
        return;
      }

      // L: Toggle army roster panel
      if (e.key === 'l' || e.key === 'L') {
        e.preventDefault();
        store.toggleArmyRoster();
        return;
      }

      // v73.0: showShortcuts guard moved to TOP of handler (before all key checks)

      if (e.key === 'p' || e.key === 'P') {
        e.preventDefault();
        setShowSavePanel(prev => !prev);
        return;
      }

      // Shift+A: AI Tactical Advisor
      if ((e.key === 'a' || e.key === 'A') && e.shiftKey) {
        e.preventDefault();
        setShowAdvisor(prev => { const next = !prev; if (next && !advisorAdviceRef.current) requestAdvisor(); return next; });
        return;
      }

      // Shift+M: Toggle mute
      if ((e.key === 'm' || e.key === 'M') && e.shiftKey) {
        e.preventDefault();
        store.toggleMute();
        return;
      }

      if (e.key === 'o' || e.key === 'O') {
        e.preventDefault();
        setShowSettingsPanel(prev => !prev);
        return;
      }

      if (e.key === 'Escape') {
        // v74.0: Use refs to avoid stale closure (panels opened after mount weren't closable)
        // Close local-state panels first
        if (showSavePanelRef.current) { setShowSavePanel(false); return; }
        if (showSettingsPanelRef.current) { setShowSettingsPanel(false); return; }
        if (showNotificationCenterRef.current) { setShowNotificationCenter(false); return; }
        // v91.0: Close AI Advisor panel on Escape
        if (showAdvisorRef.current) { setShowAdvisor(false); return; }
        // v74.0: Also close store-based panels
        if (store.showArmyRoster) { store.toggleArmyRoster(); return; }
        if (store.isPaused) {
          store.togglePause();
          return;
        }
        if (store.selectedUnit) {
          e.preventDefault();
          // v42.0: Cancel hero targeting if active (Escape should cancel ability targeting mode)
          if (store.heroTargetingAbilityId) {
            useGameStore.getState().cancelHeroTargeting();
          } else {
            store.onDeselect();
          }
          return;
        }
        return;
      }

      // F1 or Pause/Break: Toggle pause (v24.0)
      if (e.key === 'F1' || e.key === 'Pause') {
        e.preventDefault();
        store.togglePause();
        return;
      }

      if (store.phase === 'aiTurn' || store.phase === 'gameOver' || store.isAiProcessing) return;
      if (store.isPaused) return;
      if (store.currentFaction !== 'red') return;

      // Ctrl+Z: Undo move
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        store.onUndoMove();
        return;
      }

      switch (e.key) {
        case ' ':
        case 'Enter':
        case 'e':
        case 'E':
          e.preventDefault();
          {
            // Read settings from localStorage to avoid stale closure
            let confirmEnd = false;
            try {
              const saved = localStorage.getItem('iron-chess-settings');
              if (saved) confirmEnd = JSON.parse(saved).confirmEndTurn || false;
            } catch { /* ignore */ }
            if (confirmEnd) {
              setShowEndTurnConfirm(true);
            } else {
              store.onEndTurn();
            }
          }
          break;
        case 's':
        case 'S':
          e.preventDefault();
          if (store.phase === 'deployment' || store.phase === 'heroSelection') break;
          store.onSkipUnit();
          break;
        case 'z':
        case 'Z':
          e.preventDefault();
          if (store.previousTurnState) {
            store.undoLastAction();
            setUndoToast(true);
            setTimeout(() => setUndoToast(false), 1500);
          } else {
            store.onUndoMove();
          }
          break;
        // v40.0: Q key for hero ability activation
        case 'q':
        case 'Q':
          e.preventDefault();
          {
            const currentState = useGameStore.getState();
            if (currentState.selectedUnit && currentState.selectedUnit.isHero &&
                currentState.phase === 'selectUnit' && !currentState.isAiProcessing) {
              // Show hero ability selector (trigger via store)
              const hasActiveAbilities = currentState.selectedUnit.abilities.filter(a =>
                a.type === 'active' && a.currentCooldown <= 0
              );
              if (hasActiveAbilities.length > 0) {
                useGameStore.getState().heroAbilityUse(
                  currentState.selectedUnit.id,
                  hasActiveAbilities[0].id
                );
              }
            }
          }
          break;
        case 'Tab':
          e.preventDefault();
          if (e.shiftKey) {
            // v59.0: Shift+Tab cycles to most-damaged friendly unit
            const currentState = useGameStore.getState();
            if (currentState.phase === 'selectUnit' && !currentState.isAiProcessing) {
              const damagedUnits = currentState.units
                .filter(u => u.faction === 'red' && u.isAlive && (u.canMove || u.canAttack))
                .sort((a, b) => (a.stats.hp / a.stats.maxHp) - (b.stats.hp / b.stats.maxHp));
              if (damagedUnits.length > 0) {
                const currentIdx = currentState.selectedUnit
                  ? damagedUnits.findIndex(u => u.id === currentState.selectedUnit!.id) : -1;
                const next = damagedUnits[(currentIdx + 1) % damagedUnits.length];
                store.focusOnUnit(next.id);
              }
            } else {
              const unitName = store.cycleUnitWithCamera();
              if (unitName) {
                const currentState = useGameStore.getState();
                if (currentState.selectedUnit) {
                  const CT = 1.05; // CELL_TOTAL = CELL_SIZE + CELL_GAP
                  const ox = -(MAP_WIDTH * CT) / 2;
                  const oz = -(MAP_HEIGHT * CT) / 2;
                  useGameStore.getState().setPanCameraTarget({
                    x: ox + currentState.selectedUnit.position.x * CT + 0.5,
                    z: oz + currentState.selectedUnit.position.z * CT + 0.5,
                  });
                }
              }
            }
          } else {
            // v70.0: Plain Tab cycles through friendly units
            const currentState = useGameStore.getState();
            if (currentState.phase === 'selectUnit' && !currentState.isAiProcessing) {
              const unitName = store.cycleUnitWithCamera();
              if (unitName) {
                const st = useGameStore.getState();
                if (st.selectedUnit) {
                  const CT = 1.05;
                  const ox = -(MAP_WIDTH * CT) / 2;
                  const oz = -(MAP_HEIGHT * CT) / 2;
                  useGameStore.getState().setPanCameraTarget({
                    x: ox + st.selectedUnit.position.x * CT + 0.5,
                    z: oz + st.selectedUnit.position.z * CT + 0.5,
                  });
                }
              }
            }
          }
          break;
        case '1':
          e.preventDefault();
          store.selectUnitByType('tank');
          break;
        case '2':
          e.preventDefault();
          store.selectUnitByType('ifv');
          break;
        case '3':
          e.preventDefault();
          store.selectUnitByType('artillery');
          break;
        case '4':
          e.preventDefault();
          store.selectUnitByType('scout');
          break;
        case '5':
          e.preventDefault();
          store.selectUnitByType('infantry');
          break;
        case '6':
          e.preventDefault();
          store.selectUnitByType('sam');
          break;
        case '7':
          e.preventDefault();
          store.selectUnitByType('engineer');
          break;
        case '8':
          e.preventDefault();
          store.selectUnitByType('supply');
          break;
        case '9':
          e.preventDefault();
          store.selectUnitByType('helicopter');
          break;
        case '0':
          e.preventDefault();
          store.selectUnitByType('mlrs');
          break;
        case 'm':
        case 'M':
          e.preventDefault();
          store.onActionMove();
          break;
        case 'a':
          e.preventDefault();
          store.onActionAttack();
          break;
        case 'w':
        case 'W':
          e.preventDefault();
          store.onActionWait();
          break;
        case 'f':
        case 'F':
          e.preventDefault();
          store.onBuildFortify();
          break;
        case 'g':
        case 'G':
          e.preventDefault();
          store.onClearMinefield();
          break;
        case 'h':
        case 'H':
          e.preventDefault();
          store.onEnterStealth();
          break;
        case 'r':
        case 'R':
          e.preventDefault();
          // v28.0: Reset camera to map center
          useGameStore.getState().setPanCameraTarget({ x: 0, z: 0 });
          break;
        case 'Home':
          e.preventDefault();
          // v85: Snap camera to selected unit
          {
            const cs = useGameStore.getState();
            if (cs.selectedUnit && cs.selectedUnit.isAlive) {
              const CT = 1.05;
              const ox = -(MAP_WIDTH * CT) / 2;
              const oz = -(MAP_HEIGHT * CT) / 2;
              useGameStore.getState().setPanCameraTarget({
                x: ox + cs.selectedUnit.position.x * CT + 0.5,
                z: oz + cs.selectedUnit.position.z * CT + 0.5,
              });
            }
          }
          break;
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // HP color helper (v74.0: aligned with getHpColor thresholds: 0.7/0.3)
  const hpColor = (hp: number, maxHp: number) => 
    hp / maxHp > 0.7 ? 'text-green-400' : hp / maxHp > 0.3 ? 'text-yellow-400' : 'text-red-400';

  // HP bar color for Progress component (v79.0: gradient + aligned thresholds)
  const hpBarClassName = (hp: number, maxHp: number) => {
    const ratio = hp / maxHp;
    if (ratio > 0.7) return '[&>div]:bg-gradient-to-r from-green-600 to-green-400';
    if (ratio > 0.3) return '[&>div]:bg-gradient-to-r from-yellow-600 to-yellow-400';
    return '[&>div]:bg-gradient-to-r from-red-600 to-red-400';
  };

  // Get terrain info for the selected unit's position
  const selectedUnitTerrain = selectedUnit ? state.map?.cells[selectedUnit.position.z]?.[selectedUnit.position.x] : null;
  const selectedUnitTerrainConfig = selectedUnitTerrain ? TERRAIN_CONFIGS[selectedUnitTerrain.terrain] : null;
  const isSelectedOnFortified = selectedUnitTerrain?.fortified === true;

  // ===== Deployment Unit Type Palette =====
  const UNIT_TYPE_LIST: UnitType[] = ['tank', 'ifv', 'artillery', 'scout', 'infantry', 'sam', 'engineer', 'supply', 'helicopter', 'mlrs'];

  return (
    <TooltipProvider>
      <div className={`absolute inset-0 pointer-events-none ${shakeActive ? 'animate-shake' : ''}`}>
        {/* Mission Objectives Overlay */}
        <MissionOverlay />

        {/* Floating Damage Number Overlay (animated) */}
        <DamagePopupOverlay show={settings.showDamageNumbers !== false} />

        {/* Terrain Effects Panel - shown when hovering over map cells */}
        <TerrainEffectsPanel
          hoveredCell={hoveredCell}
          movementAnimation={movementAnimation}
          mousePos={mousePos}
          mapCells={state.map?.cells ?? []}
          capturePoints={capturePoints}
          currentFaction={currentFaction}
          currentWeather={state.currentWeather}
          units={units}
          phase={phase}
          selectedUnit={selectedUnit}
          movablePositions={state.movablePositions}
        />
        {/* Shake animation CSS */}
        <style jsx>{`
          @keyframes shake {
            0%, 100% { transform: translateX(0) translateY(0); }
            10% { transform: translateX(-3px) translateY(1px); }
            20% { transform: translateX(3px) translateY(-1px); }
            30% { transform: translateX(-2px) translateY(2px); }
            40% { transform: translateX(2px) translateY(-2px); }
            50% { transform: translateX(-1px) translateY(1px); }
            60% { transform: translateX(1px) translateY(-1px); }
            70% { transform: translateX(-1px) translateY(0); }
            80% { transform: translateX(0) translateY(1px); }
            90% { transform: translateX(0) translateY(0); }
          }
          .animate-shake {
            animation: shake 0.4s ease-in-out;
          }
          @keyframes action-pulse-green {
            0%, 100% { box-shadow: 0 0 4px rgba(76, 175, 80, 0.4), 0 0 8px rgba(76, 175, 80, 0.2); }
            50% { box-shadow: 0 0 10px rgba(76, 175, 80, 0.7), 0 0 20px rgba(76, 175, 80, 0.4); }
          }
          @keyframes action-pulse-red {
            0%, 100% { box-shadow: 0 0 4px rgba(244, 67, 54, 0.4), 0 0 8px rgba(244, 67, 54, 0.2); }
            50% { box-shadow: 0 0 10px rgba(244, 67, 54, 0.7), 0 0 20px rgba(244, 67, 54, 0.4); }
          }
          @keyframes action-pulse-amber {
            0%, 100% { box-shadow: 0 0 4px rgba(245, 158, 11, 0.3), 0 0 8px rgba(245, 158, 11, 0.15); }
            50% { box-shadow: 0 0 8px rgba(245, 158, 11, 0.6), 0 0 16px rgba(245, 158, 11, 0.3); }
          }
          @keyframes end-turn-pulse {
            0%, 100% { transform: scale(1); box-shadow: 0 0 6px rgba(245, 158, 11, 0.3); }
            50% { transform: scale(1.04); box-shadow: 0 0 14px rgba(245, 158, 11, 0.6), 0 0 28px rgba(245, 158, 11, 0.2); }
          }
          @keyframes ripple {
            0% { transform: scale(0.8); opacity: 0.6; }
            100% { transform: scale(2.2); opacity: 0; }
          }
          @keyframes hp-glow-low {
            0%, 100% { filter: drop-shadow(0 0 3px rgba(244, 67, 54, 0.6)); }
            50% { filter: drop-shadow(0 0 8px rgba(244, 67, 54, 0.9)); }
          }
          .action-btn-move {
            animation: action-pulse-green 1.5s ease-in-out infinite;
          }
          .action-btn-attack {
            animation: action-pulse-red 1.5s ease-in-out infinite;
          }
          .action-btn-wait {
            animation: action-pulse-amber 1.5s ease-in-out infinite;
          }
          .end-turn-btn {
            animation: end-turn-pulse 2s ease-in-out infinite;
          }
          .hp-bar-glow-low {
            animation: hp-glow-low 1s ease-in-out infinite;
          }
          @keyframes capture-pulse {
            0%, 100% { box-shadow: 0 0 2px rgba(234,179,8,0.2); border-color: rgba(234,179,8,0.3); }
            50% { box-shadow: 0 0 8px rgba(234,179,8,0.5), 0 0 16px rgba(234,179,8,0.2); border-color: rgba(234,179,8,0.6); }
          }
          .animate-capture-pulse {
            animation: capture-pulse 1.5s ease-in-out infinite;
          }
          @keyframes golden-glow {
            0%, 100% { box-shadow: 0 0 10px rgba(234,179,8,0.3), inset 0 0 10px rgba(234,179,8,0.05); }
            50% { box-shadow: 0 0 20px rgba(234,179,8,0.5), 0 0 40px rgba(234,179,8,0.2), inset 0 0 20px rgba(234,179,8,0.1); }
          }
          @keyframes sparkle-rise {
            0% { transform: translateY(0) scale(0); opacity: 0; }
            50% { opacity: 0.8; transform: translateY(-10px) scale(1); }
            100% { transform: translateY(-20px) scale(0.5); opacity: 0; }
          }
        `}</style>

        {/* Turn Transition Animation */}
        <TurnTransition transition={turnTransition} />

        {/* End-of-Turn Summary Banner */}
        <AnimatePresence>
          {turnTransition && turnTransition.faction === 'blue' && lastTurnSummary && lastTurnSummary.faction === 'red' && (
            <motion.div
              className="absolute top-4 left-1/2 -translate-x-1/2 z-[65] pointer-events-none"
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <motion.div
                initial={{ opacity: 1 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.3, delay: 1.4 }}
                className="bg-black/80 backdrop-blur-md border border-white/15 rounded-lg px-5 py-2.5 shadow-xl shadow-black/40 flex items-center gap-4"
              >
                <div className="flex items-center gap-2">
                  <span className="text-sm font-bold text-white">回合 {lastTurnSummary.turn} 结束</span>
                </div>
                <div className="w-px h-4 bg-white/20" />
                <div className="flex items-center gap-3 text-[11px]">
                  <span className="text-green-400 flex items-center gap-1">
                    <Crosshair className="w-3 h-3" />
                    消灭 {lastTurnSummary.unitsDestroyed} 敌军
                  </span>
                  {(lastTurnSummary.unitsLost ?? 0) > 0 && (
                    <span className="text-red-400 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      损失 {lastTurnSummary.unitsLost} 单位
                    </span>
                  )}
                </div>
                <div className="w-px h-4 bg-white/20" />
                <div className="flex items-center gap-1.5 text-[11px] text-blue-300">
                  <span>下回合天气:</span>
                  <span>{WEATHER_CONFIGS[state.currentWeather ?? 'clear']?.icon}</span>
                  <span>{WEATHER_CONFIGS[state.currentWeather ?? 'clear']?.name}</span>
                  {state.weatherTurnsRemaining != null && state.weatherTurnsRemaining <= 1 && (
                    <span className="text-yellow-400 text-[9px]">(即将变化)</span>
                  )}
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Low-HP Army Vignette Warning (v80) */}
        {(() => {
          const aliveReds = units.filter(u => u.faction === 'red' && u.isAlive);
          const totalHp = aliveReds.reduce((s, u) => s + u.stats.hp, 0);
          const totalMaxHp = aliveReds.reduce((s, u) => s + u.stats.maxHp, 0);
          const hpPct = totalMaxHp > 0 ? totalHp / totalMaxHp : 1;
          if (hpPct >= 0.4 || phase === 'deployment' || phase === 'heroSelection') return null;
          const intensity = Math.min(0.6, (0.4 - hpPct) * 2); // 0 at 40%, 0.6 at 10%
          return (
            <div 
              className="fixed inset-0 pointer-events-none z-30"
              style={{
                background: `radial-gradient(ellipse at center, transparent 50%, rgba(220, 38, 38, ${intensity * 0.5}) 100%)`,
              }}
            />
          );
        })()}

        {/* ===== v24.0: Pause Overlay ===== */}
        <AnimatePresence>
          {isPaused && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
              className="absolute inset-0 z-[70] bg-black/60 backdrop-blur-sm flex items-center justify-center"
              style={{ pointerEvents: 'auto' }}
              onClick={() => useGameStore.getState().togglePause()}
            >
              <motion.div
                initial={{ scale: 0.8, y: 20 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.8, y: 20 }}
                transition={{ type: 'spring', stiffness: 300, damping: 25 }}
                className="text-center"
              >
                <div className="w-20 h-20 mx-auto mb-4 rounded-full bg-white/10 border-2 border-white/20 flex items-center justify-center">
                  <Pause className="w-10 h-10 text-white/80" />
                </div>
                <h2 className="text-3xl font-bold text-white mb-2 tracking-widest">暂停</h2>
                <p className="text-sm text-gray-400 mb-6">游戏已暂停</p>
                <div className="flex items-center gap-2 text-xs text-gray-500">
                  <kbd className="px-2 py-1 rounded bg-white/10 border border-white/20 text-gray-300 font-mono">Esc</kbd>
                  <span>或</span>
                  <kbd className="px-2 py-1 rounded bg-white/10 border border-white/20 text-gray-300 font-mono">F1</kbd>
                  <span>继续游戏</span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-600 mt-2">
                  <kbd className="px-2 py-1 rounded bg-white/10 border border-white/20 text-gray-400 font-mono">点击任意处</kbd>
                  <span>继续</span>
                </div>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Keyboard Shortcuts Help Overlay */}
        <AnimatePresence>
          {showShortcuts && <ShortcutsHelpOverlay onClose={() => useGameStore.getState().setShowShortcuts(false)} />}
        </AnimatePresence>

        {/* ===== Army Roster Panel (全军总览面板) ===== */}
        <ArmyRosterPanel />

        {/* ===== Left Bottom Bar (左侧底栏) ===== */}
        <LeftBottomBar
          activeTab={leftBottomBarTab}
          onTabChange={setLeftBottomBarTab}
          unitFilter={unitFilter}
          setUnitFilter={setUnitFilter}
        />

        {/* ===== v23.0: Casualty Report ===== */}
        <CasualtyReportPanel
          isOpen={showCasualtyReport}
          onClose={() => setShowCasualtyReport(false)}
          casualties={casualties}
        />

        {/* ===== v23.0: Notification Center ===== */}
        <NotificationCenter
          isOpen={showNotificationCenter}
          onClose={() => setShowNotificationCenter(false)}
          notifications={gameNotifications}
          onMarkAllRead={markAllNotificationsRead}
          onClearAll={clearAllNotifications}
        />

        {/* ===== Combat Statistics HUD Overlay ===== */}
        <CombatStatsHUD />

        {/* Turn Summary Overlay */}
        <AnimatePresence>
          <TurnSummaryOverlay 
            summary={lastTurnSummary} 
            onDismiss={handleDismissSummary} 
          />
        </AnimatePresence>

        {/* Battle Replay Overlay */}
        <AnimatePresence>
          {state.replayState?.isReplaying && (
            <ReplayOverlay
              replayState={state.replayState}
              onNext={() => useGameStore.getState().nextReplayStep()}
              onEnd={() => useGameStore.getState().endReplay()}
            />
          )}
        </AnimatePresence>

        {/* Tutorial Overlay */}
        <AnimatePresence>
          {state.tutorialEnabled && state.tutorialStep >= 0 && state.tutorialStep < TUTORIAL_STEPS.length && phase === 'selectUnit' && (
            <TutorialOverlay
              step={TUTORIAL_STEPS[state.tutorialStep]}
              onAdvance={() => useGameStore.getState().advanceTutorial()}
              onDismiss={() => useGameStore.getState().dismissTutorial()}
            />
          )}
        </AnimatePresence>

        {/* Save/Load confirmation toast */}
        <AnimatePresence>
          {saveToast && (
            <motion.div
              className="pointer-events-none absolute top-14 left-1/2 -translate-x-1/2 z-50 bg-black/90 backdrop-blur-md border border-green-500/40 rounded-lg px-4 py-2 text-green-300 text-xs font-bold shadow-lg"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              {saveToast}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Undo action toast */}
        <AnimatePresence>
          {undoToast ? (
            <motion.div
              key="undo-toast"
              className="pointer-events-none absolute top-14 left-1/2 -translate-x-1/2 z-50 bg-black/90 backdrop-blur-md border border-amber-500/40 rounded-lg px-4 py-2 text-amber-300 text-xs font-bold shadow-lg"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <Undo2 className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" />
              已撤销上一步操作
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* v72.0: Deploy error toast */}
        <AnimatePresence>
          {deployErrorToast ? (
            <motion.div
              key="deploy-error-toast"
              className="pointer-events-none absolute top-[6.5rem] left-1/2 -translate-x-1/2 z-50 bg-red-950/90 backdrop-blur-md border border-red-500/50 rounded-lg px-4 py-2 text-red-300 text-xs font-bold shadow-lg flex items-center gap-1.5"
              initial={{ opacity: 0, y: -10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -10, scale: 0.95 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            >
              <AlertTriangle className="w-3.5 h-3.5 text-red-400" />
              {deployErrorToast}
            </motion.div>
          ) : null}
        </AnimatePresence>

        {/* v50.0/v75.0: Auto-end-turn countdown toast (replaces v65 duplicate) */}
        <AnimatePresence>
          {autoEndCountdown !== null ? (
            <motion.div
              key="auto-end-turn"
              className="pointer-events-none absolute top-20 left-1/2 -translate-x-1/2 z-50 bg-blue-900/90 backdrop-blur-md border border-blue-500/40 rounded-lg px-4 py-2 text-blue-200 text-xs font-bold shadow-lg"
              initial={{ opacity: 0, y: -10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.3 }}
            >
              <Timer className="w-3.5 h-3.5 inline-block mr-1 -mt-0.5" />
              所有单位已行动 — {autoEndCountdown}秒后自动结束回合
            </motion.div>
          ) : null}
        </AnimatePresence>

        <AnimatePresence>
          {state.levelUpNotifications
            ? state.levelUpNotifications.filter(n => Date.now() - n.timestamp < 4000).map(n => (
                <LevelUpNotificationItem key={n.id} notification={n} />
              ))
            : null}
        </AnimatePresence>

        {/* ===== HERO SELECTION SCREEN ===== */}
        <AnimatePresence>
          {isHeroSelection && (
            <motion.div
              className="pointer-events-auto absolute inset-0 z-[20] flex items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
            >
              <div className="absolute inset-0 bg-black/80 backdrop-blur-sm" />
              <motion.div
                className="relative z-10 w-[680px] max-h-[90vh] overflow-y-auto"
                initial={{ scale: 0.9, y: 30 }}
                animate={{ scale: 1, y: 0 }}
                exit={{ scale: 0.9, y: 30 }}
                transition={{ duration: 0.4, ease: 'easeOut' }}
              >
                <Card className="bg-gray-900/95 border-amber-500/40 shadow-2xl shadow-amber-900/20 overflow-hidden">
                  <div className="bg-gradient-to-r from-amber-900/60 via-yellow-900/40 to-amber-900/60 px-4 py-3 border-b border-amber-500/30">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Trophy className="w-5 h-5 text-amber-400" />
                        <h2 className="text-lg font-bold text-amber-200">选择英雄单位</h2>
                      </div>
                      <button onClick={confirmHeroSelection} className="text-xs text-gray-400 hover:text-white bg-gray-800/80 hover:bg-gray-700 px-3 py-1 rounded transition-colors">
                        跳过选择
                      </button>
                    </div>
                    <p className="text-[11px] text-amber-300/70 mt-1">选择一位英雄加入战场，英雄拥有独特名称、强化属性和两个特殊技能</p>
                  </div>
                  <div className="p-3 space-y-2">
                    <div className="text-[11px] text-red-400 font-bold flex items-center gap-1 mb-1">
                      <div className="w-2 h-2 rounded-full bg-red-500" />
                      红方英雄
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                      {redHeroes.map(hero => {
                        const isSelected = selectedHeroId === hero.id;
                        return (
                          <button key={hero.id} onClick={() => selectHero(hero.id)}
                            className={`relative text-left p-2.5 rounded-lg border transition-all duration-200 ${isSelected ? 'border-amber-400 bg-amber-900/40 shadow-lg shadow-amber-500/20 scale-[1.02]' : 'border-gray-700 bg-gray-800/60 hover:border-gray-500 hover:bg-gray-800'}`}>
                            {isSelected && <div className="absolute -top-1 -right-1 w-5 h-5 bg-amber-500 rounded-full flex items-center justify-center"><Check className="w-3 h-3 text-black" /></div>}
                            <div className="flex items-center gap-1.5 mb-1.5">
                              <span className="text-xl">{hero.portraitIcon}</span>
                              <div>
                                <div className="text-[11px] font-bold text-amber-300 leading-tight">{hero.name}</div>
                                <div className="text-[9px] text-amber-400/60">{hero.title}</div>
                              </div>
                            </div>
                            <div className="text-[9px] text-gray-400 mb-1.5">基于：{UNIT_CONFIGS[hero.unitType]?.name || hero.unitType}</div>
                            <div className="flex flex-wrap gap-1 mb-1.5">
                              {hero.statBoosts.hp ? <Badge className="text-[8px] px-1 py-0 bg-red-900/60 text-red-300 border-red-700/50">HP+{hero.statBoosts.hp}</Badge> : null}
                              {hero.statBoosts.attack ? <Badge className="text-[8px] px-1 py-0 bg-orange-900/60 text-orange-300 border-orange-700/50">ATK+{hero.statBoosts.attack}</Badge> : null}
                              {hero.statBoosts.defense ? <Badge className="text-[8px] px-1 py-0 bg-blue-900/60 text-blue-300 border-blue-700/50">DEF+{hero.statBoosts.defense}</Badge> : null}
                              {hero.statBoosts.armor ? <Badge className="text-[8px] px-1 py-0 bg-slate-700/60 text-slate-300 border-slate-600/50">装甲+{hero.statBoosts.armor}</Badge> : null}
                              {hero.statBoosts.moveRange ? <Badge className="text-[8px] px-1 py-0 bg-green-900/60 text-green-300 border-green-700/50">MOV+{hero.statBoosts.moveRange}</Badge> : null}
                              {hero.statBoosts.vision ? <Badge className="text-[8px] px-1 py-0 bg-cyan-900/60 text-cyan-300 border-cyan-700/50">VIS+{hero.statBoosts.vision}</Badge> : null}
                              {hero.statBoosts.attackRange ? <Badge className="text-[8px] px-1 py-0 bg-purple-900/60 text-purple-300 border-purple-700/50">RNG+{hero.statBoosts.attackRange}</Badge> : null}
                            </div>
                            <div className="space-y-1">
                              {hero.abilities.map(ability => (
                                <div key={ability.id} className={`text-[9px] px-1.5 py-0.5 rounded ${ability.type === 'passive' ? 'bg-gray-800/80 text-gray-300' : 'bg-amber-900/40 text-amber-300'}`}>
                                  <span className="mr-0.5">{ability.icon}</span><span className="font-bold">{ability.name}</span>
                                  {ability.type === 'active' && <span className="text-amber-400/50 ml-1">CD:{ability.cooldown}</span>}
                                  <span className="text-gray-500 ml-1">- {ability.description}</span>
                                </div>
                              ))}
                            </div>
                            <p className="text-[8px] text-gray-500 mt-1.5 italic leading-relaxed">{hero.lore}</p>
                          </button>
                        );
                      })}
                    </div>
                    <div className="flex items-center justify-between mt-3 pt-2 border-t border-gray-700/50">
                      <button onClick={() => { const randomIdx = Math.floor(Math.random() * redHeroes.length); selectHero(redHeroes[randomIdx].id); }}
                        className="text-[10px] text-gray-400 hover:text-amber-300 bg-gray-800 hover:bg-gray-700 px-3 py-1.5 rounded transition-colors">
                        <Wand2 className="w-3 h-3 inline mr-1" />随机选择
                      </button>
                      <button onClick={confirmHeroSelection} disabled={!selectedHeroId}
                        className={`text-[11px] font-bold px-4 py-1.5 rounded transition-all ${selectedHeroId ? 'bg-amber-600 hover:bg-amber-500 text-black shadow-lg shadow-amber-500/30' : 'bg-gray-700 text-gray-500 cursor-not-allowed'}`}>
                        确认选择
                      </button>
                    </div>
                  </div>
                </Card>
              </motion.div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ===== DEPLOYMENT PHASE BANNER ===== */}
        <AnimatePresence>
          {isDeployment && (
            <motion.div
              className="pointer-events-auto absolute top-0 left-0 right-0 z-[11]"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={{ duration: 0.3 }}
            >
              <div className="bg-gradient-to-r from-green-900/80 via-emerald-900/80 to-green-900/80 border-b border-green-500/40 px-3 py-1.5 text-center">
                <div className="flex items-center justify-center gap-2 text-[11px]">
                  <Star className="w-3.5 h-3.5 text-green-400 fill-green-400" />
                  <span className="text-green-300 font-bold">部署阶段</span>
                  <span className="text-green-400/80">— 选择单位类型，点击左侧区域(x:0-3)放置</span>
                  <span className="text-green-400 font-bold">{redBudget}/{TACTICAL_DEPLOYMENT_BUDGET}</span>
                  <Star className="w-3.5 h-3.5 text-green-400 fill-green-400" />
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ===== DEPLOYMENT PHASE LEFT PANEL ===== */}
        {isDeployment && (
          <div className="pointer-events-auto absolute top-10 left-2 z-10 w-[220px] space-y-1">
            <Card className="bg-black/60 backdrop-blur-xl border border-green-500/30 text-white shadow-xl shadow-black/20 overflow-hidden">
              <div className="h-0.5 bg-gradient-to-r from-transparent via-green-500/50 to-transparent" />
              <div className="p-2 space-y-2">
                <div className="text-[11px] font-bold text-green-400 flex items-center gap-1">
                  <Star className="w-3.5 h-3.5 fill-green-400" />部署阶段
                </div>

                {/* Budget tracker */}
                <div className="p-2 rounded bg-green-900/30 border border-green-500/30">
                  <div className="flex items-center justify-between text-[10px]">
                    <span className="text-white/70">红方预算</span>
                    <span className="text-green-400 font-bold text-xs">{redBudget} / {TACTICAL_DEPLOYMENT_BUDGET}</span>
                  </div>
                  <div className="h-1.5 bg-black/40 rounded-full overflow-hidden mt-1">
                    <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${(redBudget / TACTICAL_DEPLOYMENT_BUDGET) * 100}%` }} />
                  </div>
                </div>

                {/* Unit type palette */}
                <div className="space-y-1">
                  <div className="text-[9px] text-white/50 font-medium">选择单位类型</div>
                  <div className="space-y-0.5 max-h-52 overflow-y-auto">
                    {UNIT_TYPE_LIST.map(type => {
                      const config = UNIT_CONFIGS[type];
                      const cost = TACTICAL_UNIT_COSTS[type];
                      const canAfford = redBudget >= cost;
                      const isSelected = selectedDeploymentType === type;
                      return (
                        <button
                          key={type}
                          className={`w-full flex items-center gap-1.5 px-1.5 py-1 rounded text-[10px] text-left transition-all cursor-pointer
                            ${isSelected ? 'bg-green-800/60 ring-1 ring-green-400' : canAfford ? 'bg-white/5 hover:bg-white/10' : 'bg-white/3 opacity-50 cursor-not-allowed'}
                          `}
                          onClick={() => canAfford && useGameStore.getState().setSelectedDeploymentType(isSelected ? null : type)}
                          disabled={!canAfford}
                        >
                          <span className={canAfford ? 'text-white/70' : 'text-gray-600'}>{UNIT_ICONS[type]}</span>
                          <span className="flex-1 truncate text-white/90">{config.name}</span>
                          <Badge className={`text-[7px] px-0.5 py-0 h-3 ${canAfford ? 'bg-amber-600/80 text-white' : 'bg-gray-700 text-gray-400'}`}>
                            {cost}
                          </Badge>
                        </button>
                      );
                    })}
                  </div>
                </div>

                <Separator className="bg-white/10" />

                {/* Deployed units list */}
                <div className="space-y-1">
                  <div className="text-[9px] text-white/50 font-medium">已部署 ({redDeployedUnits.length})</div>
                  <div className="space-y-0.5 max-h-32 overflow-y-auto">
                    {redDeployedUnits.map(unit => (
                      <div key={unit.id} className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-white/5 text-[10px]">
                        <span className="text-red-400">{UNIT_ICONS[unit.type]}</span>
                        <span className="flex-1 truncate text-white/80">{unit.name}</span>
                        <button
                          className="text-red-400 hover:text-red-300 p-0.5 cursor-pointer"
                          onClick={() => useGameStore.getState().onRemoveDeployedUnit(unit.id)}
                          title="移除"
                        >
                          <Trash2 className="w-2.5 h-2.5" />
                        </button>
                      </div>
                    ))}
                    {redDeployedUnits.length === 0 && (
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
                    onClick={() => useGameStore.getState().onConfirmDeployment()}
                    disabled={redDeployedUnits.length === 0}
                  >
                    <Check className="w-3 h-3 mr-1" />确认部署
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="w-full h-7 border-green-500/40 text-green-400 hover:bg-green-900/30 text-[10px]"
                    onClick={() => useGameStore.getState().onAutoDeployRed()}
                  >
                    <Wand2 className="w-3 h-3 mr-1" />自动部署
                  </Button>
                </div>
              </div>
            </Card>
          </div>
        )}

        {/* ===== TOP BAR ===== */}
        <div className="pointer-events-auto absolute top-0 left-0 right-0 z-10">
          {/* Faction-colored accent line (v24.0) */}
          <div className={`h-0.5 transition-all duration-500 ${currentFaction === 'red' ? 'bg-gradient-to-r from-transparent via-red-500/60 to-transparent' : 'bg-gradient-to-r from-transparent via-blue-500/60 to-transparent'}`} />
          <div className={`flex items-center justify-between px-3 py-1.5 backdrop-blur-xl border-b shadow-lg shadow-black/20 transition-colors duration-300 overflow-x-auto min-w-0 ${currentFaction === 'red' ? 'bg-black/50 border-red-500/20' : 'bg-black/50 border-blue-500/20'}`}>
            <div className="flex items-center gap-2">
              <Badge variant={currentFaction === 'red' ? 'default' : 'secondary'} 
                className={`text-xs px-2 py-0.5 ${currentFaction === 'red' ? 'bg-red-600 hover:bg-red-700' : 'bg-blue-600 hover:bg-blue-700'}`}>
                {currentFaction === 'red' ? '🔴 红方' : '🔵 蓝方'}
              </Badge>
              {/* v61.0: Action phase breadcrumb */}
              {currentFaction === 'red' && !state.winner && (
                <div className="hidden sm:flex items-center gap-1 text-[10px]">
                  {['selectUnit', 'moveUnit', 'attackUnit'].map((p, i) => {
                    const isActive = phase === p;
                    const isDone = ['selectUnit', 'moveUnit', 'attackUnit'].indexOf(phase) > i;
                    const labels: Record<string, string> = { selectUnit: '选择', moveUnit: '移动', attackUnit: '攻击' };
                    return (
                      <span key={p} className={`flex items-center gap-0.5 ${isActive ? 'text-amber-400 font-bold' : isDone ? 'text-gray-500' : 'text-gray-600'}`}>
                        {i > 0 && <span className="text-gray-700">›</span>}
                        {isActive && <span className="w-1 h-1 rounded-full bg-amber-400 animate-pulse" />}
                        {labels[p]}
                      </span>
                    );
                  })}
                </div>
              )}
              <TurnIndicator turn={turn} currentFaction={currentFaction} phase={phase} units={units} />
              {/* Game clock — v67.0: Enhanced with faction border glow */}
              {gameStartTime && (
                <div className={`flex items-center gap-1.5 text-xs font-mono px-2 py-0.5 rounded-full border ${
                  currentFaction === 'red'
                    ? 'border-red-500/30 bg-red-950/30 text-red-300'
                    : 'border-blue-500/30 bg-blue-950/30 text-blue-300'
                }`}>
                  <Clock className="w-3 h-3 opacity-70" />
                  <span className="font-bold">{elapsedTime}</span>
                  {turn > 1 && (() => {
                    // v90.0: Show average time per turn
                    const avgMs = (Date.now() - gameStartTime) / turn;
                    const avgMin = Math.floor(avgMs / 60000);
                    const avgSec = Math.floor((avgMs % 60000) / 1000);
                    return <span className="text-[9px] opacity-60 ml-0.5">均{avgMin}m{avgSec}s</span>;
                  })()}
                  <span className={`w-1.5 h-1.5 rounded-full ${
                    currentFaction === 'red' ? 'bg-red-500' : 'bg-blue-500'
                  }`} />
                </div>
              )}
              {/* v69.0: AI difficulty indicator (shows dynamic adjustment) */}
              {(() => {
                const store = useGameStore.getState();
                const dynDiff = store.aiDynamicDifficulty;
                const baseDiff = store.aiDifficulty;
                const curDiff = dynDiff?.currentDifficulty ?? baseDiff;
                const adjusted = dynDiff ? dynDiff.metrics.adjustmentCount > 0 : false;
                if (store.currentFaction !== 'blue') return null;
                return (
                <Tooltip>
                  <TooltipTrigger asChild>
                    <div className={`flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded-full border ${
                      adjusted
                        ? 'border-amber-500/30 bg-amber-950/20 text-amber-300'
                        : 'border-gray-600/30 bg-gray-900/20 text-gray-400'
                    }`}>
                      <Bot className="w-2.5 h-2.5" />
                      <span className="font-medium">
                        {curDiff === 'easy' ? '简单' : curDiff === 'normal' ? '普通' : '困难'}
                      </span>
                      {adjusted && (
                        <span className="w-1 h-1 rounded-full bg-amber-400 animate-pulse" />
                      )}
                    </div>
                  </TooltipTrigger>
                  <TooltipContent side="bottom" className="bg-gray-900 border-gray-700 text-gray-200 text-[10px]">
                    <div className="font-medium">AI 难度: {curDiff === 'easy' ? '简单' : curDiff === 'normal' ? '普通' : '困难'}</div>
                    {adjusted && (
                      <div className="text-amber-400/80 mt-0.5">
                        已动态调整 {dynDiff.metrics.adjustmentCount} 次
                      </div>
                    )}
                    {dynDiff?.enabled && (
                      <div className="text-gray-400 mt-0.5">
                        击杀比: {dynDiff.metrics.playerKillRatio.toFixed(1)} · 
                        效率: {dynDiff.metrics.playerDamageEfficiency.toFixed(1)}
                      </div>
                    )}
                  </TooltipContent>
                </Tooltip>
                );
              })()}
              {/* Turn timer (v23.0 enhanced: v85 color-coded pill) */}
              {/* v92.0: Added animate-pulse + ring-2 ring-red-500/50 when below 25% remaining time */}
              {settings.showTurnTimer !== false && (
              <div className={`flex items-center gap-1 text-xs font-mono px-1.5 py-0.5 rounded-full border ${
                turnTimeLimitRef.current ? (
                  (() => {
                    const remaining = Math.max(0, turnTimeLimitRef.current - turnElapsed);
                    const ratio = remaining / turnTimeLimitRef.current;
                    if (ratio <= 0.1) return 'text-red-500 font-bold animate-pulse ring-2 ring-red-500/50 border-red-500/30 bg-red-950/30';
                    if (ratio <= 0.25) return 'text-red-400 font-bold animate-pulse ring-2 ring-red-500/50 border-red-500/30 bg-red-950/20';
                    if (ratio <= 0.5) return 'text-yellow-400 border-yellow-500/30 bg-yellow-950/20';
                    return 'text-green-400 border-green-500/30 bg-green-950/20';
                  })()
                ) : (
                  (() => {
                    const sec = turnElapsed / 1000;
                    if (sec > 60) return 'text-red-400 font-bold border-red-500/30 bg-red-950/30';
                    if (sec >= 30) return 'text-yellow-400 border-yellow-500/30 bg-yellow-950/20';
                    return 'text-green-400 border-green-500/30 bg-green-950/20';
                  })()
                )
              }`} title="回合用时">
                <span className="text-[10px]">⏱</span>
                {turnTimeLimitRef.current ? (
                  <span>
                    {formatElapsedTime(Math.max(0, turnTimeLimitRef.current - turnElapsed))}
                    <span className="text-[9px] text-gray-600 ml-0.5">/{formatElapsedTime(turnTimeLimitRef.current)}</span>
                  </span>
                ) : (
                  <span>{formatElapsedTime(turnElapsed)}</span>
                )}
              </div>
              )}
              {/* Speed control — near turn timer */}
              <div className="flex items-center gap-0.5">
                {gameSpeed > 1 && <span className="text-amber-400 text-[10px] mr-0.5">⚡</span>}
                {[1, 2, 4].map(speed => (
                  <button
                    key={speed}
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold transition-all duration-150 cursor-pointer ${
                      gameSpeed === speed
                        ? 'bg-amber-600 text-white shadow-sm'
                        : 'bg-white/10 text-gray-400 hover:bg-white/20 hover:text-white'
                    }`}
                    onClick={() => useGameStore.getState().setGameSpeed(speed)}
                  >
                    {speed}x
                  </button>
                ))}
              </div>
              {/* Action points indicator */}
              <div className="flex items-center gap-1 text-xs">
                <span className="text-amber-400">{
                  units.filter(u => u.faction === currentFaction && u.isAlive && (u.canMove || u.canAttack)).length
                }</span>
                <span className="text-gray-500">/</span>
                <span className="text-gray-400">{
                  units.filter(u => u.faction === currentFaction && u.isAlive).length
                }</span>
                <span className="text-gray-500 text-[10px]">可行动</span>
              </div>
              {/* v60.0→v68.0: Reinforcement countdown with unit type preview */}
              {(() => {
                const redReinforcements = state.reinforcements?.red?.length ?? 0;
                if (redReinforcements === 0 && turn <= 1) return null;
                const turnsUntil = REINFORCEMENT_INTERVAL - (turn % REINFORCEMENT_INTERVAL);
                const redReinforcementTypes = (state.reinforcements?.red || []).map(r => r.type);
                const redBudget = state.reinforcementBudget?.red ?? 0;
                return (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge className={`text-xs gap-1 ${redReinforcements > 0 ? 'bg-green-900/60 border-green-500/30' : 'bg-gray-800/60 border-gray-600/30'}`}>
                        <span>🚁</span>
                        {redReinforcements > 0 ? (
                          <span className="text-green-300">{redReinforcements}待部署</span>
                        ) : (
                          <span className="text-gray-400">{turnsUntil}回合</span>
                        )}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="bg-gray-900 border-gray-700 text-gray-200">
                      <div className="text-xs font-medium">增援部队 — 每{REINFORCEMENT_INTERVAL}回合到达</div>
                      {redReinforcements > 0 && (
                        <div className="mt-1 flex flex-wrap gap-1">
                          {redReinforcementTypes.map((type, i) => (
                            <span key={i} className="text-[10px] bg-green-900/40 border border-green-500/20 px-1 py-0.5 rounded text-green-300">
                              {UNIT_CONFIGS[type]?.name || type}
                            </span>
                          ))}
                        </div>
                      )}
                      <div className="text-[10px] text-gray-400 mt-1">
                        {redReinforcements > 0
                          ? `${redReinforcements}个单位待部署 · 预算: ${redBudget}`
                          : `下次增援: ${turnsUntil}回合后`}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                );
              })()}
                            {/* v89.0: Simplified weather badge (enhanced tooltip in right toolbar) */}
              {currentWeather && currentWeather !== 'clear' && (() => {
                const wCfg = WEATHER_CONFIGS[currentWeather as keyof typeof WEATHER_CONFIGS];
                if (!wCfg) return null;
                return (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Badge className="bg-blue-900/60 border-blue-500/30 text-xs gap-1 cursor-default" aria-label="天气状态">
                        <span>{wCfg.icon}</span>
                        <span className="text-blue-300">{wCfg.name}</span>
                        {state.weatherTurnsRemaining != null && (
                          <span className="text-blue-400/60 text-[10px]">{state.weatherTurnsRemaining}回合</span>
                        )}
                      </Badge>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="bg-gray-900 border-gray-700 text-gray-200 max-w-[200px]">
                      <div className="text-xs">{wCfg.description}</div>
                      {wCfg.attackModifier !== 1 && <div className="text-[10px] text-orange-300 mt-1">攻击: ×{wCfg.attackModifier}</div>}
                      {wCfg.movementModifier !== 1 && <div className="text-[10px] text-yellow-300">移动: ×{wCfg.movementModifier}</div>}
                      {wCfg.visionModifier !== 0 && <div className="text-[10px] text-cyan-300">视野: {wCfg.visionModifier > 0 ? '+' : ''}{wCfg.visionModifier}</div>}
                    </TooltipContent>
                  </Tooltip>
                );
              })()}
              {phase === 'aiTurn' && (
                <Badge className="bg-red-600 animate-pulse text-xs">
                  <Zap className="w-3 h-3 mr-1" />攻击!
                </Badge>
              )}
              <div className="flex items-center gap-1.5 border-l border-white/20 pl-2 ml-1">
                {phase !== 'gameOver' && currentFaction === 'red' && (
                  <>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-white border-white/30 hover:bg-white/10 text-[11px]"
                          onClick={() => useGameStore.getState().onDeselect()}
                          disabled={!selectedUnit}
                        >
                          取消
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>取消选择 [Esc]</TooltipContent>
                    </Tooltip>
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          aria-label={`结束回合${allUnitsExhausted ? ' - 所有单位已行动' : ''}`}
                          className={`h-8 px-4 text-white text-xs font-bold end-turn-btn relative overflow-hidden transition-all duration-300 border-2 ${
                            allUnitsExhausted
                              ? 'bg-green-600 hover:bg-green-500 animate-pulse shadow-[0_0_12px_rgba(34,197,94,0.5)] border-green-400'
                              : 'bg-amber-600 hover:bg-amber-500 border-amber-400 shadow-[0_0_8px_rgba(245,158,11,0.3)]'
                          }`}
                          onClick={() => {
                            if (settings.confirmEndTurn) {
                              setShowEndTurnConfirm(true);
                            } else {
                              useGameStore.getState().onEndTurn();
                            }
                          }}
                          disabled={isAiProcessing}
                        >
                          <ChevronRight className="w-4 h-4 mr-1" />
                          {allUnitsExhausted
                              ? (autoEndCountdown !== null
                                ? `自动结束 ${autoEndCountdown}...`
                                : '结束回合 ✓')
                              : '结束回合'}
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>
                        {allUnitsExhausted ? '所有单位已行动完毕，点击结束回合' : '结束当前回合 [E]'}
                      </TooltipContent>
                    </Tooltip>
                  </>
                )}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label={`全军总览${state.showArmyRoster ? ' (已开启)' : ''}`}
                      className={`h-6 px-2 border-white/30 hover:bg-white/10 transition-colors ${
                        state.showArmyRoster
                          ? 'border-amber-500/60 bg-amber-900/30 text-amber-400'
                          : 'text-white'
                      }`}
                      onClick={() => useGameStore.getState().toggleArmyRoster()}
                    >
                      <Users className="w-3 h-3 mr-1" /> <span className="hidden sm:inline text-[10px]">全军总览</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>全军总览 [L]</TooltipContent>
                </Tooltip>
              </div>
            </div>
            
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-white">
                <span className="text-red-400">红{redUnits.length}</span>
                <span className="text-gray-500">|</span>
                <span className="text-blue-400">蓝{blueUnits.length}</span>
              </div>
              <PowerBalanceGauge />
              {/* Capture point score - v34.0: Enhanced with progress bar */}
              {capturePoints.length > 0 && (() => {
                const redCPs = capturePoints.filter(cp => cp.owner === 'red').length;
                const blueCPs = capturePoints.filter(cp => cp.owner === 'blue').length;
                const neutralCPs = capturePoints.length - redCPs - blueCPs;
                const totalCPs = capturePoints.length;
                return (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <div className="flex items-center gap-1.5 text-xs text-white cursor-default">
                        <Flag className="w-3 h-3 text-amber-400" />
                        {/* v34.0: Mini progress bar for capture point control */}
                        <div className="w-16 h-2 bg-gray-700/60 rounded-full overflow-hidden flex">
                          <div 
                            className="h-full bg-red-500/80 transition-all duration-500"
                            style={{ width: `${(redCPs / totalCPs) * 100}%` }}
                          />
                          <div className="flex-1 h-full bg-gray-600/40" />
                          <div 
                            className="h-full bg-blue-500/80 transition-all duration-500"
                            style={{ width: `${(blueCPs / totalCPs) * 100}%` }}
                          />
                        </div>
                        <span className="text-red-400 font-bold">{redCPs}</span>
                        <span className="text-gray-500">:</span>
                        <span className="text-blue-400 font-bold">{blueCPs}</span>
                        {neutralCPs > 0 && <span className="text-gray-500 text-[10px]">+{neutralCPs}</span>}
                      </div>
                    </TooltipTrigger>
                    <TooltipContent>据点控制 (领先3个以上可据点胜利)</TooltipContent>
                  </Tooltip>
                );
              })()}

              {/* Weather indicator - Enhanced with animation and notification */}
              {phase !== 'deployment' && (() => {
                const currentWeather = (state as { currentWeather?: WeatherType }).currentWeather ?? 'clear';
                const weatherTurns = (state as { weatherTurnsRemaining?: number }).weatherTurnsRemaining ?? 0;
                const wConfig = WEATHER_CONFIGS[currentWeather as keyof typeof WEATHER_CONFIGS];
                if (!wConfig) return null;
                
                // Weather effect summary text
                const effects: string[] = [];
                if (wConfig.movementModifier !== 1.0) effects.push(`移动×${wConfig.movementModifier.toFixed(1)}`);
                if (wConfig.attackModifier !== 1.0) effects.push(`攻击${wConfig.attackModifier < 1 ? '-' : '+'}${Math.round(Math.abs(1 - wConfig.attackModifier) * 100)}%`);
                if (wConfig.visionModifier !== 0) effects.push(`视野${wConfig.visionModifier > 0 ? '+' : ''}${wConfig.visionModifier}`);
                const effectsText = effects.join(', ');
                
                // Weather icon animation class
                const weatherAnimClass = currentWeather === 'rain' ? 'animate-bounce' 
                  : currentWeather === 'sandstorm' ? 'animate-spin' 
                  : currentWeather === 'snow' ? 'animate-bounce' 
                  : currentWeather === 'fog' ? 'animate-pulse' 
                  : '';
                
                return (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <motion.div 
                        className="flex items-center gap-1 text-xs cursor-default"
                        animate={currentWeather !== 'clear' ? { 
                          scale: [1, 1.05, 1],
                        } : {}}
                        transition={{ duration: 2, repeat: Infinity, ease: 'easeInOut' }}
                      >
                        <span className={weatherAnimClass} style={{ display: 'inline-block' }}>{wConfig.icon}</span>
                        <span style={{ color: wConfig.color }} className="font-medium">{wConfig.name}</span>
                        <span className="text-gray-500">({weatherTurns})</span>
                        {effectsText && (
                          <span className="text-gray-400 text-[10px] hidden sm:inline ml-1">
                            {effectsText}
                          </span>
                        )}
                      </motion.div>
                    </TooltipTrigger>
                    <TooltipContent side="bottom" className="text-[11px] max-w-[260px]">
                      <div className="font-bold" style={{ color: wConfig.color }}>{wConfig.icon} {wConfig.name}</div>
                      <div className="text-gray-300 mt-1">{wConfig.description}</div>
                      <div className="mt-1.5 space-y-0.5 text-gray-400">
                        {wConfig.movementModifier !== 1.0 && (
                          <div>🏃 移动消耗 ×{wConfig.movementModifier.toFixed(1)}</div>
                        )}
                        {wConfig.visionModifier !== 0 && (
                          <div>👁 视野 {wConfig.visionModifier > 0 ? '+' : ''}{wConfig.visionModifier}</div>
                        )}
                        {wConfig.attackModifier !== 1.0 && (
                          <div>⚔️ 攻击力 ×{wConfig.attackModifier.toFixed(2)}</div>
                        )}
                      </div>
                      <div className="text-gray-500 mt-1.5 border-t border-white/10 pt-1">
                        {weatherTurns > 0 ? `${weatherTurns}回合后天气变化` : '天气即将变化'}
                      </div>
                    </TooltipContent>
                  </Tooltip>
                );
              })()}

              {/* Inline action buttons for selected unit - enhanced with glow */}
              {selectedUnit && currentFaction === 'red' && phase !== 'gameOver' && (
                <div className="flex items-center gap-1.5 border-l border-white/20 pl-2">
                  {selectedUnit.canMove && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          className="h-7 px-3 bg-green-700 hover:bg-green-600 text-white text-[11px] font-bold action-btn-move"
                          onClick={() => useGameStore.getState().onActionMove()}
                        >
                          <Move className="w-3.5 h-3.5 mr-1" />移动
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>移动 [M]</TooltipContent>
                    </Tooltip>
                  )}
                  {selectedUnit.canAttack && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          className="h-7 px-3 bg-red-700 hover:bg-red-600 text-white text-[11px] font-bold action-btn-attack"
                          onClick={() => useGameStore.getState().onActionAttack()}
                        >
                          <Crosshair className="w-3.5 h-3.5 mr-1" />攻击
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>攻击 [A]</TooltipContent>
                    </Tooltip>
                  )}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        aria-label="待机"
                        className="h-7 px-3 bg-amber-700 hover:bg-amber-600 text-white text-[11px] font-bold action-btn-wait"
                        onClick={() => useGameStore.getState().onActionWait()}
                      >
                        待机
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>待机 [W]</TooltipContent>
                  </Tooltip>
                  {selectedUnit.type === 'engineer' && selectedUnit.canMove && selectedUnit.canAttack && (() => {
                    const cell = state.map?.cells[selectedUnit.position.z]?.[selectedUnit.position.x];
                    return !cell?.fortified;
                  })() && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          className="h-7 px-3 bg-orange-700 hover:bg-orange-600 text-white text-[11px] font-bold"
                          style={{ boxShadow: '0 0 8px rgba(255, 160, 0, 0.4)' }}
                          onClick={() => useGameStore.getState().onBuildFortify()}
                        >
                          🧱 修建工事
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>修建工事 [F]</TooltipContent>
                    </Tooltip>
                  )}
                  {selectedUnit.type === 'engineer' && selectedUnit.canMove && selectedUnit.canAttack && (() => {
                    const cell = state.map?.cells[selectedUnit.position.z]?.[selectedUnit.position.x];
                    return !!cell?.hasMinefield;
                  })() && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          className="h-7 px-3 bg-red-700 hover:bg-red-600 text-white text-[11px] font-bold"
                          style={{ boxShadow: '0 0 8px rgba(255, 60, 60, 0.4)' }}
                          onClick={() => useGameStore.getState().onClearMinefield()}
                        >
                          💣 排雷
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>排雷 [G]</TooltipContent>
                    </Tooltip>
                  )}
                  {/* Stealth button for stealth-capable units */}
                  {(() => {
                    const unit = selectedUnit;
                    if (!unit) return false;
                    const config = UNIT_CONFIGS[unit.type];
                    if (!config?.canStealth) return false;
                    if (unit.isStealthed) return false;
                    if (unit.stealthCooldown > 0) return false;
                    if (!unit.canMove || !unit.canAttack) return false;
                    const cell = state.map?.cells[unit.position.z]?.[unit.position.x];
                    if (!cell) return false;
                    const stealthTerrains = ['forest', 'city', 'fortress', 'swamp', 'mountain'];
                    return stealthTerrains.includes(cell.terrain);
                  })() && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          className="h-7 px-3 bg-purple-700 hover:bg-purple-600 text-white text-[11px] font-bold"
                          style={{ boxShadow: '0 0 8px rgba(147, 51, 234, 0.4)' }}
                          onClick={() => useGameStore.getState().onEnterStealth()}
                        >
                          🫥 隐蔽
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>隐蔽 [H] — 消失在敌方视野中</TooltipContent>
                    </Tooltip>
                  )}
                  {/* Show stealth status for stealthed unit */}
                  {selectedUnit?.isStealthed && (
                    <Badge className="bg-purple-700 text-purple-200 text-[10px] animate-pulse">
                      🫥 隐蔽中 ({selectedUnit.stealthTurnsRemaining}回合)
                    </Badge>
                  )}
                  {/* Retreat button */}
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        className="h-7 px-3 bg-gray-700 hover:bg-gray-600 text-white text-[11px] font-bold"
                        onClick={() => setShowRetreatConfirm(true)}
                      >
                        🚩 撤退
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>撤退选中单位（消耗整回合）</TooltipContent>
                  </Tooltip>
                  {previousState && (phase === 'attackUnit' || phase === 'selectUnit' || phase === 'moveUnit') && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-white border-white/30 hover:bg-white/10 text-[11px] relative"
                          onClick={() => useGameStore.getState().onUndoMove()}
                        >
                          <Undo2 className="w-3 h-3 mr-0.5" />撤销
                          {/* v47.0: Undo level badge */}
                          <span className="absolute -top-1.5 -right-1.5 bg-amber-500 text-white text-[8px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center shadow-sm">
                            {/* v71.0: Show correct depth: both states = 2, only one = 1 */}
                            {previousState && previousTurnState ? 2 : 1}
                          </span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>撤销移动 [Z]{previousTurnState ? ' · 再按Z撤销操作' : ''}</TooltipContent>
                    </Tooltip>
                  )}
                  {!previousState && previousTurnState && (
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Button
                          size="sm"
                          variant="outline"
                          className="h-6 px-2 text-amber-300 border-amber-500/40 hover:bg-amber-500/10 text-[11px] relative"
                          onClick={() => {
                            useGameStore.getState().undoLastAction();
                            setUndoToast(true);
                            setTimeout(() => setUndoToast(false), 1500);
                          }}
                        >
                          <Undo2 className="w-3 h-3 mr-0.5" />撤销操作
                          <span className="absolute -top-1.5 -right-1.5 bg-red-500 text-white text-[8px] font-bold rounded-full w-3.5 h-3.5 flex items-center justify-center shadow-sm">1</span>
                        </Button>
                      </TooltipTrigger>
                      <TooltipContent>撤销上一步操作（移动/攻击/工事/技能） [Z]</TooltipContent>
                    </Tooltip>
                  )}
                </div>
              )}
              
              <div className="flex gap-1">
                {phase !== 'gameOver' && currentFaction === 'red' && (
                  <>
                    {/* v70.0: Undo depth indicator */}
                    {(previousState || previousTurnState) && (
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <div className="flex items-center h-8 px-2 text-xs font-mono rounded bg-white/5 border border-white/10 text-white/50 select-none">
                            <Undo2 className="w-3 h-3 mr-1" />
                            <span>{previousState && previousTurnState ? '2' : '1'}</span>
                          </div>
                        </TooltipTrigger>
                        <TooltipContent>
                          {previousState && previousTurnState
                            ? '可撤销 2 步：当前操作 + 上回合操作 [Z]'
                            : previousTurnState
                              ? '可撤销 1 步：上回合操作 [Z]'
                              : '可撤销 1 步：当前操作 [Z]'}
                        </TooltipContent>
                      </Tooltip>
                    )}
                  </>
                )}
                
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 w-6 p-0 text-white border-white/30 hover:bg-white/10"
                      onClick={() => useGameStore.getState().setShowShortcuts(!showShortcuts)}
                    >
                      <Keyboard className="w-3 h-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>快捷键 [?]</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-white border-white/30 hover:bg-white/10"
                      onClick={() => setShowSavePanel(!showSavePanel)}
                      disabled={phase === 'gameOver' || phase === 'deployment'}
                    >
                      <Save className="w-3 h-3 mr-1" /> 存档
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>存档/读档 [P]</TooltipContent>
                </Tooltip>
                {/* Battle Replay button */}
                {lastTurnSummary && currentFaction === 'red' && phase === 'selectUnit' && !isAiProcessing && (
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button
                        size="sm"
                        variant="outline"
                        className="h-6 px-2 text-white border-cyan-500/30 hover:bg-cyan-900/20 text-cyan-300"
                        onClick={() => useGameStore.getState().startReplay()}
                      >
                        <ScrollText className="w-3 h-3 mr-1" /> 回放
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent>战斗回放 — 查看上回合行动</TooltipContent>
                  </Tooltip>
                )}
                {/* AI Advisor button */}
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className={`h-6 px-2 border-purple-500/30 hover:bg-purple-900/20 text-purple-300 ${advisorLoading ? 'animate-pulse' : ''}`}
                      onClick={() => { setShowAdvisor(!showAdvisor); if (!showAdvisor && !advisorAdvice) requestAdvisor(); }}
                      disabled={phase === 'gameOver' || phase === 'deployment' || phase === 'heroSelection'}
                    >
                      <Bot className="w-3 h-3 mr-1" /> <span className="hidden sm:inline text-[10px]">AI顾问</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>AI 战术顾问 — 智能分析局势</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className={`h-6 w-6 p-0 border-white/30 hover:bg-white/10 ${isPaused ? 'text-amber-400 border-amber-500/50 animate-pulse' : 'text-white'}`}
                      onClick={() => useGameStore.getState().togglePause()}
                    >
                      {isPaused ? <Play className="w-3 h-3" /> : <Pause className="w-3 h-3" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>{isPaused ? '继续 [F1]' : '暂停 [F1]'}</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 w-6 p-0 text-white border-white/30 hover:bg-white/10"
                      onClick={() => useGameStore.getState().toggleMute()}
                    >
                      {isMuted ? <VolumeX className="w-3 h-3" /> : <Volume2 className="w-3 h-3" />}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>音效开关 [Shift+M]</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className="relative h-6 w-6 p-0 text-white border-white/30 hover:bg-white/10"
                      aria-label={`通知中心${gameNotifications.filter(n => !n.read).length > 0 ? ` (${gameNotifications.filter(n => !n.read).length} 未读)` : ''}`}
                      onClick={() => setShowNotificationCenter(!showNotificationCenter)}
                    >
                      {gameNotifications.filter(n => !n.read).length > 0 ? (
                        <BellRing className="w-3 h-3 text-amber-400" />
                      ) : (
                        <Bell className="w-3 h-3" />
                      )}
                      {gameNotifications.filter(n => !n.read).length > 0 && (
                        <span className="absolute -top-1 -right-1 w-3.5 h-3.5 bg-red-500 rounded-full text-[8px] text-white flex items-center justify-center font-bold animate-pulse">
                          {gameNotifications.filter(n => !n.read).length > 9 ? '9+' : gameNotifications.filter(n => !n.read).length}
                        </span>
                      )}
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>通知中心 [N]</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label={`地形防御覆盖${state.showDefenseOverlay ? ' (已开启)' : ''}`}
                      className={`h-6 px-2 border-white/30 hover:bg-white/10 transition-colors ${
                        state.showDefenseOverlay
                          ? 'border-green-500/60 bg-green-900/30 text-green-400'
                          : 'text-white'
                      }`}
                      onClick={() => useGameStore.getState().toggleDefenseOverlay()}
                    >
                      <Shield className="w-3 h-3 mr-1" /> <span className="hidden sm:inline text-[10px]">地形防御</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>地形防御覆盖 [D]</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      aria-label={`威胁范围${state.showThreatOverlay ? ' (已开启)' : ''}`}
                      className={`h-6 px-2 border-white/30 hover:bg-white/10 transition-colors ${
                        state.showThreatOverlay
                          ? 'border-red-500/60 bg-red-900/30 text-red-400'
                          : 'text-white'
                      }`}
                      onClick={() => useGameStore.getState().toggleThreatOverlay()}
                    >
                      <AlertTriangle className="w-3 h-3 mr-1" /> <span className="hidden sm:inline text-[10px]">威胁范围</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>威胁范围 [T]</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 px-2 text-white border-white/30 hover:bg-white/10"
                      onClick={() => setShowAchievementBrowser(true)}
                    >
                      📊 <span className="hidden sm:inline text-[10px] ml-0.5">成绩</span>
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>成绩与成就</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-6 w-6 p-0 text-white border-white/30 hover:bg-white/10"
                      onClick={() => setShowSettingsPanel(!showSettingsPanel)}
                    >
                      <Settings className="w-3 h-3" />
                    </Button>
                  </TooltipTrigger>
                  <TooltipContent>设置 [O]</TooltipContent>
                </Tooltip>
              </div>
            </div>
          </div>
        </div>

        {/* ===== UNIT FILTER BUTTONS (Feature 5) ===== */}
        {!isDeployment && (
          <div className="pointer-events-auto absolute top-[42px] left-0 right-0 z-10 flex items-center justify-center gap-1 px-2 py-1">
            {UNIT_TYPE_LIST.map(type => {
              const counts = unitTypeCounts[type];
              const isActive = unitFilter === type;
              const totalAlive = (counts?.red ?? 0) + (counts?.blue ?? 0);
              if (totalAlive === 0) return null;
              return (
                <Tooltip key={type}>
                  <TooltipTrigger asChild>
                    <button
                      className={`flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] transition-all duration-200 cursor-pointer border ${
                        isActive 
                          ? 'bg-white/15 border-amber-500/60 shadow-md shadow-amber-900/20' 
                          : 'bg-black/40 border-white/10 hover:bg-white/10 hover:border-white/20'
                      }`}
                      onClick={() => setUnitFilter(isActive ? null : type)}
                    >
                      <span className="text-red-400 opacity-80">{UNIT_ICONS[type]}</span>
                      <span className="text-gray-300">
                        <span className="text-red-300">{counts?.red ?? 0}</span>
                        <span className="text-gray-600 mx-px">:</span>
                        <span className="text-blue-300">{counts?.blue ?? 0}</span>
                      </span>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="text-[10px]">
                    {UNIT_CONFIGS[type]?.name} ({totalAlive}存活) · 按键 {UNIT_TYPE_LIST.indexOf(type) + 1 === 10 ? '0' : UNIT_TYPE_LIST.indexOf(type) + 1}
                  </TooltipContent>
                </Tooltip>
              );
            })}
            {unitFilter && (
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    className="flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] bg-amber-700/50 border border-amber-500/50 text-amber-300 transition-all duration-200 cursor-pointer"
                    onClick={() => setUnitFilter(null)}
                  >
                    <X className="w-2.5 h-2.5" />
                    全部
                  </button>
                </TooltipTrigger>
                <TooltipContent className="text-[10px]">清除筛选</TooltipContent>
              </Tooltip>
            )}
          </div>
        )}

                {/* [REMOVED] LEFT PANEL - merged into bottom bar tabs */}

        {/* [REMOVED] BATTLE STATISTICS PANEL per user request */}

        {/* [REMOVED] BOTTOM BAR v2 - per user request */}


        {/* [REMOVED] ACTION HISTORY PANEL per user request */}

                {/* [REMOVED] MAP LEGEND - merged into bottom bar tabs */}

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
              <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowSavePanel(false)} />
              <Card className="relative bg-black/90 backdrop-blur-md border-amber-500/30 text-white shadow-2xl max-w-sm w-full mx-4">
                <CardHeader className="pb-2 pt-4 px-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Save className="w-5 h-5 text-amber-400" />
                      <CardTitle className="text-base">存档 / 读档</CardTitle>
                    </div>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-white" onClick={() => setShowSavePanel(false)}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="px-6 pb-4 space-y-2">
                  {([1, 2, 3] as const).map(slot => {
                    const info = (() => {
                      try {
                        const infoStr = localStorage.getItem(`tactical-save-${slot}-info`);
                        return infoStr ? JSON.parse(infoStr) as SaveSlotInfo : null;
                      } catch {
                        return null;
                      }
                    })();
                    const canSave = phase !== 'gameOver' && phase !== 'deployment' && currentFaction === 'red' && !isAiProcessing && !state.isAnimating;
                    return (
                      <div key={slot} className="bg-white/5 border border-white/10 rounded-lg p-3 space-y-2">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="outline" className="text-amber-400 border-amber-500/40 text-xs font-bold">存档 {slot}</Badge>
                            {info ? (
                              <div className="flex items-center gap-1.5 text-[10px] text-gray-400">
                                <span>第{info.turn}回合</span>
                                <span className="text-gray-600">|</span>
                                <span className={info.faction === 'red' ? 'text-red-400' : 'text-blue-400'}>
                                  {info.faction === 'red' ? '红方' : '蓝方'}
                                </span>
                                <span className="text-gray-600">|</span>
                                <span className="text-red-400">红{info.redAlive}</span>
                                <span className="text-gray-600">:</span>
                                <span className="text-blue-400">蓝{info.blueAlive}</span>
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
                            onClick={() => {
                              useGameStore.getState().saveGame(slot);
                              setShowSavePanel(false);
                              setSaveToast(`💾 已保存到存档 ${slot}`);
                              setTimeout(() => setSaveToast(null), 2000);
                            }}
                            disabled={!canSave}
                          >
                            保存
                          </Button>
                          <Button
                            size="sm"
                            className="h-6 px-2.5 bg-blue-700 hover:bg-blue-600 text-white text-[10px] flex-1"
                            onClick={() => {
                              useGameStore.getState().loadGame(slot);
                              setShowSavePanel(false);
                              setSaveToast(`📂 已读取存档 ${slot}`);
                              setTimeout(() => setSaveToast(null), 2000);
                            }}
                            disabled={!info}
                          >
                            读取
                          </Button>
                          {info && (
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 px-2 text-red-400 hover:text-red-300 hover:bg-red-900/30 text-[10px]"
                              onClick={() => {
                                useGameStore.getState().deleteSave(slot);
                                setShowSavePanel(false);
                                setSaveToast(`🗑️ 已删除存档 ${slot}`);
                                setTimeout(() => setSaveToast(null), 2000);
                              }}
                            >
                              删除
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

        {/* ===== Settings Panel Overlay ===== */}
        <AnimatePresence>
          {showSettingsPanel && (
            <motion.div
              className="absolute inset-0 z-[56] flex items-center justify-center"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2 }}
            >
              <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setShowSettingsPanel(false)} />
              <Card className="relative bg-black/90 backdrop-blur-md border-amber-500/30 text-white shadow-2xl max-w-sm w-full mx-4">
                <CardHeader className="pb-2 pt-4 px-6">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Settings className="w-5 h-5 text-amber-400" />
                      <CardTitle className="text-base">⚙️ 游戏设置</CardTitle>
                    </div>
                    <Button size="sm" variant="ghost" className="h-7 w-7 p-0 text-gray-400 hover:text-white" onClick={() => setShowSettingsPanel(false)}>
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                </CardHeader>
                <CardContent className="px-6 pb-4 space-y-4">
                  {/* Volume Slider */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-gray-300">🔊 音量</span>
                      <span className="text-xs text-amber-400 font-bold">{settings.volume}%</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="range"
                        min="0"
                        max="100"
                        value={settings.volume}
                        onChange={(e) => {
                          const v = parseInt(e.target.value);
                          updateSetting('volume', v);
                          // Integrate with audio system
                          import('@/game/audio').then(({ setVolume }) => {
                            setVolume(v / 100);
                          }).catch(() => {});
                        }}
                        className="flex-1 h-1.5 bg-white/10 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-3 [&::-webkit-slider-thumb]:h-3 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-amber-400 [&::-webkit-slider-thumb]:cursor-pointer"
                      />
                    </div>
                  </div>

                  <Separator className="bg-white/10" />

                  {/* Toggle Switches */}
                  {/* Confirm End Turn */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <div className="text-sm text-gray-300">确认结束回合</div>
                      <div className="text-[10px] text-gray-500">结束回合前弹出确认对话框</div>
                    </div>
                    <button
                      className={`w-10 h-5 rounded-full relative transition-colors duration-200 cursor-pointer ${settings.confirmEndTurn ? 'bg-amber-500' : 'bg-white/20'}`}
                      onClick={() => updateSetting('confirmEndTurn', !settings.confirmEndTurn)}
                    >
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${settings.confirmEndTurn ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>

                  {/* Show Damage Numbers */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <div className="text-sm text-gray-300">显示伤害数字</div>
                      <div className="text-[10px] text-gray-500">在3D场景中显示浮动伤害/治疗数字</div>
                    </div>
                    <button
                      className={`w-10 h-5 rounded-full relative transition-colors duration-200 cursor-pointer ${settings.showDamageNumbers ? 'bg-amber-500' : 'bg-white/20'}`}
                      onClick={() => updateSetting('showDamageNumbers', !settings.showDamageNumbers)}
                    >
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${settings.showDamageNumbers ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>

                  {/* Show Grid Lines */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <div className="text-sm text-gray-300">显示网格线</div>
                      <div className="text-[10px] text-gray-500">显示地形格子边框</div>
                    </div>
                    <button
                      className={`w-10 h-5 rounded-full relative transition-colors duration-200 cursor-pointer ${settings.showGridLines ? 'bg-amber-500' : 'bg-white/20'}`}
                      onClick={() => updateSetting('showGridLines', !settings.showGridLines)}
                    >
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${settings.showGridLines ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>

                  {/* v70.0: Show Coordinates Toggle */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <div className="text-sm text-gray-300">显示坐标 [C]</div>
                      <div className="text-[10px] text-gray-500">在地图上显示格子坐标</div>
                    </div>
                    <button
                      className={`w-10 h-5 rounded-full relative transition-colors duration-200 cursor-pointer ${settings.showCoordinates ? 'bg-amber-500' : 'bg-white/20'}`}
                      onClick={() => updateSetting('showCoordinates', !settings.showCoordinates)}
                    >
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${settings.showCoordinates ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>

                  {/* v49.0: Show Turn Timer Toggle */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <div className="text-sm text-gray-300">显示回合计时</div>
                      <div className="text-[10px] text-gray-500">在顶部显示回合倒计时</div>
                    </div>
                    <button
                      className={`w-10 h-5 rounded-full relative transition-colors duration-200 cursor-pointer ${settings.showTurnTimer !== false ? 'bg-amber-500' : 'bg-white/20'}`}
                      onClick={() => updateSetting('showTurnTimer', settings.showTurnTimer === false)}
                    >
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${settings.showTurnTimer !== false ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>

                  {/* v52.0: Auto-select Next Unit Toggle */}
                  <div className="flex items-center justify-between">
                    <div className="space-y-0.5">
                      <div className="text-sm text-gray-300">自动选择下一单位</div>
                      <div className="text-[10px] text-gray-500">单位行动后自动选中下一个可用单位</div>
                    </div>
                    <button
                      className={`w-10 h-5 rounded-full relative transition-colors duration-200 cursor-pointer ${settings.autoSelectNextUnit ? 'bg-amber-500' : 'bg-white/20'}`}
                      onClick={() => updateSetting('autoSelectNextUnit', !settings.autoSelectNextUnit)}
                    >
                      <div className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-200 ${settings.autoSelectNextUnit ? 'translate-x-5' : 'translate-x-0.5'}`} />
                    </button>
                  </div>

                  {/* Turn Time Limit Setting (v23.0) */}
                  <div className="flex items-center justify-between py-1">
                    <div>
                      <div className="text-sm text-gray-300">回合时限</div>
                      <div className="text-[10px] text-gray-500">
                        {settings.turnTimeLimit ? `每回合 ${settings.turnTimeLimit} 秒` : '不限时'}
                      </div>
                    </div>
                    <div className="flex items-center gap-1">
                      {[0, 30, 60, 90, 120].map(sec => (
                        <button
                          key={sec}
                          className={`px-1.5 py-0.5 rounded text-[10px] transition-all ${
                            (settings.turnTimeLimit || 0) === sec
                              ? 'bg-amber-500 text-white font-bold'
                              : 'bg-white/10 text-gray-400 hover:bg-white/20'
                          }`}
                          onClick={() => updateSetting('turnTimeLimit', sec || null)}
                        >
                          {sec === 0 ? '无' : sec >= 60 ? `${sec / 60}m` : `${sec}s`}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="text-[10px] text-gray-500 mt-2 text-center">
                    设置自动保存 · 按 Esc 或点击外部关闭
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ===== Confirm End Turn Dialog ===== */}
        <AnimatePresence>
          {showEndTurnConfirm && (
            <motion.div
              className="absolute bottom-20 left-1/2 -translate-x-1/2 z-[55]"
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.15 }}
            >
              <Card className="bg-black/90 backdrop-blur-md border-amber-500/40 text-white shadow-2xl px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-amber-400">确定结束回合？</span>
                  {/* v38.0: Show count of remaining units that can still act */}
                  {(() => {
                    const st = useGameStore.getState();
                    const remaining = st.units.filter(u => u.faction === 'red' && u.isAlive && (u.canMove || u.canAttack)).length;
                    if (remaining > 0) {
                      return <span className="text-[11px] text-orange-300 ml-1">({remaining}个单位可行动)</span>;
                    }
                    return null;
                  })()}
                  <Button
                    size="sm"
                    className="h-7 px-3 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold"
                    onClick={() => {
                      setShowEndTurnConfirm(false);
                      useGameStore.getState().onEndTurn();
                    }}
                  >
                    确定
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-3 border-white/20 hover:bg-white/10 text-gray-300 hover:text-white text-xs"
                    onClick={() => setShowEndTurnConfirm(false)}
                  >
                    取消
                  </Button>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
        {/* ===== v91.0: Confirm Retreat Dialog ===== */}
        <AnimatePresence>
          {showRetreatConfirm && (
            <motion.div
              className="absolute bottom-20 left-1/2 -translate-x-1/2 z-[55]"
              initial={{ opacity: 0, y: 10, scale: 0.95 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: 10, scale: 0.95 }}
              transition={{ duration: 0.15 }}
            >
              <Card className="bg-black/90 backdrop-blur-md border-red-500/40 text-white shadow-2xl px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="text-sm font-bold text-red-400">确定撤退？此操作无法撤销。</span>
                  <Button
                    size="sm"
                    className="h-7 px-3 bg-red-600 hover:bg-red-500 text-white text-xs font-bold"
                    onClick={() => {
                      setShowRetreatConfirm(false);
                      useGameStore.getState().onRetreatUnit();
                    }}
                  >
                    确认
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-3 border-white/20 hover:bg-white/10 text-gray-300 hover:text-white text-xs"
                    onClick={() => setShowRetreatConfirm(false)}
                  >
                    取消
                  </Button>
                </div>
              </Card>
            </motion.div>
          )}
        </AnimatePresence>
        {/* ===== v92.0: Kill Streak Banner (center screen) ===== */}
        <AnimatePresence>
          {killStreakBanner && (
            <motion.div
              key={killStreakBanner.key}
              className="absolute inset-0 z-[65] flex items-center justify-center pointer-events-none"
              initial={{ opacity: 0, scale: 0.5 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 1.2, y: -20 }}
              transition={{ duration: 0.3, ease: 'easeOut' }}
            >
              <div className="flex flex-col items-center gap-1">
                <div className="text-5xl mb-1">{killStreakBanner.icon}</div>
                <div className="px-6 py-3 rounded-xl bg-gradient-to-r from-amber-900/90 via-yellow-800/90 to-amber-900/90 border-2 border-yellow-400/60 shadow-2xl shadow-yellow-500/30 backdrop-blur-sm">
                  <div className="text-2xl font-black text-yellow-300 tracking-wider drop-shadow-[0_0_10px_rgba(253,224,71,0.8)]">
                    {killStreakBanner.label}
                  </div>
                  <div className="text-sm text-yellow-100/80 font-medium mt-0.5 text-center">
                    {killStreakBanner.attackerName}
                  </div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
        {/* ===== Combat Result Toasts (Right side, above minimap) ===== */}
        {/* v88.0: Moved to right-2 to avoid overlap with capture/reinforcement panels */}
        <div className="pointer-events-auto absolute top-12 right-2 z-20 flex flex-col gap-2 max-h-[60vh] overflow-hidden">
          <AnimatePresence>
            {combatToasts && combatToasts.slice(-3).map(toast => (
              <CombatResultToast 
                key={toast.id} 
                toast={toast} 
                onDismiss={(id) => useGameStore.getState().removeCombatToast(id)} 
              />
            ))}
          </AnimatePresence>
        </div>

        {/* Weather Change Notification Toast ===== */}
        <AnimatePresence>
          {weatherToast && (
            <motion.div
              className="absolute top-2 left-1/2 -translate-x-1/2 z-30 pointer-events-none"
              initial={{ opacity: 0, y: -30, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -20, scale: 0.95 }}
              transition={{ duration: 0.4, ease: 'easeOut' }}
            >
              <div className="flex items-center gap-2 px-4 py-2 rounded-lg bg-black/85 backdrop-blur-md border border-white/20 shadow-xl">
                <motion.span 
                  className="text-xl"
                  animate={{ rotate: [0, 10, -10, 0] }}
                  transition={{ duration: 1.5, repeat: Infinity, ease: 'easeInOut' }}
                >
                  {weatherToast.icon}
                </motion.span>
                <div>
                  <div className="text-xs font-bold text-white">{weatherToast.name}</div>
                  <div className="text-[10px] text-gray-400">{weatherToast.description}</div>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ===== v82.0: Reinforcement Arrival Notification ===== */}
        <AnimatePresence>
          {reinforcementNotif && (
            <motion.div
              key="reinforcement-notif"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: 10 }}
              className={`absolute bottom-20 left-1/2 -translate-x-1/2 z-50 px-4 py-2 rounded-lg text-xs font-bold flex items-center gap-2 pointer-events-none ${
                reinforcementNotif.faction === 'red' 
                  ? 'bg-red-950/90 border border-red-500/50 text-red-300' 
                  : 'bg-blue-950/90 border border-blue-500/50 text-blue-300'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              {reinforcementNotif.faction === 'red' ? '我方' : '敌方'}增援到达 +{reinforcementNotif.count} 单位
            </motion.div>
          )}
        </AnimatePresence>

        {/* ===== v82.0: Weather Transition Full-Screen Overlay ===== */}
        <AnimatePresence>
          {weatherTransition && (
            <motion.div
              key={`weather-overlay-${weatherTransition}`}
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.3 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.5 }}
              className="fixed inset-0 pointer-events-none z-20"
              style={{
                background: weatherTransition === 'rain' 
                  ? 'linear-gradient(180deg, transparent 0%, rgba(59, 130, 246, 0.1) 100%)'
                  : weatherTransition === 'snow'
                  ? 'linear-gradient(180deg, transparent 0%, rgba(255, 255, 255, 0.15) 100%)'
                  : weatherTransition === 'sandstorm'
                  ? 'linear-gradient(90deg, rgba(210, 180, 140, 0.15), transparent, rgba(210, 180, 140, 0.15))'
                  : weatherTransition === 'fog'
                  ? 'radial-gradient(ellipse at center, rgba(156, 163, 175, 0.15), rgba(156, 163, 175, 0.05))'
                  : 'none',
              }}
            />
          )}
        </AnimatePresence>

        {/* ===== Unit Comparison Mode Banner ===== */}
        {comparingUnit && (
          <motion.div
            className="pointer-events-auto absolute top-[42px] left-1/2 -translate-x-1/2 z-30"
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
          >
            <div className="flex items-center gap-2 px-4 py-1.5 rounded-lg bg-amber-900/80 backdrop-blur-md border border-amber-500/40 shadow-xl">
              <GitCompareArrows className="w-4 h-4 text-amber-400" />
              <span className="text-xs text-amber-300 font-medium">选择一个单位进行对比</span>
              <Button
                size="sm"
                variant="ghost"
                className="h-5 w-5 p-0 text-gray-400 hover:text-white"
                onClick={() => useGameStore.getState().setComparingUnit(null)}
              >
                <X className="w-3 h-3" />
              </Button>
            </div>
          </motion.div>
        )}

        {/* ===== Unit Comparison Modal ===== */}
        <AnimatePresence>
          {comparingUnit && selectedUnit && selectedUnit.id !== comparingUnit.id && (
            <UnitCompareModal
              unitA={comparingUnit}
              unitB={selectedUnit}
              onClose={() => useGameStore.getState().setComparingUnit(null)}
            />
          )}
        </AnimatePresence>

        {/* ===== Achievement Browser Modal ===== */}
        <AnimatePresence>
          {showAchievementBrowser && playerStats && (
            <AchievementBrowserModal
              stats={playerStats}
              onClose={() => setShowAchievementBrowser(false)}
              onReset={() => setPlayerStats(loadPlayerStats())}
            />
          )}
        </AnimatePresence>

        {/* ===== AI Tactical Advisor Panel ===== */}
        <AnimatePresence>
          {showAdvisor && (
            <motion.div
              initial={{ opacity: 0, x: 300 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 300 }}
              transition={{ type: 'spring', damping: 25, stiffness: 300 }}
              className="absolute right-2 top-[42px] w-80 max-h-[calc(100vh-100px)] z-[70] pointer-events-auto"
            >
              <div className="bg-gray-900/95 backdrop-blur-md border border-purple-500/30 rounded-lg shadow-2xl shadow-purple-900/20 overflow-hidden flex flex-col">
                {/* Header */}
                <div className="px-3 py-2 bg-gradient-to-r from-purple-900/40 to-indigo-900/40 border-b border-purple-500/20 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <div className="w-6 h-6 rounded-full bg-purple-600/30 flex items-center justify-center">
                      <Bot className="w-3.5 h-3.5 text-purple-300" />
                    </div>
                    <span className="text-sm font-bold text-purple-200">AI 战术顾问</span>
                    <Badge variant="outline" className="text-[9px] text-purple-400 border-purple-500/30 px-1.5">v1.0</Badge>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      className="text-purple-400 hover:text-purple-200 transition-colors p-1"
                      onClick={() => requestAdvisor()}
                      disabled={advisorLoading}
                      title="重新分析"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                    <button
                      className="text-gray-400 hover:text-white transition-colors p-1"
                      onClick={() => setShowAdvisor(false)}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Content */}
                <div className="flex-1 overflow-y-auto p-3 space-y-3" style={{ maxHeight: 'calc(100vh - 200px)' }}>
                  {/* Advice Display */}
                  {advisorLoading ? (
                    <div className="flex flex-col items-center py-8 gap-3">
                      <div className="w-8 h-8 border-2 border-purple-500/30 border-t-purple-400 rounded-full animate-spin" />
                      <span className="text-xs text-purple-300/70">AI 正在分析局势...</span>
                    </div>
                  ) : advisorAdvice ? (
                    <div className="space-y-2">
                      <div className="bg-purple-900/20 border border-purple-500/15 rounded-lg p-3">
                        <p className="text-xs text-gray-200 leading-relaxed whitespace-pre-line">{advisorAdvice}</p>
                      </div>
                    </div>
                  ) : (
                    <div className="text-center py-6 text-gray-500 text-xs">
                      点击上方按钮获取战术建议
                    </div>
                  )}

                  {/* Quick Question Buttons */}
                  {!advisorLoading && advisorAdvice && (
                    <div className="space-y-1.5">
                      <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">快速提问</div>
                      {[
                        { q: '哪个单位应该优先行动？', icon: '🎯' },
                        { q: '当前最大的威胁是什么？', icon: '⚠️' },
                        { q: '如何有效利用地形？', icon: '🏔️' },
                        { q: '敌方可能的下一步是什么？', icon: '🔍' },
                      ].map(item => (
                        <button
                          key={item.q}
                          className="w-full text-left px-2.5 py-1.5 bg-white/5 hover:bg-white/10 rounded-md text-[11px] text-gray-300 hover:text-white transition-colors flex items-center gap-1.5"
                          onClick={() => { setAdvisorQuestion(''); requestAdvisor(item.q); }}
                        >
                          <span>{item.icon}</span>
                          <span>{item.q}</span>
                        </button>
                      ))}
                    </div>
                  )}

                  {/* Custom Question Input */}
                  <div className="space-y-1.5">
                    <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">自由提问</div>
                    <div className="flex gap-1.5">
                      <input
                        type="text"
                        value={advisorQuestion}
                        onChange={(e) => setAdvisorQuestion(e.target.value)}
                        onKeyDown={(e) => { if (e.key === 'Enter' && advisorQuestion.trim()) { requestAdvisor(advisorQuestion.trim()); setAdvisorQuestion(''); } }}
                        placeholder="输入你的战术问题..."
                        className="flex-1 bg-white/5 border border-white/10 rounded-md px-2.5 py-1.5 text-xs text-white placeholder-gray-600 focus:outline-none focus:border-purple-500/50 transition-colors"
                      />
                      <button
                        className="px-2.5 py-1.5 bg-purple-600/30 hover:bg-purple-600/50 rounded-md text-purple-200 hover:text-white transition-colors disabled:opacity-30"
                        onClick={() => { if (advisorQuestion.trim()) { requestAdvisor(advisorQuestion.trim()); setAdvisorQuestion(''); } }}
                        disabled={!advisorQuestion.trim() || advisorLoading}
                      >
                        <Send className="w-3 h-3" />
                      </button>
                    </div>
                  </div>

                  {/* History */}
                  {advisorHistory.length > 1 && (
                    <div className="space-y-1.5">
                      <div className="text-[10px] text-gray-500 font-medium uppercase tracking-wider">历史记录 ({advisorHistory.length})</div>
                      <div className="space-y-1 max-h-40 overflow-y-auto">
                        {advisorHistory.slice(1).map((item, idx) => (
                          <div key={idx} className="bg-white/3 rounded-md p-2 cursor-pointer hover:bg-white/5 transition-colors" onClick={() => setAdvisorAdvice(item.answer)}>
                            <div className="text-[10px] text-purple-400 mb-0.5">{item.question}</div>
                            <div className="text-[10px] text-gray-400 line-clamp-2">{item.answer}</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

                {/* Footer */}
                <div className="px-3 py-1.5 border-t border-purple-500/10 text-[9px] text-gray-600 text-center">
                  基于 AI 分析 · 建议仅供参考
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* ===== Achievement Unlock Notifications ===== */}
        <div className="absolute top-20 right-4 z-[80] pointer-events-none flex flex-col gap-2">
          <AnimatePresence>
            {achievementNotifications.map((ach, idx) => (
              <AchievementUnlockToast
                key={`${ach.id}-${idx}`}
                achievement={ach}
                onDismiss={() => {
                  setAchievementNotifications(prev => prev.filter((_, i) => i !== idx));
                }}
                delay={idx * 600}
              />
            ))}
          </AnimatePresence>
        </div>

        {/* ===== GAME OVER OVERLAY ===== */}
        {phase === 'gameOver' && winner && (
          <GameOverPanel
            winner={winner}
            turn={turn}
            victoryReason={state.victoryReason}
            battleStats={state.battleStats}
            redAlive={redUnits.length}
            redLost={redLost}
            blueAlive={blueUnits.length}
            blueLost={blueLost}
            capturePoints={capturePoints}
            onRestart={() => useGameStore.getState().init()}
            onReturnHome={() => window.dispatchEvent(new CustomEvent('game:returnHome'))}
            isStrategicTacticalBattle={state.isStrategicTacticalBattle}
            allUnits={units}
            gameStartTime={gameStartTime}
            currentWeather={state.currentWeather}
          />
        )}

        {/* ===== Shift Key Shortcut Tooltip (Feature 6) ===== */}
        {shiftHeld && !isDeployment && phase !== 'gameOver' && (
          <div
            className="fixed z-[100] pointer-events-none bg-black/85 backdrop-blur-md border border-amber-500/30 rounded-lg px-3 py-2 shadow-xl"
            ref={cursorTooltipRef}
          >
            <div className="text-[10px] text-amber-400 font-bold mb-1 flex items-center gap-1">
              <Keyboard className="w-3 h-3" />
              快捷键提示
            </div>
            <div className="space-y-0.5">
              {contextShortcuts.map((s, i) => (
                <div key={i} className="flex items-center gap-1.5 text-[10px]">
                  {s.key && (
                    <kbd className="px-1 py-0.5 rounded bg-white/10 border border-white/20 text-amber-300 font-mono text-[9px] min-w-[28px] text-center">
                      {s.key}
                    </kbd>
                  )}
                  <span className="text-gray-300">{s.desc}</span>
                </div>
              ))}
            </div>
            <div className="text-[8px] text-gray-600 mt-1">松开 Shift 隐藏</div>
          </div>
        )}
      </div>
    </TooltipProvider>
  );
}
