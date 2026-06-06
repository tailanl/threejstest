# 战略图到局部详细地图生成 README

## 目标

实现一个新的地图层级系统：

```txt
战略图 Strategic Map
  ↓ 点击某个战略格子
局部详细地图 Detail Map
  ↓ 后续可继续进入战术战棋地图
战术地图 Tactical Map
```

本次重点：

1. 点击战略图上的城市格子，生成这个城市的详细小地图。
2. 点击普通战略格子，生成该格子的详细小地图。
3. 可以生成城市周围 3×3 战略格子的详细地图。
4. 小地图必须和大战略图对应。
5. 不使用真实地图。
6. 不引入大型依赖。
7. 保持当前项目可运行。

---

## 一、当前问题

当前 `StrategicSector` 已经开始有分层数据：

```ts
baseTerrain?: StrategicBaseTerrainType;
features?: StrategicFeatureType[];
gen?: {
  elevation?: number;
  slope?: number;
  moisture?: number;
  cityRank?: CityRank;
  riverWidth?: number;
}
```

但是 `MapCell` 仍然主要依赖：

```ts
terrain
isRoad
roadType
```

这不够表达详细小地图里的：

```txt
城市中心
城市街区
郊区
道路
河流
桥梁
工业区
检查点
补给点
森林块
高地
```

所以需要给小地图增加独立类型，不要直接复用战略格子。

---

## 二、新增 MapCell features

修改：

```txt
src/game/types.ts
```

新增：

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
  | 'forest_patch'
  | 'hill'
  | 'field'
  | 'checkpoint'
  | 'supply_point';
```

给 `MapCell` 增加：

```ts
features?: TacticalFeatureType[];
```

注意：

- 不要删除 `isRoad`。
- 不要删除 `roadType`。
- 新逻辑优先使用 `features`。
- 旧代码继续兼容。

---

## 三、新增详细地图类型

新建文件：

```txt
src/game/detail-map-types.ts
```

内容：

```ts
import type {
  TerrainType,
  TacticalFeatureType,
} from './types';

import type {
  CityRank,
  StrategicPosition,
} from './strategic-types';

export type DetailMapKind =
  | 'city'
  | 'sector'
  | 'battlefield';

export interface DetailMapPosition {
  x: number;
  z: number;
}

export interface DetailMapCell {
  position: DetailMapPosition;

  terrain: TerrainType;

  features: TacticalFeatureType[];

  sourceStrategicSector: StrategicPosition;

  localElevation: number;
  localMoisture: number;

  movementCost: number;
  defenseBonus: number;

  isObjective: boolean;

  isRoad?: boolean;
  roadType?: 'main' | 'secondary';
}

export interface DetailMap {
  id: string;

  kind: DetailMapKind;

  sourceStrategicSector: StrategicPosition;

  includedStrategicSectors: StrategicPosition[];

  width: number;
  height: number;

  cells: DetailMapCell[][];

  seed: number;

  title: string;

  metadata: {
    centerName?: string;
    cityRank?: CityRank;
    generatedFrom: 'strategic_sector';
    scale: number;
  };
}
```

---

## 四、战略格子和小地图比例

第一版固定：

```txt
1 个 StrategicSector = 16 × 16 DetailMapCell
```

规则：

```txt
点击单个战略格子：
1×1 strategic sector
↓
16×16 detail map

点击“查看周边 3×3”：
3×3 strategic sectors
↓
48×48 detail map
```

暂时只要求支持：

```txt
radius = 0 生成 16×16
radius = 1 生成 48×48
```

---

## 五、新增详细地图生成器

新建文件：

```txt
src/game/detail-map-generator.ts
```

实现：

```ts
export function generateDetailMapFromStrategicSector(params: {
  strategicMap: StrategicMap;
  center: StrategicPosition;
  radius: number;
  seed?: number;
}): DetailMap;
```

### radius 规则

```txt
radius = 0:
  includedStrategicSectors = center
  width = 16
  height = 16

radius = 1:
  includedStrategicSectors = center 周围 3×3
  width = 48
  height = 48
```

### 坐标映射

每个战略格子对应小地图中一块 16×16 区域。

```ts
const DETAIL_SCALE = 16;

sectorLocalX = strategicX - minStrategicX;
sectorLocalY = strategicY - minStrategicY;

