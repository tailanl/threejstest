# REFACTOR_README：现代指挥部式战略-战役-战术一体化战棋系统

## 0. 给 Codex / 本地 AI 的总目标

你正在重构一个已有的 TypeScript / Next.js / Three.js 战棋项目。

仓库已有基础：

```txt
src/game/
  strategic-gen/
    bridge-placement.ts
    build-strategic-map.ts
    city-placement.ts
    city-score.ts
    feature-placement.ts
    gen-context.ts
    generate-strategic-world.ts
    heightmap.ts
    hydrology.ts
    moisture.ts
    road-cost.ts
    road-network.ts
    slope.ts
    strategic-gen-config.ts
    temperature.ts
    terrain-classifier.ts
    validation.ts
    water.ts

  strategic-map.ts
  strategic-types.ts
  strategic-engine.ts
  tactical-integration.ts
  procedural-map.ts
  map.ts
  types.ts
  ai.ts
  engine.ts
```

当前代码已经具备：

```txt
1. 战略地图类型 StrategicMap / StrategicSector。
2. 战略地图生成入口 strategic-map.ts。
3. strategic-gen 目录，已经拆出地形、水系、城市、道路、桥梁、校验等模块。
4. 战略到战术的旧桥接 tactical-integration.ts。
5. 传统战术地图 map.ts / procedural-map.ts。
6. 基础 AI ai.ts 和战斗 engine.ts。
7. UnitType 已经包含现代战斗相关单位：tank, ifv, artillery, scout, infantry, sam, engineer, supply, helicopter, mlrs, atgm, uav, command, ew。
```

本次重构目标：

```txt
构建一个“玩家作为指挥部、AI 作为下级指挥官”的现代战棋系统。

玩家：
  - 看战略图和战役图
  - 看 AI 报告
  - 给 AI 下命令
  - 把部队交给 AI
  - 设置自主权、风险、损失上限
  - 批准或否决 AI 计划

AI：
  - 解析玩家命令
  - 规划战略行动
  - 在战役图里调度部队
  - 在战术战棋里实际操作棋子
  - 生成战报、情报报告、毁伤评估、补给报告
```

最终项目应接近：

```txt
Broken Arrow / WARNO / Wargame: Red Dragon 的现代联合兵种逻辑
+
战役级地图规划
+
玩家指挥部式交互
+
AI 自主执行和报告
```

注意：

```txt
不要复制这些游戏。
只参考其现代战斗机制：
侦察、视野、压制、士气、补给、装甲、火力支援、防空、工程、电子战、联合兵种、战术 AI。
```

---

# 1. 核心设计原则

## 1.1 不再生成三套互相独立的地图

禁止：

```txt
战略图随机生成一次
战役图再随机生成一次
战术图再随机生成一次
```

必须改成：

```txt
WorldAtlas 世界索引层
  ↓
RegionTile 高精度母地图区域
  ↓
StrategicChunk 战略分块
  ↓
OperationView 战役视图
  ↓
CombatViewport 战术战斗视口
```

关系：

```txt
StrategicChunk = RegionTile 的汇总
OperationView = RegionTile 的大范围裁剪
CombatViewport = RegionTile 的小范围裁剪
GameMap = CombatViewport 转成旧战斗系统可用的地图
```

战术图不能与战役图脱节。

---

## 1.2 1024×1024 不是整个世界

`1024×1024` 应该作为一个局部高精度区域：

```txt
RegionTile = 1024×1024
```

更大的世界应由多个 RegionTile 组成：

```txt
WorldAtlas 虚拟大小：8192×8192
RegionGrid：8×8
每个 RegionTile：1024×1024
```

但是不能一次性展开所有 8×8 个 RegionTile 的 cells。

必须：

```txt
MacroMap 低精度全局常驻
RegionTile 按需生成
只缓存当前 region 和周边 region
```

---

## 1.3 复用已有 strategic-gen

当前 `src/game/strategic-gen/` 已经有较完整的程序化生成模块。不要废弃。

应把它升级为：

```txt
RegionTile 生成器的基础算法库
```

可以复用：

```txt
heightmap.ts
slope.ts
water.ts
hydrology.ts
moisture.ts
temperature.ts
terrain-classifier.ts
city-score.ts
city-placement.ts
road-cost.ts
road-network.ts
bridge-placement.ts
feature-placement.ts
validation.ts
```

但要把生成对象从：

```txt
64×48 StrategicMap
```

扩展为：

```txt
1024×1024 RegionTile
```

并且用 `globalX/globalY` 采样噪声，保证相邻 region 连续。

---

## 1.4 保留旧系统作为 fallback

