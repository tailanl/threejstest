// ===== 战棋游戏配置 - 单位与地形属性 =====

import { UnitTypeConfig, TerrainTypeConfig, CapturePointType, LevelUpBonus, UnitType, Position, Faction, MapType, MapCell, WeatherType } from './types';

/** 单位类型配置表 */
export const UNIT_CONFIGS: Record<string, UnitTypeConfig> = {
  tank: {
    type: 'tank',
    name: '重型坦克',
    description: '重装甲、高穿甲，地面突击核心。动能武器对抗装甲目标效果极佳。机动性较低但正面几乎无敌。',
    baseHp: 140,
    stats: {
      attack: 48,
      defense: 40,
      armor: 55,
      armorPenetration: 38,
      moveRange: 3,
      attackRange: 2,
      vision: 3,
    },
    isVehicle: true,
    canStealth: false,
    stealthDuration: 0,
    stealthCooldownMax: 0,
    damageType: 'kinetic',
  },
  ifv: {
    type: 'ifv',
    name: '步战车',
    description: '中等装甲、均衡穿甲，机动灵活的步兵战车。',
    baseHp: 85,
    stats: {
      attack: 30,
      defense: 25,
      armor: 25,
      armorPenetration: 20,
      moveRange: 6,
      attackRange: 2,
      vision: 3,
    },
    isVehicle: true,
    canStealth: false,
    stealthDuration: 0,
    stealthCooldownMax: 0,
    damageType: 'kinetic',
  },
  artillery: {
    type: 'artillery',
    name: '自行火炮',
    description: '远程高爆火力支援，基础伤害极高但穿甲低，对轻装甲目标效果显著。',
    baseHp: 70,
    stats: {
      attack: 55,
      defense: 12,
      armor: 8,
      armorPenetration: 10,
      moveRange: 3,
      attackRange: 5,
      vision: 4,
    },
    isVehicle: true,
    maxAmmo: 4,
    canStealth: false,
    stealthDuration: 0,
    stealthCooldownMax: 0,
    damageType: 'he',
  },
  scout: {
    type: 'scout',
    name: '侦察车',
    description: '高速侦察单位，极薄装甲、低穿甲，但拥有超大视野和极高机动性。易被摧毁需谨慎使用。',
    baseHp: 45,
    stats: {
      attack: 15,
      defense: 8,
      armor: 5,
      armorPenetration: 10,
      moveRange: 9,
      attackRange: 2,
      vision: 8,
    },
    isVehicle: true,
    canStealth: true,
    stealthDuration: 2,
    stealthCooldownMax: 3,
    damageType: 'kinetic',
  },
  infantry: {
    type: 'infantry',
    name: '步兵班',
    description: '轻装甲但携带反坦克武器，穿甲能力不容小觑。擅长城市和森林作战，在复杂地形中获得显著加成。',
    baseHp: 75,
    stats: {
      attack: 28,
      defense: 22,
      armor: 5,
      armorPenetration: 22,
      moveRange: 4,
      attackRange: 2,
      vision: 3,
    },
    isVehicle: false,
    canStealth: true,
    stealthDuration: 3,
    stealthCooldownMax: 4,
    damageType: 'kinetic',
  },
  sam: {
    type: 'sam',
    name: '防空导弹车',
    description: '区域防空系统，中等装甲，对地面目标穿甲有限。',
    baseHp: 80,
    stats: {
      attack: 15,
      defense: 20,
      armor: 20,
      armorPenetration: 15,
      moveRange: 4,
      attackRange: 3,
      vision: 4,
    },
    isVehicle: true,
    canStealth: false,
    stealthDuration: 0,
    stealthCooldownMax: 0,
    damageType: 'kinetic',
    antiAirRange: 2,       // Anti-air interception range
    antiAirReduction: 0.3, // 30% damage reduction to helicopters within range
    maxAmmo: 5,
  },
  engineer: {
    type: 'engineer',
    name: '工程车',
    description: '中等装甲、低穿甲的战斗工程车，可修建工事增强防御。',
    baseHp: 90,
    stats: {
      attack: 12,
      defense: 25,
      armor: 25,
      armorPenetration: 5,
      moveRange: 4,
      attackRange: 1,
      vision: 3,
    },
    isVehicle: true,
    buildFortify: true,
    canStealth: true,
    stealthDuration: 2,
    stealthCooldownMax: 5,
    damageType: 'kinetic',
  },
  supply: {
    type: 'supply',
    name: '补给车',
    description: '轻装甲后勤车辆，为相邻友军恢复生命值，几乎没有穿甲能力。',
    baseHp: 60,
    stats: {
      attack: 5,
      defense: 10,
      armor: 5,
      armorPenetration: 3,
      moveRange: 5,
      attackRange: 1,
      vision: 3,
    },
    isVehicle: true,
    healAmount: 10,
    healRange: 1,
    canStealth: false,
    stealthDuration: 0,
    stealthCooldownMax: 0,
    damageType: 'kinetic',
  },
  helicopter: {
    type: 'helicopter',
    name: '武装直升机',
    description: '空中反装甲利器，高穿甲反坦克导弹可击穿重甲，但自身几乎无装甲。',
    baseHp: 65,
    stats: {
      attack: 40,
      defense: 8,
      armor: 3,
      armorPenetration: 38,
      moveRange: 7,
      attackRange: 3,
      vision: 5,
    },
    isVehicle: false, // special: ignores terrain
    maxAmmo: 6,
    canStealth: false,
    stealthDuration: 0,
    stealthCooldownMax: 0,
    damageType: 'kinetic',
  },
  mlrs: {
    type: 'mlrs',
    name: '火箭炮',
    description: '远程高爆火力压制，基础伤害极高但穿甲极低，对轻装甲和无装甲目标毁灭性打击。',
    baseHp: 60,
    stats: {
      attack: 50,
      defense: 8,
      armor: 5,
      armorPenetration: 5,
      moveRange: 2,
      attackRange: 7,
      vision: 3,
    },
    isVehicle: true,
    maxAmmo: 3,
    canStealth: false,
    stealthDuration: 0,
    stealthCooldownMax: 0,
    damageType: 'he',
  },
  atgm: {
    type: 'atgm',
    name: '反坦克导弹车',
    description: '高穿甲导弹发射车，专门克制重装甲目标。自身装甲薄弱但一击致命。',
    baseHp: 50,
    stats: {
      attack: 55,
      defense: 8,
      armor: 4,
      armorPenetration: 60,
      moveRange: 5,
      attackRange: 4,
      vision: 4,
    },
    isVehicle: true,
    maxAmmo: 5,
    canStealth: true,
    stealthDuration: 2,
    stealthCooldownMax: 4,
    damageType: 'kinetic',
  },
  uav: {
    type: 'uav',
    name: '无人机',
    description: '高空侦察平台，超大视野范围可标记敌方目标。几乎无装甲，被击中即毁。',
    baseHp: 25,
    stats: {
      attack: 5,
      defense: 2,
      armor: 0,
      armorPenetration: 2,
      moveRange: 10,
      attackRange: 1,
      vision: 9,
    },
    isVehicle: false,
    canStealth: false,
    stealthDuration: 0,
    stealthCooldownMax: 0,
    damageType: 'kinetic',
  },
  command: {
    type: 'command',
    name: '指挥车',
    description: '移动指挥中心，为周边友军提供战斗增益。低战斗力但高战略价值，需重点保护。',
    baseHp: 80,
    stats: {
      attack: 8,
      defense: 18,
      armor: 18,
      armorPenetration: 5,
      moveRange: 4,
      attackRange: 2,
      vision: 5,
    },
    isVehicle: true,
    canStealth: false,
    stealthDuration: 0,
    stealthCooldownMax: 0,
    damageType: 'kinetic',
  },
  ew: {
    type: 'ew',
    name: '电子战车',
    description: '电子战干扰平台，降低范围内敌方命中率和视野。软杀伤但战术价值极高。',
    baseHp: 65,
    stats: {
      attack: 10,
      defense: 15,
      armor: 12,
      armorPenetration: 8,
      moveRange: 5,
      attackRange: 3,
      vision: 6,
    },
    isVehicle: true,
    maxAmmo: 999,
    canStealth: true,
    stealthDuration: 1,
    stealthCooldownMax: 5,
    damageType: 'kinetic',
  },
};

