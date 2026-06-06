// ===== 战棋游戏核心类型定义 =====

/** 单位类型 */
export type UnitType = 'tank' | 'ifv' | 'artillery' | 'scout' | 'infantry' | 'sam' | 'engineer' | 'supply' | 'helicopter' | 'mlrs';

/** 地形类型 */
export type TerrainType = 'plains' | 'forest' | 'mountain' | 'water' | 'city' | 'road' | 'swamp' | 'bridge' | 'desert' | 'fortress';

/** 据点类型 */
export type CapturePointType = 'stronghold' | 'bridgehead' | 'supply_base' | 'comm_hub';

/** 阵营 */
export type Faction = 'red' | 'blue';

/** 游戏阶段 */
export type GamePhase = 'heroSelection' | 'deployment' | 'selectUnit' | 'moveUnit' | 'attackUnit' | 'aiTurn' | 'gameOver';

/** 天气类型 */
export type WeatherType = 'clear' | 'rain' | 'fog' | 'snow' | 'sandstorm';

/** 坐标 */
export interface Position {
  x: number;
  z: number;
}

/** 单位属性 */
export interface UnitStats {
  hp: number;
  maxHp: number;
  attack: number;
  defense: number;
  armor: number;              // 装甲值 - 减少受到的伤害
  armorPenetration: number;   // 穿甲值 - 忽略目标装甲
  moveRange: number;
  attackRange: number;
  vision: number;
  ammo?: number;              // 当前弹药数
  maxAmmo?: number;           // 最大弹药数 (undefined = 无限)
  morale?: number;            // 士气值 0-100, 默认 100
}

/** v25.0: 单位行动记录 */
export interface UnitActionRecord {
  turn: number;
  type: 'move' | 'attack' | 'defend' | 'ability' | 'heal' | 'fortify' | 'damage_taken' | 'retreat' | 'stealth' | 'death' | 'deploy';
  description: string;
  value?: number;
  targetName?: string;
  position: { x: number; z: number };
}

/** 单位 */
export interface Unit {
  id: string;
  type: UnitType;
  faction: Faction;
  position: Position;
  stats: UnitStats;
  canMove: boolean;
  canAttack: boolean;
  attackedThisTurn: boolean;
  isAlive: boolean;
  name: string;
  description: string;
  // Stealth fields
  isStealthed: boolean;           // whether unit is currently hidden
  stealthCooldown: number;         // turns remaining before can stealth again
  stealthTurnsRemaining: number;   // turns of stealth remaining
  // Experience & Level system
  level: number;            // current level (1-5)
  xp: number;               // current XP
  xpToNextLevel: number;    // XP needed for next level
  killCount: number;        // total kills
  totalDamageDealt: number; // total damage dealt
  // Hero fields
  isHero: boolean;               // whether this unit is a hero
  heroId: string | null;         // reference to hero template
  abilities: HeroAbility[];      // hero abilities (empty for normal units)
  // Hero temporary buffs (from active abilities)
  tempDefenseBuff?: number;      // temporary defense buff
  tempDefenseBuffTurns?: number; // turns remaining for temp defense buff
  tempDamageBuff?: number;       // temporary damage multiplier buff
  tempDamageBuffTurns?: number;  // turns remaining for temp damage buff
  markedTargets?: string[];      // unit IDs revealed by mark ability
  markedTargetsTurns?: number;   // turns remaining for marks
  // v25.0: Unit action history
  actionHistory: UnitActionRecord[];
}

/** 地形属性 */
export interface TerrainStats {
  moveCost: number;        // 移动消耗
  defenseBonus: number;    // 防御加成
  attackBonus: number;     // 攻击加成
  visionBonus: number;     // 视野加成（站在上面的额外视野）
  visionBlock: number;     // 视野阻挡（穿过时减少的视野值）
  isPassable: boolean;     // 是否可通过
  isPassableByVehicle: boolean; // 车辆是否可通过
  color: string;           // 地形颜色 (hex)
  height: number;          // 地形高度
}

/** 据点（占领点） */
export interface CapturePoint {
  id: string;
  position: Position;
  name: string;  // e.g. "据点A", "桥头堡"
  type: CapturePointType;
  owner: Faction | null;  // null = neutral
  captureProgress: { red: number; blue: number };  // 0-100
  captureThreshold: number;  // default 100 - how much progress needed
  captureRadius: number;  // default 2 - how many cells around can deploy
  providesVision: number;  // how much vision radius it provides to owner
  isDeploymentZone: boolean;  // whether this point allows deployment
}

