// ===== 战棋地图生成 =====

import { GameMap, MapCell, TerrainType, Position, MapType } from './types';
import { MAP_WIDTH, MAP_HEIGHT, TERRAIN_WEIGHTS, TERRAIN_CONFIGS } from './config';
import { generateProceduralMap } from './procedural-map';

/** 创建空白地图（全部平原） */
function createEmptyMap(): MapCell[][] {
  const cells: MapCell[][] = [];
  for (let z = 0; z < MAP_HEIGHT; z++) {
    cells[z] = [];
    for (let x = 0; x < MAP_WIDTH; x++) {
      cells[z][x] = {
        position: { x, z },
        terrain: 'plains',
        unit: null,
        fortified: false,
        capturePointId: null,
      };
    }
  }
  return cells;
}

/** 根据权重随机选择地形 */
function weightedRandomTerrain(): TerrainType {
  const entries = Object.entries(TERRAIN_WEIGHTS).filter(([_, w]) => w > 0);
  const totalWeight = entries.reduce((sum, [_, w]) => sum + w, 0);
  let random = Math.random() * totalWeight;

  for (const [terrain, weight] of entries) {
    random -= weight;
    if (random <= 0) return terrain as TerrainType;
  }
  return 'plains';
}

/** 确保地图边缘有通路 */
function ensurePassability(cells: MapCell[][]): void {
  // 确保第一列和最后一列可通行（部署区域）
  for (let z = 0; z < MAP_HEIGHT; z++) {
    if (!TERRAIN_CONFIGS[cells[z][0].terrain].stats.isPassable) {
      cells[z][0].terrain = 'plains';
    }
    if (!TERRAIN_CONFIGS[cells[z][1].terrain].stats.isPassable) {
      cells[z][1].terrain = 'plains';
    }
    if (!TERRAIN_CONFIGS[cells[z][MAP_WIDTH - 1].terrain].stats.isPassable) {
      cells[z][MAP_WIDTH - 1].terrain = 'plains';
    }
    if (!TERRAIN_CONFIGS[cells[z][MAP_WIDTH - 2].terrain].stats.isPassable) {
      cells[z][MAP_WIDTH - 2].terrain = 'plains';
    }
  }
}

/** 添加道路网络 - 贯通地图 */
function addRoads(cells: MapCell[][]): void {
  // 水平主干道
  const midZ = Math.floor(MAP_HEIGHT / 2);
  for (let x = 0; x < MAP_WIDTH; x++) {
    if (cells[midZ][x].terrain === 'plains') {
      cells[midZ][x].terrain = 'road';
    }
  }

  // 垂直主干道
  const midX = Math.floor(MAP_WIDTH / 2);
  for (let z = 0; z < MAP_HEIGHT; z++) {
    if (cells[z][midX].terrain === 'plains') {
      cells[z][midX].terrain = 'road';
    }
  }

  // 额外随机道路
  for (let i = 0; i < 2; i++) {
    const startZ = Math.floor(Math.random() * MAP_HEIGHT);
    const startX = Math.floor(Math.random() * Math.floor(MAP_WIDTH / 3));
    const endX = MAP_WIDTH - 1 - Math.floor(Math.random() * Math.floor(MAP_WIDTH / 3));

    let cx = startX;
    let cz = startZ;
    while (cx !== endX) {
      if (cz >= 0 && cz < MAP_HEIGHT && cx >= 0 && cx < MAP_WIDTH) {
        if (cells[cz][cx].terrain === 'plains') {
          cells[cz][cx].terrain = 'road';
        }
      }
      if (Math.random() < 0.7) {
        cx += cx < endX ? 1 : -1;
      } else {
        cz += Math.random() < 0.5 ? 1 : -1;
        cz = Math.max(0, Math.min(MAP_HEIGHT - 1, cz));
      }
    }
  }
}