/** 地形类型配置表 */
export const TERRAIN_CONFIGS: Record<string, TerrainTypeConfig> = {
  plains: {
    type: 'plains',
    name: '平原',
    nameEn: 'Plains',
    stats: {
      moveCost: 1,
      defenseBonus: 0,
      attackBonus: 0,
      visionBonus: 0,
      visionBlock: 0,
      isPassable: true,
      isPassableByVehicle: true,
      color: '#7cb342',
      height: 0.1,
    },
  },
  forest: {
    type: 'forest',
    name: '森林',
    nameEn: 'Forest',
    stats: {
      moveCost: 2,
      defenseBonus: 15,
      attackBonus: -5,
      visionBonus: -1,
      visionBlock: 0.5,
      isPassable: true,
      isPassableByVehicle: true,
      color: '#2e7d32',
      height: 0.15,
    },
  },
  mountain: {
    type: 'mountain',
    name: '山地',
    nameEn: 'Mountain',
    stats: {
      moveCost: 3,
      defenseBonus: 25,
      attackBonus: -10,
      visionBonus: 2,
      visionBlock: 99,
      isPassable: true,
      isPassableByVehicle: false,
      color: '#78909c',
      height: 0.5,
    },
  },
  water: {
    type: 'water',
    name: '水域',
    nameEn: 'Water',
    stats: {
      moveCost: 99,
      defenseBonus: 0,
      attackBonus: 0,
      visionBonus: 0,
      visionBlock: 0,
      isPassable: false,
      isPassableByVehicle: false,
      color: '#1565c0',
      height: -0.1,
    },
  },
  city: {
    type: 'city',
    name: '城市',
    nameEn: 'City',
    stats: {
      moveCost: 1,
      defenseBonus: 20,
      attackBonus: 5,
      visionBonus: 1,
      visionBlock: 0.3,
      isPassable: true,
      isPassableByVehicle: true,
      color: '#8d6e63',
      height: 0.2,
    },
  },
  road: {
    type: 'road',
    name: '公路',
    nameEn: 'Road',
    stats: {
      moveCost: 0.5,
      defenseBonus: -5,
      attackBonus: 0,
      visionBonus: 0,
      visionBlock: 0,
      isPassable: true,
      isPassableByVehicle: true,
      color: '#9e9e9e',
      height: 0.05,
    },
  },
  swamp: {
    type: 'swamp',
    name: '沼泽',
    nameEn: 'Swamp',
    stats: {
      moveCost: 3,
      defenseBonus: -10,
      attackBonus: -5,
      visionBonus: -1,
      visionBlock: 0,
      isPassable: true,
      isPassableByVehicle: false,
      color: '#5d4037',
      height: 0.0,
    },
  },
  bridge: {
    type: 'bridge',
    name: '桥梁',
    nameEn: 'Bridge',
    stats: {
      moveCost: 0.5,
      defenseBonus: -15,
      attackBonus: 0,
      visionBonus: 0,
      visionBlock: 0,
      isPassable: true,
      isPassableByVehicle: true,
      color: '#d7ccc8',
      height: 0.05,
    },
  },
  desert: {
    type: 'desert',
    name: '沙漠',
    nameEn: 'Desert',
    stats: {
      moveCost: 1.5,
      defenseBonus: -5,
      attackBonus: 0,
      visionBonus: 1,
      visionBlock: 0,
      isPassable: true,
      isPassableByVehicle: true,
      color: '#fdd835',
      height: 0.05,
    },
  },
  fortress: {
    type: 'fortress',
    name: '要塞',
    nameEn: 'Fortress',
    stats: {
      moveCost: 1,
      defenseBonus: 35,
      attackBonus: 10,
      visionBonus: 1,
      visionBlock: 0.2,
      isPassable: true,
      isPassableByVehicle: true,
      color: '#455a64',
      height: 0.35,
    },
  },
};

