// ===== 战略地图生成 - 基于朝鲜半岛/东亚沿海地区 =====

import { StrategicMap, StrategicSector, StrategicTerrainType, StrategicPosition } from './strategic-types';

/** Map dimensions */
const STRATEGIC_MAP_WIDTH = 10;
const STRATEGIC_MAP_HEIGHT = 8;

/**
 * Generate a strategic map based on a fictionalized Korean Peninsula / East Asian coastal region.
 *
 * Layout concept (10x8 grid):
 *   Row 0 (North): Highland/mountains, some forests — represents northern border highlands
 *   Row 1: Central mountains with passes — Taebaek range
 *   Row 2: Mountains continue, rivers begin — central highlands
 *   Row 3: River valley (major east-west river: Han/Imjin) — mixed terrain
 *   Row 4: Transition zone — cities along coasts, forests inland
 *   Row 5: Southern lowlands — plains and cities along west coast
 *   Row 6: Coastal plains and cities — Seoul metro, Incheon area
 *   Row 7 (South): Southern coast, river estuary, islands — Busan, marshland
 *
 * West side (x: 0-2): More cities, plains (West Sea coast, Yellow Sea side)
 * Center (x: 3-6): Mountains, forests, highland (Taebaek Mountains)
 * East side (x: 7-9): Forests, some cities (East Sea coast)
 */

/** Place names for sectors — based on real Korean/Chinese place names */
const PLACE_NAMES: string[][] = [
  // Row 0 — Northern highlands (North Korea border area)
  ['新义州', '朔州', '惠山', '盖马高原', '赴战岭', '长津', '咸兴', '端川', '金策', '罗先'],
  // Row 1 — Northern mountains
  ['宣川', '博川', '熙川', '狼林山', '赴战', '丰山', '北青', '利原', '吉州', '清津'],
  // Row 2 — Central mountains & passes
  ['定州', '安州', '球场', '铁原', '平康', '洗浦', '淮阳', '通川', '明川', '镜城'],
  // Row 3 — River zone (Imjin / Han river area)
  ['盐州', '肃川', '顺安', '平壤', '谷山', '伊川', '金化', '高城', '安边', '元山'],
  // Row 4 — Transition zone
  ['延安', '海州', '沙里院', '开城', '涟川', '加平', '春川', '洪川', '横城', '江陵'],
  // Row 5 — Southern lowlands
  ['仁川', '金浦', '坡州', '首尔', '河南', '骊州', '原州', '堤川', '宁越', '三陟'],
  // Row 6 — Central-south plains & cities
  ['华城', '安养', '果川', '城南', '龙仁', '阴城', '忠州', '丹阳', '蔚珍', '浦项'],
  // Row 7 — Southern coast
  ['牙山', '天安', '世宗', '大田', '公州', '报恩', '尚州', '义城', '盈德', '釜山'],
];

/** Terrain layout — manually designed to represent Korean Peninsula geography */
const TERRAIN_LAYOUT: StrategicTerrainType[][] = [
  // Row 0 — Northern highlands
  ['plains', 'forest', 'highland', 'highland', 'mountain', 'highland', 'mountain', 'highland', 'forest', 'forest'],
  // Row 1 — Mountain range
  ['plains', 'plains', 'forest', 'mountain', 'mountain', 'mountain', 'mountain', 'forest', 'highland', 'forest'],
  // Row 2 — Central mountains with passes
  ['plains', 'plains', 'forest', 'mountain', 'forest', 'mountain', 'mountain', 'forest', 'forest', 'forest'],
  // Row 3 — River zone (major river at y=3, roughly x:3-6)
  ['plains', 'plains', 'plains', 'city', 'water', 'water', 'forest', 'plains', 'plains', 'city'],
  // Row 4 — Transition zone with cities
  ['plains', 'city', 'plains', 'city', 'plains', 'forest', 'city', 'forest', 'forest', 'city'],
  // Row 5 — Southern lowlands with key cities
  ['city', 'plains', 'plains', 'city', 'plains', 'plains', 'city', 'forest', 'mountain', 'forest'],
  // Row 6 — Central-south plains
  ['plains', 'city', 'plains', 'city', 'plains', 'forest', 'plains', 'mountain', 'forest', 'plains'],
  // Row 7 — Southern coast with marshland estuary
  ['marshland', 'plains', 'city', 'city', 'plains', 'plains', 'plains', 'forest', 'plains', 'city'],
];

/** Generate a deterministic seed for a sector based on its position */
function generateSectorSeed(x: number, y: number): number {
  // Use a simple hash function based on coordinates
  return ((x * 7919 + y * 104729 + 31337) & 0x7FFFFFFF);
}

/** Generate the strategic map */
export function generateStrategicMap(): StrategicMap {
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

  return {
    width: STRATEGIC_MAP_WIDTH,
    height: STRATEGIC_MAP_HEIGHT,
    sectors,
  };
}

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
  return { width: STRATEGIC_MAP_WIDTH, height: STRATEGIC_MAP_HEIGHT };
}

/** Get all city sector positions */
export function getCitySectors(map: StrategicMap): StrategicPosition[] {
  const cities: StrategicPosition[] = [];
  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      if (map.sectors[y][x].terrain === 'city') {
        cities.push({ x, y });
      }
    }
  }
  return cities;
}
