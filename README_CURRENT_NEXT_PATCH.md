# README_CURRENT_NEXT_PATCH

## 0. 当前任务目标

当前项目已经有这些骨架：

```txt
WorldAtlas
RegionTile
StrategicChunk
StrategicMap
OperationView
CombatViewport
GameMap
AICommand
BattleLog
AIReport
CombatModern
```

本轮不要继续新增大架构，不要继续创建空文件。  
目标是把已有模块接成一个真正能跑的闭环：

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
  → UI 显示
```

---

## 1. 统一地图实现，停止两套 world-map 并行

当前同时存在目录版：

```txt
src/game/world-atlas/
src/game/world-map/
src/game/world-view/
```

以及根目录平行文件：

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

统一主实现为：

```txt
src/game/world-atlas/
src/game/world-map/
src/game/world-view/
```

处理规则：

```txt
1. 根目录 world-map-* 如果为空，删除或停止引用。
2. 如果有有效代码，迁移到目录版对应文件。
3. 如果暂时不能删除，在文件顶部标记 deprecated。
4. 所有新代码统一 import 目录版路径。
5. 不允许同一功能两套实现。
```

检查命令：

```bash
grep -R "from './world-map-" src/game
grep -R "from '@/game/world-map-" src/game
```

如果仍有 root world-map-* import，必须迁移或说明保留原因。

---

## 2. 修复 OperationView / CombatViewport 的 global/local 坐标

修改：

```txt
src/game/world-view/operation-view.ts
src/game/world-view/combat-viewport.ts
```

输入 center 是 global 坐标，但裁剪 `regionTile.cells` 时必须使用 local 坐标。

正确逻辑：

```ts
const localCenterX = center.globalX - regionTile.worldOrigin.globalX;
const localCenterY = center.globalY - regionTile.worldOrigin.globalY;

const startX = clamp(
  localCenterX - Math.floor(width / 2),
  0,
  regionTile.width - width
);

const startY = clamp(
  localCenterY - Math.floor(height / 2),
  0,
  regionTile.height - height
);
```

裁剪时使用：

```ts
regionTile.cells[localY][localX]
```

输出 `worldRect` 时再转回 global：

```ts
worldRect: {
  x: regionTile.worldOrigin.globalX + startX,
  y: regionTile.worldOrigin.globalY + startY,
  width,
  height,
}
```

验收：

```txt
region 0,0 可以裁剪
region 1,0 可以裁剪
region 0,1 可以裁剪
裁剪不会越界
worldRect 永远是 global 坐标
```

---

## 3. 修复 strategic-store 调用 CombatViewport 的参数

修改：

```txt
src/store/strategic-store.ts
```

如果有：

```ts
getCombatViewportFromOperationCell({
  regionTile: currentRegionTile,
  centerGlobalX: pos.globalX,
  centerGlobalY: pos.globalY,
  width: 64,
  height: 48,
})
```

改成：

```ts
getCombatViewportFromOperationCell({
  regionTile: currentRegionTile,
  cellPosition: pos,
  width: 64,
  height: 48,
})
```

然后：

```ts
const gameMap = convertCombatViewportToGameMap(viewport);

set({
  selectedCombatViewport: viewport,
  tacticalMapFromWorld: gameMap,
});
```

禁止继续使用不存在的：

```txt
centerGlobalX
centerGlobalY
```

---

## 4. 删除 strategic-store 的动态 require fallback

修改：

```txt
src/store/strategic-store.ts
```

如果有：

```ts
const { getOperationViewForChunk } = require(...);
const { getCombatViewportFromOperationCell } = require(...);
```

改成顶部静态 import：

```ts
import { getOperationViewForChunk } from '@/game/world-view/operation-view';
import { getCombatViewportFromOperationCell } from '@/game/world-view/combat-viewport';
import { convertCombatViewportToGameMap } from '@/game/world-view/world-to-game-map';
```

删除动态 require。

删除假的 fallback `OperationView` object。不要构造这种伪对象：

```ts
{
  id,
  center,
  width,
  height,
  cells: [],
  chunkIds: []
}
```

失败时只：

```ts
console.error(error);
return;
```

---

## 5. 修复 city.bounds 的 global/local 混用

修改位置可能是：

```txt
src/game/world-atlas/region-tile-generator.ts
```

或拆分后：

```txt
src/game/world-map/world-map-cities.ts
```

如果 `city.center` 是 global：

```ts
center: {
  globalX: ox + bestX,
  globalY: oy + bestY,
}
```

那么 `city.bounds` 也必须是 global。

错误：

```ts
bounds: { minX, minY, maxX, maxY }
```

正确：

```ts
bounds: {
  minX: ox + minX,
  minY: oy + minY,
  maxX: ox + maxX,
  maxY: oy + maxY,
}
```

验收：

```txt
city.center 是 global
city.bounds 是 global
StrategicChunk.worldRect 是 global
大城市跨多个 chunk 时，所有相交 chunk 都能拿到 cityId
```

---

## 6. RegionTile 必须使用目录版 buildStrategicChunks

如果 `region-tile-generator.ts` 内部还有：

```ts
buildRegionStrategicChunks(...)
```

停止使用。

在 `region-tile-generator.ts` 顶部 import：

```ts
import { buildStrategicChunks } from '../world-view/strategic-chunks';
```

生成 tile 后：

```ts
const tile: RegionTile = {
  id,
  atlasId: atlas.id,
  regionX,
  regionY,
  worldOrigin,
  width,
  height,
  cells,
  strategicChunks: [],
  cities,
  roads,
  rivers,
  politicalRegionIds,
  economicZoneIds,
  humanGeographyZoneIds,
};