/** 工事加成 */
export const FORTIFY_DEFENSE_BONUS = 20;
export const FORTIFY_DURATION = 5;

/** 弹药补给系统 */
export const SUPPLY_AMMO_AMOUNT = 2; // 补给车每次恢复2发弹药

/** 士气系统 */
export const MORALE_HIGH_THRESHOLD = 80;    // 高士气：+10%攻击
export const MORALE_LOW_THRESHOLD = 40;     // 低士气：-10%攻击 -10%防御
export const MORALE_CRUSH_THRESHOLD = 20;   // 崩溃：无法攻击
export const MORALE_LOSS_ON_DAMAGE = 5;     // 受伤士气损失
export const MORALE_LOSS_ON_ALLY_KILL = 8;  // 附近友军被杀士气损失
export const MORALE_RECOVERY_PER_TURN = 3;  // 每回合士气恢复
export const SUPPLY_MORALE_BOOST = 15;      // 补给车士气恢复

/** 经验值系统 */
export const XP_PER_DAMAGE = 1;           // 每点伤害获得1经验
export const XP_PER_KILL = 30;            // 击杀奖励30经验
export const XP_PER_CAPTURE = 20;         // 占领据点奖励20经验
export const MAX_LEVEL = 5;               // 最大等级

/** 各等级升级所需经验 */
export const LEVEL_XP_THRESHOLDS = [0, 50, 120, 220, 350]; // level 1→2: 50xp, 2→3: 120xp, etc.

