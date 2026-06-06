# 战役图到战术地图生成 README

## 目标

当前项目已经有：

```txt
战略图 Strategic Map
  ↓
战役 / 局部详细图 Detail / Operation Map
```

下一步要实现：

```txt
战役 / 局部详细图
  ↓ 选择一个接敌点、目标点、城市边缘、桥梁、高地、道路交叉口
战术地图 Tactical Map
```

本次目标：

1. 从已有的 DetailMap / OperationMap 生成能玩的战术地图。
2. 战术地图必须和上一级地图对应。
3. 不能重新随机出一张无关地图。
4. 保留当前已有战术地图系统。
5. 不接真实地图。
6. 不引入大型依赖。
7. 不重写整个战斗系统。

---

## 一、当前已有基础

当前项目里已经有传统战术地图系统：

```txt
src/game/map.ts
src/game/procedural-map.ts
src/game/types.ts
src/game/config.ts
```

`map.ts` 里已有一些战术地图类型，例如：

```txt
mountain-pass
river-valley
urban-warfare
desert-storm
procedural
random
```

这些可以保留，作为 fallback 或测试地图。

本次新增的是：

```txt
从 DetailMap / OperationMap 生成 TacticalMap
```

不是删除旧地图系统。

---

## 二、新增战术生成桥接文件

新增文件：

```txt
src/game/tactical-from-detail.ts
```

这个文件只负责：

```txt
DetailMap / OperationMap
  ↓
GameMap
```

不要把逻辑塞进 `map.ts`。

---

## 三、新增生成配置

在 `tactical-from-detail.ts` 中新增：

```ts
export interface TacticalFromDetailConfig {
  width: number;
  height: number;

  center: {
    x: number;
    z: number;
  };

  radius?: number;

  attackerDirection: 'west' | 'east' | 'north' | 'south';

  battleType:
    | 'encounter'
    | 'urban_assault'
    | 'bridge_crossing'
    | 'hill_assault'
    | 'forest_fight'
    | 'road_ambush'
    | 'fortress_assault'
    | 'open_field';

  seed: number;

  preserveRoads: boolean;
  preserveRivers: boolean;
  preserveUrban: boolean;
  preserveElevation: boolean;
}
```

默认配置：

```ts
export const DEFAULT_TACTICAL_FROM_DETAIL_CONFIG: TacticalFromDetailConfig = {
  width: 16,
  height: 12,

  center: { x: 0, z: 0 },

  attackerDirection: 'west',

  battleType: 'encounter',

  seed: 20260606,

  preserveRoads: true,
  preserveRivers: true,
  preserveUrban: true,
  preserveElevation: true,
};
```

后续可以支持：

```txt
16×12 小战斗
24×18 普通战斗
32×24 城市战 / 桥梁战
```

第一版优先支持：

```txt
16×12
24×18
```

---

## 四、新增入口函数

在 `tactical-from-detail.ts` 中实现：

```ts
export function generateTacticalMapFromDetailMap(params: {
  detailMap: DetailMap;
  config: TacticalFromDetailConfig;
}): GameMap;
```

输入：

```txt
DetailMap
战术地图中心点
战术地图宽高
战斗类型
进攻方向
seed
```

输出：

```txt
GameMap
```

也就是当前战斗系统可以直接使用的地图结构。

---

## 五、坐标裁剪规则

战术地图是从 DetailMap 中裁剪出来的。

例如：

```txt
DetailMap: 48×48
战术中心点: (24, 24)
战术地图大小: 16×12
```

裁剪范围：

```txt
x = center.x - width / 2 到 center.x + width / 2
z = center.z - height / 2 到 center.z + height / 2
```

如果裁剪超出 DetailMap 边界：

```txt
用边缘地形补齐
或者 clamp 到边界
```

推荐第一版使用 clamp。

---

## 六、DetailCell 到 MapCell 的映射

新增函数：

```ts
function convertDetailCellToMapCell(params: {
  detailCell: DetailMapCell;
  tacticalX: number;
  tacticalZ: number;
  config: TacticalFromDetailConfig;
}): MapCell;
```

基础映射：

