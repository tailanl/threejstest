'use client';

import { useEffect, useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import { motion } from 'framer-motion';
import { useGameStore } from '@/store/game-store';
import { useStrategicStore } from '@/store/strategic-store';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { Swords, Shield, Target, Eye, Footprints, Play, RotateCcw, Map as MapIcon, Radar, Wrench, Package, Plane, Rocket, Globe, Crosshair, ArrowLeftRight, ChevronRight, ChevronDown, Sparkles, Zap, Mountain, TreePine, Building2, Droplets, Waves, Flag, Hexagon, Fuel, Cpu, Code2, Gamepad2, Trophy, GraduationCap } from 'lucide-react';
import { UNIT_CONFIGS, MAP_TYPE_OPTIONS } from '@/game/config';
import type { AIDifficulty, MapType } from '@/game/types';
import type { GameMode } from '@/game/strategic-types';
import { FORCE_TEMPLATES } from '@/game/strategic-engine';
import { STRATEGIC_TERRAIN_CONFIGS } from '@/game/strategic-types';
import { useMissionStore } from '@/store/mission-store';
import type { MissionDefinition } from '@/game/mission-types';

// 动态加载 Three.js 组件（避免 SSR 问题）
// 添加 loading fallback 防止 Turbopack chunk 加载失败时显示错误页面
function LoadingFallback({ name }: { name: string }) {
  return (
    <div className="flex items-center justify-center w-full h-full min-h-[200px]">
      <div className="flex flex-col items-center gap-3">
        <div className="w-8 h-8 border-2 border-amber-500/30 border-t-amber-500 rounded-full animate-spin" />
        <span className="text-xs text-gray-300">加载 {name}...</span>
      </div>
    </div>
  );
}

const GameScene = dynamic(() => import('@/components/game/GameScene'), { ssr: false, loading: () => <LoadingFallback name="3D 场景" /> });
const GameUI = dynamic(() => import('@/components/game/GameUI'), { ssr: false, loading: () => <LoadingFallback name="游戏 UI" /> });
const StrategicMap = dynamic(() => import('@/components/game/StrategicMap'), { ssr: false, loading: () => <LoadingFallback name="战略地图" /> });
const GameEditor = dynamic(() => import('@/components/game/GameEditor'), { ssr: false, loading: () => <LoadingFallback name="编辑器" /> });
const ParticleBackground = dynamic(() => import('@/components/game/ParticleBackground'), { ssr: false, loading: () => <div className="absolute inset-0 bg-[#0a0a0f]" /> });
const MissionSelect = dynamic(() => import('@/components/game/MissionSelect'), { ssr: false, loading: () => <LoadingFallback name="战役选择" /> });

const UNIT_INFO = [
  { type: 'tank' as const, icon: Shield, color: 'text-red-400', glowColor: 'shadow-red-400/30' },
  { type: 'ifv' as const, icon: Footprints, color: 'text-orange-400', glowColor: 'shadow-orange-400/30' },
  { type: 'artillery' as const, icon: Target, color: 'text-yellow-400', glowColor: 'shadow-yellow-400/30' },
  { type: 'scout' as const, icon: Eye, color: 'text-green-400', glowColor: 'shadow-green-400/30' },
  { type: 'infantry' as const, icon: Swords, color: 'text-sky-400', glowColor: 'shadow-sky-400/30' },
  { type: 'sam' as const, icon: Radar, color: 'text-cyan-400', glowColor: 'shadow-cyan-400/30' },
  { type: 'engineer' as const, icon: Wrench, color: 'text-amber-400', glowColor: 'shadow-amber-400/30' },
  { type: 'supply' as const, icon: Package, color: 'text-emerald-400', glowColor: 'shadow-emerald-400/30' },
  { type: 'helicopter' as const, icon: Plane, color: 'text-purple-400', glowColor: 'shadow-purple-400/30' },
  { type: 'mlrs' as const, icon: Rocket, color: 'text-rose-400', glowColor: 'shadow-rose-400/30' },
];

const DIFFICULTY_OPTIONS: { value: AIDifficulty; label: string; description: string; color: string; stars: number }[] = [
  { value: 'easy', label: '简单', description: 'AI 决策随机，偶尔跳过攻击', color: 'from-green-600 to-green-700', stars: 1 },
  { value: 'normal', label: '普通', description: 'AI 决策合理，正常挑战', color: 'from-amber-600 to-amber-700', stars: 2 },
  { value: 'hard', label: '困难', description: 'AI 精确计算，全力进攻', color: 'from-red-600 to-red-700', stars: 3 },
];

const GAME_MODE_OPTIONS: { value: GameMode; label: string; subtitle: string; icon: React.ReactNode; description: string; features: string[]; gradient: string }[] = [
  {
    value: 'tactical',
    label: '战术模式',
    subtitle: 'TACTICAL',
    icon: <Crosshair className="w-10 h-10" />,
    description: '3D战场上的即时战术对抗，控制每个单位精确移动和攻击',
    features: ['10种单位类型', '10种地形', '3D战场视角', '逐单位操控', '战争迷雾', '5种预设地图', '装甲系统', '据点占领', '隐蔽侦察', '存档系统'],
    gradient: 'from-amber-500/20 to-orange-600/10',
  },
  {
    value: 'strategic',
    label: '战略模式',
    subtitle: 'STRATEGIC',
    icon: <Globe className="w-10 h-10" />,
    description: '在更大的地图上指挥整编部队，每格代表一个军事区域',
    features: ['7种部队编制', '10×8战略地图', '朝鲜半岛地形', '营级单位指挥', '战略战争迷雾', '攻防战役', '部署阶段', '据点控制'],
    gradient: 'from-red-500/20 to-rose-600/10',
  },
  {
    value: 'campaign' as GameMode,
    label: '战役模式',
    subtitle: 'CAMPAIGN',
    icon: <Trophy className="w-10 h-10" />,
    description: '完成预设战役任务，每个关卡拥有独特的胜利条件、地图和部队配置',
    features: ['3个战役关卡', '独特胜利条件', '自定义部署', '回合限制挑战', '任务进度追踪', '不同难度'],
    gradient: 'from-yellow-500/20 to-amber-600/10',
  },
];

// Strategic map terrain layout for mini preview
const MINI_MAP_LAYOUT = [
  ['plains', 'forest', 'highland', 'highland', 'mountain', 'highland', 'mountain', 'highland', 'forest', 'forest'],
  ['plains', 'plains', 'forest', 'mountain', 'mountain', 'mountain', 'mountain', 'forest', 'highland', 'forest'],
  ['plains', 'plains', 'forest', 'mountain', 'forest', 'mountain', 'mountain', 'forest', 'forest', 'forest'],
  ['plains', 'plains', 'plains', 'city', 'water', 'water', 'forest', 'plains', 'plains', 'city'],
  ['plains', 'city', 'plains', 'city', 'plains', 'forest', 'city', 'forest', 'forest', 'city'],
  ['city', 'plains', 'plains', 'city', 'plains', 'plains', 'city', 'forest', 'mountain', 'forest'],
  ['plains', 'city', 'plains', 'city', 'plains', 'forest', 'plains', 'mountain', 'forest', 'plains'],
  ['marshland', 'plains', 'city', 'city', 'plains', 'plains', 'plains', 'forest', 'plains', 'city'],
];

// Animated counter hook - smooth easing from 0 to target
function useAnimatedCounter(target: number, duration: number = 1500) {
  const [count, setCount] = useState(0);
  const hasStarted = useRef(false);

  useEffect(() => {
    if (hasStarted.current) return;
    hasStarted.current = true;
    
    const startTime = performance.now();
    let animationFrame: number;

    const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3);

    const animate = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      const easedProgress = easeOutCubic(progress);
      const currentValue = Math.round(easedProgress * target);
      
      setCount(currentValue);
      
      if (progress < 1) {
        animationFrame = requestAnimationFrame(animate);
      }
    };

    animationFrame = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(animationFrame);
  }, [target, duration]);

  return count;
}