/** 升级属性加成（每级） */
export const LEVEL_UP_BONUSES: Record<UnitType, LevelUpBonus> = {
  tank:        { attack: 5, defense: 4, armor: 6, armorPenetration: 5, maxHp: 15, vision: 0, moveRange: 0, attackRange: 0 },
  ifv:         { attack: 3, defense: 3, armor: 4, armorPenetration: 3, maxHp: 10, vision: 0, moveRange: 0, attackRange: 0 },
  artillery:   { attack: 6, defense: 1, armor: 2, armorPenetration: 2, maxHp: 8,  vision: 0, moveRange: 0, attackRange: 0 },
  scout:       { attack: 2, defense: 1, armor: 1, armorPenetration: 2, maxHp: 5,  vision: 1, moveRange: 1, attackRange: 0 },
  infantry:    { attack: 3, defense: 2, armor: 1, armorPenetration: 3, maxHp: 8,  vision: 0, moveRange: 0, attackRange: 0 },
  sam:         { attack: 2, defense: 2, armor: 3, armorPenetration: 2, maxHp: 8,  vision: 1, moveRange: 0, attackRange: 0 },
  engineer:    { attack: 1, defense: 3, armor: 3, armorPenetration: 1, maxHp: 10, vision: 0, moveRange: 0, attackRange: 0 },
  supply:      { attack: 1, defense: 1, armor: 1, armorPenetration: 0, maxHp: 8,  vision: 0, moveRange: 0, attackRange: 0 },
  helicopter:  { attack: 5, defense: 1, armor: 1, armorPenetration: 4, maxHp: 8,  vision: 0, moveRange: 0, attackRange: 0 },
  mlrs:        { attack: 7, defense: 1, armor: 1, armorPenetration: 1, maxHp: 8,  vision: 0, moveRange: 0, attackRange: 0 },
  atgm:        { attack: 7, defense: 1, armor: 1, armorPenetration: 8, maxHp: 6,  vision: 1, moveRange: 0, attackRange: 1 },
  uav:         { attack: 1, defense: 0, armor: 0, armorPenetration: 0, maxHp: 3,  vision: 2, moveRange: 1, attackRange: 0 },
  command:     { attack: 1, defense: 3, armor: 2, armorPenetration: 1, maxHp: 10, vision: 1, moveRange: 0, attackRange: 0 },
  ew:          { attack: 2, defense: 2, armor: 1, armorPenetration: 1, maxHp: 7,  vision: 1, moveRange: 1, attackRange: 1 },
};

