# AUTORESEARCH_FULL_FEATURE_IMPLEMENTATION_README

## 0. 本文档用途

本 README 是给本地 AI / Codex / AutoResearch 执行的长任务说明。

执行对象能力假设：

```txt
执行 AI 不强。
可能会漏步骤。
可能会新增重复文件。
可能会只写类型不接入主流程。
可能会看到空文件就继续创建新文件。
```

所以本文档要求：

```txt
1. 每一步都要有明确文件。
2. 每一步都要有检查点。
3. 每一步都要说明不要做什么。
4. 每一步完成后都要运行验证。
5. 不允许跳过阶段。
```

本任务目标：

```txt
把 threejstest 当前已经写出来的地图、战役、战术、AI 指挥、报告、现代战斗模块接成一个可运行闭环。
```

最终闭环：

```txt
WorldAtlas
  → RegionTile
  → StrategicChunk
  → StrategicMap
  → OperationView
  → CombatViewport
  → GameMap
  → 旧战术战斗系统
  → AICommand
  → BattleLog
  → AIReport
  → UI 显示
```

---

## 1. 当前代码状态

当前仓库中已经有这些目录和文件：

```txt
src/game/world-atlas/
src/game/world-map/
src/game/world-view/
src/game/command/
src/game/ai-command/
src/game/reports/
src/game/combat-modern/
```

同时 `src/game` 根目录仍然有一批旧的或平行的 `world-map-*` 文件：

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

当前主要问题：

```txt
1. 目录版和根目录版地图实现并行。
2. region-tile-generator.ts 仍然是 600+ 行大文件。
3. region-tile-generator.ts 内部仍然定义 TileRNG / TileNoise。
4. region-tile-generator.ts 内部仍然有 terrain / river / city / road / bridge / chunk 汇总逻辑。
5. world-map-terrain.ts / cities.ts / rivers.ts / roads.ts 已经有新逻辑，但 region-tile-generator.ts 不一定真正使用它们。
6. OperationView / CombatViewport 已有边界裁剪工具，但需要确认所有入口都使用。
7. tacticalMapFromWorld 已经存在，但必须确认它真的进入旧战术战斗系统。
8. CommandInputPanel / ForceDelegationPanel / AIReportPanel 已有，但必须确认接入 store 和 UI。
9. combat-modern 已有模块，但本轮只做最小接入，不重写整个 engine。
```

---

## 2. 绝对禁止事项

执行过程中禁止：

```txt
1. 不要新增 WorldAtlasV2 / RegionTileV2 / TacticalV2。
2. 不要新增新的大架构。
3. 不要新建一批空文件。
4. 不要删除旧 map.ts / procedural-map.ts fallback。
5. 不要让战术图重新随机生成。
6. 不要让 CombatViewport 转 GameMap 后又被旧 generateMap 覆盖。
7. 不要把所有逻辑继续塞回 region-tile-generator.ts。
8. 不要保留同一功能两套主实现。
9. 不要跳过 TypeScript 检查。
10. 不要只改 UI，不接数据流。
11. 不要只写类型，不接 store/action/UI。
12. 不要让 AI 全知隐藏敌人。
13. 不要为了通过类型检查把重要字段改成 any。
```

允许：

```txt
1. 保留旧 map.ts / procedural-map.ts 作为 fallback。
2. 暂时保留 root world-map-* 文件，但必须标记 deprecated，并确保主链路不引用。
3. AICommand 和 combat-modern 先做最小接入，不追求复杂真实战斗。
```

---

## 3. 最终必须实现的功能清单

### 3.1 地图生成链路

必须实现：

```txt
generateWorldAtlas()
  → generateRegionTile(atlas, regionX, regionY)
  → buildStrategicChunks(regionTile)
  → buildStrategicMapFromRegionTile(regionTile)
```

要求：

```txt
RegionTile 默认 1024×1024。
StrategicChunk 默认 32×32。
1 个 StrategicChunk 对应 32×32 WorldCell。
StrategicMap 由 RegionTile 汇总得到，不是重新随机生成。
```

---

### 3.2 战役视图链路

必须实现：

```txt
点击 StrategicMap 上的 sector/chunk
  → openOperationViewForSector(pos)
  → getOperationViewForChunk(regionTile, chunk, size)
  → OperationViewPanel 显示 128×128 或 256×256 局部地图
```

