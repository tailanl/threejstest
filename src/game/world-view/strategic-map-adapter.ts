/**
 * StrategicChunk → 旧 StrategicMap 适配
 */

import type { StrategicChunk } from './strategic-chunks';
import type { StrategicMap, StrategicSector, StrategicBaseTerrainType, StrategicFeatureType, CityRank } from '../strategic-types';
import type { WorldTerrainType } from '../world-map/world-cell-types';
import type { RegionTile } from '../world-map/world-map-types';
import type { WorldAtlas } from '../world-atlas/atlas-types';

export const USE_WORLD_ATLAS_SYSTEM = true;

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

export function buildStrategicMapFromRegionTile(regionTile: RegionTile): StrategicMap {
  const { strategicChunks } = regionTile;
  const chunkCountX = strategicChunks[0]?.length ?? 0;
  const chunkCountY = strategicChunks.length;

  const sectors: StrategicSector[][] = [];

  for (let cy = 0; cy < chunkCountY; cy++) {
    sectors[cy] = [];
    for (let cx = 0; cx < chunkCountX; cx++) {
      const chunk = strategicChunks[cy]?.[cx];
      if (!chunk) {
        sectors[cy][cx] = {
          position: { x: cx, y: cy },
          terrain: 'plains',
          force: null,
          tacticalMapSeed: 0,
          name: `Sector (${cx},${cy})`,
        };
        continue;
      }

      const features: StrategicFeatureType[] = [];
      if (chunk.features.hasCapital) features.push('capital');
      if (chunk.features.hasCity) features.push('city');
      if (chunk.features.hasRiver) features.push('river');
      if (chunk.features.hasMainRoad) features.push('main_road');
      if (chunk.features.hasBridge) features.push('bridge');
      if (chunk.features.hasFortress) features.push('fortress');
      if (chunk.features.hasAirfield) features.push('airfield');

      let cityRank: CityRank | undefined;
      if (chunk.features.hasCapital) cityRank = 'capital';
      else if (chunk.cityIds.length > 0) {
        const city = regionTile.cities.find(c => c.id === chunk.cityIds[0]);
        if (city) cityRank = city.rank as CityRank;
      }

      sectors[cy][cx] = {
        position: { x: cx, y: cy },
        terrain: chunk.dominantTerrain as StrategicSector['terrain'],
        baseTerrain: convertWorldTerrainToStrategicBaseTerrain(chunk.dominantTerrain),
        features,
        force: null,
        tacticalMapSeed: 0,
        name: chunk.cityIds.length > 0
          ? (regionTile.cities.find(c => c.id === chunk.cityIds[0])?.name ?? `Chunk (${cx},${cy})`)
          : `Sector (${cx},${cy})`,
        gen: {
          elevation: 0.5,
          slope: 0,
          moisture: 0.5,
          temperature: 0.5,
          cityScore: chunk.strategicValue.victoryPoint,
          roadCost: chunk.strategicValue.movement,
          supplyValue: chunk.strategicValue.supply,
          defensiveValue: chunk.strategicValue.defense,
          chokepointValue: chunk.strategicValue.chokepoint,
          cityRank,
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
