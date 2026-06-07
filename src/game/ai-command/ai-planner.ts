/**
 * AI 计划生成器 - 规则AI，不接 LLM
 */

import type { HQOrder } from '../command/command-types';
import type { CommanderState, AIPlan, AIPlanPhase, AIDecision } from './commander-types';
import type { WorldPosition } from '../world-atlas/atlas-types';

export function generatePlanFromOrder(
  order: HQOrder,
  commander: CommanderState,
  turn: number
): AIPlan {
  const phases = generatePhasesForIntent(order.intent, order, commander);

  return {
    id: `plan_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    commanderId: commander.id,
    turn,
    objective: `${order.intent} at target`,
    phases,
    status: 'planning',
  };
}

function generatePhasesForIntent(
  intent: HQOrder['intent'],
  order: HQOrder,
  commander: CommanderState
): AIPlanPhase[] {
  switch (intent) {
    case 'attack':
    case 'capture':
      return [
        { name: 'Recon', description: 'Scout enemy positions', forceAssignments: [{ forceId: commander.controlledForceIds[0] ?? '', task: 'recon' }], estimatedTurns: 2, status: 'pending' },
        { name: 'Approach', description: 'Move forces to attack positions', forceAssignments: commander.controlledForceIds.map(fid => ({ forceId: fid, task: 'move_to_position' })), estimatedTurns: 3, status: 'pending' },
        { name: 'Assault', description: 'Execute main attack', forceAssignments: commander.controlledForceIds.map(fid => ({ forceId: fid, task: 'attack' })), estimatedTurns: 4, status: 'pending' },
        { name: 'Consolidate', description: 'Secure captured area', forceAssignments: commander.controlledForceIds.slice(0, 2).map(fid => ({ forceId: fid, task: 'defend' })), estimatedTurns: 2, status: 'pending' },
      ];
    case 'defend':
    case 'hold':
      return [
        { name: 'Prepare', description: 'Set up defensive positions', forceAssignments: commander.controlledForceIds.map(fid => ({ forceId: fid, task: 'move_to_position' })), estimatedTurns: 2, status: 'pending' },
        { name: 'Defend', description: 'Hold positions against enemy', forceAssignments: commander.controlledForceIds.map(fid => ({ forceId: fid, task: 'defend' })), estimatedTurns: 6, status: 'pending' },
      ];
    case 'recon':
      return [
        { name: 'Scout', description: 'Reconnaissance of target area', forceAssignments: [{ forceId: commander.controlledForceIds[0] ?? '', task: 'recon' }], estimatedTurns: 3, status: 'pending' },
      ];
    case 'withdraw':
      return [
        { name: 'Disengage', description: 'Pull back forces', forceAssignments: commander.controlledForceIds.map(fid => ({ forceId: fid, task: 'withdraw' })), estimatedTurns: 2, status: 'pending' },
      ];
    case 'support':
      return [
        { name: 'Move', description: 'Move to support position', forceAssignments: commander.controlledForceIds.map(fid => ({ forceId: fid, task: 'move_to_position' })), estimatedTurns: 2, status: 'pending' },
        { name: 'Support', description: 'Provide fire support', forceAssignments: commander.controlledForceIds.map(fid => ({ forceId: fid, task: 'support' })), estimatedTurns: 4, status: 'pending' },
      ];
    default:
      return [
        { name: 'Execute', description: `Execute ${intent} order`, forceAssignments: commander.controlledForceIds.map(fid => ({ forceId: fid, task: intent })), estimatedTurns: 3, status: 'pending' },
      ];
  }
}

export function evaluateDecision(
  decision: AIDecision,
  order: HQOrder,
  riskTolerance: HQOrder['riskTolerance']
): number {
  let score = 0;

  // Objective progress
  if (decision.action === 'attack' && (order.intent === 'attack' || order.intent === 'capture')) score += 40;
  if (decision.action === 'defend' && (order.intent === 'defend' || order.intent === 'hold')) score += 40;
  if (decision.action === 'recon' && order.intent === 'recon') score += 40;

  // Survival
  score += 25; // base survival

  // Risk adjustment
  if (riskTolerance === 'low') {
    if (decision.action === 'attack') score -= 15;
    if (decision.action === 'withdraw') score += 10;
  } else if (riskTolerance === 'high') {
    if (decision.action === 'attack') score += 15;
    if (decision.action === 'withdraw') score -= 10;
  }

  // Authorization requirement penalty
  if (decision.requiresAuthorization) score -= 20;

  return score;
}
