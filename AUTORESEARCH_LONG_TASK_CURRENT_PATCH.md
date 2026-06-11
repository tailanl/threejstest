# AUTORESEARCH_LONG_TASK_CURRENT_PATCH.md

## 0. 用途

本 README 是给本地 AI / Codex / AutoResearch 执行的长任务说明。

预期执行时间：

```txt
2-6 小时
```

本任务不是继续扩展新概念，而是把当前已经写出来的系统真正整理成可运行闭环：

```txt
WorldAtlas
  → RegionTile
  → StrategicChunk
  → StrategicMap
  → OperationView
  → CombatViewport
  → GameMap
  → 战术战斗
  → AICommand
  → BattleLog
  → AIReport
```

当前项目已经有大量代码，不要继续新增平行架构。  
这次长任务的核心是：

```txt
收敛实现
删除重复路径
修复主链路
接通战术入口
跑类型检查
输出可验证结果
```

---

## 1. 当前代码状态

根据最新仓库状态：

### 1.1 已经完成或接近完成

```txt
1. src/game/world-atlas/region-random.ts 已经存在，并导出 RegionRNG / RegionNoise。
2. src/game/world-map/world-map-terrain.ts 已经有基础地形生成逻辑。
3. src/game/world-map/world-map-cities.ts 已经有城市生成逻辑，并且 city.bounds 已经改成 global 坐标。
4. src/game/world-map/world-map-rivers.ts 已经有河流生成逻辑。
5. src/game/world-map/world-map-roads.ts 已经有简化 A* 道路生成逻辑。
6. src/game/world-view/view-rect-utils.ts 已经有 clampViewStart / getClampedLocalViewRect。
7. src/game/world-view/operation-view.ts 已经开始使用 getClampedLocalViewRect。
8. src/game/world-view/combat-viewport.ts 已经开始使用 getClampedLocalViewRect。
9. src/game/types.ts 已经将 Unit.modern 改成 ModernCombatStats。
10. src/store/strategic-store.ts 已经有 tacticalMapFromWorld、selectedCombatViewport、aiReports、battleLogEvents 等状态。
```

---

### 1.2 仍然存在的问题

```txt
1. src/game 根目录仍然存在 world-map-* 平行文件。
2. src/game/world-atlas/region-tile-generator.ts 仍然是 600+ 行的大文件。
3. region-tile-generator.ts 仍然内部定义 TileRNG / TileNoise。
4. region-tile-generator.ts 仍然内部实现 terrain / river / city / road / chunk 等旧逻辑。
5. region-tile-generator.ts 没有明显使用 world-map-terrain / cities / rivers / roads 这些拆分模块。
6. region-tile-generator.ts 没有明显使用 world-view/strategic-chunks.ts 的 buildStrategicChunks。
7. world-map-roads.ts 的 path global 坐标仍然使用 from.center + delta，后续跨 region 不稳。
8. game-store 中已经声明 enterTacticalFromCombatViewport，但没有确认完整实现。
9. game-store 中没有看到 mapOverride 入口，说明 CombatViewport → GameMap → 战术战斗仍可能没有真正接通。
10. StrategicMap.tsx 已经读取 useGameStore(s => s.enterTacticalFromCombatViewport)，但需要确认该 action 实际可用。
```

---

## 2. 本次长任务总目标

本次长任务完成后，必须能证明：

```txt
1. WorldAtlas 可以生成。
2. RegionTile 可以生成。
3. RegionTile 使用拆分模块生成 terrain / river / city / road / bridge。
4. RegionTile 使用目录版 buildStrategicChunks。
5. StrategicMap 来自 RegionTile。
6. 点击 StrategicMap 可以打开 OperationView。
7. 点击 OperationView cell 可以生成 CombatViewport。
8. CombatViewport 可以转成 GameMap。
9. 点击“进入战术战斗”后，旧战术战斗使用这个 GameMap。
10. 不重新随机地图。
11. AI 命令和 Report 仍然可用。
12. npx tsc --noEmit 或 npm run build 通过。
```

---

## 3. 长任务执行规则

### 3.1 不要做

```txt
不要新增新的地图架构。
不要新增 world-map-v2 / atlas-v2 / tactical-v2。
不要继续保留同一功能两套实现。
不要把所有逻辑继续塞回 region-tile-generator.ts。
不要删除旧 map.ts / procedural-map.ts fallback。
不要重写整个战斗系统。
不要重写整个 UI。
不要接入真实地图。
不要让战术图重新随机。
```