不要删除：

```txt
src/game/map.ts
src/game/procedural-map.ts
src/game/strategic-map.ts
src/game/tactical-integration.ts
```

新增一个开关：

```ts
export const USE_WORLD_ATLAS_SYSTEM = true;
```

当 true：

```txt
战略图来自 WorldAtlas / RegionTile / StrategicChunk
战役图来自 OperationView
战术图来自 CombatViewport
```

当 false：

```txt
继续使用旧 strategic-map.ts + tactical-integration.ts + map.ts
```

---

# 2. 当前代码必须先审计

Codex 执行前必须先完成审计，不要直接大改。

新增文件：

```txt
docs/CURRENT_CODE_AUDIT.md
```

内容必须包括：

```txt
1. StrategicSector 当前字段。
2. StrategicForce 当前字段。
3. UnitType / Unit / UnitStats 当前字段。
4. GameMap / MapCell 当前字段。
5. strategic-gen 每个文件现在负责什么。
6. tactical-integration.ts 当前如何从战略切到战术。
7. ai.ts 当前 AI 的决策逻辑。
8. strategic-engine.ts 当前战略 AI / 战略战斗逻辑。
9. 当前 UI 中战略图和战术图如何切换。
10. 哪些旧函数必须继续兼容。
```

审计后再继续 Phase 1。

---

# 3. 新增目录结构

新增：

```txt
src/game/world-atlas/
  atlas-types.ts
  atlas-config.ts
  coordinates.ts
  macro-map-generator.ts
  macro-terrain.ts
  macro-climate.ts
  macro-hydrology.ts
  macro-settlements.ts
  macro-roads.ts
  region-tile-generator.ts
  region-cache.ts
  region-stitching.ts
  atlas-validation.ts
  atlas-debug.ts

src/game/world-map/
  world-cell-types.ts
  world-map-types.ts
  world-map-terrain.ts
  world-map-rivers.ts
  world-map-cities.ts
  world-map-roads.ts
  world-map-features.ts
  world-map-validation.ts
  world-map-debug.ts

src/game/world-view/
  strategic-chunks.ts
  strategic-map-adapter.ts
  operation-view.ts
  combat-viewport.ts
  world-to-game-map.ts

src/game/command/
  command-types.ts
  command-parser.ts
  command-validation.ts
  command-engine.ts
  delegation.ts

src/game/ai-command/
  commander-types.ts
  hq-staff-ai.ts
  theater-commander-ai.ts
  operation-commander-ai.ts
  tactical-commander-ai.ts
  ai-plan-types.ts
  ai-planner.ts
  ai-executor.ts
  ai-memory.ts

src/game/reports/
  report-types.ts
  battle-log-types.ts
  battle-log-analyzer.ts
  intel-estimator.ts
  report-generator.ts
  report-templates.ts

src/game/combat-modern/
  modern-unit-types.ts
  weapon-types.ts
  sensor-model.ts
  line-of-sight.ts
  armor-model.ts
  suppression.ts
  morale.ts
  logistics.ts
  damage-model.ts
  terrain-effects.ts
  combat-resolution.ts
```

UI 新增：

```txt
src/components/game/StrategicCommandPanel.tsx
src/components/game/OperationViewPanel.tsx
src/components/game/AIReportPanel.tsx
src/components/game/ForceDelegationPanel.tsx
src/components/game/CommandInputPanel.tsx
src/components/game/WorldDebugPanel.tsx
```

---

# 4. 地图系统详细设计

## 4.1 坐标系统

新增：

```txt
src/game/world-atlas/coordinates.ts
```

```ts
export interface WorldPosition {
  globalX: number;
  globalY: number;
}

export interface RegionPosition {
  regionX: number;
  regionY: number;
  localX: number;
  localY: number;
}

export function globalToRegion(
  pos: WorldPosition,
  regionSize: number
): RegionPosition {
  return {
    regionX: Math.floor(pos.globalX / regionSize),
    regionY: Math.floor(pos.globalY / regionSize),
    localX: ((pos.globalX % regionSize) + regionSize) % regionSize,
    localY: ((pos.globalY % regionSize) + regionSize) % regionSize,
  };
}

export function regionToGlobal(params: {
  regionX: number;
  regionY: number;
  localX: number;
  localY: number;
  regionSize: number;
}): WorldPosition {
  return {
    globalX: params.regionX * params.regionSize + params.localX,
    globalY: params.regionY * params.regionSize + params.localY,
  };
}
```

所有 RegionTile 生成都必须用 `globalX/globalY`，不能只用 `localX/localY`。

---

## 4.2 WorldAtlas 类型

