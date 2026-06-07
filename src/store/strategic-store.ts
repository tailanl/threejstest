// ===== 战略模式状态管理 (Zustand) =====

import { create } from 'zustand';
import { AIDifficulty, Faction, GameMap } from '@/game/types';
import {
  StrategicGameState,
  StrategicPosition,
  StrategicForce,
  GameMode,
  ReinforcementInfo,
  StrategicSector,
} from '@/game/strategic-types';
import {
  initStrategicGame,
  selectStrategicForce,
  deselectStrategicForce,
  moveForce,
  executeStrategicAttack,
  endStrategicTurn,
  getMovableSectors,
  getAttackableSectors,
  aiExecuteStrategicTurn,
  calculateStrategicVisibility,
  autoPlayStrategicTurn,
  quickResolveAll,
  initStrategicDeployment,
  deployForce,
  removeDeployedForce,
  confirmDeployment,
  getDeploymentBudget,
  FORCE_TEMPLATES,
} from '@/game/strategic-engine';
import { getSector } from '@/game/strategic-map';
import { STRATEGIC_TERRAIN_CONFIGS } from '@/game/strategic-types';
import {
  TacticalBattleConfig,
  TacticalBattleResult,
  generateTacticalBattleConfig,
  initTacticalFromStrategic,
  convertTacticalResultToStrategic,
} from '@/game/tactical-integration';
import {
  playSelectSound, playMoveSound, playAttackSound, playClickSound,
  playTurnStartSound, playTurnEndSound, playCancelSound, playSaveSound,
  playDeploySound, playGameOverSound, playVictorySound, playErrorSound,
} from '@/game/audio';
import type { WorldAtlas } from '@/game/world-atlas/atlas-types';
import type { RegionTile } from '@/game/world-map/world-map-types';
import type { OperationView } from '@/game/world-view/operation-view';
import type { CombatViewport } from '@/game/world-view/combat-viewport';
import type { AIReport } from '@/game/reports/report-types';
import type { BattleLogEvent } from '@/game/reports/report-types';
import type { HQOrder, ForceCommandState } from '@/game/command/command-types';
import { generateWorldAtlas } from '@/game/world-atlas/macro-map-generator';
import { DEFAULT_WORLD_ATLAS_CONFIG } from '@/game/world-atlas/atlas-config';
import { generateRegionTile } from '@/game/world-atlas/region-tile-generator';
import { buildStrategicMapFromRegionTile } from '@/game/world-view/strategic-map-adapter';
import { getOperationViewForChunk } from '@/game/world-view/operation-view';
import { getCombatViewportFromOperationCell } from '@/game/world-view/combat-viewport';
import { convertCombatViewportToGameMap } from '@/game/world-view/world-to-game-map';
import { generateReportsFromBattleLog } from '@/game/reports/report-generator';
import { parseCommandText, createHQOrderFromParsed } from '@/game/command/command-parser';
import { delegateForceToAI, recallForceFromAI } from '@/game/command/delegation';

const BASE_AI_STRATEGIC_DELAY = 800;

// ===== Save/Load Types =====
export interface StrategicSaveSlotInfo {
  slot: number;
  timestamp: string;
  turn: number;
  redForces: number;
  blueForces: number;
}

interface StrategicStore extends StrategicGameState {
  // Mode
  gameMode: GameMode;

  // Strategic-Tactical integration
  tacticalBattleConfig: TacticalBattleConfig | null;
  showBattleChoiceDialog: boolean;

  // Actions
  initStrategic: (difficulty?: AIDifficulty) => void;
  initStrategicDeployment: (difficulty?: AIDifficulty) => void;
  onSectorClick: (pos: StrategicPosition) => void;
  onEndTurn: () => void;
  onAutoPlayTurn: () => void;
  onQuickResolve: () => void;
  selectForce: (force: StrategicForce) => void;
  deselectForce: () => void;
  setGameMode: (mode: GameMode) => void;
  onDeployForce: (templateKey: string, faction: Faction, position: StrategicPosition) => void;
  onRemoveDeployedForce: (forceId: string) => void;
  onConfirmDeployment: () => void;
  isAiProcessing: boolean;
  turnTransition: { faction: Faction; turn: number } | null;

