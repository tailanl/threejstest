/**
 * Force delegation - delegate/recall forces to/from AI control
 */

import type { StrategicForce } from '../strategic-types';
import type { ForceCommandState } from './command-types';

export function delegateForceToAI(params: {
  force: StrategicForce;
  commanderId: string;
  autonomy: ForceCommandState['autonomy'];
  riskTolerance: ForceCommandState['riskTolerance'];
  reportLevel: ForceCommandState['reportLevel'];
}): StrategicForce {
  const { force, commanderId, autonomy, riskTolerance, reportLevel } = params;
  return {
    ...force,
    command: {
      forceId: force.id,
      controller: 'ai_delegated',
      commanderId,
      currentOrderIds: [],
      autonomy,
      riskTolerance,
      reportLevel,
    },
  };
}

export function recallForceFromAI(force: StrategicForce): StrategicForce {
  if (!force.command || force.command.controller === 'player_direct') return force;
  return {
    ...force,
    command: {
      forceId: force.id,
      controller: 'player_direct',
      commanderId: undefined,
      currentOrderIds: [],
      autonomy: 'normal',
      riskTolerance: 'medium',
      reportLevel: 'normal',
    },
  };
}