文件：

```txt
src/game/world-atlas/atlas-types.ts
```

```ts
export interface WorldAtlas {
  id: string;
  seed: number;

  virtualWidth: number;
  virtualHeight: number;

  regionSize: number;
  regionGridWidth: number;
  regionGridHeight: number;

  macroWidth: number;
  macroHeight: number;

  macroCells: MacroCell[][];

  regionIndex: Record<string, RegionTileMeta>;

  politicalRegions: PoliticalRegion[];
  economicZones: EconomicZone[];
  humanGeographyZones: HumanGeographyZone[];

  generatedRegionIds: string[];
}

export interface RegionTileMeta {
  id: string;
  regionX: number;
  regionY: number;

  worldRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  macroRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  generated: boolean;
  cached: boolean;
}
```

---

## 4.3 MacroCell 类型

```ts
export interface MacroCell {
  x: number;
  y: number;

  elevation: number;
  slope: number;
  moisture: number;
  temperature: number;

  biome:
    | 'ocean'
    | 'coast'
    | 'plains'
    | 'forest'
    | 'mountain'
    | 'desert'
    | 'marshland'
    | 'highland'
    | 'urban_corridor';

  continentId?: string;
  basinId?: string;
  climateZoneId?: string;

  hasMajorRiver: boolean;
  hasMountainRange: boolean;

  settlementPotential: number;
  roadCorridorPotential: number;
  economicValue: number;
  populationPotential: number;
  politicalValue: number;
}
```

MacroMap 负责大逻辑：

```txt
大陆 / 海洋
山脉带
河流流域
气候带
人口潜力
经济中心
道路走廊
政治区域
战略要地
```

---

## 4.4 政治经济人文地理类型

```ts
export type FactionId = 'red' | 'blue' | 'neutral' | string;

export interface PoliticalRegion {
  id: string;
  name: string;
  factionId: FactionId;

  capitalCityId?: string;

  macroCells: Array<{ x: number; y: number }>;

  stability: number;
  mobilizationLevel: number;
  infrastructureControl: number;
}

export interface EconomicZone {
  id: string;
  name: string;

  type:
    | 'industrial'
    | 'agricultural'
    | 'port'
    | 'mining'
    | 'administrative'
    | 'logistics'
    | 'energy';

  center: WorldPosition;
  radius: number;

  outputValue: number;
  supplyValue: number;
  victoryPointValue: number;
}

export interface HumanGeographyZone {
  id: string;
  name: string;

  center: WorldPosition;
  radius: number;

  populationDensity: number;
  urbanization: number;
  roadDensity: number;
  railDensity: number;
}
```

这些数据用于：

```txt
1. 城市分布。
2. 道路走廊。
3. 补给线。
4. 战略目标。
5. AI 计划。
6. AI 报告。
7. 胜利点。
```

---

## 4.5 WorldCell 类型

文件：

```txt
src/game/world-map/world-cell-types.ts
```

```ts
export type WorldTerrainType =
  | 'plains'
  | 'forest'
  | 'mountain'
  | 'water'
  | 'desert'
  | 'marshland'
  | 'highland'
  | 'city';

export type WorldFeatureType =
  | 'river'
  | 'stream'
  | 'main_road'
  | 'secondary_road'
  | 'bridge'
  | 'rail'
  | 'city_center'
  | 'urban_block'
  | 'suburb'
  | 'industrial'
  | 'port'
  | 'airport'
  | 'airfield'
  | 'fortress'
  | 'supply_depot'
  | 'checkpoint'
  | 'power_plant'
  | 'factory'
  | 'admin_center';

export interface WorldCell {
  globalX: number;
  globalY: number;

  regionX: number;
  regionY: number;
  localX: number;
  localY: number;

  baseTerrain: WorldTerrainType;
  features: WorldFeatureType[];

  elevation: number;
  slope: number;
  moisture: number;
  temperature: number;

  populationDensity: number;
  economicValue: number;
  infrastructureValue: number;

  movementCost: number;
  defenseBonus: number;
  concealment: number;
  cover: number;
  visionBlock: number;

  owner?: FactionId;
  unitIds?: string[];
}
```

---

## 4.6 RegionTile 类型

文件：

```txt
src/game/world-map/world-map-types.ts
```

