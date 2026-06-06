# 单一 1024×1024 母地图系统重构 README

## 0. 本 README 的用途

本文档用于指导本地 AI / 开发代理重构当前项目的地图系统。

当前目标不是继续做：

```txt
战略图 → 战役图 → 战术图
```

三套互相独立的地图生成器。

新的目标是：

```txt
一张 1024×1024 WorldMap 母地图
  ↓
按 chunk 汇总成战略图
  ↓
从 WorldMap 裁剪出战役视图
  ↓
从 WorldMap 裁剪出战术战斗视口
```

核心原则：

> **只生成一张真实地图。战略、战役、战术只是这张地图的不同缩放和裁剪视图。**

---

## 1. 为什么要改成单一母地图

之前的方案是：

```txt
StrategicMap
  ↓ generate
DetailMap / OperationMap
  ↓ generate
TacticalMap
```

这个方案容易出现：

```txt
战略图上是城市，小图却像森林。
战略图上有河，小图没有河。
战略图道路方向和战术图道路方向不一致。
城市在战略图上只有一个格子。
战术图和战役图不是真正对应，只是看起来相似。
```

新方案改成：

```txt
WorldMap 1024×1024
  ├── StrategicView：WorldMap 的 chunk 汇总
  ├── OperationView：WorldMap 的大窗口裁剪
  └── CombatViewport：WorldMap 的小窗口裁剪
```

这样可以保证：

```txt
城市永远在同一位置
道路永远在同一位置
河流永远在同一位置
桥梁永远在 road + river 交叉处
战术战斗永远来自真实地图局部
```

---

## 2. 当前代码状态

当前项目已有以下基础：

```txt
src/game/strategic-types.ts
src/game/types.ts
src/game/strategic-map.ts
src/game/procedural-map.ts
src/game/map.ts
src/game/tactical-integration.ts
```

其中：

- `StrategicSector` 已经有 `baseTerrain?: StrategicBaseTerrainType`、`features?: StrategicFeatureType[]`、`gen?: {...}` 这类字段。
- `StrategicSector` 的这些新字段现在还是 optional，说明旧系统仍然以 `terrain` 为主。
- `TerrainType` 目前仍然是传统战术地形：`plains | forest | mountain | water | city | road | swamp | bridge | desert | fortress`。
- 不要删除旧 `map.ts`、`procedural-map.ts`，它们可以作为 fallback。
- 新系统应新增 `WorldMap` 层，然后逐步让战略图和战术战斗从 `WorldMap` 读取。

---

## 3. 最终地图结构

最终结构应为：

```txt
WorldMap 1024×1024
  │
  ├── StrategicChunk 32×32
  │     每个 chunk 汇总 32×32 WorldCell
  │     用于战略视图、部队大范围移动、AI 报告
  │
  ├── OperationView 128×128 / 256×256
  │     直接裁剪 WorldMap
  │     用于城市周边、战役推进、路线规划、桥梁争夺
  │
  └── CombatViewport 32×24 / 64×48 / 96×72
        直接裁剪 WorldMap
        用于实际战术战棋
```

注意：

```txt
StrategicChunk 不是新地图。
OperationView 不是新地图。
CombatViewport 不是新地图。
它们都是 WorldMap 的视图。
```

---

## 4. 第一版推荐规模

第一版先固定：

```txt
WorldMap: 1024 × 1024
chunkSize: 32
StrategicView: 32 × 32 chunks
```

换算关系：

```txt
1 个 StrategicChunk = 32 × 32 WorldCell
32 × 32 StrategicChunk = 1024 × 1024 WorldCell
```

后续可以支持：

```txt
chunkSize = 16 → StrategicView 64×64
chunkSize = 64 → StrategicView 16×16
```

但第一版不要做动态 chunkSize，先把 `chunkSize = 32` 跑通。

---

## 5. 新增文件

新增以下文件：

```txt
src/game/world-map-types.ts
src/game/world-map-config.ts
src/game/world-map-generator.ts
src/game/world-map-terrain.ts
src/game/world-map-hydrology.ts
src/game/world-map-cities.ts
src/game/world-map-roads.ts
src/game/world-map-features.ts
src/game/world-map-chunks.ts
src/game/world-map-view.ts
src/game/combat-viewport.ts
src/game/world-to-game-map.ts
```

可选新增 UI 文件：