---

### 3.2 必须做

```txt
每个 Phase 完成后都要运行一次类型检查。
每个 Phase 完成后都要记录修改文件。
遇到 TypeScript 错误优先修类型，不要继续堆功能。
主链路 import 必须统一到目录版。
```

推荐每个阶段提交一次：

```txt
commit 1: audit + import cleanup
commit 2: region tile orchestration
commit 3: tactical viewport handoff
commit 4: validation/debug
commit 5: tsc/build fixes
```

---

## 4. Phase 0：基线检查

### 4.1 必须先运行

```bash
npm install
npx tsc --noEmit
```

如果项目更适合：

```bash
npm run build
```

也可以运行 build。

### 4.2 输出基线报告

新增：

```txt
docs/LONG_TASK_BASELINE_AUDIT.md
```

内容必须包括：

```txt
1. 当前 TypeScript 错误列表。
2. 当前 root world-map-* 文件列表。
3. 当前 root world-map-* 是否仍被 import。
4. region-tile-generator.ts 是否仍定义 TileRNG / TileNoise。
5. region-tile-generator.ts 是否仍定义 generateRegionCities / generateRegionRivers / generateRegionRoads。
6. generateRegionTile 是否调用拆分模块。
7. generateRegionTile 是否调用 buildStrategicChunks。
8. game-store 是否实现 enterTacticalFromCombatViewport。
9. game-store 是否支持 mapOverride。
10. StrategicMap.tsx 的战术按钮是否真正进入 CombatViewport 战斗。
```

---

## 5. Phase 1：停止 root world-map-* 参与主链路

### 5.1 当前问题

`src/game` 根目录仍然存在这些平行文件：

```txt
src/game/world-map-chunks.ts
src/game/world-map-cities.ts
src/game/world-map-config.ts
src/game/world-map-features.ts
src/game/world-map-generator.ts
src/game/world-map-hydrology.ts
src/game/world-map-roads.ts
src/game/world-map-strategic-adapter.ts
src/game/world-map-terrain.ts
src/game/world-map-types.ts
src/game/world-map-view.ts
src/game/world-to-game-map.ts
```

目录版已经存在：

```txt
src/game/world-atlas/
src/game/world-map/
src/game/world-view/
```

### 5.2 修改目标

主链路只能使用：

```txt
src/game/world-atlas/
src/game/world-map/
src/game/world-view/
```

### 5.3 操作

运行：

```bash
grep -R "from './world-map-" src/game src/store src/components
grep -R "from '@/game/world-map-" src/game src/store src/components
grep -R "../world-map-" src/game src/store src/components
```

处理规则：

```txt
1. 如果 import 指向 root world-map-*，改成目录版。
2. 如果 root world-map-* 已经无人引用，在文件顶部加 @deprecated 注释。
3. 如果某个 root world-map-* 仍被旧 fallback 使用，保留但必须标注 legacy。
4. 新功能禁止再 import root world-map-*。
```

### 5.4 验收

输出：

```txt
root world-map-* import count = 0
```

如果不是 0，必须说明具体保留原因。

---

## 6. Phase 2：把 region-tile-generator.ts 改成纯编排器

### 6.1 当前问题

`src/game/world-atlas/region-tile-generator.ts` 仍然包含旧的大段逻辑：

```txt
TileRNG
TileNoise
terrain
river
city
road
chunk
```

但现在已经有拆分模块：

```txt
src/game/world-map/world-map-terrain.ts
src/game/world-map/world-map-cities.ts
src/game/world-map/world-map-rivers.ts
src/game/world-map/world-map-roads.ts
src/game/world-map/world-map-features.ts
src/game/world-map/world-map-validation.ts
```

### 6.2 修改目标

`region-tile-generator.ts` 最终只保留：