```ts
export interface RegionTile {
  id: string;
  atlasId: string;

  regionX: number;
  regionY: number;

  worldOrigin: WorldPosition;

  width: number;
  height: number;

  cells: WorldCell[][];

  strategicChunks: StrategicChunk[][];

  cities: GeneratedCity[];
  roads: GeneratedRoad[];
  rivers: GeneratedRiver[];

  politicalRegionIds: string[];
  economicZoneIds: string[];
  humanGeographyZoneIds: string[];
}

export type WorldCityRank = 'capital' | 'major' | 'regional' | 'town';

export interface GeneratedCity {
  id: string;
  name: string;

  rank: WorldCityRank;

  center: WorldPosition;
  radius: number;

  bounds: {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
  };

  populationScore: number;
  supplyValue: number;
  victoryPointValue: number;

  politicalRegionId?: string;
  economicZoneIds: string[];

  chunkIds: string[];
}

export interface GeneratedRoad {
  id: string;

  type: 'main' | 'secondary' | 'military' | 'rail';

  fromId?: string;
  toId?: string;

  path: WorldPosition[];
}

export interface GeneratedRiver {
  id: string;

  type: 'main' | 'tributary' | 'stream';

  path: WorldPosition[];

  widthByIndex: number[];

  basinId?: string;
}
```

---

## 4.7 配置

文件：

```txt
src/game/world-atlas/atlas-config.ts
```

```ts
export interface WorldAtlasConfig {
  seed: number;

  virtualWidth: number;
  virtualHeight: number;

  macroWidth: number;
  macroHeight: number;

  regionSize: number;
  regionGridWidth: number;
  regionGridHeight: number;

  strategicChunkSize: number;

  terrain: {
    seaRatio: number;
    desertMaxRatio: number;
    forestTargetRatio: number;
    mountainTargetRatio: number;
    waterTargetRatio: number;
  };

  rivers: {
    mainRiverCount: number;
    tributaryCount: number;
  };

  settlements: {
    capitalCount: number;
    majorCityCount: number;
    regionalCityCount: number;
    townCount: number;

    capitalRadius: [number, number];
    majorRadius: [number, number];
    regionalRadius: [number, number];
    townRadius: [number, number];
  };

  roads: {
    extraRoadRatio: number;
    generateRail: boolean;
  };

  politics: {
    politicalRegionCount: number;
    contestedBorderRatio: number;
  };

  economy: {
    industrialZoneCount: number;
    portZoneCount: number;
    logisticsHubCount: number;
    energyZoneCount: number;
  };
}
```

默认：

```ts
export const DEFAULT_WORLD_ATLAS_CONFIG: WorldAtlasConfig = {
  seed: 20260606,

  virtualWidth: 8192,
  virtualHeight: 8192,

  macroWidth: 256,
  macroHeight: 256,

  regionSize: 1024,
  regionGridWidth: 8,
  regionGridHeight: 8,

  strategicChunkSize: 32,

  terrain: {
    seaRatio: 0.12,
    desertMaxRatio: 0.04,
    forestTargetRatio: 0.25,
    mountainTargetRatio: 0.18,
    waterTargetRatio: 0.12,
  },

  rivers: {
    mainRiverCount: 12,
    tributaryCount: 36,
  },

  settlements: {
    capitalCount: 2,
    majorCityCount: 12,
    regionalCityCount: 36,
    townCount: 120,

    capitalRadius: [40, 70],
    majorRadius: [25, 45],
    regionalRadius: [12, 25],
    townRadius: [5, 12],
  },

  roads: {
    extraRoadRatio: 0.25,
    generateRail: false,
  },

  politics: {
    politicalRegionCount: 6,
    contestedBorderRatio: 0.18,
  },

  economy: {
    industrialZoneCount: 10,
    portZoneCount: 6,
    logisticsHubCount: 14,
    energyZoneCount: 8,
  },
};
```

---

# 5. 地图生成实现细节

## 5.1 生成顺序

```txt
1. generateWorldAtlas(config)
2. generateMacroTerrain()
3. generateMacroClimate()
4. generateMacroHydrology()
5. generatePoliticalRegions()
6. generateEconomicZones()
7. generateHumanGeographyZones()
8. generateMacroSettlements()
9. generateMacroRoadCorridors()
10. generateRegionTile(atlas, regionX, regionY)
11. buildStrategicChunks(regionTile)
12. buildStrategicMapFromRegionTile(regionTile)
13. getOperationView(regionTile, center, width, height)
14. getCombatViewport(regionTile, center, width, height)
15. convertCombatViewportToGameMap(viewport)
```

---

## 5.2 RegionTile 生成规则

RegionTile 必须：

```txt
1. 用 globalX/globalY 采样噪声。
2. 从 MacroMap 读取宏观地形、气候、流域、城市潜力、经济潜力。
3. 使用 padding 生成边界，避免相邻 region 断裂。
4. 根据宏观城市和道路走廊画城市和道路。
5. 根据宏观流域画河流。
6. 根据宏观政治经济层写入 owner / economicValue / populationDensity。
```

