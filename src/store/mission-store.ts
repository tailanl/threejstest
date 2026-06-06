// ===== 任务状态管理 (Zustand) =====

import { create } from 'zustand';
import type { GameState } from '@/game/types';
import type {
  MissionDefinition,
  MissionState,
  MissionResult,
} from '@/game/mission-types';
import {
  checkMissionVictory,
  createInitialMissionState,
} from '@/game/mission-engine';

interface MissionStore {
  /** 当前激活的任务定义 */
  currentMission: MissionDefinition | null;
  /** 当前任务运行时状态 */
  missionState: MissionState;

  /** 开始一个任务 */
  startMission: (mission: MissionDefinition) => void;
  /** 每次行动后调用，检查并更新任务进度。返回 MissionResult 如果任务结束。 */
  checkAndUpdateMission: (gameState: GameState) => MissionResult | null;
  /** 是否已完成（胜利/失败/超时） */
  isMissionComplete: () => boolean;
  /** 重置任务状态 */
  resetMission: () => void;
}

const defaultMissionState: MissionState = {
  missionId: null,
  objectivesProgress: {},
  result: null,
  turnsElapsed: 0,
};

export const useMissionStore = create<MissionStore>((set, get) => ({
  currentMission: null,
  missionState: { ...defaultMissionState },

  startMission: (mission: MissionDefinition) => {
    set({
      currentMission: mission,
      missionState: createInitialMissionState(mission.id),
    });
  },

  checkAndUpdateMission: (gameState: GameState) => {
    const { currentMission, missionState } = get();
    if (!currentMission || missionState.result) return missionState.result;

    const { updatedState, result } = checkMissionVictory(
      gameState,
      currentMission,
      missionState,
    );

    set({ missionState: updatedState });
    return result;
  },

  isMissionComplete: () => {
    return get().missionState.result !== null;
  },

  resetMission: () => {
    set({
      currentMission: null,
      missionState: { ...defaultMissionState },
    });
  },
}));