```txt
src/components/game/WorldMapCanvas.tsx
src/components/game/StrategicChunkView.tsx
src/components/game/OperationViewPanel.tsx
src/components/game/CombatViewportPreview.tsx
```

不要把所有逻辑继续塞进：

```txt
src/game/procedural-map.ts
src/game/map.ts
src/game/strategic-map.ts
```

这些旧文件只做 fallback 或入口适配。

---

## 6. 新增核心类型

### 6.1 WorldTerrainType

在 `src/game/world-map-types.ts` 中新增：

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
```

说明：

```txt
WorldTerrainType 是母地图底层地形。
它允许 city，因为城市在 WorldMap 上是大面积区域。
```

---

### 6.2 WorldFeatureType

```ts
export type WorldFeatureType =
  | 'river'
  | 'stream'
  | 'main_road'
  | 'secondary_road'
  | 'bridge'
  | 'city_center'
  | 'urban_block'
  | 'suburb'
  | 'industrial'
  | 'fortress'
  | 'airfield'
  | 'supply_depot'
  | 'rail'
  | 'field'
  | 'checkpoint';
```

说明：

```txt
terrain 表示底层地形。
features 表示覆盖物。
road / river / bridge / city_center 不能再互相覆盖 terrain。
```

---

### 6.3 WorldCell

```ts
export interface WorldCell {
  x: number;
  y: number;

  baseTerrain: WorldTerrainType;

  features: WorldFeatureType[];

  elevation: number;
  moisture: number;
  slope: number;
  temperature: number;

  movementCost: number;
  defenseBonus: number;
  visionBlock: number;

  owner?: 'player' | 'enemy' | 'neutral';
  unitIds?: string[];
}
```

说明：

```txt
WorldCell 是真正的地图格子。
后续战役、战术都读取 WorldCell。
```

---

### 6.4 GeneratedCity

```ts
export type WorldCityRank =
  | 'capital'
  | 'major'
  | 'regional'
  | 'town';

export interface GeneratedCity {
  id: string;
  name: string;

  rank: WorldCityRank;

  center: {
    x: number;
    y: number;
  };

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

  chunkIds: string[];
}
```

---

### 6.5 GeneratedRoad

```ts
export interface GeneratedRoad {
  id: string;

  type: 'main' | 'secondary' | 'military';

  fromCityId?: string;
  toCityId?: string;

  path: Array<{
    x: number;
    y: number;
  }>;
}
```

---

### 6.6 GeneratedRiver

```ts
export interface GeneratedRiver {
  id: string;

  type: 'main' | 'tributary' | 'stream';

  path: Array<{
    x: number;
    y: number;
  }>;

  widthByIndex: number[];
}
```

---

### 6.7 StrategicChunk

```ts
export interface StrategicChunk {
  id: string;

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
    hasSecondaryRoad: boolean;
    hasBridge: boolean;
    hasFortress: boolean;
    hasAirfield: boolean;
    hasSupplyDepot: boolean;
  };

  cityIds: string[];

  strategicValue: {
    supply: number;
    defense: number;
    movement: number;
    chokepoint: number;
    victoryPoint: number;
  };

  control: 'player' | 'enemy' | 'neutral' | 'contested';
}
```

---

### 6.8 WorldMap

```ts
export interface WorldMap {
  id: string;

  seed: number;

  width: number;
  height: number;

  chunkSize: number;

  cells: WorldCell[][];

  chunks: StrategicChunk[][];

  cities: GeneratedCity[];

  roads: GeneratedRoad[];

  rivers: GeneratedRiver[];

  metadata: {
    generatedAt: number;
    generatorVersion: string;
  };
}
```

---

### 6.9 OperationView

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

  sourceChunkIds: string[];

  center: {
    x: number;
    y: number;
  };

  scale: 'operation';
}
```

---

### 6.10 CombatViewport

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

  center: {
    x: number;
    y: number;
  };

  scale: 'combat';

  sourceOperationViewId?: string;
}
```

---

## 7. 生成配置

新增文件：

```txt
src/game/world-map-config.ts
```

内容：

```ts
export interface WorldMapGenConfig {
  seed: number;

  width: number;
  height: number;

