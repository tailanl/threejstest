# CURRENT_REFACTOR_README：当前版本下一步具体修改方案

## 0. 当前状态判断

当前项目已经不是“完全没实现”。现在已经出现了两套并行结构：

### A. 新目录结构

```txt
src/game/world-atlas/
src/game/world-map/
src/game/world-view/
src/game/command/
src/game/ai-command/
src/game/reports/
src/game/combat-modern/
```

### B. 根目录平行文件

```txt
src/game/world-map-generator.ts
src/game/world-map-chunks.ts
src/game/world-map-cities.ts
src/game/world-map-config.ts
src/game/world-map-features.ts
src/game/world-map-hydrology.ts
src/game/world-map-roads.ts
src/game/world-map-strategic-adapter.ts
src/game/world-map-terrain.ts
src/game/world-map-types.ts
src/game/world-map-view.ts
src/game/world-to-game-map.ts
```

这说明当前代码已经开始实现 WorldMap / WorldAtlas，但存在明显问题：

```txt
1. 有重复架构：world-atlas / world-map / world-view 目录，与 src/game 根目录下 world-map-* 文件并存。
2. region-tile-generator.ts 已经有大量逻辑，但代码压缩在单行，不利于维护。
3. StrategicChunk 汇总逻辑被写在 region-tile-generator.ts 内部，不应该内嵌。
4. world-map-generator.ts、world-map-chunks.ts、world-map-strategic-adapter.ts 等根目录文件看起来可能为空或未接入。
5. UI 面板文件已经有，但可能没有真正接入主 GameUI / StrategicMap。
6. AI、报告、现代战斗模块有骨架，但可能没有接入真实战斗流程。
```

当前目标：

```txt
不要继续新增新架构。
不要继续新建空文件。
现在要整理、去重、接入、跑通最小闭环。
```

最小闭环是：

```txt
generateWorldAtlas()
  ↓
generateRegionTile(atlas, regionX, regionY)
  ↓
RegionTile 1024×1024
  ↓
buildStrategicChunks(regionTile)
  ↓
buildStrategicMapFromRegionTile(regionTile)
  ↓
StrategicMap UI
  ↓ 点击战略格
getOperationView(regionTile, center, width, height)
  ↓ 点击战役格
getCombatViewport(regionTile, center, width, height)
  ↓
convertCombatViewportToGameMap(viewport)
  ↓
旧战术战棋系统
  ↓
AI 执行
  ↓
BattleLogEvent
  ↓
AIReport
```

---

## 1. 本次修改原则

### 1.1 禁止继续扩散文件

禁止继续新增：

```txt
world-map-v2.ts
new-region-generator.ts
better-map-generator.ts
ultimate-ai.ts
```

当前已有文件已经足够多。

现在应该做：

```txt
1. 确定唯一主路径。
2. 删除或合并重复逻辑。
3. 把孤立模块接入游戏流程。
4. 保证 build / lint 通过。
```

---

### 1.2 唯一主路径

以后统一使用这个主路径：

```txt
src/game/world-atlas/
  atlas-types.ts
  atlas-config.ts
  coordinates.ts
  macro-map-generator.ts
  region-tile-generator.ts
  region-cache.ts

src/game/world-map/
  world-cell-types.ts
  world-map-types.ts

src/game/world-view/
  strategic-chunks.ts
  strategic-map-adapter.ts
  operation-view.ts
  combat-viewport.ts
  world-to-game-map.ts
```

也就是说：

```txt
WorldAtlas / RegionTile / StrategicChunk / OperationView / CombatViewport
```

以目录版为主。

根目录下这些文件如果有内容：

```txt
src/game/world-map-generator.ts
src/game/world-map-chunks.ts
src/game/world-map-strategic-adapter.ts
src/game/world-map-view.ts
src/game/world-to-game-map.ts
```

处理方式：

```txt
1. 如果里面是空文件：删除或保留但不要引用。
2. 如果里面有有效实现：迁移到 world-atlas / world-map / world-view 对应目录。
3. 不允许同一功能存在两个实现。
```

---

