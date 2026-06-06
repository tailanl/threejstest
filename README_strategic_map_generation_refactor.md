# 战略地图生成器重构 README

## 0. 本 README 的用途

本文档用于指导本地 AI / 开发代理重构当前项目中的战略地图生成系统。

目标不是接入真实地图数据，而是生成一个**虚构但地理逻辑合理**的战略地图。地图需要支持后续的：

- 战略大地图；
- 战役区域切分；
- 战术战棋场景生成；
- 玩家作为“指挥部”下命令；
- AI 根据命令控制具体部队；
- AI 向玩家提交战况报告。

本次重构只聚焦于：

> **战略地图生成器。**

不要求在本次重构中完成 AI 指挥系统、报告系统或完整战役系统，但生成结果必须为这些系统预留数据结构。

---

## 1. 当前问题

当前战略地图生成存在以下问题：

1. 地形、城市、道路、河流混在同一个 `terrain` 字段里。
2. 城市放置逻辑不够合理，容易出现在山地、水域、沼泽或孤立区域。
3. 道路生成缺少城市网络约束，可能随机、断裂、穿水、穿山过多。
4. 河流缺少完整水系逻辑，容易短、直、断、无法合流。
5. 地形判别使用硬规则，导致地形边界跳变明显。
6. 生成器不利于扩展到大地图。
7. 后续从战略地图切出战役地图时，缺少地形、交通、水系、城市、战略价值等中间层信息。

---

## 2. 总体目标

重构后的战略地图生成器应满足：

```txt
虚构世界
  +
程序化生成
  +
可复现 seed
  +
自然地形合理
  +
城市分布合理
  +
道路网络合理
  +
河流系统合理
  +
可扩展到大地图
  +
能为战役图和战术图提供上下文
```

生成结果应该看起来像一个合理的虚构战区，而不是随机格子图。

---

## 3. 明确禁止事项

### 3.1 不要使用真实地图

本项目当前不接入：

- OpenStreetMap；
- Natural Earth；
- SRTM；
- 真实国家边界；
- 真实城市数据；
- 真实道路数据；
- 真实军事单位数据。

所有地图内容必须是程序化虚构生成。

### 3.2 不要继续使用固定 10×8 手写战略地图作为主生成器

旧的 `strategic-map.ts` 中如果存在固定 `TERRAIN_LAYOUT`、`PLACE_NAMES` 之类逻辑，只能作为 fallback / legacy 示例保留。

主生成逻辑必须迁移到新的程序化生成系统。

### 3.3 不要让 `terrain` 同时表示自然地形和人工设施

错误示例：

```ts
terrain: 'city'
terrain: 'road'
terrain: 'bridge'
```

正确方式：

```ts
baseTerrain: 'plains',
features: ['city', 'main_road', 'bridge']
```

### 3.4 不要让河流覆盖自然地形

河流不是 `baseTerrain = 'water'`。

正确方式：

```ts
baseTerrain: 'plains',
features: ['river']
```

只有海洋、湖泊、大水体才应该是：

```ts
baseTerrain: 'water'
```

---

## 4. 应该基于哪份代码

优先使用当前项目里的程序化地图代码作为基础。

推荐使用：

```txt
src/game/procedural-map.ts
```

它应该作为以下内容的参考或复用来源：

- seed 随机数；
- Perlin / fBm 噪声；
- 高度图生成；
- 风蚀 / 平滑思路；
- 初始河流生成思路；
- 程序化地图参数配置思路。

不要直接用旧的固定战略图作为主逻辑：

```txt
src/game/strategic-map.ts
```

这个文件后续应该变成“战略地图入口适配器”，调用新的战略生成器。

---

## 5. 推荐文件结构

新增目录：

```txt
src/game/strategic-gen/
  strategic-gen-config.ts
  strategic-gen-types.ts
  gen-context.ts

  heightmap.ts
  slope.ts
  water.ts
  hydrology.ts
  moisture.ts
  temperature.ts
  terrain-classifier.ts
  terrain-smoothing.ts

  city-score.ts
  city-placement.ts
  road-cost.ts
  road-network.ts
  bridge-placement.ts

  feature-placement.ts
  validation.ts
  build-strategic-map.ts
  generate-strategic-world.ts
```

保留但修改：

```txt
src/game/strategic-types.ts
src/game/strategic-map.ts
```

可以参考但不建议继续膨胀：

```txt
src/game/procedural-map.ts
```

---

## 6. 数据结构设计

### 6.1 基础地形类型

在 `src/game/strategic-types.ts` 中新增：

```ts
export type StrategicBaseTerrainType =
  | 'plains'
  | 'forest'
  | 'mountain'
  | 'water'
  | 'desert'
  | 'marshland'
  | 'highland';
```

说明：

| 类型 | 含义 |
|---|---|
| `plains` | 平原，适合城市、道路、机动 |
| `forest` | 森林，移动较慢，防御较好 |
| `mountain` | 高山，移动困难，适合防守 |
| `water` | 海洋、湖泊、大水体 |
| `desert` | 干旱区域，补给困难 |
| `marshland` | 沼泽、湿地，通行差 |
| `highland` | 丘陵、高地，比山地更可通行 |

---

### 6.2 地物类型

在 `src/game/strategic-types.ts` 中新增：

```ts
export type StrategicFeatureType =
  | 'river'
  | 'main_road'
  | 'secondary_road'
  | 'bridge'
  | 'city'
  | 'capital'
  | 'port'
  | 'fortress'
  | 'airfield'
  | 'supply_depot'
  | 'rail';
```

说明：

| feature | 含义 |
|---|---|
| `river` | 河流 |
| `main_road` | 主干道路 |
| `secondary_road` | 次级道路 |
| `bridge` | 桥梁 |
| `city` | 城市 |
| `capital` | 首都 |
| `port` | 港口 |
| `fortress` | 要塞 |
| `airfield` | 机场 |
| `supply_depot` | 补给点 |
| `rail` | 铁路，暂时可不实现 |

---

### 6.3 城市等级