  chunkSize: number;

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
    minMainRiverLength: number;
    maxMainRiverLength: number;
  };

  cities: {
    capitalCount: number;
    majorCityCount: number;
    regionalCityCount: number;
    townCount: number;

    capitalRadius: [number, number];
    majorRadius: [number, number];
    regionalRadius: [number, number];
    townRadius: [number, number];

    minCapitalDistance: number;
    minMajorDistance: number;
    minRegionalDistance: number;
    minTownDistance: number;
  };

  roads: {
    connectCapitalToMajors: boolean;
    connectMajorMST: boolean;
    connectRegionalToMajor: boolean;
    connectTownToRegional: boolean;
    extraRoadRatio: number;
  };

  features: {
    fortressCount: number;
    airfieldCount: number;
    supplyDepotCount: number;
  };
}
```

默认配置：

```ts
export const DEFAULT_WORLD_MAP_CONFIG: WorldMapGenConfig = {
  seed: 20260606,

  width: 1024,
  height: 1024,

  chunkSize: 32,

  terrain: {
    seaRatio: 0.12,
    desertMaxRatio: 0.04,
    forestTargetRatio: 0.25,
    mountainTargetRatio: 0.18,
    waterTargetRatio: 0.12,
  },

  rivers: {
    mainRiverCount: 8,
    tributaryCount: 20,
    minMainRiverLength: 160,
    maxMainRiverLength: 900,
  },

  cities: {
    capitalCount: 1,
    majorCityCount: 6,
    regionalCityCount: 18,
    townCount: 60,

    capitalRadius: [40, 70],
    majorRadius: [25, 45],
    regionalRadius: [12, 25],
    townRadius: [5, 12],

    minCapitalDistance: 180,
    minMajorDistance: 110,
    minRegionalDistance: 55,
    minTownDistance: 24,
  },

  roads: {
    connectCapitalToMajors: true,
    connectMajorMST: true,
    connectRegionalToMajor: true,
    connectTownToRegional: true,
    extraRoadRatio: 0.25,
  },

  features: {
    fortressCount: 20,
    airfieldCount: 12,
    supplyDepotCount: 24,
  },
};
```

---

## 8. 总生成流程

新增文件：

```txt
src/game/world-map-generator.ts
```

核心入口：

```ts
export function generateWorldMap(config: WorldMapGenConfig): WorldMap {
  const ctx = createWorldGenContext(config);

  generateHeightmap(ctx);
  computeSlope(ctx);
  classifyWater(ctx);

  generateRivers(ctx);
  computeMoisture(ctx);
  classifyBaseTerrain(ctx);

  limitDesertRatio(ctx);

  placeCities(ctx);
  buildRoadNetwork(ctx);
  placeBridges(ctx);

  placeFortresses(ctx);
  placeAirfields(ctx);
  placeSupplyDepots(ctx);

  computeMovementAndDefense(ctx);

  const worldMap = buildWorldMap(ctx);
  worldMap.chunks = buildStrategicChunks(worldMap);

  validateWorldMap(worldMap);

  return worldMap;
}
```

必须遵守顺序：

```txt
先生成 WorldMap cells
再生成 StrategicChunk
```

禁止：

```txt
先生成战略图，再推导小地图。
```

---

## 9. 高度图生成

文件：

```txt
src/game/world-map-terrain.ts
```

生成 1024×1024 高度图。

可以复用 `procedural-map.ts` 中已有的 seed、noise、fBm 思路。

推荐三层：

```txt
continentalNoise: 大陆形状
mountainNoise: 山脉形状
localNoise: 小尺度地形变化
```

公式：

```ts
height =
  continentalNoise * 0.55
  + mountainNoise * 0.30
  + localNoise * 0.15