detailOffsetX = sectorLocalX * DETAIL_SCALE;
detailOffsetZ = sectorLocalY * DETAIL_SCALE;

detailX = detailOffsetX + localX;
detailZ = detailOffsetZ + localZ;
```

必须保证：

```txt
3×3 小地图左上 16×16 对应左上战略格子。
3×3 小地图中央 16×16 对应被点击的战略格子。
3×3 小地图右下 16×16 对应右下战略格子。
```

---

## 六、小地图必须继承大战略图

小地图不能重新随机成无关地图。

每个 `StrategicSector` 要传递：

```txt
sector.baseTerrain
sector.terrain
sector.features
sector.gen.elevation
sector.gen.moisture
sector.gen.slope
sector.gen.cityRank
sector.gen.riverWidth
sector.name
```

### 地形继承规则

| StrategicSector | DetailMapCell |
|---|---|
| plains | plains / field |
| forest | forest 为主，少量 plains |
| mountain | mountain / highland / hill |
| water | water |
| marshland | swamp / plains / river edge |
| desert | desert / plains |
| city feature | city detail block |
| river feature | river / stream |
| main_road feature | main_road |
| secondary_road feature | secondary_road |
| bridge feature | bridge |

---

## 七、城市详细地图生成

如果中心战略格满足任一条件：

```ts
sector.features?.includes('city')
sector.features?.includes('capital')
sector.terrain === 'city'
```

则生成城市详细图。

### 城市等级规则

```txt
capital:
  city core 半径 5
  urban_block 大量
  suburb 外圈
  industrial 少量
  main_road 十字 + 可选环线
  checkpoint 1-2 个

major:
  city core 半径 4
  urban_block 中等
  suburb 外圈
  industrial 少量
  main_road 穿过中心

regional:
  city core 半径 3
  urban_block 少量
  suburb 较多
  secondary_road 连接外部

town:
  city core 半径 2
  suburb / field 为主
  secondary_road 穿过
```

### 注意

不要新增 `TerrainType`。

城市内部仍使用：

```ts
terrain = 'city'
```

差异写入：

```ts
features: ['city_center']
features: ['urban_block']
features: ['suburb']
features: ['industrial']
```

---

## 八、城市绘制函数

在 `detail-map-generator.ts` 中新增：

```ts
function paintCityDetailBlock(params: {
  cells: DetailMapCell[][];
  centerX: number;
  centerZ: number;
  rank: CityRank;
  rng: SeededRNG;
}): void
```

逻辑：

```ts
const coreRadius =
  rank === 'capital' ? 5 :
  rank === 'major' ? 4 :
  rank === 'regional' ? 3 :
  2;

for dz from -coreRadius - 3 to coreRadius + 3:
  for dx from -coreRadius - 3 to coreRadius + 3:
    d = sqrt(dx * dx + dz * dz)
    noise = rng.next() * 0.6

    if d < coreRadius + noise:
      terrain = 'city'
      features.push('urban_block')

    if d < 1.5:
      features.push('city_center')

    if d >= coreRadius && d < coreRadius + 3 + noise:
      terrain = rng.next() < 0.55 ? 'city' : 'plains'
      features.push('suburb')