/** 地图格子 */
export interface MapCell {
  position: Position;
  terrain: TerrainType;
  unit: Unit | null;
  fortified: boolean;
  fortifiedByTurn?: number;
  fortifyDuration?: number; // v79.0: Extended fort duration (default = FORTIFY_DURATION)
  capturePointId: string | null;  // reference to capture point at this cell
  hasMinefield?: boolean;
  minefieldOwner?: Faction;
}

/** 游戏地图 */
export interface GameMap {
  width: number;
  height: number;
  cells: MapCell[][];
}

/** 移动动画状态 */
export interface MovementAnimation {
  unitId: string;
  path: Position[];       // BFS路径（含起点和终点）
  currentStep: number;    // 当前在path中的步数索引
  progress: number;       // 当前步的进度 0-1
  pendingAttack: Position | null;  // 移动完成后自动攻击的目标位置
}

/** 伤害弹窗数据 */
export interface DamagePopup {
  id: number;
  x: number;
  z: number;
  value: number;
  type: 'damage' | 'heal' | 'counter' | 'xp' | 'levelup' | 'resupply' | 'ammo' | 'morale' | 'kill';
  timestamp: number;
}

/** 战斗结果通知 */
export interface CombatToast {
  id: number;
  attackerName: string;
  defenderName: string;
  attackerFaction: Faction;
  damage: number;
  defenderRemainingHp: number;
  counterDamage?: number;
  attackerRemainingHp?: number;
  wasKill: boolean;
  wasCounterKill?: boolean;
  timestamp: number;
  // v76.0: Kill streak tracking
  attackerKillCount?: number;
  // v89.0: Defender unit type for icon display in kill notifications
  defenderType?: UnitType;
}

/** 增援单位 */
export interface ReinforcementUnit {
  type: UnitType;
  deployTurn: number;
}

/** 增援信息 */
export interface ReinforcementInfo {
  reinforcements: ReinforcementUnit[];
  budget: number;
  nextReinforcementTurn: number;
}

/** 游戏状态 */
export interface GameState {
  map: GameMap;
  units: Unit[];
  currentFaction: Faction;
  phase: GamePhase;
  turn: number;
  selectedUnit: Unit | null;
  movablePositions: Position[];
  attackablePositions: Position[];
  movePath: Position[];
  combatLog: CombatLogEntry[];
  winner: Faction | null;
  victoryReason: string | null;
  aiDifficulty: AIDifficulty;
  turnSummaries: TurnSummary[];
  lastTurnSummary: TurnSummary | null;
  previousState: GameState | null;
  hoveredCell: Position | null;
  shakeActive: boolean;
  shakeIntensity: number;
  movementAnimation: MovementAnimation | null;
  isAnimating: boolean;
  damagePopups: DamagePopup[];
  /** v56.0: Timestamp of the last turn start, used to filter per-turn healing popups */
  lastTurnTimestamp?: number;
  combatToasts: CombatToast[];
  // Deployment phase fields
  deployment?: TacticalDeploymentInfo;
  levelUpNotifications: LevelUpNotification[];
  // Capture point fields
  capturePoints: CapturePoint[];
  // Game clock
  gameStartTime: number | null;
  // Battle statistics
  battleStats: BattleStats;
  // Weather system
  currentWeather: WeatherType;
  weatherTurnsRemaining: number;
  // v89.0: Next weather forecast (pre-determined when current weather changes)
  nextWeather: WeatherType;
  // Reinforcement system
  reinforcements: { red: ReinforcementUnit[]; blue: ReinforcementUnit[] };
  reinforcementBudget: { red: number; blue: number };
  // v25.0: AI dynamic difficulty
  aiDynamicDifficulty: AIDynamicDifficulty;
  // v67.0: Kill tracking per turn for streak notifications
  turnKillCounts: { red: number; blue: number };
}

/** Tactical deployment info */
export interface TacticalDeploymentInfo {
  redBudget: number;
  blueBudget: number;
  redBudgetUsed: number;
  blueBudgetUsed: number;
  unitCosts: Record<UnitType, number>;
}

/** Unit deployment costs for tactical mode */
export const TACTICAL_UNIT_COSTS: Record<UnitType, number> = {
  tank: 15,
  ifv: 10,
  artillery: 12,
  scout: 8,
  infantry: 6,
  sam: 10,
  engineer: 8,
  supply: 7,
  helicopter: 14,
  mlrs: 12,
};

