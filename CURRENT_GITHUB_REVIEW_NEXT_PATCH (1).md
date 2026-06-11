# CURRENT_GITHUB_REVIEW_NEXT_PATCH.md

## 0. 当前 GitHub 更新后的结论

当前项目已经有明显进展，但还没有完全跑通。

已经实现或部分实现：

```txt
1. world-atlas/region-tile-generator.ts 已经不再是空文件。
2. world-view/strategic-chunks.ts 已经有 buildStrategicChunks(regionTile)。
3. reports/report-generator.ts 已经能从 BattleLogEvent[] 生成 AIReport[]。
4. command/delegation.ts 已经有 delegateForceToAI / recallForceFromAI。
5. root 目录下出现了一套 world-map-* 实现。
6. UI 组件目录里已有 AIReportPanel、CommandInputPanel、ForceDelegationPanel、OperationViewPanel 等文件。
```

但当前主要问题是：

```txt
1. 存在两套地图系统：目录版 world-atlas/world-map/world-view 与根目录 world-map-* 并行。
2. region-tile-generator.ts 把随机数、噪声、地形、河流、城市、道路、桥梁、chunk 汇总全部写在一个文件里。
3. StrategicForce 还没有 command?: ForceCommandState 字段，但 delegation.ts 返回了 command 字段，可能导致 TypeScript 类型错误。
4. GameUI.tsx 和 StrategicMap.tsx 还没有接入 AIReportPanel、OperationViewPanel、CommandInputPanel、ForceDelegationPanel。
5. 战略图点击仍然走旧 onSectorClick 流程，没有打开 OperationView。
6. OperationView / CombatViewport / GameMap 转换链条还没有接到主 UI。
7. combat-modern 模块仍然没有真正接入 engine.ts / ai.ts。
8. reports/report-generator.ts 有了，但报告还没有从真实战斗流程中自动产生和显示。
```

当前目标：

```txt
不要继续新增架构。
不要继续增加空文件。
现在要做“收敛 + 接入 + 修类型 + 跑通闭环”。
```

目标闭环：

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

## 1. 第一优先级：消除两套 world-map 实现

### 1.1 当前问题

当前同时存在：

```txt
src/game/world-atlas/
src/game/world-map/
src/game/world-view/
```

以及：

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

这会让后续维护非常混乱。

### 1.2 修改要求

统一主实现为目录版：

```txt
src/game/world-atlas/
src/game/world-map/
src/game/world-view/
```

根目录 `world-map-*` 文件处理规则：

```txt
1. 如果根目录文件为空：删除或停止引用。
2. 如果根目录文件有有效实现：迁移到目录版对应文件。
3. 如果暂时不删，必须在文件顶部标记 deprecated，且项目 import 不再引用它。
```

建议：

```txt
root world-map-generator.ts
  → 迁移到 world-atlas/region-tile-generator.ts 或 world-map/world-map-generator.ts

root world-map-chunks.ts
  → 合并到 world-view/strategic-chunks.ts

root world-map-strategic-adapter.ts
  → 合并到 world-view/strategic-map-adapter.ts

root world-map-view.ts
  → 合并到 world-view/operation-view.ts

root world-to-game-map.ts
  → 合并到 world-view/world-to-game-map.ts
```

验收：

```txt
grep -R "from './world-map-" src/game
```

如果仍然有根目录 `world-map-*` 引用，必须解释原因。

---

## 2. 第二优先级：拆分 region-tile-generator.ts

### 2.1 当前问题

当前 `src/game/world-atlas/region-tile-generator.ts` 已经包含大量逻辑：

```txt
TileRNG
TileNoise
generateRegionTile
地形生成
河流生成
城市生成
道路生成
桥梁生成
buildRegionStrategicChunks
```

这会导致：

```txt
1. 文件不可维护。
2. 无法单独测试河流、城市、道路。
3. strategic-chunks.ts 已经有 buildStrategicChunks，但 region-tile-generator.ts 内部仍有 buildRegionStrategicChunks，形成重复。
```

