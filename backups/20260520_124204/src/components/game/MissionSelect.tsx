'use client';

import { useState } from 'react';
import { motion } from 'framer-motion';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Play,
  Swords,
  Mountain,
  Castle,
  Clock,
  ChevronDown,
  ChevronUp,
  Target,
  Shield,
  MapPin,
  Users,
  Zap,
  CheckCircle2,
  XCircle,
  Timer,
  Trophy,
} from 'lucide-react';
import { MISSIONS } from '@/game/mission-engine';
import type { MissionDefinition } from '@/game/mission-types';

const DIFFICULTY_CONFIG = {
  easy: { label: '简单', color: 'text-green-400', bg: 'bg-green-900/30', border: 'border-green-500/30', stars: 1 },
  normal: { label: '普通', color: 'text-amber-400', bg: 'bg-amber-900/30', border: 'border-amber-500/30', stars: 2 },
  hard: { label: '困难', color: 'text-red-400', bg: 'bg-red-900/30', border: 'border-red-500/30', stars: 3 },
} as const;

interface MissionSelectProps {
  onStartMission: (mission: MissionDefinition) => void;
  onBack: () => void;
}

export default function MissionSelect({ onStartMission, onBack }: MissionSelectProps) {
  const [expandedId, setExpandedId] = useState<string | null>(null);

  return (
    <div className="min-h-screen flex flex-col bg-gray-900 text-white relative overflow-hidden">
      {/* Background */}
      <div className="absolute inset-0 z-0">
        <div className="absolute inset-0 bg-gradient-to-br from-gray-950 via-gray-900 to-slate-900" />
        <div className="absolute inset-0 opacity-20" style={{
          backgroundImage: `radial-gradient(circle at 30% 20%, rgba(245,158,11,0.15) 0%, transparent 50%),
                            radial-gradient(circle at 70% 80%, rgba(239,68,68,0.1) 0%, transparent 50%)`,
        }} />
        <div className="absolute top-20 left-1/4 w-[500px] h-[500px] bg-amber-500/5 rounded-full blur-[120px] animate-pulse" />
        <div className="absolute bottom-20 right-1/4 w-[400px] h-[400px] bg-red-500/5 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '1.5s' }} />
        <div className="absolute inset-0 opacity-[0.03]" style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '60px 60px',
        }} />
      </div>

      {/* Header */}
      <header className="flex-shrink-0 text-center pt-10 sm:pt-14 pb-6 relative z-10">
        <div className="flex items-center justify-center gap-3 mb-3">
          <Trophy className="w-8 h-8 text-amber-400" />
          <h1 className="text-3xl sm:text-5xl font-black tracking-wider bg-gradient-to-r from-amber-300 via-orange-400 to-red-500 bg-clip-text text-transparent">
            战役模式
          </h1>
        </div>
        <p className="text-sm text-gray-400 max-w-xl mx-auto px-4">
          选择一个战役任务，完成特定目标赢得胜利。每个任务都有独特的胜利条件和部署配置。
        </p>
      </header>

      {/* Mission Cards */}
      <main className="flex-1 flex flex-col items-center px-3 sm:px-4 pb-8 relative z-10">
        <div className="max-w-4xl w-full space-y-4">
          {MISSIONS.map((mission, index) => {
            const isExpanded = expandedId === mission.id;
            const diff = DIFFICULTY_CONFIG[mission.difficulty];
            const isLast = index === MISSIONS.length - 1;

            return (
              <motion.div
                key={mission.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: index * 0.1 }}
              >
                <Card
                  className={`bg-black/50 backdrop-blur-xl border overflow-hidden transition-all duration-300 cursor-pointer ${
                    isExpanded
                      ? 'border-amber-500/40 shadow-lg shadow-amber-500/10'
                      : 'border-white/10 hover:border-white/25'
                  }`}
                >
                  <div className={`h-0.5 ${isExpanded ? 'bg-gradient-to-r from-transparent via-amber-500/60 to-transparent' : 'bg-gradient-to-r from-transparent via-white/20 to-transparent'}`} />

                  {/* Card Header - always visible */}
                  <div
                    className="px-4 sm:px-6 py-4 flex items-start gap-4"
                    onClick={() => setExpandedId(isExpanded ? null : mission.id)}
                  >
                    {/* Mission Icon */}
                    <div className={`w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 ${
                      isExpanded ? 'bg-amber-900/40 border border-amber-500/30' : 'bg-white/5 border border-white/10'
                    }`}>
                      {mission.icon}
                    </div>

                    {/* Mission Info */}
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="text-xs text-gray-500 font-mono">
                          MISSION {index + 1}
                        </span>
                        <Badge className={`${diff.bg} ${diff.color} border ${diff.border} text-[10px]`}>
                          {'★'.repeat(diff.stars)}{'☆'.repeat(3 - diff.stars)} {diff.label}
                        </Badge>
                        {mission.turnLimit && (
                          <Badge variant="outline" className="border-white/20 text-gray-400 text-[10px] gap-1">
                            <Timer className="w-2.5 h-2.5" />
                            {mission.turnLimit}回合
                          </Badge>
                        )}
                      </div>
                      <h3 className="text-lg font-bold text-white mb-1">{mission.name}</h3>
                      <p className="text-xs text-gray-400 line-clamp-1">{mission.description}</p>
                    </div>

                    {/* Expand Icon */}
                    <div className="flex-shrink-0 mt-1">
                      {isExpanded ? (
                        <ChevronUp className="w-5 h-5 text-amber-400" />
                      ) : (
                        <ChevronDown className="w-5 h-5 text-gray-500" />
                      )}
                    </div>
                  </div>

                  {/* Expanded Content */}
                  {isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: 'auto', opacity: 1 }}
                      transition={{ duration: 0.3 }}
                      className="overflow-hidden"
                    >
                      <div className="px-4 sm:px-6 pb-5 space-y-4">
                        {/* Briefing */}
                        <div className="p-3 rounded-lg bg-white/5 border border-white/10">
                          <div className="flex items-center gap-1.5 text-amber-400 text-xs font-bold mb-2">
                            <Swords className="w-3.5 h-3.5" />
                            任务简报
                          </div>
                          <p className="text-xs text-gray-300 leading-relaxed">{mission.briefing}</p>
                        </div>

                        {/* Objectives */}
                        <div className="space-y-2">
                          <div className="flex items-center gap-1.5 text-amber-400 text-xs font-bold">
                            <Target className="w-3.5 h-3.5" />
                            胜利目标
                          </div>
                          <div className="space-y-1.5">
                            {mission.objectives.map(obj => (
                              <div
                                key={obj.id}
                                className="flex items-start gap-2 p-2 rounded-lg bg-white/5 border border-white/5 text-xs"
                              >
                                <div className="w-5 h-5 rounded-full bg-amber-900/40 border border-amber-500/30 flex items-center justify-center flex-shrink-0 mt-0.5">
                                  <Target className="w-2.5 h-2.5 text-amber-400" />
                                </div>
                                <span className="text-gray-300">{obj.description}</span>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Map & Deployment Info */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="p-3 rounded-lg bg-white/5 border border-white/5">
                            <div className="flex items-center gap-1.5 text-amber-400 text-xs font-bold mb-2">
                              <MapPin className="w-3.5 h-3.5" />
                              地图类型
                            </div>
                            <div className="text-xs text-gray-300">
                              {mission.mapType === 'random' && '随机地图 — 每局不同体验'}
                              {mission.mapType === 'mountain-pass' && '山地隘口 — 中央山脊，两处隘口'}
                              {mission.mapType === 'urban-warfare' && '城市攻防 — 中央城市群'}
                              {mission.mapType === 'river-valley' && '河谷突破 — 三座桥梁'}
                              {mission.mapType === 'desert-storm' && '沙漠风暴 — 中央要塞'}
                            </div>
                          </div>
                          <div className="p-3 rounded-lg bg-white/5 border border-white/5">
                            <div className="flex items-center gap-1.5 text-amber-400 text-xs font-bold mb-2">
                              <Users className="w-3.5 h-3.5" />
                              部队配置
                            </div>
                            <div className="text-xs text-gray-300">
                              红方: {mission.redDeploymentOverride.length} 个单位
                            </div>
                            <div className="text-xs text-gray-300">
                              蓝方: {mission.blueDeploymentOverride.length} 个单位
                            </div>
                          </div>
                        </div>

                        {/* Reward */}
                        <div className="flex items-center gap-2 text-xs">
                          <Trophy className="w-3.5 h-3.5 text-yellow-500" />
                          <span className="text-gray-400">奖励:</span>
                          <span className="text-yellow-400 font-medium">{mission.reward.description}</span>
                        </div>

                        {/* Start Button */}
                        <Button
                          className="w-full bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-500 hover:to-red-500 text-white font-bold py-3 shadow-lg shadow-amber-500/20 transition-all duration-300 hover:scale-[1.02] border border-amber-400/30"
                          onClick={(e) => {
                            e.stopPropagation();
                            onStartMission(mission);
                          }}
                        >
                          <Play className="w-4 h-4 mr-2" />
                          开始任务
                        </Button>
                      </div>
                    </motion.div>
                  )}
                </Card>

                {/* Connector line between missions */}
                {!isLast && (
                  <div className="flex justify-center py-1">
                    <div className="w-px h-4 bg-gradient-to-b from-amber-500/30 to-transparent" />
                  </div>
                )}
              </motion.div>
            );
          })}
        </div>

        {/* Back button */}
        <div className="mt-6">
          <Button
            variant="ghost"
            className="text-gray-400 hover:text-white hover:bg-white/5"
            onClick={onBack}
          >
            ← 返回主菜单
          </Button>
        </div>
      </main>
    </div>
  );
}
