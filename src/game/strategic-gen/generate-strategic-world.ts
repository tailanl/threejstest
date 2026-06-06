import { StrategicGenContext, createStrategicGenContext } from './gen-context';
import { StrategicGenConfig } from './strategic-gen-config';
import { generateStrategicHeightmap, normalizeHeightmap, applyWorldShape, computeSeaLevelByRatio } from './heightmap';
import { computeSlope } from './slope';
import { classifyWaterBodies } from './water';
import { computeInitialMoisture, computeMoisture } from './moisture';
import { computeTemperature } from './temperature';
import { generateRiverNetwork } from './hydrology';
import { classifyBaseTerrains, smoothBaseTerrain } from './terrain-classifier';
import { computeChokepointValue, computeDefensiveValue, placeFeatures } from './feature-placement';
import { computeCityScores } from './city-score';
import { placeCities } from './city-placement';
import { computeRoadCostMap } from './road-cost';
import { buildRoadNetwork } from './road-network';
import { placeBridges } from './bridge-placement';
import { validateAndRepairStrategicWorld, printStrategicWorldStats } from './validation';
import { buildStrategicMap } from './build-strategic-map';
import { StrategicMap } from '../strategic-types';

export function generateStrategicWorld(config: StrategicGenConfig): StrategicMap {
  const ctx = createStrategicGenContext(config);

  // 1. 自然地形基础
  ctx.elevation = generateStrategicHeightmap(ctx, config);
  normalizeHeightmap(ctx.elevation);
  applyWorldShape(ctx.elevation, ctx.width, ctx.height, config.worldShape);
  normalizeHeightmap(ctx.elevation);

  ctx.slope = computeSlope(ctx.elevation);

  const seaLevel = computeSeaLevelByRatio(ctx.elevation, config.terrain.seaRatio);
  classifyWaterBodies(ctx, seaLevel);

  // 2. 水系和气候
  ctx.moisture = computeInitialMoisture(ctx);
  generateRiverNetwork(ctx, config);
  ctx.moisture = computeMoisture(ctx);
  ctx.temperature = computeTemperature(ctx);

  // 3. 自然地形
  ctx.baseTerrain = classifyBaseTerrains(ctx);
  smoothBaseTerrain(ctx, 3);

  // 4. 战略评价层
  ctx.chokepointValue = computeChokepointValue(ctx);
  ctx.defensiveValue = computeDefensiveValue(ctx);

  // 5. 城市
  ctx.cityScore = computeCityScores(ctx);
  placeCities(ctx, config);

  // 6. 道路和桥梁
  ctx.roadCost = computeRoadCostMap(ctx);
  buildRoadNetwork(ctx, config);
  placeBridges(ctx, config);

  // 7. 战略设施
  placeFeatures(ctx, config);

  // 8. 合法性检查和修复
  validateAndRepairStrategicWorld(ctx);

  // Debug stats
  printStrategicWorldStats(ctx);

  // 9. 转成游戏现有 StrategicMap
  return buildStrategicMap(ctx);
}
