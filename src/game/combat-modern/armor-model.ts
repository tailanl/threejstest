/**
 * 装甲穿深模型
 */

import type { ArmorProfile, WeaponProfile } from './modern-unit-types';

export type HitResult =
  | 'no_penetration'
  | 'partial_damage'
  | 'mobility_kill'
  | 'weapon_disabled'
  | 'destroyed'
  | 'catastrophic_kill';

export interface ArmorHitResult {
  result: HitResult;
  damage: number;
  penetration: number;
  armorValue: number;
  hitAngle: 'front' | 'side' | 'rear' | 'top';
}

export function resolveArmorHit(
  weapon: WeaponProfile,
  armor: ArmorProfile,
  hitAngle: ArmorHitResult['hitAngle'],
  range: number
): ArmorHitResult {
  // Get armor value for hit angle
  let armorValue: number;
  switch (hitAngle) {
    case 'front': armorValue = armor.front; break;
    case 'side': armorValue = armor.side; break;
    case 'rear': armorValue = armor.rear; break;
    case 'top': armorValue = armor.top; break;
  }

  // Range modifier for penetration
  const rangeModifier = Math.max(0.3, 1 - range * 0.03);
  const effectivePenetration = weapon.penetration * rangeModifier;

  // Side/rear bonus
  const angleModifier = hitAngle === 'side' ? 0.8 : hitAngle === 'rear' ? 0.6 : hitAngle === 'top' ? 0.5 : 1;
  const effectiveArmor = armorValue * angleModifier;

  // Resolve
  if (effectivePenetration < effectiveArmor * 0.5) {
    return { result: 'no_penetration', damage: 0, penetration: effectivePenetration, armorValue: effectiveArmor, hitAngle };
  }

  if (effectivePenetration < effectiveArmor * 0.8) {
    return { result: 'partial_damage', damage: weapon.damage * 0.2, penetration: effectivePenetration, armorValue: effectiveArmor, hitAngle };
  }

  if (effectivePenetration < effectiveArmor) {
    // Possible mobility kill
    const roll = Math.random();
    if (roll < 0.3) return { result: 'mobility_kill', damage: weapon.damage * 0.5, penetration: effectivePenetration, armorValue: effectiveArmor, hitAngle };
    if (roll < 0.5) return { result: 'weapon_disabled', damage: weapon.damage * 0.3, penetration: effectivePenetration, armorValue: effectiveArmor, hitAngle };
    return { result: 'partial_damage', damage: weapon.damage * 0.4, penetration: effectivePenetration, armorValue: effectiveArmor, hitAngle };
  }

  // Full penetration
  const roll = Math.random();
  if (roll < 0.15 && weapon.type === 'kinetic') {
    return { result: 'catastrophic_kill', damage: weapon.damage * 2, penetration: effectivePenetration, armorValue: effectiveArmor, hitAngle };
  }

  return { result: 'destroyed', damage: weapon.damage, penetration: effectivePenetration, armorValue: effectiveArmor, hitAngle };
}

export function determineHitAngle(
  attackerFacing: 'north' | 'south' | 'east' | 'west',
  targetFacing: 'north' | 'south' | 'east' | 'west',
  relativePosition: 'front' | 'side' | 'rear'
): ArmorHitResult['hitAngle'] {
  if (relativePosition === 'rear') return 'rear';
  if (relativePosition === 'side') return 'side';
  return 'front';
}