```ts
export type CityRank =
  | 'capital'
  | 'major'
  | 'regional'
  | 'town';
```

说明：

| 等级 | 数量 | 意义 |
|---|---:|---|
| `capital` | 1 | 主战略目标，最高补给价值 |
| `major` | 少量 | 大城市，交通和补给节点 |
| `regional` | 中等数量 | 区域城市 |
| `town` | 较多 | 小城镇、道路节点 |

---

### 6.4 扩展 `StrategicSector`

保留旧字段，新增新字段。不要破坏旧系统。

推荐结构：

```ts
export interface StrategicSector {
  position: StrategicPosition;

  /**
   * 兼容旧代码。
   * 旧 UI、旧战斗逻辑仍然可以读取这个字段。
   */
  terrain: StrategicTerrainType;

  /**
   * 新增：自然地形。
   * 只表示自然地貌，不表示城市、道路、桥梁。
   */
  baseTerrain: StrategicBaseTerrainType;

  /**
   * 新增：人工设施、河流、道路、桥梁等地物。
   */
  features: StrategicFeatureType[];

  force: StrategicForce | null;
  tacticalMapSeed: number;
  name: string;

  /**
   * 新增：生成器中间数据和战略评价数据。
   */
  gen: {
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

注意：

- `terrain` 保留，用于兼容旧逻辑；
- `baseTerrain` 是新的自然地形；
- `features` 是新的地物层；
- `gen` 是后续 AI、战役生成、报告系统需要的上下文。

---

## 7. 生成配置

新建：

```txt
src/game/strategic-gen/strategic-gen-config.ts
```

内容建议：

```ts
export interface StrategicGenConfig {
  seed: number;
  width: number;
  height: number;

  worldShape: 'continent' | 'peninsula' | 'island' | 'inland' | 'river_basin';

  terrain: {
    seaRatio: number;
    mountainRatio: number;
    forestRatio: number;
    desertRatio: number;
    marshRatio: number;
  };

  rivers: {
    mainRiverCount: number;
    tributaryChance: number;
    minRiverLength: number;
    maxRiverLength: number;
    sourceMinElevation: number;
    sourceMinMoisture: number;
  };

  cities: {
    capitalCount: number;
    majorCityCount: number;
    regionalCityCount: number;
    townCount: number;

    minCapitalDistance: number;
    minMajorDistance: number;
    minRegionalDistance: number;
    minTownDistance: number;
  };

