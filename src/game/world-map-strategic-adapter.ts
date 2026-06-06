/**
 * WorldMap → 旧 StrategicMap 适配
 *
 * 让旧战略 UI 能显示 WorldMap 汇总后的战略图
 */

import type { WorldMap, StrategicChunk, WorldTerrainType } from './world-map-types';
import type { StrategicMap, StrategicSector, StrategicBaseTerrainType, StrategicFeatureType, CityRank } from './strategic-types';

const CITY_NAMES = [
  '铁壁城', '龙脊镇', '碧波港', '风语堡', '烈焰关',
  '银霜营', '暗影谷', '雷鸣寨', '星辉城', '暮色镇',
  '晨曦堡', '磐石城', '翠林镇', '金沙港', '苍穹营',
  '赤焰关', '冰晶堡', '雾隐镇', '天鹰城', '落日寨',
];

function convertWorldTerrainToStrategicBaseTerrain(wt: WorldTerrainType): StrategicBaseTerrainType {
  switch (wt) {
    case 'plains': return 'plains';
    case 'forest': return 'forest';
    case 'mountain': return 'mountain';
    case 'water': return 'water';
    case 'desert': return 'desert';
    case 'marshland': return 'marshland';
    case 'highland': return 'highland';
    case 'city': return 'city';
    default: return 'plains';
  }
}

function convertChunkFeaturesToStrategicFeatures(chunk: StrategicChunk): StrategicFeatureType[] {
  const features: StrategicFeatureType[] = [];
  if (chunk.features.hasCapital) features.push('capital');
  if (chunk.features.hasCity) features.push('city');
  if (chunk.features.hasRiver) features.push('river');
  if (chunk.features.hasMainRoad) features.push('main_road');
  if (chunk.features.hasSecondaryRoad) features.push('secondary_road');
  if (chunk.features.hasBridge) features.push('bridge');
  if (chunk.features.hasFortress) features.push('fortress');
  if (chunk.features.hasAirfield) features.push('airfield');
  return features;
}

function inferCityRank(chunk: StrategicChunk, worldMap: WorldMap): CityRank | undefined {
  if (!chunk.features.hasCity) return undefined;
  if (chunk.features.hasCapital) return 'capital';

  // Check city IDs in this chunk
  for (const cityId of chunk.cityIds) {
    const city = worldMap.cities.find(c => c.id === cityId);
    if (city) return city.rank as CityRank;
  }
  return 'town';
}

function getChunkDisplayName(chunk: StrategicChunk, worldMap: WorldMap, idx: number): string {
  if (chunk.cityIds.length > 0) {
    const city = worldMap.cities.find(c => c.id === chunk.cityIds[0]);
    if (city) return city.name;
  }
  return CITY_NAMES[idx % CITY_NAMES.length] + ` (${chunk.chunkX},${chunk.chunkY})`;
}

function inferRiverWidth(chunk: StrategicChunk, worldMap: WorldMap): number {
  if (!chunk.features.hasRiver) return 0;
  // Check cells in chunk for river width
  const rect = chunk.worldRect;
  let maxWidth = 0;
  for (const river of worldMap.rivers) {
    for (let i = 0; i < river.path.length; i++) {
      const p = river.path[i];
      if (p.x >= rect.x && p.x < rect.x + rect.width && p.y >= rect.y && p.y < rect.y + rect.height) {
        maxWidth = Math.max(maxWidth, river.widthByIndex[i] ?? 1);
      }
    }
  }
  return maxWidth;
}

export function buildStrategicMapFromWorldMap(worldMap: WorldMap): StrategicMap {
  const { chunks, chunkSize } = worldMap;
  const chunkCountX = worldMap.width / chunkSize;
  const chunkCountY = worldMap.height / chunkSize;

  const sectors: StrategicSector[][] = [];
  let nameIdx = 0;

  for (let cy = 0; cy < chunkCountY; cy++) {
    sectors[cy] = [];
    for (let cx = 0; cx < chunkCountX; cx++) {
      const chunk = chunks[cy]?.[cx];
      if (!chunk) {
        sectors[cy][cx] = {
          position: { x: cx, y: cy },
          terrain: 'plains',
          force: null,
          tacticalMapSeed: worldMap.seed + cx * 31 + cy * 131,
          name: `Sector (${cx},${cy})`,
        };
        continue;
      }

      // Compute average values from cells in chunk
      const rect = chunk.worldRect;
      let sumElevation = 0, sumSlope = 0, sumMoisture = 0, sumTemperature = 0, count = 0;
      for (let y = rect.y; y < rect.y + rect.height && y < worldMap.height; y++) {
        for (let x = rect.x; x < rect.x + rect.width && x < worldMap.width; x++) {
          const cell = worldMap.cells[y][x];
          sumElevation += cell.elevation;
          sumSlope += cell.slope;
          sumMoisture += cell.moisture;
          sumTemperature += cell.temperature;
          count++;
        }
      }
      const avgElevation = count > 0 ? sumElevation / count : 0.5;
      const avgSlope = count > 0 ? sumSlope / count : 0;
      const avgMoisture = count > 0 ? sumMoisture / count : 0.5;
      const avgTemperature = count > 0 ? sumTemperature / count : 0.5;

      const cityRank = inferCityRank(chunk, worldMap);

      sectors[cy][cx] = {
        position: { x: cx, y: cy },
        terrain: chunk.dominantTerrain as StrategicSector['terrain'],
        baseTerrain: convertWorldTerrainToStrategicBaseTerrain(chunk.dominantTerrain),
        features: convertChunkFeaturesToStrategicFeatures(chunk),
        force: null,
        tacticalMapSeed: worldMap.seed + cx * 31 + cy * 131,
        name: getChunkDisplayName(chunk, worldMap, nameIdx++),
        gen: {
          elevation: avgElevation,
          slope: avgSlope,
          moisture: avgMoisture,
          temperature: avgTemperature,
          cityScore: chunk.strategicValue.victoryPoint,
          roadCost: chunk.strategicValue.movement,
          supplyValue: chunk.strategicValue.supply,
          defensiveValue: chunk.strategicValue.defense,
          chokepointValue: chunk.strategicValue.chokepoint,
          cityRank,
          riverWidth: inferRiverWidth(chunk, worldMap),
        },
      };
    }
  }

  return {
    width: chunkCountX,
    height: chunkCountY,
    sectors,
  };
}

export const USE_WORLD_MAP_STRATEGIC_MODE = true;