| DetailMapCell | MapCell |
|---|---|
| terrain plains | terrain plains |
| terrain forest | terrain forest |
| terrain mountain | terrain mountain |
| terrain water | terrain water |
| terrain city | terrain city |
| terrain desert | terrain desert |
| terrain swamp / marshland | terrain swamp |
| feature main_road | road feature / road terrain |
| feature secondary_road | road feature / road terrain |
| feature bridge | bridge |
| feature river | water 或 river feature |
| feature urban_block | city |
| feature suburb | city 或 plains |
| feature industrial | city |
| feature hill | mountain 或 plains |
| feature field | plains |
| feature checkpoint | fortress 或 city |
| feature supply_point | fortress 或 city |

如果当前 `MapCell` 已经有 `features` 字段：

```ts
cell.features = [...detailCell.features]
```

如果旧渲染还只认 `terrain`：

```txt
bridge 优先级最高
city 其次
road 其次
river / water 其次
base terrain 最后
```

---

## 七、terrain 合成优先级

生成战术地图时，不要让 road 把 city 完全覆盖。

推荐优先级：

```ts
function resolveTacticalTerrain(detailCell: DetailMapCell): TerrainType {
  const features = detailCell.features ?? [];

  if (features.includes('bridge')) {
    return 'bridge';
  }

  if (
    features.includes('city_center') ||
    features.includes('urban_block') ||
    features.includes('industrial')
  ) {
    return 'city';
  }

  if (detailCell.terrain === 'city') {
    return 'city';
  }

  if (features.includes('river')) {
    return detailCell.terrain === 'water' ? 'water' : detailCell.terrain;
  }

  if (
    features.includes('main_road') ||
    features.includes('secondary_road')
  ) {
    if (detailCell.terrain === 'city') return 'city';
    if (detailCell.terrain === 'water') return 'bridge';
    return 'road';
  }

  return detailCell.terrain;
}
```

注意：

```txt
road 是 feature。
如果旧系统必须用 terrain = road，只有非 city、非 water 的格子才可以转 road。
```

---

## 八、按战斗类型强化战术图

从 DetailMap 裁剪后，还要根据 battleType 做轻量修正。

### 8.1 encounter 遭遇战

要求：

```txt
开阔地较多
少量森林 / 高地
道路可有可无
目标点在中部
```

修正：

```txt
如果地图过于堵塞，清理部分森林 / 山地。
中心附近保持可通行。
```

---

### 8.2 urban_assault 城市进攻

触发条件：

```txt
detailMap 中心附近 city / urban_block 较多
```

要求：

```txt
城市区至少占 30%
道路穿过城市
城市外围有 plains / forest
防守方部署在城市内部
进攻方部署在城市外
```

修正：

```txt
中心 40% 区域加强 city。
边缘保持至少一侧开阔，用于进攻方部署。
```

---

### 8.3 bridge_crossing 桥梁争夺

触发条件：

```txt
中心附近存在 bridge
或者同时存在 river + road
```

要求：

```txt
河流横切地图
至少 1 个 bridge
道路连接桥两侧
桥头附近可部署据点
```

修正：

```txt
如果没有 bridge，但存在 road + river 交叉，则创建 bridge。
如果没有连续 river，但 battleType 是 bridge_crossing，则从 detailMap 中延伸 river。
```

---

### 8.4 hill_assault 高地进攻

触发条件：

```txt
中心附近 mountain / hill / highland 较多
```

要求：

```txt
中心或防守方一侧有高地
进攻方从低处进入
高地不能完全堵死
至少有 1 条可通行路线
```

修正：

```txt
中心附近保留 mountain / highland。
打通至少一条上山道路或坡道。
```

---

### 8.5 forest_fight 林地战

要求：

```txt
森林多
视野受限
道路或林间空地形成通道
```

修正：

```txt
森林比例 35% 到 55%。
清理一条主通道。
```

---

### 8.6 road_ambush 道路伏击

要求：

```txt
一条主路贯穿地图
道路两侧有森林 / 高地 / 城市边缘
伏击点在中部
```

修正：

```txt
确保 main_road 从一边连到另一边。
道路两侧生成掩体地形。
```

---

### 8.7 fortress_assault 要塞进攻

触发条件：

```txt
detailMap 或 strategic sector 有 fortress / checkpoint
```

