import { StrategicBaseTerrainType, StrategicFeatureType, CityRank } from '../strategic-types';
export type { StrategicBaseTerrainType, StrategicFeatureType, CityRank } from '../strategic-types';

export interface GenPosition {
  x: number;
  y: number;
}

export interface RiverCell {
  isRiver: boolean;
  riverId?: string;
  flowAmount: number;
  width: number;
  isMainRiver: boolean;
}

export interface CityNode {
  id: string;
  name: string;
  position: GenPosition;
  rank: CityRank;
  populationScore: number;
  supplyValue: number;
  victoryPointValue: number;
}

export interface RoadEdge {
  id: string;
  fromCityId: string;
  toCityId: string;
  path: GenPosition[];
  roadType: 'main' | 'secondary' | 'military';
}

export interface SeededRNG {
  next(): number;
  nextInt(min: number, max: number): number;
}

export function createSeededRNG(seed: number): SeededRNG {
  let s = seed | 0;
  return {
    next(): number {
      s = (s * 1664525 + 1013904223) | 0;
      return (s >>> 0) / 4294967296;
    },
    nextInt(min: number, max: number): number {
      return min + Math.floor(this.next() * (max - min + 1));
    },
  };
}

export function create2DArray<T>(width: number, height: number, init: () => T): T[][] {
  const arr: T[][] = [];
  for (let y = 0; y < height; y++) {
    arr[y] = [];
    for (let x = 0; x < width; x++) {
      arr[y][x] = init();
    }
  }
  return arr;
}

export function clone2D<T>(arr: T[][]): T[][] {
  return arr.map(row => [...row]);
}

export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function forEachCell(width: number, height: number, fn: (x: number, y: number) => void): void {
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      fn(x, y);
    }
  }
}

export function getNeighbors8(pos: GenPosition, width: number, height: number): GenPosition[] {
  const result: GenPosition[] = [];
  for (let dy = -1; dy <= 1; dy++) {
    for (let dx = -1; dx <= 1; dx++) {
      if (dx === 0 && dy === 0) continue;
      const nx = pos.x + dx;
      const ny = pos.y + dy;
      if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
        result.push({ x: nx, y: ny });
      }
    }
  }
  return result;
}

export function distance(a: GenPosition, b: GenPosition): number {
  return Math.sqrt((a.x - b.x) ** 2 + (a.y - b.y) ** 2);
}

export function diagonalDistance(a: GenPosition, b: GenPosition): number {
  return Math.max(Math.abs(a.x - b.x), Math.abs(a.y - b.y));
}

export interface StrategicGenContext {
  seed: number;
  rng: SeededRNG;
  width: number;
  height: number;
  elevation: number[][];
  slope: number[][];
  moisture: number[][];
  temperature: number[][];
  waterMask: boolean[][];
  oceanMask: boolean[][];
  lakeMask: boolean[][];
  riverLayer: RiverCell[][];
  baseTerrain: StrategicBaseTerrainType[][];
  features: Set<StrategicFeatureType>[][];
  cityScore: number[][];
  roadCost: number[][];
  defensiveValue: number[][];
  chokepointValue: number[][];
  supplyValue: number[][];
  cities: CityNode[];
  roads: RoadEdge[];
}

export function createStrategicGenContext(config: { seed: number; width: number; height: number }): StrategicGenContext {
  const { seed, width, height } = config;
  const rng = createSeededRNG(seed);

  return {
    seed,
    rng,
    width,
    height,
    elevation: create2DArray(width, height, () => 0),
    slope: create2DArray(width, height, () => 0),
    moisture: create2DArray(width, height, () => 0.5),
    temperature: create2DArray(width, height, () => 0.5),
    waterMask: create2DArray(width, height, () => false),
    oceanMask: create2DArray(width, height, () => false),
    lakeMask: create2DArray(width, height, () => false),
    riverLayer: create2DArray(width, height, () => ({
      isRiver: false,
      flowAmount: 0,
      width: 0,
      isMainRiver: false,
    })),
    baseTerrain: create2DArray(width, height, () => 'plains' as StrategicBaseTerrainType),
    features: create2DArray(width, height, () => new Set<StrategicFeatureType>()),
    cityScore: create2DArray(width, height, () => 0),
    roadCost: create2DArray(width, height, () => 1),
    defensiveValue: create2DArray(width, height, () => 0),
    chokepointValue: create2DArray(width, height, () => 0),
    supplyValue: create2DArray(width, height, () => 0),
    cities: [],
    roads: [],
  };
}