/** 据点类型配置 */
export const CAPTURE_POINT_CONFIGS: Record<CapturePointType, { captureThreshold: number; captureRadius: number; providesVision: number; name: string }> = {
  stronghold: { captureThreshold: 100, captureRadius: 2, providesVision: 3, name: '要塞据点' },
  bridgehead: { captureThreshold: 80, captureRadius: 2, providesVision: 2, name: '桥头堡' },
  supply_base: { captureThreshold: 60, captureRadius: 3, providesVision: 2, name: '补给基地' },
  comm_hub: { captureThreshold: 50, captureRadius: 1, providesVision: 4, name: '通信枢纽' },
};

/** 潜行地形加成 - 在特定地形上潜行时额外获得的占领进度 */
export const STEALTH_TERRAIN_BONUS: Record<string, number> = {
  forest: 30,    // +30 capture progress per turn when hiding in forest
  city: 20,      // +20 in city
  fortress: 25,  // +25 in fortress
  swamp: 15,     // +15 in swamp
  mountain: 10,  // +10 in mountain
};

/** 地雷系统 */
export const MINE_DAMAGE = 30;        // Damage when stepping on a mine
export const MINE_DETECTION_RANGE = 1;  // Scout can detect mines within this range
export const MINE_CLEAR_TURNS = 1;      // Engineer takes 1 action to clear mines

/** 地图尺寸 */
export const MAP_WIDTH = 16;
export const MAP_HEIGHT = 12;

/** 初始单位部署配置 */
export interface DeployConfig {
  type: UnitType;
  position: Position;
  faction: Faction;
}

// (Position, Faction, MapType, UnitType, MapCell imported at top)

/** 红方初始部署 */
export const RED_DEPLOYMENT: DeployConfig[] = [
  { type: 'tank', position: { x: 1, z: 2 }, faction: 'red' },
  { type: 'tank', position: { x: 1, z: 9 }, faction: 'red' },
  { type: 'ifv', position: { x: 2, z: 1 }, faction: 'red' },
  { type: 'ifv', position: { x: 2, z: 5 }, faction: 'red' },
  { type: 'ifv', position: { x: 2, z: 10 }, faction: 'red' },
  { type: 'artillery', position: { x: 0, z: 4 }, faction: 'red' },
  { type: 'artillery', position: { x: 0, z: 7 }, faction: 'red' },
  { type: 'scout', position: { x: 3, z: 3 }, faction: 'red' },
  { type: 'scout', position: { x: 3, z: 8 }, faction: 'red' },
  { type: 'infantry', position: { x: 2, z: 3 }, faction: 'red' },
  { type: 'infantry', position: { x: 2, z: 6 }, faction: 'red' },
  { type: 'infantry', position: { x: 2, z: 8 }, faction: 'red' },
  { type: 'sam', position: { x: 0, z: 0 }, faction: 'red' },
  { type: 'supply', position: { x: 1, z: 5 }, faction: 'red' },
  { type: 'helicopter', position: { x: 3, z: 0 }, faction: 'red' },
];