要求：

```txt
中心或防守方后方有 fortress
外围有道路或开阔接近路线
不要把整张图都变成要塞
```

---

### 8.8 open_field 开阔地

要求：

```txt
大部分 plains
少量 forest / hill
适合装甲战
```

---

## 九、自动判断 battleType

新增函数：

```ts
export function inferBattleTypeFromDetailMap(params: {
  detailMap: DetailMap;
  center: { x: number; z: number };
  radius?: number;
}): TacticalFromDetailConfig['battleType'];
```

判断规则：

```txt
如果中心附近有 bridge：
  bridge_crossing

否则如果 city / urban_block 比例高：
  urban_assault

否则如果 mountain / hill 比例高：
  hill_assault

否则如果 forest 比例高：
  forest_fight

否则如果 main_road 贯穿中心且两侧有掩体：
  road_ambush

否则：
  encounter
```

统计范围：

```txt
以 center 为中心，半径 6 到 8 个 detail cell。
```

---

## 十、部署区生成

新增函数：

```ts
export function createDeploymentZonesForTacticalMap(params: {
  map: GameMap;
  attackerDirection: 'west' | 'east' | 'north' | 'south';
  battleType: TacticalFromDetailConfig['battleType'];
}): {
  attackerZone: Position[];
  defenderZone: Position[];
};
```

### 规则

如果 attackerDirection = west：

```txt
攻击方部署区：左侧 2~3 列
防守方部署区：右侧 2~3 列或目标周围
```

如果 attackerDirection = east：

```txt
攻击方部署区：右侧 2~3 列
防守方部署区：左侧 2~3 列或目标周围
```

如果 north：

```txt
攻击方部署区：上方 2~3 行
防守方部署区：下方 2~3 行或目标周围
```

如果 south：

```txt
攻击方部署区：下方 2~3 行
防守方部署区：上方 2~3 行或目标周围
```

只允许部署在可通行格：

```txt
不能部署在 water
不能部署在不可通行 mountain
优先 plains / road / city / forest
```

---

## 十一、战术目标点生成

新增函数：

```ts
export function createTacticalObjectives(params: {
  map: GameMap;
  battleType: TacticalFromDetailConfig['battleType'];
}): CapturePoint[];
```

### 目标点规则

```txt
bridge_crossing:
  目标点放在 bridge 或桥头

urban_assault:
  目标点放在 city_center / urban_block

hill_assault:
  目标点放在中心高地

road_ambush:
  目标点放在道路中段或检查点

fortress_assault:
  目标点放在 fortress

encounter:
  目标点放在地图中部可通行格
```

目标点类型对应：

```txt
bridge_crossing → bridgehead
urban_assault → comm_hub 或 stronghold
hill_assault → stronghold
road_ambush → supply_base
fortress_assault → stronghold
encounter → supply_base
```

---

## 十二、单位生成 / 映射

本次可以先不做复杂单位拆分，但要预留接口。

新增文件：

```txt
src/game/tactical-force-mapper.ts
```

新增：

```ts
export interface TacticalForceMappingInput {
  attackerStrategicForceIds: string[];
  defenderStrategicForceIds: string[];

  attackerDirection: 'west' | 'east' | 'north' | 'south';

  battleType: TacticalFromDetailConfig['battleType'];
}

export function generateTacticalUnitsFromStrategicForces(params: {
  input: TacticalForceMappingInput;
  attackerZone: Position[];
  defenderZone: Position[];
  seed: number;
}): {
  attackerUnits: Unit[];
  defenderUnits: Unit[];
};
```

第一版可以简单规则：

```txt
战略 force 里有 tank → 生成 tank 单位
有 ifv → 生成 ifv
有 infantry → 生成 infantry
有 artillery → 少量 artillery 或不生成，作为支援
有 scout → 生成 scout
有 engineer → 生成 engineer
```

数量先控制在：

```txt
攻击方 4~8 个单位
防守方 4~8 个单位
```

不要一次塞太多单位。

---

## 十三、战术地图与上一级地图对应

必须满足：