/** Deployment budget per side in tactical mode */
export const TACTICAL_DEPLOYMENT_BUDGET = 150;

/** 战斗日志 */
export interface CombatLogEntry {
  turn: number;
  attacker: string;
  defender: string;
  damage: number;
  defenderRemainingHp: number;
  defenderMaxHp?: number; // v68.0: accurate HP bar in combat log
  attackerFaction: Faction;
  counterDamage?: number;
  counterAttackerRemainingHp?: number;
  wasCounterKill?: boolean;
  eventType?: 'attack' | 'counter' | 'destroy' | 'retreat';
  action?: string;
  unitName?: string;
  // v25.0: Click-to-focus support
  attackerPosition?: { x: number; z: number };
  defenderPosition?: { x: number; z: number };
  attackerUnitId?: string;
  defenderUnitId?: string;
}

/** AI 难度 */
export type AIDifficulty = 'easy' | 'normal' | 'hard';

/** v25.0: AI 动态难度调整 */
export interface AIDynamicDifficulty {
  enabled: boolean;
  currentDifficulty: AIDifficulty;
  metrics: {
    playerKillRatio: number;
    playerDamageEfficiency: number;
    turnsElapsed: number;
    lastAdjustTurn: number;
    adjustmentCount: number;
  };
}

/** 预设地图类型 */
export type MapType = 'random' | 'mountain-pass' | 'river-valley' | 'urban-warfare' | 'desert-storm';

/** 回合事件类型 */
export type TurnEventType = 'attack' | 'destroy' | 'counter' | 'counter_destroy' | 'heal' | 'ability' | 'capture' | 'retreat';

/** 回合事件（用于时间线展示） */
export interface TurnEvent {
  type: TurnEventType;
  description: string;
  unitName?: string;
  targetName?: string;
  value?: number;
  unitType?: string;
  targetFaction?: Faction;
}

/** 回合总结 */
export interface TurnSummary {
  turn: number;
  faction: Faction;
  unitsDestroyed: number;
  totalDamageDealt: number;
  totalDamageReceived: number;
  unitsMoved: number;
  unitsLost: number;
  totalHealing: number;
  abilitiesUsed: string[];
  capturesGained: number;
  capturesLost: number;
  events: TurnEvent[];
}

/** 单位类型配置 */
export interface UnitTypeConfig {
  type: UnitType;
  name: string;
  description: string;
  stats: Omit<UnitStats, 'hp' | 'maxHp'>;
  baseHp: number;
  isVehicle: boolean;
  healAmount?: number;  // 补给车治疗量
  healRange?: number;   // 补给车治疗范围
  buildFortify?: boolean; // 工程车修建工事
  canStealth: boolean;       // whether this unit type can enter stealth
  stealthDuration: number;   // max turns of stealth
  stealthCooldownMax: number; // cooldown after stealth ends
  damageType?: 'kinetic' | 'he';  // 伤害类型：动能(穿甲) vs 高爆(溅射)
  maxAmmo?: number;               // 最大弹药数 (undefined = 无限)
  antiAirRange?: number;       // v41.0: Anti-air interception range (SAM)
  antiAirReduction?: number;   // v41.0: Damage reduction to helicopters within AA range
}

/** Level-up stat bonuses per level */
export interface LevelUpBonus {
  attack: number;
  defense: number;
  armor: number;
  armorPenetration: number;
  maxHp: number;       // healed on level up
  vision: number;
  moveRange: number;
  attackRange: number;
}

/** Level-up notification */
export interface LevelUpNotification {
  id: number;
  unitId: string;
  unitName: string;
  faction: Faction;
  oldLevel: number;
  newLevel: number;
  bonus: LevelUpBonus;
  timestamp: number;
}

/** 单阵营战斗统计 */
export interface FactionBattleStats {
  damageDealt: number;
  damageReceived: number;
  unitsDestroyed: number;
  unitsLost: number;
  healingDone: number;
  attacks: number;
  kills: number;
  retreated: number;
  fortsBuilt: number;
}

/** 双方战斗统计 */
export interface BattleStats {
  red: FactionBattleStats;
  blue: FactionBattleStats;
}

/** 默认战斗统计 */
export const DEFAULT_BATTLE_STATS: BattleStats = {
  red: {
    damageDealt: 0,
    damageReceived: 0,
    unitsDestroyed: 0,
    unitsLost: 0,
    healingDone: 0,
    attacks: 0,
    kills: 0,
    retreated: 0,
    fortsBuilt: 0,
  },
  blue: {
    damageDealt: 0,
    damageReceived: 0,
    unitsDestroyed: 0,
    unitsLost: 0,
    healingDone: 0,
    attacks: 0,
    kills: 0,
    retreated: 0,
    fortsBuilt: 0,
  },
};

