# README：根据当前 GitHub 最新状态的下一轮修改方案

## 0. 当前状态结论

当前项目已经比上一轮推进明显：

```txt
1. src/game/world-atlas/region-random.ts 已经存在，并导出了 RegionRNG / RegionNoise。
2. src/game/world-map/world-map-terrain.ts 已经有基础地形生成逻辑。
3. src/game/world-map/world-map-cities.ts 已经有城市生成逻辑，并且 city.bounds 已经改成 global 坐标。
4. src/game/world-map/world-map-rivers.ts 已经有河流生成逻辑。
5. src/game/world-map/world-map-roads.ts 已经有简化 A* 道路生成逻辑。
6. src/store/strategic-store.ts 已经有 currentAtlas / currentRegionTile / selectedOperationView / selectedCombatViewport / tacticalMapFromWorld / aiReports / battleLogEvents。
7. src/game/types.ts 已经给 Unit 增加了 modern 字段。
```

但是当前还没有形成完整可玩闭环，主要问题变成：

```txt
1. root 目录 world-map-* 文件仍然存在，目录版和根目录版仍然并行。
2. OperationView / CombatViewport 已经做 global → local，但边界 clamp 不完整。
3. region-tile-generator.ts 是否真正只做编排仍需确认，必须停止内部重复逻辑。
4. tacticalMapFromWorld 仍然没有明确进入旧战术战斗入口。
5. Unit.modern 是内联类型，不是 ModernCombatStats，容易和 combat-modern 模块脱节。
6. world-map-roads.ts 虽然有 A*，但道路全连接所有城市，后续可能性能和逻辑都不好。
7. 河流仍然是 region 内部追踪，还不是跨 region 连续河流。
```

当前任务不是继续新增架构，而是把这条链跑通：

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

## 1. 优先修复 OperationView / CombatViewport 边界裁剪

### 当前问题

`operation-view.ts` 和 `combat-viewport.ts` 已经做了：

```ts
const localCenterX = center.globalX - regionTile.worldOrigin.globalX;
const localCenterY = center.globalY - regionTile.worldOrigin.globalY;
```

这是正确方向。

但是现在 `startX/startY` 仍然类似：

```ts
const startX = Math.max(0, localCenterX - Math.floor(width / 2));
const startY = Math.max(0, localCenterY - Math.floor(height / 2));
const endX = Math.min(regionTile.width, startX + width);
const endY = Math.min(regionTile.height, startY + height);
```

这样靠近 region 右边缘或下边缘时，会导致输出视图尺寸小于请求尺寸。

例如：

```txt
regionTile.width = 1024
width = 128
localCenterX = 1010

当前：
startX = 946
endX = 1024
actual width = 78

正确：
startX 应该 clamp 到 896
endX = 1024
actual width = 128
```

### 修改文件

```txt
src/game/world-view/operation-view.ts
src/game/world-view/combat-viewport.ts
```

### 新增工具函数

推荐新增：

```txt
src/game/world-view/view-rect-utils.ts
```

内容：

```ts
export function clampViewStart(
  center: number,
  size: number,
  maxSize: number
): number {
  if (size >= maxSize) return 0;

  const raw = Math.floor(center - size / 2);

  return Math.max(
    0,
    Math.min(raw, maxSize - size)
  );
}

export function getClampedLocalViewRect(params: {
  centerX: number;
  centerY: number;
  width: number;
  height: number;
  maxWidth: number;
  maxHeight: number;
}) {
  const width = Math.min(params.width, params.maxWidth);
  const height = Math.min(params.height, params.maxHeight);

  const x = clampViewStart(params.centerX, width, params.maxWidth);
  const y = clampViewStart(params.centerY, height, params.maxHeight);

  return {
    x,
    y,
    width,
    height,
  };
}
```

### OperationView 改法

```ts
const localCenterX = center.globalX - regionTile.worldOrigin.globalX;
const localCenterY = center.globalY - regionTile.worldOrigin.globalY;

const localRect = getClampedLocalViewRect({
  centerX: localCenterX,
  centerY: localCenterY,
  width,
  height,
  maxWidth: regionTile.width,
  maxHeight: regionTile.height,
});
```

输出：

```ts
worldRect: {
  x: regionTile.worldOrigin.globalX + localRect.x,
  y: regionTile.worldOrigin.globalY + localRect.y,
  width: localRect.width,
  height: localRect.height,
}
```