## 2. 立即要做的文件整理

### 2.1 整理 region-tile-generator.ts

当前：

```txt
src/game/world-atlas/region-tile-generator.ts
```

已经包含：

```txt
generateRegionTile
TileRNG
TileNoise
terrain classify
river generation
city generation
road generation
bridge placement
strategic chunk building
```

问题：

```txt
文件过大
逻辑混杂
有 buildRegionStrategicChunks 内嵌函数
城市、道路、河流算法不可复用
难以 debug
```

必须拆分。

拆成：

```txt
src/game/world-atlas/region-tile-generator.ts
src/game/world-map/world-map-terrain.ts
src/game/world-map/world-map-rivers.ts
src/game/world-map/world-map-cities.ts
src/game/world-map/world-map-roads.ts
src/game/world-map/world-map-features.ts
src/game/world-view/strategic-chunks.ts
```

### 2.2 region-tile-generator.ts 最终只保留编排

重构后 `region-tile-generator.ts` 只允许负责流程编排：

```ts
export function generateRegionTile(
  atlas: WorldAtlas,
  regionX: number,
  regionY: number
): RegionTile {
  const ctx = createRegionGenerationContext(atlas, regionX, regionY);

  generateRegionBaseCells(ctx);
  applyMacroTerrainConstraints(ctx);

  generateRegionRivers(ctx);
  generateRegionCities(ctx);
  generateRegionRoads(ctx);
  placeRegionBridges(ctx);
  placeRegionFeatures(ctx);

  computeRegionCellStats(ctx);
  validateRegionTile(ctx);

  const tile = buildRegionTile(ctx);
  tile.strategicChunks = buildStrategicChunks(tile, atlas.strategicChunkSize ?? 32);

  return tile;
}
```

不允许再把城市、道路、河流和 chunk 汇总全部写在这个文件内部。

---

## 3. 具体拆分任务

## 3.1 新增 / 完善 RegionGenerationContext

新建或完善：

```txt
src/game/world-map/world-map-types.ts
```

加入：

```ts
export interface RegionGenerationContext {
  atlas: WorldAtlas;

  regionX: number;
  regionY: number;

  regionSize: number;
  padding: number;

  worldOrigin: {
    globalX: number;
    globalY: number;
  };

  rng: RegionRNG;
  noise: RegionNoise;

  paddedCells: WorldCell[][];
  cells: WorldCell[][];

  cities: GeneratedCity[];
  roads: GeneratedRoad[];
  rivers: GeneratedRiver[];
}
```

如果当前已有类似类型，不要重复定义，直接扩展。

---

## 3.2 抽出随机数和噪声

当前 `TileRNG` 和 `TileNoise` 在 `region-tile-generator.ts` 里。

应移到：

```txt
src/game/world-atlas/coordinates.ts
```

或新增：

```txt
src/game/world-atlas/region-random.ts
```

推荐新增：

```txt
src/game/world-atlas/region-random.ts
```

导出：

```ts
export class RegionRNG { ... }
export class RegionNoise { ... }
```

要求：

```txt
1. 同 seed + regionX + regionY 结果稳定。
2. 地形采样必须使用 globalX/globalY。
3. 相邻 region 边缘不能明显断裂。
```

---

## 4. RegionTile 生成具体要求

## 4.1 generateRegionBaseCells

文件：

```txt
src/game/world-map/world-map-terrain.ts
```

实现：

```ts
export function generateRegionBaseCells(ctx: RegionGenerationContext): void;
```

要求：

```txt
1. 生成 1024×1024 cells。
2. 内部计算使用 padding = 16。
3. 每个 WorldCell 必须有：
   - globalX/globalY
   - regionX/regionY
   - localX/localY
   - baseTerrain
   - features
   - elevation
   - slope
   - moisture
   - temperature
   - populationDensity
   - economicValue
   - infrastructureValue
   - movementCost
   - defenseBonus
   - concealment
   - cover
   - visionBlock
```

地形输入：

```txt
1. global noise
2. MacroCell biome
3. MacroCell elevation/moisture/temperature
4. atlas political/economic/humanGeographyZones
```