```txt
1. DetailMap 中心是城市，TacticalMap 中心附近必须有 city。
2. DetailMap 中心有 bridge，TacticalMap 必须有 bridge。
3. DetailMap 中心有 river，TacticalMap 必须有 river 或 water。
4. DetailMap 中心有 main_road，TacticalMap 必须有 road。
5. DetailMap 是 forest 区域，TacticalMap 不能变成城市图。
6. DetailMap 是 mountain / hill 区域，TacticalMap 不能变成平原图。
7. DetailMap 的道路方向要尽量保留。
8. DetailMap 的河流方向要尽量保留。
```

一句话：

```txt
战术图是战役 / 详细图的裁剪和战斗化版本，不是新随机地图。
```

---

## 十四、和现有 map.ts 的关系

保留现有：

```txt
generateMountainPass
generateRiverValley
generateUrbanWarfare
generateDesertStorm
generateMap
```

新增一种入口：

```ts
export function generateMapFromDetail(
  detailMap: DetailMap,
  config: TacticalFromDetailConfig
): GameMap {
  return generateTacticalMapFromDetailMap({ detailMap, config });
}
```

不要破坏旧的：

```ts
generateMap(mapType)
```

---

## 十五、推荐 UI 接入

在 DetailMapPreview 中，点击一个 detail cell 时，可以出现按钮：

```txt
生成战术地图
```

点击后：

```ts
const battleType = inferBattleTypeFromDetailMap({
  detailMap,
  center: clickedCell.position,
});

const tacticalMap = generateTacticalMapFromDetailMap({
  detailMap,
  config: {
    ...DEFAULT_TACTICAL_FROM_DETAIL_CONFIG,
    center: clickedCell.position,
    battleType,
    attackerDirection: 'west',
    seed: detailMap.seed + clickedCell.position.x * 31 + clickedCell.position.z * 131,
  },
});
```

然后进入现有战术战棋界面。

---

## 十六、可视化调试

生成战术图后 console 输出：

```txt
battleType
map width / height
terrain counts
road count
river count
bridge count
city count
objective count
attacker deployment cells
defender deployment cells
source detail map id
source center coordinate
```

如果：

```txt
battleType = bridge_crossing 但 bridge count = 0
battleType = urban_assault 但 city count < 10
battleType = hill_assault 但 mountain / highland count < 6
```

要输出 warning。

---

## 十七、验收标准

使用任意一个已有 DetailMap 测试。

### 17.1 城市战

输入：

```txt
DetailMap 中心为 city / urban_block
```

输出必须满足：

```txt
TacticalMap 中 city 格子 >= 20%
中心附近有 city
至少 1 条 road 穿过城区
有可通行攻击方部署区
```

### 17.2 桥梁战

输入：

```txt
DetailMap 中心为 bridge 或 road + river
```

输出必须满足：

```txt
TacticalMap 有 river 或 water
TacticalMap 有 bridge
bridge 同时连接 road 两侧
双方部署区在河流两侧或桥头两侧
```

### 17.3 高地战

输入：

```txt
DetailMap 中心为 mountain / hill
```

输出必须满足：

```txt
中心附近有 mountain / highland
至少一条通路可上高地
攻击方部署区不在高地中心
目标点在高地附近
```

### 17.4 林地战

输入：

```txt
DetailMap 中心 forest 较多
```

输出必须满足：

```txt
forest 比例 35% 到 55%
至少一条通路
不是全森林堵死
```

---

## 十八、不要做

```txt
不要接真实地图
不要引入大型依赖
不要重写战斗 AI
不要重写全部 UI
不要删旧 map.ts 预设地图
不要让 TacticalMap 和 DetailMap 不对应
不要直接随机生成无关地图
不要一次生成过多单位
```

---

## 十九、完成后输出

完成后请输出：

```txt
1. 修改了哪些文件
2. 是否新增 tactical-from-detail.ts
3. 是否新增 generateTacticalMapFromDetailMap
4. 是否新增 inferBattleTypeFromDetailMap
5. 是否新增 createDeploymentZonesForTacticalMap
6. 是否新增 createTacticalObjectives
7. 是否能从城市 DetailMap 生成城市战 TacticalMap
8. 是否能从桥梁 DetailMap 生成桥梁战 TacticalMap
9. TacticalMap 是否和 DetailMap 对应
10. npm run build 或 npm run lint 是否通过
```