### 2.2 修改目标

`region-tile-generator.ts` 最终只保留编排：

```ts
export function generateRegionTile(
  atlas: WorldAtlas,
  regionX: number,
  regionY: number
): RegionTile {
  const ctx = createRegionGenerationContext(atlas, regionX, regionY);

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
  tile.strategicChunks = buildStrategicChunks(tile, atlas.strategicChunkSize ?? 32);

  return tile;
}
```

### 2.3 需要拆出的文件

新增或完善：

```txt
src/game/world-atlas/region-random.ts
src/game/world-map/world-map-terrain.ts
src/game/world-map/world-map-rivers.ts
src/game/world-map/world-map-cities.ts
src/game/world-map/world-map-roads.ts
src/game/world-map/world-map-features.ts
src/game/world-map/world-map-validation.ts
```

职责：

```txt
region-random.ts:
  RegionRNG
  RegionNoise

world-map-terrain.ts:
  generateRegionBaseCells
  computeRegionSlope
  classifyRegionTerrain
  computeMovementAndDefense

world-map-rivers.ts:
  generateRegionRivers

world-map-cities.ts:
  generateRegionCities

world-map-roads.ts:
  generateRegionRoads

world-map-features.ts:
  placeRegionBridges
  placeRegionFeatures

world-map-validation.ts:
  validateRegionTile
```

---

## 3. 第三优先级：修复 StrategicForce command 类型

### 3.1 当前问题

当前 `command/delegation.ts` 返回：

```ts
return {
  ...force,
  command: { ... }
};
```

但 `StrategicForce` 类型里还没有：

```ts
command?: ForceCommandState;
```

这会造成类型不一致。

### 3.2 修改文件

修改：

```txt
src/game/strategic-types.ts
```

增加 import：

```ts
import type { ForceCommandState } from './command/command-types';
```

然后在 `StrategicForce` 中增加：

```ts
command?: ForceCommandState;
```

注意：

```txt
必须是 optional。
不要破坏旧存档和旧战略逻辑。
```

---

## 4. 第四优先级：统一 StrategicChunk 汇总逻辑

### 4.1 当前问题

现在已有：

```txt
src/game/world-view/strategic-chunks.ts
```

并且里面已经有：

```ts
buildStrategicChunks(regionTile, chunkSize)
```

但 `region-tile-generator.ts` 内部仍然有：

```ts
buildRegionStrategicChunks(...)
```

这是重复。

### 4.2 修改要求

删除或停止使用：

```ts
buildRegionStrategicChunks
```

在 `generateRegionTile()` 中统一调用：

```ts
import { buildStrategicChunks } from '../world-view/strategic-chunks';

tile.strategicChunks = buildStrategicChunks(tile, atlas.strategicChunkSize ?? 32);
```

### 4.3 必须修复 chunk cityIds

当前 `strategic-chunks.ts` 通过 city bounds 与 chunk rect 相交加入 cityIds，这是正确方向。

继续保留这个规则：

```txt
大城市跨多个 chunk 时，每个相交 chunk 都应包含 cityId。
```

---

## 5. 第五优先级：StrategicMap adapter 必须唯一化

### 5.1 当前问题

当前根目录有：

```txt
src/game/world-map-strategic-adapter.ts
```

目录中也可能有：

```txt
src/game/world-view/strategic-map-adapter.ts
```

必须统一。

### 5.2 修改要求

唯一使用：

```txt
src/game/world-view/strategic-map-adapter.ts
```

导出：

```ts
export function buildStrategicMapFromRegionTile(regionTile: RegionTile): StrategicMap;
```

如果当前已有：

```ts
buildStrategicMapFromWorldMap(worldMap)
```

可以保留，但不要作为主链路。

主链路必须是：

```txt
RegionTile → StrategicMap
```

因为当前你已经决定 `1024×1024` 是 region，而不是全世界。

---

## 6. 第六优先级：把 RegionTile 接入战略模式

### 6.1 当前问题

当前 `GameUI.tsx` 和 `StrategicMap.tsx` 仍然在使用旧战略状态：