必须用：

```ts
const globalX = regionX * regionSize + localX;
const globalY = regionY * regionSize + localY;
```

禁止只用 localX/localY。

---

## 4.2 地形判定

基础规则：

```txt
macro biome = ocean      → baseTerrain 倾向 water
macro biome = mountain   → baseTerrain 倾向 mountain/highland
macro biome = forest     → baseTerrain 倾向 forest
macro biome = marshland  → baseTerrain 倾向 marshland
macro biome = desert     → baseTerrain 可为 desert，但全局比例必须受限制
macro biome = plains     → baseTerrain 倾向 plains
```

不能用过硬规则导致满图沙漠。

要求：

```txt
默认 desert ratio <= 4%
```

如果 region 内 desert 太多：

```txt
把多余 desert 转 plains/highland/forest
```

---

## 4.3 slope 不能伪造

当前代码中 `slope = elevation > 0.5 ? (elevation - 0.5) * 0.5 : 0` 过于粗糙。

必须改成邻域计算：

```ts
function computeSlopeFromNeighbors(cells: WorldCell[][], x: number, y: number): number {
  const h = cells[y][x].elevation;
  let maxDiff = 0;

  for dy -1..1:
    for dx -1..1:
      if dx === 0 && dy === 0 continue;
      compare neighbor elevation;

  return maxDiff;
}
```

注意 padding 的作用就是让边界也能算 slope。

---

## 5. 河流生成修改

文件：

```txt
src/game/world-map/world-map-rivers.ts
```

导出：

```ts
export function generateRegionRivers(ctx: RegionGenerationContext): void;
```

当前代码问题：

```txt
1. 只看 macro hasMajorRiver，然后在 region 内找最高点向下走。
2. 河流可能断在 region 内。
3. 不一定和相邻 region 连续。
4. 不是从 MacroHydrology 的 RiverBasin 路径细化。
```

第一阶段可以先不做完整 RiverBasin，但必须改进：

### 5.1 河流应根据 MacroCell hasMajorRiver 走廊生成

步骤：

```txt
1. 找出本 region 对应 macroRect。
2. 找出 hasMajorRiver 的 macro cells。
3. 把这些 macro cells 映射到 region 内的大致走廊。
4. 在走廊内生成连续 river path。
5. river path 必须从 region 一边进入，另一边流出，或流入 water。
```

### 5.2 河流方向

根据相邻 macroCells 的 river 分布决定：

```txt
如果左/右 macro 有 river → west-east
如果上/下 macro 有 river → north-south
如果斜向连续 → diagonal
```

如果无法判断，使用全局高度下降方向。

### 5.3 写入

```ts
cell.features.push('river')
```

大河：

```ts
if riverWidth >= 2:
  cell.baseTerrain = 'water'
```

### 5.4 验收

```txt
region 内 river path 长度 >= 50
river cell 连续
如果 river 到达 region 边缘，边缘 cell 必须带 river feature
```

---

## 6. 城市生成修改

文件：

```txt
src/game/world-map/world-map-cities.ts
```

导出：

```ts
export function generateRegionCities(ctx: RegionGenerationContext): void;
```

当前代码问题：

```txt
1. 每个 region 只根据 avgSettlement 随机放 0~4 个城市。
2. rank 只有 regional/town，没有 capital/major。
3. 城市没有来自 MacroSettlement 或政治经济中心。
4. cityIds/chunkIds 不完整。
```

### 6.1 先实现 region 内城市逻辑

第一阶段不需要全 Atlas 城市列表，但至少要：

```txt
1. 高 settlementPotential 的 region 可能出现 regional。
2. 中 settlementPotential 出现 town。
3. 经济区 / 人文区覆盖区域增加城市概率。
4. city center 不得在 water/mountain。
5. 城市面积必须足够。
```

### 6.2 城市 rank

规则：

```txt
如果 region 内 economicValue 很高，且 populationDensity 高：
  允许 major

如果 settlementPotential 高：
  regional

否则：
  town
```