内部计算尺寸：

```txt
正式区域：1024×1024
padding：16
内部计算：1056×1056
```

最后只保留中心 1024×1024。

---

## 5.3 城市必须是大面积

城市直接画在 WorldCell 上，不是 StrategicChunk 上。

半径：

```txt
capital: 40-70
major: 25-45
regional: 12-25
town: 5-12
```

城市结构：

```txt
city_center
urban_block
suburb
industrial
admin_center
main_road
secondary_road
supply_depot
airport / airfield
factory / power_plant
```

验收：

```txt
capital >= 3000 city cells
major average >= 1000 city cells
regional average >= 250 city cells
town average >= 60 city cells
```

---

## 5.4 道路

道路不是 terrain，是 feature。

```txt
city cell + main_road feature 合法。
不要把 city 改成 road。
```

道路网络：

```txt
capital -> major
major -> major MST
regional -> nearest major
town -> nearest regional/major
economic zones -> nearest city
airfield / supply depot -> nearest road
```

道路 A* 代价：

```txt
city: 0.5
plains: 1
highland: 3
forest: 4
desert: 5
marshland: 8
mountain: 12
water: 999
existing road: 0.5
```

---

## 5.5 河流和桥梁

河流来自 MacroHydrology，不要每个 Region 随机生成。

桥梁：

```txt
bridge only if road && river
```

校验：

```txt
invalidBridgeCount 必须为 0
```

---

# 6. StrategicChunk / 战略图

文件：

```txt
src/game/world-view/strategic-chunks.ts
```

```ts
export interface StrategicChunk {
  id: string;

  regionX: number;
  regionY: number;

  chunkX: number;
  chunkY: number;

  worldRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  dominantTerrain: WorldTerrainType;
  terrainMix: Record<WorldTerrainType, number>;

  features: {
    hasCity: boolean;
    hasCapital: boolean;
    hasRiver: boolean;
    hasMainRoad: boolean;
    hasBridge: boolean;
    hasFortress: boolean;
    hasAirfield: boolean;
    hasSupplyDepot: boolean;
    hasEconomicTarget: boolean;
  };

  cityIds: string[];

  strategicValue: {
    supply: number;
    defense: number;
    movement: number;
    chokepoint: number;
    victoryPoint: number;
    economic: number;
    political: number;
  };

  control: 'red' | 'blue' | 'neutral' | 'contested';
  knownByPlayer: boolean;
}
```

`buildStrategicChunks(regionTile)`：

```txt
每 32×32 WorldCell 汇总成 1 个 StrategicChunk。
```

然后用：

```txt
src/game/world-view/strategic-map-adapter.ts
```

把 StrategicChunk 转成旧的 StrategicMap / StrategicSector。

---

# 7. OperationView / 战役图

文件：

```txt
src/game/world-view/operation-view.ts
```

```ts
export interface OperationView {
  id: string;

  worldRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  cells: WorldCell[][];

  involvedChunks: StrategicChunk[];

  objectives: OperationObjective[];

  knownEnemyForces: EnemyEstimate[];

  friendlyForces: ForceMarker[];

  supplyLines: SupplyLine[];

  aiPlans: OperationPlan[];

  scale: 'operation';
}
```

推荐尺寸：

```txt
城市战：256×256
普通推进：128×128
桥梁战：128×128
大规模会战：256×256 或多个 OperationView
```

OperationView 不是新地图，只是 RegionTile 裁剪。

---

# 8. CombatViewport / 战术图

文件：

```txt
src/game/world-view/combat-viewport.ts
```

```ts
export interface CombatViewport {
  id: string;

  worldRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  cells: WorldCell[][];

  center: WorldPosition;

  battleType:
    | 'meeting_engagement'
    | 'urban_assault'
    | 'bridge_crossing'
    | 'hill_assault'
    | 'forest_fight'
    | 'road_ambush'
    | 'fortress_assault'
    | 'open_field'
    | 'convoy_interdiction'
    | 'air_defense_suppression';

  attackerDirection: 'north' | 'south' | 'east' | 'west';

  scale: 'combat';
}
```

第一版：

```txt
64×48
```

然后：

```txt
convertCombatViewportToGameMap(viewport)
```

转成旧战斗系统可用的 GameMap。

禁止进入战术战斗时重新调用 random tactical map。

---

# 9. 现代战斗系统

当前 `UnitType` 已经包含：

```txt
tank
ifv
artillery
scout
infantry
sam
engineer
supply
helicopter
mlrs
atgm
uav
command
ew
```