  roads: {
    extraRoadRatio: number;
    allowMountainRoads: boolean;
    bridgeMaxRiverWidth: number;
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
export const DEFAULT_STRATEGIC_GEN_CONFIG: StrategicGenConfig = {
  seed: 20260606,
  width: 64,
  height: 48,

  worldShape: 'peninsula',

  terrain: {
    seaRatio: 0.18,
    mountainRatio: 0.18,
    forestRatio: 0.24,
    desertRatio: 0.05,
    marshRatio: 0.06,
  },

  rivers: {
    mainRiverCount: 5,
    tributaryChance: 0.25,
    minRiverLength: 12,
    maxRiverLength: 90,
    sourceMinElevation: 0.55,
    sourceMinMoisture: 0.40,
  },

  cities: {
    capitalCount: 1,
    majorCityCount: 4,
    regionalCityCount: 8,
    townCount: 20,

    minCapitalDistance: 22,
    minMajorDistance: 10,
    minRegionalDistance: 6,
    minTownDistance: 3,
  },

  roads: {
    extraRoadRatio: 0.25,
    allowMountainRoads: true,
    bridgeMaxRiverWidth: 3,
  },

  features: {
    fortressCount: 6,
    airfieldCount: 3,
    supplyDepotCount: 5,
  },
};
```

---

## 8. 生成上下文

新建：

```txt
src/game/strategic-gen/gen-context.ts
```

推荐结构：

```ts
import {
  StrategicBaseTerrainType,
  StrategicFeatureType,
  CityRank,
} from '../strategic-types';

export interface GenPosition {
  x: number;
  y: number;
}

export interface RiverCell {
  isRiver: boolean;
  riverId?: string;
  flowAmount: number;
  width: number;
  isMainRiver: boolean;
}

export interface CityNode {
  id: string;
  name: string;
  position: GenPosition;
  rank: CityRank;
  populationScore: number;
  supplyValue: number;
  victoryPointValue: number;
}

export interface RoadEdge {
  id: string;
  fromCityId: string;
  toCityId: string;
  path: GenPosition[];
  roadType: 'main' | 'secondary' | 'military';
}

export interface StrategicGenContext {
  seed: number;
  rng: SeededRNG;

  width: number;
  height: number;

  elevation: number[][];
  slope: number[][];
  moisture: number[][];
  temperature: number[][];

  waterMask: boolean[][];
  oceanMask: boolean[][];
  lakeMask: boolean[][];

  riverLayer: RiverCell[][];
  baseTerrain: StrategicBaseTerrainType[][];
  features: Set<StrategicFeatureType>[][];

  cityScore: number[][];
  roadCost: number[][];
  defensiveValue: number[][];
  chokepointValue: number[][];
  supplyValue: number[][];

  cities: CityNode[];
  roads: RoadEdge[];
}
```

`SeededRNG` 可以从 `procedural-map.ts` 抽出，也可以新建一个小型 seed 随机器。

---

## 9. 总生成流程

新建：

```txt
src/game/strategic-gen/generate-strategic-world.ts
```

入口函数：

```ts
export function generateStrategicWorld(
  config: StrategicGenConfig
): StrategicMap {
  const ctx = createStrategicGenContext(config);

  // 1. 自然地形基础
  ctx.elevation = generateStrategicHeightmap(ctx, config);
  normalizeHeightmap(ctx.elevation);
  applyWorldShape(ctx, config.worldShape);

  ctx.slope = computeSlope(ctx.elevation);

  const seaLevel = computeSeaLevelByRatio(
    ctx.elevation,
    config.terrain.seaRatio
  );

  classifyWaterBodies(ctx, seaLevel);

  // 2. 水系和气候
  ctx.moisture = computeInitialMoisture(ctx);
  generateRiverNetwork(ctx, config);
  ctx.moisture = computeMoisture(ctx);
  ctx.temperature = computeTemperature(ctx);

  // 3. 自然地形
  ctx.baseTerrain = classifyBaseTerrains(ctx);
  smoothBaseTerrain(ctx, 3);

  // 4. 战略评价层
  ctx.chokepointValue = computeChokepointValue(ctx);
  ctx.defensiveValue = computeDefensiveValue(ctx);
  ctx.supplyValue = create2DArray(ctx.width, ctx.height, () => 0);

  // 5. 城市
  ctx.cityScore = computeCityScores(ctx);
  placeCities(ctx, config);

  // 6. 道路和桥梁
  ctx.roadCost = computeRoadCostMap(ctx);
  buildRoadNetwork(ctx, config);
  placeBridges(ctx, config);

  // 7. 战略设施
  placePorts(ctx);
  placeFortresses(ctx, config);
  placeAirfields(ctx, config);
  placeSupplyDepots(ctx, config);

  // 8. 合法性检查和修复
  validateAndRepairStrategicWorld(ctx);

  // 9. 转成游戏现有 StrategicMap
  return buildStrategicMap(ctx);
}
```

---

## 10. 高度图生成细节

文件：

```txt
src/game/strategic-gen/heightmap.ts
```

推荐生成三层高度：

```txt
continentalHeight：大陆 / 海洋大形状
mountainHeight：山脉带
localHeight：局部丘陵细节
```

总高度：

```ts
height =
  continentalHeight * 0.55
  + mountainHeight * 0.30
  + localHeight * 0.15
```

### 10.1 半岛形状

```ts
function applyPeninsulaMask(
  elevation: number[][],
  width: number,
  height: number
) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = x / (width - 1);
      const ny = y / (height - 1);

      const centerBias = 1 - Math.abs(nx - 0.45) * 1.1;
      const southTaper = 1 - Math.max(0, ny - 0.55) * 0.9;

      const peninsulaMask = centerBias * southTaper;

      elevation[y][x] += peninsulaMask * 0.18;
    }
  }
}
```

### 10.2 岛屿形状

```ts
function applyIslandMask(
  elevation: number[][],
  width: number,
  height: number
) {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const dx = Math.abs(x - width / 2) / (width / 2);
      const dy = Math.abs(y - height / 2) / (height / 2);
      const d = Math.sqrt(dx * dx + dy * dy);

      const islandMask = 1 - Math.pow(d, 1.8);
      elevation[y][x] += islandMask * 0.35 - d * 0.25;
    }
  }
}
```

### 10.3 内陆形状

```ts
function applyInlandMask(elevation: number[][]) {
  // 内陆战区不需要强制压低地图边缘。
  // 保持大部分区域为陆地。
}
```

---

## 11. 坡度计算

文件：

```txt
src/game/strategic-gen/slope.ts
```

```ts
export function computeSlope(elevation: number[][]): number[][] {
  const height = elevation.length;
  const width = elevation[0].length;

  const slope = create2DArray(width, height, () => 0);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const h0 = elevation[y][x];
      let maxDiff = 0;

      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          if (dx === 0 && dy === 0) continue;

          const nx = x + dx;
          const ny = y + dy;

          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;

          const diff = Math.abs(h0 - elevation[ny][nx]);
          maxDiff = Math.max(maxDiff, diff);
        }
      }

      slope[y][x] = maxDiff;
    }
  }

  return slope;
}
```

坡度用于：

- 山地判别；
- 城市放置；
- 道路寻路；
- 河流走向；
- 沼泽判别；
- 要塞位置；
- 机场位置。

---

## 12. 海洋 / 湖泊生成

文件：

```txt
src/game/strategic-gen/water.ts
```

不要只有一个 `water`。

需要三个 mask：

```ts
waterMask: boolean[][];
oceanMask: boolean[][];
lakeMask: boolean[][];
```

生成流程：

```txt
1. 根据 seaRatio 计算 seaLevel
2. elevation <= seaLevel 的格子标记为 water
3. 从地图边缘 flood fill
4. 与边缘连通的是 ocean
5. 不与边缘连通的是 lake
6. 删除过小湖泊或填平
```

伪代码：

```ts
function classifyWaterBodies(ctx: StrategicGenContext, seaLevel: number) {
  forEachCell(ctx, (x, y) => {
    ctx.waterMask[y][x] = ctx.elevation[y][x] <= seaLevel;
  });

  ctx.oceanMask = floodFillOceanFromEdges(ctx.waterMask);
  ctx.lakeMask = create2DArray(ctx.width, ctx.height, () => false);

  forEachCell(ctx, (x, y) => {
    ctx.lakeMask[y][x] = ctx.waterMask[y][x] && !ctx.oceanMask[y][x];
  });

  removeTinyLakes(ctx, 4);
}
```

---

## 13. 河流生成

文件：

```txt
src/game/strategic-gen/hydrology.ts
```

### 13.1 河流层结构

```ts
export interface RiverCell {
  isRiver: boolean;
  riverId?: string;
  flowAmount: number;
  width: number;
  isMainRiver: boolean;
}
```

每个格子的初始值：

```ts
{
  isRiver: false,
  flowAmount: 0,
  width: 0,
  isMainRiver: false,
}
```

### 13.2 河流源头评分

源头应该满足：

```txt
高海拔
湿度较高
坡度适中
离边缘有距离
不在水里
不离其他源头太近
```

评分公式：

```ts
riverSourceScore =
  elevation * 0.45
  + moisture * 0.30
  + slope * 0.10
  + random * 0.15
