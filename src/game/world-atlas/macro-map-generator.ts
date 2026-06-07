/**
 * MacroMap 生成器 - 低精度全局常驻地图
 * 256×256 MacroCell 代表 8192×8192 世界
 * 每个 MacroCell 代表 32×32 WorldCell
 */

import type { WorldAtlas, MacroCell, RegionTileMeta, PoliticalRegion, EconomicZone, HumanGeographyZone } from './atlas-types';
import type { WorldAtlasConfig } from './atlas-config';
import { regionKey } from './coordinates';

// Simple seeded RNG
class AtlasRNG {
  private state: number;
  constructor(seed: number) { this.state = seed | 0; }
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

// Simple Perlin noise for macro map
class MacroNoise {
  private perm: Uint8Array;
  private gradX: Float32Array;
  private gradY: Float32Array;

  constructor(seed: number) {
    const rng = new AtlasRNG(seed);
    const p = new Uint8Array(256);
    for (let i = 0; i < 256; i++) p[i] = i;
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

  private fade(t: number): number { return t * t * t * (t * (t * 6 - 15) + 10); }

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
    const x1 = (this.gradX[aa] * xf + this.gradY[aa] * yf) * (1 - u) + (this.gradX[ba] * (xf - 1) + this.gradY[ba] * yf) * u;
    const x2 = (this.gradX[ab] * xf + this.gradY[ab] * (yf - 1)) * (1 - u) + (this.gradX[bb] * (xf - 1) + this.gradY[bb] * (yf - 1)) * u;
    return (x1 * (1 - v) + x2 * v) * 0.5 + 0.5;
  }

