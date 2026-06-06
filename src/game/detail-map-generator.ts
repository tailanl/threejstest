import type { TerrainType, TacticalFeatureType } from './types';
import type { StrategicMap, StrategicSector, StrategicPosition, CityRank } from './strategic-types';
import type { DetailMap, DetailMapCell, DetailMapKind } from './detail-map-types';

const DETAIL_SCALE = 16;

// Seeded RNG
function createRNG(seed: number) {
  let s = seed | 0;
  return {
    next(): number {
      s = (s * 1664525 + 1013904223) | 0;
      return (s >>> 0) / 4294967296;
    },
  };
}

// Simple noise for local variation
function localNoise(x: number, z: number, seed: number): number {
  const n = Math.sin(x * 12.9898 + z * 78.233 + seed * 43.12) * 43758.5453;
  return n - Math.floor(n);
}

function inBounds(x: number, z: number, w: number, h: number): boolean {
  return x >= 0 && x < w && z >= 0 && z < h;
}

// Map strategic baseTerrain to detail terrain distribution
function strategicToDetailTerrain(
  sector: StrategicSector,
  localX: number,
  localZ: number,
  rng: ReturnType<typeof createRNG>
): TerrainType {
  const bt = sector.baseTerrain || sector.terrain;
  const noise = rng.next();

  switch (bt) {
    case 'plains':
      return noise < 0.1 ? 'forest' : noise < 0.15 ? 'swamp' : 'plains';
    case 'forest':
      return noise < 0.65 ? 'forest' : noise < 0.85 ? 'plains' : 'forest';
    case 'mountain':
      return noise < 0.55 ? 'mountain' : noise < 0.8 ? 'plains' : 'mountain';
    case 'water':
      return 'water';
    case 'marshland':
      return noise < 0.5 ? 'swamp' : noise < 0.75 ? 'plains' : 'water';
    case 'desert':
      return noise < 0.7 ? 'desert' : 'plains';
    case 'highland':
      return noise < 0.4 ? 'mountain' : noise < 0.7 ? 'plains' : 'forest';
    case 'city':
      return 'city';
    default:
      return 'plains';
  }
}

function computeMovementCost(terrain: TerrainType, features: TacticalFeatureType[]): number {
  let cost = 1;
  switch (terrain) {
    case 'plains': cost = 1; break;
    case 'forest': cost = 2; break;
    case 'mountain': cost = 3; break;
    case 'water': cost = 99; break;
    case 'city': cost = 1; break;
    case 'swamp': cost = 3; break;
    case 'desert': cost = 2; break;
    case 'road': cost = 0.5; break;
    default: cost = 1;
  }
  if (features.includes('main_road')) cost = Math.min(cost, 0.5);
  if (features.includes('secondary_road')) cost = Math.min(cost, 0.7);
  if (features.includes('river') || features.includes('stream')) cost += 1;
  return cost;
}

function computeDefenseBonus(terrain: TerrainType, features: TacticalFeatureType[]): number {
  let bonus = 0;
  switch (terrain) {
    case 'forest': bonus = 15; break;
    case 'mountain': bonus = 25; break;
    case 'city': bonus = 20; break;
    case 'swamp': bonus = 10; break;
    default: bonus = 0;
  }
  if (features.includes('urban_block')) bonus += 10;
  if (features.includes('suburb')) bonus += 5;
  if (features.includes('hill')) bonus += 10;
  return bonus;
}