```

限制：

```ts
function canBeRiverSource(x: number, y: number, ctx: StrategicGenContext): boolean {
  if (ctx.waterMask[y][x]) return false;
  if (isNearMapEdge(x, y, ctx.width, ctx.height, 4)) return false;
  if (ctx.elevation[y][x] < 0.55) return false;
  if (ctx.slope[y][x] < 0.015) return false;
  return true;
}
```

### 13.3 河流追踪

河流每一步从 8 邻域中选一个格子。

选择目标时考虑：

- 高度下降；
- 避免频繁急转弯；
- 允许合流；
- 不要反复绕圈；
- 如果卡在盆地，允许轻微雕刻出口。

评分函数：

```ts
function scoreRiverNextCell(
  from: GenPosition,
  to: GenPosition,
  previousDir: GenPosition | null,
  ctx: StrategicGenContext
): number {
  const fromH = ctx.elevation[from.y][from.x];
  const toH = ctx.elevation[to.y][to.x];

  const heightDrop = fromH - toH;
  const moistureBonus = ctx.moisture[to.y][to.x] * 8;
  const existingRiverBonus = ctx.riverLayer[to.y][to.x].isRiver ? 35 : 0;

  const turnPenalty = previousDir
    ? computeTurnPenalty(from, to, previousDir)
    : 0;

  const uphillPenalty = heightDrop < 0 ? Math.abs(heightDrop) * 80 : 0;

  return (
    heightDrop * 100
    + moistureBonus
    + existingRiverBonus
    - turnPenalty
    - uphillPenalty
  );
}
```

### 13.4 处理盆地

```ts
function carveOutlet(
  current: GenPosition,
  ctx: StrategicGenContext
): GenPosition | null {
  const candidates = getNeighbors8(current, ctx.width, ctx.height)
    .filter(p => !ctx.oceanMask[p.y][p.x]);

  if (candidates.length === 0) return null;

  candidates.sort((a, b) => {
    return ctx.elevation[a.y][a.x] - ctx.elevation[b.y][b.x];
  });

  const next = candidates[0];

  ctx.elevation[next.y][next.x] -= 0.035;
  ctx.elevation[current.y][current.x] -= 0.015;

  return next;
}
```

### 13.5 河流宽度

```ts
function writeRiverPath(
  riverId: string,
  path: GenPosition[],
  ctx: StrategicGenContext
) {
  for (let i = 0; i < path.length; i++) {
    const p = path[i];

    const t = i / Math.max(1, path.length - 1);
    const flowAmount = 0.2 + t * 0.8;

    const width =
      flowAmount > 0.8 ? 3 :
      flowAmount > 0.5 ? 2 :
      1;

    ctx.riverLayer[p.y][p.x] = {
      isRiver: true,
      riverId,
      flowAmount,
      width,
      isMainRiver: path.length >= 24,
    };

    ctx.features[p.y][p.x].add('river');
  }
}
```

---

## 14. 湿度生成

文件：

```txt
src/game/strategic-gen/moisture.ts
```

湿度来源：

- 海洋；
- 湖泊；
- 河流；
- 随机扰动；
- 高海拔惩罚。

```ts
function computeMoisture(ctx: StrategicGenContext): number[][] {
  const distToWater = computeDistanceToWater(ctx);
  const moisture = create2DArray(ctx.width, ctx.height, () => 0);

  forEachCell(ctx, (x, y) => {
    const d = distToWater[y][x];

    const waterMoisture = Math.exp(-d / 8);
    const elevationPenalty = ctx.elevation[y][x] > 0.75 ? 0.18 : 0;
    const noise = ctx.rng.next() * 0.06;

    moisture[y][x] = clamp01(
      waterMoisture
      - elevationPenalty
      + noise
    );
  });

  return moisture;
}
```

---

## 15. 温度生成

文件：

```txt
src/game/strategic-gen/temperature.ts
```

简单版本即可：

```ts
function computeTemperature(ctx: StrategicGenContext): number[][] {
  const temperature = create2DArray(ctx.width, ctx.height, () => 0);

  forEachCell(ctx, (x, y) => {
    const latitudeFactor = 1 - y / Math.max(1, ctx.height - 1);
    const elevationPenalty = ctx.elevation[y][x] * 0.25;
    const noise = ctx.rng.next() * 0.05;

    temperature[y][x] = clamp01(
      latitudeFactor
      - elevationPenalty
      + noise
    );
  });

  return temperature;
}
```

---

## 16. 自然地形判别

文件：

```txt
src/game/strategic-gen/terrain-classifier.ts
```

不要用硬 if-else 一路判断到底。

使用评分法：

```ts
function classifyBaseTerrainAt(
  x: number,
  y: number,
  ctx: StrategicGenContext
): StrategicBaseTerrainType {
  const elevation = ctx.elevation[y][x];
  const slope = ctx.slope[y][x];
  const moisture = ctx.moisture[y][x];
  const temperature = ctx.temperature[y][x];

  if (ctx.waterMask[y][x]) {
    return 'water';
  }

  const scores = {
    mountain:
      elevation * 70
      + slope * 130
      - moisture * 8,

    highland:
      elevation * 55
      + slope * 45
      - Math.abs(moisture - 0.45) * 10,

    forest:
      moisture * 80
      + temperature * 15
      - slope * 25
      - Math.max(0, elevation - 0.75) * 30,

    marshland:
      moisture * 90
      - slope * 120
      + distanceBonusToRiverOrLake(x, y, ctx) * 25
      - elevation * 15,

    desert:
      (1 - moisture) * 85
      + temperature * 25
      - distanceBonusToRiverOrLake(x, y, ctx) * 20,

    plains:
      55
      - slope * 85
      - Math.abs(elevation - 0.42) * 35
      + moisture * 10,
  };

  return pickMaxScore(scores);
}
```

---

## 17. 地形平滑

文件：

```txt
src/game/strategic-gen/terrain-smoothing.ts
```

目的：

- 删除孤立山格；
- 删除孤立森林格；
- 删除孤立沼泽格；
- 让森林、沼泽、山地更连片。

```ts
function smoothBaseTerrain(ctx: StrategicGenContext, iterations: number = 3) {
  for (let i = 0; i < iterations; i++) {
    const next = clone2D(ctx.baseTerrain);

    forEachCell(ctx, (x, y) => {
      if (ctx.waterMask[y][x]) return;

      const neighbors = getNeighbors8({ x, y }, ctx.width, ctx.height);
      const counts = countTerrainTypes(neighbors, ctx.baseTerrain);

      const current = ctx.baseTerrain[y][x];

      if (counts[current] <= 1) {
        const dominant = getDominantTerrain(counts);

        if (dominant !== 'water') {
          next[y][x] = dominant;
        }
      }
    });

    ctx.baseTerrain = next;
  }
}
```

---

## 18. 城市生成

文件：

```txt
src/game/strategic-gen/city-score.ts
src/game/strategic-gen/city-placement.ts
```

### 18.1 城市选址原则

城市喜欢：

```txt
平坦
靠近河流但不在河上
靠近海岸但不在海里
靠近平原
靠近道路潜力线
靠近战略咽喉
离其他城市不要太近
```

城市讨厌：

```txt
水上
山地
高坡
沼泽中心
深森林
沙漠深处
孤立地区
```

### 18.2 城市评分

```ts
function computeCityScoreAt(
  x: number,
  y: number,
  ctx: StrategicGenContext
): number {
  const terrain = ctx.baseTerrain[y][x];

  if (terrain === 'water') return -999;
  if (terrain === 'mountain') return -300;

  const slope = ctx.slope[y][x];
  if (slope > 0.20) return -200;

  const distRiver = distanceToRiver(x, y, ctx);
  const distOcean = distanceToOcean(x, y, ctx);
  const distLake = distanceToLake(x, y, ctx);

  const flatScore = clamp01(1 - slope / 0.18) * 35;

  const riverScore =
    distRiver === 0 ? -50 :
    distRiver <= 2 ? 30 :
    distRiver <= 5 ? 18 :
    distRiver <= 9 ? 8 :
    0;

  const coastScore =
    distOcean === 0 ? -999 :
    distOcean <= 2 ? 22 :
    distOcean <= 5 ? 12 :
    0;

  const lakeScore =
    distLake <= 3 ? 10 : 0;

  const terrainScore =
    terrain === 'plains' ? 30 :
    terrain === 'highland' ? 10 :
    terrain === 'forest' ? -6 :
    terrain === 'marshland' ? -35 :
    terrain === 'desert' ? -18 :
    0;

  const centralityScore = computeCentralityScore(x, y, ctx) * 12;
  const chokepointScore = ctx.chokepointValue[y][x] * 10;

  return (
    flatScore
    + riverScore
    + coastScore
    + lakeScore
    + terrainScore
    + centralityScore
    + chokepointScore
  );
}
```

### 18.3 城市放置顺序

必须按等级放：

```txt
capital
  ↓
