/** @deprecated Use directory equivalents under src/game/world-map/ and src/game/world-view/ instead */
/**
 * WorldMap 地形生成 - 高度图、坡度、水域、湿度、温度、地形分类
 */

import type { WorldCell, WorldTerrainType } from './world-map-types';
import type { WorldMapGenConfig } from './world-map-config';

// ─── Seeded RNG (MurmurHash3 variant) ──────────────────

export class WorldRNG {
  private state: number;
  constructor(seed: number) {
    this.state = seed | 0;
  }
  next(): number {
    this.state += 0x6d2b79f5;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  nextInt(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }
}

// ─── Perlin Noise ──────────────────────────────────────

export class WorldPerlinNoise {
  private perm: Uint8Array;
  private gradX: Float32Array;
  private gradY: Float32Array;

  constructor(seed: number) {
    const rng = new WorldRNG(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
    // Fisher-Yates shuffle
    for (let i = 255; i > 0; i--) {
      const j = rng.nextInt(0, i);
      [p[i], p[j]] = [p[j], p[i]];
    }
    this.perm = new Uint8Array(512);
    for (let i = 0; i < 512; i++) this.perm[i] = p[i & 255];

    this.gradX = new Float32Array(256);
    this.gradY = new Float32Array(256);
    for (let i = 0; i < 256; i++) {
      const angle = rng.next() * Math.PI * 2;
      this.gradX[i] = Math.cos(angle);
      this.gradY[i] = Math.sin(angle);
    }
  }

  private fade(t: number): number {
    return t * t * t * (t * (t * 6 - 15) + 10);
  }

  private dot(ix: number, x: number, y: number): number {
    return this.gradX[ix] * x + this.gradY[ix] * y;
  }

  noise2D(x: number, y: number): number {
    const xi = Math.floor(x) & 255;
    const yi = Math.floor(y) & 255;
    const xf = x - Math.floor(x);
    const yf = y - Math.floor(y);

    const u = this.fade(xf);
    const v = this.fade(yf);

    const aa = this.perm[this.perm[xi] + yi];
    const ab = this.perm[this.perm[xi] + yi + 1];
    const ba = this.perm[this.perm[xi + 1] + yi];
    const bb = this.perm[this.perm[xi + 1] + yi + 1];

    const x1 = this.dot(aa, xf, yf) * (1 - u) + this.dot(ba, xf - 1, yf) * u;
    const x2 = this.dot(ab, xf, yf - 1) * (1 - u) + this.dot(bb, xf - 1, yf - 1) * u;

    return (x1 * (1 - v) + x2 * v) * 0.5 + 0.5; // [0, 1]
  }

  fbm(x: number, y: number, octaves: number, persistence: number, lacunarity: number, scale: number): number {
    let total = 0;
    let amplitude = 1;
    let frequency = scale;
    let maxValue = 0;

    for (let i = 0; i < octaves; i++) {
      total += amplitude * this.noise2D(x * frequency, y * frequency);
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }

    return total / maxValue; // [0, 1]
  }
}

// ─── 生成上下文 ────────────────────────────────────────

export interface WorldGenContext {
  config: WorldMapGenConfig;
  rng: WorldRNG;
  cells: WorldCell[][];
  width: number;
  height: number;
  cities: Array<{
    id: string;
    name: string;
    rank: 'capital' | 'major' | 'regional' | 'town';
    center: { x: number; y: number };
    radius: number;
    bounds: { minX: number; minY: number; maxX: number; maxY: number };
    populationScore: number;
    supplyValue: number;
    victoryPointValue: number;
    chunkIds: string[];
  }>;
  roads: Array<{
    id: string;
    type: 'main' | 'secondary' | 'military';
    fromCityId?: string;
    toCityId?: string;
    path: Array<{ x: number; y: number }>;
  }>;
  rivers: Array<{
    id: string;
    type: 'main' | 'tributary' | 'stream';
    path: Array<{ x: number; y: number }>;
    widthByIndex: number[];
  }>;
}

export function createWorldGenContext(config: WorldMapGenConfig): WorldGenContext {
  const { width, height } = config;
  const rng = new WorldRNG(config.seed);

  const cells: WorldCell[][] = [];
  for (let y = 0; y < height; y++) {
    cells[y] = [];
    for (let x = 0; x < width; x++) {
      cells[y][x] = {
        x, y,
        baseTerrain: 'plains',
        features: [],
        elevation: 0,
        moisture: 0.5,
        slope: 0,
        temperature: 0.5,
        movementCost: 1,
        defenseBonus: 0,
        visionBlock: 0,
      };
    }
  }

  return { config, rng, cells, width, height, cities: [], roads: [], rivers: [] };
}

// ─── 高度图生成 ─────────────────────────────────────────

export function generateHeightmap(ctx: WorldGenContext): void {
  const { width, height, config } = ctx;
  const noise1 = new WorldPerlinNoise(config.seed);
  const noise2 = new WorldPerlinNoise(config.seed + 1000);
  const noise3 = new WorldPerlinNoise(config.seed + 2000);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const nx = x / width;
      const ny = y / height;

      const continental = noise1.fbm(nx * 3, ny * 3, 4, 0.5, 2.0, 1.0);
      const mountain = noise2.fbm(nx * 5, ny * 5, 5, 0.45, 2.1, 1.0);
      const local = noise3.fbm(nx * 10, ny * 10, 3, 0.5, 2.0, 1.0);

      // World shape mask - reduce elevation near edges
      const edgeDistX = Math.min(x, width - x) / (width * 0.15);
      const edgeDistY = Math.min(y, height - y) / (height * 0.15);
      const edgeMask = Math.min(1, Math.min(edgeDistX, edgeDistY));

      let elevation = continental * 0.55 + mountain * 0.30 + local * 0.15;
      elevation *= edgeMask;
      elevation = Math.max(0, Math.min(1, elevation));

      ctx.cells[y][x].elevation = elevation;
    }
  }
}

