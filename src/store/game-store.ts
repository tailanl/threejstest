// ===== 游戏状态管理 (Zustand) =====

import { create } from 'zustand';
import { GameState, Position, Unit, GamePhase, Faction, AIDifficulty, MapType, MovementAnimation, DamagePopup, CombatToast, UnitType, TacticalDeploymentInfo, TACTICAL_UNIT_COSTS, TACTICAL_DEPLOYMENT_BUDGET, CapturePoint, ReinforcementUnit, ReplayAction, ReplayState, TutorialStep, TUTORIAL_STEPS, SAVE_VERSION } from '@/game/types';
import { 
  initGameState, selectUnit, moveUnit, attackUnit,
  endTurn, deselectUnit, findBestAttackPosition, findMovementPath,
  buildFortification,
  initDeploymentState, deployUnit, removeDeployedUnit, confirmTacticalDeployment, getTacticalDeploymentBudget,
  enterStealth, isUnitDetected, getVisibleUnits, initGameStateWithDeployment,
  retreatUnit, clearMinefield, deployReinforcement, getReinforcementInfo,
  getHeroFortifyBonus, getHeroSupplyBonus,
  executeHeroAbility, heroAbilityNeedsTarget, initHeroSelectionState,
  createUnit, estimateDamage, calculateKillProbability,
  assignBlueHero,
  initGameStateFromMap,
  // v87.0: Removed setAttackerTerrainAtkBonus import (dead code since v84)
  // v67.0: Veterancy and kill streak
  getVeterancyTitle, getKillStreakLabel,
} from '@/game/engine';
import { UNIT_CONFIGS, TERRAIN_CONFIGS, MAP_WIDTH, MAP_HEIGHT, HERO_SELECT_ENABLED } from '@/game/config';
import { getHeroesForFaction, getHeroDefinition, HeroDefinition } from '@/game/heroes';
import { aiExecuteTurn, AI_DELAY } from '@/game/ai';
import {
  playSelectSound, playMoveSound, playAttackSound,
  playTurnStartSound, playTurnEndSound, playCancelSound,
  playFortifySound,
  playDeploySound, playStealthEnterSound, playStealthExitSound,
  playRetreatSound, playSaveSound,
  playMineExplosionSound, playGameOverSound, playVictorySound,
  playLevelUpSound, playHeroAbilitySound,
  playCounterAttackSound, playWeatherChangeSound, playErrorSound, playSplashSound,
  setMutedState,
} from '@/game/audio';
import { useMissionStore } from '@/store/mission-store';

let aiTimeoutId: ReturnType<typeof setTimeout> | null = null;

export interface SaveSlotInfo {
  slot: number;
  timestamp: string;
  turn: number;
  faction: Faction;
  redAlive: number;
  blueAlive: number;
}

interface GameStore extends GameState {
  // Actions
  init: (difficulty?: AIDifficulty, mapType?: MapType) => void;
  initDeployment: (difficulty?: AIDifficulty, mapType?: MapType) => void;
  initHeroSelection: (difficulty?: AIDifficulty, mapType?: MapType) => void;
  initMission: (difficulty: AIDifficulty, mapType: MapType, redCustom: { type: string; x: number; z: number }[], blueCustom: { type: string; x: number; z: number }[]) => void;
  onCellClick: (pos: Position) => void;
  onEndTurn: () => void;
  onDeselect: () => void;
  onSkipUnit: () => void;
  onUndoMove: () => void;
  setHoveredCell: (pos: Position | null) => void;
  onActionMove: () => void;
  onActionAttack: () => void;
  onActionWait: () => void;
  clearShake: () => void;
  dismissTurnSummary: () => void;
  cycleUnit: () => void;
  selectUnitByType: (type: string) => void;
  cycleUnitWithCamera: () => string | null;
  isAiProcessing: boolean;
  animationKey: number;
  mapType: MapType;
  turnTransition: { faction: Faction; turn: number; weatherChanged?: string; previousWeather?: string } | null;
  showShortcuts: boolean;
  setShowShortcuts: (show: boolean) => void;
  // v38.0: Undo toast notification
  undoToast: boolean;
  dismissUndoToast: () => void;
  // v72.0: Deploy error toast
  deployErrorToast: string | null;
  dismissDeployErrorToast: () => void;
  // Pause state (v24.0)
  isPaused: boolean;
  togglePause: () => void;
  // Hero phase state
  heroPhase: 'none' | 'selecting' | 'confirmed';
  selectedHeroId: string | null;
  heroSelectionMode: boolean;
  heroTargetingAbilityId: string | null;
  clearMovementAnimation: () => void;
  setMovementAnimation: (anim: MovementAnimation | null) => void;
  executePendingAttack: () => void;
  addDamagePopups: (popups: DamagePopup[]) => void;
  removeDamagePopup: (id: number) => void;
  removeCombatToast: (id: number) => void;
  getSupplyHealPositions: () => Position[];
  onBuildFortify: () => void;
  // Strategic-Tactical integration
  isStrategicTacticalBattle: boolean;
  initStrategicTacticalBattle: (tacticalState: GameState) => void;
  returnToStrategic: () => void;
  enterTacticalFromCombatViewport: () => void;
  // Deployment actions
  selectedDeploymentType: UnitType | null;
  setSelectedDeploymentType: (type: UnitType | null) => void;
  onDeployUnit: (unitType: UnitType, faction: Faction, position: Position) => void;
  onRemoveDeployedUnit: (unitId: string) => void;
  onConfirmDeployment: () => void;
  onAutoDeployRed: () => void;
  getDeploymentBudget: (faction: Faction) => number;
  // Stealth & capture point actions
  onEnterStealth: () => void;
  getCapturePoints: () => CapturePoint[];
  getVisibleEnemyUnits: () => Unit[];
  onRetreatUnit: () => void;
  // Save/Load (multi-slot)
  saveGame: (slot: number) => void;
  loadGame: (slot: number) => void;
  deleteSave: (slot: number) => void;
  getSaveSlots: () => SaveSlotInfo[];
  onAutoSave: () => void;
  // Sound mute
  isMuted: boolean;
  toggleMute: () => void;
  // Camera pan (from minimap click)
  panCameraTarget: { x: number; z: number } | null;
  setPanCameraTarget: (target: { x: number; z: number } | null) => void;
  // Current camera world position (exposed by GameScene for minimap viewport rect)
  cameraPosition: { x: number; z: number } | null;
  setCameraPosition: (pos: { x: number; z: number } | null) => void;
  // v31.0: Camera zoom level (exposed by GameScene for minimap viewport rect accuracy)
  cameraZoom: number;
  setCameraZoom: (zoom: number) => void;
  // v83.0: Camera aspect ratio (exposed by GameScene for minimap viewport accuracy)
  cameraAspect: number;
  setCameraAspect: (aspect: number) => void;
  // Game speed
  gameSpeed: number;
  setGameSpeed: (speed: number) => void;
  // Mine clearing
  onClearMinefield: () => void;
  // Reinforcement system
  selectedReinforcementType: UnitType | null;
  setSelectedReinforcementType: (type: UnitType | null) => void;
  onDeployReinforcement: (unitType: UnitType, position: Position) => void;
  getReinforcements: () => ReinforcementUnit[];
  // Unit comparison
  comparingUnit: Unit | null;
  setComparingUnit: (unit: Unit | null) => void;

  // Hero selection actions
  selectHero: (heroId: string) => void,
  confirmHeroSelection: () => void,
  heroAbilityUse: (unitId: string, abilityId: string, targetPos?: Position) => void,
  cancelHeroTargeting: () => void,
  getAvailableHeroes: (faction: Faction) => HeroDefinition[],
  // Replay system
  replayState: ReplayState | null;
  startReplay: () => void;
  nextReplayStep: () => void;
  endReplay: () => void;
  // Tutorial system
  tutorialEnabled: boolean;
  tutorialStep: number;
  advanceTutorial: () => void;
  dismissTutorial: () => void;
  // v19.0: Battle Stats Dashboard
  showStatsDashboard: boolean;
  toggleStatsDashboard: () => void;
  // Threat Heatmap Overlay
  showThreatOverlay: boolean;
  toggleThreatOverlay: () => void;
  // Terrain Defense Bonus Overlay
  showDefenseOverlay: boolean;
  toggleDefenseOverlay: () => void;
  // Army Roster Panel
  showArmyRoster: boolean;
  toggleArmyRoster: () => void;
  // v19.0: Movement Path Preview
  hoveredMovePath: { x: number; z: number }[] | null;
  setHoveredMovePath: (path: { x: number; z: number }[] | null) => void;
  // v19.0: Attack Preview Targets
  attackPreviewTargets: { unitId: string; estimatedDamage: number; counterDamage: number; killProbability: number; expectedDamage: number; position: { x: number; z: number }; targetTerrain?: string; targetDefenseBonus?: number }[] | null;
  computeAttackPreviewTargets: () => void;
  // v25.0: Click-to-focus from combat log
  focusOnUnit: (unitId: string) => void;
  focusOnPosition: (pos: { x: number; z: number }) => void;
  // Undo Last Action
  previousTurnState: GameState | null;
  undoLastAction: () => void;
}