tile.strategicChunks = buildStrategicChunks(
  tile,
  atlas.strategicChunkSize ?? 32
);

return tile;
```

验收：

```txt
regionSize = 1024
chunkSize = 32
regionTile.strategicChunks.length === 32
regionTile.strategicChunks[0].length === 32
```

---

## 7. 真正拆分 region-tile-generator.ts

当前可能已经有这些文件，但部分仍为空：

```txt
src/game/world-map/world-map-terrain.ts
src/game/world-map/world-map-rivers.ts
src/game/world-map/world-map-cities.ts
src/game/world-map/world-map-roads.ts
src/game/world-map/world-map-features.ts
src/game/world-map/world-map-validation.ts
```

要把 `region-tile-generator.ts` 中的逻辑迁移进去。

### 7.1 `src/game/world-atlas/region-random.ts`

导出：

```ts
export class RegionRNG {}
export class RegionNoise {}
```

`region-tile-generator.ts` 不再内部定义 `TileRNG / TileNoise`。

### 7.2 `src/game/world-map/world-map-terrain.ts`

导出：

```ts
export function createRegionGenerationContext(...): RegionGenerationContext;
export function generateRegionBaseCells(ctx: RegionGenerationContext): void;
export function computeRegionSlope(ctx: RegionGenerationContext): void;
export function computeRegionCellStats(ctx: RegionGenerationContext): void;
```

### 7.3 `src/game/world-map/world-map-rivers.ts`

导出：

```ts
export function generateRegionRivers(ctx: RegionGenerationContext): void;
```

### 7.4 `src/game/world-map/world-map-cities.ts`

导出：

```ts
export function generateRegionCities(ctx: RegionGenerationContext): void;
```

必须保证：

```txt
city.center 是 global
city.bounds 是 global
城市面积足够
city_center / urban_block / suburb / industrial 写入 features
```

### 7.5 `src/game/world-map/world-map-roads.ts`

导出：

```ts
export function generateRegionRoads(ctx: RegionGenerationContext): void;
```

道路是 feature，不要把 city 改成 road。

### 7.6 `src/game/world-map/world-map-features.ts`

导出：

```ts
export function placeRegionBridges(ctx: RegionGenerationContext): void;
export function placeRegionFeatures(ctx: RegionGenerationContext): void;
```

桥梁只能出现在：

```txt
road + river
```

### 7.7 `src/game/world-map/world-map-validation.ts`

导出：

```ts
export function validateRegionTile(ctx: RegionGenerationContext): void;
```

检查：

```txt
city 不在 water
bridge 合法
river 连续
road 连续
bounds 是 global
strategicChunks 可生成
```

拆分后 `region-tile-generator.ts` 只保留流程：

```ts
export function generateRegionTile(...) {
  const ctx = createRegionGenerationContext(...);

  generateRegionBaseCells(ctx);
  computeRegionSlope(ctx);
  generateRegionRivers(ctx);
  generateRegionCities(ctx);
  generateRegionRoads(ctx);
  placeRegionBridges(ctx);
  placeRegionFeatures(ctx);
  computeRegionCellStats(ctx);
  validateRegionTile(ctx);

  const tile = buildRegionTile(ctx);
  tile.strategicChunks = buildStrategicChunks(tile, 32);

  return tile;
}
```

---

## 8. 确认 tacticalMapFromWorld 是否进入旧战斗系统

store 里可能已有：

```ts
tacticalMapFromWorld: gameMap
```

但旧战术系统不一定使用它。

检查：

```txt
src/store/game-store.ts
src/components/game/GameUI.tsx
src/game/tactical-integration.ts
src/game/map.ts
```

必须实现：

```ts
enterTacticalFromCombatViewport(): void
```

流程：

```txt
selectedCombatViewport
  → convertCombatViewportToGameMap
  → 初始化旧战术 game state
  → set gameMode = 'tactical'
  → 使用 tacticalMapFromWorld 作为当前 GameMap
  → 不重新随机地图