暂时不在每个 region 随机 capital。Capital 应该由 Atlas 级生成，下一阶段做。

### 6.3 城市面积要求

```txt
major radius: 25-45
regional radius: 12-25
town radius: 5-12
```

如果生成 `major`：

```txt
city cells >= 1000
```

如果生成 `regional`：

```txt
city cells >= 250
```

如果生成 `town`：

```txt
city cells >= 60
```

### 6.4 城市绘制

城市不能是正方形。

用距离 + noise：

```ts
if d < radius * 0.25:
  city_center + urban_block
else if d < radius * 0.70 + noise:
  urban_block
else if d < radius + noise:
  suburb / field
```

城市写入：

```ts
cell.baseTerrain = 'city'
cell.features.push('urban_block' | 'suburb' | 'city_center' | 'industrial')
cell.populationDensity += ...
cell.economicValue += ...
cell.infrastructureValue += ...
```

### 6.5 城市道路

城市内部必须至少有：

```txt
东西主路
南北主路
```

写入 feature：

```txt
main_road 或 secondary_road
```

不要把 city 改成 road。

---

## 7. 道路生成修改

文件：

```txt
src/game/world-map/world-map-roads.ts
```

导出：

```ts
export function generateRegionRoads(ctx: RegionGenerationContext): void;
```

当前代码问题：

```txt
1. 城市之间用直线连接，容易穿水穿山。
2. path.globalX/globalY 计算可能不严谨。
3. 没有使用 A* 成本。
```

必须改成 A*。

### 7.1 A* 输入

```ts
start = cityA.center local position
goal = cityB.center local position
costFn = getRoadCost(cell)
```

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
existing road: 0.5
```

### 7.2 道路写入

```ts
cell.features.push('main_road' | 'secondary_road')
```

不要：

```ts
cell.baseTerrain = 'road'
```

因为 WorldTerrainType 没有 road。

### 7.3 道路连接策略

第一版：

```txt
如果 region 内城市 >= 2：
  用 MST 或 nearest-neighbor 连接城市。

如果 region 内城市 = 1：
  从城市向 region 边缘生成 1~2 条出口道路。

如果 region 无城市但 macro roadCorridorPotential 高：
  生成贯穿 region 的 main_road。
```

---

## 8. 桥梁生成修改

文件：

```txt
src/game/world-map/world-map-features.ts
```

导出：

```ts
export function placeRegionBridges(ctx: RegionGenerationContext): void;
```

规则：

```txt
bridge 只能在 road + river 同格
```

实现：

```ts
const hasRoad =
  cell.features.includes('main_road') ||
  cell.features.includes('secondary_road');

const hasRiver =
  cell.features.includes('river') ||
  cell.features.includes('stream');

if hasRoad && hasRiver:
  add bridge
