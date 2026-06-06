# 战略地图生成修复 README

## 目标

修复当前战略地图生成效果：

1. 沙漠太多。
2. 城市太小，只是一个格子。
3. 道路、河流、城市互相覆盖。
4. 地形分布不够像虚构战区。
5. 保持现有项目可运行，不接入真实地图。

本次只改战略地图 / 程序化地图生成逻辑，不改 AI 战斗系统。

---

## 需要优先修改的文件

优先检查并修改：

```txt
src/game/procedural-map.ts
src/game/strategic-map.ts
src/game/strategic-types.ts
src/game/types.ts
```

如果 UI 需要显示新 feature，再少量修改渲染相关组件。

不要重写整个项目。

---

## 一、减少沙漠

### 当前问题

沙漠生成太多，默认地图看起来像荒漠战区。

### 修改要求

默认地图应该是温带战区：

```txt
平原 + 森林 + 山地 + 河流 + 城市 + 道路
```

不要默认生成大量沙漠。

### 推荐默认参数

```ts
terrainPreset: 'temperate'

desertControl: {
  enabled: false,
  maxRatio: 0.04,
  moistureThreshold: 0.12,
  requireHighTemperature: true,
}
```

如果当前没有这些字段，请加到生成配置里。

### 沙漠判定规则

不要继续使用简单规则：

```ts
if (moisture < 0.22) terrain = 'desert'
```

改成：

```ts
function shouldBeDesert(x, z, ctx): boolean {
  if (!ctx.config.desertControl.enabled) return false;

  const veryDry = ctx.moisture[z][x] < ctx.config.desertControl.moistureThreshold;
  const hotEnough = !ctx.config.desertControl.requireHighTemperature
    || ctx.temperature[z][x] > 0.45;
  const farFromWater = ctx.distToWater[z][x] >= 8;
  const notWater = ctx.cells[z][x].terrain !== 'water';

  return veryDry && hotEnough && farFromWater && notWater;
}
```

### 沙漠比例限制

生成完成后统计沙漠比例。

```ts
if (desertRatio > config.desertControl.maxRatio) {
  // 把多余 desert 转成 plains 或 forest
}
```

默认温带地图：

```txt
desertRatio <= 4%
```

允许为 0。

---

## 二、城市必须有面积

### 当前问题

城市只是单个格子，看起来太小。

### 修改要求

城市要按等级扩张成城区块。

新增城市等级：

```ts
type CityRank = 'capital' | 'major' | 'regional' | 'town';
```

新增城市结构：

```ts
interface GeneratedCity {
  id: string;
  name: string;
  center: { x: number; z: number };
  rank: CityRank;
  radius: number;
}
```

### 城市半径

```txt
capital: 3 或 4
major: 2 或 3
regional: 1 或 2
town: 1
```

### 城市数量建议

64×48 地图默认：

```txt
capital: 1
major: 4
regional: 8
town: 16
```

### 城市绘制函数

新增：

```ts
function paintCityArea(city, ctx) {
  const radius = city.radius;

  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = city.center.x + dx;
      const z = city.center.z + dz;

      if (!inBounds(x, z, ctx)) continue;

      const cell = ctx.cells[z][x];
      if (cell.terrain === 'water') continue;
      if (cell.terrain === 'mountain' && city.rank !== 'capital') continue;

      const d = Math.sqrt(dx * dx + dz * dz);
      const noise = ctx.rng.next() * 0.45;

      const threshold =
        city.rank === 'capital' ? radius + 0.25 :
        city.rank === 'major' ? radius :
        city.rank === 'regional' ? radius - 0.15 :
        radius - 0.35;

      if (d <= threshold + noise) {
        cell.terrain = 'city';
        cell.features = cell.features || [];
        if (dx === 0 && dz === 0) {
          cell.features.push('city_center');
        }
      }
    }
  }
}
```

### 城市外围处理

城市周围 1 到 2 格：

```txt
desert → plains
部分 swamp → plains
部分 forest 保留
不要让城市完全被森林、沼泽、沙漠包住
```

---

## 三、城市选址规则

城市不要随机放。

城市候选评分：

```txt
平坦 + 靠近河流 + 靠近海岸 + 平原 + 中心性
- 水域 - 山地 - 沼泽 - 沙漠 - 陡坡
```

必须满足：

```txt
城市中心不能在 water
城市中心不能在 mountain
城市中心 slope 不能太高
```

城市放置顺序：

```txt
capital
major
regional
town
```

每放一个城市后，要降低附近候选分，避免城市挤在一起。

最小距离：

```txt
capital 与其他城市 >= 10
major 与 major >= 8
regional >= 5
town >= 3
```

---

## 四、道路不要覆盖城市

### 当前问题

道路可能把城市格子覆盖成 road。

### 修改要求

如果道路经过城市：

```txt
terrain 保持 city
features 添加 main_road 或 secondary_road
```

不要这样：

```ts
cell.terrain = 'road'
```

应该这样：

```ts
cell.features = cell.features || [];
cell.features.push('main_road');
```

如果当前没有 features 字段，请给 MapCell 增加：

```ts
features?: Array<
  | 'river'
  | 'main_road'
  | 'secondary_road'
  | 'bridge'
  | 'city_center'
>;
```

---

## 五、道路生成规则

道路必须连接城市。

推荐连接关系：

```txt
capital 连接所有 major
major 之间保持连通
regional 连接最近 major
town 连接最近 regional 或 major
```

道路使用 A* 寻路，不要随机画线。

道路代价建议：

```txt
city: 0.5
plains: 1
forest: 3
desert: 5
swamp: 8
mountain: 12
water: 999
已有 road: 0.5
```

道路跨河时添加 bridge feature。

---

## 六、河流不要覆盖地形

河流不要直接把 terrain 改成 water。

小河应该是：

```ts
cell.features.push('river')
```

大水体才是：

```ts
cell.terrain = 'water'
```

道路跨河时：

```ts
if (hasRoad(cell) && hasRiver(cell)) {
  cell.features.push('bridge');
}
```

桥梁必须同时满足：

```txt
有 road feature
有 river feature
```

---

## 七、生成统计输出

生成完成后必须输出：

```txt
plains 数量和比例
forest 数量和比例
mountain 数量和比例
water 数量和比例
swamp 数量和比例
desert 数量和比例
city 数量和比例
road 数量
bridge 数量
capital 面积
major 平均面积
```

如果：

```txt
desertRatio > 0.06
```

输出警告。

---

## 八、验收标准

使用默认配置：

```txt
seed = 20260606
width = 64
height = 48
terrainPreset = temperate
```

必须满足：

```txt
desertRatio <= 0.04
cityTileCount >= 60
capitalTileCount >= 25
majorAverageTileCount >= 9
所有城市中心不在 water
所有城市中心不在 mountain
capital 和 major 至少有道路连接
桥梁只出现在 road + river 同格
道路不要大面积穿 water
```

---

## 九、不要做

不要做以下事情：

```txt
不要接真实地图
不要重写整个游戏
不要改 AI 战斗逻辑
不要改数据库
不要引入大型依赖
不要只改颜色
不要写长 README
不要让 city / road / river 继续互相覆盖 terrain
```

---

## 十、完成后输出

修改完成后，请输出：

```txt
1. 改了哪些文件
2. desertRatio
3. cityTileCount
4. capitalTileCount
5. majorAverageTileCount
6. road 是否连接 capital 和 major
7. bridge 是否都合法
8. npm run build 或 npm run lint 是否通过
```