  fbm(x: number, y: number, octaves: number, persistence: number, lacunarity: number, scale: number): number {
    let total = 0, amplitude = 1, frequency = scale, maxValue = 0;
    for (let i = 0; i < octaves; i++) {
      total += amplitude * this.noise2D(x * frequency, y * frequency);
      maxValue += amplitude;
      amplitude *= persistence;
      frequency *= lacunarity;
    }
    return total / maxValue;
  }
}

export function generateWorldAtlas(config: WorldAtlasConfig): WorldAtlas {
  console.time('[WorldAtlas] Generation');
  const rng = new AtlasRNG(config.seed);
  const { macroWidth, macroHeight, regionSize, regionGridWidth, regionGridHeight } = config;

  // Generate macro terrain
  const noise1 = new MacroNoise(config.seed);
  const noise2 = new MacroNoise(config.seed + 1000);
  const noise3 = new MacroNoise(config.seed + 2000);
  const moistureNoise = new MacroNoise(config.seed + 3000);
  const tempNoise = new MacroNoise(config.seed + 4000);

  const macroCells: MacroCell[][] = [];
  for (let y = 0; y < macroHeight; y++) {
    macroCells[y] = [];
    for (let x = 0; x < macroWidth; x++) {
      const nx = x / macroWidth;
      const ny = y / macroHeight;

      const continental = noise1.fbm(nx * 3, ny * 3, 4, 0.5, 2.0, 1.0);
      const mountain = noise2.fbm(nx * 5, ny * 5, 5, 0.45, 2.1, 1.0);
      const local = noise3.fbm(nx * 10, ny * 10, 3, 0.5, 2.0, 1.0);

      const edgeDistX = Math.min(x, macroWidth - x) / (macroWidth * 0.15);
      const edgeDistY = Math.min(y, macroHeight - y) / (macroHeight * 0.15);
      const edgeMask = Math.min(1, Math.min(edgeDistX, edgeDistY));

      let elevation = continental * 0.55 + mountain * 0.30 + local * 0.15;
      elevation *= edgeMask;
      elevation = Math.max(0, Math.min(1, elevation));

      const moisture = moistureNoise.fbm(nx * 4, ny * 4, 4, 0.5, 2.0, 1.0);
      const temperature = 0.3 + (1 - Math.abs(ny - 0.5) * 2) * 0.5 - elevation * 0.3 + tempNoise.fbm(nx * 3, ny * 3, 2, 0.5, 2.0, 1.0) * 0.1;

      // Determine biome
      let biome: MacroCell['biome'] = 'plains';
      if (elevation < 0.15) biome = 'ocean';
      else if (elevation < 0.2) biome = 'coast';
      else if (elevation > 0.75) biome = 'mountain';
      else if (elevation > 0.6 && moisture < 0.3) biome = 'highland';
      else if (moisture > 0.6 && temperature > 0.4) biome = 'forest';
      else if (moisture < 0.2 && temperature > 0.6) biome = 'desert';
      else if (moisture > 0.7 && elevation < 0.3) biome = 'marshland';

      // Slope approximation
      const slope = elevation > 0.5 ? (elevation - 0.5) * 0.5 : 0;

      macroCells[y][x] = {
        x, y, elevation, slope,
        moisture: Math.max(0, Math.min(1, moisture)),
        temperature: Math.max(0, Math.min(1, temperature)),
        biome,
        hasMajorRiver: false,
        hasMountainRange: biome === 'mountain',
        settlementPotential: biome === 'plains' || biome === 'coast' ? 0.7 : biome === 'forest' ? 0.3 : 0,
        roadCorridorPotential: biome === 'plains' || biome === 'highland' ? 0.6 : 0.2,
        economicValue: biome === 'coast' ? 0.8 : biome === 'plains' ? 0.5 : 0.1,
        populationPotential: biome === 'plains' || biome === 'coast' ? 0.6 : 0.1,
        politicalValue: 0,
      };
    }
  }

  // Mark major rivers on macro map
  const mainRiverCount = config.rivers.mainRiverCount;
  for (let i = 0; i < mainRiverCount; i++) {
    // Find high elevation source
    let bestX = 0, bestY = 0, bestScore = -1;
    for (let attempt = 0; attempt < 100; attempt++) {
      const sx = rng.nextInt(0, macroWidth - 1);
      const sy = rng.nextInt(0, macroHeight - 1);
      const cell = macroCells[sy][sx];
      if (cell.elevation > 0.5 && cell.biome !== 'ocean' && cell.moisture > 0.4) {
        const score = cell.elevation + cell.moisture;
        if (score > bestScore) { bestScore = score; bestX = sx; bestY = sy; }
      }
    }
    // Trace river downhill
    let rx = bestX, ry = bestY;
    for (let step = 0; step < 200; step++) {
      if (rx < 0 || rx >= macroWidth || ry < 0 || ry >= macroHeight) break;
      macroCells[ry][rx].hasMajorRiver = true;
      if (macroCells[ry][rx].biome === 'ocean') break;
      // Move to lowest neighbor
      let lowestElev = macroCells[ry][rx].elevation;
      let nextX = rx, nextY = ry;
      for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
        const nx = rx + dx, ny = ry + dy;
        if (nx >= 0 && nx < macroWidth && ny >= 0 && ny < macroHeight) {
          if (macroCells[ny][nx].elevation < lowestElev) {
            lowestElev = macroCells[ny][nx].elevation;
            nextX = nx; nextY = ny;
          }
        }
      }
      if (nextX === rx && nextY === ry) break; // local minimum
      rx = nextX; ry = nextY;
    }
  }

  // Build region index
  const regionIndex: Record<string, RegionTileMeta> = {};
  for (let ry = 0; ry < regionGridHeight; ry++) {
    for (let rx = 0; rx < regionGridWidth; rx++) {
      const id = regionKey(rx, ry);
      regionIndex[id] = {
        id,
        regionX: rx,
        regionY: ry,
        worldRect: { x: rx * regionSize, y: ry * regionSize, width: regionSize, height: regionSize },
        macroRect: {
          x: Math.floor(rx * macroWidth / regionGridWidth),
          y: Math.floor(ry * macroHeight / regionGridHeight),
          width: Math.floor(macroWidth / regionGridWidth),
          height: Math.floor(macroHeight / regionGridHeight),
        },
        generated: false,
        cached: false,
      };
    }
  }

  // Generate political regions
  const politicalRegions = generatePoliticalRegions(config, macroCells, rng);

  // Generate economic zones
  const economicZones = generateEconomicZones(config, macroCells, rng);

  // Generate human geography zones
  const humanGeographyZones = generateHumanGeographyZones(config, macroCells, rng);

