// ===== 战役任务定义与胜利判定引擎 =====

import type { GameState } from './types';
import type {
  MissionDefinition,
  MissionObjective,
  ObjectiveProgress,
  MissionState,
  MissionResult,
} from './mission-types';

// =====================================================
// 任务定义
// =====================================================

export const MISSIONS: MissionDefinition[] = [
  // ----- 任务1: 初战告捷 -----
  {
    id: 'mission-1',
    name: '初战告捷',
    description: '消灭所有敌方单位，取得首场胜利。',
    difficulty: 'easy',
    mapType: 'random',
    icon: '⚔️',
    redDeploymentOverride: [
      { type: 'tank', x: 1, z: 2 },
      { type: 'tank', x: 1, z: 9 },
      { type: 'ifv', x: 2, z: 1 },
      { type: 'ifv', x: 2, z: 5 },
      { type: 'ifv', x: 2, z: 10 },
      { type: 'artillery', x: 0, z: 4 },
      { type: 'artillery', x: 0, z: 7 },
      { type: 'scout', x: 3, z: 3 },
      { type: 'scout', x: 3, z: 8 },
      { type: 'infantry', x: 2, z: 3 },
      { type: 'infantry', x: 2, z: 6 },
      { type: 'infantry', x: 2, z: 8 },
      { type: 'sam', x: 0, z: 0 },
      { type: 'supply', x: 1, z: 5 },
      { type: 'helicopter', x: 3, z: 0 },
    ],
    blueDeploymentOverride: [
      { type: 'tank', x: 14, z: 2 },
      { type: 'tank', x: 14, z: 9 },
      { type: 'ifv', x: 13, z: 1 },
      { type: 'ifv', x: 13, z: 5 },
      { type: 'ifv', x: 13, z: 10 },
      { type: 'artillery', x: 15, z: 4 },
      { type: 'artillery', x: 15, z: 7 },
      { type: 'scout', x: 12, z: 3 },
      { type: 'scout', x: 12, z: 8 },
      { type: 'infantry', x: 13, z: 3 },
      { type: 'infantry', x: 13, z: 6 },
      { type: 'infantry', x: 13, z: 8 },
      { type: 'mlrs', x: 15, z: 11 },
      { type: 'engineer', x: 14, z: 6 },
      { type: 'helicopter', x: 12, z: 11 },
    ],
    objectives: [
      {
        id: 'obj-destroy-all',
        description: '消灭所有敌方单位',
        type: 'destroy_all',
      },
    ],
    turnLimit: undefined,
    reward: { description: '解锁下一关' },
    briefing:
      '指挥官，敌军已在我方阵地前方集结。消灭所有敌方单位即可取得胜利。这是我们首次作战，务必小心谨慎，熟悉各种单位的特性与配合。',
  },

  // ----- 任务2: 突破防线 -----
  {
    id: 'mission-2',
    name: '突破防线',
    description: '突破山地隘口防线，至少3个单位抵达敌方阵地后方，同时消灭5个以上敌军。',
    difficulty: 'normal',
    mapType: 'mountain-pass',
    icon: '🏔️',
    redDeploymentOverride: [
      { type: 'tank', x: 1, z: 2 },
      { type: 'tank', x: 1, z: 5 },
      { type: 'tank', x: 1, z: 9 },
      { type: 'ifv', x: 2, z: 0 },
      { type: 'ifv', x: 2, z: 4 },
      { type: 'ifv', x: 2, z: 7 },
      { type: 'ifv', x: 2, z: 10 },
      { type: 'artillery', x: 0, z: 3 },
      { type: 'artillery', x: 0, z: 8 },
      { type: 'scout', x: 3, z: 1 },
      { type: 'scout', x: 3, z: 6 },
      { type: 'infantry', x: 2, z: 2 },
      { type: 'infantry', x: 2, z: 5 },
      { type: 'supply', x: 1, z: 11 },
      { type: 'helicopter', x: 3, z: 10 },
    ],
    blueDeploymentOverride: [
      { type: 'tank', x: 14, z: 1 },
      { type: 'tank', x: 14, z: 5 },
      { type: 'tank', x: 14, z: 10 },
      { type: 'ifv', x: 13, z: 0 },
      { type: 'ifv', x: 13, z: 3 },
      { type: 'ifv', x: 13, z: 6 },
      { type: 'ifv', x: 13, z: 9 },
      { type: 'artillery', x: 15, z: 2 },
      { type: 'artillery', x: 15, z: 8 },
      { type: 'scout', x: 12, z: 2 },
      { type: 'infantry', x: 13, z: 1 },
      { type: 'infantry', x: 13, z: 4 },
      { type: 'infantry', x: 13, z: 7 },
      { type: 'infantry', x: 13, z: 11 },
      { type: 'engineer', x: 14, z: 5 },
      { type: 'sam', x: 15, z: 5 },
      { type: 'helicopter', x: 12, z: 10 },
    ],
    objectives: [
      {
        id: 'obj-reach',
        description: '至少3个单位到达敌方阵地后方 (x ≥ 13)',
        type: 'reach_position',
        targetCount: 3,
        positions: [
          { x: 13, z: 0 }, { x: 13, z: 1 }, { x: 13, z: 2 },
          { x: 13, z: 3 }, { x: 13, z: 4 }, { x: 13, z: 5 },
          { x: 13, z: 6 }, { x: 13, z: 7 }, { x: 13, z: 8 },
          { x: 13, z: 9 }, { x: 13, z: 10 }, { x: 13, z: 11 },
          { x: 14, z: 0 }, { x: 14, z: 1 }, { x: 14, z: 2 },
          { x: 14, z: 3 }, { x: 14, z: 4 }, { x: 14, z: 5 },
          { x: 14, z: 6 }, { x: 14, z: 7 }, { x: 14, z: 8 },
          { x: 14, z: 9 }, { x: 14, z: 10 }, { x: 14, z: 11 },
          { x: 15, z: 0 }, { x: 15, z: 1 }, { x: 15, z: 2 },
          { x: 15, z: 3 }, { x: 15, z: 4 }, { x: 15, z: 5 },
          { x: 15, z: 6 }, { x: 15, z: 7 }, { x: 15, z: 8 },
          { x: 15, z: 9 }, { x: 15, z: 10 }, { x: 15, z: 11 },
        ],
      },
      {
        id: 'obj-destroy-5',
        description: '消灭至少5个敌方单位',
        type: 'destroy_target',
        targetCount: 5,
      },
    ],
    turnLimit: 20,
    reward: { description: '解锁下一关' },
    briefing:
      '敌军在山地隘口设置了坚固防线。突破防线，至少3个单位到达敌方阵地后方，同时消灭5个以上敌军。注意利用隘口的狭窄地形逐个击破敌军。限时20回合。',
  },

  // ----- 任务3: 坚守阵地 -----
  {
    id: 'mission-3',
    name: '坚守阵地',
    description: '坚守城市阵地15个回合，确保至少5个单位存活。',
    difficulty: 'hard',
    mapType: 'urban-warfare',
    icon: '🏰',
    redDeploymentOverride: [
      { type: 'tank', x: 5, z: 4 },
      { type: 'tank', x: 6, z: 7 },
      { type: 'ifv', x: 5, z: 6 },
      { type: 'ifv', x: 7, z: 5 },
      { type: 'ifv', x: 7, z: 7 },
      { type: 'artillery', x: 6, z: 3 },
      { type: 'artillery', x: 5, z: 8 },
      { type: 'scout', x: 4, z: 3 },
      { type: 'scout', x: 8, z: 8 },
      { type: 'infantry', x: 6, z: 5 },
      { type: 'infantry', x: 6, z: 6 },
      { type: 'infantry', x: 7, z: 6 },
      { type: 'sam', x: 5, z: 5 },
      { type: 'engineer', x: 8, z: 6 },
      { type: 'supply', x: 6, z: 4 },
    ],
    blueDeploymentOverride: [
      { type: 'tank', x: 0, z: 1 },
      { type: 'tank', x: 0, z: 4 },
      { type: 'tank', x: 0, z: 7 },
      { type: 'tank', x: 0, z: 10 },
      { type: 'ifv', x: 1, z: 0 },
      { type: 'ifv', x: 1, z: 3 },
      { type: 'ifv', x: 1, z: 6 },
      { type: 'ifv', x: 1, z: 9 },
      { type: 'ifv', x: 1, z: 11 },
      { type: 'artillery', x: 0, z: 5 },
      { type: 'artillery', x: 0, z: 8 },
      { type: 'scout', x: 2, z: 2 },
      { type: 'scout', x: 2, z: 9 },
      { type: 'infantry', x: 2, z: 0 },
      { type: 'infantry', x: 2, z: 4 },
      { type: 'infantry', x: 2, z: 7 },
      { type: 'infantry', x: 2, z: 11 },
      { type: 'mlrs', x: 0, z: 2 },
      { type: 'helicopter', x: 2, z: 5 },
    ],
    objectives: [
      {
        id: 'obj-defend',
        description: '坚守城市阵地15个回合',
        type: 'defend_position',
        turns: 15,
        positions: [
          { x: 5, z: 4 }, { x: 5, z: 5 }, { x: 5, z: 6 }, { x: 5, z: 7 }, { x: 5, z: 8 },
          { x: 6, z: 4 }, { x: 6, z: 5 }, { x: 6, z: 6 }, { x: 6, z: 7 }, { x: 6, z: 8 },
          { x: 7, z: 4 }, { x: 7, z: 5 }, { x: 7, z: 6 }, { x: 7, z: 7 }, { x: 7, z: 8 },
          { x: 8, z: 4 }, { x: 8, z: 5 }, { x: 8, z: 6 }, { x: 8, z: 7 }, { x: 8, z: 8 },
          { x: 9, z: 4 }, { x: 9, z: 5 }, { x: 9, z: 6 }, { x: 9, z: 7 }, { x: 9, z: 8 },
          { x: 10, z: 4 }, { x: 10, z: 5 }, { x: 10, z: 6 }, { x: 10, z: 7 }, { x: 10, z: 8 },
        ],
      },
      {
        id: 'obj-survive',
        description: '确保至少5个己方单位存活',
        type: 'survive_turns',
        targetCount: 5,
        turns: 15,
      },
    ],
    turnLimit: 15,
    reward: { description: '战役胜利' },
    briefing:
      '敌军即将发动大规模进攻。坚守城市阵地15个回合，同时确保至少5个单位存活。利用城市地形的高防御加成和工程车修建工事，合理部署防空导弹和补给车，坚持到最后一刻。注意：如果所有己方单位被消灭将直接失败。',
  },
];