```ts
import { createRegionGenerationContext, generateRegionBaseCells, applyMacroTerrainConstraints, computeRegionCellStats } from '../world-map/world-map-terrain';
import { generateRegionRivers } from '../world-map/world-map-rivers';
import { generateRegionCities } from '../world-map/world-map-cities';
import { generateRegionRoads } from '../world-map/world-map-roads';
import { placeRegionBridges, placeRegionFeatures } from '../world-map/world-map-features';
import { validateRegionTile } from '../world-map/world-map-validation';
import { buildStrategicChunks } from '../world-view/strategic-chunks';

export function generateRegionTile(atlas: WorldAtlas, regionX: number, regionY: number): RegionTile {
  const ctx = createRegionGenerationContext({ atlas, regionX, regionY });

  generateRegionBaseCells(ctx);
  applyMacroTerrainConstraints(ctx);
  computeRegionCellStats(ctx);

  generateRegionRivers(ctx);
  generateRegionCities(ctx);
  generateRegionRoads(ctx);

  placeRegionBridges(ctx);
  placeRegionFeatures(ctx);
  validateRegionTile(ctx);

  const tile = buildRegionTileFromContext(ctx);

  tile.strategicChunks = buildStrategicChunks(
    tile,
    atlas.strategicChunkSize ?? 32
  );

  return tile;
}
```

如果没有 `buildRegionTileFromContext(ctx)`，新增：

```ts
function buildRegionTileFromContext(ctx: RegionGenerationContext): RegionTile
```

### 6.3 必须删除或停止使用

```txt
TileRNG
TileNoise
internal generateRegionRivers
internal generateRegionCities
internal generateRegionRoads
internal buildRegionStrategicChunks
```

### 6.4 验收

```txt
grep -n "class TileRNG" src/game/world-atlas/region-tile-generator.ts
grep -n "class TileNoise" src/game/world-atlas/region-tile-generator.ts
grep -n "function generateRegionCities" src/game/world-atlas/region-tile-generator.ts
grep -n "function generateRegionRivers" src/game/world-atlas/region-tile-generator.ts
grep -n "function generateRegionRoads" src/game/world-atlas/region-tile-generator.ts
grep -n "buildRegionStrategicChunks" src/game/world-atlas/region-tile-generator.ts
```

这些都必须没有结果。

---

## 7. Phase 3：确认 buildStrategicChunks 是唯一 chunk 汇总入口

### 7.1 修改目标

唯一入口：

```txt
src/game/world-view/strategic-chunks.ts
```

`generateRegionTile()` 必须调用：

```ts
tile.strategicChunks = buildStrategicChunks(tile, atlas.strategicChunkSize ?? 32);
```

### 7.2 验收

写临时验证或 debug 输出：

```ts
console.log('[RegionTile]', {
  width: tile.width,
  height: tile.height,
  chunkRows: tile.strategicChunks.length,
  chunkCols: tile.strategicChunks[0]?.length,
});
```

默认必须输出：

```txt
width = 1024
height = 1024
chunkRows = 32
chunkCols = 32
```

---

## 8. Phase 4：修正 world-map-roads.ts 坐标和连接策略

### 8.1 当前问题

`world-map-roads.ts` 当前 path 坐标使用：

```ts
globalX: from.center.globalX + (pt.x - fx)
globalY: from.center.globalY + (pt.y - fy)
```

这依赖 `from.center` 与 `fx/fy` 的关系，跨 region 时不稳。

### 8.2 修改为 worldOrigin + local

在 `generateRegionRoads(ctx)` 中统一：

```ts
const ox = ctx.worldOrigin.globalX;
const oy = ctx.worldOrigin.globalY;

path.push({
  globalX: ox + pt.x,
  globalY: oy + pt.y,
});
```

城市 local 坐标使用：

```ts
const fx = from.center.globalX - ctx.worldOrigin.globalX;
const fy = from.center.globalY - ctx.worldOrigin.globalY;
const tx = to.center.globalX - ctx.worldOrigin.globalX;
const ty = to.center.globalY - ctx.worldOrigin.globalY;
```

不要再用：

```ts
from.center.globalX % regionSize
```

### 8.3 道路连接策略优化

现在如果 region 内有 4 个城市，会全连接 6 条路。长任务可以顺手改成：

```txt
1. 城市数 <= 1：
   生成 1-2 条出口道路到 region 边缘。

2. 城市数 >= 2：
   先用 nearest-neighbor 或 MST 连接成连通图。
   不要所有城市全连接。

3. regional → town：
   secondary_road

4. regional ↔ regional：
   main_road
```

### 8.4 验收

```txt
road.path 中每个点都在 region worldRect 内。
road cells 有 main_road / secondary_road feature。
道路不把 city 变成 road terrain。
```

---

## 9. Phase 5：接通 CombatViewport 到真实战术战斗