/** 在水域上放置桥梁 */
function addBridges(cells: MapCell[][]): void {
  for (let z = 0; z < MAP_HEIGHT; z++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      if (cells[z][x].terrain === 'water') {
        // 如果左右有非水域格子，放桥
        const leftPassable = x > 0 && TERRAIN_CONFIGS[cells[z][x - 1].terrain].stats.isPassable;
        const rightPassable = x < MAP_WIDTH - 1 && TERRAIN_CONFIGS[cells[z][x + 1].terrain].stats.isPassable;
        if (leftPassable && rightPassable) {
          cells[z][x].terrain = 'bridge';
        }
      }
    }
  }
}

/** 添加城市和要塞 */
function addCitiesAndFortresses(cells: MapCell[][]): void {
  // 在道路交汇处放城市
  for (let z = 1; z < MAP_HEIGHT - 1; z++) {
    for (let x = 1; x < MAP_WIDTH - 1; x++) {
      if (cells[z][x].terrain === 'road') {
        const adjacentRoads = [
          cells[z - 1]?.[x]?.terrain === 'road' ? 1 : 0,
          cells[z + 1]?.[x]?.terrain === 'road' ? 1 : 0,
          cells[z]?.[x - 1]?.terrain === 'road' ? 1 : 0,
          cells[z]?.[x + 1]?.terrain === 'road' ? 1 : 0,
        ].reduce((a, b) => a + b, 0);

        if (adjacentRoads >= 3 && Math.random() < 0.4) {
          cells[z][x].terrain = 'city';
        }
      }
    }
  }

  // 在中部随机放要塞
  const midX = Math.floor(MAP_WIDTH / 2);
  const midZ = Math.floor(MAP_HEIGHT / 2);
  for (let dz = -2; dz <= 2; dz++) {
    for (let dx = -2; dx <= 2; dx++) {
      const z = midZ + dz;
      const x = midX + dx;
      if (z >= 0 && z < MAP_HEIGHT && x >= 0 && x < MAP_WIDTH) {
        if (cells[z][x].terrain === 'plains' && Math.random() < 0.1) {
          cells[z][x].terrain = 'fortress';
        }
      }
    }
  }
}

// ===== 预设地图生成函数 =====

/** 山地隘口 - 中央山脊，仅2个隘口可通过 */
function generateMountainPass(): MapCell[][] {
  const cells = createEmptyMap();

  // 中间4行为山地山脊（z: 4-7）
  for (let z = 4; z <= 7; z++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      cells[z][x].terrain = 'mountain';
    }
  }

  // 隘口1：在偏上方（z=4, x=3-4），打开通路
  cells[4][3].terrain = 'road';
  cells[4][4].terrain = 'road';
  cells[5][3].terrain = 'road';
  cells[5][4].terrain = 'road';

  // 隘口2：在偏下方（z=7, x=11-12），打开通路
  cells[7][11].terrain = 'road';
  cells[7][12].terrain = 'road';
  cells[6][11].terrain = 'road';
  cells[6][12].terrain = 'road';

  // 两侧添加一些森林
  for (let z = 0; z < 4; z++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      if (Math.random() < 0.25) {
        cells[z][x].terrain = 'forest';
      }
    }
  }
  for (let z = 8; z < MAP_HEIGHT; z++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      if (Math.random() < 0.25) {
        cells[z][x].terrain = 'forest';
      }
    }
  }

  // 山脊附近零星森林
  for (let x = 0; x < MAP_WIDTH; x++) {
    if (Math.random() < 0.15) {
      if (cells[3][x].terrain === 'plains') cells[3][x].terrain = 'forest';
    }
    if (Math.random() < 0.15) {
      if (cells[8][x].terrain === 'plains') cells[8][x].terrain = 'forest';
    }
  }

  // 在北侧添加一条通往隘口1的道路
  for (let x = 0; x <= 4; x++) {
    if (cells[2][x].terrain === 'plains' || cells[2][x].terrain === 'forest') cells[2][x].terrain = 'road';
    if (cells[3][x].terrain === 'plains' || cells[3][x].terrain === 'forest') cells[3][x].terrain = 'road';
  }

  // 在南侧添加一条通往隘口2的道路
  for (let x = 10; x < MAP_WIDTH; x++) {
    if (cells[9][x].terrain === 'plains' || cells[9][x].terrain === 'forest') cells[9][x].terrain = 'road';
    if (cells[10][x].terrain === 'plains' || cells[10][x].terrain === 'forest') cells[10][x].terrain = 'road';
  }

  // 确保部署区域可通行
  ensurePassability(cells);
  return cells;
}