  const atlas: WorldAtlas = {
    id: `atlas_${config.seed}`,
    seed: config.seed,
    virtualWidth: config.virtualWidth,
    virtualHeight: config.virtualHeight,
    regionSize,
    regionGridWidth,
    regionGridHeight,
    macroWidth,
    macroHeight,
    macroCells,
    regionIndex,
    politicalRegions,
    economicZones,
    humanGeographyZones,
    generatedRegionIds: [],
  };

  console.timeEnd('[WorldAtlas] Generation');
  console.log(`[WorldAtlas] ${macroWidth}×${macroHeight} macro cells, ${regionGridWidth}×${regionGridHeight} regions`);
  console.log(`[WorldAtlas] ${politicalRegions.length} political regions, ${economicZones.length} economic zones`);

  return atlas;
}

function generatePoliticalRegions(config: WorldAtlasConfig, macroCells: MacroCell[][], rng: AtlasRNG): PoliticalRegion[] {
  const regions: PoliticalRegion[] = [];
  const count = config.politics.politicalRegionCount;
  const { macroWidth, macroHeight } = config;

  for (let i = 0; i < count; i++) {
    const cx = rng.nextInt(macroWidth * 0.1, macroWidth * 0.9);
    const cy = rng.nextInt(macroHeight * 0.1, macroHeight * 0.9);
    const radius = rng.nextInt(15, 40);
    const cells: Array<{x:number;y:number}> = [];

    for (let y = Math.max(0, cy - radius); y < Math.min(macroHeight, cy + radius); y++) {
      for (let x = Math.max(0, cx - radius); x < Math.min(macroWidth, cx + radius); x++) {
        if ((x-cx)*(x-cx) + (y-cy)*(y-cy) <= radius*radius && macroCells[y][x].biome !== 'ocean') {
          cells.push({x,y});
        }
      }
    }

    const faction = i < count / 2 ? 'red' : 'blue';
    regions.push({
      id: `polregion_${i}`,
      name: `Region_${i}`,
      factionId: faction,
      macroCells: cells,
      stability: 0.5 + rng.next() * 0.5,
      mobilizationLevel: 0.3 + rng.next() * 0.4,
      infrastructureControl: 0.4 + rng.next() * 0.4,
    });
  }

  return regions;
}

function generateEconomicZones(config: WorldAtlasConfig, macroCells: MacroCell[][], rng: AtlasRNG): EconomicZone[] {
  const zones: EconomicZone[] = [];
  const types: EconomicZone['type'][] = ['industrial', 'agricultural', 'port', 'mining', 'administrative', 'logistics', 'energy'];
  const counts = [
    config.economy.industrialZoneCount,
    config.economy.portZoneCount,
    config.economy.logisticsHubCount,
    config.economy.energyZoneCount,
  ];
  const typeSubset: EconomicZone['type'][] = ['industrial', 'port', 'logistics', 'energy'];

  for (let i = 0; i < typeSubset.length; i++) {
    for (let j = 0; j < counts[i]; j++) {
      const gx = rng.nextInt(0, config.virtualWidth - 1);
      const gy = rng.nextInt(0, config.virtualHeight - 1);
      zones.push({
        id: `econ_${typeSubset[i]}_${j}`,
        name: `${typeSubset[i]}_zone_${j}`,
        type: typeSubset[i],
        center: { globalX: gx, globalY: gy },
        radius: rng.nextInt(50, 200),
        outputValue: 0.3 + rng.next() * 0.7,
        supplyValue: 0.2 + rng.next() * 0.5,
        victoryPointValue: 0.3 + rng.next() * 0.7,
      });
    }
  }

  return zones;
}

function generateHumanGeographyZones(config: WorldAtlasConfig, macroCells: MacroCell[][], rng: AtlasRNG): HumanGeographyZone[] {
  const zones: HumanGeographyZone[] = [];
  const count = 8;

  for (let i = 0; i < count; i++) {
    const gx = rng.nextInt(0, config.virtualWidth - 1);
    const gy = rng.nextInt(0, config.virtualHeight - 1);
    zones.push({
      id: `humangeo_${i}`,
      name: `PopZone_${i}`,
      center: { globalX: gx, globalY: gy },
      radius: rng.nextInt(100, 400),
      populationDensity: rng.next(),
      urbanization: rng.next() * 0.8,
      roadDensity: rng.next() * 0.6,
      railDensity: rng.next() * 0.3,
    });
  }

  return zones;
}