要求：

```txt
OperationView 是 RegionTile 裁剪。
OperationView 不重新生成地图。
OperationView.worldRect 是 global 坐标。
OperationView.cells 尺寸和 worldRect 一致。
```

---

### 3.3 战术视口链路

必须实现：

```txt
点击 OperationView 中的一个 cell
  → openCombatViewportFromOperationCell(pos)
  → getCombatViewportFromOperationCell(...)
  → convertCombatViewportToGameMap(viewport)
  → tacticalMapFromWorld
```

要求：

```txt
CombatViewport 是 RegionTile 裁剪。
CombatViewport 默认 64×48。
CombatViewport.worldRect 是 global 坐标。
GameMap 来自 CombatViewport。
```

---

### 3.4 真正进入战术战斗

必须实现：

```txt
点击“进入战术战斗”
  → enterTacticalFromCombatViewport()
  → initTacticalBattleFromMap({ map: tacticalMapFromWorld })
  → 切换到旧战术战斗界面
```

要求：

```txt
战术战斗使用 CombatViewport 转出来的 GameMap。
不能重新调用 random map。
不能重新调用 procedural-map.ts。
不能丢弃 tacticalMapFromWorld。
```

---

### 3.5 AI 命令链路

必须实现最小闭环：

```txt
CommandInputPanel 输入自然语言命令
  → parseCommandToHQOrder
  → validateHQOrder
  → 保存 HQOrder
  → ai-planner 生成 plan
  → ai-executor 生成 BattleLogEvent
  → report-generator 生成 AIReport
  → AIReportPanel 显示
```

最低支持命令意图：

```txt
attack
defend
recon
withdraw
support
capture
```

---

### 3.6 部队委托链路

必须实现：

```txt
ForceDelegationPanel
  → delegateForceToAICommand(forceId)
  → StrategicForce.command.controller = ai_delegated

ForceDelegationPanel
  → recallForceFromAICommand(forceId)
  → StrategicForce.command.controller = player_direct
```

要求：

```txt
StrategicForce.command 是 optional。
旧 force 没有 command 时不能崩。
UI 能显示 controller 状态。
```

---

### 3.7 报告链路

必须实现：

```txt
BattleLogEvent[]
  → generateReportsFromBattleLog(...)
  → AIReport[]
  → AIReportPanel
```

最低报告类型：

```txt
ORDER_CONFIRMATION
SITREP
WARNING
INTREP
LOGREP
BDA
```

必须区分：

```txt
facts
estimates
```

报告不能凭空编造，只能来自事件、命令、己方状态、已知敌情。

---

### 3.8 现代战斗最小接入

本轮只做最小版：

```txt
1. Unit.modern 使用 ModernCombatStats。
2. AI 攻击前检查 LOS。
3. 攻击后增加 suppression。
4. ammo = 0 时不能对应开火。
5. fuel = 0 时不能移动。
6. 没有 modern 的旧单位走旧逻辑。
```

不要重写整个 engine。

---

## 4. Phase 0：Plan Mode / 审计阶段

### 4.1 执行要求

先不要改代码。

先读取这些文件：

```txt
src/game/world-atlas/region-tile-generator.ts
src/game/world-atlas/region-random.ts
src/game/world-map/world-map-terrain.ts
src/game/world-map/world-map-cities.ts
src/game/world-map/world-map-rivers.ts
src/game/world-map/world-map-roads.ts
src/game/world-map/world-map-features.ts
src/game/world-map/world-map-validation.ts
src/game/world-view/strategic-chunks.ts
src/game/world-view/strategic-map-adapter.ts
src/game/world-view/operation-view.ts
src/game/world-view/combat-viewport.ts
src/game/world-view/world-to-game-map.ts
src/store/strategic-store.ts
src/store/game-store.ts
src/components/game/StrategicMap.tsx
src/components/game/OperationViewPanel.tsx
src/components/game/CommandInputPanel.tsx
src/components/game/ForceDelegationPanel.tsx
src/components/game/AIReportPanel.tsx
src/game/types.ts
src/game/ai.ts
src/game/engine.ts
```

---

### 4.2 生成审计文档

新增：

```txt
docs/AUTORESEARCH_BASELINE_AUDIT.md
```

必须写入：