### CombatViewport 改法

同样使用：

```ts
const localRect = getClampedLocalViewRect(...);
```

返回：

```ts
worldRect: {
  x: regionTile.worldOrigin.globalX + localRect.x,
  y: regionTile.worldOrigin.globalY + localRect.y,
  width: localRect.width,
  height: localRect.height,
}
```

### 验收

必须测试：

```txt
center = region 左上角附近
center = region 中心
center = region 右下角附近
regionX = 0, regionY = 0
regionX = 1, regionY = 0
regionX = 0, regionY = 1
```

期望：

```txt
OperationView 默认能裁出 128×128，除非请求尺寸大于 region。
CombatViewport 默认能裁出 64×48，除非请求尺寸大于 region。
worldRect 是 global 坐标。
cells 数量和 worldRect 尺寸一致。
```

---

## 2. 确认 RegionTile 只使用目录版 buildStrategicChunks

`src/game/world-view/strategic-chunks.ts` 应该是唯一的 chunk 汇总入口。

必须确认：

```txt
src/game/world-atlas/region-tile-generator.ts
```

最终只调用：

```ts
import { buildStrategicChunks } from '../world-view/strategic-chunks';
```

并且：

```ts
tile.strategicChunks = buildStrategicChunks(
  tile,
  atlas.strategicChunkSize ?? 32
);
```

禁止继续保留或调用：

```ts
buildRegionStrategicChunks(...)
```

如果内部函数还存在：

```txt
删除
或至少停止调用
```

默认配置：

```txt
regionSize = 1024
strategicChunkSize = 32
```

必须满足：

```ts
regionTile.strategicChunks.length === 32
regionTile.strategicChunks[0].length === 32
```

并且：

```txt
大城市跨多个 chunk 时，每个相交 chunk 都包含 cityId。
```

---

## 3. 清理 root 目录 world-map-* 平行实现

### 当前问题

根目录仍然存在：

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

目录版也存在：

```txt
src/game/world-atlas/
src/game/world-map/
src/game/world-view/
```

### 修改要求

主链路只能使用目录版：

```txt
src/game/world-atlas/
src/game/world-map/
src/game/world-view/
```

对 root `world-map-*` 文件：

```txt
1. 如果还有 import，迁移到目录版。
2. 如果没有 import，在文件顶部加 @deprecated。
3. 暂时不要强制删除，以免破坏旧 fallback。
4. 但新功能不允许继续引用 root world-map-*。
```

检查命令：

```bash
grep -R "from './world-map-" src/game src/store src/components
grep -R "from '@/game/world-map-" src/game src/store src/components
grep -R "../world-map-" src/game src/store src/components
```

---

## 4. 确认 region-tile-generator.ts 已经变成编排器

现在 `world-map-terrain.ts`、`world-map-cities.ts`、`world-map-rivers.ts`、`world-map-roads.ts` 已经有实质代码。

下一步要确认 `region-tile-generator.ts` 不再重复实现这些逻辑。