```

要求：

```txt
height 归一化到 0~1
同 seed 可复现
不要每次刷新都变化
```

---

## 10. 水域生成

根据 `seaRatio` 计算 seaLevel。

步骤：

```txt
1. 对 heightmap 排序。
2. 找到 seaRatio 对应分位数作为 seaLevel。
3. elevation <= seaLevel 的格子为 water。
4. 从地图边缘 flood fill，得到 ocean。
5. 不连边缘的小水体是 lake。
```

WorldCell 写入：

```ts
cell.baseTerrain = 'water'
```

---

## 11. 河流生成

文件：

```txt
src/game/world-map-hydrology.ts
```

河流直接画在 `WorldCell` 上。

规则：

```txt
1. 河流从高海拔 + 较高湿度区域出发。
2. 沿低处流动。
3. 允许轻微弯曲。
4. 允许合流。
5. 到达海洋 / 湖泊 / 地图边缘结束。
6. 大河 width >= 2 时可以把对应 cell baseTerrain 变成 water。
7. 小河只写 feature: river。
```

写入：

```ts
cell.features.push('river')
```

如果是大河：

```ts
cell.baseTerrain = 'water'
```

GeneratedRiver 写入：

```ts
worldMap.rivers.push({
  id,
  type,
  path,
  widthByIndex,
});
```

---

## 12. 基础地形分类

基础地形由以下数据决定：

```txt
elevation
slope
moisture
temperature
distanceToWater
```

类型：

```txt
plains
forest
mountain
water
desert
marshland
highland
```

不要用简单硬规则：

```ts
if (moisture < 0.22) desert
```

应使用评分法：

```ts
mountainScore = elevation * 70 + slope * 120
forestScore = moisture * 80 - slope * 20
marshScore = moisture * 90 - slope * 100 + nearWaterBonus
desertScore = veryDry && farFromWater ? 80 : -100
plainsScore = 50 - slope * 80
```

默认温带地图：

```txt
desertMaxRatio <= 0.04
```

如果沙漠超过上限，把多余 desert 改成 plains 或 forest。

---

## 13. 城市生成

文件：

```txt
src/game/world-map-cities.ts
```

城市必须直接画在 1024×1024 母地图上。

不要在战略 chunk 上画城市。

### 13.1 城市半径

| 城市等级 | 半径 |
|---|---:|
| capital | 40–70 |
| major | 25–45 |
| regional | 12–25 |
| town | 5–12 |

这意味着：

```txt
首都直径约 80~140 cells
大城市直径约 50~90 cells
区域城市直径约 24~50 cells
城镇直径约 10~24 cells
```

这样战略图上城市会覆盖多个 chunk，不再是一个点。

---

### 13.2 城市选址

城市候选评分：

```txt
平坦
靠近河流但不在河上
靠近海岸但不在海里
靠近平原
靠近道路潜力线
中心性较好
远离其他城市
```

扣分：

```txt
water
mountain
高坡
marshland
desert
孤立区域
```

城市中心必须满足：

```txt
不能是 water
不能是 mountain
slope 不能太高
```

---

### 13.3 城市放置顺序

```txt
capital
major
regional
town
```

每放一个城市后，对周围候选分做距离压制，避免城市挤在一起。

---

### 13.4 城市绘制

新增函数：

```ts
function paintCityArea(ctx: WorldGenContext, city: GeneratedCity): void
```

城市不要是正方形。

使用距离 + noise：

```ts
for y in city.center.y - radius ... city.center.y + radius:
  for x in city.center.x - radius ... city.center.x + radius:
    d = distance(x, y, city.center)
    noise = rng.next() * 0.35

    if d < radius * 0.25:
      baseTerrain = 'city'
      features.push('city_center')
      features.push('urban_block')

    else if d < radius * 0.70 + noise * radius:
      baseTerrain = 'city'
      features.push('urban_block')

    else if d < radius + noise * radius:
      if rng.next() < 0.60:
        baseTerrain = 'city'
        features.push('suburb')
      else:
        baseTerrain = 'plains'
        features.push('field')
```

---

### 13.5 城市验收面积

必须满足：

```txt
capital 至少 3000 个 city cells
major 平均至少 1000 个 city cells
regional 平均至少 250 个 city cells
town 平均至少 60 个 city cells
```

如果不满足，扩大 radius 或调整 paintCityArea。

---

## 14. 道路生成

文件：

```txt
src/game/world-map-roads.ts
```

道路也直接画在 1024×1024 母地图上。

道路连接：

```txt
capital → all major
major → major MST
regional → nearest major
town → nearest regional or major
额外道路形成冗余连接
```

道路寻路用 A*。

道路代价：

```txt
city: 0.5
plains: 1
highland: 3
forest: 4
desert: 5
marshland: 8
mountain: 12
water: 999
已有 road: 0.5
```

写入：

```ts
cell.features.push('main_road')
```

或：

```ts
cell.features.push('secondary_road')
```

注意：

```txt
道路不要覆盖 city。
道路是 feature。
city cell 上可以有 main_road feature。
```

---

## 15. 桥梁生成

桥梁只允许在 road + river 交叉处。

函数：

```ts
function placeBridges(ctx: WorldGenContext): void
```

规则：

```txt
如果 cell 有 river 且有 main_road / secondary_road：
  添加 bridge