major
  ↓
regional
  ↓
town
```

```ts
function placeCities(ctx: StrategicGenContext, config: StrategicGenConfig) {
  placeCityRank(ctx, 'capital', config.cities.capitalCount, config.cities.minCapitalDistance);
  placeCityRank(ctx, 'major', config.cities.majorCityCount, config.cities.minMajorDistance);
  placeCityRank(ctx, 'regional', config.cities.regionalCityCount, config.cities.minRegionalDistance);
  placeCityRank(ctx, 'town', config.cities.townCount, config.cities.minTownDistance);
}
```

### 18.4 城市距离压制

每放一个城市，就压低周围候选分。

```ts
function applyCityDistancePenalty(
  cityScore: number[][],
  cityPos: GenPosition,
  radius: number,
  strength: number
) {
  forEachCellInRadius(cityPos, radius, (x, y, d) => {
    const t = 1 - d / radius;
    cityScore[y][x] -= t * strength;
  });
}
```

建议参数：

```txt
capital: radius 28, strength 110
major: radius 13, strength 80
regional: radius 7, strength 45
town: radius 4, strength 25
```

### 18.5 城市写入

```ts
function writeCityToLayer(city: CityNode, ctx: StrategicGenContext) {
  const { x, y } = city.position;

  ctx.features[y][x].add('city');

  if (city.rank === 'capital') {
    ctx.features[y][x].add('capital');
  }

  ctx.supplyValue[y][x] +=
    city.rank === 'capital' ? 100 :
    city.rank === 'major' ? 70 :
    city.rank === 'regional' ? 40 :
    18;
}
```

---

## 19. 道路生成

文件：

```txt
src/game/strategic-gen/road-cost.ts
src/game/strategic-gen/road-network.ts
```

### 19.1 道路生成原则

道路必须在城市之后生成。

顺序：

```txt
1. 城市作为节点
2. 计算城市之间连接价值
3. 生成最小生成树，保证城市连通
4. 额外添加部分道路，形成环线和冗余
5. 用 A* 按地形代价铺路
6. 道路跨河时生成桥梁
```

### 19.2 城市重要度

```ts
function cityImportance(city: CityNode): number {
  switch (city.rank) {
    case 'capital': return 100;
    case 'major': return 70;
    case 'regional': return 35;
    case 'town': return 12;
  }
}
```

### 19.3 道路代价

```ts
function getRoadCostAt(
  x: number,
  y: number,
  ctx: StrategicGenContext
): number {
  const terrain = ctx.baseTerrain[y][x];

  if (ctx.oceanMask[y][x]) return 9999;
  if (ctx.lakeMask[y][x]) return 999;

  let cost = 1;

  switch (terrain) {
    case 'plains':
      cost += 1;
      break;
    case 'highland':
      cost += 3;
      break;
    case 'forest':
      cost += 5;
      break;
    case 'desert':
      cost += 5;
      break;
    case 'marshland':
      cost += 10;
      break;
    case 'mountain':
      cost += 18;
      break;
    case 'water':
      cost += 999;
      break;
  }

  cost += ctx.slope[y][x] * 45;

  const distRiver = distanceToRiver(x, y, ctx);

  // 靠近河谷容易修路，但不要直接走在河里。
  if (distRiver > 0 && distRiver <= 2) {
    cost -= 1.5;
  }

  if (ctx.features[y][x].has('main_road')) {
    cost -= 4;
  }

  if (ctx.features[y][x].has('secondary_road')) {
    cost -= 2;
  }

  return Math.max(1, cost);
}
```

### 19.4 A* 铺路

```ts
function buildRoadPath(
  start: GenPosition,
  goal: GenPosition,
  ctx: StrategicGenContext
): GenPosition[] {
  return aStar({
    start,
    goal,
    width: ctx.width,
    height: ctx.height,
    neighbors: getNeighbors8,
    cost: (p) => getRoadCostAt(p.x, p.y, ctx),
    heuristic: (p) => diagonalDistance(p, goal),
  });
}
```

### 19.5 道路写入

```ts
function writeRoadPath(
  path: GenPosition[],
  roadType: 'main' | 'secondary' | 'military',
  ctx: StrategicGenContext
) {
  const feature =
    roadType === 'main'
      ? 'main_road'
      : 'secondary_road';

  for (const p of path) {
    if (ctx.oceanMask[p.y][p.x]) continue;

    ctx.features[p.y][p.x].add(feature);

    if (ctx.riverLayer[p.y][p.x].isRiver) {
      ctx.features[p.y][p.x].add('bridge');
    }
  }
}
```

---

## 20. 桥梁生成

文件：

```txt
src/game/strategic-gen/bridge-placement.ts
```

桥梁只能由道路跨河产生。

不要随机放桥。

```ts
function placeBridges(ctx: StrategicGenContext, config: StrategicGenConfig) {
  forEachCell(ctx, (x, y) => {
    const hasRoad =
      ctx.features[y][x].has('main_road') ||
      ctx.features[y][x].has('secondary_road');

    const river = ctx.riverLayer[y][x];

    if (!hasRoad) return;
    if (!river.isRiver) return;

    if (river.width <= config.roads.bridgeMaxRiverWidth) {
      ctx.features[y][x].add('bridge');
      return;
    }

    const strategicCrossing =
      isNearCity({ x, y }, ctx, 4) ||
      ctx.chokepointValue[y][x] > 0.65;

    if (strategicCrossing) {
      ctx.features[y][x].add('bridge');
    } else {
      removeRoadAt(x, y, ctx);
    }
  });
}
```

---

## 21. 港口、要塞、机场、补给点

文件：

```txt
src/game/strategic-gen/feature-placement.ts
```

### 21.1 港口

港口只能在城市上。

条件：

```txt
是城市
靠海
坡度低
不是 town
```

```ts
function canPlacePort(city: CityNode, ctx: StrategicGenContext): boolean {
  const { x, y } = city.position;

  if (!ctx.features[y][x].has('city')) return false;
  if (distanceToOcean(x, y, ctx) > 2) return false;
  if (ctx.slope[y][x] > 0.12) return false;
  if (city.rank === 'town') return false;

  return true;
}
```

### 21.2 要塞

要塞适合放在：

```txt
山口
桥头
道路交汇
城市外围
高地边缘
```

不要放在城市中心。

```ts
function computeFortressScoreAt(
  x: number,
  y: number,
  ctx: StrategicGenContext
): number {
  if (ctx.waterMask[y][x]) return -999;
  if (ctx.features[y][x].has('city')) return -100;

  const terrain = ctx.baseTerrain[y][x];

  const terrainBonus =
    terrain === 'highland' ? 25 :
    terrain === 'mountain' ? 18 :
    terrain === 'forest' ? 8 :
    0;

  const bridgeBonus = isNearBridge({ x, y }, ctx, 3) ? 25 : 0;
  const roadJunctionBonus = computeRoadJunctionScore(x, y, ctx) * 25;
  const cityOuterBonus = isNearCity({ x, y }, ctx, 4) ? 18 : 0;

  return (
    terrainBonus
    + bridgeBonus
    + roadJunctionBonus
    + cityOuterBonus
    + ctx.chokepointValue[y][x] * 35
  );
}
```

### 21.3 机场

机场适合：

```txt
大城市附近
平坦
不是森林深处
不是沼泽
不是山地
有道路连接
```

```ts
function computeAirfieldScoreAt(
  x: number,
  y: number,
  ctx: StrategicGenContext
): number {
  const terrain = ctx.baseTerrain[y][x];

  if (terrain === 'water') return -999;
  if (terrain === 'mountain') return -300;
  if (terrain === 'marshland') return -200;
  if (ctx.slope[y][x] > 0.08) return -150;

  const flatScore = clamp01(1 - ctx.slope[y][x] / 0.08) * 45;
  const nearCityScore = distanceToMajorCity(x, y, ctx) <= 6 ? 30 : 0;
  const roadScore = hasRoadNearby({ x, y }, ctx, 3) ? 20 : 0;

  return flatScore + nearCityScore + roadScore;
}
```

---

## 22. 战略评价层

建议新增：

```txt
chokepointValue
defensiveValue
supplyValue
```

### 22.1 chokepointValue

高分位置：

- 山口；
- 河流桥梁；
- 道路交汇；
- 水域和山地之间的狭窄通道。

简单公式：

```ts
chokepointValue =
  narrowPassScore
  + bridgeScore
  + roadJunctionScore
  + terrainConstraintScore