```

校验：

```txt
invalidBridgeCount 必须为 0
```

---

## 9. StrategicChunk 汇总必须从 region-tile-generator 拆出

文件：

```txt
src/game/world-view/strategic-chunks.ts
```

当前如果里面只有类型，必须补实现：

```ts
export function buildStrategicChunks(
  regionTile: RegionTile,
  chunkSize: number = 32
): StrategicChunk[][];
```

注意：

```txt
不要继续在 region-tile-generator.ts 内部定义 buildRegionStrategicChunks。
```

### 9.1 统计内容

每个 chunk 汇总 32×32 WorldCell：

```txt
terrainMix
dominantTerrain
hasCity
hasCapital
hasRiver
hasMainRoad
hasSecondaryRoad
hasBridge
hasFortress
hasAirfield
hasSupplyDepot
hasEconomicTarget
cityIds
supply
defense
movement
chokepoint
victoryPoint
economic
political
control
knownByPlayer
```

### 9.2 chunk cityIds

不要只看 city center 是否在 chunk 中。

应该看：

```txt
如果 city bounds 与 chunk worldRect 相交，则 cityIds 包含该 city。
```

因为大城市会跨多个 chunk。

---

## 10. StrategicMap 适配

文件：

```txt
src/game/world-view/strategic-map-adapter.ts
```

或如果当前项目使用：

```txt
src/game/world-map-strategic-adapter.ts
```

必须统一为目录版：

```txt
src/game/world-view/strategic-map-adapter.ts
```

导出：

```ts
export function buildStrategicMapFromRegionTile(regionTile: RegionTile): StrategicMap
```

要求：

```txt
1. StrategicMap.width = regionTile.strategicChunks[0].length
2. StrategicMap.height = regionTile.strategicChunks.length
3. 每个 StrategicSector 对应一个 StrategicChunk
4. StrategicSector.baseTerrain = chunk.dominantTerrain 映射
5. StrategicSector.features = chunk features 映射
6. StrategicSector.gen 填 supply / defense / movement / chokepoint 等
7. 保留 force = null
8. 保留 tacticalMapSeed
```

---

## 11. OperationView 接入

文件：

```txt
src/game/world-view/operation-view.ts
```

已经有 `getOperationView` 的话，检查并修复：

```txt
1. 输入 center 必须是 global position。
2. 支持从 regionTile.cells 裁剪。
3. 如果裁剪越界，clamp 或返回边缘。
4. involvedChunks 必须根据 worldRect 与 chunk.worldRect 相交计算。
```

新增：

```ts
export function getOperationViewForChunk(
  regionTile: RegionTile,
  chunk: StrategicChunk,
  size: number = 128
): OperationView
```

点击战略 chunk 时直接用这个。

---

## 12. CombatViewport 接入

文件：

```txt
src/game/world-view/combat-viewport.ts
```

检查：

```txt
1. CombatViewport center 是 global position。
2. width/height 默认 64×48。
3. battleType 根据裁剪 cells 推断。
4. 不重新生成地图。
```

新增：

```ts
export function getCombatViewportFromOperationCell(params: {
  regionTile: RegionTile;
  operationView: OperationView;
  center: WorldPosition;
  width?: number;
  height?: number;
}): CombatViewport
```

---

## 13. GameMap 转换

文件：

```txt
src/game/world-view/world-to-game-map.ts
```

检查并增强：

```txt
1. bridge → bridge
2. fortress/checkpoint → fortress
3. city/urban_block/industrial/city_center → city
4. road feature → road
5. water → water
6. marshland → swamp
7. highland → mountain 或 plains，按当前 TerrainType 支持情况
```

同时保留 features：

如果 `MapCell` 没有 `features` 字段，修改：

```txt
src/game/types.ts
```

增加：

```ts
features?: string[];
```

不要破坏旧字段：

```txt
isRoad
roadType
```

---

## 14. UI 接入

当前 UI 组件存在，但可能没有接入。

必须修改：

```txt
src/components/game/GameUI.tsx
src/components/game/StrategicMap.tsx
```

或当前项目实际入口。

### 14.1 战略图点击

点击 StrategicSector：

```txt
1. 找到对应 StrategicChunk。
2. 调用 getOperationViewForChunk(regionTile, chunk, 128)。
3. 设置 selectedOperationView。
4. 显示 OperationViewPanel。
```

### 14.2 OperationView 点击

点击 OperationView cell：

```txt
1. 获取 global position。
2. 调用 getCombatViewportFromOperationCell。
3. 调用 convertCombatViewportToGameMap。
4. 进入旧战术战棋。
```

### 14.3 面板接入

至少接入：

```txt
OperationViewPanel
AIReportPanel
CommandInputPanel
ForceDelegationPanel
WorldDebugPanel
```

如果时间不足，先接：

```txt
OperationViewPanel
CommandInputPanel
AIReportPanel
```

---

## 15. Command / AI / Report 最小闭环

当前已经有：

```txt
src/game/command/command-types.ts
src/game/command/command-parser.ts
src/game/ai-command/ai-planner.ts
src/game/ai-command/ai-executor.ts
src/game/reports/report-types.ts
```

必须补：

```txt
src/game/reports/report-generator.ts
```

### 15.1 ReportGenerator

实现：

```ts
export function generateReportsFromBattleLog(params: {
  events: BattleLogEvent[];
  turn: number;
  commanderId: string;
}): AIReport[];
```

最低支持：

```txt
SITREP
INTREP
BDA
LOGREP
WARNING
ORDER_CONFIRMATION
```

规则：

```txt
unit_spotted → INTREP
unit_lost / unit_damaged → BDA
supply_used / resupply_completed → LOGREP
order_received → ORDER_CONFIRMATION
order_failed → WARNING
objective_captured → SITREP
```

### 15.2 facts 和 estimates

```txt
confirmedByPlayer = true 或 visibilityConfidence = confirmed → facts
visibilityConfidence = estimated → estimates
```

报告不能凭空编造。

---

## 16. StrategicForce 指挥权接入

文件：

```txt
src/game/strategic-types.ts
```

给 `StrategicForce` 增加 optional 字段：

```ts
command?: ForceCommandState;
```

不要破坏旧结构。

新增：

```txt
src/game/command/delegation.ts
```

实现：

```ts
export function delegateForceToAI(params: {
  force: StrategicForce;
  commanderId: string;
  autonomy: 'strict' | 'normal' | 'high';
  riskTolerance: 'low' | 'medium' | 'high';
  reportLevel: 'summary' | 'normal' | 'detailed';
}): StrategicForce

