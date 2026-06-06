// ===== 战役/任务系统类型定义 =====

import type { UnitType } from './types';

/** 任务目标类型 */
export type ObjectiveType =
  | 'destroy_all'
  | 'reach_position'
  | 'defend_position'
  | 'destroy_target'
  | 'survive_turns';

/** 任务目标 */
export interface MissionObjective {
  id: string;
  description: string;
  type: ObjectiveType;
  targetCount?: number;
  targetTypes?: UnitType[];
  positions?: { x: number; z: number }[];
  turns?: number;
}

/** 任务奖励 */
export interface MissionReward {
  description: string;
}

/** 任务定义 */
export interface MissionDefinition {
  id: string;
  name: string;
  description: string;
  difficulty: 'easy' | 'normal' | 'hard';
  mapType: string;
  redDeploymentOverride: { type: UnitType; x: number; z: number }[];
  blueDeploymentOverride: { type: UnitType; x: number; z: number }[];
  objectives: MissionObjective[];
  turnLimit?: number;
  reward: MissionReward;
  briefing: string;
  /** Icon name for display */
  icon: string;
}

/** 任务结果 */
export type MissionResult = 'victory' | 'defeat' | 'turn_limit' | null;

/** 单个目标的进度 */
export interface ObjectiveProgress {
  current: number;
  target: number;
  completed: boolean;
}

/** 任务状态 */
export interface MissionState {
  missionId: string | null;
  objectivesProgress: Record<string, ObjectiveProgress>;
  result: MissionResult;
  turnsElapsed: number;
}