/** 处理自动移动攻击逻辑 */
function handleAutoMoveAttack(
  state: GameStore,
  enemyPos: Position,
  set: (partial: Partial<GameStore>) => void
) {
  const unit = state.selectedUnit;
  if (!unit) return;

  // v31.0: Guard against targeting undetected stealthed enemies
  const enemyUnit = state.units.find(u =>
    u.position.x === enemyPos.x && u.position.z === enemyPos.z &&
    u.faction !== unit.faction && u.isAlive
  );
  if (enemyUnit && enemyUnit.isStealthed && !isUnitDetected(state, enemyUnit, unit.faction)) {
    playErrorSound();
    return;
  }

  // 保存操作前状态用于撤销
  const snapshot: GameState = _cloneForUndo(state);

  // 如果单位已可在当前位置攻击敌方，直接攻击
  // v60.0: Use effective attack range (includes hero extended_range_passive bonus)
  // v75.0: Only check passive abilities for range bonus (matching getAttackablePositions)
  const effectiveRange = unit.stats.attackRange
    + (unit.abilities?.find(a => a.type === 'passive' && a.effect?.attackRangeBonus)?.effect?.attackRangeBonus ?? 0);
  const currentDist = Math.abs(unit.position.x - enemyPos.x) + Math.abs(unit.position.z - enemyPos.z);
  if (currentDist >= 1 && currentDist <= effectiveRange && unit.canAttack) {
    if (unit.isStealthed) playStealthExitSound();
    playAttackSound();
    const newState = attackUnit(state, unit, enemyPos);
    if (newState.levelUpNotifications && newState.levelUpNotifications.length > (state.levelUpNotifications?.length ?? 0)) {
      playLevelUpSound();
    }
    playAttackResultSounds(newState);
    // v77.0: Cap levelUpNotifications to prevent unbounded growth (keep last 10)
    const cappedNotifications = (newState.levelUpNotifications || []).slice(-10);
    set({ ...newState, animationKey: state.animationKey + 1, previousTurnState: snapshot, levelUpNotifications: cappedNotifications });
    return;
  }

  // 需要移动后才能攻击
  if (!unit.canMove) return;

  const bestPos = findBestAttackPosition(state, unit, enemyPos);
  if (!bestPos) return; // 无法到达可攻击位置

  // 如果最佳位置就是当前位置（已在攻击范围内），直接攻击
  if (bestPos.x === unit.position.x && bestPos.z === unit.position.z) {
    if (unit.canAttack) {
      playAttackSound();
      const newState = attackUnit(state, unit, enemyPos);
      if (newState.levelUpNotifications && newState.levelUpNotifications.length > (state.levelUpNotifications?.length ?? 0)) {
        playLevelUpSound();
      }
      playAttackResultSounds(newState);
      const cappedNotifications = (newState.levelUpNotifications || []).slice(-10);
      set({ ...newState, animationKey: state.animationKey + 1, previousTurnState: snapshot, levelUpNotifications: cappedNotifications });
    }
    return;
  }

  // 需要移动到最佳位置
  const path = findMovementPath(state, unit, bestPos);
  const afterMoveState = moveUnit(state, unit, bestPos);

  // v30.0: Play mine explosion sound if unit stepped on a mine during auto-move-attack
  const prevPopups = state.damagePopups?.length ?? 0;
  const afterPopups = afterMoveState.damagePopups?.length ?? 0;
  if (afterPopups > prevPopups) {
    playMineExplosionSound();
  }

  // 移动后检查是否可以攻击
  const movedUnit = afterMoveState.units.find(u => u.id === unit.id);
  if (movedUnit && movedUnit.canAttack && afterMoveState.phase === 'attackUnit') {
    // 设置移动动画，动画完成后自动攻击
    set({
      ...afterMoveState,
      animationKey: state.animationKey + 1,
      isAnimating: true,
      movementAnimation: {
        unitId: unit.id,
        path,
        currentStep: 0,
        progress: 0,
        pendingAttack: enemyPos,
      },
      previousTurnState: snapshot,
    });
  } else {
    // 移动后无法攻击，只移动
    set({
      ...afterMoveState,
      animationKey: state.animationKey + 1,
      isAnimating: true,
      movementAnimation: {
        unitId: unit.id,
        path,
        currentStep: 0,
        progress: 0,
        pendingAttack: null,
      },
      previousTurnState: snapshot,
    });
  }
}

/** v31.0: Play contextual sounds after attack based on combat result */
// v92.0: Removed unused oldState parameter — only newState is used in the body
function playAttackResultSounds(newState: GameState) {
  // Check the latest combat log entry for counter-attack
  const latestLog = newState.combatLog?.[0];
  if (latestLog?.counterDamage && latestLog.counterDamage > 0) {
    setTimeout(() => playCounterAttackSound(), 150);
  }
  // Check if this is HE splash (artillery/mlrs hitting multiple targets)
  // v68.0 fix: Use attackerUnitId from combat log (selectedUnit is null after attack)
  if (latestLog?.eventType === 'attack' && latestLog?.attackerUnitId) {
    const attackerUnit = newState.units.find(u => u.id === latestLog.attackerUnitId);
    const isHE = attackerUnit ? UNIT_CONFIGS[attackerUnit.type]?.damageType === 'he' : false;
    if (isHE) {
      setTimeout(() => playSplashSound(), 200);
    }
  }
}