/** Hero ability type */
export type HeroAbilityType = 'passive' | 'active';

/** Hero ability trigger */
export type HeroAbilityTrigger = 'onAttack' | 'onKill' | 'onTurnStart' | 'onDamaged' | 'onMove' | 'manual';

/** Hero ability */
export interface HeroAbility {
  id: string;
  name: string;
  description: string;
  type: HeroAbilityType;
  trigger: HeroAbilityTrigger;
  cooldown: number;
  currentCooldown: number;
  icon: string;
  effect: HeroAbilityEffect;
}

/** Hero ability effect */
export interface HeroAbilityEffect {
  damageBonus?: number;
  damageMultiplier?: number;
  defenseBonus?: number;
  healOnKill?: number;
  aoeDamage?: number;
  aoeRadius?: number;
  extraMoveRange?: number;
  extraVision?: number;
  armorPenetrationBonus?: number;
  reviveChance?: number;
  counterAttackBonus?: number;
  moraleBoostAura?: number;
  moraleBoostRadius?: number;
  // v41.0: Added missing effect fields used by hero definitions
  attackRangeBonus?: number;
  healAmountBonus?: number;
  healRangeBonus?: number;
  defenseReduction?: number;
  duration?: number;
  durationBonus?: number;
  moraleBoostRadius2?: number;
}

/** 地形类型配置 */
export interface TerrainTypeConfig {
  type: TerrainType;
  name: string;
  nameEn: string;
  stats: TerrainStats;
}

/** 回放动作类型 */
export interface ReplayAction {
  type: 'move' | 'attack' | 'destroy' | 'heal' | 'fortify' | 'heroAbility';
  unitId: string;
  from?: { x: number; z: number };
  to?: { x: number; z: number };
  targetId?: string;
  damage?: number;
  description: string;
}

/** 回放状态 */
export interface ReplayState {
  isReplaying: boolean;
  replayActions: ReplayAction[];
  currentReplayStep: number;
  turnNumber: number;
  faction: Faction;
}

/** 教程步骤 */
export interface TutorialStep {
  id: number;
  title: string;
  description: string;
  highlight?: 'units' | 'terrain' | 'endTurn' | 'moveButton' | 'attackButton' | 'shortcuts';
  trigger: 'gameStart' | 'firstSelect' | 'firstMove' | 'firstAttack' | 'firstEndTurn';
  position: 'center' | 'top' | 'bottom' | 'left' | 'right';
}

/** 存档数据 */
export interface SaveGameData {
  gameState: GameState;
  timestamp: number;
  version: string;
  label?: string;
}

/** 存档元数据 */
export interface SaveMeta {
  slot: string;
  timestamp: number;
  label?: string;
  turn: number;
  faction: Faction;
  redAlive: number;
  blueAlive: number;
}

/** 当前版本号 */
export const SAVE_VERSION = '92.0';

/** 教程步骤配置 */
export const TUTORIAL_STEPS: TutorialStep[] = [
  { id: 0, title: '欢迎来到铁甲战棋！', description: '这是一款三维回合制策略游戏。选择你的单位，移动并攻击敌方部队来赢得胜利。', trigger: 'gameStart', position: 'center' },
  { id: 1, title: '选择单位', description: '点击左侧的红色单位来选中它。选中的单位会显示金色边框和可移动范围。', trigger: 'gameStart', position: 'left' },
  { id: 2, title: '移动单位', description: '绿色高亮区域是可移动范围。点击绿色格子来移动你的单位。', trigger: 'firstSelect', position: 'bottom' },
  { id: 3, title: '攻击敌方', description: '红色高亮区域是可攻击范围。点击敌方单位或按 A 键进入攻击模式，然后选择目标。', trigger: 'firstMove', position: 'bottom' },
  { id: 4, title: '结束回合', description: '完成所有操作后，点击"结束回合"按钮或按 Enter 键。敌方将自动行动。', trigger: 'firstAttack', position: 'top' },
  { id: 5, title: '快捷键提示', description: '按 ? 键查看所有快捷键。M=移动, A=攻击, Enter=结束回合, Esc=取消。', trigger: 'firstEndTurn', position: 'center' },
];