```txt
state.map
useStrategicStore.getState().onSectorClick(pos)
BattleChoiceDialog
tacticalBattleConfig
```

新地图系统没有进入主流程。

### 6.2 修改目标

战略初始化时应该：

```txt
generateWorldAtlas()
generateRegionTile(atlas, 0, 0)
buildStrategicMapFromRegionTile(regionTile)
写入 strategic store
保存 currentAtlas / currentRegionTile
```

### 6.3 推荐 store 字段

修改战略 store，新增：

```ts
currentAtlas?: WorldAtlas;
currentRegionTile?: RegionTile;
selectedOperationView?: OperationView;
selectedCombatViewport?: CombatViewport;
aiReports: AIReport[];
battleLogEvents: BattleLogEvent[];
```

如果 store 文件中字段过多，先 optional。

---

## 7. 第七优先级：点击战略格打开 OperationView

### 7.1 当前问题

当前 `StrategicMap.tsx` 的点击仍然直接调用：

```ts
useStrategicStore.getState().onSectorClick(pos);
```

这只支持旧逻辑：选择部队、移动、攻击。

### 7.2 修改方案

保留旧点击逻辑，但增加一种“查看战役图”行为。

建议：

```txt
左键：
  仍然执行旧 onSectorClick

右键 / 或按钮：
  打开 OperationView

或者：
  如果当前处于“地图查看模式”，点击 sector 打开 OperationView。
```

### 7.3 新增 store action

```ts
openOperationViewForSector(pos: StrategicPosition): void
```

实现：

```ts
const chunk = currentRegionTile.strategicChunks[pos.y][pos.x];

const center = {
  globalX: chunk.worldRect.x + chunk.worldRect.width / 2,
  globalY: chunk.worldRect.y + chunk.worldRect.height / 2,
};

const operationView = getOperationView({
  regionTile: currentRegionTile,
  center,
  width: 128,
  height: 128,
});

set({ selectedOperationView: operationView });
```

如果 sector 有 city：

```txt
OperationView size = 256
```

否则：

```txt
OperationView size = 128
```

---

## 8. 第八优先级：OperationView 点击进入 CombatViewport

### 8.1 新增 store action

```ts
openCombatViewportFromOperationCell(pos: WorldPosition): void
```

实现：

```ts
const viewport = getCombatViewport({
  regionTile: currentRegionTile,
  center: pos,
  width: 64,
  height: 48,
});

const gameMap = convertCombatViewportToGameMap(viewport);

set({
  selectedCombatViewport: viewport,
  tacticalMapFromWorld: gameMap,
});
```

然后接入旧战术系统。

注意：

```txt
这里不能重新调用 random map。
不能重新调用 procedural-map.ts。
```

---

## 9. 第九优先级：UI 面板接入

### 9.1 当前问题

`GameUI.tsx` 中找不到：

```txt
AIReportPanel
OperationViewPanel
CommandInputPanel
ForceDelegationPanel
```

说明面板存在但没有接入。

### 9.2 修改 GameUI / StrategicMap

至少接入：

```txt
OperationViewPanel
AIReportPanel
CommandInputPanel
ForceDelegationPanel
```

推荐布局：

```txt
左侧：
  部队列表 + ForceDelegationPanel

中间：
  StrategicMap / OperationViewPanel

右侧：
  AIReportPanel + CommandInputPanel
```

第一版可以不美观，但必须能显示和交互。

### 9.3 OperationViewPanel 必须能点击 cell

Props：

```ts
interface OperationViewPanelProps {
  operationView: OperationView;
  onCellClick: (pos: WorldPosition) => void;
}
```

点击后调用：

```ts
openCombatViewportFromOperationCell(pos)
```

---

## 10. 第十优先级：ReportGenerator 接入

### 10.1 当前状态

`reports/report-generator.ts` 已经存在，能从事件类型生成：

```txt
SITREP
INTREP
BDA
LOGREP
WARNING
ORDER_CONFIRMATION
```

