/**
 * 伤害模型 - 整合装甲/压制/士气
 */

import type { ArmorProfile, WeaponProfile } from './modern-unit-types';
import { resolveArmorHit, type HitResult } from './armor-model';
import { applySuppression, type SuppressionState } from './suppression';
import { applyMoraleImpact } from './morale';

export interface DamageResult {
  hpDamage: number;
  hitResult: HitResult;
  suppression: SuppressionState;
  moraleChange: number;
  killed: boolean;
}

export function resolveAttack(
  weapon: WeaponProfile,
  armor: ArmorProfile,
  hitAngle: 'front' | 'side' | 'rear' | 'top',
  range: number,
  currentSuppression: number,
  currentMorale: number,
  coverBonus: number,
  unitType: string,
  unitCount: number,
  friendlySupport: number,
  enemyPressure: number
): DamageResult {
  // Armor resolution
  const armorResult = resolveArmorHit(weapon, armor, hitAngle, range);

  // Suppression
  const suppression = applySuppression(currentSuppression, weapon.damage, coverBonus, unitType);

  // Morale
  const losses = armorResult.result === 'destroyed' || armorResult.result === 'catastrophic_kill' ? 1 : 0;
  const isDefeat = losses > 0;
  const newMorale = applyMoraleImpact(currentMorale, losses, unitCount, false, isDefeat, friendlySupport, enemyPressure);

  return {
    hpDamage: armorResult.damage,
    hitResult: armorResult.result,
    suppression,
    moraleChange: newMorale - currentMorale,
    killed: armorResult.result === 'destroyed' || armorResult.result === 'catastrophic_kill',
  };
}