```

### 22.2 defensiveValue

高分位置：

- 山地；
- 高地；
- 森林；
- 河流后方；
- 城市；
- 要塞。

简单公式：

```ts
defensiveValue =
  terrainDefense
  + elevationAdvantage
  + riverBarrierBonus
  + cityBonus
  + fortressBonus
```

### 22.3 supplyValue

高分位置：

- 城市；
- 港口；
- 主干道路；
- 机场；
- 补给点。

简单公式：

```ts
supplyValue =
  citySupply
  + portSupply
  + roadSupply
  + airfieldSupply
  + depotSupply
```

这些数据后续会用于 AI 指挥和战役图切分。

---

## 23. 合成 StrategicMap

文件：

```txt
src/game/strategic-gen/build-strategic-map.ts
```

将 `StrategicGenContext` 转成旧系统能用的 `StrategicMap`。

核心规则：

```ts
function computeDisplayTerrain(
  baseTerrain: StrategicBaseTerrainType,
  features: Set<StrategicFeatureType>
): StrategicTerrainType {
  if (features.has('capital')) return 'city';
  if (features.has('city')) return 'city';

  if (features.has('river') && baseTerrain !== 'water') {
    return 'water';
  }

  return baseTerrain;
}
```

更推荐的 UI 显示方式：

```txt
底层：baseTerrain 颜色
第二层：river 线
第三层：road 线
第四层：city 图标
第五层：fortress / port / airfield 图标
第六层：部队图标
```

但为了兼容旧代码，仍然输出：

```ts
sector.terrain
```

---

## 24. 修改 strategic-map.ts

将 `src/game/strategic-map.ts` 改成入口适配器。

推荐结构：

```ts
import { StrategicMap, StrategicPosition, StrategicSector } from './strategic-types';
import {
  DEFAULT_STRATEGIC_GEN_CONFIG,
  StrategicGenConfig,
} from './strategic-gen/strategic-gen-config';
import { generateStrategicWorld } from './strategic-gen/generate-strategic-world';