```

禁止：

```txt
没有 river 的 bridge
没有 road 的 bridge
随机 bridge
```

验证：

```ts
for every bridge cell:
  assert has river
  assert has road
```

---

## 16. 要塞、机场、补给点

文件：

```txt
src/game/world-map-features.ts
```

### 16.1 要塞

适合：

```txt
桥头
山口
道路交叉
城市外围
高地边缘
```

不要放在城市中心。

写入：

```ts
cell.features.push('fortress')
```

---

### 16.2 机场

适合：

```txt
大城市附近
平坦
有道路连接
不是水
不是山
不是沼泽
```

写入：

```ts
cell.features.push('airfield')
```

---

### 16.3 补给点

适合：

```txt
主干路附近
城市附近
后方区域
机场 / 港口附近
```

写入：

```ts
cell.features.push('supply_depot')
```

---

## 17. StrategicChunk 生成

文件：

```txt
src/game/world-map-chunks.ts
```

核心函数：

```ts
export function buildStrategicChunks(worldMap: WorldMap): StrategicChunk[][];
```

### 17.1 chunk 坐标

```ts
export function getChunkWorldRect(
  chunkX: number,
  chunkY: number,
  chunkSize: number
) {
  return {
    x: chunkX * chunkSize,
    y: chunkY * chunkSize,
    width: chunkSize,
    height: chunkSize,
  };
}
```

---

### 17.2 汇总一个 chunk

```ts
function buildStrategicChunk(
  worldMap: WorldMap,
  chunkX: number,
  chunkY: number
): StrategicChunk
```

统计：

```txt
terrainMix
dominantTerrain
hasCity
hasCapital
hasRiver
hasMainRoad
hasBridge
hasFortress
hasAirfield
hasSupplyDepot
cityIds
supply value
defense value
movement value
chokepoint value
victory point value
control
```

---

### 17.3 terrainMix

`terrainMix` 是 32×32 内各种地形比例：

```ts
terrainMix = {
  plains: plainsCount / total,
  forest: forestCount / total,
  mountain: mountainCount / total,
  water: waterCount / total,
  desert: desertCount / total,
  marshland: marshCount / total,
  highland: highlandCount / total,
  city: cityCount / total,
}
```

`dominantTerrain` 取比例最高的地形。

如果 city 比例超过 0.15，优先显示为 city。

---

### 17.4 StrategicChunk 特征

```ts
hasCity = any cell baseTerrain === 'city'
hasCapital = any cell features includes 'city_center' and city.rank === 'capital'
hasRiver = any cell features includes 'river'
hasMainRoad = any cell features includes 'main_road'
hasBridge = any cell features includes 'bridge'
```

---

## 18. 兼容旧 StrategicMap

当前游戏已有：

```ts
interface StrategicMap {
  width: number;
  height: number;
  sectors: StrategicSector[][];
}
```

不要直接删除。

新增适配函数：

```ts
export function buildStrategicMapFromWorldMap(worldMap: WorldMap): StrategicMap
```

逻辑：

```txt
WorldMap.chunks
  ↓
StrategicMap.sectors
```

每个 StrategicChunk 转成一个 StrategicSector。

```ts
const sector: StrategicSector = {
  position: { x: chunk.chunkX, y: chunk.chunkY },
  terrain: convertWorldTerrainToStrategicTerrain(chunk),
  baseTerrain: convertWorldTerrainToStrategicBaseTerrain(chunk.dominantTerrain),
  features: convertChunkFeaturesToStrategicFeatures(chunk),
  force: null,
  tacticalMapSeed: worldMap.seed + chunk.chunkX * 31 + chunk.chunkY * 131,
  name: getChunkDisplayName(chunk, worldMap),
  gen: {
    elevation: averageElevation,
    slope: averageSlope,
    moisture: averageMoisture,
    temperature: averageTemperature,
    cityScore: chunk.strategicValue.victoryPoint,
    roadCost: chunk.strategicValue.movement,
    supplyValue: chunk.strategicValue.supply,
    defensiveValue: chunk.strategicValue.defense,
    chokepointValue: chunk.strategicValue.chokepoint,
    cityRank: inferredCityRank,
    riverWidth: inferredRiverWidth,
  },
};
```

这样旧战略 UI 仍然可以用 `StrategicMap`。

---

## 19. OperationView 裁剪

文件：

```txt
src/game/world-map-view.ts
```

新增：

```ts
export function getWorldCellsInRect(
  worldMap: WorldMap,
  rect: {
    x: number;
    y: number;
    width: number;
    height: number;
  }
): WorldCell[][]
```

新增：

```ts
export function getOperationView(params: {
  worldMap: WorldMap;
  center: { x: number; y: number };
  width: number;
  height: number;
}): OperationView
```

推荐第一版尺寸：

```txt
96×96
128×128
256×256
```

点击战略 chunk 后：

```ts
const rect = getChunkWorldRect(chunkX, chunkY, worldMap.chunkSize);