// =====================================================
// 胜利判定引擎
// =====================================================

/** 计算单个目标的进度 */
function computeObjectiveProgress(
  objective: MissionObjective,
  state: GameState,
  turnsElapsed: number,
): ObjectiveProgress {
  switch (objective.type) {
    case 'destroy_all': {
      const enemyAlive = state.units.filter(u => u.faction === 'blue' && u.isAlive).length;
      const totalEnemy = state.units.filter(u => u.faction === 'blue').length;
      const destroyed = totalEnemy - enemyAlive;
      return { current: destroyed, target: totalEnemy, completed: enemyAlive === 0 };
    }

    case 'reach_position': {
      const positions = objective.positions ?? [];
      const targetCount = objective.targetCount ?? 1;
      const redUnits = state.units.filter(u => u.faction === 'red' && u.isAlive);
      const reached = redUnits.filter(u =>
        positions.some(p => p.x === u.position.x && p.z === u.position.z),
      ).length;
      return { current: reached, target: targetCount, completed: reached >= targetCount };
    }

    case 'defend_position': {
      const positions = objective.positions ?? [];
      const targetTurns = objective.turns ?? 15;
      const current = Math.min(turnsElapsed, targetTurns);
      // Check if any enemy unit is on a defend position
      const enemyOnPositions = state.units.filter(
        u => u.faction === 'blue' && u.isAlive && positions.some(p => p.x === u.position.x && p.z === u.position.z),
      ).length;
      // If enemies breached, progress resets (they failed to defend)
      const completed = enemyOnPositions === 0 && turnsElapsed >= targetTurns;
      return { current, target: targetTurns, completed };
    }

    case 'destroy_target': {
      const targetCount = objective.targetCount ?? 1;
      const targetTypes = objective.targetTypes;
      const totalEnemy = targetTypes
        ? state.units.filter(u => u.faction === 'blue' && targetTypes.includes(u.type)).length
        : state.units.filter(u => u.faction === 'blue').length;
      const aliveEnemy = targetTypes
        ? state.units.filter(u => u.faction === 'blue' && u.isAlive && targetTypes.includes(u.type)).length
        : state.units.filter(u => u.faction === 'blue' && u.isAlive).length;
      const destroyed = totalEnemy - aliveEnemy;
      return { current: destroyed, target: targetCount, completed: destroyed >= targetCount };
    }

    case 'survive_turns': {
      const targetCount = objective.targetCount ?? 1;
      const targetTurns = objective.turns ?? 15;
      const redAlive = state.units.filter(u => u.faction === 'red' && u.isAlive).length;
      const turnsSurvived = Math.min(turnsElapsed, targetTurns);
      // Survive condition: alive >= target AND turns >= targetTurns
      const completed = redAlive >= targetCount && turnsElapsed >= targetTurns;
      return { current: turnsSurvived, target: targetTurns, completed };
    }

    default:
      return { current: 0, target: 1, completed: false };
  }
}