### 9.1 当前状态

`StrategicStore` 已经有：

```txt
selectedCombatViewport
tacticalMapFromWorld
```

`GameStore` 接口里已经声明：

```txt
enterTacticalFromCombatViewport
```

但当前没有看到 `mapOverride`，也没有确认 action 实现。

### 9.2 推荐实现位置

推荐将真正进入战术的 action 放在 `strategic-store.ts`，因为它拥有：

```txt
selectedCombatViewport
tacticalMapFromWorld
```

新增：

```ts
enterTacticalFromCombatViewport: () => void;
```

如果你坚持放在 `game-store.ts`，则必须让 `game-store` 能从 `strategic-store` 读取 `tacticalMapFromWorld`，但不推荐。

### 9.3 具体实现

修改：

```txt
src/store/strategic-store.ts
src/store/game-store.ts
```

在 `StrategicStore` 中新增：

```ts
enterTacticalFromCombatViewport: () => void;
```

实现：

```ts
enterTacticalFromCombatViewport: () => {
  const { selectedCombatViewport, tacticalMapFromWorld } = get();

  if (!selectedCombatViewport || !tacticalMapFromWorld) {
    console.warn('[WorldAtlas] No CombatViewport/GameMap ready.');
    return;
  }

  useGameStore.getState().initTacticalBattleFromMap({
    map: tacticalMapFromWorld,
    source: 'world-combat-viewport',
    sourceWorldRect: selectedCombatViewport.worldRect,
  });

  set({ gameMode: 'tactical' });
}
```

如果 `game-store` 没有 `initTacticalBattleFromMap`，新增：

```ts
initTacticalBattleFromMap(params: {
  map: GameMap;
  source?: 'legacy' | 'world-combat-viewport';
  sourceWorldRect?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
}): void
```

内部逻辑：

```ts
set({
  ...initGameState(),
  map: params.map,
  isStrategicTacticalBattle: params.source === 'world-combat-viewport',
  mapType: 'procedural',
});
```

具体保留哪些字段按当前 game-store 实际状态调整。

### 9.4 UI

修改：

```txt
src/components/game/StrategicMap.tsx
```

当 `selectedCombatViewport` 存在时，显示按钮：

```tsx
<Button onClick={() => useStrategicStore.getState().enterTacticalFromCombatViewport()}>
  进入战术战斗
</Button>
```

不要调用 `useGameStore(s => s.enterTacticalFromCombatViewport)`，除非 game-store 已经有完整实现并能读取 `tacticalMapFromWorld`。

### 9.5 禁止

```txt
禁止重新调用 random map。
禁止重新调用 procedural-map.ts 生成新地图。
禁止丢弃 CombatViewport。
禁止进入战术后地图与 OperationView 不对应。
```

---

## 10. Phase 6：报告闭环最小验证

### 10.1 当前目标

不要继续扩展复杂 AI，只验证：

```txt
CommandInputPanel
  → submitHQCommand
  → BattleLogEvent
  → report-generator
  → AIReportPanel
```

### 10.2 必须有的事件

至少：

```txt
order_received
```

提交命令后必须生成：

```txt
ORDER_CONFIRMATION
```

如果有 planner：

```txt
SITREP
```

### 10.3 验收

```txt
输入一条命令
AIReportPanel 出现 ORDER_CONFIRMATION
battleLogEvents 数量 +1
aiReports 数量 +1
```

---

## 11. Phase 7：类型检查和修错

### 11.1 必须运行

```bash
npx tsc --noEmit
```

如果项目用 build 更稳定：

```bash
npm run build
```

### 11.2 必须修复

```txt
1. RegionTile / RegionGenerationContext 类型不一致。
2. region-random.ts 重复实现和旧 TileRNG 冲突。
3. buildStrategicChunks import 路径。
4. StrategicStore / GameStore action 定义不一致。
5. enterTacticalFromCombatViewport 在 UI 中引用的 store 不一致。
6. Unit.modern / ModernCombatStats 字段不一致。
7. root world-map-* 与目录版类型重复。
```

---

## 12. Phase 8：长任务最终验收脚本

新增脚本或临时测试文件：

```txt
src/game/world-atlas/debug-world-chain.ts
```

实现一个函数：