```txt
1. 当前 TypeScript 是否能通过。
2. root world-map-* 文件是否仍被 import。
3. region-tile-generator.ts 是否仍有 TileRNG / TileNoise。
4. region-tile-generator.ts 是否仍有内部 city/river/road/chunk 逻辑。
5. generateRegionTile 是否调用拆分模块。
6. generateRegionTile 是否调用 buildStrategicChunks。
7. OperationView / CombatViewport 是否都使用 getClampedLocalViewRect。
8. tacticalMapFromWorld 是否能进入旧战术系统。
9. CommandInputPanel 是否接 store.submitHQCommand。
10. ForceDelegationPanel 是否接 store.delegateForceToAICommand。
11. AIReportPanel 是否读取 store.aiReports。
12. Unit.modern 是否使用 ModernCombatStats。
```

---

### 4.3 检查点 0

完成 Phase 0 后必须输出：

```txt
[CHECKPOINT 0]
- 是否创建 docs/AUTORESEARCH_BASELINE_AUDIT.md
- 当前 tsc/build 错误数量
- 下一步要改的文件列表
```

没有这个输出，不允许进入 Phase 1。

---

## 5. Phase 1：清理 root world-map-* 主链路引用

### 5.1 目标

主链路只使用：

```txt
src/game/world-atlas/
src/game/world-map/
src/game/world-view/
```

---

### 5.2 执行命令

运行：

```bash
grep -R "from './world-map-" src/game src/store src/components
grep -R "from '@/game/world-map-" src/game src/store src/components
grep -R "../world-map-" src/game src/store src/components
```

---

### 5.3 修改要求

如果发现 root import：

```ts
import { xxx } from '@/game/world-map-generator';
```

改成目录版：

```ts
import { generateRegionTile } from '@/game/world-atlas/region-tile-generator';
```

如果 root 文件无人引用，在文件顶部加：

```ts
/**
 * @deprecated Use src/game/world-atlas, src/game/world-map, src/game/world-view instead.
 * This file is kept only for legacy compatibility.
 */
```

---

### 5.4 检查点 1

必须输出：

```txt
[CHECKPOINT 1]
- root world-map-* import 数量
- 已迁移 import 列表
- 已标记 deprecated 文件列表
- 是否仍有主链路引用 root world-map-*
```

验收：

```txt
主链路 root world-map-* import = 0
```

---

## 6. Phase 2：让 region-tile-generator.ts 变成纯编排器

### 6.1 目标

`src/game/world-atlas/region-tile-generator.ts` 最终只保留流程编排。

---

### 6.2 必须移除或停止使用

```txt
TileRNG
TileNoise
internal generateRegionRivers
internal generateRegionCities
internal generateRegionRoads
internal placeRegionBridges
internal buildRegionStrategicChunks
```

这些逻辑必须分别使用：

```txt
src/game/world-atlas/region-random.ts
src/game/world-map/world-map-terrain.ts
src/game/world-map/world-map-cities.ts
src/game/world-map/world-map-rivers.ts
src/game/world-map/world-map-roads.ts
src/game/world-map/world-map-features.ts
src/game/world-map/world-map-validation.ts
src/game/world-view/strategic-chunks.ts
```

---

### 6.3 最终 generateRegionTile 结构

