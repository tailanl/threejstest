/**
 * AI 执行器 - 执行 AI 计划并生成 BattleLogEvent
 */

import type { CommanderState, AIPlan, AIDecision } from './commander-types';
import type { HQOrder, ForceCommandState } from '../command/command-types';
import type { BattleLogEvent } from '../reports/report-types';
import type { WorldPosition } from '../world-atlas/atlas-types';

export interface AIExecutionResult {
  decisions: AIDecision[];
  logEvents: BattleLogEvent[];
  updatedPlan: AIPlan;
  needsAuthorization: boolean;
}

export function executeAITurn(
  plan: AIPlan,
  commander: CommanderState,
  order: HQOrder | undefined,
  turn: number
): AIExecutionResult {
  const decisions: AIDecision[] = [];
  const logEvents: BattleLogEvent[] = [];

  // Find current phase
  const currentPhase = plan.phases.find(p => p.status === 'in_progress') ?? plan.phases.find(p => p.status === 'pending');

  if (!currentPhase) {
    return {
      decisions: [],
      logEvents: [{
        id: `log_${Date.now()}`,
        turn,
        time: Date.now(),
        type: 'order_completed',
        actorUnitId: commander.id,
        confirmedByPlayer: true,
        visibilityConfidence: 'confirmed',
        message: `${commander.name}: Plan completed - ${plan.objective}`,
      }],
      updatedPlan: { ...plan, status: 'completed' },
      needsAuthorization: false,
    };
  }

  // Start next pending phase
  if (currentPhase.status === 'pending') {
    currentPhase.status = 'in_progress';
  }

  // Generate decisions for current phase
  for (const assignment of currentPhase.forceAssignments) {
    const decision: AIDecision = {
      action: mapTaskToAction(assignment.task),
      forceId: assignment.forceId,
      targetPosition: assignment.targetPosition,
      priority: 50,
      reasoning: `Phase: ${currentPhase.name}, Task: ${assignment.task}`,
      requiresAuthorization: shouldRequireAuthorization(assignment.task, order),
    };
    decisions.push(decision);

    logEvents.push({
      id: `log_${Date.now()}_${assignment.forceId}`,
      turn,
      time: Date.now(),
      type: 'order_received',
      actorUnitId: assignment.forceId,
      position: assignment.targetPosition,
      confirmedByPlayer: !decision.requiresAuthorization,
      visibilityConfidence: 'confirmed',
      message: `${commander.name}: ${assignment.forceId} executing ${assignment.task}`,
    });
  }

  // Check if phase should complete
  const estimatedRemaining = currentPhase.estimatedTurns;
  if (estimatedRemaining <= 1) {
    currentPhase.status = 'completed';
  } else {
    currentPhase.estimatedTurns--;
  }

  // Check if all phases done
  const allDone = plan.phases.every(p => p.status === 'completed');
  const needsAuth = decisions.some(d => d.requiresAuthorization);

  return {
    decisions,
    logEvents,
    updatedPlan: { ...plan, status: allDone ? 'completed' : 'executing' },
    needsAuthorization: needsAuth,
  };
}

function mapTaskToAction(task: string): AIDecision['action'] {
  const map: Record<string, AIDecision['action']> = {
    recon: 'recon',
    move_to_position: 'move',
    attack: 'attack',
    defend: 'defend',
    withdraw: 'withdraw',
    support: 'support',
    hold: 'hold',
    resupply: 'resupply',
  };
  return map[task] ?? 'hold';
}

function shouldRequireAuthorization(task: string, order: HQOrder | undefined): boolean {
  if (!order) return true;
  if (order.autonomy === 'high') return false;
  if (order.autonomy === 'strict') return task !== 'recon' && task !== 'move_to_position';
  return task === 'attack' || task === 'withdraw';
}