export function generateStrategicMap(
  config: Partial<StrategicGenConfig> = {}
): StrategicMap {
  return generateStrategicWorld({
    ...DEFAULT_STRATEGIC_GEN_CONFIG,
    ...config,
  });
}

export function getSector(
  map: StrategicMap,
  pos: StrategicPosition
): StrategicSector | null {
  if (pos.x < 0 || pos.x >= map.width || pos.y < 0 || pos.y >= map.height) {
    return null;
  }

  return map.sectors[pos.y][pos.x];
}

export function getStrategicNeighbors(
  map: StrategicMap,
  pos: StrategicPosition
): StrategicPosition[] {
  const dirs = [
    { x: 0, y: -1 },
    { x: 0, y: 1 },
    { x: -1, y: 0 },
    { x: 1, y: 0 },
  ];

  return dirs
    .map(d => ({ x: pos.x + d.x, y: pos.y + d.y }))
    .filter(p => p.x >= 0 && p.x < map.width && p.y >= 0 && p.y < map.height);
}

export function getStrategicMapDimensions(): { width: number; height: number } {
  return {
    width: DEFAULT_STRATEGIC_GEN_CONFIG.width,
    height: DEFAULT_STRATEGIC_GEN_CONFIG.height,
  };
}

export function getCitySectors(map: StrategicMap): StrategicPosition[] {
  const cities: StrategicPosition[] = [];

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const sector = map.sectors[y][x];

      if (sector.features?.includes('city') || sector.features?.includes('capital')) {
        cities.push({ x, y });
      }
    }
  }

  return cities;
}
```

如果需要保留旧版固定图，改名为：

```ts
export function generateLegacyStrategicMap(): StrategicMap {
  // old TERRAIN_LAYOUT logic
}
```

---

## 25. 合法性检查

文件：

```txt
src/game/strategic-gen/validation.ts
```

必须实现以下检查。

### 25.1 城市合法性

```ts
function validateCities(ctx: StrategicGenContext) {
  for (const city of ctx.cities) {
    const { x, y } = city.position;

    if (ctx.waterMask[y][x]) {
      moveCityToNearestValidCell(city, ctx);
    }

    if (ctx.baseTerrain[y][x] === 'mountain') {
      moveCityToNearestValidCell(city, ctx);
    }

    if (ctx.slope[y][x] > 0.2) {
      moveCityToNearestValidCell(city, ctx);
    }
  }
}
```

### 25.2 道路连通性

```ts
function validateRoadConnectivity(ctx: StrategicGenContext) {
  const importantCities = ctx.cities.filter(c =>
    c.rank === 'capital' ||
    c.rank === 'major' ||
    c.rank === 'regional'
  );

  if (!isRoadGraphConnected(importantCities, ctx.roads)) {
    repairRoadNetwork(ctx);
  }
}
```

### 25.3 桥梁合法性

```ts
function validateBridges(ctx: StrategicGenContext) {
  forEachCell(ctx, (x, y) => {
    if (!ctx.features[y][x].has('bridge')) return;

    const hasRiver = ctx.riverLayer[y][x].isRiver;
    const hasRoad =
      ctx.features[y][x].has('main_road') ||
      ctx.features[y][x].has('secondary_road');

    if (!hasRiver || !hasRoad) {
      ctx.features[y][x].delete('bridge');
    }
  });
}
```

### 25.4 道路不能大面积穿水

```ts
function validateRoadsDoNotCrossWater(ctx: StrategicGenContext) {
  for (const road of ctx.roads) {
    for (const p of road.path) {
      if (ctx.oceanMask[p.y][p.x]) {
        rerouteRoad(road, ctx);
      }
    }
  }
}
```

### 25.5 至少存在主要城市

检查：

```txt
必须有 1 个 capital
必须有至少 2 个 major
必须有至少 5 个 regional / town
```

如果不足，降低城市放置阈值重新放置。

---

## 26. 可视化调试

建议新增调试 overlay。

至少支持查看：

```txt
baseTerrain
elevation
slope
moisture
cityScore
roadCost
chokepointValue
defensiveValue
supplyValue
features
```

推荐在 UI 中新增一个调试模式选择：

```ts
type StrategicDebugLayer =
  | 'terrain'
  | 'elevation'
  | 'slope'
  | 'moisture'
  | 'cityScore'
  | 'roadCost'
  | 'chokepoint'
  | 'defense'
  | 'supply';
```

如果暂时不做 UI，至少在 console 输出统计：

```txt
地图尺寸
各地形数量
城市数量
道路数量
桥梁数量
河流长度
港口数量
要塞数量
机场数量
道路连通性
非法城市数量
非法桥梁数量
```

---

## 27. 最小可运行版本

第一版只要求做到：

```txt
地图尺寸：64×48

