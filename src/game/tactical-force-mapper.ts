/**
 * 战术单位生成/映射 - 从战略力量映射到战术单位
 *
 * 第一版：简单规则生成，数量控制在攻击方4~8、防守方4~8
 */

import type { Unit, UnitType, Faction, Position } from './types';
import type { BattleType, AttackerDirection } from './tactical-from-detail';
import { createUnit } from './engine';

export interface TacticalForceMappingInput {
  attackerStrategicForceIds: string[];
  defenderStrategicForceIds: string[];
  attackerDirection: AttackerDirection;
  battleType: BattleType;
}

// 按战斗类型推荐单位组合
const BATTLE_TYPE_UNITS: Record<BattleType, { attacker: UnitType[]; defender: UnitType[] }> = {
  encounter: {
    attacker: ['tank', 'ifv', 'infantry', 'scout', 'infantry', 'artillery'],
    defender: ['tank', 'ifv', 'infantry', 'scout', 'infantry', 'artillery'],
  },
  urban_assault: {
    attacker: ['infantry', 'infantry', 'ifv', 'engineer', 'tank', 'scout'],
    defender: ['infantry', 'infantry', 'infantry', 'atgm', 'engineer', 'supply'],
  },
  bridge_crossing: {
    attacker: ['engineer', 'infantry', 'infantry', 'ifv', 'tank', 'artillery'],
    defender: ['infantry', 'atgm', 'infantry', 'artillery', 'scout', 'engineer'],
  },
  hill_assault: {
    attacker: ['infantry', 'infantry', 'scout', 'ifv', 'artillery', 'tank'],
    defender: ['infantry', 'atgm', 'artillery', 'infantry', 'scout', 'supply'],
  },
  forest_fight: {
    attacker: ['infantry', 'infantry', 'scout', 'infantry', 'ifv', 'engineer'],
    defender: ['infantry', 'infantry', 'atgm', 'scout', 'infantry', 'supply'],
  },
  road_ambush: {
    attacker: ['ifv', 'tank', 'infantry', 'supply', 'scout'],
    defender: ['infantry', 'atgm', 'infantry', 'scout', 'infantry', 'engineer'],
  },
  fortress_assault: {
    attacker: ['tank', 'ifv', 'infantry', 'infantry', 'artillery', 'engineer'],
    defender: ['infantry', 'infantry', 'atgm', 'artillery', 'supply', 'infantry'],
  },
  open_field: {
    attacker: ['tank', 'tank', 'ifv', 'ifv', 'artillery', 'scout', 'infantry', 'mlrs'],
    defender: ['tank', 'tank', 'ifv', 'atgm', 'artillery', 'scout', 'infantry', 'sam'],
  },
};

function createRNG(seed: number) {
  let s = seed | 0;
  return {
    next(): number {
      s = (s * 1664525 + 1013904223) | 0;
      return (s >>> 0) / 4294967296;
    },
  };
}

export function generateTacticalUnitsFromStrategicForces(params: {
  input: TacticalForceMappingInput;
  attackerZone: Position[];
  defenderZone: Position[];
  seed: number;
}): { attackerUnits: Unit[]; defenderUnits: Unit[] } {
  const { input, attackerZone, defenderZone, seed } = params;
  const rng = createRNG(seed);

  const templates = BATTLE_TYPE_UNITS[input.battleType] ?? BATTLE_TYPE_UNITS.encounter;

  // 随机选取4~8个单位
  const attackerCount = 4 + Math.floor(rng.next() * 5); // 4~8
  const defenderCount = 4 + Math.floor(rng.next() * 5);

  const pickUnits = (template: UnitType[], count: number): UnitType[] => {
    const result: UnitType[] = [];
    for (let i = 0; i < count; i++) {
      result.push(template[Math.floor(rng.next() * template.length)]);
    }
    return result;
  };

  const attackerTypes = pickUnits(templates.attacker, attackerCount);
  const defenderTypes = pickUnits(templates.defender, defenderCount);

  // 在部署区中随机放置
  const deployUnits = (types: UnitType[], zone: Position[], faction: Faction): Unit[] => {
    const units: Unit[] = [];
    const shuffledZone = [...zone].sort(() => rng.next() - 0.5);

    for (let i = 0; i < types.length && i < shuffledZone.length; i++) {
      const pos = shuffledZone[i];
      const unit = createUnit(types[i], faction, pos);
      units.push(unit);
    }
    return units;
  };

  const attackerUnits = deployUnits(attackerTypes, attackerZone, 'red');
  const defenderUnits = deployUnits(defenderTypes, defenderZone, 'blue');

  return { attackerUnits, defenderUnits };
}
