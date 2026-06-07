/**
 * 报告系统类型定义
 */

import type { WorldPosition } from '../world-atlas/atlas-types';
import type { HQOrder } from '../command/command-types';

export type ReportType =
  | 'SITREP'
  | 'INTREP'
  | 'BDA'
  | 'LOGREP'
  | 'REQUEST'
  | 'WARNING'
  | 'ORDER_CONFIRMATION'
  | 'AFTER_ACTION';

export interface UnitLossSummary {
  tanksDestroyed: number;
  ifvsDestroyed: number;
  infantryKilled: number;
  artilleryDestroyed: number;
  otherDestroyed: number;
  total: number;
}

export interface AIReport {
  id: string;
  turn: number;
  timestamp: number;

  type: ReportType;

  fromCommanderId: string;

  relatedOrderIds: string[];
  relatedForceIds: string[];

  relatedWorldArea?: {
    center: WorldPosition;
    radius: number;
  };

  title: string;
  summary: string;

  facts: string[];
  estimates: string[];

  losses: {
    friendlyConfirmed: UnitLossSummary;
    enemyConfirmed: UnitLossSummary;
    enemyEstimated: UnitLossSummary;
  };

  supply: {
    ammoState: 'good' | 'limited' | 'critical';
    fuelState: 'good' | 'limited' | 'critical';
    repairState: 'good' | 'limited' | 'critical';
  };

  recommendations: Array<{
    text: string;
    suggestedOrder?: Partial<HQOrder>;
    urgency: 'low' | 'medium' | 'high' | 'critical';
  }>;

  confidence: 'low' | 'medium' | 'high';

  rawLogIds: string[];
}

export interface BattleLogEvent {
  id: string;
  turn: number;
  time: number;

  type:
    | 'unit_spotted'
    | 'unit_lost'
    | 'unit_damaged'
    | 'shot_fired'
    | 'artillery_strike'
    | 'airstrike'
    | 'suppression_applied'
    | 'morale_changed'
    | 'objective_captured'
    | 'supply_used'
    | 'resupply_completed'
    | 'order_received'
    | 'order_completed'
    | 'order_failed'
    | 'request_authorization';

  actorUnitId?: string;
  targetUnitId?: string;
  position?: WorldPosition;

  confirmedByPlayer: boolean;
  visibilityConfidence: 'confirmed' | 'estimated' | 'unknown';

  message: string;
}