export function recallForceFromAI(force: StrategicForce): StrategicForce
```

---

## 17. Modern Combat 接入最小版

当前 `combat-modern` 模块有 LOS、装甲、补给等雏形。

本阶段不要重写整个 engine。

先在：

```txt
src/game/engine.ts
src/game/ai.ts
```

做最小接入。

### 17.1 Unit modern 字段

在 `src/game/types.ts` 中给 Unit 增加：

```ts
modern?: ModernCombatStats;
```

保持 optional。

### 17.2 AI 使用 LOS

在 AI 选目标前：

```txt
如果 target 不在 LOS 内，不能直接攻击。
```

### 17.3 攻击后加 suppression

攻击命中或炮击时：

```txt
target.modern.suppression += ...
target.modern.morale -= ...
```

如果旧单位没有 modern 字段：

```txt
使用旧逻辑 fallback。
```

---

## 18. 构建要求

必须运行：

```bash
npm run build
```

如果项目没有 build 或 build 太慢，至少运行：

```bash
npm run lint
```

如果 lint 没有，运行：

```bash
npx tsc --noEmit
```

修复：

```txt
TypeScript 类型错误
import 路径错误
重复定义错误
未使用或导出错误
```

---

## 19. 禁止事项

```txt
1. 不要再新增平行 world-map-v3 文件。
2. 不要保留同一功能两份实现。
3. 不要让 region-tile-generator.ts 继续无限膨胀。
4. 不要让 UI 组件继续孤立不接入。
5. 不要让 report 只有类型没有 generator。
6. 不要让 combat-modern 只存在但不接 engine。
7. 不要让 AI 全知隐藏敌人。
8. 不要让战术图重新随机。
9. 不要删除旧 map.ts / procedural-map.ts fallback。
10. 不要一次性展开 8×8 个 1024×1024 RegionTile。
```

---

## 20. 分阶段执行顺序

### Phase 1：整理重复文件

目标：

```txt
确定目录版为主实现。
迁移根目录 world-map-* 中有价值代码。
删除或停止引用空文件。
```

验收：

```txt
没有同名功能两套实现。
import 路径统一。
```

---

### Phase 2：拆分 region-tile-generator

目标：

```txt
region-tile-generator.ts 只做编排。
城市/道路/河流/chunk 汇总分别拆出。
```

验收：

```txt
generateRegionTile 能正常返回 RegionTile。
代码可读。
```

---

### Phase 3：实现 StrategicChunk 汇总

目标：

```txt
buildStrategicChunks(regionTile, 32)
```

验收：

```txt
1024×1024 RegionTile → 32×32 StrategicChunk
```

---

### Phase 4：实现 StrategicMap adapter

目标：

```txt
buildStrategicMapFromRegionTile(regionTile)
```

验收：

```txt
旧 StrategicMap UI 能显示新战略图。
```

---

### Phase 5：OperationView / CombatViewport UI 接入

目标：

```txt
点击战略 chunk → OperationView
点击 OperationView cell → CombatViewport → GameMap
```

验收：

```txt
战术图来自 RegionTile 裁剪，不重新随机。
```

---

### Phase 6：Command / AI / Report 最小闭环

目标：

```txt
输入命令 → HQOrder → AIPlan → AIExecutionLog → AIReport
```

验收：

```txt
AIReportPanel 能显示报告。
```

---

### Phase 7：Modern Combat 最小接入

目标：

```txt
LOS + suppression + morale + ammo/fuel 基础接入 engine/ai。
```

验收：

```txt
AI 不攻击不可见目标。
攻击能产生 suppression。
补给状态能影响行动。
```

---

## 21. 最终验收标准

必须输出：

```txt
1. 修改文件列表。
2. 删除/合并了哪些重复文件。
3. RegionTile 是否能生成 1024×1024。
4. StrategicChunk 是否为 32×32。
5. StrategicMap 是否来自 RegionTile。
6. 点击战略图是否能打开 OperationView。
7. 点击 OperationView 是否能进入 CombatViewport。
8. CombatViewport 是否能转 GameMap。
9. 命令是否能生成 HQOrder。
10. AI 是否能生成计划。
11. ReportGenerator 是否能生成 AIReport。
12. combat-modern 是否至少接入 LOS / suppression / logistics。
13. npm run build / lint / tsc 结果。
14. 仍未完成的问题。
```

---

## 22. 给 Codex 的直接指令

```txt
你现在不要再新增架构性空文件。请基于当前 threejstest 仓库做收敛性重构。