// ─── 坡度计算 ───────────────────────────────────────────

export function computeSlope(ctx: WorldGenContext): void {
  const { width, height, cells } = ctx;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const h = cells[y][x].elevation;
      const hL = x > 0 ? cells[y][x - 1].elevation : h;
      const hR = x < width - 1 ? cells[y][x + 1].elevation : h;
      const hU = y > 0 ? cells[y - 1][x].elevation : h;
      const hD = y < height - 1 ? cells[y + 1][x].elevation : h;

      const dx = hR - hL;
      const dy = hD - hU;
      cells[y][x].slope = Math.sqrt(dx * dx + dy * dy);
    }
  }
}

// ─── 水域分类 ───────────────────────────────────────────

export function classifyWater(ctx: WorldGenContext): void {
  const { width, height, cells, config } = ctx;
  const seaRatio = config.terrain.seaRatio;

  // Find sea level by sorting elevations
  const allElevations: number[] = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      allElevations.push(cells[y][x].elevation);
    }
  }
  allElevations.sort((a, b) => a - b);
  const seaLevelIndex = Math.floor(allElevations.length * seaRatio);
  const seaLevel = allElevations[seaLevelIndex];

  // Mark water cells
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (cells[y][x].elevation <= seaLevel) {
        cells[y][x].baseTerrain = 'water';
      }
    }
  }

  // Flood fill from edges to find ocean vs lake
  const visited = new Uint8Array(width * height);
  const queue: number[] = [];

  // Start from all edge water cells
  for (let x = 0; x < width; x++) {
    if (cells[0][x].baseTerrain === 'water') { const idx = x; if (!visited[idx]) { visited[idx] = 1; queue.push(idx); } }
    if (cells[height - 1][x].baseTerrain === 'water') { const idx = (height - 1) * width + x; if (!visited[idx]) { visited[idx] = 1; queue.push(idx); } }
  }
  for (let y = 0; y < height; y++) {
    if (cells[y][0].baseTerrain === 'water') { const idx = y * width; if (!visited[idx]) { visited[idx] = 1; queue.push(idx); } }
    if (cells[y][width - 1].baseTerrain === 'water') { const idx = y * width + width - 1; if (!visited[idx]) { visited[idx] = 1; queue.push(idx); } }
  }

  // BFS
  let qi = 0;
  while (qi < queue.length) {
    const idx = queue[qi++];
    const cx = idx % width;
    const cy = Math.floor(idx / width);

    const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    for (const [dx, dy] of dirs) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const nidx = ny * width + nx;
      if (visited[nidx]) continue;
      if (cells[ny][nx].baseTerrain !== 'water') continue;
      visited[nidx] = 1;
      queue.push(nidx);
    }
  }

  // Small lakes (< 200 cells) become marshland
  // Find connected water components that aren't ocean
  const componentVisited = new Uint8Array(width * height);
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const idx = y * width + x;
      if (cells[y][x].baseTerrain !== 'water') continue;
      if (visited[idx]) continue; // ocean, skip
      if (componentVisited[idx]) continue;

      // BFS to find lake component
      const component: number[] = [];
      const lqueue = [idx];
      componentVisited[idx] = 1;
      let lqi = 0;
      while (lqi < lqueue.length) {
        const lidx = lqueue[lqi++];
        component.push(lidx);
        const lx = lidx % width;
        const ly = Math.floor(lidx / width);
        const dirs = [[-1, 0], [1, 0], [0, -1], [0, 1]];
        for (const [dx, dy] of dirs) {
          const nx = lx + dx;
          const ny = ly + dy;
          if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
          const nidx = ny * width + nx;
          if (componentVisited[nidx]) continue;
          if (cells[ny][nx].baseTerrain !== 'water') continue;
          if (visited[nidx]) continue; // ocean
          componentVisited[nidx] = 1;
          lqueue.push(nidx);
        }
      }

      // Small lake → marshland
      if (component.length < 200) {
        for (const cidx of component) {
          const cx = cidx % width;
          const cy = Math.floor(cidx / width);
          cells[cy][cx].baseTerrain = 'marshland';
        }
      }
    }
  }
}

