/** @deprecated Use directory equivalents under src/game/world-map/ and src/game/world-view/ instead */
import type { WorldMap, StrategicChunk, WorldTerrainType, WorldFeatureType } from './world-map-types';

const ALL_TERRAIN_TYPES: WorldTerrainType[] = [
  'plains', 'forest', 'mountain', 'water', 'desert', 'marshland', 'highland', 'city',
];

export function getChunkWorldRect(chunkX: number, chunkY: number, chunkSize: number) {
  return {
    x: chunkX * chunkSize,
    y: chunkY * chunkSize,
    width: chunkSize,
    height: chunkSize,
  };
}

export function buildStrategicChunks(worldMap: WorldMap): StrategicChunk[][] {
  const chunkSize = worldMap.chunkSize;
  const chunksX = worldMap.width / chunkSize;
  const chunksY = worldMap.height / chunkSize;

  const result: StrategicChunk[][] = [];

  for (let chunkY = 0; chunkY < chunksY; chunkY++) {
    const row: StrategicChunk[] = [];
    for (let chunkX = 0; chunkX < chunksX; chunkX++) {
      const worldRect = getChunkWorldRect(chunkX, chunkY, chunkSize);

      // Count terrain mix
      const terrainCounts: Record<WorldTerrainType, number> = {
        plains: 0, forest: 0, mountain: 0, water: 0,
        desert: 0, marshland: 0, highland: 0, city: 0,
      };
      let totalCells = 0;

      const hasFeature: Record<string, boolean> = {
        hasCity: false, hasCapital: false, hasRiver: false,
        hasMainRoad: false, hasSecondaryRoad: false, hasBridge: false,
        hasFortress: false, hasAirfield: false, hasSupplyDepot: false,
      };

      for (let dy = 0; dy < chunkSize; dy++) {
        for (let dx = 0; dx < chunkSize; dx++) {
          const wx = worldRect.x + dx;
          const wy = worldRect.y + dy;
          if (wx >= worldMap.width || wy >= worldMap.height) continue;

          const cell = worldMap.cells[wy][wx];
          terrainCounts[cell.baseTerrain]++;
          totalCells++;

          // Scan features
          for (const f of cell.features) {
            if (f === 'river' || f === 'stream') hasFeature.hasRiver = true;
            if (f === 'main_road') hasFeature.hasMainRoad = true;
            if (f === 'secondary_road') hasFeature.hasSecondaryRoad = true;
            if (f === 'bridge') hasFeature.hasBridge = true;
            if (f === 'fortress' || f === 'checkpoint') hasFeature.hasFortress = true;
            if (f === 'airfield') hasFeature.hasAirfield = true;
            if (f === 'supply_depot') hasFeature.hasSupplyDepot = true;
            if (f === 'city_center' || f === 'urban_block' || f === 'suburb' || f === 'industrial') {
              hasFeature.hasCity = true;
            }
          }
        }
      }

      // Terrain mix ratios
      const terrainMix: Record<WorldTerrainType, number> = {
        plains: 0, forest: 0, mountain: 0, water: 0,
        desert: 0, marshland: 0, highland: 0, city: 0,
      };
      if (totalCells > 0) {
        for (const t of ALL_TERRAIN_TYPES) {
          terrainMix[t] = terrainCounts[t] / totalCells;
        }
      }

      // Dominant terrain
      let dominantTerrain: WorldTerrainType = 'plains';
      let maxRatio = -1;
      for (const t of ALL_TERRAIN_TYPES) {
        if (terrainMix[t] > maxRatio) {
          maxRatio = terrainMix[t];
          dominantTerrain = t;
        }
      }
      // Prefer city if ratio > 0.15
      if (terrainMix.city > 0.15) {
        dominantTerrain = 'city';
      }

      // City IDs overlapping this chunk
      const cityIds: string[] = [];
      for (const city of worldMap.cities) {
        if (
          city.bounds.minX <= worldRect.x + worldRect.width - 1 &&
          city.bounds.maxX >= worldRect.x &&
          city.bounds.minY <= worldRect.y + worldRect.height - 1 &&
          city.bounds.maxY >= worldRect.y
        ) {
          cityIds.push(city.id);
          if (city.rank === 'capital') {
            hasFeature.hasCapital = true;
          }
        }
      }

      // If any city overlaps, mark hasCity
      if (cityIds.length > 0) {
        hasFeature.hasCity = true;
      }

      // Strategic value computation
      const strategicValue = computeStrategicValue(terrainMix, hasFeature, cityIds, worldMap);

      const chunk: StrategicChunk = {
        id: `chunk_${chunkX}_${chunkY}`,
        chunkX,
        chunkY,
        worldRect,
        dominantTerrain,
        terrainMix,
        features: {
          hasCity: hasFeature.hasCity,
          hasCapital: hasFeature.hasCapital,
          hasRiver: hasFeature.hasRiver,
          hasMainRoad: hasFeature.hasMainRoad,
          hasSecondaryRoad: hasFeature.hasSecondaryRoad,
          hasBridge: hasFeature.hasBridge,
          hasFortress: hasFeature.hasFortress,
          hasAirfield: hasFeature.hasAirfield,
          hasSupplyDepot: hasFeature.hasSupplyDepot,
        },
        cityIds,
        strategicValue,
        control: 'neutral',
      };

      row.push(chunk);
    }
    result.push(row);
  }

  return result;
}

function computeStrategicValue(
  terrainMix: Record<WorldTerrainType, number>,
  features: Record<string, boolean>,
  cityIds: string[],
  worldMap: WorldMap,
): StrategicChunk['strategicValue'] {
  // Supply: cities and supply depots contribute
  let supply = 0;
  if (features.hasCity) supply += 3;
  if (features.hasSupplyDepot) supply += 2;
  if (features.hasAirfield) supply += 1;
  supply += terrainMix.city * 5;

  // Defense: mountains, highlands, fortresses
  let defense = 0;
  defense += terrainMix.mountain * 4;
  defense += terrainMix.highland * 3;
  defense += terrainMix.forest * 2;
  if (features.hasFortress) defense += 4;
  if (features.hasRiver) defense += 2;

  // Movement: roads and plains
  let movement = 0;
  if (features.hasMainRoad) movement += 3;
  if (features.hasSecondaryRoad) movement += 1;
  movement += terrainMix.plains * 2;
  movement += terrainMix.desert * 1;
  movement -= terrainMix.mountain * 2;
  movement -= terrainMix.water * 3;
  movement -= terrainMix.marshland * 2;

  // Chokepoint: bridges and narrow passages
  let chokepoint = 0;
  if (features.hasBridge) chokepoint += 5;
  if (features.hasRiver && features.hasMainRoad) chokepoint += 3;
  if (features.hasFortress) chokepoint += 2;

  // Victory point: cities and capitals
  let victoryPoint = 0;
  for (const cityId of cityIds) {
    const city = worldMap.cities.find(c => c.id === cityId);
    if (city) {
      victoryPoint += city.victoryPointValue;
      if (city.rank === 'capital') victoryPoint += 5;
      else if (city.rank === 'major') victoryPoint += 3;
      else if (city.rank === 'regional') victoryPoint += 2;
      else victoryPoint += 1;
    }
  }

  return {
    supply: Math.round(supply * 10) / 10,
    defense: Math.round(defense * 10) / 10,
    movement: Math.round(movement * 10) / 10,
    chokepoint: Math.round(chokepoint * 10) / 10,
    victoryPoint: Math.round(victoryPoint * 10) / 10,
  };
}