export default function Home() {
  const [showGame, setShowGame] = useState(false);
  const [showMissionSelect, setShowMissionSelect] = useState(false);
  const [difficulty, setDifficulty] = useState<AIDifficulty>('normal');
  const [selectedMapType, setSelectedMapType] = useState<MapType>('random');
  const [hoveredMap, setHoveredMap] = useState<MapType | null>(null);
  const [gameMode, setGameMode] = useState<GameMode>('tactical');
  const [hoveredUnit, setHoveredUnit] = useState<string | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const [enableDeployment, setEnableDeployment] = useState(false);
  const [enableHeroes, setEnableHeroes] = useState(true);
  const [tutorialEnabled, setTutorialEnabled] = useState(true);
  const init = useGameStore(s => s.init);
  const initDeploymentAction = useGameStore(s => s.initDeployment);
  const initHeroSelectionAction = useGameStore(s => s.initHeroSelection);
  const initMissionAction = useGameStore(s => s.initMission);
  const phase = useGameStore(s => s.phase);

  // Animated counters
  const unitCount = useAnimatedCounter(10);
  const terrainCount = useAnimatedCounter(10);
  const modeCount = useAnimatedCounter(3);

  // Fade in on mount
  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), 100);
    return () => clearTimeout(timer);
  }, []);

  const handleStart = () => {
    if (gameMode === 'campaign') {
      // Go to mission select screen
      setShowMissionSelect(true);
      return;
    }
    if (gameMode === 'tactical') {
      if (enableHeroes && !enableDeployment) {
        initHeroSelectionAction(difficulty, selectedMapType);
      } else if (enableDeployment) {
        initDeploymentAction(difficulty, selectedMapType);
      } else {
        init(difficulty, selectedMapType);
      }
      useStrategicStore.getState().setGameMode('tactical');
    } else {
      if (enableDeployment) {
        useStrategicStore.getState().initStrategicDeployment(difficulty);
      } else {
        useStrategicStore.getState().initStrategic(difficulty);
      }
    }
    useMissionStore.getState().resetMission();
    setShowGame(true);
  };

  const handleStartMission = (mission: MissionDefinition) => {
    const missionDifficulty = mission.difficulty as AIDifficulty;
    useMissionStore.getState().startMission(mission);
    initMissionAction(
      missionDifficulty,
      mission.mapType as MapType,
      mission.redDeploymentOverride.map(d => ({ type: d.type, x: d.x, z: d.z })),
      mission.blueDeploymentOverride.map(d => ({ type: d.type, x: d.x, z: d.z })),
    );
    useStrategicStore.getState().setGameMode('tactical');
    setShowMissionSelect(false);
    setShowGame(true);
  };

  const handleMissionSelectBack = () => {
    setShowMissionSelect(false);
  };

  useEffect(() => {
    if (phase === 'gameOver') {
      // 可以在这里添加游戏结束的处理
    }
  }, [phase]);

  // Listen for return-home event from GameOverPanel
  useEffect(() => {
    const handleReturnHome = () => setShowGame(false);
    window.addEventListener('game:returnHome', handleReturnHome);
    return () => window.removeEventListener('game:returnHome', handleReturnHome);
  }, []);

  // Mode switch during gameplay
  const handleModeSwitch = () => {
    const currentMode = useStrategicStore.getState().gameMode;
    const newMode: GameMode = currentMode === 'tactical' ? 'strategic' : 'tactical';
    if (newMode === 'strategic') {
      const strategicState = useStrategicStore.getState();
      if (strategicState.forces.length === 0) {
        useStrategicStore.getState().initStrategic(difficulty);
      } else {
        useStrategicStore.getState().setGameMode('strategic');
      }
    } else {
      useStrategicStore.getState().setGameMode('tactical');
    }
  };

  // Get current effective game mode
  const effectiveGameMode = useStrategicStore(s => s.gameMode);

  // Show mission select screen
  if (showMissionSelect) {
    return <MissionSelect onStartMission={handleStartMission} onBack={handleMissionSelectBack} />;
  }

  if (!showGame) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-900 text-white relative overflow-hidden">
        {/* ===== ANIMATED BACKGROUND ===== */}
        <div className="absolute inset-0 z-0">
          <ParticleBackground />
          {/* Subtle gradient overlays on top of particle canvas */}
          <div className="absolute inset-0 opacity-30" style={{
            backgroundImage: `radial-gradient(circle at 20% 30%, rgba(245,158,11,0.12) 0%, transparent 50%),
                              radial-gradient(circle at 80% 70%, rgba(239,68,68,0.08) 0%, transparent 50%),
                              radial-gradient(circle at 50% 50%, rgba(251,191,36,0.06) 0%, transparent 60%)`,
          }} />
          {/* Animated glow orbs */}
          <div className="absolute top-10 left-1/4 w-[500px] h-[500px] bg-amber-500/5 rounded-full blur-[120px] animate-pulse" />
          <div className="absolute bottom-10 right-1/4 w-[400px] h-[400px] bg-red-500/5 rounded-full blur-[100px] animate-pulse" style={{ animationDelay: '1.5s' }} />
          {/* Military grid pattern overlay */}
          <div className="absolute inset-0 opacity-[0.03]" style={{
            backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                              linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
            backgroundSize: '60px 60px',
          }} />
          <style jsx>{`
            @keyframes fadeSlideUp {
              from { opacity: 0; transform: translateY(20px); }
              to { opacity: 1; transform: translateY(0); }
            }
            @keyframes shimmer {
              0% { background-position: -200% center; }
              100% { background-position: 200% center; }
            }
            @keyframes floatUp {
              0%, 100% { transform: translateY(0); }
              50% { transform: translateY(-6px); }
            }
            @keyframes borderGlow {
              0%, 100% { border-color: rgba(245,158,11,0.3); }
              50% { border-color: rgba(245,158,11,0.6); }
            }
            .glow-button {
              animation: glowPulse 2s ease-in-out infinite;
            }
            .fade-slide-up {
              animation: fadeSlideUp 0.6s ease-out forwards;
            }
            .shimmer-text {
              background-size: 200% auto;
              animation: shimmer 3s linear infinite;
            }
            .float-animation {
              animation: floatUp 3s ease-in-out infinite;
            }
          `}</style>
        </div>

        {/* ===== HERO SECTION ===== */}
        <header className={`flex-shrink-0 text-center pt-10 sm:pt-16 pb-4 sm:pb-8 relative z-10 transition-all duration-1000 ${isVisible ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-4'}`}>
          {/* Decorative top line */}
          <div className="flex items-center justify-center gap-4 mb-6">
            <div className="h-px w-16 sm:w-24 bg-gradient-to-r from-transparent to-amber-500/60" />
            <div className="w-2 h-2 bg-amber-500 rounded-full animate-pulse" />
            <div className="h-px w-16 sm:w-24 bg-gradient-to-l from-transparent to-amber-500/60" />
          </div>

          {/* Title with dramatic treatment */}
          <div className="flex items-center justify-center gap-2 sm:gap-4 mb-4">
            <Swords className="w-8 h-8 sm:w-12 sm:h-12 text-amber-400 float-animation" />
            <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black tracking-wider bg-gradient-to-r from-amber-300 via-orange-400 to-red-500 bg-clip-text text-transparent drop-shadow-lg">
              铁甲战棋
            </h1>
            <Shield className="w-8 h-8 sm:w-12 sm:h-12 text-amber-400 float-animation" style={{ animationDelay: '0.5s' }} />
          </div>

          {/* Subtitle with shimmer */}
          <p className="text-base sm:text-lg text-gray-300 max-w-2xl mx-auto mb-6 px-4">
            基于三维地形的回合制战棋游戏 — 指挥现代化合成旅，消灭一切来犯之敌
          </p>

          {/* Animated Statistics */}
          <div className="flex items-center justify-center gap-3 sm:gap-6 flex-wrap px-4">
            {[
              { value: unitCount, label: '单位类型', icon: Zap },
              { value: terrainCount, label: '地形种类', icon: Mountain },
              { value: modeCount, label: '游戏模式', icon: Gamepad2 },
            ].map((stat, i) => (
              <div key={stat.label} className="flex items-center gap-2 px-3 sm:px-4 py-2 rounded-full bg-white/10 border border-white/20 backdrop-blur-sm">
                <stat.icon className="w-3.5 h-3.5 text-amber-400" />
                <span className="text-xl sm:text-2xl font-bold text-amber-400 tabular-nums">{stat.value}</span>
                <span className="text-xs text-gray-300">{stat.label}</span>
              </div>
            ))}
          </div>
        </header>

        {/* ===== MAIN CONTENT ===== */}
        <main className="flex-1 flex flex-col items-center px-3 sm:px-4 pb-8 relative z-10">

          {/* ===== GAME MODE SELECTION ===== */}
          <Card className="bg-black/40 backdrop-blur-xl border border-white/15 max-w-5xl w-full mb-6 sm:mb-8 overflow-hidden">
            <div className="h-0.5 bg-gradient-to-r from-transparent via-amber-500/50 to-transparent" />
            <CardContent className="p-4 sm:p-6">
              <h3 className="text-sm font-bold mb-4 text-center flex items-center justify-center gap-2">
                <ArrowLeftRight className="w-4 h-4 text-amber-400" />
                选择游戏模式
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                {GAME_MODE_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    className={`relative rounded-xl border-2 p-4 sm:p-6 transition-all duration-300 cursor-pointer text-left group overflow-hidden ${
                      gameMode === opt.value
                        ? 'border-amber-400 bg-gradient-to-br shadow-lg shadow-amber-400/10 ' + opt.gradient
                        : 'border-white/15 bg-white/10 hover:border-white/25 hover:bg-white/15'
                    }`}
                    onClick={() => setGameMode(opt.value)}
                  >
                    {/* Background pattern */}
                    {gameMode === opt.value && (
                      <div className="absolute inset-0 opacity-5" style={{
                        backgroundImage: `repeating-linear-gradient(45deg, transparent, transparent 10px, rgba(245,158,11,0.3) 10px, rgba(245,158,11,0.3) 11px)`,
                      }} />
                    )}
                    {gameMode === opt.value && (
                      <div className="absolute top-3 right-3 z-10">
                        <Badge className="bg-amber-500 text-white text-[10px] shadow-lg shadow-amber-500/30">✓ 已选</Badge>
                      </div>
                    )}
                    <div className={`mb-3 transition-transform duration-300 group-hover:scale-110 ${gameMode === opt.value ? 'text-amber-400' : 'text-gray-300'}`}>
                      {opt.icon}
                    </div>
                    <div className="text-[10px] uppercase tracking-widest text-gray-300 mb-1">{opt.subtitle}</div>
                    <div className={`text-xl sm:text-2xl font-bold mb-2 ${gameMode === opt.value ? 'text-amber-400' : 'text-white'}`}>
                      {opt.label}
                    </div>
                    <div className="text-xs text-gray-300 mb-3 leading-relaxed">{opt.description}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {opt.features.map(f => (
                        <Badge key={f} variant="outline" className="text-[10px] border-white/25 text-gray-200 hover:border-amber-400/40 transition-colors">
                          {f}
                        </Badge>
                      ))}
                    </div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* ===== TACTICAL MODE CONTENT ===== */}
          {gameMode === 'tactical' && (
            <>
              {/* Unit Cards - Responsive Grid */}
              <div className="max-w-5xl w-full mb-6 sm:mb-8">
                <div className="flex items-center justify-center gap-2 mb-4">
                  <Swords className="w-4 h-4 text-amber-400" />
                  <h3 className="text-sm font-bold text-center">单位一览</h3>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3 sm:gap-4">
                  {UNIT_INFO.map(({ type, icon: Icon, color, glowColor }) => {
                    const config = UNIT_CONFIGS[type];
                    const isHovered = hoveredUnit === type;
                    return (
                      <Card
                        key={type}
                        className={`bg-black/40 backdrop-blur-xl border transition-all duration-300 cursor-pointer ${
                          isHovered
                            ? `border-amber-400/50 scale-[1.03] shadow-lg ${glowColor}`
                            : 'border-white/15 hover:border-white/25 hover:scale-[1.02]'
                        }`}
                        onMouseEnter={() => setHoveredUnit(type)}
                        onMouseLeave={() => setHoveredUnit(null)}
                      >
                        <CardContent className="p-3 sm:p-4 text-center">
                          <div className={`mx-auto mb-2 w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center bg-white/10 border border-white/20 transition-all duration-300 ${isHovered ? 'border-amber-400/30 bg-amber-400/10' : ''}`}>
                            <Icon className={`w-5 h-5 sm:w-6 sm:h-6 ${color} transition-transform duration-300 ${isHovered ? 'scale-110' : ''}`} />
                          </div>
                          <h3 className="text-sm font-bold mb-1">{config.name}</h3>
                          <p className="text-[10px] sm:text-xs text-gray-300 mb-2 leading-relaxed line-clamp-2 min-h-[2rem]">{config.description}</p>
                          {/* Stat bars */}
                          <div className="space-y-1.5">
                            {[
                              { label: 'HP', val: config.baseHp, max: 120, color: 'bg-green-500' },
                              { label: '攻击', val: config.stats.attack, max: 55, color: 'bg-orange-500' },
                              { label: '防御', val: config.stats.defense, max: 35, color: 'bg-sky-500' },
                              { label: '装甲', val: config.stats.armor, max: 40, color: 'bg-amber-500' },
                              { label: '穿甲', val: config.stats.armorPenetration, max: 38, color: 'bg-cyan-400' },
                              { label: '移动', val: config.stats.moveRange, max: 8, color: 'bg-purple-500' },
                              { label: '射程', val: config.stats.attackRange, max: 7, color: 'bg-red-500' },
                              { label: '视野', val: config.stats.vision, max: 6, color: 'bg-teal-500' },
                            ].map(stat => (
                              <div key={stat.label} className="flex items-center gap-1.5 text-[10px] sm:text-xs">
                                <span className="w-6 text-gray-300 text-right shrink-0">{stat.label}</span>
                                <div className="flex-1 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                  <div
                                    className={`h-full ${stat.color} rounded-full transition-all duration-500`}
                                    style={{ width: `${Math.round((stat.val / stat.max) * 100)}%` }}
                                  />
                                </div>
                                <span className="w-4 text-white font-medium text-right">{stat.val}</span>
                              </div>
                            ))}
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
                </div>
              </div>

              {/* Stats Comparison Table */}
              <Card className="bg-black/40 backdrop-blur-xl border border-white/15 max-w-5xl w-full mb-6 sm:mb-8 overflow-hidden">
                <div className="h-0.5 bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />
                <CardContent className="p-3 sm:p-4">
                  <h3 className="text-sm font-bold mb-3 text-center">📊 单位属性对比</h3>
                  <div className="overflow-x-auto -mx-2 px-2">
                    <table className="w-full text-[10px] sm:text-xs min-w-[640px]">
                      <thead>
                        <tr className="text-gray-300">
                          <th className="text-left py-1 px-1.5 sm:px-2 sticky left-0 bg-black/60 backdrop-blur-sm z-10">属性</th>
                          {UNIT_INFO.map(({ type, icon: Icon, color }) => {
                            const config = UNIT_CONFIGS[type];
                            return (
                              <th key={type} className="text-center py-1 px-1 sm:px-2 min-w-[55px]">
                                <Icon className={`w-3.5 h-3.5 mx-auto mb-0.5 ${color}`} />
                                <div className="truncate">{config.name}</div>
                              </th>
                            );
                          })}
                        </tr>
                      </thead>
                      <tbody>
                        {[
                          { label: '生命', key: 'baseHp', max: 120, color: 'bg-green-500' },
                          { label: '攻击', key: 'attack', max: 55, color: 'bg-orange-500' },
                          { label: '防御', key: 'defense', max: 35, color: 'bg-sky-500' },
                          { label: '移动', key: 'moveRange', max: 8, color: 'bg-purple-500' },
                          { label: '射程', key: 'attackRange', max: 7, color: 'bg-red-500' },
                          { label: '视野', key: 'vision', max: 6, color: 'bg-cyan-500' },
                        ].map(row => (
                          <tr key={row.key} className="border-t border-white/20">
                            <td className="py-1.5 px-1.5 sm:px-2 text-gray-300 font-medium sticky left-0 bg-black/60 backdrop-blur-sm z-10">{row.label}</td>
                            {UNIT_INFO.map(({ type }) => {
                              const config = UNIT_CONFIGS[type];
                              const val = row.key === 'baseHp' ? config.baseHp : (config.stats[row.key as keyof typeof config.stats] ?? 0);
                              const pct = Math.round((val / row.max) * 100);
                              return (
                                <td key={type} className="py-1.5 px-1 sm:px-2 text-center">
                                  <div className="flex items-center gap-1 justify-center">
                                    <div className="w-8 sm:w-12 h-1.5 bg-white/10 rounded-full overflow-hidden">
                                      <div className={`h-full ${row.color} rounded-full`} style={{ width: `${pct}%` }} />
                                    </div>
                                    <span className="text-white font-medium w-4 text-right">{val}</span>
                                  </div>
                                </td>
                              );
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* Map Selection */}
              <Card className="bg-black/40 backdrop-blur-xl border border-white/15 max-w-5xl w-full mb-6 sm:mb-8 overflow-hidden">
                <div className="h-0.5 bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />
                <CardContent className="p-3 sm:p-4">
                  <h3 className="text-sm font-bold mb-3 text-center flex items-center justify-center gap-2">
                    <MapIcon className="w-4 h-4 text-amber-400" />
                    地图选择
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-3">
                    {MAP_TYPE_OPTIONS.map(opt => (
                      <div key={opt.type} className="relative">
                        <button
                          className={`relative w-full rounded-lg border-2 p-3 transition-all duration-200 cursor-pointer text-left ${
                            selectedMapType === opt.type
                              ? 'border-amber-400 bg-amber-900/30 shadow-lg shadow-amber-400/10'
                              : 'border-white/15 bg-white/10 hover:border-white/30 hover:bg-white/15'
                          }`}
                          onClick={() => setSelectedMapType(opt.type)}
                          onMouseEnter={() => setHoveredMap(opt.type)}
                          onMouseLeave={() => setHoveredMap(null)}
                        >
                          {selectedMapType === opt.type && (
                            <div className="absolute top-1.5 right-1.5">
                              <Badge className="bg-amber-500 text-white text-[10px]">✓</Badge>
                            </div>
                          )}
                          <div className="flex items-center gap-2 mb-1.5">
                            <div
                              className="w-5 h-5 rounded-sm flex-shrink-0 border border-white/20"
                              style={{
                                background: `linear-gradient(135deg, ${opt.color} 60%, ${opt.secondaryColor} 100%)`,
                              }}
                            />
                            <div className={`text-xs sm:text-sm font-bold ${selectedMapType === opt.type ? 'text-amber-400' : 'text-white'}`}>
                              {opt.name}
                            </div>
                          </div>
                          <div className="text-[10px] text-gray-300 leading-relaxed line-clamp-2">{opt.description}</div>
                        </button>
                        {hoveredMap === opt.type && (
                          <div className="absolute top-full left-1/2 -translate-x-1/2 mt-2 z-50 bg-black/90 backdrop-blur-md border border-white/20 rounded-lg p-2 text-[9px] font-mono text-gray-300 whitespace-pre shadow-xl pointer-events-none">
                            {opt.type === 'random' && '随机地形\n每局不同体验'}
                            {opt.type === 'mountain-pass' && '▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲\n▲ · · · · · · · · · ▲▲▲▲▲▲\n▲ · · ○ ○ · · · · · ▲▲▲▲▲▲\n▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲\n▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲\n▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲\n▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲\n▲▲▲▲▲▲▲▲▲▲ · · ○ ○ · · ▲▲\n▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲\n▲ · · · · · · · · · · · · · ▲\n▲ · · · · · · · · · · · · · ▲\n▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲▲'}
                            {opt.type === 'river-valley' && '· · · · · · · · · · · · · · ·\n· · C · · · · · · · · · C · ·\n· · 🌉 · · · · 🌉 · · · 🌉 ·\n≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈\n≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈≈\n· · 🌉 · · · · C · · · 🌉 ·\n· · · · · · · · · · · · · · ·\n· · · · · · · · · · · · · · ·'}
                            {opt.type === 'urban-warfare' && '· · · · · · · · · · · · · · ·\n· · · · · 🏠🏠🏠🏠🏠🏠 · · · ·\n· · · · 🏠🏠🏠🏠🏠🏠🏠🏠 · ·\n· · · · 🏠🏠🏰🏠🏠🏰🏠🏠 · ·\n· · · · 🏠🏠🏠🏠🏠🏠🏠🏠 · ·\n· · · · 🏠🏠🏠🏠🏠🏠🏠🏠 · ·\n· · · · 🏠🏠🏠🏠🏠🏠🏠🏠 · ·\n· · · · · 🏠🏠🏠🏠🏠🏠 · · ·\n· · · · · · · · · · · · · · ·'}
                            {opt.type === 'desert-storm' && '🏜️🏜️🏜️🏜️🏜️🏜️🏜️🏜️🏜️🏜️🏜️🏜️🏜️🏜️🏜️\n🏜️🌲🏜️🏜️🏜️🏜️🏜️🏜️🏜️🏜️🌲🏜️🏜️🏜️🏜️\n🏜️🏜️🏜️🏜️🏜️🏰🏰🏰🏰🏜️🏜️🏜️🏜️🏜️🏜️\n🏜️🏜️🏜️🏠🏠🏠🏠🏠🏠🏜️🏜️🏜️🏜️🏜️🏜️\n🏜️🏜️🏜️🏠🏰🏰🏰🏠🏠🏜️🏜️🏜️🏜️🏜️🏜️\n🏜️🌲🏜️🏜️🏜️🏜️🏜️🏜️🏜️🌲🏜️🏜️🏜️🏜️🏜️\n🏜️🏜️🏜️🏜️🏜️🏜️🏜️🏜️🏜️🏜️🏜️🏜️🏜️🏜️🏜️'}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Terrain System */}
              <Card className="bg-black/40 backdrop-blur-xl border border-white/15 max-w-5xl w-full mb-6 sm:mb-8 overflow-hidden">
                <div className="h-0.5 bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />
                <CardContent className="p-3 sm:p-4">
                  <h3 className="text-sm font-bold mb-3 text-center">🌍 地形系统</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-3 text-xs">
                    {[
                      { name: '平原', color: '#7cb342', desc: '正常通行', icon: Hexagon },
                      { name: '森林', color: '#2e7d32', desc: '防+15, 视野-1, 遮挡', icon: TreePine },
                      { name: '山地', color: '#78909c', desc: '防+25, 视野+2, 阻挡视线', icon: Mountain },
                      { name: '水域', color: '#1565c0', desc: '不可通行', icon: Waves },
                      { name: '城市', color: '#8d6e63', desc: '防+20, 视野+1', icon: Building2 },
                      { name: '公路', color: '#9e9e9e', desc: '移速x2', icon: ChevronRight },
                      { name: '沼泽', color: '#5d4037', desc: '仅步兵, 防御-10, 视野-1', icon: Droplets },
                      { name: '桥梁', color: '#d7ccc8', desc: '跨越水域', icon: Flag },
                      { name: '沙漠', color: '#fdd835', desc: '移动+50%, 视野+1', icon: Zap },
                      { name: '要塞', color: '#455a64', desc: '防+35, 攻+10, 视野+1', icon: Shield },
                    ].map(t => (
                      <div key={t.name} className="flex items-center gap-2 p-2 rounded-lg bg-white/10 border border-white/15 hover:border-white/25 transition-colors">
                        <div className="w-8 h-8 rounded-md flex-shrink-0 border border-white/20 flex items-center justify-center" style={{ backgroundColor: t.color + '30' }}>
                          <t.icon className="w-4 h-4" style={{ color: t.color }} />
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-white text-xs">{t.name}</div>
                          <div className="text-gray-300 text-[10px] truncate">{t.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>

              {/* Operations Guide */}
              <Card className="bg-black/40 backdrop-blur-xl border border-white/15 max-w-5xl w-full mb-6 sm:mb-8 overflow-hidden">
                <div className="h-0.5 bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />
                <CardContent className="p-3 sm:p-4">
                  <h3 className="text-sm font-bold mb-3 text-center">🎮 操作指南</h3>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4 text-xs text-gray-300">
                    <div className="space-y-1.5 p-3 rounded-lg bg-white/10 border border-white/15">
                      <div className="font-medium text-amber-400 text-sm mb-2">基本操作</div>
                      <div>🖱️ 左键点击：选择/移动/攻击</div>
                      <div>🖱️ 右键拖拽：平移视角</div>
                      <div>🖱️ 滚轮：缩放视角</div>
                    </div>
                    <div className="space-y-1.5 p-3 rounded-lg bg-white/10 border border-white/15">
                      <div className="font-medium text-amber-400 text-sm mb-2">回合流程</div>
                      <div>1. 选择己方单位</div>
                      <div>2. 移动到合适位置</div>
                      <div>3. 攻击范围内敌人</div>
                    </div>
                    <div className="space-y-1.5 p-3 rounded-lg bg-white/10 border border-white/15">
                      <div className="font-medium text-amber-400 text-sm mb-2">视野机制</div>
                      <div>👁️ 侦察车视野6（最高）</div>
                      <div>🏔️ 站山地视野+2，穿山阻挡</div>
                      <div>🌲 森林遮挡视野（-0.5/格）</div>
                      <div>🏜️ 沙漠/城市/要塞视野+1</div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {/* ===== STRATEGIC MODE CONTENT ===== */}
          {gameMode === 'strategic' && (
            <>
              {/* Strategic Mode with Mini Map Preview */}
              <div className="max-w-5xl w-full mb-6 sm:mb-8">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
                  {/* Left: Mini strategic map */}
                  <Card className="bg-black/40 backdrop-blur-xl border border-white/15 overflow-hidden">
                    <div className="h-0.5 bg-gradient-to-r from-transparent via-red-500/40 to-transparent" />
                    <CardContent className="p-3 sm:p-4">
                      <h3 className="text-sm font-bold mb-3 text-center flex items-center justify-center gap-2">
                        <MapIcon className="w-4 h-4 text-red-400" />
                        朝鲜半岛战略地图
                      </h3>
                      {/* 10×8 mini map grid */}
                      <div className="grid gap-0.5 mx-auto" style={{ gridTemplateColumns: 'repeat(10, 1fr)', maxWidth: '320px' }}>
                        {MINI_MAP_LAYOUT.flat().map((terrain, i) => {
                          const config = STRATEGIC_TERRAIN_CONFIGS[terrain as keyof typeof STRATEGIC_TERRAIN_CONFIGS];
                          const x = i % 10;
                          const y = Math.floor(i / 10);
                          // Mark deployment positions
                          const isRedDeploy = (x === 0 && [3,4,5,6].includes(y)) || (x === 1 && [0,1,7].includes(y));
                          const isBlueDeploy = (x === 9 && [2,3,4,5].includes(y)) || (x === 8 && [1,6,7].includes(y));
                          return (
                            <div
                              key={i}
                              className={`aspect-square rounded-sm border transition-all duration-200 relative ${
                                terrain === 'water' ? 'border-blue-400/20' : 'border-white/20'
                              } ${isRedDeploy ? 'ring-1 ring-red-400/50' : ''} ${isBlueDeploy ? 'ring-1 ring-blue-400/50' : ''}`}
                              style={{ backgroundColor: config.color + (isRedDeploy || isBlueDeploy ? '' : '80') }}
                              title={`${['新义州','朔州','惠山','盖马高原','赴战岭','长津','咸兴','端川','金策','罗先','宣川','博川','熙川','狼林山','赴战','丰山','北青','利原','吉州','清津','定州','安州','球场','铁原','平康','洗浦','淮阳','通川','明川','镜城','盐州','肃川','顺安','平壤','谷山','伊川','金化','高城','安边','元山','延安','海州','沙里院','开城','涟川','加平','春川','洪川','横城','江陵','仁川','金浦','坡州','首尔','河南','骊州','原州','堤川','宁越','三陟','华城','安养','果川','城南','龙仁','阴城','忠州','丹阳','蔚珍','浦项','牙山','天安','世宗','大田','公州','报恩','尚州','义城','盈德','釜山'][i]}`}
                            >
                              {isRedDeploy && <div className="absolute inset-0 flex items-center justify-center"><div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" /></div>}
                              {isBlueDeploy && <div className="absolute inset-0 flex items-center justify-center"><div className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" style={{ animationDelay: '0.5s' }} /></div>}
                            </div>
                          );
                        })}
                      </div>
                      <div className="flex items-center justify-center gap-4 mt-3 text-[10px] text-gray-300">
                        <div className="flex items-center gap-1"><div className="w-2 h-2 bg-red-500 rounded-full" /> 红方部署</div>
                        <div className="flex items-center gap-1"><div className="w-2 h-2 bg-blue-500 rounded-full" /> 蓝方部署</div>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Right: Strategic mode explanation */}
                  <Card className="bg-black/40 backdrop-blur-xl border border-white/15 overflow-hidden">
                    <div className="h-0.5 bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />
                    <CardContent className="p-3 sm:p-4">
                      <h3 className="text-sm font-bold mb-3 text-center flex items-center justify-center gap-2">
                        <Globe className="w-4 h-4 text-amber-400" />
                        战略模式说明
                      </h3>
                      <div className="space-y-3 text-xs text-gray-300">
                        <div className="p-2.5 rounded-lg bg-white/10 border border-white/15">
                          <div className="font-medium text-amber-400 mb-1">🗺️ 战略地图</div>
                          <div>10×8格战略地图，基于朝鲜半岛真实地理，每格代表一个军事区域（如平壤、首尔、釜山等）</div>
                        </div>
                        <div className="p-2.5 rounded-lg bg-white/10 border border-white/15">
                          <div className="font-medium text-amber-400 mb-1">⚔️ 作战流程</div>
                          <div>1. 选择己方部队 → 2. 移动到目标区域 → 3. 攻击相邻敌军 → 4. 结束回合</div>
                        </div>
                        <div className="p-2.5 rounded-lg bg-white/10 border border-white/15">
                          <div className="font-medium text-amber-400 mb-1">👁️ 战争迷雾</div>
                          <div>只能看到己方部队视野范围内的区域，侦察营视野最远（4格）</div>
                        </div>
                        <div className="p-2.5 rounded-lg bg-white/10 border border-white/15">
                          <div className="font-medium text-amber-400 mb-1">🏆 胜利条件</div>
                          <div>消灭敌方所有部队即可获胜</div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Force Templates */}
              <Card className="bg-black/40 backdrop-blur-xl border border-white/15 max-w-5xl w-full mb-6 sm:mb-8 overflow-hidden">
                <div className="h-0.5 bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />
                <CardContent className="p-3 sm:p-4">
                  <h3 className="text-sm font-bold mb-3 text-center flex items-center justify-center gap-2">
                    <Shield className="w-4 h-4 text-amber-400" />
                    部队编制
                  </h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-2 sm:gap-3">
                    {Object.entries(FORCE_TEMPLATES).map(([key, template]) => {
                      const templateIcons: Record<string, React.ReactNode> = {
                        armor: <Shield className="w-4 h-4 text-red-400" />,
                        mech_inf: <Footprints className="w-4 h-4 text-orange-400" />,
                        artillery: <Target className="w-4 h-4 text-yellow-400" />,
                        recon: <Eye className="w-4 h-4 text-green-400" />,
                        air_defense: <Radar className="w-4 h-4 text-cyan-400" />,
                        engineer: <Wrench className="w-4 h-4 text-amber-400" />,
                        combined: <Swords className="w-4 h-4 text-purple-400" />,
                      };
                      return (
                        <div key={key} className="rounded-lg border border-white/15 bg-white/10 p-3 hover:border-amber-400/30 transition-all duration-200">
                          <div className="flex items-center gap-2 mb-2">
                            {templateIcons[key]}
                            <div className="text-xs font-bold text-white">{template.name}</div>
                          </div>
                          <div className="space-y-0.5">
                            {template.units.map((u, i) => {
                              const unitConfig = UNIT_CONFIGS[u.type];
                              const unitIcon = UNIT_INFO.find(info => info.type === u.type);
                              const IconComp = unitIcon?.icon || Shield;
                              return (
                                <div key={i} className="flex items-center gap-1.5 text-[10px]">
                                  <IconComp className={`w-3 h-3 ${unitIcon?.color || 'text-gray-300'}`} />
                                  <span className="text-gray-300">{unitConfig?.name || u.type} ×{u.count}</span>
                                </div>
                              );
                            })}
                          </div>
                          <Separator className="my-2 bg-white/15" />
                          <div className="flex gap-2 text-[10px] text-gray-300">
                            <span>移动 {template.moveRange}</span>
                            <span>视野 {template.vision}</span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </CardContent>
              </Card>

              {/* Strategic Terrain */}
              <Card className="bg-black/40 backdrop-blur-xl border border-white/15 max-w-5xl w-full mb-6 sm:mb-8 overflow-hidden">
                <div className="h-0.5 bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />
                <CardContent className="p-3 sm:p-4">
                  <h3 className="text-sm font-bold mb-3 text-center">🌍 战略地形</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3 text-xs">
                    {[
                      { name: '平原', color: '#7cb342', desc: '移动1, 攻/防×1.0', icon: Hexagon },
                      { name: '森林', color: '#2e7d32', desc: '移动2, 攻×0.9, 防×1.2', icon: TreePine },
                      { name: '山地', color: '#78909c', desc: '移动3, 攻×0.8, 防×1.4', icon: Mountain },
                      { name: '水域', color: '#1565c0', desc: '不可通行', icon: Waves },
                      { name: '城市', color: '#8d6e63', desc: '移动1, 攻×1.1, 防×1.3', icon: Building2 },
                      { name: '沙漠', color: '#fdd835', desc: '移动1.5, 攻×1.0, 防×0.9', icon: Zap },
                      { name: '沼泽', color: '#5d4037', desc: '移动3, 攻×0.85, 防×0.8', icon: Droplets },
                      { name: '高原', color: '#546e7a', desc: '移动2, 攻×0.9, 防×1.3', icon: Mountain },
                    ].map(t => (
                      <div key={t.name} className="flex items-center gap-2 p-2 rounded-lg bg-white/10 border border-white/15 hover:border-white/25 transition-colors">
                        <div className="w-7 h-7 rounded flex-shrink-0 border border-white/20 flex items-center justify-center" style={{ backgroundColor: t.color + '30' }}>
                          <t.icon className="w-3.5 h-3.5" style={{ color: t.color }} />
                        </div>
                        <div className="min-w-0">
                          <div className="font-medium text-white">{t.name}</div>
                          <div className="text-gray-300 text-[10px] truncate">{t.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </>
          )}

          {/* ===== AI DIFFICULTY ===== */}
          <Card className="bg-black/40 backdrop-blur-xl border border-white/15 max-w-5xl w-full mb-6 sm:mb-8 overflow-hidden">
            <div className="h-0.5 bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />
            <CardContent className="p-3 sm:p-4">
              <h3 className="text-sm font-bold mb-3 text-center">🎯 AI 难度选择</h3>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4">
                {DIFFICULTY_OPTIONS.map(opt => (
                  <button
                    key={opt.value}
                    className={`relative rounded-xl border-2 p-4 transition-all duration-200 cursor-pointer text-left group overflow-hidden ${
                      difficulty === opt.value
                        ? 'border-amber-400 bg-amber-900/30 shadow-lg shadow-amber-400/10'
                        : 'border-white/15 bg-white/10 hover:border-white/30 hover:bg-white/15'
                    }`}
                    onClick={() => setDifficulty(opt.value)}
                  >
                    {difficulty === opt.value && (
                      <div className="absolute top-2 right-2">
                        <Badge className="bg-amber-500 text-white text-[10px]">✓ 已选</Badge>
                      </div>
                    )}
                    <div className="flex items-center gap-2 mb-1.5">
                      <div className={`text-lg font-bold ${difficulty === opt.value ? 'text-amber-400' : 'text-white'}`}>
                        {opt.label}
                      </div>
                      <div className="flex gap-0.5">
                        {Array.from({ length: opt.stars }).map((_, i) => (
                          <div key={i} className={`w-2 h-2 rounded-full ${difficulty === opt.value ? 'bg-amber-400' : 'bg-gray-500'}`} />
                        ))}
                      </div>
                    </div>
                    <div className="text-xs text-gray-300">{opt.description}</div>
                  </button>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* ===== GAME EDITOR ===== */}
          <div className="max-w-5xl w-full mb-6 sm:mb-8">
            <GameEditor />
          </div>

          {/* v12.0 更新日志 */}
          <Card className="bg-gray-900/80 border-white/15 max-w-5xl w-full mb-6 sm:mb-8 overflow-hidden">
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between text-gray-300 hover:text-white">
                  <span className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span className="font-bold">v12.0 更新日志</span>
                    <Badge className="bg-amber-500/20 text-amber-400 text-[10px]">最新</Badge>
                  </span>
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-4 pb-4 space-y-3 text-sm text-gray-300">
                  <div>
                    <h4 className="text-purple-400 font-medium mb-1">🎵 音效系统</h4>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>20种程序化音效（Web Audio API，无需外部文件）</li>
                      <li>UI交互音效：点击、选择、取消、部署、保存</li>
                      <li>战斗音效：攻击、命中、击杀、爆炸、排雷</li>
                      <li>特殊音效：隐身、撤退、工事、治疗、夺旗</li>
                      <li>回合音效：回合开始、回合结束、天气变化</li>
                      <li>终局音效：胜利（大三和弦）、失败（小调和弦）</li>
                      <li>战略模式完整音效集成（11种场景）</li>
                      <li>全局静音/音量控制</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-blue-400 font-medium mb-1">🌧️ 天气3D视觉效果</h4>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>雨天粒子效果：500个蓝色雨滴，带风向倾斜</li>
                      <li>雪天粒子效果：300个白色雪花，带横向飘移</li>
                      <li>大雾地面覆盖层：脉动透明度灰色雾气</li>
                      <li>沙暴效果：400个黄色沙尘粒子 + 能见度降低</li>
                      <li>使用 Three.js BufferGeometry 高性能渲染</li>
                      <li>天气切换自动清理旧粒子系统</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-green-400 font-medium mb-1">⚙️ 回合指示器增强</h4>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>SVG圆形进度环显示已行动单位比例</li>
                      <li>AI回合时指示器变暗 + 旋转动画</li>
                      <li>已行动/总数 格式显示</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-amber-400 font-medium mb-1">💥 HP条平滑动画</h4>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>单位HP条平滑过渡动画（约0.5秒）</li>
                      <li>受伤时条形渐变而非瞬变</li>
                      <li>颜色随HP百分比动态变化</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-cyan-400 font-medium mb-1">🔍 战略部队模板类型</h4>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>部队列表新增类型图标（🛡️🚛🎯👁️📡🔧⚔️）</li>
                      <li>使用templateKey字段替代脆弱的名称匹配</li>
                  </ul>
                  </div>
                  <div>
                    <h4 className="text-yellow-400 font-medium mb-1">🐛 Bug修复</h4>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>修复combatLog无上限增长（限制200/100条）</li>
                      <li>修复turnSummaries无上限增长（限制50条）</li>
                      <li>修复levelUpNotifications无上限增长（限制20条）</li>
                      <li>修复grantXP中damagePopups无上限增长</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-gray-300 font-medium mb-1">✨ UI细节增强</h4>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>单位悬停提示增强：名称/血量条/状态/地形</li>
                      <li>天气悬停提示增强：显示移动/视野/攻击修正</li>
                    </ul>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </Card>

          {/* v12.0 更新日志 */}
          <Card className="bg-gray-900/80 border-white/15 max-w-5xl w-full mb-6 sm:mb-8 overflow-hidden">
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between text-gray-300 hover:text-white">
                  <span className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span className="font-bold">v10.0 更新日志</span>
                  </span>
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-4 pb-4 space-y-3 text-sm text-gray-300">
                  <div>
                    <h4 className="text-amber-400 font-medium mb-1">🎯 战役/关卡系统</h4>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>3个预设战役关卡（初战告捷/突破防线/坚守阵地）</li>
                      <li>5种胜利条件（歼灭/到达/防守/击杀/存活）</li>
                      <li>回合限制 + 任务目标实时进度追踪</li>
                      <li>战役选择界面 + 战斗内目标面板</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-red-400 font-medium mb-1">🚩 撤退机制</h4>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>单位可自愿撤退（消耗整回合，从战场移除）</li>
                      <li>新增撤退按钮 + 快捷键 R</li>
                      <li>战斗日志显示撤退记录</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-blue-400 font-medium mb-1">📊 战斗统计面板</h4>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>红蓝双方9项数据对比（伤害/击杀/攻击/治疗等）</li>
                      <li>可视化伤害对比条形图</li>
                      <li>可折叠面板，收起时显示摘要</li>
                      <li>全游戏过程自动追踪</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-purple-400 font-medium mb-1">🏰 战略模式增援系统</h4>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>每6回合自动增援一次（双方各3次）</li>
                      <li>机械化步兵营模板增援</li>
                      <li>增援倒计时 + 到达通知动画</li>
                      <li>AI提前预判增援位置并保护</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-green-400 font-medium mb-1">🤖 战略AI修复</h4>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>降低回避率 — AI更积极进攻</li>
                      <li>加强前进推力 — 每步+5分（原来+0.5）</li>
                      <li>减少城市拖延 — 城市加成降低33%</li>
                      <li>新增侧翼包围加成</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-emerald-400 font-medium mb-1">🔧 Bug 修复 (4项)</h4>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>[中危] 修复弹药补给功能完全失效（排序错误）</li>
                      <li>[中危] 修复伤害估算缺少SAM防空减伤</li>
                      <li>[低危] 修复读档后游戏计时器不重置</li>
                      <li>[低危] 修复3D/UI血条颜色阈值不一致</li>
                    </ul>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </Card>

          {/* v9.0 更新日志 */}
          <Card className="bg-gray-900/80 border-white/15 max-w-5xl w-full mb-6 sm:mb-8 overflow-hidden">
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between text-gray-300 hover:text-white">
                  <span className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span className="font-bold">v9.0 更新日志</span>
                    <Badge className="bg-amber-500/20 text-amber-400 text-[10px]">最新</Badge>
                  </span>
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-4 pb-4 space-y-3 text-sm text-gray-300">
                  <div>
                    <h4 className="text-amber-400 font-medium mb-1">🎯 单位特殊能力</h4>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>防空导弹(SAM)区域防空 — 范围2格内友军受直升机伤害-30%</li>
                      <li>补给车弹药补给 — 回合开始恢复相邻已攻击友军的攻击能力</li>
                      <li>SAM防空范围指示器 — 选中SAM时显示蓝色防空覆盖区域</li>
                      <li>弹药补给弹窗 — 蓝色"+AMMO"动画提示</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-blue-400 font-medium mb-1">🤖 AI 智能增强</h4>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>HE溅射利用 — 炮兵/火箭炮优先攻击聚集的敌方单位</li>
                      <li>规避炮火 — AI避免将部队移动到敌方炮兵射程内</li>
                      <li>补给车走位 — 补给车主动靠近需要弹药补给的友军</li>
                      <li>SAM护航 — 防空导弹车自动保护直升机和高价值单位</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-emerald-400 font-medium mb-1">🔧 Bug 修复 (12项)</h4>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>[严重] 修复隐蔽单位攻击不解除隐蔽</li>
                      <li>[严重] 修复存档丢失胜负信息</li>
                      <li>[严重] 修复红方自动部署缺少防空和补给车</li>
                      <li>[高危] 修复补给治疗产生过期地图引用</li>
                      <li>[高危] 修复撤销状态共享可变stats对象</li>
                      <li>[高危] 修复selectedUnit存储过时引用</li>
                      <li>[高危] 修复地图维度硬编码</li>
                      <li>[中危] 修复HE溅射使用过期单位数组</li>
                      <li>[中危] 修复单位ID计数器不重置</li>
                      <li>[中危] 修复音效require()不兼容ESM</li>
                      <li>[中危] 修复战斗日志排序不一致</li>
                      <li>[中危] 修复自动存档丢失胜负信息</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-purple-400 font-medium mb-1">🎨 UI 增强</h4>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>游戏计时器 — 顶栏显示对局时长</li>
                      <li>行动点指示器 — 显示可行动单位数/总存活数</li>
                      <li>地形悬浮信息 — 鼠标悬停显示地形属性</li>
                      <li>3D血条增强 — 单位头顶BoxGeometry血条</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-cyan-400 font-medium mb-1">🔊 音效增强</h4>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>新增HE溅射音效、修建工事音效</li>
                      <li>新增隐蔽进入/暴露音效、反击音效、部署音效</li>
                      <li>修复音效静音状态同步</li>
                    </ul>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </Card>

          {/* v8.0 更新日志 */}
          <Card className="bg-gray-900/80 border-white/15 max-w-5xl w-full mb-6 sm:mb-8 overflow-hidden">
            <Collapsible>
              <CollapsibleTrigger asChild>
                <Button variant="ghost" className="w-full justify-between text-gray-300 hover:text-white">
                  <span className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-amber-400" />
                    <span className="font-bold">v8.0 更新日志</span>
                  </span>
                  <ChevronDown className="w-4 h-4" />
                </Button>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="px-4 pb-4 space-y-3 text-sm text-gray-300">
                  <div>
                    <h4 className="text-amber-400 font-medium mb-1">⚔️ 战斗效果增强</h4>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>弹道轨迹动画 — 攻击时显示发光弹丸从攻击者飞向目标</li>
                      <li>爆炸效果 — 单位被摧毁时显示粒子爆炸和冲击波</li>
                      <li>炮口闪光 — 攻击瞬间在攻击者位置显示闪光</li>
                      <li>镜头震动 — 重击(伤害&gt;30)时画面微震</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-emerald-400 font-medium mb-1">🔧 Bug 修复</h4>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>修复隐蔽单位可被直接攻击的严重bug</li>
                      <li>修复反击错误获得侧翼装甲减免</li>
                      <li>修复回合总结移动数始终为0</li>
                      <li>修复工事可重复修筑</li>
                      <li>修复AI使用过时单位数据做决策</li>
                    </ul>
                  </div>
                  <div>
                    <h4 className="text-blue-400 font-medium mb-1">🎨 UI 增强</h4>
                    <ul className="list-disc pl-5 space-y-1">
                      <li>回合总结面板增强 — 详细统计+每单位行动+据点变化</li>
                      <li>据点面板增强 — 控制比分、捕获速率、争夺状态指示</li>
                      <li>升级通知增强 — 金色动画、属性提升展示</li>
                      <li>小地图点击平移 — 点击小地图快速定位</li>
                      <li>单位类型筛选按钮 — 快速过滤部队列表</li>
                      <li>Shift快捷键提示 — 按Shift显示上下文快捷键</li>
                    </ul>
                  </div>
                </div>
              </CollapsibleContent>
            </Collapsible>
          </Card>

          {/* ===== DEPLOYMENT TOGGLE ===== */}
          <div className="max-w-5xl w-full mb-6 sm:mb-8">
            <Card className="bg-black/40 backdrop-blur-xl border border-white/15 overflow-hidden">
              <div className="h-0.5 bg-gradient-to-r from-transparent via-green-500/40 to-transparent" />
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center border transition-all ${enableDeployment ? 'bg-green-900/50 border-green-500/40' : 'bg-white/10 border-white/20'}`}>
                      <Swords className={`w-5 h-5 ${enableDeployment ? 'text-green-400' : 'text-gray-300'}`} />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white">启用部署阶段</div>
                      <div className="text-[10px] text-gray-300">开始前自选部队部署，而非使用默认配置</div>
                    </div>
                  </div>
                  <button
                    className={`relative w-12 h-6 rounded-full transition-all duration-300 cursor-pointer flex-shrink-0 ${
                      enableDeployment ? 'bg-green-600' : 'bg-gray-700'
                    }`}
                    onClick={() => setEnableDeployment(!enableDeployment)}
                  >
                    <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all duration-300 ${
                      enableDeployment ? 'left-6' : 'left-0.5'
                    }`} />
                  </button>
                </div>
                {enableDeployment && (
                  <motion.div
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    className="mt-3 pt-3 border-t border-white/15"
                  >
                    <div className="flex flex-wrap gap-2 text-[10px]">
                      {gameMode === 'tactical' ? (
                        <>
                          <Badge variant="outline" className="border-green-500/40 text-green-400">150点预算</Badge>
                          <Badge variant="outline" className="border-green-500/40 text-green-400">部署区: x 0-3</Badge>
                          <Badge variant="outline" className="border-green-500/40 text-green-400">10种单位可选</Badge>
                          <Badge variant="outline" className="border-green-500/40 text-green-400">自定义阵型</Badge>
                        </>
                      ) : (
                        <>
                          <Badge variant="outline" className="border-green-500/40 text-green-400">100点预算</Badge>
                          <Badge variant="outline" className="border-green-500/40 text-green-400">部署区: x 0-2</Badge>
                          <Badge variant="outline" className="border-green-500/40 text-green-400">7种编制可选</Badge>
                          <Badge variant="outline" className="border-green-500/40 text-green-400">自定义阵型</Badge>
                        </>
                      )}
                    </div>
                  </motion.div>
                )}
              </CardContent>
            </Card>
            {/* Hero Selection Toggle */}
            <div>
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center border transition-all ${enableHeroes ? 'bg-amber-900/50 border-amber-500/40' : 'bg-white/10 border-white/20'}`}>
                      <Trophy className={`w-5 h-5 ${enableHeroes ? 'text-amber-400' : 'text-gray-300'}`} />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white">启用英雄单位</div>
                      <div className="text-[10px] text-gray-300">选择独特英雄加入战场，拥有特殊技能和强化属性</div>
                    </div>
                  </div>
                  <button
                    className={`relative w-12 h-6 rounded-full transition-all duration-300 cursor-pointer flex-shrink-0 ${enableHeroes ? 'bg-amber-600' : 'bg-gray-700'}`}
                    onClick={() => setEnableHeroes(!enableHeroes)}
                  >
                    <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all duration-300 ${enableHeroes ? 'left-6' : 'left-0.5'}`} />
                  </button>
                </div>
                {enableHeroes && (
                  <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} className="mt-3 pt-3 border-t border-white/15">
                    <div className="flex flex-wrap gap-2 text-[10px]">
                      <Badge variant="outline" className="border-amber-500/40 text-amber-400">6红方英雄</Badge>
                      <Badge variant="outline" className="border-blue-500/40 text-blue-400">6蓝方英雄</Badge>
                      <Badge variant="outline" className="border-amber-500/40 text-amber-400">2个技能</Badge>
                      <Badge variant="outline" className="border-amber-500/40 text-amber-400">起始Lv.2</Badge>
                      <Badge variant="outline" className="border-amber-500/40 text-amber-400">独特名称</Badge>
                    </div>
                  </motion.div>
                )}
              </CardContent>
            </div>
            {/* Tutorial Toggle */}
            <div>
              <CardContent className="p-3 sm:p-4">
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-lg flex items-center justify-center border transition-all bg-green-900/50 border-green-500/40`}>
                      <GraduationCap className="w-5 h-5 text-green-400" />
                    </div>
                    <div>
                      <div className="text-sm font-bold text-white">新手引导</div>
                      <div className="text-[10px] text-gray-300">首次游戏时显示分步操作指引教程</div>
                    </div>
                  </div>
                  <button
                    className={`relative w-12 h-6 rounded-full transition-all duration-300 cursor-pointer flex-shrink-0 ${tutorialEnabled ? 'bg-green-600' : 'bg-gray-700'}`}
                    onClick={() => {
                      const next = !tutorialEnabled;
                      setTutorialEnabled(next);
                      try { localStorage.setItem('iron-chess-tutorial-dismissed', next ? 'false' : 'true'); } catch { /* SSR */ }
                    }}
                  >
                    <div className={`absolute top-0.5 w-5 h-5 rounded-full bg-white shadow-md transition-all duration-300 ${tutorialEnabled ? 'left-6' : 'left-0.5'}`} />
                  </button>
                </div>
                <div className="flex flex-wrap gap-2 text-[10px] mt-2">
                  <Badge variant="outline" className="border-green-500/40 text-green-400">6个步骤</Badge>
                  <Badge variant="outline" className="border-green-500/40 text-green-400">上下文提示</Badge>
                  <Badge variant="outline" className="border-green-500/40 text-green-400">可随时跳过</Badge>
                </div>
              </CardContent>
            </div>
          </div>

          {/* ===== CAMPAIGN MODE CONTENT ===== */}
          {gameMode === 'campaign' && (
            <Card className="bg-black/40 backdrop-blur-xl border border-white/15 max-w-5xl w-full mb-6 sm:mb-8 overflow-hidden">
              <div className="h-0.5 bg-gradient-to-r from-transparent via-yellow-500/40 to-transparent" />
              <CardContent className="p-3 sm:p-4">
                <h3 className="text-sm font-bold mb-3 text-center flex items-center justify-center gap-2">
                  <Trophy className="w-4 h-4 text-yellow-400" />
                  战役模式说明
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs text-gray-300">
                  <div className="p-2.5 rounded-lg bg-white/10 border border-white/15">
                    <div className="font-medium text-yellow-400 mb-1">🏆 3个战役关卡</div>
                    <div>「初战告捷」简单入门 · 「突破防线」战术挑战 · 「坚守阵地」极限防守</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white/10 border border-white/15">
                    <div className="font-medium text-yellow-400 mb-1">🎯 独特胜利条件</div>
                    <div>每关拥有不同的胜利目标：歼灭、突破、防守，以及回合限制挑战</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white/10 border border-white/15">
                    <div className="font-medium text-yellow-400 mb-1">🗺️ 预设地图与部队</div>
                    <div>每关拥有专属地图和精心设计的部队部署方案</div>
                  </div>
                  <div className="p-2.5 rounded-lg bg-white/10 border border-white/15">
                    <div className="font-medium text-yellow-400 mb-1">📊 实时任务追踪</div>
                    <div>游戏中实时显示任务目标进度，追踪每一个胜利条件</div>
                  </div>
                </div>
              </CardContent>
            </Card>
          )}

          {/* ===== START BUTTON ===== */}
          <div className="mb-6">
            <Button
              size="lg"
              className="glow-button bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-500 hover:to-red-500 text-white text-lg px-8 sm:px-12 py-6 shadow-2xl transition-all duration-300 hover:scale-105 border border-amber-400/30"
              onClick={handleStart}
            >
              <Play className="w-6 h-6 mr-2" />
              {gameMode === 'tactical' ? '开始战斗' : gameMode === 'strategic' ? '开始战役' : '选择关卡'}
              <Badge className="ml-3 bg-white/20 text-white text-xs hidden sm:inline-flex">
                {gameMode === 'tactical'
                  ? `${MAP_TYPE_OPTIONS.find(o => o.type === selectedMapType)?.name} · ${DIFFICULTY_OPTIONS.find(o => o.value === difficulty)?.label}`
                  : gameMode === 'strategic'
                    ? `战略模式 · ${DIFFICULTY_OPTIONS.find(o => o.value === difficulty)?.label}`
                    : `战役模式 · 3个关卡`
                }
              </Badge>
            </Button>
          </div>
        </main>

        {/* ===== FOOTER ===== */}
        <footer className="flex-shrink-0 relative z-10 border-t border-white/20">
          <div className="max-w-5xl mx-auto px-4 py-4">
            <div className="flex flex-col sm:flex-row items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-xs text-gray-300">
                <Swords className="w-3.5 h-3.5 text-amber-500/50" />
                <span className="font-medium">铁甲战棋 v56.0</span>
                <span className="text-gray-400">|</span>
                <span>隐身移动修复 | 回合治愈修正 | 反击预览修正 | 弹药士气显示</span>
              </div>
              <div className="flex items-center gap-1.5 flex-wrap justify-center">
                <Badge variant="outline" className="text-[9px] border-white/20 text-gray-300 gap-1 py-0 px-1.5">
                  <Cpu className="w-2.5 h-2.5" /> Next.js 16
                </Badge>
                <Badge variant="outline" className="text-[9px] border-white/20 text-gray-300 gap-1 py-0 px-1.5">
                  <Code2 className="w-2.5 h-2.5" /> TypeScript
                </Badge>
                <Badge variant="outline" className="text-[9px] border-white/20 text-gray-300 gap-1 py-0 px-1.5">
                  <Hexagon className="w-2.5 h-2.5" /> Three.js
                </Badge>
                <Badge variant="outline" className="text-[9px] border-white/20 text-gray-300 gap-1 py-0 px-1.5">
                  <Gamepad2 className="w-2.5 h-2.5" /> Zustand
                </Badge>
              </div>
            </div>
          </div>
        </footer>
      </div>
    );
  }

  // ===== GAME VIEW =====
  return (
    <div className="w-screen h-screen relative overflow-hidden bg-gray-900">
      {/* Mode switch floating button */}
      <div className="absolute top-1.5 left-1/2 -translate-x-1/2 z-50">
        <Button
          size="sm"
          variant="outline"
          className="h-7 px-3 text-white border-white/20 bg-black/60 backdrop-blur-md hover:bg-white/10 text-[11px] shadow-lg"
          onClick={handleModeSwitch}
        >
          <ArrowLeftRight className="w-3 h-3 mr-1" />
          {effectiveGameMode === 'tactical' ? '切换战略模式' : '切换战术模式'}
        </Button>
      </div>

      {effectiveGameMode === 'tactical' ? (
        <>
          <GameScene />
          <GameUI />
        </>
      ) : (
        <StrategicMap />
      )}
    </div>
  );
}
