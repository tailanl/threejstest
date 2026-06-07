# CURRENT_CODE_AUDIT.md

## 1. StrategicSector 当前字段

```ts
interface StrategicSector {
  position: StrategicPosition;  // {x, y}
  terrain: StrategicTerrainType;
  force: StrategicForce | null;
  tacticalMapSeed: number;
  name: string;
  baseTerrain?: StrategicBaseTerrainType;
  features?: StrategicFeatureType[];
  gen?: {
    elevation: number;
    slope: number;
    moisture: number;
    temperature: number;
    cityScore: number;
    roadCost: number;
    supplyValue: number;
    defensiveValue: number;
    chokepointValue: number;
    riverWidth?: number;
    cityRank?: CityRank;
  };
}
```

StrategicTerrainType: plains | forest | mountain | water | city | desert | marshland | highland
StrategicBaseTerrainType: plains | forest | mountain | water | desert | marshland | highland | city
StrategicFeatureType: river | main_road | secondary_road | bridge | city | city_center | capital | port | fortress | airfield | supply_depot | rail

## 2. StrategicForce 当前字段

```ts
interface StrategicForce {
  id: string;
  faction: Faction;
  name: string;
  units: StrategicUnit[];  // {type: UnitType, count: number}[]
  position: StrategicPosition;
  canMove: boolean;
  hasAttacked: boolean;
  isAlive: boolean;
  combatPower: number;
  defensePower: number;
  moveRange: number;
  vision: number;
  templateKey?: string;
}
```

## 3. UnitType / Unit / UnitStats 当前字段

UnitType: tank | ifv | artillery | scout | infantry | sam | engineer | supply | helicopter | mlrs | atgm | uav | command | ew

```ts
interface UnitStats {
  hp: number; maxHp: number;
  attack: number; defense: number;
  armor: number; armorPenetration: number;
  moveRange: number; attackRange: number; vision: number;
  ammo?: number; maxAmmo?: number; morale?: number;
}

interface Unit {
  id: string; type: UnitType; faction: Faction;
  position: Position;  // {x, z} - 注意用 z 不是 y
  stats: UnitStats;
  canMove: boolean; canAttack: boolean; attackedThisTurn: boolean; isAlive: boolean;
  name: string; description: string;
  isStealthed: boolean; stealthCooldown: number; stealthTurnsRemaining: number;
  level: number; xp: number; xpToNextLevel: number;
  killCount: number; totalDamageDealt: number;
  isHero: boolean; heroId?: string;
  abilities: HeroAbility[];
  tempDefenseBuff?: number; tempDefenseBuffTurns?: number;
  tempDamageBuff?: number; tempDamageBuffTurns?: number;
  markedTargets?: string[]; markedTargetsTurns?: number;
  actionHistory: UnitActionRecord[];
}
```

## 4. GameMap / MapCell 当前字段

```ts
interface MapCell {
  position: Position;  // {x, z}
  terrain: TerrainType;  // plains | forest | mountain | water | city | road | swamp | bridge | desert | fortress
  unit: Unit | null;
  fortified: boolean; fortifiedByTurn?: number; fortifyDuration?: number;
  capturePointId: string | null;
  hasMinefield?: boolean; minefieldOwner?: Faction;
  isRoad?: boolean; roadType?: 'main' | 'secondary';
  features?: TacticalFeatureType[];
}

interface GameMap {
  width: number; height: number;
  cells: MapCell[][];
}
```

## 5. strategic-gen 每个文件职责

| 文件 | 职责 |
|------|------|
| gen-context.ts | 生成上下文、共享数据结构、辅助函数 |
| strategic-gen-config.ts | 全部可配置参数及默认值 |
| heightmap.ts | 多倍频Perlin噪声高度图+归一化+世界形状+海平面 |
| slope.ts | 坡度计算 |
| water.ts | 海洋/湖泊分类+小湖清理 |
| moisture.ts | BFS湿度计算 |
| temperature.ts | 纬度+高程温度计算 |
| hydrology.ts | 河流网络生成（源头+最陡下降追踪） |
| terrain-classifier.ts | 多维评分地形分类+平滑 |
| city-score.ts | 城市选址评分 |
| city-placement.ts | 按等级放置城市+绘制城市区域 |
| road-cost.ts | 道路修建成本计算 |
| road-network.ts | 层级道路网络+A*寻路 |
| bridge-placement.ts | 桥梁放置（道路+河流交叉） |
| feature-placement.ts | 扼口/防御值+港口/要塞/机场/补给站 |
| validation.ts | 验证+修复+统计输出 |
| build-strategic-map.ts | 生成上下文→StrategicMap转换 |
| generate-strategic-world.ts | 主编排器（9步管线） |

## 6. tactical-integration.ts 桥接方式

- `mapStrategicTerrainToMapType()`: 战略地形→战术地图类型
- `initTacticalFromStrategic()`: 战略兵力→战术GameState（生成地图+部署单位）
- `convertTacticalResultToStrategic()`: 战术结果→战略损失

问题：战术地图是重新随机生成的，与战略地图数据脱节。

## 7. ai.ts 决策逻辑

- 单位优先级排序：侦察>直升机>IFV>坦克>工兵>步兵>防空>炮兵>火箭炮>补给
- 行动流程：隐身考虑→英雄技能→移动→攻击
- 位置评估：地形+阵型+兵种偏好+攻击范围
- 集火优先级：低血量+高威胁+多人可攻击
- 难度参数：目标选择随机性/移动随机性/跳过攻击概率/偏好低血量/次优移动/考虑反击

## 8. strategic-engine.ts 逻辑

- 战略战斗：战力比模型，±20%随机波动
- AI行动：按兵种优先级排序，评估位置+移动+攻击
- 部署阶段：红方x0-2，蓝方x7-9
- 增援：每6回合一次
- 视野：BFS计算，山地/高地消耗2视野

## 9. UI 战略/战术切换

- 战略→战术：StrategicMap中攻击→BattleChoiceDialog→initTacticalFromStrategic()→game-store
- 战术→战略：GameUI"返回战略模式"按钮→returnToStrategic()→strategic-store
- 数据流：strategic-store ↔ game-store（通过函数调用，非响应式）

## 10. 必须继续兼容的旧函数

- `generateMap()` / `generateProceduralMap()` - 旧战术地图生成
- `initGameState()` - 旧战术游戏初始化
- `initTacticalFromStrategic()` - 旧战略→战术桥接
- `generateStrategicMap()` - 旧战略地图生成
- `aiExecuteTurn()` - 旧AI回合执行
- `attackUnit()` / `moveUnit()` / `endTurn()` - 旧战斗引擎
- `createUnit()` - 旧单位创建