```ts
export function generateRegionTile(
  atlas: WorldAtlas,
  regionX: number,
  regionY: number
): RegionTile {
  const ctx = createRegionGenerationContext({
    atlas,
    regionX,
    regionY,
  });

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

如果没有 `buildRegionTileFromContext(ctx)`，新增在 `region-tile-generator.ts` 里。

---

### 6.4 检查命令

运行：

```bash
grep -n "class TileRNG" src/game/world-atlas/region-tile-generator.ts
grep -n "class TileNoise" src/game/world-atlas/region-tile-generator.ts
grep -n "function generateRegionCities" src/game/world-atlas/region-tile-generator.ts
grep -n "function generateRegionRivers" src/game/world-atlas/region-tile-generator.ts
grep -n "function generateRegionRoads" src/game/world-atlas/region-tile-generator.ts
grep -n "buildRegionStrategicChunks" src/game/world-atlas/region-tile-generator.ts
```

---

### 6.5 检查点 2

必须输出：

```txt
[CHECKPOINT 2]
- region-tile-generator.ts 行数
- TileRNG 是否已移除
- TileNoise 是否已移除
- internal city/river/road 是否已移除
- internal buildRegionStrategicChunks 是否已移除
- generateRegionTile 是否调用拆分模块
```

验收：

```txt
上述 grep 不应有结果。
```

---

## 7. Phase 3：唯一 StrategicChunk 汇总入口

### 7.1 目标

唯一入口：

```txt
src/game/world-view/strategic-chunks.ts
```

`generateRegionTile()` 必须调用：

```ts
tile.strategicChunks = buildStrategicChunks(
  tile,
  atlas.strategicChunkSize ?? 32
);
```

---

### 7.2 验证

生成 region 后必须验证：

```ts
console.assert(regionTile.width === 1024);
console.assert(regionTile.height === 1024);
console.assert(regionTile.strategicChunks.length === 32);
console.assert(regionTile.strategicChunks[0].length === 32);
```

---

### 7.3 检查点 3

必须输出：

```txt
[CHECKPOINT 3]
- RegionTile width/height
- strategicChunks rows/cols
- buildStrategicChunks 文件路径
- 是否还存在 buildRegionStrategicChunks
```

---

## 8. Phase 4：修正 roads 坐标与连接策略

### 8.1 修改文件

```txt
src/game/world-map/world-map-roads.ts
```

---

### 8.2 坐标规则

道路 path 的 global 坐标必须使用：

```ts
const ox = ctx.worldOrigin.globalX;
const oy = ctx.worldOrigin.globalY;

path.push({
  globalX: ox + localX,
  globalY: oy + localY,
});
```

城市 local 坐标必须使用：

```ts
const fx = from.center.globalX - ctx.worldOrigin.globalX;
const fy = from.center.globalY - ctx.worldOrigin.globalY;
const tx = to.center.globalX - ctx.worldOrigin.globalX;
const ty = to.center.globalY - ctx.worldOrigin.globalY;
```

禁止：

```ts
from.center.globalX % regionSize
from.center.globalX + (pt.x - fx)
```

---

### 8.3 连接策略

不要所有城市全连接。

改为：

```txt
1. cities.length = 0：
   如果 macro road potential 高，生成贯穿 region 的 road corridor。

2. cities.length = 1：
   从城市生成 1-2 条出口道路到 region 边缘。

3. cities.length >= 2：
   使用 nearest-neighbor 或 MST 连接成连通图。
   不要完全图连接。

4. regional ↔ regional：
   main_road

5. town ↔ regional / town ↔ town：
   secondary_road
```

---

### 8.4 检查点 4

必须输出：

```txt
[CHECKPOINT 4]
- road count
- road path 是否都在 region worldRect 内
- main_road cell count
- secondary_road cell count
- 是否仍有 from.center.globalX % regionSize
- 是否仍有 from.center.globalX + delta
```

---

## 9. Phase 5：OperationView / CombatViewport 尺寸和坐标验证

### 9.1 修改文件

```txt
src/game/world-view/view-rect-utils.ts
src/game/world-view/operation-view.ts
src/game/world-view/combat-viewport.ts
```

---

### 9.2 必须使用

```ts
getClampedLocalViewRect(...)
```

---

### 9.3 验证点

必须测试：

```txt
center = 左上角附近
center = 中心
center = 右下角附近
region = 0,0
region = 1,0
region = 0,1
```

---

### 9.4 检查点 5

必须输出：

```txt
[CHECKPOINT 5]
- OperationView 左上角测试尺寸
- OperationView 中心测试尺寸
- OperationView 右下角测试尺寸
- CombatViewport 左上角测试尺寸
- CombatViewport 中心测试尺寸
- CombatViewport 右下角测试尺寸
- worldRect 是否为 global 坐标
```

---

## 10. Phase 6：接通 CombatViewport → GameMap → 旧战术战斗

### 10.1 修改文件

```txt
src/store/strategic-store.ts
src/store/game-store.ts
src/components/game/StrategicMap.tsx
```

---

### 10.2 新增或修复 StrategicStore action

```ts
enterTacticalFromCombatViewport: () => void;
```

逻辑：

```ts
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
```

---

### 10.3 新增或修复 GameStore action

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

必须直接使用：

```ts
params.map
```

禁止重新生成地图。

---

### 10.4 StrategicMap UI 按钮

在 `selectedCombatViewport` 存在时显示：

```tsx
<button onClick={() => useStrategicStore.getState().enterTacticalFromCombatViewport()}>
  进入战术战斗