第一步：
检查 src/game/world-atlas、src/game/world-map、src/game/world-view，以及 src/game 根目录下 world-map-* 文件。
确定目录版为主实现，把根目录平行实现中有价值内容迁移到目录版，空文件停止引用。

第二步：
重构 src/game/world-atlas/region-tile-generator.ts。
把 TileRNG/TileNoise 抽出到 region-random.ts。
把 terrain/city/road/river/bridge/chunk 汇总拆到对应模块。
region-tile-generator.ts 只保留 generateRegionTile 编排逻辑。

第三步：
实现 src/game/world-view/strategic-chunks.ts 的 buildStrategicChunks(regionTile, chunkSize)。
不要再把 chunk 汇总写在 region-tile-generator.ts 内部。

第四步：
实现或修复 src/game/world-view/strategic-map-adapter.ts。
确保 RegionTile 能转换成旧 StrategicMap。

第五步：
接入 UI。
点击战略格时打开 OperationView。
点击 OperationView cell 时生成 CombatViewport。
CombatViewport 转 GameMap 后进入旧战术系统。

第六步：
实现 src/game/reports/report-generator.ts。
从 BattleLogEvent[] 生成 AIReport[]。
支持 SITREP / INTREP / BDA / LOGREP / WARNING / ORDER_CONFIRMATION。

第七步：
给 StrategicForce 增加 command?: ForceCommandState。
实现 delegateForceToAI 和 recallForceFromAI。
接入 ForceDelegationPanel。

第八步：
把 combat-modern 最小接入 engine.ts 和 ai.ts。
至少实现：
- AI 不能攻击 LOS 外目标
- 攻击增加 suppression
- morale 影响行动
- ammo/fuel 影响行动

第九步：
运行 npm run build 或 npm run lint 或 npx tsc --noEmit。
修复所有类型错误。

完成后输出：
- 修改文件
- 新增文件
- 删除/弃用文件
- 最小闭环是否跑通
- 构建结果
```

---

## 23. 当前最重要的一句话

现在不要再扩展“想做什么”。

当前最重要的是把这条链跑通：

```txt
WorldAtlas
  → RegionTile
  → StrategicChunk
  → StrategicMap
  → OperationView
  → CombatViewport
  → GameMap
  → AICommand
  → BattleLog
  → AIReport
```

只要这条链跑通，后面再慢慢加更真实的政治经济人文地理、复杂 AI、现代战斗细节。