正确结构：

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

  const tile = buildRegionTile(ctx);

  tile.strategicChunks = buildStrategicChunks(
    tile,
    atlas.strategicChunkSize ?? 32
  );

  return tile;
}
```

验收：

```txt
region-tile-generator.ts 不再定义 TileRNG / TileNoise
region-tile-generator.ts 不再定义城市绘制
region-tile-generator.ts 不再定义道路寻路
region-tile-generator.ts 不再定义河流追踪
region-tile-generator.ts 不再定义 buildRegionStrategicChunks
region-tile-generator.ts 只负责调用各模块
```

---

## 5. 修正 world-map-roads.ts 的 global 坐标写法

### 当前代码问题

`world-map-roads.ts` 里道路 path 的 global 坐标目前是通过：

```ts
globalX: from.center.globalX + (pt.x - fx)
globalY: from.center.globalY + (pt.y - fy)
```

在正常情况下等价于：

```ts
regionOrigin.globalX + pt.x
regionOrigin.globalY + pt.y
```

但这种写法依赖 `fx/fy` 和 `from.center` 关系正确，后续如果支持跨 region 或负坐标会更容易出错。

### 修改建议

在 `generateRegionRoads(ctx)` 中直接取：

```ts
const ox = ctx.worldOrigin.globalX;
const oy = ctx.worldOrigin.globalY;
```

写 path 时统一：

```ts
path.push({
  globalX: ox + pt.x,
  globalY: oy + pt.y,
});
```

fallback 直线也一样：

```ts
path.push({
  globalX: ox + x,
  globalY: oy + y,
});
```

城市 local 坐标也建议统一：

```ts
const fx = from.center.globalX - ctx.worldOrigin.globalX;
const fy = from.center.globalY - ctx.worldOrigin.globalY;
```

不要继续使用：

```ts
from.center.globalX % regionSize
```

---

## 6. 给 Unit.modern 改成 ModernCombatStats 类型

### 当前情况

`types.ts` 里已经有：

```ts
modern?: {
  suppression: number;
  morale: number;
  cohesion: number;
  fuel: number;
  maxFuel: number;
  ammo: Record<string, number>;
};
```

这说明已经接入了 `modern` 字段，但它是内联结构，不是复用 `combat-modern/modern-unit-types.ts`。

### 修改要求

修改：

```txt
src/game/types.ts
```

顶部引入：

```ts
import type { ModernCombatStats } from './combat-modern/modern-unit-types';
```

然后把 Unit 里的 modern 改成：

```ts
modern?: ModernCombatStats;
```

原因：

```txt
combat-modern 模块定义一套 ModernCombatStats
Unit 里又内联一套 modern
后续 engine / ai / logistics / suppression 用到的字段不一致
```

兼容要求：

```txt
modern 必须 optional。
旧单位没有 modern 时继续走旧逻辑。
```

---

## 7. 接通 CombatViewport 到真实战术战斗

### 当前问题

`strategic-store.ts` 已经有：

```ts
selectedCombatViewport
tacticalMapFromWorld
```

但还没有发现：

```ts
enterTacticalFromCombatViewport()
```

也就是说，现在大概率只是生成了 `GameMap`，但没有真正进入旧战术战斗流程。

### 修改文件

```txt
src/store/strategic-store.ts
src/store/game-store.ts
src/components/game/StrategicMap.tsx
src/components/game/OperationViewPanel.tsx
src/game/tactical-integration.ts
```

### 新增 store action

在 `StrategicStore` 中新增：

```ts
enterTacticalFromCombatViewport: () => void;
```

实现逻辑：

```ts
enterTacticalFromCombatViewport: () => {
  const {
    selectedCombatViewport,
    tacticalMapFromWorld,
  } = get();

  if (!selectedCombatViewport || !tacticalMapFromWorld) {
    console.warn('[WorldAtlas] No CombatViewport/GameMap ready.');
    return;
  }

  useGameStore.getState().initTacticalBattle({
    mapOverride: tacticalMapFromWorld,
    source: 'world-combat-viewport',
    sourceWorldRect: selectedCombatViewport.worldRect,
  });

  set({
    gameMode: 'tactical',
  });
}
```

具体 `useGameStore` API 按项目当前实际函数名改。

如果旧 game-store 不支持 mapOverride，给旧初始化函数加可选参数：

```ts
initTacticalBattle(params?: {
  mapOverride?: GameMap;
  source?: 'legacy' | 'world-combat-viewport';
  sourceWorldRect?: {
    x: number;
    y: number;
    width: number;
    height: number;
  };
})
```

规则：

```txt
mapOverride 存在 → 直接用 mapOverride
mapOverride 不存在 → 走旧 map.ts / procedural-map.ts fallback
```

禁止：

```txt
禁止重新调用 generateMap('random')
禁止重新调用 procedural-map.ts
禁止丢弃 CombatViewport
禁止进入战术战斗后地图与 OperationView 不对应
```

---

## 8. UI 增加“进入战术战斗”按钮

修改：

```txt
src/components/game/StrategicMap.tsx
```

在 `selectedCombatViewport` 存在时显示：

```tsx
<button onClick={() => enterTacticalFromCombatViewport()}>
  进入战术战斗