</button>
```

---

### 10.5 检查点 6

必须输出：

```txt
[CHECKPOINT 6]
- selectedCombatViewport 是否存在
- tacticalMapFromWorld 是否存在
- tacticalMapFromWorld.width/height
- 是否调用 initTacticalBattleFromMap
- 是否没有调用 random map
- 是否切换到 tactical mode
```

---

## 11. Phase 7：Command → Report 最小闭环

### 11.1 修改文件

```txt
src/store/strategic-store.ts
src/game/command/command-parser.ts
src/game/command/command-validation.ts
src/game/ai-command/ai-planner.ts
src/game/ai-command/ai-executor.ts
src/game/reports/report-generator.ts
src/components/game/CommandInputPanel.tsx
src/components/game/AIReportPanel.tsx
```

---

### 11.2 最小目标

提交命令后必须生成：

```txt
1. HQOrder
2. BattleLogEvent: order_received
3. AIReport: ORDER_CONFIRMATION
```

如果 planner 可用，再生成：

```txt
SITREP
```

---

### 11.3 检查点 7

必须输出：

```txt
[CHECKPOINT 7]
- 输入命令文本
- generated HQOrder id
- battleLogEvents 增加数量
- aiReports 增加数量
- AIReportPanel 是否显示 ORDER_CONFIRMATION
```

---

## 12. Phase 8：combat-modern 最小接入

### 12.1 修改文件

```txt
src/game/types.ts
src/game/ai.ts
src/game/engine.ts
src/game/combat-modern/*
```

---

### 12.2 Unit.modern

必须是：

```ts
import type { ModernCombatStats } from './combat-modern/modern-unit-types';

modern?: ModernCombatStats;
```

---

### 12.3 最小规则

```txt
1. AI 攻击前：如果 modern 存在，检查 LOS。
2. 攻击后：如果 modern 存在，增加 suppression。
3. ammo = 0：不能使用对应武器。
4. fuel = 0：不能移动。
5. old unit 无 modern：走旧逻辑。
```

---

### 12.4 检查点 8

必须输出：

```txt
[CHECKPOINT 8]
- Unit.modern 是否为 ModernCombatStats
- AI 是否检查 LOS
- attack 是否增加 suppression
- ammo/fuel 是否影响行动
- old unit 是否仍兼容
```

---

## 13. Phase 9：debugWorldAtlasChain 验证

### 13.1 新增文件

```txt
src/game/world-atlas/debug-world-chain.ts
```

---

### 13.2 实现函数

```ts
export function debugWorldAtlasChain() {
  const atlas = generateWorldAtlas(DEFAULT_WORLD_ATLAS_CONFIG);
  const region = generateRegionTile(atlas, 0, 0);

  const chunk = region.strategicChunks[0][0];

  const op = getOperationViewForChunk(region, chunk, 128);

  const centerCell =
    op.cells[Math.floor(op.cells.length / 2)]?.[
      Math.floor(op.cells[0]?.length / 2)
    ];

  if (!centerCell) {
    throw new Error('No center cell in OperationView');
  }

  const viewport = getCombatViewportFromOperationCell({
    regionTile: region,
    cellPosition: {
      globalX: centerCell.globalX,
      globalY: centerCell.globalY,
    },
    width: 64,
    height: 48,
  });

  const gameMap = convertCombatViewportToGameMap(viewport);

  const result = {
    atlasSize: [atlas.virtualWidth, atlas.virtualHeight],
    regionSize: [region.width, region.height],
    chunks: [
      region.strategicChunks.length,
      region.strategicChunks[0]?.length,
    ],
    operationViewSize: [op.worldRect.width, op.worldRect.height],
    combatViewportSize: [viewport.worldRect.width, viewport.worldRect.height],
    gameMapSize: [gameMap.width, gameMap.height],
  };

  console.log('[debugWorldAtlasChain]', result);

  return result;
}
```

---

### 13.3 期望输出

```txt
atlasSize = [8192, 8192]
regionSize = [1024, 1024]
chunks = [32, 32]
operationViewSize = [128, 128]
combatViewportSize = [64, 48]
gameMapSize = [64, 48]
```

---

### 13.4 检查点 9

必须输出：

```txt
[CHECKPOINT 9]
debugWorldAtlasChain 输出结果
是否全部符合期望
```

---

## 14. Phase 10：TypeScript / Build 修复

### 14.1 必须运行

```bash
npx tsc --noEmit
```

如果项目用 build：

```bash
npm run build
```

---

### 14.2 必须修复的问题

```txt
1. import 路径错误。
2. RegionGenerationContext 字段不一致。
3. RegionTile 类型不一致。
4. OperationView / CombatViewport 参数不一致。
5. GameStore action 类型不一致。
6. Unit.modern 类型不一致。
7. root world-map-* 与目录版类型冲突。
8. debugWorldAtlasChain import 错误。
```

---

### 14.3 检查点 10

必须输出：

```txt
[CHECKPOINT 10]
- npx tsc --noEmit 是否通过
- npm run build 是否通过
- 如果失败，列出剩余错误和原因
```

---

## 15. 最终完成标准

长任务完成后，必须满足：

```txt
1. root world-map-* 不再参与主链路。
2. region-tile-generator.ts 是编排器，不再塞全部逻辑。
3. RegionTile 生成 1024×1024。
4. RegionTile 使用 buildStrategicChunks。
5. StrategicChunk 为 32×32。
6. OperationView 为 128×128。
7. CombatViewport 为 64×48。
8. CombatViewport 能转 GameMap。
9. GameMap 能进入旧战术战斗。
10. CommandInputPanel 能生成 HQOrder。
11. ReportGenerator 能生成 AIReport。
12. Unit.modern 使用 ModernCombatStats。
13. debugWorldAtlasChain 输出符合预期。
14. TypeScript 或 build 通过。
```

---

## 16. 给 Codex 的直接提示词

```txt
进入长任务执行模式。

你现在要在 threejstest 项目中完成 WorldAtlas → RegionTile → StrategicChunk → OperationView → CombatViewport → GameMap → 战术战斗 → AIReport 的闭环。

不要新增新架构。
不要新增 v2 文件。
不要重写整个 UI。
不要删除旧 map.ts / procedural-map.ts fallback。
不要让战术图重新随机。

请严格按 AUTORESEARCH_FULL_FEATURE_IMPLEMENTATION_README 的 Phase 0 到 Phase 10 执行。

每个 Phase 完成后必须输出对应 CHECKPOINT。
每个 CHECKPOINT 必须包含修改文件、验证结果、失败原因。
如果某阶段失败，不要跳到下一阶段，先修当前阶段。
必须运行 npx tsc --noEmit 或 npm run build。

最重要的实现要求：
1. 清理 root world-map-* 主链路引用。
2. region-tile-generator.ts 改成编排器。
3. 统一使用 region-random.ts、world-map/*、world-view/*。
4. RegionTile 使用 buildStrategicChunks。
5. roads 坐标使用 worldOrigin + local。
6. OperationView / CombatViewport 尺寸和坐标正确。
7. tacticalMapFromWorld 进入旧战术战斗。
8. CommandInputPanel 能生成 HQOrder。
9. ReportGenerator 能生成 AIReport。
10. Unit.modern 使用 ModernCombatStats。
11. debugWorldAtlasChain 输出符合预期。
12. tsc/build 通过。

完成后输出最终报告：
- 修改文件列表
- 删除/弃用文件列表
- 所有 CHECKPOINT 结果
- debugWorldAtlasChain 输出
- tsc/build 结果
- 未完成项和原因
```

---

## 17. 简短版提示词

如果只想粘贴短版给 Codex，用这个：

```txt
请按 AUTORESEARCH_FULL_FEATURE_IMPLEMENTATION_README 执行长任务。

目标：跑通 WorldAtlas → RegionTile → StrategicChunk → OperationView → CombatViewport → GameMap → 战术战斗 → AIReport 闭环。

不要新增架构，不要新建 v2，不要重写 UI，不要让战术图随机生成。

每个 Phase 必须输出 CHECKPOINT。失败不能跳过。最后运行 npx tsc --noEmit 或 npm run build。

重点：
- root world-map-* 不参与主链路
- region-tile-generator.ts 变成编排器
- RegionTile 使用 buildStrategicChunks
- roads 坐标使用 worldOrigin + local
- CombatViewport 真的进入旧战术战斗
- Command → BattleLog → AIReport 可用
- Unit.modern 使用 ModernCombatStats
- debugWorldAtlasChain 通过
```