```

如果旧战术初始化只接受 mapType，则新增可选参数：

```ts
initTacticalBattle({
  mapOverride?: GameMap
})
```

当 `mapOverride` 存在时，直接使用 `mapOverride`。

禁止：

```txt
进入战术时重新调用 generateMap('random')
进入战术时重新调用 procedural-map.ts
进入战术时丢弃 CombatViewport
```

---

## 9. OperationViewPanel 点击必须进入 CombatViewport

修改：

```txt
src/components/game/OperationViewPanel.tsx
src/components/game/StrategicMap.tsx
src/store/strategic-store.ts
```

`OperationViewPanel` 必须显示 `OperationView.cells`。

点击 cell 后：

```txt
1. 读取该 cell 的 global position。
2. 调用 store.openCombatViewportFromOperationCell(pos)。
3. 更新 selectedCombatViewport。
4. CombatViewport 转 GameMap。
5. UI 显示战术地图已准备。
6. 可以进入战术战斗。
```

推荐 Props：

```ts
interface OperationViewPanelProps {
  operationView: OperationView;
  onCellClick: (pos: WorldPosition) => void;
}
```

---

## 10. AIReport 必须接入真实事件

修改：

```txt
src/store/strategic-store.ts
src/game/reports/report-generator.ts
src/components/game/AIReportPanel.tsx
```

store 必须有：

```ts
battleLogEvents: BattleLogEvent[];
aiReports: AIReport[];
```

AI 执行后或玩家提交命令后生成事件：

```txt
order_received
order_completed
order_failed
request_authorization
unit_spotted
unit_damaged
unit_lost
objective_captured
supply_used
resupply_completed
```

调用：

```ts
const reports = generateReportsFromBattleLog({
  events: newEvents,
  turn,
  commanderId,
  relatedOrderIds,
  relatedForceIds,
});
```

写入：

```ts
set(state => ({
  battleLogEvents: [...state.battleLogEvents, ...newEvents],
  aiReports: [...state.aiReports, ...reports],
}));
```

`AIReportPanel` 从 store 读取并显示：

```ts
aiReports
```

---

## 11. CommandInputPanel 必须能产生 HQOrder 和 Report

修改：

```txt
src/components/game/CommandInputPanel.tsx
src/game/command/command-parser.ts
src/game/command/command-validation.ts
src/game/ai-command/ai-planner.ts
src/game/ai-command/ai-executor.ts
src/store/strategic-store.ts
```

实现 store action：

```ts
submitHQCommand(params: {
  text: string;
  assignedForceIds: string[];
}): void
```

流程：

```txt
1. parseCommandToHQOrder
2. validateHQOrder
3. 保存 HQOrder
4. 调用 ai-planner 生成 plan
5. 调用 ai-executor 生成 execution result / battle log events
6. report-generator 生成报告
7. AIReportPanel 显示
```

第一版允许 AI 只生成 plan 和 report，不必须实际移动单位。

但必须有可见反馈：

```txt
ORDER_CONFIRMATION
SITREP
WARNING 可选
```

---

## 12. ForceDelegationPanel 必须接入 StrategicForce.command

修改：

```txt
src/components/game/ForceDelegationPanel.tsx
src/game/command/delegation.ts
src/game/strategic-types.ts
src/store/strategic-store.ts
```

要求：

1. `StrategicForce` 有：

```ts
command?: ForceCommandState;
```

2. `ForceDelegationPanel` 能显示 force 当前 controller。

3. 点击“交给 AI”调用：

```ts
delegateForceToAICommand(...)
```

4. 点击“收回控制”调用：

```ts
recallForceFromAICommand(...)
```

5. 修改后的 force 写回 store。

6. UI 能看到 controller 从：

```txt
player_direct
```

变成：

```txt
ai_delegated
```

---

## 13. combat-modern 最小接入

修改：

```txt
src/game/engine.ts
src/game/ai.ts
src/game/types.ts
src/game/combat-modern/*
```

最低要求：

### 13.1 Unit 增加 modern 字段

```ts
modern?: ModernCombatStats;
```

字段必须 optional。

### 13.2 AI 选择目标时检查 LOS

如果 target 不在 LOS 内：

```txt
不能直接普通攻击
只能 area fire 或 ignore
```

### 13.3 攻击后增加 suppression

```ts
target.modern.suppression += value;
```

### 13.4 morale 影响行动

如果 morale 低：

```txt
降低命中率
降低移动意愿
可能 withdraw / hold
```

### 13.5 ammo/fuel 影响行动

```txt
ammo = 0 → 不能使用对应武器
fuel = 0 → 不能移动
```

### 13.6 兼容旧逻辑

没有 `modern` 字段的旧单位走旧逻辑。

不要重写整个 engine。

---

## 14. 必须运行类型检查

完成后运行：

```bash
npm run build
```

如果 build 不可用：

```bash
npx tsc --noEmit
```

如果 tsc 不可用：

```bash
npm run lint
```

重点检查：

```txt
StrategicForce.command 类型
OperationView 类型
CombatViewport 参数
RegionTile import 路径
StrategicChunk 类型是否重复
root world-map-* 与目录版是否冲突
dynamic require 是否删除
buildStrategicChunks 是否唯一
```

---

## 15. 完成后必须输出

Codex 完成后必须输出：

```txt
1. 修改文件列表。
2. 删除或弃用的 root world-map-* 文件列表。
3. 是否仍有 root world-map-* import。
4. region-tile-generator.ts 是否已经拆分。
5. OperationView global/local 坐标是否修复。
6. CombatViewport global/local 坐标是否修复。
7. city.bounds 是否改为 global。
8. RegionTile 是否使用目录版 buildStrategicChunks。
9. regionTile.strategicChunks 是否为 32×32。
10. OperationViewPanel 点击是否生成 CombatViewport。
11. CombatViewport 是否能转 GameMap。
12. 是否能进入旧战术战斗。
13. CommandInputPanel 是否能生成 HQOrder。
14. ForceDelegationPanel 是否能改变 StrategicForce.command。
15. AIReportPanel 是否能显示 report-generator 生成的报告。
16. combat-modern 是否至少接入 LOS / suppression / ammo / fuel。
17. npm run build 或 npx tsc --noEmit 结果。
```

---

## 16. 给 Codex 的直接指令

```txt
你现在继续修改 threejstest 项目。

不要继续新增新架构。
不要继续创建空文件。
当前任务是把已有 WorldAtlas / RegionTile / StrategicChunk / OperationView / CombatViewport / GameMap / AICommand / BattleLog / AIReport / CombatModern 接成一个真正能跑的闭环。

请按顺序做：

1. 统一 world-map 实现，停止 root world-map-* 与目录版并行。
2. 修复 OperationView / CombatViewport 的 global/local 坐标。
3. 修复 strategic-store 调用 CombatViewport 的参数。
4. 删除 strategic-store 的动态 require fallback。
5. 修复 city.bounds，从 local 改成 global。
6. 让 RegionTile 使用 world-view/strategic-chunks.ts 的 buildStrategicChunks。
7. 真正拆分 region-tile-generator.ts 到 world-map-terrain/rivers/cities/roads/features/validation。
8. 确认 tacticalMapFromWorld 真正进入旧战斗系统。
9. OperationViewPanel 点击 cell 后必须生成 CombatViewport。
10. report-generator 必须接入 store 和 AIReportPanel。
11. CommandInputPanel 必须能生成 HQOrder 和报告。
12. ForceDelegationPanel 必须能改变 StrategicForce.command。
13. combat-modern 最少接入 LOS / suppression / ammo / fuel。
14. 运行 npm run build 或 npx tsc --noEmit，并修复错误。

完成后按 README 的验收清单输出结果。
```

---

## 17. 当前最重要的一句话

现在不要再写新的设想。

只做这件事：

```txt
把已经写出来的 WorldAtlas / RegionTile / StrategicChunk / OperationView / CombatViewport / GameMap / Command / Report / CombatModern 接成一个真正能跑的闭环。
```
