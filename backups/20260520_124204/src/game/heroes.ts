// ===== 英雄单位定义 =====

import { Faction, HeroAbility, UnitType, UnitStats } from './types';

/** Hero definition template */
export interface HeroDefinition {
  id: string;
  name: string;
  title: string;
  faction: Faction;
  unitType: UnitType;
  statBoosts: Partial<UnitStats>;
  lore: string;
  abilities: HeroAbility[];
  portraitIcon: string;
}

/** Create a fresh copy of hero abilities (with cooldowns reset) */
function cloneAbilities(abs: HeroAbility[]): HeroAbility[] {
  return abs.map(a => ({ ...a, currentCooldown: 0 }));
}

export const HERO_DEFINITIONS: HeroDefinition[] = [
  // ===== RED HEROES =====
  {
    id: 'hero_red_tank',
    name: '铁壁·赵虎',
    title: '钢铁防线',
    faction: 'red',
    unitType: 'tank',
    portraitIcon: '🛡️',
    lore: '身经百战的老兵，曾单人坚守要塞三天三夜，被尊称为"移动堡垒"。',
    statBoosts: {
      hp: 20,
      maxHp: 20,
      defense: 10,
      armor: 10,
    },
    abilities: [
      {
        id: 'iron_wall_passive',
        name: '铁壁',
        description: '受到的伤害减少8点（固定减伤）',
        type: 'passive',
        trigger: 'onDamaged',
        cooldown: 0,
        currentCooldown: 0,
        icon: '🧱',
        effect: {
          defenseBonus: 8,
        },
      },
      {
        id: 'fortify_active',
        name: '钢铁壁垒',
        description: '进入防御姿态，获得+30防御2回合（冷却3回合）',
        type: 'active',
        trigger: 'manual',
        cooldown: 3,
        currentCooldown: 0,
        icon: '🏰',
        effect: {
          defenseBonus: 30,
        },
      },
    ],
  },
  {
    id: 'hero_red_artillery',
    name: '烈焰·李雷',
    title: '焦土战术',
    faction: 'red',
    unitType: 'artillery',
    portraitIcon: '🔥',
    lore: '炮兵指挥官，信奉"没有炸不碎的防线"，以精准的火力覆盖闻名。',
    statBoosts: {
      hp: 10,
      maxHp: 10,
      attack: 8,
      vision: 1,
    },
    abilities: [
      {
        id: 'splash_passive',
        name: '溅射弹幕',
        description: '攻击时对目标相邻敌方单位造成30%溅射伤害',
        type: 'passive',
        trigger: 'onAttack',
        cooldown: 0,
        currentCooldown: 0,
        icon: '💥',
        effect: {
          aoeDamage: 0.3,
          aoeRadius: 1,
        },
      },
      {
        id: 'firestorm_active',
        name: '烈焰风暴',
        description: '对2格范围内所有敌人造成25伤害（冷却4回合）',
        type: 'active',
        trigger: 'manual',
        cooldown: 4,
        currentCooldown: 0,
        icon: '🌪️',
        effect: {
          aoeDamage: 25,
          aoeRadius: 2,
        },
      },
    ],
  },
  {
    id: 'hero_red_scout',
    name: '幽灵·陈影',
    title: '无声猎手',
    faction: 'red',
    unitType: 'scout',
    portraitIcon: '👻',
    lore: '神秘的侦察专家，擅长深入敌后搜集情报，来去无踪。',
    statBoosts: {
      hp: 10,
      maxHp: 10,
      vision: 2,
      attack: 5,
    },
    abilities: [
      {
        id: 'ghost_vision_passive',
        name: '鹰眼',
        description: '视野+2，进入隐身不消耗行动',
        type: 'passive',
        trigger: 'onMove',
        cooldown: 0,
        currentCooldown: 0,
        icon: '👁️',
        effect: {
          extraVision: 2,
        },
      },
      {
        id: 'mark_target_active',
        name: '战术标记',
        description: '以自身为中心3格内所有隐身敌军失去隐身状态（冷却3回合）',
        type: 'active',
        trigger: 'manual',
        cooldown: 3,
        currentCooldown: 0,
        icon: '🎯',
        effect: {
          extraVision: 3,
        },
      },
    ],
  },
  {
    id: 'hero_red_helicopter',
    name: '雷霆·王猛',
    title: '空中骑士',
    faction: 'red',
    unitType: 'helicopter',
    portraitIcon: '⚡',
    lore: '王牌飞行员，创下单场击毁12辆坦克的记录，被誉为"天空之锤"。',
    statBoosts: {
      hp: 10,
      maxHp: 10,
      attack: 8,
      armorPenetration: 5,
    },
    abilities: [
      {
        id: 'thunder_move_passive',
        name: '闪电机动',
        description: '移动范围+1，无视山地风 penalty',
        type: 'passive',
        trigger: 'onMove',
        cooldown: 0,
        currentCooldown: 0,
        icon: '💨',
        effect: {
          extraMoveRange: 1,
        },
      },
      {
        id: 'strafing_run_active',
        name: '扫射突袭',
        description: '对周围所有敌人造成中等范围伤害（冷却3回合）',
        type: 'active',
        trigger: 'manual',
        cooldown: 3,
        currentCooldown: 0,
        icon: '✈️',
        effect: {
          aoeDamage: 20,
          aoeRadius: 1,
        },
      },
    ],
  },
  {
    id: 'hero_red_ifv',
    name: '铁锤·孙刚',
    title: '钢铁洪流',
    faction: 'red',
    unitType: 'ifv',
    portraitIcon: '🔨',
    lore: '步战车指挥官，以凶猛的反击战术闻名，被敌人称为"铁锤"。',
    statBoosts: {
      hp: 10,
      maxHp: 10,
      attack: 6,
      defense: 5,
    },
    abilities: [
      {
        id: 'counter_strike_passive',
        name: '铁锤反击',
        description: '反击伤害增加50%',
        type: 'passive',
        trigger: 'onDamaged',
        cooldown: 0,
        currentCooldown: 0,
        icon: '⚔️',
        effect: {
          counterAttackBonus: 0.5,
        },
      },
      {
        id: 'charge_active',
        name: '冲锋突击',
        description: '下次攻击伤害+40%，可继续移动（冷却3回合）',
        type: 'active',
        trigger: 'manual',
        cooldown: 3,
        currentCooldown: 0,
        icon: '🏇',
        effect: {
          damageMultiplier: 1.4,
        },
      },
    ],
  },
  {
    id: 'hero_red_supply',
    name: '天使·刘芳',
    title: '战场圣母',
    faction: 'red',
    unitType: 'supply',
    portraitIcon: '👼',
    lore: '战地医疗官，被前线士兵称为"天使"，多次冒险抢救伤员。',
    statBoosts: {
      hp: 15,
      maxHp: 15,
      defense: 5,
    },
    abilities: [
      {
        id: 'angel_heal_passive',
        name: '仁心',
        description: '治疗范围+1，治疗量+5',
        type: 'passive',
        trigger: 'onTurnStart',
        cooldown: 0,
        currentCooldown: 0,
        icon: '💚',
        effect: { healAmountBonus: 5, healRangeBonus: 1 },
      },
      {
        id: 'emergency_resupply_active',
        name: '紧急救治',
        description: '治疗2格范围内所有友军20HP（冷却4回合）',
        type: 'active',
        trigger: 'manual',
        cooldown: 4,
        currentCooldown: 0,
        icon: '🏥',
        effect: {
          aoeDamage: -20,
          aoeRadius: 2,
        },
      },
    ],
  },
  // ===== BLUE HEROES =====
  {
    id: 'hero_blue_infantry',
    name: '暗影·杰克',
    title: '特种之王',
    faction: 'blue',
    unitType: 'infantry',
    portraitIcon: '🗡️',
    lore: '特种部队精英，精通各类作战技巧，擅长从暗处发动致命一击。',
    statBoosts: {
      hp: 15,
      maxHp: 15,
      attack: 10,
      armorPenetration: 5,
    },
    abilities: [
      {
        id: 'shadow_stealth_passive',
        name: '暗影步',
        description: '可在任何地形进入隐身，隐身攻击伤害+15%',
        type: 'passive',
        trigger: 'onAttack',
        cooldown: 0,
        currentCooldown: 0,
        icon: '🌑',
        effect: {
          damageMultiplier: 1.15,
        },
      },
      {
        id: 'assassinate_active',
        name: '暗杀',
        description: '对低于50%HP的目标造成双倍伤害（冷却3回合）',
        type: 'active',
        trigger: 'manual',
        cooldown: 3,
        currentCooldown: 0,
        icon: '💀',
        effect: {
          damageMultiplier: 2.0,
        },
      },
    ],
  },
  {
    id: 'hero_blue_mlrs',
    name: '暴风·史密斯',
    title: '毁灭之雨',
    faction: 'blue',
    unitType: 'mlrs',
    portraitIcon: '🌧️',
    lore: '火箭炮专家，以毁灭性的火力覆盖著称，被敌人恐惧地称为"暴风"。',
    statBoosts: {
      hp: 10,
      maxHp: 10,
      attack: 10,
      attackRange: 1,
    },
    abilities: [
      {
        id: 'extended_range_passive',
        name: '远程打击',
        description: '攻击范围+1',
        type: 'passive',
        trigger: 'onAttack',
        cooldown: 0,
        currentCooldown: 0,
        icon: '🎯',
        effect: { attackRangeBonus: 1 },
      },
      {
        id: 'guided_barrage_active',
        name: '精确弹幕',
        description: '对目标造成必中伤害+溅射（冷却4回合）',
        type: 'active',
        trigger: 'manual',
        cooldown: 4,
        currentCooldown: 0,
        icon: '🚀',
        effect: {
          damageBonus: 30,
          aoeDamage: 15,
          aoeRadius: 1,
        },
      },
    ],
  },
  {
    id: 'hero_blue_sam',
    name: '铁鹰·布朗',
    title: '天空之盾',
    faction: 'blue',
    unitType: 'sam',
    portraitIcon: '🦅',
    lore: '防空系统指挥官，构建了最严密的防空网络，号称"鹰眼"。',
    statBoosts: {
      hp: 10,
      maxHp: 10,
      defense: 8,
      attack: 5,
    },
    abilities: [
      {
        id: 'air_shield_passive',
        name: '防空结界',
        description: '2格内友军对空防御+10',
        type: 'passive',
        trigger: 'onTurnStart',
        cooldown: 0,
        currentCooldown: 0,
        icon: '🛡️',
        effect: {
          defenseBonus: 10,
          moraleBoostRadius: 2,
        },
      },
      {
        id: 'lock_on_active',
        name: '锁定打击',
        description: '标记目标2回合，使其防御降低50%（冷却3回合）',
        type: 'active',
        trigger: 'manual',
        cooldown: 3,
        currentCooldown: 0,
        icon: '🔒',
        effect: { defenseReduction: 0.5, duration: 2 },
      },
    ],
  },
  {
    id: 'hero_blue_tank2',
    name: '獠牙·威廉',
    title: '先锋之矛',
    faction: 'blue',
    unitType: 'tank',
    portraitIcon: '🐘',
    lore: '装甲突击专家，擅长击破敌方防线，被誉为"獠牙"。',
    statBoosts: {
      hp: 10,
      maxHp: 10,
      attack: 12,
      armorPenetration: 8,
    },
    abilities: [
      {
        id: 'armor_pierce_passive',
        name: '破甲獠牙',
        description: '对工事中的敌人伤害+25%，穿甲+10',
        type: 'passive',
        trigger: 'onAttack',
        cooldown: 0,
        currentCooldown: 0,
        icon: '🔩',
        effect: {
          damageMultiplier: 1.25,
          armorPenetrationBonus: 10,
        },
      },
      {
        id: 'armor_break_active',
        name: '碎甲打击',
        description: '移除目标工事并造成40伤害（冷却3回合）',
        type: 'active',
        trigger: 'manual',
        cooldown: 3,
        currentCooldown: 0,
        icon: '💥',
        effect: {
          damageBonus: 40,
          armorPenetrationBonus: 30,
        },
      },
    ],
  },
  {
    id: 'hero_blue_scout2',
    name: '旋风·戴维斯',
    title: '闪电突袭',
    faction: 'blue',
    unitType: 'scout',
    portraitIcon: '🌀',
    lore: '闪电战专家，以极高的机动性绕后突袭，令敌人防不胜防。',
    statBoosts: {
      hp: 5,
      maxHp: 5,
      attack: 8,
      moveRange: 2,
    },
    abilities: [
      {
        id: 'hit_and_run_passive',
        name: '游击战术',
        description: '攻击后仍可移动',
        type: 'passive',
        trigger: 'onAttack',
        cooldown: 0,
        currentCooldown: 0,
        icon: '🏃',
        effect: {},
      },
      {
        id: 'flanking_maneuver_active',
        name: '侧翼突袭',
        description: '下次攻击伤害+50%，可继续移动（冷却3回合）',
        type: 'active',
        trigger: 'manual',
        cooldown: 3,
        currentCooldown: 0,
        icon: '⚡',
        effect: {
          damageMultiplier: 1.5,
        },
      },
    ],
  },
  {
    id: 'hero_blue_engineer',
    name: '坚壁·亨利',
    title: '筑城大师',
    faction: 'blue',
    unitType: 'engineer',
    portraitIcon: '🏗️',
    lore: '工程兵总指挥，擅长构筑坚不可摧的防御工事体系。',
    statBoosts: {
      hp: 10,
      maxHp: 10,
      defense: 12,
      armor: 5,
    },
    abilities: [
      {
        id: 'fortify_master_passive',
        name: '大师工事',
        description: '工事持续时间+3，工事防御+10',
        type: 'passive',
        trigger: 'onTurnStart',
        cooldown: 0,
        currentCooldown: 0,
        icon: '🧱',
        effect: {
          defenseBonus: 10,
          durationBonus: 3,
        },
      },
      {
        id: 'mass_fortify_active',
        name: '战场重建',
        description: '为2格内所有友军修建工事（冷却5回合）',
        type: 'active',
        trigger: 'manual',
        cooldown: 5,
        currentCooldown: 0,
        icon: '🏰',
        effect: {
          aoeRadius: 2,
          defenseBonus: 20,
        },
      },
    ],
  },
];

/** Get hero definitions for a faction */
export function getHeroesForFaction(faction: Faction): HeroDefinition[] {
  return HERO_DEFINITIONS.filter(h => h.faction === faction);
}

/** Get a hero definition by ID */
export function getHeroDefinition(heroId: string): HeroDefinition | undefined {
  return HERO_DEFINITIONS.find(h => h.id === heroId);
}

/** Get a fresh copy of hero abilities (with cooldowns reset) */
export function getFreshHeroAbilities(heroId: string): HeroAbility[] {
  const hero = getHeroDefinition(heroId);
  if (!hero) return [];
  return cloneAbilities(hero.abilities);
}
