/**
 * AI 指挥官类型定义
 */

import type { WorldPosition } from '../world-atlas/atlas-types';
import type { HQOrder } from '../command/command-types';

export interface CommanderState {
  id: string;
  level: 'hq' | 'theater' | 'operation' | 'tactical';
  name: string;
  faction: 'red' | 'blue';

  currentOrders: string[];

  subordinateCommanderIds: string[];

  controlledForceIds: string[];

  position?: WorldPosition;

  lastReportTurn: number;
}

export interface AIPlan {
  id: string;
  commanderId: string;
  turn: number;

  objective: string;
  phases: AIPlanPhase[];

  status: 'planning' | 'approved' | 'executing' | 'completed' | 'failed';
}

export interface AIPlanPhase {
  name: string;
  description: string;
  forceAssignments: Array<{
    forceId: string;
    task: string;
    targetPosition?: WorldPosition;
  }>;
  estimatedTurns: number;
  status: 'pending' | 'in_progress' | 'completed' | 'failed';
}

export interface AIDecision {
  action: 'move' | 'attack' | 'defend' | 'recon' | 'support' | 'withdraw' | 'hold' | 'resupply';
  forceId: string;
  targetPosition?: WorldPosition;
  priority: number;
  reasoning: string;
  requiresAuthorization: boolean;
}
