import { StrategicGenContext, forEachCell } from './gen-context';
import { StrategicMap, StrategicSector, StrategicTerrainType, StrategicBaseTerrainType, StrategicFeatureType } from '../strategic-types';

function computeDisplayTerrain(
  baseTerrain: StrategicBaseTerrainType,
  features: Set<StrategicFeatureType>
): StrategicTerrainType {
  // City feature takes display priority
  if (features.has('capital') || features.has('city')) return 'city';
  // River does NOT override terrain display - it's a feature overlay
  // Water base terrain stays water
  return baseTerrain;
}

function generateSectorSeed(x: number, y: number): number {
  return ((x * 7919 + y * 104729 + 31337) & 0x7FFFFFFF);
}

function findCityNameAt(x: number, y: number, ctx: StrategicGenContext): string {
  const city = ctx.cities.find(c => c.position.x === x && c.position.y === y);
  if (city) return city.name;

  // Check for features
  const features = ctx.features[y][x];
  if (features.has('fortress')) return '要塞';
  if (features.has('port')) return '港';
  if (features.has('airfield')) return '机场';
  if (features.has('supply_depot')) return '补给站';

  // Default name based on terrain
  const terrainNames: Record<string, string> = {
    plains: '平原',
    forest: '森林',
    mountain: '山地',
    water: '水域',
    desert: '沙漠',
    marshland: '沼泽',
    highland: '高地',
  };
  return terrainNames[ctx.baseTerrain[y][x]] || '未知';
}

export function buildStrategicMap(ctx: StrategicGenContext): StrategicMap {
  const sectors: StrategicSector[][] = [];

  forEachCell(ctx.width, ctx.height, (x, y) => {
    if (x === 0) sectors[y] = [];

    const baseTerrain = ctx.baseTerrain[y][x];
    const features = ctx.features[y][x];
    const terrain = computeDisplayTerrain(baseTerrain, features);

    const cityNode = ctx.cities.find(c => c.position.x === x && c.position.y === y);

    sectors[y][x] = {
      position: { x, y },
      terrain,
      force: null,
      tacticalMapSeed: generateSectorSeed(x, y),
      name: findCityNameAt(x, y, ctx),
      baseTerrain,
      features: Array.from(features),
      gen: {
        elevation: ctx.elevation[y][x],
        slope: ctx.slope[y][x],
        moisture: ctx.moisture[y][x],
        temperature: ctx.temperature[y][x],
        cityScore: ctx.cityScore[y][x],
        roadCost: ctx.roadCost[y][x],
        supplyValue: ctx.supplyValue[y][x],
        defensiveValue: ctx.defensiveValue[y][x],
        chokepointValue: ctx.chokepointValue[y][x],
        riverWidth: ctx.riverLayer[y][x].isRiver ? ctx.riverLayer[y][x].width : undefined,
        cityRank: cityNode?.rank,
      },
    };
  });

  return {
    width: ctx.width,
    height: ctx.height,
    sectors,
  };
}