const operationView = getOperationView({
  worldMap,
  center: {
    x: rect.x + rect.width / 2,
    y: rect.y + rect.height / 2,
  },
  width: 128,
  height: 128,
});
```

---

## 20. CombatViewport 裁剪

文件：

```txt
src/game/combat-viewport.ts
```

新增：

```ts
export function getCombatViewport(params: {
  worldMap: WorldMap;
  center: { x: number; y: number };
  width: number;
  height: number;
}): CombatViewport
```

推荐尺寸：

```txt
32×24
64×48
96×72
```

第一版使用：

```txt
64×48
```

注意：

```txt
CombatViewport 不是重新生成地图。
它只是 WorldMap 的一块 cells。
```

---

## 21. CombatViewport 转旧 GameMap

文件：

```txt
src/game/world-to-game-map.ts
```

新增：

```ts
export function convertCombatViewportToGameMap(
  viewport: CombatViewport
): GameMap
```

把 `WorldCell` 转成旧 `MapCell`。

### 21.1 terrain 映射

```ts
function convertWorldCellToTerrain(cell: WorldCell): TerrainType {
  if (cell.features.includes('bridge')) return 'bridge';

  if (
    cell.features.includes('fortress') ||
    cell.features.includes('checkpoint')
  ) {
    return 'fortress';
  }

  if (
    cell.baseTerrain === 'city' ||
    cell.features.includes('urban_block') ||
    cell.features.includes('industrial') ||
    cell.features.includes('city_center')
  ) {
    return 'city';
  }

  if (
    cell.features.includes('main_road') ||
    cell.features.includes('secondary_road')
  ) {
    if (cell.baseTerrain !== 'water') return 'road';
  }

  if (cell.baseTerrain === 'marshland') return 'swamp';

  return cell.baseTerrain;
}
```

注意：

```txt
road 转 terrain 只是为了兼容旧战斗渲染。
WorldMap 里 road 仍然是 feature。
```

---

### 21.2 MapCell features

如果 `MapCell` 没有 features 字段，需要在 `src/game/types.ts` 中新增：

```ts
export type TacticalFeatureType =
  | 'river'
  | 'stream'
  | 'main_road'
  | 'secondary_road'
  | 'bridge'
  | 'city_center'
  | 'urban_block'
  | 'suburb'
  | 'industrial'
  | 'fortress'
  | 'airfield'
  | 'supply_depot'
  | 'field'
  | 'checkpoint';

export interface MapCell {
  position: Position;
  terrain: TerrainType;
  isOccupied: boolean;
  unitId: string | null;
  isRoad?: boolean;
  roadType?: 'main' | 'secondary';
  features?: TacticalFeatureType[];
}
```

如果当前 `MapCell` 定义不同，不要重写全部，只添加 `features?: TacticalFeatureType[]`。

---

## 22. 点击战略图的行为

战略图点击逻辑应该改成：

```txt
点击 StrategicChunk
  ↓
找到 chunk.worldRect
  ↓
从 WorldMap 裁剪对应区域
  ↓
显示 OperationView
```

伪代码：

```ts
function onStrategicChunkClick(chunkX: number, chunkY: number) {
  const chunk = worldMap.chunks[chunkY][chunkX];

  const center = {
    x: chunk.worldRect.x + chunk.worldRect.width / 2,
    y: chunk.worldRect.y + chunk.worldRect.height / 2,
  };

  const operationView = getOperationView({
    worldMap,
    center,
    width: 128,
    height: 128,
  });

  setSelectedOperationView(operationView);
}
```

---

## 23. 点击城市 chunk 的行为

如果 chunk 中有城市：

```ts
chunk.cityIds.length > 0
```

则定位到城市中心：

```ts
const city = worldMap.cities.find(c => c.id === chunk.cityIds[0]);