```

城市不要生成成正方形。

---

## 九、道路生成规则

道路来源两种：

1. `sector.features` 包含 `main_road` 或 `secondary_road`。
2. 城市内部自动生成道路。

### 城市道路

城市小地图必须有道路：

```txt
东西向主路穿过中心
南北向主路穿过中心
capital / major 可以加一条简单环路
```

道路不要覆盖城市 terrain。

正确：

```ts
cell.terrain = 'city';
cell.features.push('main_road');
cell.isRoad = true;
cell.roadType = 'main';
```

错误：

```ts
cell.terrain = 'road';
```

### 普通战略格道路

如果该战略格有：

```ts
features.includes('main_road')
```

则在 16×16 区域中生成一条贯穿道路。

如果有：

```ts
features.includes('secondary_road')
```

则生成一条次级道路。

第一版可以用 seed 决定方向：

```txt
west-east
north-south
northwest-southeast
northeast-southwest
```

---

## 十、河流生成规则

如果该战略格有：

```ts
features.includes('river')
```

则在对应 16×16 区域中生成连续河流。

第一版河流方向用 seed 决定：

```txt
west-east
north-south
northwest-southeast
northeast-southwest
```

河流宽度：

```ts
const riverWidth = sector.gen?.riverWidth ?? 1;
```

写入：

```ts
cell.features.push('river');
```

如果 `riverWidth >= 2`：

```ts
cell.terrain = 'water';
```

如果 `riverWidth < 2`：

```ts
terrain 保持原地形
features 有 river
```

---

## 十一、桥梁生成规则

桥梁只能在 road + river 同格时出现。

```ts
if (hasRoad(cell) && hasRiver(cell)) {
  cell.features.push('bridge');
}
```

如果战略格有：

```ts
features.includes('bridge')
```

则优先在小地图中心附近寻找 road + river 交叉点放桥。

禁止：

```txt
没有道路的桥
没有河流的桥
随机桥
```

---

## 十二、生成周边小地图

在 `detail-map-generator.ts` 中新增：

```ts
export function generateNeighborDetailMaps(params: {
  strategicMap: StrategicMap;
  center: StrategicPosition;
  radius?: number;
  seed?: number;
}): DetailMap[];
```

默认：

```ts
radius = 1
```

逻辑：

```txt
取 center 周围 3×3 strategic sectors
每个 sector 单独生成一张 16×16 DetailMap
返回 9 张 DetailMap
```

用途：

```txt
点击大战略图时，可以预览任意一个 sector 的小地图。
```

---

## 十三、点击查看小地图

新增 UI 状态：

```ts
selectedStrategicSectorForDetail: StrategicPosition | null;
selectedDetailMap: DetailMap | null;
neighborDetailMaps: DetailMap[];
```

点击战略格子时：

```ts
const detailMap = generateDetailMapFromStrategicSector({
  strategicMap,
  center: clickedSector.position,
  radius: 0,
});
```

显示右侧小地图预览。

点击“查看周边 3×3”时：

```ts
const detailMap = generateDetailMapFromStrategicSector({
  strategicMap,
  center: clickedSector.position,
  radius: 1,
});
```

显示 48×48 局部详细地图。

---

## 十四、新增小地图显示组件

新建：

```txt
src/components/game/DetailMapPreview.tsx
```

Props：

```ts
interface DetailMapPreviewProps {
  detailMap: DetailMap;
  cellSize?: number;
  showGrid?: boolean;
}
```

显示要求：

1. 用 `terrain` 决定底色。
2. `features` 包含 `river` 时显示河流覆盖。
3. `features` 包含 `main_road` 时显示主路覆盖。
4. `features` 包含 `secondary_road` 时显示次路覆盖。
5. `features` 包含 `bridge` 时显示桥梁标记。
6. `features` 包含 `city_center` 时显示城市中心标记。
7. 鼠标 hover 显示：
   - detail cell 坐标；
   - source strategic sector；
   - terrain；
   - features。

第一版用 div grid 即可，不需要 Three.js。

---

## 十五、大图和小图对应验收

必须满足：

```txt
1. 战略图上是 city，小地图中心区域必须是 city。
2. 战略图上有 river，小地图必须有 river。
3. 战略图上有 main_road，小地图必须有 main_road。
4. 战略图上有 bridge，小地图必须在 road + river 交叉处有 bridge。
5. 战略图上是 forest，小地图大部分是 forest。
6. 战略图上是 mountain，小地图大部分是 mountain / highland。
7. 战略图上是 water，小地图大部分是 water。
8. 3×3 小地图中，九个战略格位置必须正确。
```

最重要：

```txt
小地图不是重新随机地图，而是战略图对应区域的细化版本。
```

---

## 十六、不要做

```txt
不要接真实地图
不要引入 MapLibre
不要重写整个 UI
不要重写战术战斗 AI
不要改数据库
不要生成和战略图无关的小地图
不要只做截图
不要让小地图随机到和战略图不一致
```

---

## 十七、完成后输出

完成后请输出：

```txt
1. 修改了哪些文件
2. 是否新增 DetailMap 类型
3. 是否新增 generateDetailMapFromStrategicSector
4. 是否新增 generateNeighborDetailMaps
5. 点击战略 sector 是否能看到 16×16 小地图
6. 点击城市 sector 时，城市小地图是否有城区面积
7. 点击“查看周边 3×3”是否能看到 48×48 小地图
8. 小地图中的 river / road / city 是否来自战略 sector
9. npm run build 或 npm run lint 是否通过
```