/** Shared AI turn execution — used by onEndTurn and togglePause */
function runAITurn(get: () => GameStore, set: (partial: Partial<GameStore>) => void, delayMs: number) {
  const state = get();
  if (state.isPaused || state.phase === 'gameOver' || state.currentFaction === 'red') return;

  if (aiTimeoutId) { clearTimeout(aiTimeoutId); }
  aiTimeoutId = setTimeout(() => {
    aiTimeoutId = null;
    try {
      // Guard: abort if game paused or already ended
      if (get().isPaused) {
        set({ isAiProcessing: false });
        return;
      }
      if (get().phase === 'gameOver') {
        set({ isAiProcessing: false });
        return;
      }
      const currentState = get();
      // v25.0: Use dynamic difficulty for AI
      const dynamicDifficulty = currentState.aiDynamicDifficulty?.currentDifficulty ?? currentState.aiDifficulty;
      const aiState = aiExecuteTurn({ ...currentState, aiDifficulty: dynamicDifficulty });

      // v55.0: Supply healing moved into endTurn() in engine.ts.
      // Each faction now gets exactly one heal per round at the start of their turn.
      // Previously red was healed twice (onEndTurn + runAITurn) and blue was healed zero times.
      let finalState = aiState;

      playTurnStartSound();
      set({
        ...finalState,
        isAiProcessing: false,
        animationKey: currentState.animationKey + 1,
        turnTransition: { faction: 'red', turn: aiState.turn, weatherChanged: aiState.currentWeather !== currentState.currentWeather ? aiState.currentWeather : undefined, previousWeather: aiState.currentWeather !== currentState.currentWeather ? currentState.currentWeather : undefined },
      });
      // v93.0: Track timer for cleanup
      if (_turnTransitionTimer) clearTimeout(_turnTransitionTimer);
      _turnTransitionTimer = setTimeout(() => { set({ turnTransition: null }); _turnTransitionTimer = null; }, 1500);

      // Check mission objectives after AI turn
      const missionResult = useMissionStore.getState().checkAndUpdateMission(finalState);
      if (missionResult) {
        const mission = useMissionStore.getState().currentMission;
        let winner = finalState.winner;
        let phase = finalState.phase;
        let victoryReason = finalState.victoryReason;
        if (missionResult === 'victory') {
          winner = 'red'; phase = 'gameOver'; victoryReason = `任务胜利 — ${mission?.name}`;
          playVictorySound();
        } else if (missionResult === 'defeat') {
          winner = 'blue'; phase = 'gameOver'; victoryReason = `任务失败 — ${mission?.name}`;
          playGameOverSound(false);
        } else if (missionResult === 'turn_limit') {
          winner = 'blue'; phase = 'gameOver'; victoryReason = `回合用尽 — ${mission?.name}`;
          playGameOverSound(false);
        }
        if (phase === 'gameOver') {
          set({ winner, phase, victoryReason });
        }
      }
    } catch (error) {
      console.error('[AI Turn Error]', error);
      // Force recovery: end AI processing and force turn back to red
      const fallbackState = get();
      if (fallbackState.phase === 'aiTurn') {
        const recovered = endTurn(fallbackState);
        set({ ...recovered, isAiProcessing: false, animationKey: (fallbackState.animationKey || 0) + 1 });
      } else {
        set({ isAiProcessing: false });
      }
    }
  }, delayMs);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function _buildSaveData(state: any) {
  return {
    units: state.units,
    map: state.map,
    currentFaction: state.currentFaction,
    phase: state.phase,
    turn: state.turn,
    combatLog: state.combatLog,
    aiDifficulty: state.aiDifficulty,
    turnSummaries: state.turnSummaries,
    capturePoints: state.capturePoints,
    levelUpNotifications: [],
    damagePopups: [],
    combatToasts: [],
    winner: state.winner,
    victoryReason: state.victoryReason,
    battleStats: state.battleStats,
    // v66.0: Persist gameStartTime so timer survives save/load
    gameStartTime: state.gameStartTime,
    selectedUnit: null,
    movablePositions: [],
    attackablePositions: [],
    movePath: [],
    lastTurnSummary: null,
    previousState: null,
    hoveredCell: null,
    shakeActive: false,
    movementAnimation: null,
    isAnimating: false,
    deployment: state.deployment,
    currentWeather: state.currentWeather ?? 'clear',
    weatherTurnsRemaining: state.weatherTurnsRemaining ?? 3,
    // v89.0: Persist next weather forecast
    nextWeather: state.nextWeather ?? 'clear',
    reinforcements: state.reinforcements,
    reinforcementBudget: state.reinforcementBudget,
    // v82: Persist isStrategicTacticalBattle so strategic context survives save/load
    isStrategicTacticalBattle: state.isStrategicTacticalBattle,
    aiDynamicDifficulty: state.aiDynamicDifficulty,
    gameSpeed: state.gameSpeed,
    mapType: state.mapType,
    saveVersion: SAVE_VERSION,
    // v68.0: Persist turnKillCounts and lastTurnTimestamp
    turnKillCounts: state.turnKillCounts,
    lastTurnTimestamp: state.lastTurnTimestamp,
    // v89.0: Persist overlay toggle states so they survive save/load
    showDefenseOverlay: state.showDefenseOverlay,
    showThreatOverlay: state.showThreatOverlay,
    // v91.0: Persist stats dashboard and army roster panel toggle states
    showStatsDashboard: state.showStatsDashboard,
    showArmyRoster: state.showArmyRoster,
  };
}

/** v93.0: Track turnTransition timeout so we can clear it on new game / init */
let _turnTransitionTimer: ReturnType<typeof setTimeout> | null = null;

/** Selective deep clone for undo snapshots — avoids serializing combat log, damage popups,
 *  turn summaries, notifications and other irrelevant-for-undo data.
 *  Only deep-clones fields that player actions mutate (units, map cells, etc.).
 *  v90.0: Added actionHistory shallow-array clone, temp buffs, markedTargets deep copy */
function _cloneForUndo(state: GameState): GameState {
  return {
    ...state,
    units: state.units.map(u => ({
      ...u,
      stats: { ...u.stats },
      abilities: u.abilities.map(a => ({ ...a, effect: { ...a.effect } })),
      // v90.0: Shallow-clone actionHistory array to prevent undo snapshot from
      // seeing future entries appended after the snapshot is taken
      actionHistory: [...u.actionHistory],
      // v90.0: Copy temp buff fields (primitives, but explicit for clarity)
      tempDefenseBuff: u.tempDefenseBuff,
      tempDefenseBuffTurns: u.tempDefenseBuffTurns,
      tempDamageBuff: u.tempDamageBuff,
      tempDamageBuffTurns: u.tempDamageBuffTurns,
      // markedTargets is string[] — [...arr] is a proper shallow copy (strings are primitives)
      markedTargets: u.markedTargets ? [...u.markedTargets] : undefined,
      markedTargetsTurns: u.markedTargetsTurns,
    })),
    map: {
      ...state.map,
      cells: state.map.cells.map(row => row.map(cell => ({ ...cell }))),
    },
    battleStats: {
      red: { ...state.battleStats.red },
      blue: { ...state.battleStats.blue },
    },
    capturePoints: state.capturePoints?.map(cp => ({ ...cp, captureProgress: { ...cp.captureProgress } })),
    selectedUnit: state.selectedUnit ? { ...state.selectedUnit, stats: { ...state.selectedUnit.stats } } : null,
    previousState: null,
  };
}

export const useGameStore = create<GameStore>((set, get) => ({
  ...initGameState(),
  isAiProcessing: false,
  animationKey: 0,
  mapType: 'random' as MapType,
  turnTransition: null as { faction: Faction; turn: number; weatherChanged?: string; previousWeather?: string } | null,
  showShortcuts: false,
  // v38.0: Undo toast notification
  undoToast: false,
  deployErrorToast: null,
  isPaused: false,
  selectedDeploymentType: null as UnitType | null,
  isMuted: false,
  panCameraTarget: null as { x: number; z: number } | null,
  cameraPosition: null as { x: number; z: number } | null,
  cameraZoom: 14,
  cameraAspect: 16 / 9,
  gameSpeed: 1,
  selectedReinforcementType: null as UnitType | null,
  heroPhase: 'none' as 'selecting' | 'confirmed' | 'none',
  selectedHeroId: null as string | null,
  heroSelectionMode: false,
  heroTargetingAbilityId: null as string | null,
  comparingUnit: null as Unit | null,

  // Replay system
  replayState: null as ReplayState | null,

  // Tutorial system
  tutorialEnabled: typeof window !== 'undefined' ? (localStorage.getItem('iron-chess-tutorial-dismissed') !== 'true') : true,
  tutorialStep: 0,

  // Strategic-Tactical integration
  isStrategicTacticalBattle: false,

  // v19.0: Battle Stats Dashboard
  showStatsDashboard: false,
  // Threat Heatmap Overlay
  showThreatOverlay: false,
  // Terrain Defense Bonus Overlay
  showDefenseOverlay: false,
  // Army Roster Panel
  showArmyRoster: false,

  // v19.0: Movement Path Preview
  hoveredMovePath: null as { x: number; z: number }[] | null,

  // v19.0: Attack Preview Targets
  attackPreviewTargets: null as { unitId: string; estimatedDamage: number; counterDamage: number; killProbability: number; expectedDamage: number; position: { x: number; z: number } }[] | null,

  // Undo Last Action
  previousTurnState: null as GameState | null,

  init: (difficulty: AIDifficulty = 'normal', mapType: MapType = 'random') => {
    if (aiTimeoutId) { clearTimeout(aiTimeoutId); aiTimeoutId = null; }
    const state = initGameState(difficulty, mapType);
    set({
      ...state,
      isAiProcessing: false,
      animationKey: 0,
      mapType,
      gameStartTime: Date.now(),
      heroPhase: 'none',
      selectedHeroId: null,
      heroSelectionMode: false,
      previousTurnState: null,
      isPaused: false,
      showStatsDashboard: false,
      showThreatOverlay: false,
      // v92.0: Bug fix — init() was missing showDefenseOverlay: false, so the overlay
      // could persist across game restarts if toggled on in a previous session
      showDefenseOverlay: false,
      showArmyRoster: false,
      showShortcuts: false,
      comparingUnit: null,
      selectedDeploymentType: null as UnitType | null,
      selectedReinforcementType: null as UnitType | null,
      heroTargetingAbilityId: null,
      turnTransition: null as { faction: Faction; turn: number; weatherChanged?: string; previousWeather?: string } | null,
      hoveredMovePath: null,
      attackPreviewTargets: null,
      undoToast: false,
  deployErrorToast: null,
      replayState: null,
    });
  },

  initHeroSelection: (difficulty: AIDifficulty = 'normal', mapType: MapType = 'random') => {
    if (aiTimeoutId) { clearTimeout(aiTimeoutId); aiTimeoutId = null; }
    const state = initHeroSelectionState(difficulty, mapType);
    set({
      ...state,
      isAiProcessing: false,
      animationKey: 0,
      mapType,
      gameStartTime: Date.now(),
      heroPhase: 'selecting',
      selectedHeroId: null,
      heroSelectionMode: true,
      previousTurnState: null,
      isPaused: false,
      showStatsDashboard: false,
      showThreatOverlay: false,
      showDefenseOverlay: false,
      showArmyRoster: false,
      showShortcuts: false,
      comparingUnit: null,
      selectedDeploymentType: null as UnitType | null,
      selectedReinforcementType: null as UnitType | null,
      heroTargetingAbilityId: null,
      turnTransition: null as { faction: Faction; turn: number; weatherChanged?: string; previousWeather?: string } | null,
      hoveredMovePath: null,
      attackPreviewTargets: null,
      undoToast: false,
  deployErrorToast: null,
      replayState: null,
    });
  },

  initDeployment: (difficulty: AIDifficulty = 'normal', mapType: MapType = 'random') => {
    if (aiTimeoutId) { clearTimeout(aiTimeoutId); aiTimeoutId = null; }
    const state = initDeploymentState(difficulty, mapType);
    set({
      ...state,
      isAiProcessing: false,
      animationKey: 0,
      mapType,
      gameStartTime: Date.now(),
      previousTurnState: null,
      isPaused: false,
      showStatsDashboard: false,
      showThreatOverlay: false,
      showDefenseOverlay: false,
      showArmyRoster: false,
      showShortcuts: false,
      comparingUnit: null,
      selectedDeploymentType: null as UnitType | null,
      selectedReinforcementType: null as UnitType | null,
      heroTargetingAbilityId: null,
      turnTransition: null as { faction: Faction; turn: number; weatherChanged?: string; previousWeather?: string } | null,
      hoveredMovePath: null,
      attackPreviewTargets: null,
      undoToast: false,
  deployErrorToast: null,
      replayState: null,
    });
  },

  initMission: (difficulty: AIDifficulty, mapType: MapType, redCustom: { type: string; x: number; z: number }[], blueCustom: { type: string; x: number; z: number }[]) => {
    if (aiTimeoutId) { clearTimeout(aiTimeoutId); aiTimeoutId = null; }
    const state = initGameStateWithDeployment(
      difficulty,
      mapType as MapType,
      redCustom as { type: UnitType; x: number; z: number }[],
      blueCustom as { type: UnitType; x: number; z: number }[],
    );
    set({
      ...state,
      isAiProcessing: false,
      animationKey: 0,
      mapType: mapType as MapType,
      gameStartTime: Date.now(),
      previousTurnState: null,
      isPaused: false,
      showStatsDashboard: false,
      showThreatOverlay: false,
      showDefenseOverlay: false,
      showArmyRoster: false,
      showShortcuts: false,
      comparingUnit: null,
      selectedDeploymentType: null as UnitType | null,
      selectedReinforcementType: null as UnitType | null,
      heroTargetingAbilityId: null,
      turnTransition: null as { faction: Faction; turn: number; weatherChanged?: string; previousWeather?: string } | null,
      hoveredMovePath: null,
      attackPreviewTargets: null,
      undoToast: false,
  deployErrorToast: null,
      replayState: null,
      heroSelectionMode: false,
      heroPhase: 'none',
    });
  },

  onCellClick: (pos: Position) => {
    const state = get();
    // v36.0: Added isPaused guard — player could fully interact while paused
    if (state.phase === 'aiTurn' || state.phase === 'gameOver' || state.phase === 'heroSelection' || state.isAiProcessing || state.isAnimating || state.isPaused) return;
    
    // Handle deployment phase clicks
    if (state.phase === 'deployment') {
      if (!state.selectedDeploymentType) return;
      const cell = state.map.cells[pos.z]?.[pos.x];
      if (!cell) return;
      // If clicking on own unit in deployment zone, remove it
      if (cell.unit && cell.unit.faction === 'red') {
        get().onRemoveDeployedUnit(cell.unit.id);
        return;
      }
      // Deploy selected unit type
      get().onDeployUnit(state.selectedDeploymentType, 'red', pos);
      return;
    }
    
    const cell = state.map.cells[pos.z]?.[pos.x];
    if (!cell) return;
    
    // 根据当前阶段处理点击
    if (state.phase === 'selectUnit') {
      // 选择单位
      if (cell.unit && cell.unit.faction === state.currentFaction && cell.unit.isAlive) {
        playSelectSound();
        const newState = selectUnit(state, cell.unit);
        set({ ...newState, animationKey: state.animationKey + 1 });
      } else if (cell.unit && cell.unit.faction !== state.currentFaction && cell.unit.isAlive && state.selectedUnit) {
        // v66.0: Block auto-attack on undetected stealthed enemies (don't leak position)
        if (cell.unit.isStealthed && !isUnitDetected(state, cell.unit, state.currentFaction)) {
          playErrorSound();
          return;
        }
        // 点击敌方单位 + 已有友方单位选中 → 自动移动攻击
        handleAutoMoveAttack(state, cell.unit.position, set);
      }
    } else if (state.phase === 'moveUnit') {
      // 检查是否点击了敌方单位 → 自动移动攻击
      if (cell.unit && cell.unit.faction !== state.currentFaction && cell.unit.isAlive && state.selectedUnit) {
        // v66.0: Block auto-attack on undetected stealthed enemies in moveUnit phase
        if (cell.unit.isStealthed && !isUnitDetected(state, cell.unit, state.currentFaction)) {
          playErrorSound();
          return;
        }
        handleAutoMoveAttack(state, cell.unit.position, set);
      } else {
        // 检查是否点击了可移动位置
        const isMovable = state.movablePositions.some(p => p.x === pos.x && p.z === pos.z);
        if (isMovable && state.selectedUnit) {
          // 计算动画路径
          playMoveSound();
          const snapshot: GameState = _cloneForUndo(state);
          const path = findMovementPath(state, state.selectedUnit, pos);
          const newState = moveUnit(state, state.selectedUnit, pos);
          // v30.0: Play mine explosion sound if unit stepped on a mine
          const prevMinePopups = state.damagePopups?.length ?? 0;
          const newMinePopups = newState.damagePopups?.length ?? 0;
          if (newMinePopups > prevMinePopups) {
            playMineExplosionSound();
          }
          set({
            ...newState,
            animationKey: state.animationKey + 1,
            isAnimating: true,
            movementAnimation: {
              unitId: state.selectedUnit.id,
              path,
              currentStep: 0,
              progress: 0,
              pendingAttack: null,
            },
            previousTurnState: snapshot,
          });
        } else if (cell.unit && cell.unit.faction === state.currentFaction && cell.unit.isAlive) {
          // 点击了另一个友方单位，切换选择
          if (cell.unit.id !== state.selectedUnit?.id) {
            const newState = selectUnit(state, cell.unit);
            set({ ...newState, animationKey: state.animationKey + 1 });
          } else {
            // 点击已选中的单位，取消选择
            const newState = deselectUnit(state);
            set({ ...newState, animationKey: state.animationKey + 1 });
          }
        } else {
          // 点击其他位置，取消选择
          const newState = deselectUnit(state);
          set({ ...newState, animationKey: state.animationKey + 1 });
        }
      }
    } else if (state.phase === 'attackUnit') {
      // v39.0: If hero ability targeting is active, route clicks to heroAbilityUse
      if (state.heroTargetingAbilityId && state.selectedUnit) {
        get().heroAbilityUse(state.selectedUnit.id, state.heroTargetingAbilityId, pos);
        return;
      }
      // 检查是否点击了可攻击位置
      const isAttackable = state.attackablePositions.some(p => p.x === pos.x && p.z === pos.z);
      if (isAttackable && state.selectedUnit) {
        playAttackSound();
        if (state.selectedUnit.isStealthed) playStealthExitSound();
        const snapshot: GameState = _cloneForUndo(state);
        const newState = attackUnit(state, state.selectedUnit, pos);
        if (newState.levelUpNotifications && newState.levelUpNotifications.length > (state.levelUpNotifications?.length ?? 0)) {
          playLevelUpSound();
        }
        playAttackResultSounds(newState);
        // v77.0: Cap levelUpNotifications
        const cappedNotifs = (newState.levelUpNotifications || []).slice(-10);
        set({ ...newState, animationKey: state.animationKey + 1, previousTurnState: snapshot, levelUpNotifications: cappedNotifs });
      } else if (cell.unit && cell.unit.faction === state.currentFaction && cell.unit.isAlive) {
        // 点击了另一个友方单位
        if (cell.unit.id !== state.selectedUnit?.id) {
          const newState = selectUnit(state, cell.unit);
          set({ ...newState, animationKey: state.animationKey + 1 });
        } else {
          // v70.0: 跳过攻击 — mark unit canAttack=false to prevent re-select exploit
          const skipUnits = state.units.map(u => u.id === state.selectedUnit!.id ? { ...u, canMove: false, canAttack: false } : u);
          set({ ...state, units: skipUnits, selectedUnit: null, movablePositions: [], attackablePositions: [], movePath: [], phase: 'selectUnit' as GamePhase, previousState: null, hoveredMovePath: null, attackPreviewTargets: null });
        }
      } else {
        // v70.0: 跳过攻击 — mark unit canAttack=false to prevent re-select exploit
        const skipUnits = state.units.map(u => u.id === state.selectedUnit!.id ? { ...u, canMove: false, canAttack: false } : u);
        set({ ...state, units: skipUnits, selectedUnit: null, movablePositions: [], attackablePositions: [], movePath: [], phase: 'selectUnit' as GamePhase, previousState: null, hoveredMovePath: null, attackPreviewTargets: null });
      }
    }
  },

  onEndTurn: () => {
    const state = get();
    if (state.phase === 'aiTurn' || state.phase === 'gameOver' || state.phase === 'deployment' || state.phase === 'heroSelection' || state.isAiProcessing || state.isAnimating) return;
    // v34.0: Also block end turn while paused
    if (state.isPaused) return;
    // v93.0: Guard autoSave — localStorage full or quota exceeded should not abort turn
    try { get().onAutoSave(); } catch (e) { console.warn('[AutoSave Error]', e); }
    playTurnEndSound();
    
    // v55.0: Supply healing moved into endTurn() in engine.ts.
    // Each faction now gets exactly one heal per round at the start of their turn.
    // v92.0: Changed let to const — newState is never reassigned
    const newState = endTurn(state);
    
    // v31.0: Play weather change sound when weather changes
    if (newState.currentWeather !== state.currentWeather) {
      playWeatherChangeSound();
    }
    
    // Commit the endTurn state to the store immediately so AI sees correct faction
    set({ 
      ...newState, 
      isAiProcessing: newState.currentFaction === 'blue' && newState.phase !== 'gameOver', 
      previousTurnState: null,
      turnTransition: { faction: newState.currentFaction, turn: newState.turn, weatherChanged: newState.currentWeather !== state.currentWeather ? newState.currentWeather : undefined, previousWeather: newState.currentWeather !== state.currentWeather ? state.currentWeather : undefined },
    });
    // v93.0: Track timer for cleanup
    if (_turnTransitionTimer) clearTimeout(_turnTransitionTimer);
    _turnTransitionTimer = setTimeout(() => { set({ turnTransition: null }); _turnTransitionTimer = null; }, 1500);
    
    // 如果轮到AI（且游戏未结束）
    if (newState.currentFaction === 'blue' && newState.phase !== 'gameOver') {
      runAITurn(get, set, AI_DELAY / (get().gameSpeed || 1));
    }

    // Mission objectives are checked ONLY after AI turn completes (inside setTimeout above).
    // Previously there was a redundant check here that could prematurely trigger game over
    // before the AI had a chance to respond. Removed to fix double task check bug.
  },

  onDeselect: () => {
    const state = get();
    if (state.isPaused) return;
    playCancelSound();
    const newState = deselectUnit(state);
    set({ ...newState, animationKey: state.animationKey + 1, hoveredMovePath: null, attackPreviewTargets: null });
  },

  onSkipUnit: () => {
    const state = get();
    if (state.isPaused || state.isAiProcessing || state.isAnimating || state.currentFaction !== 'red') return;
    if (state.selectedUnit) {
      // v66.0: Save undo snapshot for skip action (was missing — inconsistent with other actions)
      const snapshot: GameState = _cloneForUndo(state);
      // 标记当前单位为已行动
      const newUnits = state.units.map(u =>
        u.id === state.selectedUnit!.id ? { ...u, canMove: false, canAttack: false } : u
      );
      // v75.0: Update map cell unit references to match new unit objects
      const newMap = { ...state.map, cells: state.map.cells.map(row => row.map(cell => {
        const freshUnit = newUnits.find(u => u.id === cell.unit?.id);
        return freshUnit ? { ...cell, unit: freshUnit } : cell;
      }))};
      set({
        ...state,
        units: newUnits,
        map: newMap,
        selectedUnit: null,
        movablePositions: [],
        attackablePositions: [],
        movePath: [],
        phase: 'selectUnit' as GamePhase,
        animationKey: state.animationKey + 1,
        previousState: snapshot,
        previousTurnState: snapshot,
      });
    }
  },

  onUndoMove: () => {
    const state = get();
    if (state.isPaused) return;
    if (!state.isAiProcessing && !state.isAnimating && state.previousState && (state.phase === 'attackUnit' || state.phase === 'selectUnit' || state.phase === 'moveUnit')) {
      // Restore previous state but keep combat log and other accumulated state
      const prevState = state.previousState;
      set({
        ...prevState,
        combatLog: state.combatLog,
        turnSummaries: state.turnSummaries,
        lastTurnSummary: state.lastTurnSummary,
        aiDifficulty: state.aiDifficulty,
        // v48.0: Preserve accumulated state that shouldn't be reverted by move undo
        battleStats: state.battleStats,
        reinforcements: state.reinforcements,
        reinforcementBudget: state.reinforcementBudget,
        // v93.0: Let prevState.capturePoints be restored (was incorrectly overridden with current state)
        currentWeather: state.currentWeather,
        weatherTurnsRemaining: state.weatherTurnsRemaining,
        // v89.0: Persist next weather forecast
        nextWeather: state.nextWeather,
        aiDynamicDifficulty: state.aiDynamicDifficulty,
        shakeActive: false,
        animationKey: state.animationKey + 1,
        hoveredMovePath: null,
        attackPreviewTargets: null,
      });
    }
  },

  // v25.0: Click-to-focus from combat log (v29.0: fix grid→world coord conversion)
  // v34.0: Use selectUnit() for friendly units so movable/attackable positions are computed
  focusOnUnit: (unitId: string) => {
    const state = get();
    if (state.isPaused) return;
    // v82: Guard against deployment/heroSelection phases where no combat units exist
    if (state.phase === 'deployment' || state.phase === 'heroSelection') return;
    const unit = state.units.find(u => u.id === unitId && u.isAlive);
    if (unit) {
      // v29.0: Convert grid coords to world coords (matching Tab key handler in GameUI)
      const CT = 1.05; // CELL_TOTAL = CELL_SIZE + CELL_GAP
      const ox = -(MAP_WIDTH * CT) / 2;
      const oz = -(MAP_HEIGHT * CT) / 2;
      const panTarget = {
        x: ox + unit.position.x * CT + 0.5,
        z: oz + unit.position.z * CT + 0.5,
      };
      
      if (unit.faction === state.currentFaction && state.phase !== 'aiTurn' && !state.isAiProcessing && !state.isAnimating) {
        // v34.0: Use selectUnit() so movablePositions/attackablePositions are computed
        const selState = selectUnit(state, unit);
        set({ ...selState, panCameraTarget: panTarget, animationKey: state.animationKey + 1 });
      } else {
        // Enemy unit or during AI turn — just pan camera
        set({ panCameraTarget: panTarget, hoveredMovePath: null, attackPreviewTargets: null });
      }
    }
  },
  focusOnPosition: (pos: { x: number; z: number }) => {
    // v51.0: Fix — convert grid→world coords (was passing raw grid coords directly)
    const CT = 1.05;
    const ox = -(MAP_WIDTH * CT) / 2;
    const oz = -(MAP_HEIGHT * CT) / 2;
    set({ panCameraTarget: { x: ox + pos.x * CT + 0.5, z: oz + pos.z * CT + 0.5 } });
  },

  undoLastAction: () => {
    const state = get();
    if (state.isAiProcessing || state.isAnimating) return;
    if (!state.previousTurnState) return;
    if (state.currentFaction !== 'red') return;
    if (state.isPaused) return;
    // v54.0: Block undo during deployment and hero selection phases
    if (state.phase === 'deployment' || state.phase === 'heroSelection') return;
    const prevState = state.previousTurnState;
    // v36.0: Preserve accumulated state fields that shouldn't be reverted by undo
    // v51.0: Reset selection state for clean UI after undo
    set({
      ...prevState,
      selectedUnit: null,
      movablePositions: [],
      attackablePositions: [],
      movePath: [],
      phase: 'selectUnit' as GamePhase,
      combatLog: state.combatLog,
      turnSummaries: state.turnSummaries,
      lastTurnSummary: state.lastTurnSummary,
      aiDifficulty: state.aiDifficulty,
      battleStats: state.battleStats,
      reinforcements: state.reinforcements,
      reinforcementBudget: state.reinforcementBudget,
      // v93.0: Let prevState.capturePoints be restored (was incorrectly overridden with current state)
      currentWeather: state.currentWeather,
      weatherTurnsRemaining: state.weatherTurnsRemaining,
      // v89.0: Persist next weather forecast
      nextWeather: state.nextWeather,
      aiDynamicDifficulty: state.aiDynamicDifficulty,
      shakeActive: false,
      animationKey: state.animationKey + 1,
      previousTurnState: null,
      hoveredMovePath: null,
      attackPreviewTargets: null,
      // v38.0: Show undo toast notification
      undoToast: true,
    });
  },

  setHoveredCell: (pos: Position | null) => {
    const state = get();
    // Only update if position actually changed (called every frame from raycasting)
    const prev = state.hoveredCell;
    const same = (!pos && !prev) || (pos && prev && pos.x === prev.x && pos.z === prev.z);
    if (same) return;
    // Merge into single set() to avoid double re-render
    if (state.hoveredMovePath) {
      set({ hoveredCell: pos, hoveredMovePath: null });
    } else {
      set({ hoveredCell: pos });
    }
  },

  onActionMove: () => {
    const state = get();
    if (state.isPaused) return;
    if (state.selectedUnit && state.phase === 'selectUnit') {
      // Force move phase
      set({ phase: 'moveUnit' as GamePhase, attackPreviewTargets: null });
    }
  },

  onActionAttack: () => {
    const state = get();
    if (state.isPaused) return;
    if (state.selectedUnit && (state.phase === 'selectUnit' || state.phase === 'moveUnit')) {
      // Switch to attack phase
      const attackable = state.attackablePositions.length > 0 ? state.attackablePositions : [];
      if (attackable.length > 0) {
        set({ 
          phase: 'attackUnit' as GamePhase,
          movablePositions: [],
          animationKey: state.animationKey + 1,
          hoveredMovePath: null,
        });
        // v85.0: Compute attack preview targets synchronously to prevent race condition (was setTimeout)
        get().computeAttackPreviewTargets();
      }
    }
  },

  onActionWait: () => {
    get().onSkipUnit();
  },

  clearShake: () => {
    set({ shakeActive: false });
  },

  dismissTurnSummary: () => {
    set({ lastTurnSummary: null });
  },

  cycleUnit: () => {
    const state = get();
    if (state.isPaused) return;
    if (state.currentFaction !== 'red') return;
    
    // Get all red units that are alive and can still act
    const availableUnits = state.units.filter(
      u => u.faction === 'red' && u.isAlive && (u.canMove || u.canAttack)
    );
    if (availableUnits.length === 0) return;
    
    // If there's a selected unit, find the next one in the list
    let nextUnit: Unit;
    if (state.selectedUnit) {
      const currentIndex = availableUnits.findIndex(u => u.id === state.selectedUnit!.id);
      const nextIndex = (currentIndex + 1) % availableUnits.length;
      nextUnit = availableUnits[nextIndex];
    } else {
      nextUnit = availableUnits[0];
    }
    
    const newState = selectUnit(state, nextUnit);
    set({ ...newState, animationKey: state.animationKey + 1 });
  },

  cycleUnitWithCamera: () => {
    const state = get();
    if (state.phase === 'aiTurn' || state.phase === 'gameOver' || state.isAiProcessing || state.isAnimating || state.isPaused) return null;
    if (state.currentFaction !== 'red') return null;
    
    // Order: canMove → canAttack only → done
    const canMove = state.units.filter(u => u.faction === 'red' && u.isAlive && u.canMove);
    const canAttackOnly = state.units.filter(u => u.faction === 'red' && u.isAlive && !u.canMove && u.canAttack);
    const ordered = [...canMove, ...canAttackOnly];
    if (ordered.length === 0) return null;
    
    let nextUnit: Unit;
    if (state.selectedUnit) {
      const currentIndex = ordered.findIndex(u => u.id === state.selectedUnit!.id);
      if (currentIndex >= 0 && currentIndex < ordered.length - 1) {
        nextUnit = ordered[currentIndex + 1];
      } else if (currentIndex === ordered.length - 1) {
        // All cycled, deselect
        const newState = deselectUnit(state);
        set({ ...newState, animationKey: state.animationKey + 1 });
        return null;
      } else {
        nextUnit = ordered[0];
      }
    } else {
      nextUnit = ordered[0];
    }
    
    const newState = selectUnit(state, nextUnit);
    set({ ...newState, animationKey: state.animationKey + 1 });
    return nextUnit.name;
  },

  selectUnitByType: (type: string) => {
    const state = get();
    if (state.isPaused) return;
    if (state.currentFaction !== 'red') return;
    
    // Find the first available red unit of the given type that can still act
    const unit = state.units.find(
      u => u.faction === 'red' && u.isAlive && u.type === type && (u.canMove || u.canAttack)
    );
    
    if (unit) {
      const newState = selectUnit(state, unit);
      set({ ...newState, animationKey: state.animationKey + 1 });
    }
  },

  setShowShortcuts: (show: boolean) => {
    set({ showShortcuts: show });
  },
  // v38.0: Dismiss undo toast
  dismissUndoToast: () => {
    set({ undoToast: false });
  },
  // v72.0: Dismiss deploy error toast
  dismissDeployErrorToast: () => {
    set({ deployErrorToast: null });
  },
  togglePause: () => {
    const s = get();
    // v27.0: Block pause during hero selection, deployment, or game over
    // v66.0: Also block during AI processing to prevent race condition
    if (s.phase === 'gameOver' || s.phase === 'heroSelection' || s.phase === 'deployment' || s.isAnimating || s.isAiProcessing) return;
    const newPaused = !s.isPaused;
    // If resuming and it was the AI's turn, trigger AI execution
    if (!newPaused && s.currentFaction === 'blue' && !s.isAiProcessing) {
      set({ isPaused: false, isAiProcessing: true });
      runAITurn(get, set, 300);
    } else {
      set({ isPaused: newPaused });
    }
  },

  clearMovementAnimation: () => {
    set({ isAnimating: false, movementAnimation: null });
  },

  setMovementAnimation: (anim: MovementAnimation | null) => {
    set({ isAnimating: anim !== null, movementAnimation: anim });
  },

  executePendingAttack: () => {
    const state = get();
    if (!state.movementAnimation?.pendingAttack || !state.selectedUnit) {
      set({ isAnimating: false, movementAnimation: null });
      return;
    }

    const targetPos = state.movementAnimation.pendingAttack;
    const attacker = state.selectedUnit;
    
    // 检查攻击是否仍然有效 (v67.0: +isUnitDetected stealth check)
    const targetUnit = state.units.find(
      u => u.position.x === targetPos.x && u.position.z === targetPos.z && u.faction !== attacker.faction && u.isAlive && isUnitDetected(state, u, attacker.faction)
    );
    
    if (targetUnit && attacker.canAttack) {
      if (attacker.isStealthed) playStealthExitSound();
      const snapshot: GameState = _cloneForUndo(state);
      const newState = attackUnit(state, attacker, targetPos);
      if (newState.levelUpNotifications && newState.levelUpNotifications.length > (state.levelUpNotifications?.length ?? 0)) {
        playLevelUpSound();
      }
      playAttackResultSounds(newState);
      // v77.0: Cap levelUpNotifications
      const cappedNotifs3 = (newState.levelUpNotifications || []).slice(-10);
      set({ ...newState, isAnimating: false, movementAnimation: null, animationKey: state.animationKey + 1, previousTurnState: snapshot, levelUpNotifications: cappedNotifs3 });
    } else {
      // 攻击不再有效，跳过
      const skipState = { ...state, selectedUnit: null, movablePositions: [], attackablePositions: [], movePath: [], phase: 'selectUnit' as GamePhase, isAnimating: false, movementAnimation: null, previousState: null };
      set(skipState);
    }
  },

  addDamagePopups: (popups: DamagePopup[]) => {
    const state = get();
    set({ damagePopups: [...(state.damagePopups || []), ...popups] });
  },

  removeDamagePopup: (id: number) => {
    const state = get();
    set({ damagePopups: (state.damagePopups || []).filter(p => p.id !== id) });
  },

  removeCombatToast: (id: number) => {
    const state = get();
    set({ combatToasts: (state.combatToasts || []).filter(t => t.id !== id) });
  },

  getSupplyHealPositions: () => {
    const state = get();
    const positions: Position[] = [];
    if (!state.selectedUnit || state.selectedUnit.type !== 'supply') return positions;
    
    // v48.0: Include hero supply range bonus (angel_heal_passive grants +1 range)
    const heroBonus = getHeroSupplyBonus(state.selectedUnit);
    const healRange = (UNIT_CONFIGS.supply.healRange ?? 1) + heroBonus.rangeBonus;
    for (let dz = -healRange; dz <= healRange; dz++) {
      for (let dx = -healRange; dx <= healRange; dx++) {
        if (dx === 0 && dz === 0) continue;
        const nx = state.selectedUnit.position.x + dx;
        const nz = state.selectedUnit.position.z + dz;
        if (nx < 0 || nx >= MAP_WIDTH || nz < 0 || nz >= MAP_HEIGHT) continue;
        const dist = Math.abs(dx) + Math.abs(dz);
        if (dist <= healRange) {
          positions.push({ x: nx, z: nz });
        }
      }
    }
    return positions;
  },

  onBuildFortify: () => {
    const state = get();
    if (state.isPaused) return;
    if (!state.selectedUnit || state.selectedUnit.type !== 'engineer') return;
    // v65.0: Only require canAttack (move-then-build is valid)
    if (!state.selectedUnit.canAttack) return;
    if (state.currentFaction !== 'red') return;
    
    playFortifySound();
    const snapshot: GameState = _cloneForUndo(state);
    const newState = buildFortification(state, state.selectedUnit);
    // v28.0: Save to both previousState and previousTurnState for undo support
    set({ ...newState, animationKey: state.animationKey + 1, previousState: snapshot, previousTurnState: snapshot });
  },

  onClearMinefield: () => {
    const state = get();
    if (state.isPaused) return;
    if (!state.selectedUnit || state.selectedUnit.type !== 'engineer') return;
    // v65.0: Only require canAttack (move-then-clear is valid)
    if (!state.selectedUnit.canAttack) return;
    if (state.currentFaction !== 'red') return;
    
    playMineExplosionSound();
    // v36.0: Save undo snapshot (was missing — player couldn't undo mine clear)
    const snapshot: GameState = _cloneForUndo(state);
    const newState = clearMinefield(state, state.selectedUnit);
    if (newState !== state) {
      set({ ...newState, animationKey: state.animationKey + 1, previousState: snapshot, previousTurnState: snapshot });
    }
  },

  setGameSpeed: (speed: number) => {
    set({ gameSpeed: speed });
  },

  // Reinforcement system actions
  setSelectedReinforcementType: (type: UnitType | null) => {
    set({ selectedReinforcementType: type });
  },

  setComparingUnit: (unit: Unit | null) => {
    set({ comparingUnit: unit });
  },

  // ===== Hero System =====
  selectHero: (heroId: string) => {
    set({ selectedHeroId: heroId, heroPhase: 'selecting' });
  },

  confirmHeroSelection: () => {
    const { selectedHeroId, aiDifficulty: difficulty, mapType } = get();
    if (!selectedHeroId) {
      // Skip hero selection — initialize the game normally without a hero
      const state = initGameState(difficulty, mapType);
      set({
        ...state,
        heroPhase: 'confirmed',
        selectedHeroId: null,
        heroSelectionMode: false,
        isAiProcessing: false,
        animationKey: 0,
        mapType,
        gameStartTime: Date.now(),
      });
      return;
    }
    // Initialize game with the selected hero replacing the first unit of the same type
    const state = initGameState(difficulty, mapType);
    const hero = getHeroDefinition(selectedHeroId);
    if (hero) {
      // Find first red unit of the same type and upgrade it to hero
      const heroUnitIdx = state.units.findIndex(u => u.faction === 'red' && u.type === hero.unitType && u.isAlive);
      if (heroUnitIdx >= 0) {
        const heroUnit = createUnit(hero.unitType, 'red', state.units[heroUnitIdx].position, selectedHeroId);
        const newUnits = [...state.units];
        newUnits[heroUnitIdx] = heroUnit;
        // Update map cell reference
        const newMap = { ...state.map, cells: state.map.cells.map(row => row.map(cell => ({ ...cell }))) };
        const cell = newMap.cells[heroUnit.position.z]?.[heroUnit.position.x];
        if (cell) cell.unit = heroUnit;

        // v58.0: Auto-assign a blue hero for the AI opponent
        const blueHeroResult = assignBlueHero(newUnits, newMap, difficulty);
        if (blueHeroResult) {
          set({
            ...state,
            units: blueHeroResult.units,
            map: blueHeroResult.map,
            heroPhase: 'confirmed',
            heroSelectionMode: false,
            isAiProcessing: false,
            animationKey: 0,
            mapType,
            gameStartTime: Date.now(),
          });
          return;
        }
        set({
          ...state,
          units: newUnits,
          map: newMap,
          heroPhase: 'confirmed',
          heroSelectionMode: false,
          isAiProcessing: false,
          animationKey: 0,
          mapType,
          gameStartTime: Date.now(),
        });
        return;
      }
    }
    // Fallback: no matching unit found, init without hero
    set({
      ...state,
      heroPhase: 'confirmed',
      heroSelectionMode: false,
      isAiProcessing: false,
      animationKey: 0,
      mapType,
      gameStartTime: Date.now(),
    });
  },

  heroAbilityUse: (unitId: string, abilityId: string, targetPos?: Position) => {
    const state = get();
    if (state.isPaused) return;
    if (state.currentFaction !== 'red') return;
    if (state.phase === 'gameOver') return;
    if (state.isAiProcessing) return;
    if (state.isAnimating) return;
    const unit = state.units.find(u => u.id === unitId);
    if (!unit || !unit.isHero) return;

    const needsTarget = heroAbilityNeedsTarget(abilityId);
    if (needsTarget && !targetPos) {
      // Enter targeting mode
      set({ heroTargetingAbilityId: abilityId, phase: 'attackUnit' as GamePhase });
      return;
    }

    playHeroAbilitySound();
    const newState = executeHeroAbility(state, unit, abilityId, targetPos);
    if (newState !== state) {
      // v73.0: Check victory condition after hero ability (AoE can kill all enemies)
      const redAlive = newState.units.filter(u => u.faction === 'red' && u.isAlive).length;
      const blueAlive = newState.units.filter(u => u.faction === 'blue' && u.isAlive).length;
      const victoryState = (redAlive === 0 || blueAlive === 0) ? {
        winner: (redAlive === 0 ? 'blue' : 'red') as import('@/game/types').Faction,
        phase: 'gameOver' as import('@/game/types').GamePhase,
        victoryReason: '歼灭胜利' as string,
      } : {};
      const snapshot: GameState = _cloneForUndo(state);
      // v28.0: Save to both previousState and previousTurnState for undo support
      set({ ...newState, ...victoryState, heroTargetingAbilityId: null, animationKey: state.animationKey + 1, previousState: snapshot, previousTurnState: snapshot });
    }
  },

  cancelHeroTargeting: () => {
    const state = get();
    // v30.0: Do NOT clear previousState — preserve undo state from before targeting
    // v36.0: Recompute action positions via selectUnit instead of clearing to empty
    const selectedUnit = state.selectedUnit;
    if (selectedUnit && state.currentFaction === 'red') {
      const refreshed = selectUnit(state, selectedUnit);
      set({ ...refreshed, heroTargetingAbilityId: null });
    } else {
      set({ heroTargetingAbilityId: null, phase: 'selectUnit' as GamePhase, selectedUnit: state.selectedUnit, movablePositions: [], attackablePositions: [] });
    }
  },

  getAvailableHeroes: (faction: Faction) => {
    return getHeroesForFaction(faction);
  },

  // ===== Replay System =====
  startReplay: () => {
    const state = get();
    // v36.0: Added phase/state guards — could start replay during AI processing or pause
    if (state.isAiProcessing || state.isAnimating || state.isPaused || state.phase === 'aiTurn' || state.phase === 'gameOver') return;
    if (!state.lastTurnSummary) return;
    const { turn, faction } = state.lastTurnSummary;
    // Build replay actions from combat log for the last turn
    const turnLogs = state.combatLog.filter(l => l.turn === turn);
    const actions: ReplayAction[] = [];
    const seen = new Set<string>();
    for (const log of turnLogs) {
      const key = `${log.attacker}-${log.defender}-${log.turn}`;
      if (seen.has(key)) continue;
      seen.add(key);
      if (log.eventType === 'destroy') {
        actions.push({
          type: 'destroy',
          unitId: log.attackerUnitId || log.attacker,
          targetId: log.defenderUnitId || log.defender,
          damage: log.damage,
          description: `${log.attacker} 💀 击毁了 ${log.defender}（-${log.damage}）`,
        });
      } else if (log.eventType === 'counter') {
        actions.push({
          type: 'attack',
          unitId: log.defenderUnitId || log.defender,
          targetId: log.attackerUnitId || log.attacker,
          damage: log.damage,
          description: `${log.defender} ⚔️ 反击 ${log.attacker}（-${log.damage}）`,
        });
      } else {
        actions.push({
          type: 'attack',
          unitId: log.attackerUnitId || log.attacker,
          targetId: log.defenderUnitId || log.defender,
          damage: log.damage,
          description: `${log.attacker} ⚔️ 攻击 ${log.defender}（-${log.damage}）`,
        });
      }
    }
    if (actions.length === 0) {
      actions.push({
        type: 'move',
        unitId: '',
        description: `第 ${turn} 回合无战斗记录`,
      });
    }
    set({
      replayState: {
        isReplaying: true,
        replayActions: actions,
        currentReplayStep: 0,
        turnNumber: turn,
        faction,
      },
    });
  },

  nextReplayStep: () => {
    const state = get();
    if (!state.replayState) return;
    const { currentReplayStep, replayActions } = state.replayState;
    if (currentReplayStep < replayActions.length - 1) {
      set({
        replayState: {
          ...state.replayState,
          currentReplayStep: currentReplayStep + 1,
        },
      });
    }
  },

  endReplay: () => {
    set({ replayState: null });
  },

  // ===== Tutorial System =====
  advanceTutorial: () => {
    const state = get();
    if (state.tutorialStep < TUTORIAL_STEPS.length - 1) {
      set({ tutorialStep: state.tutorialStep + 1 });
    } else {
      set({ tutorialStep: -1 });
    }
  },

  dismissTutorial: () => {
    set({ tutorialEnabled: false, tutorialStep: -1 });
    try { localStorage.setItem('iron-chess-tutorial-dismissed', 'true'); } catch { /* ignore */ }
  },

  // ===== v19.0: Battle Stats Dashboard =====
  toggleStatsDashboard: () => {
    set({ showStatsDashboard: !get().showStatsDashboard });
  },

  // ===== Threat Heatmap Overlay =====
  toggleThreatOverlay: () => {
    set({ showThreatOverlay: !get().showThreatOverlay });
  },

  // ===== Terrain Defense Bonus Overlay =====
  toggleDefenseOverlay: () => {
    set({ showDefenseOverlay: !get().showDefenseOverlay });
  },

  // ===== Army Roster Panel =====
  toggleArmyRoster: () => {
    set({ showArmyRoster: !get().showArmyRoster });
  },

  // ===== v19.0: Movement Path Preview =====
  setHoveredMovePath: (path: { x: number; z: number }[] | null) => {
    const current = get().hoveredMovePath;
    // Only update if path actually changed (prevent infinite re-render loops)
    const same = (!path && !current) || (path && current && path.length === current.length && path.every((p, i) => p.x === current[i].x && p.z === current[i].z));
    if (!same) set({ hoveredMovePath: path });
  },

  // ===== v19.0: Attack Preview Targets =====
  computeAttackPreviewTargets: () => {
    const state = get();
    if (state.phase !== 'attackUnit' || !state.selectedUnit || !state.attackablePositions || state.attackablePositions.length === 0) {
      set({ attackPreviewTargets: null });
      return;
    }
    const targets: { unitId: string; estimatedDamage: number; counterDamage: number; killProbability: number; expectedDamage: number; position: { x: number; z: number }; targetTerrain?: string; targetDefenseBonus?: number; }[] = [];
    for (const atkPos of state.attackablePositions) {
      const targetUnit = state.units.find(u => u.position.x === atkPos.x && u.position.z === atkPos.z && u.faction !== state.selectedUnit!.faction && u.isAlive);
      if (!targetUnit) continue;
      const defenderCell = state.map.cells[atkPos.z]?.[atkPos.x];
      if (!defenderCell) continue;
      // v87.0: Removed no-op setAttackerTerrainAtkBonus calls (dead code since v84)
      const selUnitCell = state.map.cells[state.selectedUnit.position.z]?.[state.selectedUnit.position.x];
      const dmg = estimateDamage(state.selectedUnit, targetUnit, defenderCell, !state.selectedUnit.canMove, state.currentWeather, state.units, selUnitCell?.terrain);
      const avgDamage = Math.round((dmg.min + dmg.max) / 2);
      // Kill probability via Monte Carlo simulation
      const killResult = calculateKillProbability(state.selectedUnit, targetUnit, defenderCell, false, state.currentWeather, selUnitCell?.terrain);
      // Counter damage estimate (60% of defender's attack vs attacker on their cell)
      // v56.0: Check defender has ammo and morale above crush threshold (can actually counter)
      const attackerCell = state.map.cells[state.selectedUnit.position.z]?.[state.selectedUnit.position.x];
      let counterDmg = 0;
      const defenderCanCounter = targetUnit.stats.ammo == null || targetUnit.stats.ammo > 0;
      const defenderNotCrushed = targetUnit.stats.morale == null || targetUnit.stats.morale >= 20;
      const inCounterRange = attackerCell && targetUnit.stats.attackRange >= Math.abs(targetUnit.position.x - state.selectedUnit.position.x) + Math.abs(targetUnit.position.z - state.selectedUnit.position.z);
      if (defenderCanCounter && defenderNotCrushed && inCounterRange) {
        // v87.0: Removed no-op setAttackerTerrainAtkBonus call; targetUnitCell computed inline
        const targetUnitCell = state.map.cells[targetUnit.position.z]?.[targetUnit.position.x];
        const counterEst = estimateDamage(targetUnit, state.selectedUnit, attackerCell, false, state.currentWeather, state.units, targetUnitCell?.terrain);
        counterDmg = Math.round((counterEst.min + counterEst.max) / 2 * 0.6);
      }
      targets.push({ unitId: targetUnit.id, estimatedDamage: avgDamage, counterDamage: counterDmg, killProbability: killResult.killProbability, expectedDamage: killResult.expectedDamage, position: { x: atkPos.x, z: atkPos.z }, targetTerrain: defenderCell.terrain, targetDefenseBonus: TERRAIN_CONFIGS[defenderCell.terrain].stats.defenseBonus });
    }
    set({ attackPreviewTargets: targets });
    // v87.0: Removed no-op setAttackerTerrainAtkBonus reset (dead code since v84)
 },

  onDeployReinforcement: (unitType: UnitType, position: Position) => {
    const state = get();
    if (state.isPaused) return;
    if (state.currentFaction !== 'red') return;
    if (state.phase === 'gameOver') return;
    if (state.isAiProcessing) return;
    if (state.isAnimating) return;
    if (state.phase !== 'selectUnit') return;
    // v72.0: Save undo snapshot before reinforcement deployment
    const snapshot: GameState = _cloneForUndo(state);
    const newState = deployReinforcement(state, unitType, 'red', position);
    if (newState !== state) {
      // v72.0: Only play deploy sound on success
      playDeploySound();
      // v48.0: Reinforcement units cannot act on the turn they are deployed
      const deployedUnits = (newState.units || []).map(u => {
        if (u.faction === 'red' && state.units.findIndex(su => su.id === u.id) === -1) {
          return { ...u, canMove: false, canAttack: false };
        }
        return u;
      });
      set({ ...newState, units: deployedUnits, animationKey: state.animationKey + 1, selectedReinforcementType: null, previousState: snapshot, previousTurnState: snapshot });
    } else {
      // v72.0: Error feedback when reinforcement deployment fails
      const cell = state.map.cells[position.z]?.[position.x];
      const terrainName = cell ? TERRAIN_CONFIGS[cell.terrain]?.name : '未知';
      const errorMsg = cell?.unit
        ? `无法部署：该位置已被占据`
        : cell && !TERRAIN_CONFIGS[cell.terrain]?.stats.isPassable
          ? `无法部署：${terrainName}地形不可通行`
          : `无法部署：超出部署区域`;
      set({ deployErrorToast: errorMsg });
    }
  },

  getReinforcements: () => {
    const state = get();
    return state.reinforcements.red || [];
  },

  // Deployment actions
  setSelectedDeploymentType: (type: UnitType | null) => {
    set({ selectedDeploymentType: type });
  },

  onDeployUnit: (unitType: UnitType, faction: Faction, position: Position) => {
    const state = get();
    if (state.phase !== 'deployment') return;
    playDeploySound();
    const newState = deployUnit(state, unitType, faction, position);
    set({ ...newState, animationKey: state.animationKey + 1 });
  },

  onRemoveDeployedUnit: (unitId: string) => {
    const state = get();
    if (state.phase !== 'deployment') return;
    const newState = removeDeployedUnit(state, unitId);
    set({ ...newState, animationKey: state.animationKey + 1 });
  },

  onConfirmDeployment: () => {
    const state = get();
    if (state.phase !== 'deployment') return;
    const newState = confirmTacticalDeployment(state);
    set({ ...newState, animationKey: state.animationKey + 1, selectedDeploymentType: null });
  },

  onAutoDeployRed: () => {
    const state = get();
    if (state.phase !== 'deployment') return;
    // Deploy a balanced red force using priority template
    const deploymentTemplate: UnitType[] = ['tank', 'tank', 'ifv', 'ifv', 'ifv', 'artillery', 'artillery', 'scout', 'scout', 'infantry', 'infantry', 'infantry', 'sam', 'supply', 'helicopter'];
    let currentState: GameState = { ...state } as unknown as GameState;
    for (const unitType of deploymentTemplate) {
      const cost = TACTICAL_UNIT_COSTS[unitType];
      const budget = getTacticalDeploymentBudget(currentState, 'red');
      if (cost > budget) continue;
      // v76.0: Use proportional deployment zone instead of hardcoded 0-3
      const deployMaxX = Math.floor(MAP_WIDTH * 0.25);
      let placed = false;
      for (let x = 0; x <= deployMaxX && !placed; x++) {
        for (let z = 0; z < state.map.height && !placed; z++) {
          const cell = currentState.map.cells[z]?.[x];
          if (!cell) continue;
          const isVehicle = UNIT_CONFIGS[unitType]?.isVehicle ?? false;
          const isHelicopter = unitType === 'helicopter';
          let passable = false;
          if (isHelicopter) {
            passable = cell.terrain !== 'water' && !cell.unit;
          } else {
            passable = TERRAIN_CONFIGS[cell.terrain].stats.isPassable && !cell.unit;
            if (passable && isVehicle) {
              passable = TERRAIN_CONFIGS[cell.terrain].stats.isPassableByVehicle;
            }
          }
          if (passable) {
            const newState = deployUnit(currentState, unitType, 'red', { x, z });
            if (newState !== currentState) {
              currentState = newState;
              placed = true;
            }
          }
        }
      }
    }
    set({ ...currentState, animationKey: state.animationKey + 1 });
  },

  getDeploymentBudget: (faction: Faction) => {
    const state = get();
    return getTacticalDeploymentBudget(state, faction);
  },

  // Stealth & capture point actions
  onEnterStealth: () => {
    const state = get();
    if (state.isPaused) return;
    if (!state.selectedUnit) return;
    if (state.currentFaction !== 'red') return;
    
    playStealthEnterSound();
    // v36.0: Save undo snapshot (was missing — player couldn't undo stealth entry)
    const snapshot: GameState = _cloneForUndo(state);
    const newState = enterStealth(state, state.selectedUnit);
    if (newState !== state) {
      set({ ...newState, animationKey: state.animationKey + 1, previousState: snapshot, previousTurnState: snapshot });
    }
  },

  getCapturePoints: () => {
    return get().capturePoints || [];
  },

  getVisibleEnemyUnits: () => {
    const state = get();
    return getVisibleUnits(state, state.currentFaction).filter(u => u.faction !== state.currentFaction);
  },

  onRetreatUnit: () => {
    const state = get();
    if (!state.selectedUnit || state.phase === 'aiTurn' || state.phase === 'gameOver' || state.phase === 'deployment') return;
    // v40.0: Added isPaused guard
    if (state.isPaused) return;
    // v30.0: Only allow red player to retreat
    if (state.currentFaction !== 'red') return;
    // v36.0: Added isAiProcessing and isAnimating guards
    if (state.isAiProcessing || state.isAnimating) return;
    const unit = state.units.find(u => u.id === state.selectedUnit!.id);
    if (!unit) return;
    playRetreatSound();
    // v28.0: Save undo snapshot before retreat
    const snapshot: GameState = _cloneForUndo(state);
    const newState = retreatUnit(state, unit);
    set({ ...newState, animationKey: state.animationKey + 1, previousState: snapshot, previousTurnState: snapshot });
  },

  // ===== Multi-Slot Save/Load System =====
  saveGame: (slot: number) => {
    const state = get();
    if (state.phase === 'gameOver' || !state.map || state.phase === 'deployment' || state.phase === 'heroSelection') return;
    // v36.0: Block saving during AI turn (could save inconsistent mid-AI state)
    if (state.phase === 'aiTurn' || state.isAiProcessing || state.isPaused) return;
    if (slot < 1 || slot > 3) return;
    try {
      const saveData = _buildSaveData(state);
      const key = `tactical-save-${slot}`;
      localStorage.setItem(key, JSON.stringify(saveData));
      // Save metadata
      localStorage.setItem(`${key}-info`, JSON.stringify({
        slot,
        turn: state.turn,
        faction: state.currentFaction,
        redAlive: state.units.filter(u => u.faction === 'red' && u.isAlive).length,
        blueAlive: state.units.filter(u => u.faction === 'blue' && u.isAlive).length,
        savedAt: new Date().toISOString(),
      }));
      playSaveSound();
    } catch (e) {
      console.error('Save failed:', e);
    }
  },

  loadGame: (slot: number) => {
    if (slot < 1 || slot > 3) return;
    if (aiTimeoutId) { clearTimeout(aiTimeoutId); aiTimeoutId = null; }
    try {
      const key = `tactical-save-${slot}`;
      const saved = localStorage.getItem(key);
      if (!saved) return;
      const saveData = JSON.parse(saved);
      // v28.0: Version migration check
      const saveVersion = (saveData as any).saveVersion;
      if (saveVersion && saveVersion !== SAVE_VERSION) {
        console.warn(`Save from version ${saveVersion}, current is ${SAVE_VERSION}. Loading with best-effort migration.`);
      }
      // Ensure fields added in newer versions have defaults
      // v35.0: Comprehensive migration defaults for fields added after initial save format
      const migratedData = {
        ...saveData,
        aiDynamicDifficulty: (saveData as any).aiDynamicDifficulty ?? null,
        reinforcements: (saveData as any).reinforcements ?? { red: [], blue: [] },
        reinforcementBudget: (saveData as any).reinforcementBudget ?? { red: 0, blue: 0 },
        capturePoints: (saveData as any).capturePoints ?? [],
        currentWeather: (saveData as any).currentWeather ?? 'clear',
        weatherTurnsRemaining: (saveData as any).weatherTurnsRemaining ?? 3,
        // v89.0: Load next weather forecast from save
        nextWeather: (saveData as any).nextWeather ?? 'clear',
        battleStats: (saveData as any).battleStats ?? {
          red: { damageDealt: 0, damageReceived: 0, unitsDestroyed: 0, unitsLost: 0, healingDone: 0, attacks: 0, kills: 0, retreated: 0, fortsBuilt: 0 },
          blue: { damageDealt: 0, damageReceived: 0, unitsDestroyed: 0, unitsLost: 0, healingDone: 0, attacks: 0, kills: 0, retreated: 0, fortsBuilt: 0 },
        },
        turnTransition: null,
        shakeActive: false,
        // v40.0: Restore game speed from save
        gameSpeed: (saveData as any).gameSpeed ?? 1,
        // v64.0: Initialize lastTurnTimestamp to prevent inflated heal count on first turn
        lastTurnTimestamp: (saveData as any).lastTurnTimestamp ?? Date.now(),
        // v67.0→v69.0: Reset kill tracking on load (ephemeral streak data, not meaningful across saves)
        turnKillCounts: { red: 0, blue: 0 },
      };
      set({
        ...migratedData,
        animationKey: (get().animationKey || 0) + 1,
        isAiProcessing: false,
        isMuted: get().isMuted,
        // v67.0: Restore saved gameStartTime instead of always resetting to now
        gameStartTime: (saveData as any).gameStartTime ?? Date.now(),
        // v36.0: Reset previousTurnState and isPaused to prevent undo corruption and rogue AI trigger
        previousTurnState: null,
        previousState: null,
        isPaused: false,
        // v41.0: Reset all UI-only fields to prevent stale state from prior session
        heroPhase: 'none',
        selectedHeroId: null,
        heroSelectionMode: false,
        heroTargetingAbilityId: null,
        // v89.0: Restore overlay toggle states from save data (instead of always resetting to false)
        showThreatOverlay: (saveData as any).showThreatOverlay ?? false,
        showDefenseOverlay: (saveData as any).showDefenseOverlay ?? false,
        // v91.0: Restore stats dashboard and army roster panel states
        showStatsDashboard: (saveData as any).showStatsDashboard ?? false,
        showArmyRoster: (saveData as any).showArmyRoster ?? false,
        showShortcuts: false,
        comparingUnit: null,
        selectedDeploymentType: null as UnitType | null,
        selectedReinforcementType: null as UnitType | null,
        hoveredMovePath: null,
        attackPreviewTargets: null,
        undoToast: false,
  deployErrorToast: null,
        panCameraTarget: null,
        cameraPosition: null,
        cameraZoom: 14,
        replayState: null,
        // v82: Restore isStrategicTacticalBattle from save data
        isStrategicTacticalBattle: saveData.isStrategicTacticalBattle ?? false,
      });
    } catch (e) {
      console.error('Load failed:', e);
    }
  },

  deleteSave: (slot: number) => {
    if (slot < 1 || slot > 3) return;
    try {
      const key = `tactical-save-${slot}`;
      localStorage.removeItem(key);
      localStorage.removeItem(`${key}-info`);
    } catch (e) {
      console.error('Delete save failed:', e);
    }
  },

  getSaveSlots: (): SaveSlotInfo[] => {
    const slots: SaveSlotInfo[] = [];
    for (let i = 1; i <= 3; i++) {
      const key = `tactical-save-${i}`;
      const infoStr = localStorage.getItem(`${key}-info`);
      if (infoStr) {
        try {
          const info = JSON.parse(infoStr);
          slots.push({
            slot: i,
            timestamp: info.savedAt || '',
            turn: info.turn || 0,
            faction: info.faction || 'red',
            redAlive: info.redAlive ?? 0,
            blueAlive: info.blueAlive ?? 0,
          });
        } catch (_e) {
          slots.push({
            slot: i,
            timestamp: '',
            turn: 0,
            faction: 'red',
            redAlive: 0,
            blueAlive: 0,
          });
        }
      } else {
        // v92.0: Bug fix — push a proper empty sentinel instead of null-as-SaveSlotInfo
        slots.push({ slot: i, timestamp: '', turn: 0, faction: 'red', redAlive: 0, blueAlive: 0 });
      }
    }
    return slots;
  },

  onAutoSave: () => {
    const state = get();
    if (state.phase === 'gameOver' || state.phase === 'deployment' || state.phase === 'heroSelection' || state.isAiProcessing || state.isPaused) return;
    try {
      const saveData = _buildSaveData(state);
      localStorage.setItem('iron_tactics_autosave', JSON.stringify(saveData));
    } catch (_e) {
      // v68.0: Show toast notification on auto-save failure
      try {
        const event = new CustomEvent('autosave-failed');
        window.dispatchEvent(event);
      } catch {}
    }
  },

  // ===== Strategic-Tactical Integration =====

  initStrategicTacticalBattle: (tacticalState: GameState) => {
    set({
      ...tacticalState,
      isAiProcessing: false,
      animationKey: 0,
      isStrategicTacticalBattle: true,
      gameStartTime: Date.now(),
      previousTurnState: null,
    });
  },

  returnToStrategic: () => {
    const state = get();
    if (!state.isStrategicTacticalBattle) return;

    // Dynamically import to avoid circular dependencies at module level
    // v54.0: Use try/catch to handle potential ESM resolution failure in production
    let useStrategicStore: any, convertTacticalResultToStrategic: any;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const strategicMod = require('@/store/strategic-store');
      useStrategicStore = strategicMod.useStrategicStore;
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const tacticalMod = require('@/game/tactical-integration');
      convertTacticalResultToStrategic = tacticalMod.convertTacticalResultToStrategic;
    } catch {
      console.warn('[returnToStrategic] Failed to load strategic store modules');
      return;
    }
    const strategicStore = useStrategicStore.getState();
    const config = strategicStore.tacticalBattleConfig;

    if (config) {
      // Convert tactical result to strategic result
      const result = convertTacticalResultToStrategic(state, config);
      strategicStore.onReturnToStrategic(result);
    } else {
      // No config, just switch back
      strategicStore.setGameMode('strategic');
    }

    set({ isStrategicTacticalBattle: false });
  },

  enterTacticalFromCombatViewport: () => {
    let useStrategicStore: any;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const strategicMod = require('@/store/strategic-store');
      useStrategicStore = strategicMod.useStrategicStore;
    } catch {
      console.warn('[enterTacticalFromCombatViewport] Failed to load strategic store modules');
      return;
    }
    const strategicState = useStrategicStore.getState();
    const gameMap = strategicState.tacticalMapFromWorld;
    if (!gameMap) {
      console.warn('[enterTacticalFromCombatViewport] No tacticalMapFromWorld available');
      return;
    }

    const tacticalState = initGameStateFromMap(gameMap, strategicState.aiDifficulty ?? 'normal');
    set({
      ...tacticalState,
      isAiProcessing: false,
      animationKey: 0,
      isStrategicTacticalBattle: true,
      gameStartTime: Date.now(),
      previousTurnState: null,
    });
    // Switch to tactical mode in strategic store
    strategicState.setGameMode('tactical');
  },

  // ===== Sound Mute Toggle =====
  toggleMute: () => {
    const current = get().isMuted;
    set({ isMuted: !current });
    setMutedState(!current);
  },

  // ===== Camera Pan Target (from minimap click) =====
  setPanCameraTarget: (target: { x: number; z: number } | null) => {
    set({ panCameraTarget: target });
  },

  setCameraPosition: (pos: { x: number; z: number } | null) => {
    set({ cameraPosition: pos });
  },
  setCameraZoom: (zoom: number) => {
    set({ cameraZoom: zoom });
  },
  setCameraAspect: (aspect: number) => {
    set({ cameraAspect: aspect });
  },
}));

// ===== Exported helper functions for save/load =====
export function saveGameToSlot(slot: number) {
  useGameStore.getState().saveGame(slot);
}

export function loadGameFromSlot(slot: number) {
  useGameStore.getState().loadGame(slot);
}

export function deleteSaveSlot(slot: number) {
  useGameStore.getState().deleteSave(slot);
}

export function getSaveSlotInfos(): (SaveSlotInfo | null)[] {
  return useGameStore.getState().getSaveSlots();
}