/** 河谷突破 - 横贯河流，几座桥梁 */
function generateRiverValley(): MapCell[][] {
  const cells = createEmptyMap();

  // 中间行（z=5, z=6）为河流
  for (let x = 0; x < MAP_WIDTH; x++) {
    cells[5][x].terrain = 'water';
    cells[6][x].terrain = 'water';
  }

  // 三座桥梁
  // 桥1：左侧 x=2
  cells[5][2].terrain = 'bridge';
  cells[6][2].terrain = 'bridge';

  // 桥2：中间 x=7
  cells[5][7].terrain = 'bridge';
  cells[6][7].terrain = 'bridge';

  // 桥3：右侧 x=12
  cells[5][12].terrain = 'bridge';
  cells[6][12].terrain = 'bridge';

  // 北岸森林（z: 0-4）
  for (let z = 0; z <= 4; z++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      if (Math.random() < 0.2) {
        cells[z][x].terrain = 'forest';
      }
    }
  }

  // 南岸森林（z: 7-11）
  for (let z = 7; z < MAP_HEIGHT; z++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      if (Math.random() < 0.2) {
        cells[z][x].terrain = 'forest';
      }
    }
  }

  // 河岸附近密集森林
  for (let x = 0; x < MAP_WIDTH; x++) {
    if (cells[4][x].terrain === 'plains' && Math.random() < 0.4) cells[4][x].terrain = 'forest';
    if (cells[7][x].terrain === 'plains' && Math.random() < 0.4) cells[7][x].terrain = 'forest';
  }

  // 通往桥梁的道路
  for (let z = 0; z < 5; z++) {
    if (cells[z][2].terrain === 'plains' || cells[z][2].terrain === 'forest') cells[z][2].terrain = 'road';
    if (cells[z][7].terrain === 'plains' || cells[z][7].terrain === 'forest') cells[z][7].terrain = 'road';
    if (cells[z][12].terrain === 'plains' || cells[z][12].terrain === 'forest') cells[z][12].terrain = 'road';
  }
  for (let z = 7; z < MAP_HEIGHT; z++) {
    if (cells[z][2].terrain === 'plains' || cells[z][2].terrain === 'forest') cells[z][2].terrain = 'road';
    if (cells[z][7].terrain === 'plains' || cells[z][7].terrain === 'forest') cells[z][7].terrain = 'road';
    if (cells[z][12].terrain === 'plains' || cells[z][12].terrain === 'forest') cells[z][12].terrain = 'road';
  }

  // 桥头小城市
  cells[4][2].terrain = 'city';
  cells[7][7].terrain = 'city';
  cells[4][12].terrain = 'city';

  ensurePassability(cells);
  return cells;
}