const operationView = getOperationView({
  worldMap,
  center: city.center,
  width: city.rank === 'capital' ? 256 : 128,
  height: city.rank === 'capital' ? 256 : 128,
});
```

这样点击城市战略格时，会看到真实城市区域。

---

## 24. 进入战术战斗

从 OperationView 中点击接敌点或目标点：

```ts
const viewport = getCombatViewport({
  worldMap,
  center: clickedWorldPosition,
  width: 64,
  height: 48,
});

const gameMap = convertCombatViewportToGameMap(viewport);
```

然后把 `gameMap` 交给旧战术战斗系统。

禁止：

```txt
进入战术战斗时重新调用 random map generator。
```

允许 fallback：

```txt
如果没有 WorldMap，则使用旧 map.ts 的预设地图。
```

---

## 25. UI 渲染建议

### 25.1 不要用 DOM 渲染 1024×1024

1024×1024 有 1,048,576 个格子。

不要：

```txt
一个 cell 一个 div
```

会卡。

推荐第一版：

```txt
StrategicView：可以用 32×32 div grid
OperationView：128×128 用 canvas
CombatViewport：64×48 可以用现有 Three.js / grid
```

---

### 25.2 WorldMapCanvas

新增：

```txt
src/components/game/WorldMapCanvas.tsx
```

Props：

```ts
interface WorldMapCanvasProps {
  worldMap: WorldMap;
  viewRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
  cellSize: number;
  onCellClick?: (pos: { x: number; y: number }) => void;
}
```

只渲染 `viewRect` 内的 cell。

---

### 25.3 StrategicChunkView

显示 `worldMap.chunks`：

```txt
32×32
```

每个 chunk 用 dominantTerrain 颜色。

叠加图标：

```txt
city
capital
river
main road
bridge
fortress
airfield
supply depot
```

点击 chunk 后显示 OperationView。

---

## 26. 存储建议

第一版可以全部在内存里。

但是 1024×1024 的 `WorldCell` 比较大。

注意：

```txt
不要把每个 cell 存成过度复杂的大对象。
```

如果性能差，可以改为分层数组：

```ts
terrain: Uint8Array
elevation: Float32Array
moisture: Float32Array
slope: Float32Array
features: Uint32Array bitmask
```

但第一版为了开发简单，可以先用对象数组。

第二版再优化。

---

## 27. 性能要求

生成 1024×1024 可能较慢。

第一版接受：

```txt
开发环境生成几秒
```

但 UI 不应卡死太久。

建议：

```txt
先支持 512×512 调试模式
再切到 1024×1024
```

配置可加：

```ts
export const DEBUG_WORLD_MAP_CONFIG = {
  ...DEFAULT_WORLD_MAP_CONFIG,
  width: 512,
  height: 512,
  chunkSize: 32,
};
```

验收时用 1024×1024。

---

## 28. 兼容旧代码策略

不要一次性删除旧系统。

保留：

```txt
src/game/map.ts
src/game/procedural-map.ts
src/game/strategic-map.ts
src/game/tactical-integration.ts
```

新增：

```txt
WorldMap 系统
```

然后让旧入口逐步接入：

```ts
generateStrategicMap()
  ↓
如果启用 WorldMap 模式：
  generateWorldMap()
  buildStrategicMapFromWorldMap()
否则：
  old generateStrategicMap()
```

可以新增 flag：

```ts
export const USE_WORLD_MAP_STRATEGIC_MODE = true;
```

---

## 29. 验收标准

使用：

```txt
seed = 20260606
width = 1024
height = 1024
chunkSize = 32
```

必须满足：

### 29.1 WorldMap

```txt
WorldMap.width = 1024
WorldMap.height = 1024
WorldMap.cells 有 1024 行
每行 1024 个 cell
```

### 29.2 StrategicChunk

```txt
worldMap.chunks 是 32×32
每个 chunk.worldRect 对应 32×32 world cells
chunk(0,0) 对应 x=0..31, y=0..31
chunk(1,0) 对应 x=32..63, y=0..31
chunk(0,1) 对应 x=0..31, y=32..63
```

### 29.3 城市

```txt
capital 至少覆盖 3000 个 city cells
major city 平均至少覆盖 1000 个 city cells
regional city 平均至少覆盖 250 个 city cells
town 平均至少覆盖 60 个 city cells
至少有 1 个 capital
至少有 6 个 major city
```

### 29.4 道路

```txt
capital 和所有 major city 有道路连接
major city 之间道路图连通
道路在 WorldMap 上连续
road 是 feature，不是强行覆盖 city
```

### 29.5 河流和桥梁

```txt
至少 5 条主河流
至少 10 条支流
river 在 WorldMap 上连续
bridge 只出现在 road + river 交叉处
非法 bridge 数量 = 0
```

### 29.6 战略图点击

```txt
点击任意 StrategicChunk，可以显示对应 WorldMap 区域
点击城市 chunk，可以定位到真实城市区域
城市在 OperationView 中仍然是大面积 city cells
```

### 29.7 战术战斗

```txt
进入战术战斗时，GameMap 来自 CombatViewport
CombatViewport 来自 WorldMap
不重新随机生成无关战术地图
```

---

## 30. 调试输出

生成完成后输出：

```txt
WorldMap:
- width / height
- chunkSize
- chunk count