// Paint city detail block
function paintCityDetailBlock(
  cells: DetailMapCell[][],
  centerX: number,
  centerZ: number,
  rank: CityRank,
  rng: ReturnType<typeof createRNG>,
  mapWidth: number,
  mapHeight: number
): void {
  const coreRadius =
    rank === 'capital' ? 5 :
    rank === 'major' ? 4 :
    rank === 'regional' ? 3 : 2;

  for (let dz = -coreRadius - 3; dz <= coreRadius + 3; dz++) {
    for (let dx = -coreRadius - 3; dx <= coreRadius + 3; dx++) {
      const x = centerX + dx;
      const z = centerZ + dz;
      if (!inBounds(x, z, mapWidth, mapHeight)) continue;

      const d = Math.sqrt(dx * dx + dz * dz);
      const noise = rng.next() * 0.6;
      const cell = cells[z][x];

      if (cell.terrain === 'water') continue;

      if (d < coreRadius + noise) {
        cell.terrain = 'city';
        if (!cell.features.includes('urban_block')) cell.features.push('urban_block');
      }

      if (d < 1.5) {
        if (!cell.features.includes('city_center')) cell.features.push('city_center');
        cell.isObjective = true;
      }

      if (d >= coreRadius && d < coreRadius + 3 + noise) {
        if (rng.next() < 0.55) {
          cell.terrain = 'city';
        } else {
          cell.terrain = 'plains';
        }
        if (!cell.features.includes('suburb')) cell.features.push('suburb');
      }

      // Industrial zone for capital/major
      if ((rank === 'capital' || rank === 'major') && d >= coreRadius - 1 && d < coreRadius + 1 && rng.next() < 0.15) {
        if (!cell.features.includes('industrial')) cell.features.push('industrial');
      }

      // Checkpoint for capital
      if (rank === 'capital' && d >= coreRadius + 1 && d <= coreRadius + 2 && rng.next() < 0.08) {
        if (!cell.features.includes('checkpoint')) cell.features.push('checkpoint');
      }
    }
  }

  // City roads: cross pattern through center
  // East-West main road
  for (let dx = -coreRadius - 2; dx <= coreRadius + 2; dx++) {
    const x = centerX + dx;
    const z = centerZ;
    if (!inBounds(x, z, mapWidth, mapHeight)) continue;
    const cell = cells[z][x];
    if (cell.terrain === 'water') continue;
    if (!cell.features.includes('main_road')) cell.features.push('main_road');
    cell.isRoad = true;
    cell.roadType = 'main';
  }
  // North-South main road
  for (let dz = -coreRadius - 2; dz <= coreRadius + 2; dz++) {
    const x = centerX;
    const z = centerZ + dz;
    if (!inBounds(x, z, mapWidth, mapHeight)) continue;
    const cell = cells[z][x];
    if (cell.terrain === 'water') continue;
    if (!cell.features.includes('main_road')) cell.features.push('main_road');
    cell.isRoad = true;
    cell.roadType = 'main';
  }

  // Ring road for capital/major
  if (rank === 'capital' || rank === 'major') {
    const ringR = coreRadius + 1;
    for (let angle = 0; angle < 360; angle += 10) {
      const rad = (angle * Math.PI) / 180;
      const x = Math.round(centerX + Math.cos(rad) * ringR);
      const z = Math.round(centerZ + Math.sin(rad) * ringR);
      if (!inBounds(x, z, mapWidth, mapHeight)) continue;
      const cell = cells[z][x];
      if (cell.terrain === 'water') continue;
      if (!cell.features.includes('secondary_road')) cell.features.push('secondary_road');
      cell.isRoad = true;
      cell.roadType = 'secondary';
    }
  }
}