这是好事。

### 10.2 当前缺口

它没有接入主流程。

### 10.3 修改要求

在 AI 执行或战斗结算后：

```ts
const reports = generateReportsFromBattleLog({
  events: newEvents,
  turn,
  commanderId,
  relatedOrderIds,
  relatedForceIds,
});

append reports to strategic store aiReports
```

`AIReportPanel` 从 store 读取：

```ts
aiReports
```

---

## 11. 第十一优先级：CommandInputPanel 接入

### 11.1 当前目标

玩家输入自然语言命令：

```txt
第1装甲营沿主路推进，占领东侧桥梁。损失超过25%就停止。
```

系统执行：

```txt
parseCommandToHQOrder
validate HQOrder
attach to selected force command.currentOrderIds
AI planner 生成计划
AI executor 执行
写 battle log
生成 report
```

### 11.2 store action

```ts
submitHQCommand(text: string, assignedForceIds: string[]): void
```

流程：

```ts
const order = parseCommandToHQOrder({
  text,
  assignedForceIds,
  turn,
});

const plan = generateAIPlan({
  order,
  world/region/operation context,
});

const execution = executeAIPlan(...);

const reports = generateReportsFromBattleLog(...);
```

第一版可以简化：先只生成 order + report，不强求立即移动单位。

---

## 12. 第十二优先级：AI planner/executor 与地图接合

当前 `ai-planner.ts` 和 `ai-executor.ts` 是规则骨架。

必须让它们拿到：

```txt
RegionTile
StrategicChunk
OperationView
HQOrder
ForceCommandState
visible enemy estimate
```

先实现 5 个意图：

```txt
recon
attack
defend
withdraw
support
```

最低行为：

```txt
recon:
  选择靠近目标的道路/高地移动

attack:
  先接近目标，再请求 CombatViewport

defend:
  占据 city / highland / forest / bridge

withdraw:
  朝己方 supply / road 后撤

support:
  在后方保持距离，提供火力/补给
```

---

## 13. 第十三优先级：combat-modern 最小接入

### 13.1 当前状态

`combat-modern` 中已有：

```txt
armor-model
damage-model
line-of-sight
logistics
morale
suppression
terrain-effects
modern-unit-types
```

但它们没有进入 `engine.ts` / `ai.ts`。

### 13.2 修改要求

最小接入：

```txt
1. Unit 增加 modern?: ModernCombatStats。
2. AI 选目标前调用 LOS。
3. 攻击后调用 suppression。
4. morale 影响行动。
5. ammo/fuel 影响行动。
```

### 13.3 不要重写 engine

旧 engine 继续能跑。

如果 unit.modern 不存在：

```txt
走旧逻辑。
```

如果 unit.modern 存在：

```txt
使用现代战斗附加规则。
```

---

## 14. 需要修复的潜在类型问题

### 14.1 StrategicForce command 字段

必须修。

```ts
command?: ForceCommandState;
```

### 14.2 world-view 与 root world-map 类型冲突

如果存在：

```txt
src/game/world-map-types.ts
src/game/world-map/world-map-types.ts
```

非常容易 import 错。

必须统一 import 路径。

推荐全项目统一：

```ts
import type { RegionTile } from '@/game/world-map/world-map-types';
```

或相对路径：

```ts
import type { RegionTile } from '../world-map/world-map-types';
```

不要混用 root 版。

### 14.3 StrategicChunk 类型重复

如果 root 和 world-view 中都有 StrategicChunk，必须统一。

推荐只保留：

```txt
src/game/world-view/strategic-chunks.ts
```

---

## 15. 验收检查

完成后必须输出：

```txt
1. TypeScript 是否通过。
2. 是否消除 root world-map-* 重复引用。
3. generateWorldAtlas 是否能运行。
4. generateRegionTile(atlas,0,0) 是否能生成 1024×1024。
5. regionTile.strategicChunks 是否为 32×32。
6. buildStrategicMapFromRegionTile 是否能生成旧 StrategicMap。
7. StrategicMap 点击是否能打开 OperationView。
8. OperationView 点击是否能打开 CombatViewport。
9. CombatViewport 是否能转 GameMap。
10. AIReportPanel 是否显示 report。
11. CommandInputPanel 是否能提交命令。
12. ForceDelegationPanel 是否能把 force 交给 AI。
13. engine / ai 是否至少接入 LOS、suppression、ammo/fuel。
```