继续复用，不要换掉。

新增现代战斗字段：

```ts
export interface ModernCombatStats {
  morale: number;
  suppression: number;
  cohesion: number;

  fuel: number;
  maxFuel: number;

  ammo: Record<string, number>;

  sensorProfile: SensorProfile;
  armorProfile: ArmorProfile;
  weaponProfiles: WeaponProfile[];

  logisticsState: {
    needsAmmo: boolean;
    needsFuel: boolean;
    needsRepair: boolean;
  };
}
```

不要一次性重写 Unit，可以：

```ts
modern?: ModernCombatStats;
```

添加到现有 Unit 上，保持兼容。

---

## 9.1 侦察和视野

新增：

```txt
src/game/combat-modern/sensor-model.ts
src/game/combat-modern/line-of-sight.ts
```

实现：

```txt
视线
传感器范围
隐蔽值
城市 / 森林遮蔽
高地视野加成
开火暴露
UAV 侦察
```

AI 只能攻击：

```txt
confirmed enemy
或
area target / suspected enemy
```

不能全知。

---

## 9.2 压制

新增：

```txt
suppression.ts
```

攻击不只扣血，还产生：

```txt
suppression
morale damage
cohesion loss
pinned / stunned 状态
```

---

## 9.3 装甲和穿深

新增：

```txt
armor-model.ts
```

简化模型：

```txt
front armor
side armor
rear armor
top armor

weapon penetration
range modifier
side modifier
```

结果：

```txt
no penetration
partial damage
mobility kill
weapon disabled
destroyed
catastrophic kill
```

---

## 9.4 补给

新增：

```txt
logistics.ts
```

实现：

```txt
ammo
fuel
repair
supply truck
supply depot
supply route
```

无弹药：

```txt
不能开火或只能副武器
```

无燃料：

```txt
不能移动
```

---

# 10. 命令系统

新增：

```txt
src/game/command/
```

核心：

```ts
export interface HQOrder {
  id: string;
  issuedTurn: number;
  issuer: 'player';

  assignedForceIds: string[];

  intent:
    | 'attack'
    | 'defend'
    | 'recon'
    | 'screen'
    | 'delay'
    | 'withdraw'
    | 'support'
    | 'hold'
    | 'capture'
    | 'interdict';

  target: {
    type: 'chunk' | 'city' | 'bridge' | 'road' | 'area' | 'enemy_force';
    id?: string;
    worldPosition?: WorldPosition;
    radius?: number;
  };

  constraints: {
    maxLossRatio?: number;
    maxFuelUseRatio?: number;
    avoidUrbanCombat?: boolean;
    avoidCivilianArea?: boolean;
    mustHoldSupplyLine?: boolean;
    timeLimitTurns?: number;
    preserveUnitCategories?: UnitType[];
  };

  rulesOfEngagement:
    | 'hold_fire'
    | 'avoid_contact'
    | 'engage_if_advantage'
    | 'engage_freely'
    | 'breakthrough';

  riskTolerance: 'low' | 'medium' | 'high';

  autonomy: 'strict' | 'normal' | 'high';

  text: string;
}
```

第一版可以不用 LLM，先用规则解析：

```txt
包含“侦察” → recon
包含“防守/固守” → defend
包含“进攻/夺取/占领” → attack/capture
包含“撤退/后撤” → withdraw
包含“支援/炮兵” → support
```

---

# 11. 指挥权委托

```ts
export interface ForceCommandState {
  forceId: string;

  controller:
    | 'player_direct'
    | 'ai_delegated'
    | 'enemy_ai';

  commanderId?: string;

  currentOrderIds: string[];

  autonomy: 'strict' | 'normal' | 'high';

  reportLevel: 'summary' | 'normal' | 'detailed';

  riskTolerance: 'low' | 'medium' | 'high';
}
```

扩展 StrategicForce：

```ts
command?: ForceCommandState;
```

不要破坏旧字段。

---

# 12. AI 指挥链

新增：

```txt
src/game/ai-command/
```

分层：

```txt
HQStaffAI
TheaterCommanderAI
OperationCommanderAI
TacticalCommanderAI
ReportAI
```

## 12.1 HQStaffAI

负责：

```txt
解析玩家命令
生成 HQOrder
确认命令
发现命令冲突
向玩家请求澄清
```

## 12.2 TheaterCommanderAI

负责：

```txt
战略方向
大范围路线
补给优先级
多部队协同
战役目标分配
```

## 12.3 OperationCommanderAI

负责：

```txt
战役视图内路线规划
侦察路线
炮兵支援
防空保护
工程兵过桥
进入战术接敌点
```