// Paint road through a sector's 16×16 area
function paintRoadThroughSector(
  cells: DetailMapCell[][],
  offsetX: number,
  offsetZ: number,
  roadType: 'main_road' | 'secondary_road',
  rng: ReturnType<typeof createRNG>,
  mapWidth: number,
  mapHeight: number
): void {
  const direction = rng.next();
  const isMain = roadType === 'main_road';
  const feature: TacticalFeatureType = roadType;

  if (direction < 0.25) {
    // West-East
    const z = offsetZ + Math.floor(rng.next() * DETAIL_SCALE);
    for (let dx = 0; dx < DETAIL_SCALE; dx++) {
      const x = offsetX + dx;
      if (!inBounds(x, z, mapWidth, mapHeight)) continue;
      const cell = cells[z][x];
      if (cell.terrain === 'water') continue;
      if (!cell.features.includes(feature)) cell.features.push(feature);
      cell.isRoad = true;
      cell.roadType = isMain ? 'main' : 'secondary';
    }
  } else if (direction < 0.5) {
    // North-South
    const x = offsetX + Math.floor(rng.next() * DETAIL_SCALE);
    for (let dz = 0; dz < DETAIL_SCALE; dz++) {
      const z = offsetZ + dz;
      if (!inBounds(x, z, mapWidth, mapHeight)) continue;
      const cell = cells[z][x];
      if (cell.terrain === 'water') continue;
      if (!cell.features.includes(feature)) cell.features.push(feature);
      cell.isRoad = true;
      cell.roadType = isMain ? 'main' : 'secondary';
    }
  } else if (direction < 0.75) {
    // NW-SE diagonal
    for (let i = 0; i < DETAIL_SCALE; i++) {
      const x = offsetX + i;
      const z = offsetZ + i;
      if (!inBounds(x, z, mapWidth, mapHeight)) continue;
      const cell = cells[z][x];
      if (cell.terrain === 'water') continue;
      if (!cell.features.includes(feature)) cell.features.push(feature);
      cell.isRoad = true;
      cell.roadType = isMain ? 'main' : 'secondary';
    }
  } else {
    // NE-SW diagonal
    for (let i = 0; i < DETAIL_SCALE; i++) {
      const x = offsetX + (DETAIL_SCALE - 1 - i);
      const z = offsetZ + i;
      if (!inBounds(x, z, mapWidth, mapHeight)) continue;
      const cell = cells[z][x];
      if (cell.terrain === 'water') continue;
      if (!cell.features.includes(feature)) cell.features.push(feature);
      cell.isRoad = true;
      cell.roadType = isMain ? 'main' : 'secondary';
    }
  }
}

// Paint river through a sector's 16×16 area
function paintRiverThroughSector(
  cells: DetailMapCell[][],
  offsetX: number,
  offsetZ: number,
  riverWidth: number,
  rng: ReturnType<typeof createRNG>,
  mapWidth: number,
  mapHeight: number
): void {
  const direction = rng.next();
  const width = Math.max(1, riverWidth);

  if (direction < 0.35) {
    // West-East
    let z = offsetZ + Math.floor(rng.next() * (DETAIL_SCALE - 4)) + 2;
    for (let dx = 0; dx < DETAIL_SCALE; dx++) {
      z += rng.next() < 0.3 ? (rng.next() < 0.5 ? -1 : 1) : 0;
      z = Math.max(offsetZ + 1, Math.min(offsetZ + DETAIL_SCALE - 2, z));
      for (let w = 0; w < width; w++) {
        const rz = z + w;
        const x = offsetX + dx;
        if (!inBounds(x, rz, mapWidth, mapHeight)) continue;
        const cell = cells[rz][x];
        if (width >= 2) {
          cell.terrain = 'water';
        }
        if (!cell.features.includes('river')) cell.features.push('river');
      }
    }
  } else if (direction < 0.7) {
    // North-South
    let x = offsetX + Math.floor(rng.next() * (DETAIL_SCALE - 4)) + 2;
    for (let dz = 0; dz < DETAIL_SCALE; dz++) {
      x += rng.next() < 0.3 ? (rng.next() < 0.5 ? -1 : 1) : 0;
      x = Math.max(offsetX + 1, Math.min(offsetX + DETAIL_SCALE - 2, x));
      for (let w = 0; w < width; w++) {
        const rx = x + w;
        const z = offsetZ + dz;
        if (!inBounds(rx, z, mapWidth, mapHeight)) continue;
        const cell = cells[z][rx];
        if (width >= 2) {
          cell.terrain = 'water';
        }
        if (!cell.features.includes('river')) cell.features.push('river');
      }
    }
  } else {
    // Diagonal NW-SE
    for (let i = 0; i < DETAIL_SCALE; i++) {
      const x = offsetX + i;
      const z = offsetZ + i;
      for (let w = 0; w < width; w++) {
        if (!inBounds(x + w, z, mapWidth, mapHeight)) continue;
        const cell = cells[z][x + w];
        if (width >= 2) {
          cell.terrain = 'water';
        }
        if (!cell.features.includes('river')) cell.features.push('river');
      }
    }
  }
}