---

## 16. 直接给 Codex 的指令

```txt
你现在不要继续新增概念文件。当前项目已经有 WorldAtlas、RegionTile、StrategicChunk、Command、Report、CombatModern 的骨架。请做收敛性修改。

第一步：
检查 src/game 根目录下 world-map-* 文件和 src/game/world-atlas、src/game/world-map、src/game/world-view 三个目录。
确定目录版为主实现。
把根目录 world-map-* 中仍有价值的实现迁移到目录版。
停止引用根目录 world-map-* 文件。
不要保留同一功能两套实现。

第二步：
重构 src/game/world-atlas/region-tile-generator.ts。
把 TileRNG/TileNoise 抽到 src/game/world-atlas/region-random.ts。
把 terrain/rivers/cities/roads/bridges 拆到 src/game/world-map/ 对应模块。
region-tile-generator.ts 只保留 generateRegionTile 编排。

第三步：
删除或停止使用 region-tile-generator.ts 内部 buildRegionStrategicChunks。
统一使用 src/game/world-view/strategic-chunks.ts 的 buildStrategicChunks。

第四步：
修复 StrategicForce 类型。
在 src/game/strategic-types.ts 中给 StrategicForce 增加：
command?: ForceCommandState;
并确保 command/delegation.ts 不报类型错。

第五步：
统一 StrategicMap adapter。
使用 src/game/world-view/strategic-map-adapter.ts 作为唯一 RegionTile → StrategicMap 适配器。
如果根目录有 world-map-strategic-adapter.ts，把内容迁移后停止引用。

第六步：
接入战略 store。
新增 currentAtlas、currentRegionTile、selectedOperationView、selectedCombatViewport、aiReports、battleLogEvents。
战略初始化时生成 atlas + regionTile + StrategicMap。

第七步：
接入 UI。
StrategicMap 点击或按钮打开 OperationView。
OperationViewPanel 点击 cell 打开 CombatViewport。
CombatViewport 转 GameMap 后进入旧战术系统。
GameUI 或 StrategicMap 必须实际 import 并渲染：
AIReportPanel
CommandInputPanel
ForceDelegationPanel
OperationViewPanel

第八步：
接入 report-generator。
AI 执行或战斗结算后，把 BattleLogEvent[] 转成 AIReport[]，写入 store.aiReports。
AIReportPanel 从 store 显示。

第九步：
接入 CommandInputPanel。
玩家输入自然语言命令，生成 HQOrder，绑定到 selected/delegated force。
调用 ai-planner / ai-executor，生成 battle log 和 report。

第十步：
把 combat-modern 最小接入 engine.ts / ai.ts。
至少实现：
- AI 不攻击 LOS 外目标
- 攻击增加 suppression
- morale 影响行动
- ammo/fuel 影响行动

第十一步：
运行 npm run build 或 npm run lint 或 npx tsc --noEmit。
修复所有类型错误。

完成后输出：
1. 修改文件列表
2. 删除/弃用文件列表
3. 是否还存在 root world-map-* 引用
4. RegionTile 生成结果
5. StrategicChunk 生成结果
6. OperationView / CombatViewport 是否可点击打开
7. GameMap 是否来自 CombatViewport
8. AIReport 是否显示
9. Command 是否能提交
10. Force 是否能交给 AI
11. 构建结果
```

---

## 17. 当前最关键的一句话

当前更新已经有了大量代码，但仍然没有真正形成可玩闭环。

现在必须停止“继续写骨架”，转为：

```txt
整理重复实现
拆分超大文件
修类型错误
接入 store
接入 UI
跑通战略 → 战役 → 战术 → AI → 报告
```