Terrain:
- plains count / ratio
- forest count / ratio
- mountain count / ratio
- water count / ratio
- desert count / ratio
- marshland count / ratio
- highland count / ratio
- city count / ratio

Cities:
- capital count
- major count
- regional count
- town count
- capital city cell count
- major average city cell count
- regional average city cell count
- town average city cell count

Roads:
- road count
- main road cells
- secondary road cells
- road connectivity status

Rivers:
- river count
- main river count
- tributary count
- river cell count

Bridges:
- bridge count
- invalid bridge count

Views:
- strategic chunks size
- sample chunk rect
- sample operation view rect
- sample combat viewport rect
```

如果不满足标准，输出 warning。

---

## 31. 不要做的事

不要做：

```txt
不要接真实地图
不要引入 MapLibre
不要重写战斗 AI
不要删除旧 map.ts
不要删除旧 procedural-map.ts
不要生成三套独立地图
不要让战术图重新随机
不要用 DOM 渲染 1024×1024 个格子
不要只改颜色假装城市变大
不要让 city / road / river 互相覆盖 terrain
```

---

## 32. 推荐开发顺序

### Phase 1：新增类型和配置

新增：

```txt
world-map-types.ts
world-map-config.ts
```

要求：

```txt
类型编译通过
不影响旧代码
```

---

### Phase 2：生成 1024×1024 WorldMap 基础地形

新增：

```txt
world-map-generator.ts
world-map-terrain.ts
```

目标：

```txt
能生成 1024×1024 cells
每个 cell 有 baseTerrain / elevation / moisture / slope
```

先不做城市道路。

---

### Phase 3：城市直接画到 WorldMap

新增：

```txt
world-map-cities.ts
```

目标：

```txt
capital / major / regional / town 都是大面积 city cells
不是战略格上的点
```

---

### Phase 4：道路、河流、桥梁

新增：

```txt
world-map-hydrology.ts
world-map-roads.ts
```

目标：

```txt
river 连续
road 连续
bridge 合法
```

---

### Phase 5：StrategicChunk 汇总

新增：

```txt
world-map-chunks.ts
```

目标：

```txt
1024×1024 → 32×32 chunks
战略图来自 chunks
```

---

### Phase 6：兼容旧 StrategicMap

修改：

```txt
strategic-map.ts
strategic-types.ts
```

目标：

```txt
旧战略 UI 能显示 WorldMap 汇总后的战略图
```

---

### Phase 7：OperationView 和 CombatViewport

新增：

```txt
world-map-view.ts
combat-viewport.ts
world-to-game-map.ts
```

目标：

```txt
点击战略 chunk → 显示 WorldMap 局部
点击局部接敌点 → 转成 GameMap
```

---

### Phase 8：UI 接入

新增或修改：

```txt
StrategicChunkView
WorldMapCanvas
OperationViewPanel
CombatViewportPreview
```

目标：

```txt
能点击战略图看到真实局部地图
能从真实局部地图进入战术战斗
```

---

## 33. 最终目标

最终项目应变成：

```txt
generateWorldMap()
  ↓
WorldMap 1024×1024
  ↓
buildStrategicChunks()
  ↓
StrategicView 32×32
  ↓ click
OperationView 128×128 / 256×256
  ↓ click contact point
CombatViewport 64×48
  ↓
convertCombatViewportToGameMap()
  ↓
现有战术战棋系统
```

最关键的一句话：

> **先生成 1024×1024 的母地图，再从母地图汇总战略图、裁剪战役图、裁剪战术图。不要再生成互相独立的三套地图。**