```ts
export function debugWorldAtlasChain() {
  const atlas = generateWorldAtlas(DEFAULT_WORLD_ATLAS_CONFIG);
  const region = generateRegionTile(atlas, 0, 0);

  const chunk = region.strategicChunks[0][0];
  const op = getOperationViewForChunk(region, chunk, 128);
  const cell = op.cells[Math.floor(op.cells.length / 2)][Math.floor(op.cells[0].length / 2)];
  const viewport = getCombatViewportFromOperationCell({
    regionTile: region,
    cellPosition: { globalX: cell.globalX, globalY: cell.globalY },
    width: 64,
    height: 48,
  });

  const map = convertCombatViewportToGameMap(viewport);

  console.log({
    atlasSize: [atlas.virtualWidth, atlas.virtualHeight],
    regionSize: [region.width, region.height],
    chunks: [region.strategicChunks.length, region.strategicChunks[0]?.length],
    opSize: [op.worldRect.width, op.worldRect.height],
    viewportSize: [viewport.worldRect.width, viewport.worldRect.height],
    gameMapSize: [map.width, map.height],
  });
}
```

验收输出必须接近：

```txt
atlasSize: [8192, 8192]
regionSize: [1024, 1024]
chunks: [32, 32]
opSize: [128, 128]
viewportSize: [64, 48]
gameMapSize: [64, 48]
```

---

## 13. 长任务执行顺序

请严格按这个顺序做：

```txt
Phase 0：基线检查
Phase 1：清理 root world-map-* import
Phase 2：region-tile-generator 编排化
Phase 3：唯一 buildStrategicChunks
Phase 4：world-map-roads 坐标修正
Phase 5：CombatViewport → 战术战斗入口
Phase 6：Command → Report 最小闭环
Phase 7：tsc/build 修错
Phase 8：debugWorldAtlasChain 验证
```

---

## 14. 给 Codex 的直接指令

```txt
你现在跑一个长任务，目标是把当前 threejstest 的 WorldAtlas → RegionTile → StrategicChunk → OperationView → CombatViewport → GameMap → 战术战斗 → AIReport 链路跑通。

不要新增新架构。
不要新增 v2 文件。
不要重写整个 UI。
不要删除旧 map.ts/procedural-map.ts fallback。
不要让战术图重新随机。

请按 README 的 Phase 0 到 Phase 8 顺序执行。

重点：
1. 清理 root world-map-* import。
2. region-tile-generator.ts 改成纯编排器。
3. 删除 TileRNG / TileNoise 内部重复实现，统一使用 region-random.ts。
4. 删除内部 city/river/road/chunk 逻辑，统一使用 world-map/ 和 world-view/ 模块。
5. RegionTile 必须使用 world-view/strategic-chunks.ts 的 buildStrategicChunks。
6. world-map-roads.ts 坐标统一使用 ctx.worldOrigin + local。
7. 新增 strategic-store.enterTacticalFromCombatViewport。
8. 新增或修复 game-store.initTacticalBattleFromMap。
9. StrategicMap.tsx 的“进入战术战斗”按钮调用 strategic-store 的 enterTacticalFromCombatViewport。
10. CommandInputPanel → BattleLogEvent → AIReportPanel 最小闭环必须保留。
11. 新增 debugWorldAtlasChain，输出 atlas/region/chunk/op/viewport/gameMap 尺寸。
12. 运行 npx tsc --noEmit 或 npm run build，修复错误。

完成后输出：
- 修改文件列表
- root world-map-* import 是否清零
- region-tile-generator 是否变成编排器
- 是否还存在 TileRNG/TileNoise 内部实现
- RegionTile 是否使用 buildStrategicChunks
- road path 是否使用 worldOrigin + local
- enterTacticalFromCombatViewport 是否实现
- initTacticalBattleFromMap 是否实现
- StrategicMap 按钮是否调用正确 store
- debugWorldAtlasChain 输出
- tsc/build 结果
```

---

## 15. 完成标准

这次长任务完成后，项目必须至少达到：

```txt
1. 能生成 atlas。
2. 能生成 region 0,0。
3. region 是 1024×1024。
4. region 有 32×32 chunks。
5. 能从 chunk 打开 128×128 OperationView。
6. 能从 OperationView cell 打开 64×48 CombatViewport。
7. CombatViewport 能转成 GameMap。
8. GameMap 能进入旧战术战斗。
9. 命令能产生至少一个 AIReport。
10. TypeScript 通过。
```

这 10 条缺一条，都不能算长任务完成。
