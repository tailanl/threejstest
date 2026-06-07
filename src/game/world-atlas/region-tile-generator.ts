/**
 * RegionTile 生成器 - 从 MacroMap 生成 1024×1024 高精度区域
 * 使用 globalX/globalY 采样噪声，保证相邻 region 连续
 */

import type { WorldAtlas, MacroCell, WorldPosition } from './atlas-types';
import type { WorldAtlasConfig } from './atlas-config';
import type { RegionTile, GeneratedCity, GeneratedRoad, GeneratedRiver } from '../world-map/world-map-types';
import type { WorldCell, WorldTerrainType, WorldFeatureType } from '../world-map/world-cell-types';
import type { StrategicChunk } from '../world-view/strategic-chunks';
import { regionKey, globalToRegion } from './coordinates';

// Reuse noise from macro-map-generator pattern
class TileRNG {
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

class TileNoise {
  private perm: Uint8Array;
  private gradX: Float32Array;
  private gradY: Float32Array;

  constructor(seed: number) {
    const rng = new TileRNG(seed);
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

export function generateRegionTile(atlas: WorldAtlas, regionX: number, regionY: number): RegionTile {
  console.time(`[RegionTile] Generate (${regionX},${regionY})`);
  const config = { regionSize: atlas.regionSize, seed: atlas.seed };
  const rng = new TileRNG(atlas.seed + regionX * 7919 + regionY * 104729);

  const regionSize = atlas.regionSize;
  const worldOriginX = regionX * regionSize;
  const worldOriginY = regionY * regionSize;

  // Get macro data for this region
  const macroRect = atlas.regionIndex[regionKey(regionX, regionY)]?.macroRect;

  // Noise using GLOBAL coordinates
  const noise1 = new TileNoise(atlas.seed);
  const noise2 = new TileNoise(atlas.seed + 1000);
  const noise3 = new TileNoise(atlas.seed + 2000);
  const moistureNoise = new TileNoise(atlas.seed + 3000);

  // Generate cells with padding
  const padding = 16;
  const paddedSize = regionSize + padding * 2;
  const paddedCells: WorldCell[][] = [];

  for (let ly = -padding; ly < regionSize + padding; ly++) {
    const row: WorldCell[] = [];
    for (let lx = -padding; lx < regionSize + padding; lx++) {
      const gx = worldOriginX + lx;
      const gy = worldOriginY + ly;

      // Sample noise with GLOBAL coordinates
      const nx = gx / atlas.virtualWidth;
      const ny = gy / atlas.virtualHeight;

      const continental = noise1.fbm(nx * 3, ny * 3, 4, 0.5, 2.0, 1.0);
      const mountain = noise2.fbm(nx * 5, ny * 5, 5, 0.45, 2.1, 1.0);
      const local = noise3.fbm(nx * 10, ny * 10, 3, 0.5, 2.0, 1.0);

      const edgeDistX = Math.min(gx, atlas.virtualWidth - gx) / (atlas.virtualWidth * 0.15);
      const edgeDistY = Math.min(gy, atlas.virtualHeight - gy) / (atlas.virtualHeight * 0.15);
      const edgeMask = Math.min(1, Math.min(edgeDistX, edgeDistY));

      let elevation = continental * 0.55 + mountain * 0.30 + local * 0.15;
      elevation *= edgeMask;
      elevation = Math.max(0, Math.min(1, elevation));

      // Blend with macro data if available
      const mx = Math.floor(gx / (atlas.virtualWidth / atlas.macroWidth));
      const my = Math.floor(gy / (atlas.virtualHeight / atlas.macroHeight));
      const macroCell = atlas.macroCells[my]?.[mx];
      if (macroCell) {
        // Nudge elevation towards macro
        if (macroCell.biome === 'ocean') elevation = Math.min(elevation, 0.12);
        if (macroCell.biome === 'mountain') elevation = Math.max(elevation, 0.65);
      }

      const moisture = moistureNoise.fbm(nx * 4, ny * 4, 4, 0.5, 2.0, 1.0);
      const temperature = 0.3 + (1 - Math.abs(ny - 0.5) * 2) * 0.5 - elevation * 0.3;

      // Classify terrain
      let baseTerrain: WorldTerrainType = 'plains';
      if (elevation < 0.15) baseTerrain = 'water';
      else if (elevation > 0.75) baseTerrain = 'mountain';
      else if (elevation > 0.6 && moisture < 0.3) baseTerrain = 'highland';
      else if (moisture > 0.6 && temperature > 0.4) baseTerrain = 'forest';
      else if (moisture < 0.22 && temperature > 0.6) baseTerrain = 'desert';
      else if (moisture > 0.7 && elevation < 0.3) baseTerrain = 'marshland';

      // Slope
      const slope = elevation > 0.5 ? (elevation - 0.5) * 0.5 : 0;

      // Economic/political from atlas
      let economicValue = 0.1;
      let populationDensity = 0.1;
      let owner: string | undefined;

      for (const ez of atlas.economicZones) {
        const dx = gx - ez.center.globalX;
        const dy = gy - ez.center.globalY;
        if (dx * dx + dy * dy < ez.radius * ez.radius) {
          economicValue = Math.max(economicValue, ez.outputValue);
        }
      }
      for (const hg of atlas.humanGeographyZones) {
        const dx = gx - hg.center.globalX;
        const dy = gy - hg.center.globalY;
        if (dx * dx + dy * dy < hg.radius * hg.radius) {
          populationDensity = Math.max(populationDensity, hg.populationDensity);
        }
      }
      for (const pr of atlas.politicalRegions) {
        for (const mc of pr.macroCells) {
          if (mx === mc.x && my === mc.y) {
            owner = pr.factionId;
            break;
          }
        }
      }

      row.push({
        globalX: gx, globalY: gy,
        regionX, regionY,
        localX: ((lx % regionSize) + regionSize) % regionSize,
        localY: ((ly % regionSize) + regionSize) % regionSize,
        baseTerrain,
        features: [],
        elevation, slope,
        moisture: Math.max(0, Math.min(1, moisture)),
        temperature: Math.max(0, Math.min(1, temperature)),
        populationDensity,
        economicValue,
        infrastructureValue: economicValue * 0.5,
        movementCost: getMovementCost(baseTerrain),
        defenseBonus: getDefenseBonus(baseTerrain),
        concealment: getConcealment(baseTerrain),
        cover: getCover(baseTerrain),
        visionBlock: getVisionBlock(baseTerrain),
        owner: owner as any,
      });
    }
    paddedCells.push(row);
  }

  // Crop to regionSize (remove padding)
  const cells: WorldCell[][] = [];
  for (let y = padding; y < paddedSize - padding; y++) {
    const row: WorldCell[] = [];
    for (let x = padding; x < paddedSize - padding; x++) {
      row.push(paddedCells[y]?.[x] ?? paddedCells[padding]?.[padding]);
    }
    cells.push(row);
  }

  // Generate rivers from macro
  const rivers = generateRegionRivers(atlas, cells, regionX, regionY, rng);

  // Generate cities
  const cities = generateRegionCities(atlas, cells, regionX, regionY, rng);

  // Generate roads
  const roads = generateRegionRoads(cells, cities, regionX, regionY, rng);

  // Place bridges
  placeRegionBridges(cells);

  // Build strategic chunks
  const strategicChunks = buildRegionStrategicChunks(cells, cities, regionX, regionY, atlas.regionSize / 32);

  const tile: RegionTile = {
    id: regionKey(regionX, regionY),
    atlasId: atlas.id,
    regionX, regionY,
    worldOrigin: { globalX: worldOriginX, globalY: worldOriginY },
    width: regionSize,
    height: regionSize,
    cells,
    strategicChunks,
    cities,
    roads,
    rivers,
    politicalRegionIds: atlas.politicalRegions.filter(pr => {
      const rect = atlas.regionIndex[regionKey(regionX, regionY)]?.macroRect;
      if (!rect) return false;
      return pr.macroCells.some(mc => mc.x >= rect.x && mc.x < rect.x + rect.width && mc.y >= rect.y && mc.y < rect.y + rect.height);
    }).map(pr => pr.id),
    economicZoneIds: atlas.economicZones.filter(ez => {
      const cx = regionX * regionSize + regionSize / 2;
      const cy = regionY * regionSize + regionSize / 2;
      const dx = ez.center.globalX - cx;
      const dy = ez.center.globalY - cy;
      return Math.sqrt(dx*dx+dy*dy) < ez.radius + regionSize;
    }).map(ez => ez.id),
    humanGeographyZoneIds: atlas.humanGeographyZones.filter(hg => {
      const cx = regionX * regionSize + regionSize / 2;
      const cy = regionY * regionSize + regionSize / 2;
      const dx = hg.center.globalX - cx;
      const dy = hg.center.globalY - cy;
      return Math.sqrt(dx*dx+dy*dy) < hg.radius + regionSize;
    }).map(hg => hg.id),
  };

  console.timeEnd(`[RegionTile] Generate (${regionX},${regionY})`);
  console.log(`[RegionTile] ${cities.length} cities, ${roads.length} roads, ${rivers.length} rivers`);
  return tile;
}

// Helper functions
function getMovementCost(t: WorldTerrainType): number {
  const map: Record<WorldTerrainType, number> = { plains: 1, forest: 2, mountain: 3, water: 99, desert: 1.5, marshland: 3, highland: 2, city: 1 };
  return map[t] ?? 1;
}
function getDefenseBonus(t: WorldTerrainType): number {
  const map: Record<WorldTerrainType, number> = { plains: 0, forest: 15, mountain: 25, water: 0, desert: -5, marshland: -10, highland: 10, city: 20 };
  return map[t] ?? 0;
}
function getConcealment(t: WorldTerrainType): number {
  const map: Record<WorldTerrainType, number> = { plains: 0, forest: 40, mountain: 20, water: 0, desert: 0, marshland: 15, highland: 10, city: 35 };
  return map[t] ?? 0;
}
function getCover(t: WorldTerrainType): number {
  const map: Record<WorldTerrainType, number> = { plains: 0, forest: 30, mountain: 25, water: 0, desert: 5, marshland: 10, highland: 20, city: 40 };
  return map[t] ?? 0;
}
function getVisionBlock(t: WorldTerrainType): number {
  const map: Record<WorldTerrainType, number> = { plains: 0, forest: 0.5, mountain: 0.7, water: 0, desert: 0, marshland: 0.1, highland: 0.3, city: 0.4 };
  return map[t] ?? 0;
}

function generateRegionRivers(atlas: WorldAtlas, cells: WorldCell[][], rx: number, ry: number, rng: TileRNG): GeneratedRiver[] {
  const rivers: GeneratedRiver[] = [];
  const regionSize = atlas.regionSize;
  const ox = rx * regionSize;
  const oy = ry * regionSize;

  // Check macro cells for rivers in this region
  const macroRect = atlas.regionIndex[regionKey(rx, ry)]?.macroRect;
  if (!macroRect) return rivers;

  let hasRiver = false;
  for (let my = macroRect.y; my < macroRect.y + macroRect.height; my++) {
    for (let mx = macroRect.x; mx < macroRect.x + macroRect.width; mx++) {
      if (atlas.macroCells[my]?.[mx]?.hasMajorRiver) hasRiver = true;
    }
  }

  if (!hasRiver) return rivers;

  // Find high elevation start in this region
  let bestX = regionSize / 2, bestY = 0, bestElev = 0;
  for (let y = 0; y < regionSize; y += 8) {
    for (let x = 0; x < regionSize; x += 8) {
      const cell = cells[y]?.[x];
      if (cell && cell.elevation > bestElev && cell.baseTerrain !== 'water') {
        bestElev = cell.elevation;
        bestX = x; bestY = y;
      }
    }
  }

  // Trace river downhill
  const path: WorldPosition[] = [];
  const widths: number[] = [];
  let cx = bestX, cy = bestY;
  for (let step = 0; step < 500; step++) {
    if (cx < 0 || cx >= regionSize || cy < 0 || cy >= regionSize) break;
    const cell = cells[cy]?.[cx];
    if (!cell) break;

    path.push({ globalX: ox + cx, globalY: oy + cy });
    widths.push(path.length < 50 ? 1 : 2);

    if (!cell.features.includes('river')) cell.features.push('river');
    if (widths[widths.length - 1] >= 2) cell.baseTerrain = 'water';

    if (cell.baseTerrain === 'water' && step > 10) break;

    // Move downhill
    let lowestElev = cell.elevation;
    let nextX = cx, nextY = cy;
    for (const [dx, dy] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const nx = cx + dx, ny = cy + dy;
      if (nx >= 0 && nx < regionSize && ny >= 0 && ny < regionSize) {
        const n = cells[ny][nx];
        if (n.elevation < lowestElev || (n.baseTerrain === 'water' && step > 10)) {
          lowestElev = n.elevation;
          nextX = nx; nextY = ny;
        }
      }
    }
    if (nextX === cx && nextY === cy) break;
    cx = nextX; cy = nextY;
  }

  if (path.length > 10) {
    rivers.push({
      id: `river_${rx}_${ry}_0`,
      type: 'main',
      path,
      widthByIndex: widths,
    });
  }

  return rivers;
}

function generateRegionCities(atlas: WorldAtlas, cells: WorldCell[][], rx: number, ry: number, rng: TileRNG): GeneratedCity[] {
  const cities: GeneratedCity[] = [];
  const regionSize = atlas.regionSize;
  const ox = rx * regionSize;
  const oy = ry * regionSize;

  // Place 1-3 cities per region based on macro settlement potential
  const macroRect = atlas.regionIndex[regionKey(rx, ry)]?.macroRect;
  if (!macroRect) return cities;

  let avgSettlement = 0;
  let count = 0;
  for (let my = macroRect.y; my < macroRect.y + macroRect.height; my++) {
    for (let mx = macroRect.x; mx < macroRect.x + macroRect.width; mx++) {
      avgSettlement += atlas.macroCells[my]?.[mx]?.settlementPotential ?? 0;
      count++;
    }
  }
  avgSettlement = count > 0 ? avgSettlement / count : 0;

  const cityCount = avgSettlement > 0.5 ? rng.nextInt(2, 4) : avgSettlement > 0.3 ? rng.nextInt(1, 2) : rng.next() < 0.3 ? 1 : 0;

  for (let i = 0; i < cityCount; i++) {
    // Find best location
    let bestX = regionSize / 2, bestY = regionSize / 2, bestScore = -1;
    for (let attempt = 0; attempt < 200; attempt++) {
      const x = rng.nextInt(50, regionSize - 50);
      const y = rng.nextInt(50, regionSize - 50);
      const cell = cells[y]?.[x];
      if (!cell || cell.baseTerrain === 'water' || cell.baseTerrain === 'mountain') continue;

      let score = cell.elevation < 0.4 ? 20 : 0;
      score += cell.moisture > 0.4 ? 15 : 0;
      if (cell.features.includes('river')) score += 20;
      // Distance from other cities
      let minDist = 999;
      for (const c of cities) {
        const dx = x - (c.center.globalX - ox);
        const dy = y - (c.center.globalY - oy);
        minDist = Math.min(minDist, Math.sqrt(dx*dx+dy*dy));
      }
      if (minDist < 40) continue;
      score += Math.min(20, minDist * 0.2);

      if (score > bestScore) { bestScore = score; bestX = x; bestY = y; }
    }

    // Determine rank
    const rank = i === 0 && avgSettlement > 0.5 ? 'regional' : 'town';
    const radius = rank === 'regional' ? rng.nextInt(12, 25) : rng.nextInt(5, 12);

    // Paint city area
    let minX = bestX, minY = bestY, maxX = bestX, maxY = bestY;
    for (let dy = -radius; dy <= radius; dy++) {
      for (let dx = -radius; dx <= radius; dx++) {
        const dist = Math.sqrt(dx*dx+dy*dy);
        const cx = bestX + dx, cy = bestY + dy;
        if (cx < 0 || cx >= regionSize || cy < 0 || cy >= regionSize) continue;
        const cell = cells[cy][cx];
        if (cell.baseTerrain === 'water') continue;

        if (dist < radius * 0.25) {
          cell.baseTerrain = 'city';
          if (!cell.features.includes('city_center')) cell.features.push('city_center');
          if (!cell.features.includes('urban_block')) cell.features.push('urban_block');
        } else if (dist < radius * 0.7) {
          cell.baseTerrain = 'city';
          if (!cell.features.includes('urban_block')) cell.features.push('urban_block');
        } else if (dist < radius) {
          if (!cell.features.includes('suburb')) cell.features.push('suburb');
        }

        minX = Math.min(minX, cx); minY = Math.min(minY, cy);
        maxX = Math.max(maxX, cx); maxY = Math.max(maxY, cy);
      }
    }

    cities.push({
      id: `city_${rx}_${ry}_${i}`,
      name: `City_${rx}_${ry}_${i}`,
      rank,
      center: { globalX: ox + bestX, globalY: oy + bestY },
      radius,
      bounds: { minX, minY, maxX, maxY },
      populationScore: radius * radius * 0.5,
      supplyValue: rank === 'regional' ? 50 : 20,
      victoryPointValue: rank === 'regional' ? 30 : 10,
      economicZoneIds: [],
      chunkIds: [],
    });
  }

  return cities;
}

function generateRegionRoads(cells: WorldCell[][], cities: GeneratedCity[], rx: number, ry: number, rng: TileRNG): GeneratedRoad[] {
  const roads: GeneratedRoad[] = [];
  if (cities.length < 2) return roads;

  const regionSize = cells.length;

  // Connect cities with A* (simplified: straight line with some deviation)
  for (let i = 0; i < cities.length; i++) {
    for (let j = i + 1; j < cities.length; j++) {
      const from = cities[i];
      const to = cities[j];

      const path: WorldPosition[] = [];
      const fx = from.center.globalX % regionSize;
      const fy = from.center.globalY % regionSize;
      const tx = to.center.globalX % regionSize;
      const ty = to.center.globalY % regionSize;

      const dist = Math.sqrt((tx-fx)*(tx-fx) + (ty-fy)*(ty-fy));
      const steps = Math.ceil(dist);
      const roadType = (from.rank === 'regional' || to.rank === 'regional') ? 'main' : 'secondary';

      for (let s = 0; s <= steps; s++) {
        const t = s / steps;
        const x = Math.round(fx + (tx - fx) * t);
        const y = Math.round(fy + (ty - fy) * t);
        if (x < 0 || x >= regionSize || y < 0 || y >= regionSize) continue;

        const cell = cells[y]?.[x];
        if (!cell || cell.baseTerrain === 'water') continue;

        const feature = roadType === 'main' ? 'main_road' : 'secondary_road';
        if (!cell.features.includes(feature)) cell.features.push(feature);

        path.push({ globalX: from.center.globalX + Math.round((tx - fx) * t), globalY: from.center.globalY + Math.round((ty - fy) * t) });
      }

      if (path.length > 1) {
        roads.push({
          id: `road_${rx}_${ry}_${i}_${j}`,
          type: roadType,
          fromId: from.id,
          toId: to.id,
          path,
        });
      }
    }
  }

  return roads;
}

function placeRegionBridges(cells: WorldCell[][]): void {
  for (let y = 0; y < cells.length; y++) {
    for (let x = 0; x < cells[y].length; x++) {
      const cell = cells[y][x];
      const hasRoad = cell.features.includes('main_road') || cell.features.includes('secondary_road');
      const hasRiver = cell.features.includes('river');
      if (hasRoad && hasRiver) {
        if (!cell.features.includes('bridge')) cell.features.push('bridge');
      }
    }
  }
}

function buildRegionStrategicChunks(
  cells: WorldCell[][],
  cities: GeneratedCity[],
  rx: number, ry: number,
  chunksPerSide: number
): StrategicChunk[][] {
  const regionSize = cells.length;
  const chunkSize = Math.floor(regionSize / chunksPerSide);
  const chunks: StrategicChunk[][] = [];

  for (let cy = 0; cy < chunksPerSide; cy++) {
    chunks[cy] = [];
    for (let cx = 0; cx < chunksPerSide; cx++) {
      const startX = cx * chunkSize;
      const startY = cy * chunkSize;

      const terrainMix: Record<WorldTerrainType, number> = { plains: 0, forest: 0, mountain: 0, water: 0, desert: 0, marshland: 0, highland: 0, city: 0 };
      let total = 0;
      let hasCity = false, hasCapital = false, hasRiver = false, hasMainRoad = false, hasBridge = false, hasFortress = false, hasAirfield = false, hasSupplyDepot = false, hasEconomicTarget = false;
      const cityIds: string[] = [];

      for (let y = startY; y < startY + chunkSize && y < regionSize; y++) {
        for (let x = startX; x < startX + chunkSize && x < regionSize; x++) {
          const cell = cells[y]?.[x];
          if (!cell) continue;
          total++;
          terrainMix[cell.baseTerrain]++;
          if (cell.features.includes('city_center') || cell.baseTerrain === 'city') hasCity = true;
          if (cell.features.includes('admin_center')) hasCapital = true;
          if (cell.features.includes('river')) hasRiver = true;
          if (cell.features.includes('main_road')) hasMainRoad = true;
          if (cell.features.includes('bridge')) hasBridge = true;
          if (cell.features.includes('fortress')) hasFortress = true;
          if (cell.features.includes('airfield')) hasAirfield = true;
          if (cell.features.includes('supply_depot')) hasSupplyDepot = true;

          // Check city overlap
          for (const city of cities) {
            const cityLocalX = city.center.globalX % regionSize;
            const cityLocalY = city.center.globalY % regionSize;
            if (cityLocalX >= startX && cityLocalX < startX + chunkSize && cityLocalY >= startY && cityLocalY < startY + chunkSize) {
              if (!cityIds.includes(city.id)) cityIds.push(city.id);
            }
          }
        }
      }

      // Normalize terrainMix
      if (total > 0) {
        for (const k of Object.keys(terrainMix) as WorldTerrainType[]) {
          terrainMix[k] = terrainMix[k] / total;
        }
      }

      // Dominant terrain (prefer city if > 15%)
      let dominant: WorldTerrainType = 'plains';
      let maxRatio = 0;
      if (terrainMix.city > 0.15) { dominant = 'city'; }
      else {
        for (const [k, v] of Object.entries(terrainMix)) {
          if (v > maxRatio) { maxRatio = v; dominant = k as WorldTerrainType; }
        }
      }

      chunks[cy][cx] = {
        id: `chunk_${rx}_${ry}_${cx}_${cy}`,
        regionX: rx, regionY: ry,
        chunkX: cx, chunkY: cy,
        worldRect: { x: rx * regionSize + startX, y: ry * regionSize + startY, width: chunkSize, height: chunkSize },
        dominantTerrain: dominant,
        terrainMix,
        features: { hasCity, hasCapital, hasRiver, hasMainRoad, hasBridge, hasFortress, hasAirfield, hasSupplyDepot, hasEconomicTarget },
        cityIds,
        strategicValue: {
          supply: hasCity ? 50 : hasSupplyDepot ? 30 : 10,
          defense: terrainMix.mountain * 50 + terrainMix.city * 40 + (hasFortress ? 30 : 0),
          movement: 1 - terrainMix.water * 0.5 - terrainMix.mountain * 0.3,
          chokepoint: hasBridge ? 40 : hasRiver ? 10 : 0,
          victoryPoint: hasCity ? 30 : hasCapital ? 100 : 5,
          economic: terrainMix.city * 50 + (hasEconomicTarget ? 30 : 0),
          political: hasCapital ? 50 : hasCity ? 20 : 0,
        },
        control: 'neutral',
        knownByPlayer: false,
      };
    }
  }

  return chunks;
}
