/**
 * 压制系统
 */

export interface SuppressionState {
  level: number; // 0-100
  pinned: boolean;
  stunned: boolean;
  moraleImpact: number;
}

export function applySuppression(
  currentLevel: number,
  incomingFirePower: number,
  coverBonus: number,
  unitType: string
): SuppressionState {
  // Base suppression from fire
  let newLevel = currentLevel + incomingFirePower * (1 - coverBonus / 100);

  // Unit type modifiers
  if (unitType === 'infantry') newLevel *= 1.3;
  if (unitType === 'tank') newLevel *= 0.5;
  if (unitType === 'ifv') newLevel *= 0.7;

  newLevel = Math.min(100, Math.max(0, newLevel));

  return {
    level: newLevel,
    pinned: newLevel >= 60,
    stunned: newLevel >= 80,
    moraleImpact: -newLevel * 0.1,
  };
}

export function recoverSuppression(currentLevel: number, turnCount: number): number {
  // Recover 15 per turn, faster if low suppression
  const recovery = turnCount * 15;
  return Math.max(0, currentLevel - recovery);
}

export function getSuppressionPenalty(level: number): {
  accuracyModifier: number;
  movementModifier: number;
  canReturnFire: boolean;
} {
  return {
    accuracyModifier: 1 - level * 0.008, // Up to -80% accuracy
    movementModifier: level >= 60 ? 0.5 : 1, // Pinned units move at half speed
    canReturnFire: level < 80, // Stunned units cannot return fire
  };
}
