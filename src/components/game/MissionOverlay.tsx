'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { useMissionStore } from '@/store/mission-store';
import { useGameStore } from '@/store/game-store';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Target,
  CheckCircle2,
  Clock,
  Trophy,
  XCircle,
  Timer,
  Swords,
  ChevronRight,
} from 'lucide-react';
import type { ObjectiveProgress, MissionResult } from '@/game/mission-types';

type NonNullMissionResult = Exclude<MissionResult, null>;

const RESULT_CONFIG: Record<NonNullMissionResult, { label: string; color: string; bg: string; icon: React.ReactNode }> = {
  victory: {
    label: '任务胜利',
    color: 'text-green-400',
    bg: 'bg-green-900/60 border-green-500/40',
    icon: <Trophy className="w-5 h-5 text-green-400" />,
  },
  defeat: {
    label: '任务失败',
    color: 'text-red-400',
    bg: 'bg-red-900/60 border-red-500/40',
    icon: <XCircle className="w-5 h-5 text-red-400" />,
  },
  turn_limit: {
    label: '回合用尽',
    color: 'text-orange-400',
    bg: 'bg-orange-900/60 border-orange-500/40',
    icon: <Timer className="w-5 h-5 text-orange-400" />,
  },
};

function ObjectiveItem({
  description,
  progress,
  isCurrent,
}: {
  description: string;
  progress: ObjectiveProgress;
  isCurrent: boolean;
}) {
  const pct = progress.target > 0 ? Math.min(100, Math.round((progress.current / progress.target) * 100)) : 0;

  return (
    <div className={`flex items-center gap-2 px-2 py-1.5 rounded-lg text-[11px] transition-all duration-300 ${
      progress.completed
        ? 'bg-green-900/20 border border-green-500/20'
        : isCurrent
          ? 'bg-amber-900/20 border border-amber-500/20'
          : 'bg-white/5 border border-white/5'
    }`}>
      <div className="flex-shrink-0">
        {progress.completed ? (
          <CheckCircle2 className="w-3.5 h-3.5 text-green-400" />
        ) : isCurrent ? (
          <ChevronRight className="w-3.5 h-3.5 text-amber-400 animate-pulse" />
        ) : (
          <Target className="w-3.5 h-3.5 text-gray-500" />
        )}
      </div>
      <div className="flex-1 min-w-0">
        <div className={`truncate mb-0.5 ${progress.completed ? 'text-green-300 line-through' : 'text-gray-300'}`}>
          {description}
        </div>
        {!progress.completed && (
          <div className="flex items-center gap-2">
            <Progress
              value={pct}
              className="h-1 flex-1 bg-white/10"
            />
            <span className="text-[10px] text-gray-400 tabular-nums whitespace-nowrap">
              {progress.current}/{progress.target}
            </span>
          </div>
        )}
      </div>
      {progress.completed && (
        <span className="text-green-400 text-[10px] font-bold flex-shrink-0">✓</span>
      )}
    </div>
  );
}

export default function MissionOverlay() {
  const currentMission = useMissionStore(s => s.currentMission);
  const missionState = useMissionStore(s => s.missionState);
  const turn = useGameStore(s => s.turn);

  if (!currentMission) return null;

  const { result } = missionState;
  const objectives = currentMission.objectives;
  const turnLimit = currentMission.turnLimit;
  const turnsRemaining = turnLimit ? Math.max(0, turnLimit - turn) : null;

  // Find the first non-completed objective as "current"
  const currentObjIdx = objectives.findIndex(
    obj => !missionState.objectivesProgress[obj.id]?.completed,
  );
  const isUrgent = turnsRemaining !== null && turnsRemaining <= 3 && turnsRemaining > 0 && !result;

  return (
    <div className="absolute top-14 right-3 z-40 w-56 pointer-events-none">
      <AnimatePresence>
        <motion.div
          initial={{ x: 60, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] }}
          className="pointer-events-auto"
        >
          <div
            className="rounded-xl backdrop-blur-md border shadow-xl overflow-hidden"
            style={{
              background: 'rgba(0,0,0,0.85)',
              borderColor: result ? undefined : 'rgba(245,158,11,0.25)',
            }}
          >
            {/* Header */}
            <div
              className={`px-3 py-2 flex items-center gap-2 border-b ${
                result
                  ? RESULT_CONFIG[result].bg
                  : 'bg-gradient-to-r from-amber-900/30 to-transparent border-amber-500/20'
              }`}
            >
              <span className="text-sm">{currentMission.icon}</span>
              <span className="text-xs font-bold text-white flex-1 truncate">
                {currentMission.name}
              </span>
              {result ? (
                <span className={`text-xs font-bold ${RESULT_CONFIG[result].color}`}>
                  {result === 'victory' ? '🏆' : '💀'}
                </span>
              ) : (
                <Swords className="w-3.5 h-3.5 text-amber-400" />
              )}
            </div>

            {/* Content */}
            <div className="p-2 space-y-2">
              {/* Turn counter */}
              {!result && (
                <div className="flex items-center justify-between px-2 py-1">
                  <div className="flex items-center gap-1 text-[10px] text-gray-400">
                    <Clock className="w-3 h-3" />
                    回合
                  </div>
                  <div className="text-xs font-bold text-white tabular-nums">{turn}</div>
                  {turnsRemaining !== null && (
                    <>
                      <div className="text-gray-600">/</div>
                      <div className={`text-xs font-bold tabular-nums ${isUrgent ? 'text-red-400 animate-pulse' : 'text-gray-400'}`}>
                        {turnsRemaining}
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* Objectives */}
              <div className="space-y-1.5">
                {objectives.map((obj, idx) => {
                  const progress = missionState.objectivesProgress[obj.id] ?? {
                    current: 0,
                    target: obj.targetCount ?? obj.turns ?? 1,
                    completed: false,
                  };
                  return (
                    <ObjectiveItem
                      key={obj.id}
                      description={obj.description}
                      progress={progress}
                      isCurrent={idx === currentObjIdx}
                    />
                  );
                })}
              </div>

              {/* Result Banner */}
              {result && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className={`rounded-lg p-2 flex items-center justify-center gap-2 border ${RESULT_CONFIG[result].bg}`}
                >
                  {RESULT_CONFIG[result].icon}
                  <span className={`text-xs font-bold ${RESULT_CONFIG[result].color}`}>
                    {RESULT_CONFIG[result].label}
                  </span>
                </motion.div>
              )}
            </div>
          </div>
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