/** 城市攻防 - 中央密集城市群，放射状道路 */
function generateUrbanWarfare(): MapCell[][] {
  const cells = createEmptyMap();

  // 中央城市集群（x: 5-10, z: 3-8）
  for (let z = 3; z <= 8; z++) {
    for (let x = 5; x <= 10; x++) {
      const r = Math.random();
      if (r < 0.55) {
        cells[z][x].terrain = 'city';
      } else if (r < 0.7) {
        cells[z][x].terrain = 'road';
      }
    }
  }

  // 核心要塞
  cells[5][7].terrain = 'fortress';
  cells[6][8].terrain = 'fortress';

  // 十字主干道
  const midX = Math.floor(MAP_WIDTH / 2);
  const midZ = Math.floor(MAP_HEIGHT / 2);
  for (let x = 0; x < MAP_WIDTH; x++) {
    if (cells[midZ][x].terrain === 'plains') cells[midZ][x].terrain = 'road';
  }
  for (let z = 0; z < MAP_HEIGHT; z++) {
    if (cells[z][midX].terrain === 'plains') cells[z][midX].terrain = 'road';
  }

  // 放射状道路 - 从中心向外
  // 对角线道路
  for (let i = 0; i < 6; i++) {
    const x = midX + i;
    const z = midZ + i;
    if (x < MAP_WIDTH && z < MAP_HEIGHT && cells[z][x].terrain === 'plains') cells[z][x].terrain = 'road';
  }
  for (let i = 0; i < 6; i++) {
    const x = midX - i;
    const z = midZ + i;
    if (x >= 0 && z < MAP_HEIGHT && cells[z][x].terrain === 'plains') cells[z][x].terrain = 'road';
  }
  for (let i = 0; i < 6; i++) {
    const x = midX + i;
    const z = midZ - i;
    if (x < MAP_WIDTH && z >= 0 && cells[z][x].terrain === 'plains') cells[z][x].terrain = 'road';
  }
  for (let i = 0; i < 6; i++) {
    const x = midX - i;
    const z = midZ - i;
    if (x >= 0 && z >= 0 && cells[z][x].terrain === 'plains') cells[z][x].terrain = 'road';
  }

  // 外围开阔地，少量森林
  for (let z = 0; z < MAP_HEIGHT; z++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      if (cells[z][x].terrain === 'plains' && Math.random() < 0.08) {
        cells[z][x].terrain = 'forest';
      }
    }
  }

  // 外围少量山地
  for (let z = 0; z < MAP_HEIGHT; z++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      if (cells[z][x].terrain === 'plains' && Math.random() < 0.04) {
        cells[z][x].terrain = 'mountain';
      }
    }
  }

  ensurePassability(cells);
  return cells;
}

/** 沙漠风暴 - 大片沙漠，零星绿洲和中央要塞 */
function generateDesertStorm(): MapCell[][] {
  const cells = createEmptyMap();

  // 大部分为沙漠
  for (let z = 0; z < MAP_HEIGHT; z++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      cells[z][x].terrain = 'desert';
    }
  }

  // 中央要塞
  const midX = Math.floor(MAP_WIDTH / 2);
  const midZ = Math.floor(MAP_HEIGHT / 2);
  cells[midZ][midX].terrain = 'fortress';
  cells[midZ - 1][midX].terrain = 'fortress';
  cells[midZ][midX - 1].terrain = 'fortress';
  cells[midZ - 1][midX - 1].terrain = 'fortress';

  // 要塞周围的城墙（城市代替）
  cells[midZ - 2][midX - 2].terrain = 'city';
  cells[midZ - 2][midX - 1].terrain = 'city';
  cells[midZ - 2][midX].terrain = 'city';
  cells[midZ - 2][midX + 1].terrain = 'city';
  cells[midZ + 1][midX - 2].terrain = 'city';
  cells[midZ + 1][midX - 1].terrain = 'city';
  cells[midZ + 1][midX].terrain = 'city';
  cells[midZ + 1][midX + 1].terrain = 'city';
  cells[midZ - 1][midX - 2].terrain = 'city';
  cells[midZ][midX - 2].terrain = 'city';
  cells[midZ - 1][midX + 1].terrain = 'city';
  cells[midZ][midX + 1].terrain = 'city';

  // 零星绿洲（森林）
  const oasisPositions = [
    { x: 2, z: 2 }, { x: 13, z: 2 }, { x: 2, z: 9 }, { x: 13, z: 9 },
    { x: 7, z: 1 }, { x: 8, z: 10 }, { x: 1, z: 5 }, { x: 14, z: 6 },
  ];
  for (const pos of oasisPositions) {
    if (pos.z < MAP_HEIGHT && pos.x < MAP_WIDTH) {
      cells[pos.z][pos.x].terrain = 'forest';
      // 绿洲周围少量平原
      const neighbors = [
        { x: pos.x - 1, z: pos.z }, { x: pos.x + 1, z: pos.z },
        { x: pos.x, z: pos.z - 1 }, { x: pos.x, z: pos.z + 1 },
      ];
      for (const n of neighbors) {
        if (n.x >= 0 && n.x < MAP_WIDTH && n.z >= 0 && n.z < MAP_HEIGHT) {
          if (cells[n.z][n.x].terrain === 'desert' && Math.random() < 0.6) {
            cells[n.z][n.x].terrain = 'plains';
          }
        }
      }
    }
  }

  // 从要塞通往两方的道路
  for (let x = 0; x < midX - 2; x++) {
    cells[midZ][x].terrain = 'road';
    cells[midZ - 1][x].terrain = 'road';
  }
  for (let x = midX + 2; x < MAP_WIDTH; x++) {
    cells[midZ][x].terrain = 'road';
    cells[midZ - 1][x].terrain = 'road';
  }

  // 少量沙丘（山地表示）
  for (let z = 0; z < MAP_HEIGHT; z++) {
    for (let x = 0; x < MAP_WIDTH; x++) {
      if (cells[z][x].terrain === 'desert' && Math.random() < 0.05) {
        cells[z][x].terrain = 'mountain';
      }
    }
  }

  ensurePassability(cells);
  return cells;
}

