// ===== 战略地图生成 - 入口适配器 =====

import { StrategicMap, StrategicSector, StrategicTerrainType, StrategicPosition } from './strategic-types';
import { DEFAULT_STRATEGIC_GEN_CONFIG, StrategicGenConfig } from './strategic-gen/strategic-gen-config';
import { generateStrategicWorld } from './strategic-gen/generate-strategic-world';

// ===== Legacy 固定地图 (保留为 fallback) =====

const STRATEGIC_MAP_WIDTH = 10;
const STRATEGIC_MAP_HEIGHT = 8;

const PLACE_NAMES: string[][] = [
  ['新义州', '朔州', '惠山', '盖马高原', '赴战岭', '长津', '咸兴', '端川', '金策', '罗先'],
  ['宣川', '博川', '熙川', '狼林山', '赴战', '丰山', '北青', '利原', '吉州', '清津'],
  ['定州', '安州', '球场', '铁原', '平康', '洗浦', '淮阳', '通川', '明川', '镜城'],
  ['盐州', '肃川', '顺安', '平壤', '谷山', '伊川', '金化', '高城', '安边', '元山'],
  ['延安', '海州', '沙里院', '开城', '涟川', '加平', '春川', '洪川', '横城', '江陵'],
  ['仁川', '金浦', '坡州', '首尔', '河南', '骊州', '原州', '堤川', '宁越', '三陟'],
  ['华城', '安养', '果川', '城南', '龙仁', '阴城', '忠州', '丹阳', '蔚珍', '浦项'],
  ['牙山', '天安', '世宗', '大田', '公州', '报恩', '尚州', '义城', '盈德', '釜山'],
];

const TERRAIN_LAYOUT: StrategicTerrainType[][] = [
  ['plains', 'forest', 'highland', 'highland', 'mountain', 'highland', 'mountain', 'highland', 'forest', 'forest'],
  ['plains', 'plains', 'forest', 'mountain', 'mountain', 'mountain', 'mountain', 'forest', 'highland', 'forest'],
  ['plains', 'plains', 'forest', 'mountain', 'forest', 'mountain', 'mountain', 'forest', 'forest', 'forest'],
  ['plains', 'plains', 'plains', 'city', 'water', 'water', 'forest', 'plains', 'plains', 'city'],
  ['plains', 'city', 'plains', 'city', 'plains', 'forest', 'city', 'forest', 'forest', 'city'],
  ['city', 'plains', 'plains', 'city', 'plains', 'plains', 'city', 'forest', 'mountain', 'forest'],
  ['plains', 'city', 'plains', 'city', 'plains', 'forest', 'plains', 'mountain', 'forest', 'plains'],
  ['marshland', 'plains', 'city', 'city', 'plains', 'plains', 'plains', 'forest', 'plains', 'city'],
];

function generateSectorSeed(x: number, y: number): number {
  return ((x * 7919 + y * 104729 + 31337) & 0x7FFFFFFF);
}

/** Generate the legacy fixed strategic map (10x8) */
export function generateLegacyStrategicMap(): StrategicMap {
  const sectors: StrategicSector[][] = [];
  for (let y = 0; y < STRATEGIC_MAP_HEIGHT; y++) {
    sectors[y] = [];
    for (let x = 0; x < STRATEGIC_MAP_WIDTH; x++) {
      sectors[y][x] = {
        position: { x, y },
        terrain: TERRAIN_LAYOUT[y][x],
        force: null,
        tacticalMapSeed: generateSectorSeed(x, y),
        name: PLACE_NAMES[y][x],
      };
    }
  }
  return { width: STRATEGIC_MAP_WIDTH, height: STRATEGIC_MAP_HEIGHT, sectors };
}

// ===== 新版程序化生成入口 =====

/**
 * 生成程序化战略地图。
 * 默认使用 64×48 半岛配置，可通过 config 参数覆盖。
 */
export function generateStrategicMap(config: Partial<StrategicGenConfig> = {}): StrategicMap {
  return generateStrategicWorld({
    ...DEFAULT_STRATEGIC_GEN_CONFIG,
    ...config,
  });
}

// ===== 通用工具函数 =====

/** Get a sector at a given position */
export function getSector(map: StrategicMap, pos: StrategicPosition): StrategicSector | null {
  if (pos.x < 0 || pos.x >= map.width || pos.y < 0 || pos.y >= map.height) return null;
  return map.sectors[pos.y][pos.x];
}

/** Get adjacent sectors (4-directional for strategic movement) */
export function getStrategicNeighbors(map: StrategicMap, pos: StrategicPosition): StrategicPosition[] {
  const dirs = [
    { x: 0, y: -1 }, { x: 0, y: 1 },
    { x: -1, y: 0 }, { x: 1, y: 0 },
  ];
  return dirs
    .map(d => ({ x: pos.x + d.x, y: pos.y + d.y }))
    .filter(p => p.x >= 0 && p.x < map.width && p.y >= 0 && p.y < map.height);
}

/** Get the map dimensions */
export function getStrategicMapDimensions(): { width: number; height: number } {
  return { width: DEFAULT_STRATEGIC_GEN_CONFIG.width, height: DEFAULT_STRATEGIC_GEN_CONFIG.height };
}

/** Get all city sector positions */
export function getCitySectors(map: StrategicMap): StrategicPosition[] {
  const cities: StrategicPosition[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const sector = map.sectors[y][x];
      if (sector.features?.includes('city') || sector.features?.includes('capital') || sector.terrain === 'city') {
        cities.push({ x, y });
      }
    }
  }
  return cities;
}