/** 蓝方初始部署 */
export const BLUE_DEPLOYMENT: DeployConfig[] = [
  { type: 'tank', position: { x: 14, z: 2 }, faction: 'blue' },
  { type: 'tank', position: { x: 14, z: 9 }, faction: 'blue' },
  { type: 'ifv', position: { x: 13, z: 1 }, faction: 'blue' },
  { type: 'ifv', position: { x: 13, z: 5 }, faction: 'blue' },
  { type: 'ifv', position: { x: 13, z: 10 }, faction: 'blue' },
  { type: 'artillery', position: { x: 15, z: 4 }, faction: 'blue' },
  { type: 'artillery', position: { x: 15, z: 7 }, faction: 'blue' },
  { type: 'scout', position: { x: 12, z: 3 }, faction: 'blue' },
  { type: 'scout', position: { x: 12, z: 8 }, faction: 'blue' },
  { type: 'infantry', position: { x: 13, z: 3 }, faction: 'blue' },
  { type: 'infantry', position: { x: 13, z: 6 }, faction: 'blue' },
  { type: 'infantry', position: { x: 13, z: 8 }, faction: 'blue' },
  { type: 'mlrs', position: { x: 15, z: 11 }, faction: 'blue' },
  { type: 'engineer', position: { x: 14, z: 6 }, faction: 'blue' },
  { type: 'helicopter', position: { x: 12, z: 11 }, faction: 'blue' },
];

// ===== 天气系统配置 =====

// (WeatherType defined in types.ts)

export interface WeatherConfig {
  name: string;
  icon: string;  // emoji
  movementModifier: number;  // multiplier on movement cost (1.0 = normal)
  visionModifier: number;    // additive on vision (-2 = reduce by 2)
  attackModifier: number;    // multiplier on attack damage (1.0 = normal)
  description: string;
  color: string;  // CSS color for UI
}

export const WEATHER_CONFIGS: Record<WeatherType, WeatherConfig> = {
  clear: { name: '晴天', icon: '☀️', movementModifier: 1.0, visionModifier: 0, attackModifier: 1.0, description: '无特殊效果', color: '#fbbf24' },
  rain: { name: '雨天', icon: '🌧️', movementModifier: 1.3, visionModifier: -1, attackModifier: 0.9, description: '移动消耗+30%, 视野-1, 攻击力-10%', color: '#60a5fa' },
  fog: { name: '大雾', icon: '🌫️', movementModifier: 1.0, visionModifier: -3, attackModifier: 0.85, description: '视野-3, 攻击力-15%, 隐蔽单位更难被发现', color: '#9ca3af' },
  snow: { name: '雪天', icon: '❄️', movementModifier: 1.5, visionModifier: -1, attackModifier: 0.9, description: '移动消耗+50%, 视野-1, 攻击力-10%', color: '#e2e8f0' },
  sandstorm: { name: '沙暴', icon: '💨', movementModifier: 1.4, visionModifier: -2, attackModifier: 0.8, description: '移动消耗+40%, 视野-2, 攻击力-20%, 直升机无法起飞', color: '#d97706' },
};

export const WEATHER_CHANGE_TURNS = 3; // Weather changes every N turns

/** 增援系统 */
export const REINFORCEMENT_INTERVAL = 5; // New reinforcement every N turns
export const REINFORCEMENT_POOL: UnitType[] = ['infantry', 'infantry', 'scout', 'tank', 'ifv', 'sam', 'artillery', 'helicopter', 'mlrs']; // Weighted random pool

/** 地形生成概率权重 */
export const TERRAIN_WEIGHTS: Record<string, number> = {
  plains: 30,
  forest: 18,
  mountain: 8,
  water: 6,
  city: 4,
  road: 12,
  swamp: 4,
  desert: 6,
  fortress: 2,
  bridge: 0, // bridge is placed manually over water
};

/** 英雄系统常量 */
export const HERO_SELECT_ENABLED = true;
export const HERO_REVIVE_ANIMATION_DURATION = 1500;
export const MAX_HEROES_PER_SIDE = 1;

/** 预设地图信息 */
export interface MapTypeOption {
  type: MapType;
  name: string;
  description: string;
  color: string;
  secondaryColor: string;
}