/** 生成随机地图 */
export function generateMap(mapType: MapType = 'random'): GameMap {
  let cells: MapCell[][];

  switch (mapType) {
    case 'mountain-pass':
      cells = generateMountainPass();
      break;
    case 'river-valley':
      cells = generateRiverValley();
      break;
    case 'urban-warfare':
      cells = generateUrbanWarfare();
      break;
    case 'desert-storm':
      cells = generateDesertStorm();
      break;
    case 'procedural':
      const procResult = generateProceduralMap({
        width: MAP_WIDTH,
        height: MAP_HEIGHT,
        seed: Math.floor(Math.random() * 1000000),
        windDirection: Math.random() * Math.PI * 2,
        windStrength: 0.6 + Math.random() * 0.3,
        numRivers: 1 + Math.floor(Math.random() * 2),
        numCities: 2 + Math.floor(Math.random() * 3),
        latitudeRange: { min: -40, max: 50 },
      });
      cells = procResult.cells;
      ensurePassability(cells);
      break;
    case 'random':
    default:
      cells = [];
      for (let z = 0; z < MAP_HEIGHT; z++) {
        cells[z] = [];
        for (let x = 0; x < MAP_WIDTH; x++) {
          cells[z][x] = {
            position: { x, z },
            terrain: weightedRandomTerrain(),
            unit: null,
            fortified: false,
            capturePointId: null,
          };
        }
      }
      addRoads(cells);
      addCitiesAndFortresses(cells);
      addBridges(cells);
      ensurePassability(cells);
      break;
  }

  return {
    width: MAP_WIDTH,
    height: MAP_HEIGHT,
    cells,
  };
}

/** 获取格子 */
export function getCell(map: GameMap, pos: Position): MapCell | null {
  if (pos.x < 0 || pos.x >= map.width || pos.z < 0 || pos.z >= map.height) return null;
  return map.cells[pos.z][pos.x];
}

/** 获取相邻格子 */
export function getNeighbors(map: GameMap, pos: Position): Position[] {
  const dirs = [
    { x: 0, z: -1 }, { x: 0, z: 1 },
    { x: -1, z: 0 }, { x: 1, z: 0 },
    { x: -1, z: -1 }, { x: 1, z: -1 },
    { x: -1, z: 1 }, { x: 1, z: 1 },
  ];
  return dirs
    .map(d => ({ x: pos.x + d.x, z: pos.z + d.z }))
    .filter(p => p.x >= 0 && p.x < map.width && p.z >= 0 && p.z < map.height);
}