  // Battle choice dialog actions
  onShowBattleChoice: (attackerForce: StrategicForce, defenderForce: StrategicForce, sector: StrategicSector) => void;
  onDismissBattleChoice: () => void;
  onAutoResolve: () => void;
  onEnterTacticalBattle: () => void;
  onReturnToStrategic: (tacticalResult: TacticalBattleResult) => void;

  // Save/Load
  saveGame: (slot: number) => void;
  loadGame: (slot: number) => void;
  deleteSave: (slot: number) => void;
  getSaveSlots: () => StrategicSaveSlotInfo[];
  onAutoSave: () => void;

  // Game speed
  gameSpeed: number;
  setGameSpeed: (speed: number) => void;

  // Save panel UI
  showSavePanel: boolean;
  toggleSavePanel: () => void;

  // WorldAtlas system
  currentAtlas?: WorldAtlas;
  currentRegionTile?: RegionTile;
  selectedOperationView?: OperationView;
  selectedCombatViewport?: CombatViewport;
  aiReports: AIReport[];
  battleLogEvents: BattleLogEvent[];
  activeOrders: HQOrder[];
  worldAtlasMode: boolean;
  tacticalMapFromWorld?: GameMap;

  // WorldAtlas actions
  generateWorldAtlasAndRegion: () => void;
  openOperationViewForSector: (pos: { x: number; y: number }, hasCity?: boolean) => void;
  openCombatViewportFromOperationCell: (pos: { globalX: number; globalY: number }) => void;
  closeOperationView: () => void;
  closeCombatViewport: () => void;
  submitHQCommand: (text: string, assignedForceIds: string[]) => void;
  delegateForceToAICommand: (forceId: string, autonomy: ForceCommandState['autonomy'], riskTolerance: ForceCommandState['riskTolerance'], reportLevel: ForceCommandState['reportLevel']) => void;
  recallForceFromAICommand: (forceId: string) => void;
  appendBattleLogEvents: (events: BattleLogEvent[]) => void;
  clearReports: () => void;
  toggleWorldAtlasMode: () => void;
}

/** Serialize the strategic game state for save */
function serializeStrategicState(state: StrategicGameState) {
  return {
    map: state.map,
    forces: state.forces,
    currentFaction: state.currentFaction,
    turn: state.turn,
    phase: state.phase,
    selectedForce: null,
    movableSectors: [],
    attackableSectors: [],
    winner: state.winner,
    combatLog: state.combatLog,
    aiDifficulty: state.aiDifficulty,
    visibleSectors: Array.from(state.visibleSectors),
    deployment: state.deployment,
    reinforcements: state.reinforcements,
  };
}

/** Deserialize and restore the strategic game state */
function deserializeStrategicState(data: ReturnType<typeof serializeStrategicState>): StrategicGameState {
  return {
    ...data,
    visibleSectors: new Set(data.visibleSectors),
  };
}