## 12.4 TacticalCommanderAI

负责：

```txt
实际操作棋子
移动
射击
占领掩体
撤退
补给
压制
包抄
烟幕
```

AI 不允许：

```txt
知道隐藏敌人
无视弹药燃料
把补给车当坦克
步兵在开阔地冲坦克
坦克直接冲城区不侦察
```

---

# 13. AI 对战逻辑

## 13.1 每个 AI 回合流程

```txt
1. 更新可见敌情。
2. 读取当前命令。
3. 检查部队状态：损失、弹药、燃料、压制、士气。
4. 判断是否需要请求玩家授权。
5. 生成候选行动。
6. 过滤非法行动。
7. 根据任务、风险、地形、敌情评分。
8. 执行最高分行动。
9. 记录 BattleLogEvent。
10. 更新报告摘要。
```

## 13.2 行动评分

示例：

```ts
score =
  objectiveProgress * 40
  + survivalScore * 25
  + terrainAdvantage * 15
  + fireSuperiority * 15
  + supplySafety * 10
  - exposureRisk * 25
  - lossRisk * 30
  - fuelRisk * 10
```

根据 `riskTolerance` 调整：

```txt
low: 更重视 survival / supply
medium: 平衡
high: 更重视 objectiveProgress
```

---

# 14. AI 报告系统

新增：

```txt
src/game/reports/
```

## 14.1 BattleLogEvent

```ts
export interface BattleLogEvent {
  id: string;
  turn: number;
  time: number;

  type:
    | 'unit_spotted'
    | 'unit_lost'
    | 'unit_damaged'
    | 'shot_fired'
    | 'artillery_strike'
    | 'airstrike'
    | 'suppression_applied'
    | 'morale_changed'
    | 'objective_captured'
    | 'supply_used'
    | 'resupply_completed'
    | 'order_received'
    | 'order_completed'
    | 'order_failed'
    | 'request_authorization';

  actorUnitId?: string;
  targetUnitId?: string;
  position?: WorldPosition;

  confirmedByPlayer: boolean;
  visibilityConfidence: 'confirmed' | 'estimated' | 'unknown';

  message: string;
}
```

---

## 14.2 AIReport

```ts
export type ReportType =
  | 'SITREP'
  | 'INTREP'
  | 'BDA'
  | 'LOGREP'
  | 'REQUEST'
  | 'WARNING'
  | 'ORDER_CONFIRMATION'
  | 'AFTER_ACTION';

export interface AIReport {
  id: string;
  turn: number;
  timestamp: number;

  type: ReportType;

  fromCommanderId: string;

  relatedOrderIds: string[];
  relatedForceIds: string[];

  relatedWorldArea?: {
    center: WorldPosition;
    radius: number;
  };

  title: string;
  summary: string;

  facts: string[];
  estimates: string[];

  losses: {
    friendlyConfirmed: UnitLossSummary;
    enemyConfirmed: UnitLossSummary;
    enemyEstimated: UnitLossSummary;
  };

  supply: {
    ammoState: 'good' | 'limited' | 'critical';
    fuelState: 'good' | 'limited' | 'critical';
    repairState: 'good' | 'limited' | 'critical';
  };

  recommendations: Array<{
    text: string;
    suggestedOrder?: Partial<HQOrder>;
    urgency: 'low' | 'medium' | 'high' | 'critical';
  }>;

  confidence: 'low' | 'medium' | 'high';

  rawLogIds: string[];
}
```

报告必须区分：

```txt
facts = 已确认
estimates = 估计
```

禁止报告凭空编造。

---

# 15. UI 需求

新增面板：

```txt
StrategicCommandPanel
OperationViewPanel
AIReportPanel
ForceDelegationPanel
CommandInputPanel
WorldDebugPanel
```

## 15.1 玩家主流程

```txt
1. 看战略地图。
2. 点选一个 StrategicChunk / 城市 / 桥梁 / 机场。
3. 打开 OperationView。
4. 选择己方部队。
5. 点击“交给 AI”。
6. 输入命令。
7. 设置自主权、风险、损失上限。
8. AI 执行。
9. 玩家看报告。
10. 玩家批准、修改或撤销命令。
```

---

# 16. Codex 执行指令

下面是直接给 Codex 的指令。