生成内容：
1. 高度图
2. 海洋 / 湖泊
3. 河流
4. 自然地形
5. 城市
6. 道路
7. 桥梁
8. 输出 StrategicMap
```

暂时可以不做：

```txt
铁路
复杂港口
复杂机场
复杂补给系统
真实战役切片
AI 指挥
报告系统
```

第一版完成后，地图应该满足：

```txt
城市不在水里
城市不在高山上
城市多数在平原、河边、海岸附近
道路连接主要城市
道路不会大量穿海
道路跨河处有桥梁
河流有源头和终点
河流能流向海洋 / 湖泊 / 地图边缘
自然地形不会过于碎裂
```

---

## 28. 分阶段开发顺序

### Phase 1：类型扩展

修改：

```txt
src/game/strategic-types.ts
```

新增：

```txt
StrategicBaseTerrainType
StrategicFeatureType
CityRank
StrategicSector.baseTerrain
StrategicSector.features
StrategicSector.gen
```

要求：

- 旧代码能继续编译；
- `sector.terrain` 保留；
- 新字段有默认值。

---

### Phase 2：创建 strategic-gen 基础框架

新增：

```txt
src/game/strategic-gen/strategic-gen-config.ts
src/game/strategic-gen/gen-context.ts
src/game/strategic-gen/generate-strategic-world.ts
src/game/strategic-gen/build-strategic-map.ts
```

要求：

- 能创建 `StrategicGenContext`；
- 能输出 `StrategicMap`；
- 暂时可以只生成全 plains。

---

### Phase 3：高度图、水域、坡度

新增：

```txt
heightmap.ts
slope.ts
water.ts
```

要求：

- 可以生成 elevation；
- 可以生成 waterMask / oceanMask / lakeMask；
- 可以计算 slope；
- `baseTerrain` 能初步区分 water / plains / mountain。

---

### Phase 4：河流和湿度

新增：

```txt
hydrology.ts
moisture.ts
temperature.ts
```

要求：

- 河流从高地生成；
- 河流可以到达海洋 / 湖泊 / 边缘；
- 河流写入 `features: river`；
- 湿度受水源影响。

---

### Phase 5：自然地形分类和平滑

新增：

```txt
terrain-classifier.ts
terrain-smoothing.ts
```

要求：

- 使用评分法分类；
- 不使用单一硬 if-else；
- 地形块状更自然；
- 孤立格减少。

---

### Phase 6：城市

新增：

```txt
city-score.ts
city-placement.ts
```

要求：

- 城市按等级放置；
- 城市不会在非法地形；
- 城市分布有距离；
- 城市靠近河流、海岸、平原、战略节点。

---

### Phase 7：道路和桥梁

新增：

```txt
road-cost.ts
road-network.ts
bridge-placement.ts
```

要求：

- 城市网络连通；
- 道路用 A* 生成；
- 道路避开高成本地形；
- 道路跨河生成桥梁。

---

### Phase 8：设施和战略价值

新增：

```txt
feature-placement.ts
```

实现：

- 港口；
- 要塞；
- 机场；
- 补给点；
- defensiveValue；
- chokepointValue；
- supplyValue。

---

### Phase 9：validation 和调试

新增：

```txt
validation.ts
```

要求：

- 地图生成后自动检查；
- 自动修复明显非法情况；
- console 输出统计信息。

---

## 29. 验收标准

### 29.1 编译标准

必须通过：

```bash
npm run build
```

或项目当前使用的等价构建命令。

如果项目没有 build，可至少通过：

```bash
npm run lint
npm run typecheck
```

如果这些脚本不存在，请不要新增复杂依赖，只保证 TypeScript 编译错误被清理。

---

### 29.2 地图生成标准

用固定 seed：

```ts
seed: 20260606
width: 64
height: 48
```

生成地图后应满足：

```txt
1. 有 1 个 capital
2. 有至少 4 个 major city
3. 有至少 8 个 regional city
4. 有至少 15 个 town
5. 所有城市都不在 water
6. 所有城市都不在 mountain
7. 所有城市 slope <= 0.20
8. 所有 important cities 之间道路连通
9. 所有 bridge 都同时具有 road 和 river
10. ocean 不被道路大面积穿越
11. 河流数量 >= 3
12. 至少有 1 条主河流长度 >= 20
13. 地形类型数量至少包含 plains / forest / mountain / water
```

---

### 29.3 视觉标准

地图看起来应该具备：

```txt
河流从高处向低处延伸
城市主要在河边、海岸、平原附近
道路连接城市，而不是随机散布
山地形成连续区域
森林形成连续区域
沼泽靠近水系
沙漠不贴着大河密集出现
桥梁只出现在道路跨河处
```

---

## 30. 给本地 AI 的执行要求

请本地 AI 按以下要求执行：

1. 不要一次性重写全部游戏。
2. 只重构战略地图生成相关代码。
3. 优先保证旧 UI 和旧战略系统不崩。
4. 所有新生成字段都要有 fallback。
5. 不要接入真实地图数据。
6. 不要引入大型新依赖。
7. 如果要新增 A*，优先自己实现简单版本。
8. 如果旧代码引用 `sector.terrain`，继续保持可用。
9. 新的 `baseTerrain` 和 `features` 必须写入每个 sector。
10. 每个生成阶段尽量独立成文件。
11. 每个阶段函数都应是纯函数或接近纯函数，便于调试。
12. 最终输出仍然必须是项目现有的 `StrategicMap` 结构。
13. 生成结果必须可复现：同一个 seed 生成同一张图。

---

## 31. 本次重构不做的内容

暂时不做：

```txt
真实地图
全球地图
地图瓦片系统
MapLibre
完整 AI 指挥系统
玩家命令解析
战役地图切片
战术地图详细生成
LLM 报告系统
多人联网
存档数据库重构
```

但数据结构要为后续保留：

```txt
supplyValue
defensiveValue
chokepointValue
cityRank
riverWidth
features
```

---

## 32. 最后目标

本次重构完成后，项目应从：

```txt
一个 terrain 矩阵
```

升级为：

```txt
自然地理层
  +
水系层
  +
城市层
  +
道路层
  +
桥梁层
  +
战略评价层
  +
兼容旧 StrategicMap 的输出层
```

这会让后续继续开发：

- 战区战略图；
- 战役地图；
- AI 指挥系统；
- 战况报告系统；

变得可行。