// ─── 湿度计算 ───────────────────────────────────────────

export function computeMoisture(ctx: WorldGenContext): void {
  const { width, height, cells } = ctx;
  const moistureNoise = new WorldPerlinNoise(ctx.config.seed + 3000);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = cells[y][x];
      let moisture = moistureNoise.fbm(x / width * 4, y / height * 4, 4, 0.5, 2.0, 1.0);

      // Near water increases moisture
      const nearWater = isNearWater(cells, x, y, width, height, 8);
      if (nearWater) moisture = Math.min(1, moisture + 0.2);

      // Low elevation = more moisture
      if (cell.elevation < 0.3) moisture = Math.min(1, moisture + 0.15);

      // River cells get high moisture
      if (cell.features.includes('river')) moisture = Math.min(1, moisture + 0.3);

      cell.moisture = Math.max(0, Math.min(1, moisture));
    }
  }
}

function isNearWater(cells: WorldCell[][], x: number, y: number, w: number, h: number, radius: number): boolean {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || nx >= w || ny < 0 || ny >= h) continue;
      if (dx * dx + dy * dy > radius * radius) continue;
      if (cells[ny][nx].baseTerrain === 'water') return true;
    }
  }
  return false;
}

// ─── 温度计算 ───────────────────────────────────────────

export function computeTemperature(ctx: WorldGenContext): void {
  const { width, height, cells } = ctx;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = cells[y][x];
      // Base temperature from latitude (center = warm, edges = cold)
      const latFactor = 1 - Math.abs(y / height - 0.5) * 2;
      let temp = 0.3 + latFactor * 0.5;

      // Elevation reduces temperature
      temp -= cell.elevation * 0.4;

      // Water moderates temperature
      if (cell.baseTerrain === 'water') temp = 0.5;

      cell.temperature = Math.max(0, Math.min(1, temp));
    }
  }
}

// ─── 地形分类 ───────────────────────────────────────────