export const MAP_TYPE_OPTIONS: MapTypeOption[] = [
  {
    type: 'random',
    name: '随机地图',
    description: '随机生成地形，每次不同',
    color: '#7cb342',
    secondaryColor: '#2e7d32',
  },
  {
    type: 'mountain-pass',
    name: '山地隘口',
    description: '中央山脊横贯，仅两个隘口可通过，必须争夺通道',
    color: '#78909c',
    secondaryColor: '#546e7a',
  },
  {
    type: 'river-valley',
    name: '河谷突破',
    description: '横贯河流阻断南北，三座桥梁成为必争之地',
    color: '#1565c0',
    secondaryColor: '#0d47a1',
  },
  {
    type: 'urban-warfare',
    name: '城市攻防',
    description: '中央城市群固若金汤，放射道路连接外围',
    color: '#8d6e63',
    secondaryColor: '#5d4037',
  },
  {
    type: 'desert-storm',
    name: '沙漠风暴',
    description: '茫茫沙漠少掩体，中央要塞为战略核心',
    color: '#fdd835',
    secondaryColor: '#f9a825',
  },
  {
    type: 'procedural',
    name: '风蚀地形',
    description: '风蚀沙丘模拟生成，自然河流城市分布',
    color: '#8d6e63',
    secondaryColor: '#a1887f',
  },
];

/** 检查位置是否适合部署（可通行且无单位） */
function isDeployableCell(cells: MapCell[][], pos: Position, unitType: UnitType): boolean {
  if (pos.z < 0 || pos.z >= MAP_HEIGHT || pos.x < 0 || pos.x >= MAP_WIDTH) return false;
  const cell = cells[pos.z][pos.x];
  if (cell.unit !== null) return false;
  const terrainConfig = TERRAIN_CONFIGS[cell.terrain];
  // Helicopters can deploy on any non-water passable terrain
  if (unitType === 'helicopter') {
    return terrainConfig.stats.isPassable || cell.terrain === 'mountain' || cell.terrain === 'swamp';
  }
  if (!terrainConfig.stats.isPassable) return false;
  const isVehicle = UNIT_CONFIGS[unitType]?.isVehicle ?? false;
  if (isVehicle && !terrainConfig.stats.isPassableByVehicle) return false;
  return true;
}

/** 找到最近的可部署位置（从目标位置开始搜索） */
function findNearestDeployable(cells: MapCell[][], targetPos: Position, unitType: UnitType): Position {
  if (isDeployableCell(cells, targetPos, unitType)) return targetPos;

  // BFS搜索最近的可部署位置
  const visited = new Set<string>();
  const queue: Position[] = [targetPos];
  visited.add(`${targetPos.x},${targetPos.z}`);

  while (queue.length > 0) {
    const current = queue.shift()!;
    // v57.0: Fixed 8-directional BFS — game uses Manhattan movement (4 cardinal directions only)
    const dirs = [
      { x: 0, z: -1 }, { x: 0, z: 1 },
      { x: -1, z: 0 }, { x: 1, z: 0 },
    ];
    for (const d of dirs) {
      const next = { x: current.x + d.x, z: current.z + d.z };
      const key = `${next.x},${next.z}`;
      if (visited.has(key)) continue;
      if (next.x < 0 || next.x >= MAP_WIDTH || next.z < 0 || next.z >= MAP_HEIGHT) continue;
      visited.add(key);
      if (isDeployableCell(cells, next, unitType)) return next;
      queue.push(next);
    }
  }

  // 极端情况：返回原位
  return targetPos;
}

/** 根据地图类型调整部署配置，确保所有单位在可通行地形上 */
export function adaptDeployment(
  baseDeploy: DeployConfig[],
  cells: MapCell[][],
  mapType: MapType,
): DeployConfig[] {
  // 对于随机地图，快速检查后直接返回
  if (mapType === 'random') {
    return baseDeploy.map(d => {
      if (isDeployableCell(cells, d.position, d.type)) return d;
      return { ...d, position: findNearestDeployable(cells, d.position, d.type) };
    });
  }

  // 对于预设地图，确保每个部署位置都在可通行地形
  return baseDeploy.map(d => {
    const adjusted = findNearestDeployable(cells, d.position, d.type);
    return { ...d, position: adjusted };
  });
}