</button>
```

按钮文案可以是：

```txt
进入战术战斗
Start Tactical Battle
```

点击后：

```txt
1. 使用 tacticalMapFromWorld。
2. 切换 gameMode = tactical。
3. 旧战术 UI 显示 CombatViewport 转出来的地图。
```

---

## 9. AIReport 继续保留，但先不要扩展复杂 AI

当前重点不是继续增强报告文字，而是让报告来自真实事件。

确认：

```txt
src/store/strategic-store.ts
src/game/reports/report-generator.ts
src/components/game/AIReportPanel.tsx
```

必须满足：

```txt
1. 玩家提交命令生成 order_received。
2. AI 计划生成 ORDER_CONFIRMATION 或 SITREP。
3. 事件写入 battleLogEvents。
4. report-generator 生成 aiReports。
5. AIReportPanel 显示。
```

---

## 10. combat-modern 本轮只做最小接入

不要重写引擎。

只做：

```txt
1. Unit.modern 使用 ModernCombatStats。
2. AI 选择攻击目标时，如果 modern 存在，检查 LOS。
3. 攻击后如果 modern 存在，增加 suppression。
4. ammo = 0 时禁止对应攻击。
5. fuel = 0 时禁止移动。
```

---

## 11. 必须运行类型检查

完成后运行：

```bash
npx tsc --noEmit
```

如果项目更适合：

```bash
npm run build
```

也可以运行 build。

必须修复以下类型错误：

```txt
RegionRNG / RegionNoise 导出与 import 不一致
OperationView worldRect / cells 尺寸不一致
CombatViewport 参数不一致
RegionTile strategicChunks 类型
Unit.modern 类型
root world-map-* 类型重复
game-store initTacticalBattle 参数
```

---

## 12. 给 Codex 的直接指令

```txt
你现在继续修改 threejstest。

当前情况：
- region-random.ts 已经有 RegionRNG / RegionNoise。
- world-map-terrain.ts / cities.ts / rivers.ts / roads.ts 已经有实质代码。
- OperationView / CombatViewport 已经开始 global → local，但边界 clamp 不完整。
- Unit 已经有 modern 字段，但不是 ModernCombatStats。
- tacticalMapFromWorld 已经存在，但还没有明确进入旧战术战斗入口。
- root world-map-* 文件仍然存在，必须停止参与主链路。

请按顺序修改：

1. 修复 OperationView / CombatViewport 的边界裁剪。
   新增 clampViewStart / getClampedLocalViewRect。
   靠近 region 边缘时仍返回固定尺寸视图。

2. 确认 RegionTile 只使用 world-view/strategic-chunks.ts 的 buildStrategicChunks。
   停止使用任何内部 buildRegionStrategicChunks。

3. 清理 root world-map-* 的引用。
   主链路只允许使用：
   src/game/world-atlas/
   src/game/world-map/
   src/game/world-view/
   root world-map-* 如果保留，标记 @deprecated。

4. 确认 region-tile-generator.ts 只做编排。
   地形、河流、城市、道路、桥梁、校验必须来自 world-map/ 目录模块。

5. 修正 world-map-roads.ts 的坐标写法。
   path global 坐标统一使用 ctx.worldOrigin.globalX + localX。
   不要用 from.center.globalX + delta。

6. 把 Unit.modern 改成 ModernCombatStats。
   在 src/game/types.ts 引入 ModernCombatStats。
   Unit 中写：
   modern?: ModernCombatStats;

7. 新增 enterTacticalFromCombatViewport。
   它必须把 tacticalMapFromWorld 传入旧战术系统。
   如果旧 game-store 不支持 mapOverride，就扩展 initTacticalBattle({ mapOverride }).

8. 在 StrategicMap.tsx 中，当 selectedCombatViewport 存在时显示“进入战术战斗”按钮。
   点击后调用 enterTacticalFromCombatViewport。

9. 确认 CommandInputPanel → HQOrder → BattleLogEvent → AIReport → AIReportPanel 仍然可用。
   不要继续扩展复杂 AI，只保证报告闭环。

10. 运行 npx tsc --noEmit 或 npm run build。
   修复所有类型错误。

完成后输出：
- 修改文件列表
- OperationView / CombatViewport 边界裁剪是否修复
- RegionTile 是否使用目录版 buildStrategicChunks
- root world-map-* 是否仍被主链路引用
- region-tile-generator 是否只做编排
- world-map-roads 坐标是否改成 worldOrigin + local
- Unit.modern 是否使用 ModernCombatStats
- CombatViewport 是否能进入旧战术战斗
- 是否新增“进入战术战斗”按钮
- tsc/build 结果
```

---

## 13. 当前最优先的 3 件事

```txt
1. 修 OperationView / CombatViewport 边界裁剪。
2. 接通 CombatViewport → GameMap → 旧战术战斗。
3. 统一 Unit.modern 类型并跑 tsc。
```

这三件事完成后，项目才算真正从“能生成局部战术图”进入“能玩对应战术战斗”。