export function classifyBaseTerrain(ctx: WorldGenContext): void {
  const { width, height, cells, config } = ctx;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = cells[y][x];
      if (cell.baseTerrain === 'water') continue; // Already classified

      const e = cell.elevation;
      const s = cell.slope;
      const m = cell.moisture;
      const t = cell.temperature;

      // Scoring method
      const mountainScore = e * 70 + s * 120;
      const forestScore = m * 80 - s * 20 + (t > 0.3 && t < 0.8 ? 15 : 0);
      const marshScore = m * 90 - s * 100 + (isNearWater(cells, x, y, width, height, 5) ? 30 : 0);
      const desertScore = (m < 0.22 && t > 0.6) ? 80 : -100;
      const highlandScore = e * 50 + s * 40 - 20;
      const plainsScore = 50 - s * 80;

      const scores: [WorldTerrainType, number][] = [
        ['mountain', mountainScore],
        ['forest', forestScore],
        ['marshland', marshScore],
        ['desert', desertScore],
        ['highland', highlandScore],
        ['plains', plainsScore],
      ];

      // Mountain threshold
      if (e > 0.75 && s > 0.05) {
        cell.baseTerrain = 'mountain';
        continue;
      }

      // Water threshold for very low elevation
      if (e < 0.15) {
        cell.baseTerrain = 'water';
        continue;
      }

      // Pick highest scoring terrain
      scores.sort((a, b) => b[1] - a[1]);
      cell.baseTerrain = scores[0][0];
    }
  }

  // Limit desert ratio
  limitDesertRatio(ctx);
}

export function limitDesertRatio(ctx: WorldGenContext): void {
  const { width, height, cells, config } = ctx;
  const maxDesertRatio = config.terrain.desertMaxRatio;
  const total = width * height;

  let desertCount = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (cells[y][x].baseTerrain === 'desert') desertCount++;
    }
  }

  const maxDesert = Math.floor(total * maxDesertRatio);
  if (desertCount <= maxDesert) return;

  // Convert excess desert to plains or forest
  const excess = desertCount - maxDesert;
  let converted = 0;
  const rng = ctx.rng;

  for (let y = 0; y < height && converted < excess; y++) {
    for (let x = 0; x < width && converted < excess; x++) {
      if (cells[y][x].baseTerrain === 'desert') {
        cells[y][x].baseTerrain = rng.next() < 0.6 ? 'plains' : 'forest';
        converted++;
      }
    }
  }
}

// ─── 移动和防御计算 ────────────────────────────────────

export function computeMovementAndDefense(ctx: WorldGenContext): void {
  const { width, height, cells } = ctx;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const cell = cells[y][x];
      let moveCost = 1;
      let defense = 0;
      let vision = 0;

      switch (cell.baseTerrain) {
        case 'plains': moveCost = 1; defense = 0; vision = 0; break;
        case 'forest': moveCost = 2; defense = 15; vision = 0.5; break;
        case 'mountain': moveCost = 3; defense = 25; vision = 0.99; break;
        case 'water': moveCost = 99; defense = 0; vision = 0; break;
        case 'desert': moveCost = 1.5; defense = -5; vision = 0; break;
        case 'marshland': moveCost = 3; defense = -10; vision = 0; break;
        case 'highland': moveCost = 2; defense = 10; vision = 0.3; break;
        case 'city': moveCost = 1; defense = 20; vision = 0.3; break;
      }

      // Feature modifiers
      if (cell.features.includes('main_road')) moveCost = Math.min(moveCost, 0.5);
      if (cell.features.includes('secondary_road')) moveCost = Math.min(moveCost, 0.7);
      if (cell.features.includes('river')) moveCost += 1;
      if (cell.features.includes('urban_block')) defense += 10;
      if (cell.features.includes('suburb')) defense += 5;
      if (cell.features.includes('fortress')) { defense += 35; moveCost = 1; }

      cell.movementCost = moveCost;
      cell.defenseBonus = defense;
      cell.visionBlock = vision;
    }
  }
}