// Place bridges at road+river intersections
function placeBridges(cells: DetailMapCell[][], width: number, height: number): void {
  for (let z = 0; z < height; z++) {
    for (let x = 0; x < width; x++) {
      const cell = cells[z][x];
      const hasRoad = cell.features.includes('main_road') || cell.features.includes('secondary_road');
      const hasRiver = cell.features.includes('river') || cell.features.includes('stream');
      if (hasRoad && hasRiver) {
        if (!cell.features.includes('bridge')) cell.features.push('bridge');
      }
    }
  }
}

// Main generation function
export function generateDetailMapFromStrategicSector(params: {
  strategicMap: StrategicMap;
  center: StrategicPosition;
  radius: number;
  seed?: number;
}): DetailMap {
  const { strategicMap, center, radius } = params;
  const seed = params.seed ?? (center.x * 7919 + center.y * 104729 + 31337);
  const rng = createRNG(seed);

  const gridSize = radius * 2 + 1;
  const mapWidth = gridSize * DETAIL_SCALE;
  const mapHeight = gridSize * DETAIL_SCALE;

  // Determine included sectors
  const includedSectors: StrategicPosition[] = [];
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const sx = center.x + dx;
      const sy = center.y + dy;
      if (sx >= 0 && sx < strategicMap.width && sy >= 0 && sy < strategicMap.height) {
        includedSectors.push({ x: sx, y: sy });
      }
    }
  }

  // Determine kind
  const centerSector = strategicMap.sectors[center.y]?.[center.x];
  const isCity = centerSector?.features?.includes('city') || centerSector?.features?.includes('capital') || centerSector?.terrain === 'city';
  const kind: DetailMapKind = isCity ? 'city' : 'sector';

  // Create cells
  const cells: DetailMapCell[][] = [];
  for (let z = 0; z < mapHeight; z++) {
    cells[z] = [];
    for (let x = 0; x < mapWidth; x++) {
      cells[z][x] = {
        position: { x, z },
        terrain: 'plains',
        features: [],
        sourceStrategicSector: center,
        localElevation: 0,
        localMoisture: 0,
        movementCost: 1,
        defenseBonus: 0,
        isObjective: false,
      };
    }
  }

  // Fill terrain from strategic sectors
  for (const sp of includedSectors) {
    const sector = strategicMap.sectors[sp.y]?.[sp.x];
    if (!sector) continue;

    const sectorLocalX = sp.x - (center.x - radius);
    const sectorLocalY = sp.y - (center.y - radius);
    const detailOffsetX = sectorLocalX * DETAIL_SCALE;
    const detailOffsetZ = sectorLocalY * DETAIL_SCALE;

    const sectorRng = createRNG(seed + sp.x * 31 + sp.y * 97);

    for (let lz = 0; lz < DETAIL_SCALE; lz++) {
      for (let lx = 0; lx < DETAIL_SCALE; lx++) {
        const dx = detailOffsetX + lx;
        const dz = detailOffsetZ + lz;
        if (!inBounds(dx, dz, mapWidth, mapHeight)) continue;

        const cell = cells[dz][dx];
        cell.sourceStrategicSector = sp;
        cell.terrain = strategicToDetailTerrain(sector, lx, lz, sectorRng);
        cell.localElevation = (sector.gen?.elevation ?? 0.5) + localNoise(lx, lz, seed + sp.x * 13 + sp.y * 7) * 0.1;
        cell.localMoisture = (sector.gen?.moisture ?? 0.5) + localNoise(lx, lz, seed + sp.x * 17 + sp.y * 23) * 0.1;

        // Hill feature for highland/mountain
        if ((sector.baseTerrain === 'highland' || sector.baseTerrain === 'mountain') && sectorRng.next() < 0.15) {
          cell.features.push('hill');
        }
        // Forest patch for forest sectors
        if (sector.baseTerrain === 'forest' && sectorRng.next() < 0.1) {
          cell.features.push('forest_patch');
        }
        // Field for plains
        if (sector.baseTerrain === 'plains' && sectorRng.next() < 0.08) {
          cell.features.push('field');
        }
      }
    }

    // Paint features from strategic sector
    const sectorFeatures = sector.features || [];

    // River
    if (sectorFeatures.includes('river')) {
      const riverWidth = sector.gen?.riverWidth ?? 1;
      paintRiverThroughSector(cells, detailOffsetX, detailOffsetZ, riverWidth, sectorRng, mapWidth, mapHeight);
    }

    // Roads
    if (sectorFeatures.includes('main_road')) {
      paintRoadThroughSector(cells, detailOffsetX, detailOffsetZ, 'main_road', sectorRng, mapWidth, mapHeight);
    }
    if (sectorFeatures.includes('secondary_road')) {
      paintRoadThroughSector(cells, detailOffsetX, detailOffsetZ, 'secondary_road', sectorRng, mapWidth, mapHeight);
    }
  }

  // Paint city detail if center is city
  if (isCity && centerSector) {
    const centerLocalX = radius * DETAIL_SCALE + Math.floor(DETAIL_SCALE / 2);
    const centerLocalZ = radius * DETAIL_SCALE + Math.floor(DETAIL_SCALE / 2);
    const cityRank = centerSector.gen?.cityRank ?? 'town';
    paintCityDetailBlock(cells, centerLocalX, centerLocalZ, cityRank, rng, mapWidth, mapHeight);
  }

  // Place bridges
  placeBridges(cells, mapWidth, mapHeight);

  // Compute movement/defense
  for (let z = 0; z < mapHeight; z++) {
    for (let x = 0; x < mapWidth; x++) {
      const cell = cells[z][x];
      cell.movementCost = computeMovementCost(cell.terrain, cell.features);
      cell.defenseBonus = computeDefenseBonus(cell.terrain, cell.features);
    }
  }

  return {
    id: `detail_${center.x}_${center.y}_r${radius}`,
    kind,
    sourceStrategicSector: center,
    includedStrategicSectors: includedSectors,
    width: mapWidth,
    height: mapHeight,
    cells,
    seed,
    title: centerSector?.name ?? `Sector (${center.x}, ${center.y})`,
    metadata: {
      centerName: centerSector?.name,
      cityRank: centerSector?.gen?.cityRank,
      generatedFrom: 'strategic_sector',
      scale: DETAIL_SCALE,
    },
  };
}

// Generate neighbor detail maps (9 maps for 3×3)
export function generateNeighborDetailMaps(params: {
  strategicMap: StrategicMap;
  center: StrategicPosition;
  radius?: number;
  seed?: number;
}): DetailMap[] {
  const radius = params.radius ?? 1;
  const results: DetailMap[] = [];

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const sx = params.center.x + dx;
      const sy = params.center.y + dy;
      if (sx < 0 || sx >= params.strategicMap.width || sy < 0 || sy >= params.strategicMap.height) continue;

      results.push(generateDetailMapFromStrategicSector({
        strategicMap: params.strategicMap,
        center: { x: sx, y: sy },
        radius: 0,
        seed: params.seed,
      }));
    }
  }

  return results;
}