/** 检查任务是否完成并返回结果 */
export function checkMissionVictory(
  state: GameState,
  mission: MissionDefinition,
  missionState: MissionState,
): { updatedState: MissionState; result: MissionResult } {
  const turnsElapsed = state.turn;
  const progress: Record<string, ObjectiveProgress> = {};

  // Compute progress for each objective
  for (const obj of mission.objectives) {
    progress[obj.id] = computeObjectiveProgress(obj, state, turnsElapsed);
  }

  // All objectives completed → victory
  const allCompleted = mission.objectives.every(obj => progress[obj.id]?.completed);

  // Defeat conditions
  const redAlive = state.units.filter(u => u.faction === 'red' && u.isAlive).length;
  const isDefeated = redAlive === 0;

  // Turn limit exceeded
  const turnLimitExceeded = mission.turnLimit !== undefined && turnsElapsed > mission.turnLimit;

  let result: MissionResult = null;
  if (allCompleted) {
    result = 'victory';
  } else if (isDefeated) {
    result = 'defeat';
  } else if (turnLimitExceeded) {
    result = 'turn_limit';
  }

  return {
    updatedState: {
      ...missionState,
      objectivesProgress: progress,
      turnsElapsed,
      result,
    },
    result,
  };
}

/** 创建初始任务状态 */
export function createInitialMissionState(missionId: string): MissionState {
  return {
    missionId,
    objectivesProgress: {},
    result: null,
    turnsElapsed: 0,
  };
}
