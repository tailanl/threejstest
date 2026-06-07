/**
 * 命令系统类型定义
 */

import type { WorldPosition } from '../world-atlas/atlas-types';
import type { UnitType } from '../types';

export interface HQOrder {
  id: string;
  issuedTurn: number;
  issuer: 'player';

  assignedForceIds: string[];

  intent:
    | 'attack'
    | 'defend'
    | 'recon'
    | 'screen'
    | 'delay'
    | 'withdraw'
    | 'support'
    | 'hold'
    | 'capture'
    | 'interdict';

  target: {
    type: 'chunk' | 'city' | 'bridge' | 'road' | 'area' | 'enemy_force';
    id?: string;
    worldPosition?: WorldPosition;
    radius?: number;
  };

  constraints: {
    maxLossRatio?: number;
    maxFuelUseRatio?: number;
    avoidUrbanCombat?: boolean;
    avoidCivilianArea?: boolean;
    mustHoldSupplyLine?: boolean;
    timeLimitTurns?: number;
    preserveUnitCategories?: UnitType[];
  };

  rulesOfEngagement:
    | 'hold_fire'
    | 'avoid_contact'
    | 'engage_if_advantage'
    | 'engage_freely'
    | 'breakthrough';

  riskTolerance: 'low' | 'medium' | 'high';

  autonomy: 'strict' | 'normal' | 'high';

  text: string;
}

export interface ForceCommandState {
  forceId: string;

  controller:
    | 'player_direct'
    | 'ai_delegated'
    | 'enemy_ai';

  commanderId?: string;

  currentOrderIds: string[];

  autonomy: 'strict' | 'normal' | 'high';

  reportLevel: 'summary' | 'normal' | 'detailed';

  riskTolerance: 'low' | 'medium' | 'high';
}
