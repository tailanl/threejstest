/**
 * 士气系统
 */

export interface MoraleState {
  level: number; // 0-100
  state: 'steady' | 'shaken' | 'worried' | 'broken' | 'routed';
}

export function calculateMoraleState(morale: number): MoraleState {
  if (morale >= 70) return { level: morale, state: 'steady' };
  if (morale >= 50) return { level: morale, state: 'shaken' };
  if (morale >= 30) return { level: morale, state: 'worried' };
  if (morale >= 10) return { level: morale, state: 'broken' };
  return { level: morale, state: 'routed' };
}

export function applyMoraleImpact(
  currentMorale: number,
  losses: number,
  totalStrength: number,
  isVictory: boolean,
  isDefeat: boolean,
  friendlySupport: number,
  enemyPressure: number
): number {
  let morale = currentMorale;

  // Loss impact
  const lossRatio = totalStrength > 0 ? losses / totalStrength : 0;
  morale -= lossRatio * 40;

  // Combat result
  if (isVictory) morale += 15;
  if (isDefeat) morale -= 20;

  // Support vs pressure
  morale += friendlySupport * 5;
  morale -= enemyPressure * 8;

  return Math.min(100, Math.max(0, morale));
}

export function getMoraleModifier(state: MoraleState['state']): {
  combatEffectiveness: number;
  moveWillingness: number;
  surrenderChance: number;
} {
  switch (state) {
    case 'steady': return { combatEffectiveness: 1.0, moveWillingness: 1.0, surrenderChance: 0 };
    case 'shaken': return { combatEffectiveness: 0.85, moveWillingness: 0.9, surrenderChance: 0.01 };
    case 'worried': return { combatEffectiveness: 0.65, moveWillingness: 0.7, surrenderChance: 0.05 };
    case 'broken': return { combatEffectiveness: 0.35, moveWillingness: 0.4, surrenderChance: 0.2 };
    case 'routed': return { combatEffectiveness: 0.1, moveWillingness: 0.1, surrenderChance: 0.5 };
  }
}