export const useStrategicStore = create<StrategicStore>((set, get) => ({
  // Default state (will be overwritten by initStrategic)
  map: { width: 10, height: 8, sectors: [] },
  forces: [],
  currentFaction: 'red',
  turn: 1,
  phase: 'selectForce',
  selectedForce: null,
  movableSectors: [],
  attackableSectors: [],
  winner: null,
  combatLog: [],
  aiDifficulty: 'normal',
  visibleSectors: new Set<string>(),
  reinforcements: {
    nextReinforcementTurn: 8,
    redReinforcementsRemaining: 3,
    blueReinforcementsRemaining: 3,
    maxReinforcements: 3,
    reinforcementForceTemplate: 'mech_inf',
    lastSpawnPositions: { red: null, blue: null },
  },

  // Mode
  gameMode: 'tactical' as GameMode,

  // Strategic-Tactical integration state
  tacticalBattleConfig: null as TacticalBattleConfig | null,
  showBattleChoiceDialog: false,

  // UI state
  isAiProcessing: false,
  turnTransition: null,

  // Game speed
  gameSpeed: 1,

  // Save panel
  showSavePanel: false,

  // WorldAtlas state defaults
  currentAtlas: undefined,
  currentRegionTile: undefined,
  selectedOperationView: undefined,
  selectedCombatViewport: undefined,
  aiReports: [],
  battleLogEvents: [],
  activeOrders: [],
  worldAtlasMode: false,
  tacticalMapFromWorld: undefined,

  initStrategic: (difficulty: AIDifficulty = 'normal') => {
    const state = initStrategicGame(difficulty);
    set({
      ...state,
      isAiProcessing: false,
      turnTransition: null,
      gameMode: 'strategic',
    });
  },

  initStrategicDeployment: (difficulty: AIDifficulty = 'normal') => {
    const state = initStrategicDeployment(difficulty);
    set({
      ...state,
      isAiProcessing: false,
      turnTransition: null,
      gameMode: 'strategic',
    });
  },

  onSectorClick: (pos: StrategicPosition) => {
    const state = get();
    if (state.phase === 'aiTurn' || state.phase === 'gameOver' || state.isAiProcessing) return;

    const sector = getSector(state.map, pos);
    if (!sector) return;

    if (state.phase === 'selectForce') {
      // Click on a sector with a friendly force to select it
      if (sector.force && sector.force.faction === state.currentFaction && sector.force.isAlive) {
        playSelectSound();
        const newState = selectStrategicForce(state, sector.force);
        set({ ...newState });
      }
    } else if (state.phase === 'moveForce') {
      const selectedForce = state.selectedForce;
      if (!selectedForce) return;

      // Click on same force → deselect
      if (sector.force && sector.force.id === selectedForce.id) {
        playCancelSound();
        const newState = deselectStrategicForce(state);
        set({ ...newState });
        return;
      }

      // Click on another friendly force → switch selection
      if (sector.force && sector.force.faction === state.currentFaction && sector.force.isAlive) {
        playSelectSound();
        const newState = selectStrategicForce(state, sector.force);
        set({ ...newState });
        return;
      }

      // Check if the sector is a movable position
      const isMovable = state.movableSectors.some(p => p.x === pos.x && p.y === pos.y);

      // Check if the sector is an attackable position
      const isAttackable = state.attackableSectors.some(p => p.x === pos.x && p.y === pos.y);

      if (isAttackable && sector.force && sector.force.faction !== state.currentFaction) {
        // Instead of immediately attacking, show battle choice dialog
        playAttackSound();
        get().onShowBattleChoice(selectedForce, sector.force, sector);
      } else if (isMovable) {
        // Check if there's an enemy at the movable position (move into attack)
        if (sector.force && sector.force.faction !== state.currentFaction && sector.force.isAlive) {
          // Attack through movement
          playAttackSound();
          const newState = executeStrategicAttack(state, selectedForce, pos);
          set({ ...newState });
        } else {
          // Just move
          playMoveSound();
          const newState = moveForce(state, selectedForce, pos);
          set({ ...newState });
        }
      } else {
        // Click on empty/invalid sector → deselect
        playCancelSound();
        const newState = deselectStrategicForce(state);
        set({ ...newState });
      }
    }
  },

  onEndTurn: () => {
    const state = get();
    if (state.phase === 'aiTurn' || state.phase === 'gameOver' || state.isAiProcessing || state.phase === 'deployment') return;

    // Auto-save at start of each turn
    get().onAutoSave();
    playTurnEndSound();

    let newState = endStrategicTurn(state);
    set({ ...newState });

    // Show turn transition
    set({ turnTransition: { faction: newState.currentFaction, turn: newState.turn } });
    setTimeout(() => set({ turnTransition: null }), 1500);

    // If AI turn
    if (newState.currentFaction === 'blue') {
      set({ isAiProcessing: true });

      setTimeout(() => {
        const currentState = get();
        const aiState = aiExecuteStrategicTurn(currentState);
        set({ ...aiState, isAiProcessing: false });

        if (aiState.phase !== 'gameOver') {
          // Show transition back to red
          playTurnStartSound();
          set({ turnTransition: { faction: 'red', turn: aiState.turn } });
          setTimeout(() => set({ turnTransition: null }), 1500);
        } else {
          // Game over after AI turn
          if (aiState.winner === 'red') {
            playVictorySound();
          } else if (aiState.winner === 'blue') {
            playGameOverSound(false);
          }
        }
      }, BASE_AI_STRATEGIC_DELAY / (get().gameSpeed || 1));
    }
  },

  onAutoPlayTurn: () => {
    const state = get();
    if (state.phase === 'aiTurn' || state.phase === 'gameOver' || state.isAiProcessing || state.phase === 'deployment') return;
    if (state.currentFaction !== 'red') return;

    // Auto-play red's turn
    const autoState = autoPlayStrategicTurn(state, 'red');
    set({ ...autoState });

    // Then AI plays blue's turn
    if (autoState.currentFaction === 'blue' && autoState.phase !== 'gameOver') {
      set({ isAiProcessing: true });

      setTimeout(() => {
        const currentState = get();
        const aiState = aiExecuteStrategicTurn(currentState);
        set({ ...aiState, isAiProcessing: false });

        if (aiState.phase !== 'gameOver') {
          set({ turnTransition: { faction: 'red', turn: aiState.turn } });
          setTimeout(() => set({ turnTransition: null }), 1500);
        }
      }, BASE_AI_STRATEGIC_DELAY / (get().gameSpeed || 1));
    }
  },

  onQuickResolve: () => {
    const state = get();
    if (state.phase === 'aiTurn' || state.phase === 'gameOver' || state.isAiProcessing || state.phase === 'deployment') return;
    if (state.currentFaction !== 'red') return;

    // Quick resolve red's turn, then AI plays blue
    const resolvedState = quickResolveAll(state);
    set({ ...resolvedState });

    // Then AI plays blue's turn
    if (resolvedState.currentFaction === 'blue' && resolvedState.phase !== 'gameOver') {
      set({ isAiProcessing: true });

      setTimeout(() => {
        const currentState = get();
        const aiState = aiExecuteStrategicTurn(currentState);
        set({ ...aiState, isAiProcessing: false });

        if (aiState.phase !== 'gameOver') {
          set({ turnTransition: { faction: 'red', turn: aiState.turn } });
          setTimeout(() => set({ turnTransition: null }), 1500);
        }
      }, BASE_AI_STRATEGIC_DELAY / (get().gameSpeed || 1));
    }
  },

  onDeployForce: (templateKey: string, faction: Faction, position: StrategicPosition) => {
    const state = get();
    if (state.phase !== 'deployment') return;
    playDeploySound();
    const newState = deployForce(state, templateKey, faction, position);
    set({ ...newState });
  },

  onRemoveDeployedForce: (forceId: string) => {
    const state = get();
    if (state.phase !== 'deployment') return;
    playCancelSound();
    const newState = removeDeployedForce(state, forceId);
    set({ ...newState });
  },

  onConfirmDeployment: () => {
    const state = get();
    if (state.phase !== 'deployment') return;
    const newState = confirmDeployment(state);
    set({ ...newState });

    // After confirming, start the game (it's red's turn)
  },

  selectForce: (force: StrategicForce) => {
    const state = get();
    if (state.phase === 'aiTurn' || state.phase === 'gameOver' || state.isAiProcessing) return;
    if (force.faction !== state.currentFaction) return;

    const newState = selectStrategicForce(state, force);
    set({ ...newState });
  },

  deselectForce: () => {
    const state = get();
    const newState = deselectStrategicForce(state);
    set({ ...newState });
  },

  setGameMode: (mode: GameMode) => {
    set({ gameMode: mode });
  },

  // ===== Save/Load =====

  saveGame: (slot: number) => {
    const state = get();
    if (state.phase === 'gameOver' || state.phase === 'deployment') return;
    if (slot < 1 || slot > 3) return;
    try {
      const saveData = serializeStrategicState(state);
      const key = `iron-chess-strategic-save-${slot}`;
      localStorage.setItem(key, JSON.stringify(saveData));
      localStorage.setItem(`${key}-info`, JSON.stringify({
        slot,
        turn: state.turn,
        redForces: state.forces.filter(f => f.faction === 'red' && f.isAlive).length,
        blueForces: state.forces.filter(f => f.faction === 'blue' && f.isAlive).length,
        savedAt: new Date().toISOString(),
      }));
      playSaveSound();
    } catch (e) {
      console.error('Strategic save failed:', e);
      playErrorSound();
    }
  },

  loadGame: (slot: number) => {
    if (slot < 1 || slot > 3) return;
    try {
      const key = `iron-chess-strategic-save-${slot}`;
      const saved = localStorage.getItem(key);
      if (!saved) return;
      const saveData = JSON.parse(saved);
      const restoredState = deserializeStrategicState(saveData);
      const visibility = calculateStrategicVisibility(restoredState, restoredState.currentFaction);
      set({
        ...restoredState,
        visibleSectors: visibility,
        isAiProcessing: false,
        turnTransition: null,
        gameMode: 'strategic',
      });
    } catch (e) {
      console.error('Strategic load failed:', e);
    }
  },

  deleteSave: (slot: number) => {
    if (slot < 1 || slot > 3) return;
    try {
      const key = `iron-chess-strategic-save-${slot}`;
      localStorage.removeItem(key);
      localStorage.removeItem(`${key}-info`);
    } catch (e) {
      console.error('Strategic delete save failed:', e);
    }
  },

  getSaveSlots: (): StrategicSaveSlotInfo[] => {
    const slots: StrategicSaveSlotInfo[] = [];
    for (let i = 1; i <= 3; i++) {
      const key = `iron-chess-strategic-save-${i}`;
      const infoStr = localStorage.getItem(`${key}-info`);
      if (infoStr) {
        try {
          const info = JSON.parse(infoStr);
          slots.push({
            slot: i,
            timestamp: info.savedAt,
            turn: info.turn,
            redForces: info.redForces,
            blueForces: info.blueForces,
          });
        } catch {
          slots.push({ slot: i, timestamp: '', turn: 0, redForces: 0, blueForces: 0 });
        }
      } else {
        slots.push(null as unknown as StrategicSaveSlotInfo);
      }
    }
    return slots;
  },

  onAutoSave: () => {
    const state = get();
    if (state.phase === 'gameOver' || state.phase === 'deployment') return;
    try {
      const saveData = serializeStrategicState(state);
      localStorage.setItem('iron-chess-strategic-autosave', JSON.stringify(saveData));
    } catch {
      // silent fail for autosave
    }
  },

  // ===== Game Speed =====

  setGameSpeed: (speed: number) => {
    set({ gameSpeed: speed });
  },

  toggleSavePanel: () => {
    set({ showSavePanel: !get().showSavePanel });
  },

  // ===== WorldAtlas Actions =====

  generateWorldAtlasAndRegion: () => {
    try {
      const config = { ...DEFAULT_WORLD_ATLAS_CONFIG, seed: Date.now() };
      const atlas = generateWorldAtlas(config);
      console.log('[WorldAtlas] Generated atlas:', atlas.id);
      
      // Generate first region (0,0)
      const regionTile = generateRegionTile(atlas, 0, 0);
      console.log('[WorldAtlas] Generated region tile:', regionTile.id);
      
      // Convert to StrategicMap
      const strategicMap = buildStrategicMapFromRegionTile(regionTile);
      console.log('[WorldAtlas] Built strategic map:', strategicMap.width, 'x', strategicMap.height);
      
      set({
        currentAtlas: atlas,
        currentRegionTile: regionTile,
        map: strategicMap,
        worldAtlasMode: true,
        phase: 'selectForce',
        selectedForce: undefined,
        movableSectors: [],
        attackableSectors: [],
      });
      console.log('[WorldAtlas] Strategic map ready. Tiles:', strategicMap.width * strategicMap.height);
    } catch (e) {
      console.error('[WorldAtlas] Generation failed:', e);
    }
  },

  openOperationViewForSector: (pos, hasCity = false) => {
    const { currentRegionTile } = get();
    if (!currentRegionTile) return;
    
    const chunks = currentRegionTile.strategicChunks;
    if (!chunks[pos.y]?.[pos.x]) return;
    
    const chunk = chunks[pos.y][pos.x];
    const operationView = getOperationViewForChunk(currentRegionTile, chunk, hasCity ? 256 : 128);
    set({ selectedOperationView: operationView });
  },

  openCombatViewportFromOperationCell: (pos) => {
    const { currentRegionTile } = get();
    if (!currentRegionTile) return;
    
    const viewport = getCombatViewportFromOperationCell({
      regionTile: currentRegionTile,
      cellPosition: pos,
      width: 64,
      height: 48,
    });
    const gameMap = convertCombatViewportToGameMap(viewport);
    set({ selectedCombatViewport: viewport, tacticalMapFromWorld: gameMap });
  },

  closeOperationView: () => set({ selectedOperationView: undefined }),
  closeCombatViewport: () => set({ selectedCombatViewport: undefined }),

  submitHQCommand: (text, assignedForceIds) => {
    const { turn, forces } = get();
    try {
      const parsed = parseCommandText(text);
      const order = createHQOrderFromParsed(parsed, assignedForceIds, turn, text);
      const reports: AIReport[] = [{
        id: `order_${Date.now()}`,
        turn,
        timestamp: Date.now(),
        type: 'ORDER_CONFIRMATION',
        fromCommanderId: 'player',
        relatedOrderIds: [order.id],
        relatedForceIds: assignedForceIds,
        title: 'Command Received',
        summary: `HQ Order #${order.id}: ${order.intent}`,
        facts: [`Command: ${text}`, `Forces: ${assignedForceIds.join(', ') || 'none'}`],
        estimates: [],
        losses: { friendlyConfirmed: { tanksDestroyed: 0, ifvsDestroyed: 0, infantryKilled: 0, artilleryDestroyed: 0, otherDestroyed: 0, total: 0 }, enemyConfirmed: { tanksDestroyed: 0, ifvsDestroyed: 0, infantryKilled: 0, artilleryDestroyed: 0, otherDestroyed: 0, total: 0 }, enemyEstimated: { tanksDestroyed: 0, ifvsDestroyed: 0, infantryKilled: 0, artilleryDestroyed: 0, otherDestroyed: 0, total: 0 } },
        supply: { ammoState: 'good', fuelState: 'good', repairState: 'good' },
        recommendations: [],
        confidence: 'high',
        rawLogIds: [],
      }];
      set(s => ({
        activeOrders: [...s.activeOrders, order],
        aiReports: [...s.aiReports, ...reports],
      }));
    } catch (e) {
      console.error('[Command] Parse failed:', e);
    }
  },

  delegateForceToAICommand: (forceId, autonomy, riskTolerance, reportLevel) => {
    const { forces } = get();
    const force = forces.find(f => f.id === forceId);
    if (!force) return;
    const delegated = delegateForceToAI({ force, commanderId: 'ai_hq', autonomy, riskTolerance, reportLevel });
    set(s => ({
      forces: s.forces.map(f => f.id === forceId ? delegated : f),
    }));
  },

  recallForceFromAICommand: (forceId) => {
    const { forces } = get();
    const force = forces.find(f => f.id === forceId);
    if (!force) return;
    const recalled = recallForceFromAI(force);
    set(s => ({
      forces: s.forces.map(f => f.id === forceId ? recalled : f),
    }));
  },

  appendBattleLogEvents: (events) => {
    const { turn, forces } = get();
    const reports = generateReportsFromBattleLog({ events, turn, commanderId: 'system', relatedForceIds: forces.map(f => f.id) });
    set(s => ({
      battleLogEvents: [...s.battleLogEvents, ...events],
      aiReports: [...s.aiReports, ...reports],
    }));
  },

  clearReports: () => set({ aiReports: [] }),

  toggleWorldAtlasMode: () => set(s => ({ worldAtlasMode: !s.worldAtlasMode })),

  // ===== Strategic-Tactical Integration Actions =====

  onShowBattleChoice: (attackerForce: StrategicForce, defenderForce: StrategicForce, sector: StrategicSector) => {
    const state = get();
    const config = generateTacticalBattleConfig(
      attackerForce,
      defenderForce,
      sector,
      state.aiDifficulty,
    );
    set({
      tacticalBattleConfig: config,
      showBattleChoiceDialog: true,
    });
  },

  onDismissBattleChoice: () => {
    set({
      tacticalBattleConfig: null,
      showBattleChoiceDialog: false,
    });
  },

  onAutoResolve: () => {
    const state = get();
    const config = state.tacticalBattleConfig;
    if (!config) return;

    // Execute the strategic attack as before
    const newState = executeStrategicAttack(state, config.attackerForce, config.sector.position);
    set({
      ...newState,
      tacticalBattleConfig: null,
      showBattleChoiceDialog: false,
    });

    // Check game over
    if (newState.phase === 'gameOver') return;
  },

  onEnterTacticalBattle: () => {
    const state = get();
    const config = state.tacticalBattleConfig;
    if (!config) return;

    // Initialize tactical game state from the battle config
    const tacticalState = initTacticalFromStrategic(config);

    // Switch to tactical mode with the new game state
    set({
      gameMode: 'tactical' as GameMode,
      showBattleChoiceDialog: false,
      // Keep the battle config for later reference when returning
    });

    // Import useGameStore dynamically to avoid circular dependencies
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { useGameStore } = require('@/store/game-store');
    useGameStore.getState().initStrategicTacticalBattle(tacticalState);
  },

  onReturnToStrategic: (tacticalResult: TacticalBattleResult) => {
    const state = get();
    const config = state.tacticalBattleConfig;
    if (!config) {
      // No battle config, just switch back to strategic mode
      set({ gameMode: 'strategic' as GameMode });
      return;
    }

    // Apply the tactical battle results to strategic forces
    const newMap = {
      ...state.map,
      sectors: state.map.sectors.map(row =>
        row.map(sector => ({
          ...sector,
          force: sector.force
            ? {
                ...sector.force,
                units: sector.force.units.map(u => ({ ...u })),
              }
            : null,
        }))
      ),
    };
    const newForces = state.forces.map(f => ({
      ...f,
      units: f.units.map(u => ({ ...u })),
    }));

    // Update attacker force
    const attackerForce = newForces.find(f => f.id === config.attackerForce.id);
    if (attackerForce) {
      attackerForce.units = tacticalResult.attackerSurvivingUnits;
      // Recalculate combat and defense power
      let combatPower = 0;
      let defensePower = 0;
      for (const su of attackerForce.units) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { UNIT_CONFIGS } = require('@/game/config');
        const unitConfig = UNIT_CONFIGS[su.type];
        if (unitConfig) {
          combatPower += (unitConfig.stats.attack + unitConfig.stats.armorPenetration * 0.3) * su.count;
          defensePower += (unitConfig.stats.defense + unitConfig.stats.armor * 0.4) * su.count;
        }
      }
      attackerForce.combatPower = combatPower;
      attackerForce.defensePower = defensePower;
      attackerForce.canMove = false;
      attackerForce.hasAttacked = true;

      const attackerTotalUnits = attackerForce.units.reduce((sum, u) => sum + u.count, 0);
      if (attackerTotalUnits === 0) {
        attackerForce.isAlive = false;
      }
    }

    // Update defender force
    const defenderForce = newForces.find(f => f.id === config.defenderForce.id);
    if (defenderForce) {
      defenderForce.units = tacticalResult.defenderSurvivingUnits;
      let combatPower = 0;
      let defensePower = 0;
      for (const su of defenderForce.units) {
        // eslint-disable-next-line @typescript-eslint/no-require-imports
        const { UNIT_CONFIGS } = require('@/game/config');
        const unitConfig = UNIT_CONFIGS[su.type];
        if (unitConfig) {
          combatPower += (unitConfig.stats.attack + unitConfig.stats.armorPenetration * 0.3) * su.count;
          defensePower += (unitConfig.stats.defense + unitConfig.stats.armor * 0.4) * su.count;
        }
      }
      defenderForce.combatPower = combatPower;
      defenderForce.defensePower = defensePower;

      const defenderTotalUnits = defenderForce.units.reduce((sum, u) => sum + u.count, 0);
      if (defenderTotalUnits === 0) {
        defenderForce.isAlive = false;
      }
    }

    // Handle movement based on result
    if (attackerForce && defenderForce) {
      const defenderSector = getSector(newMap, config.sector.position);

      if (tacticalResult.winner === 'attacker' && !defenderForce.isAlive) {
        // Attacker wins, defender destroyed — attacker occupies the sector
        const oldSector = getSector(newMap, config.attackerForce.position);
        if (oldSector) oldSector.force = null;
        attackerForce.position = config.sector.position;
        if (defenderSector) defenderSector.force = attackerForce;
      } else if (tacticalResult.winner === 'defender') {
        // Defender wins — attacker stays at original position
        // Already in original position, nothing to do
      } else {
        // Draw — attacker stays at original position
        // Already in original position, nothing to do
      }
    }

    // Update map force references
    const updatedMap = {
      ...newMap,
      sectors: newMap.sectors.map(row =>
        row.map(sector => ({
          ...sector,
          force: newForces.find(f => f.id === sector.force?.id) || null,
        }))
      ),
    };

    // Combat log entry
    const combatLogEntry = {
      turn: state.turn,
      attacker: config.attackerForce.name,
      defender: config.defenderForce.name,
      attackerFaction: config.attackerForce.faction,
      result: tacticalResult.winner === 'attacker' ? 'attacker_wins' as const
        : tacticalResult.winner === 'defender' ? 'defender_wins' as const
        : 'draw' as const,
      attackerLosses: config.attackerForce.units.reduce(
        (sum, u) => sum + u.count - (tacticalResult.attackerSurvivingUnits.find(su => su.type === u.type)?.count ?? 0),
        0,
      ),
      defenderLosses: config.defenderForce.units.reduce(
        (sum, u) => sum + u.count - (tacticalResult.defenderSurvivingUnits.find(su => su.type === u.type)?.count ?? 0),
        0,
      ),
    };

    // Check for victory
    const redAlive = newForces.filter(f => f.faction === 'red' && f.isAlive).length;
    const blueAlive = newForces.filter(f => f.faction === 'blue' && f.isAlive).length;

    let winner: Faction | null = state.winner;
    let phase = state.phase;
    if (redAlive === 0) { winner = 'blue'; phase = 'gameOver'; }
    else if (blueAlive === 0) { winner = 'red'; phase = 'gameOver'; }

    const visibility = calculateStrategicVisibility(
      { ...state, map: updatedMap, forces: newForces, currentFaction: state.currentFaction } as StrategicGameState,
      state.currentFaction,
    );

    set({
      ...state,
      map: updatedMap,
      forces: newForces,
      selectedForce: null,
      movableSectors: [],
      attackableSectors: [],
      combatLog: [...state.combatLog, combatLogEntry],
      winner,
      phase,
      gameMode: 'strategic' as GameMode,
      tacticalBattleConfig: null,
      visibleSectors: visibility,
    });
  },
}));