```txt
你正在重构 tailanl/threejstest 项目。

必须先阅读以下文件：
- src/game/strategic-types.ts
- src/game/types.ts
- src/game/strategic-map.ts
- src/game/strategic-gen/*
- src/game/tactical-integration.ts
- src/game/ai.ts
- src/game/engine.ts
- src/game/map.ts
- src/components/game/*

第一步：
生成 docs/CURRENT_CODE_AUDIT.md。
审计现有地图、AI、战斗、UI 的结构。
不要改代码。

第二步：
新增 WorldAtlas / RegionTile / StrategicChunk / OperationView / CombatViewport 类型。
只新增类型和配置，不接 UI。
确保 npm run build 或 npm run lint 通过。

第三步：
实现 RegionTile 生成器。
复用 src/game/strategic-gen 里的高度图、水系、城市、道路、桥梁、校验设计。
但生成目标改为 1024×1024 RegionTile。
必须用 globalX/globalY 采样噪声。
不要只用 localX/localY。

第四步：
实现 buildStrategicChunks(regionTile)。
每 32×32 WorldCell 汇总成一个 StrategicChunk。
实现 buildStrategicMapFromRegionTile(regionTile)，兼容旧 StrategicMap。

第五步：
实现 getOperationView 和 getCombatViewport。
它们只能裁剪 RegionTile，不能重新随机生成地图。

第六步：
实现 convertCombatViewportToGameMap。
让旧战术系统能使用 CombatViewport 转出来的 GameMap。
保留旧 map.ts 作为 fallback。

第七步：
实现 command 模块：
- HQOrder
- command parser
- command validation
- ForceCommandState
- delegation

第八步：
实现 AI command 模块：
- HQStaffAI
- TheaterCommanderAI
- OperationCommanderAI
- TacticalCommanderAI
先做规则 AI，不要接外部 LLM。
AI 必须遵守视野、补给、损失限制、风险设置。

第九步：
实现 reports 模块：
- BattleLogEvent
- AIReport
- SITREP
- INTREP
- BDA
- LOGREP
报告必须来自 battle log。
必须区分 facts 和 estimates。

第十步：
实现 modern combat 基础：
- sensor / LOS
- suppression
- morale
- ammo / fuel
- armor penetration
- logistics
使用可选字段扩展现有 Unit，不要破坏旧 Unit。

第十一步：
接 UI：
- AIReportPanel
- CommandInputPanel
- ForceDelegationPanel
- OperationViewPanel
- StrategicCommandPanel

禁止事项：
1. 不要删除旧 map.ts / procedural-map.ts。
2. 不要让战术图重新随机。
3. 不要一次性重写整个 UI。
4. 不要接真实地图。
5. 不要引入大型依赖。
6. 不要让 AI 全知隐藏敌人。
7. 不要让报告凭空编造。
8. 不要只改颜色假装完成。

每个阶段完成后必须输出：
- 修改文件列表
- 新增文件列表
- 当前通过的测试或构建命令
- 未完成项
- 失败原因
```

---

# 17. 分阶段验收标准

## Phase 0：审计

必须生成：

```txt
docs/CURRENT_CODE_AUDIT.md
```

## Phase 1：类型

```txt
WorldAtlas 类型存在
RegionTile 类型存在
StrategicChunk 类型存在
OperationView 类型存在
CombatViewport 类型存在
npm run build 或 npm run lint 通过
```

## Phase 2：地图

```txt
RegionTile 能生成 1024×1024
城市是大面积
道路连续
河流连续
桥梁合法
StrategicChunk 来自 RegionTile
```

## Phase 3：视图

```txt
OperationView 来自 RegionTile 裁剪
CombatViewport 来自 RegionTile 裁剪
GameMap 来自 CombatViewport 转换
不随机生成无关战术图
```

## Phase 4：AI 命令

```txt
玩家可把部队交给 AI
玩家可输入命令
AI 能生成 HQOrder
AI 能执行 attack / defend / recon / withdraw / support
```

## Phase 5：报告

```txt
AI 生成 SITREP
AI 生成 INTREP
AI 生成 BDA
AI 生成 LOGREP
报告来自 battle log
facts 和 estimates 分开
```

## Phase 6：现代战斗

```txt
有 LOS
有侦察
有压制
有士气
有弹药
有燃料
有补给
有简化装甲穿深
```

---

# 18. 最终完成标准

最终项目应满足：

```txt
1. 战略地图足够大，并来自 RegionTile 汇总。
2. 战役地图能从战略图区域打开，并与大地图对应。
3. 战术战斗能从战役图接敌点进入，并与战役图对应。
4. 玩家可以把军队交给 AI。
5. 玩家可以用自然语言下命令。
6. AI 能执行命令并操作棋子。
7. AI 能生成可信报告。
8. 战斗机制更接近现代联合兵种。
9. 旧系统保留 fallback。
10. 构建 / lint 通过。
