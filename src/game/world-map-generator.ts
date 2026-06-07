/** @deprecated Use directory equivalents under src/game/world-map/ and src/game/world-view/ instead */
/**
 * WorldMap 主生成器
 *
 * 核心原则：只生成一张真实地图。战略、战役、战术只是这张地图的不同缩放和裁剪视图。
 */

import type { WorldMap } from './world-map-types';
import type { WorldMapGenConfig } from './world-map-config';
import { createWorldGenContext, generateHeightmap, computeSlope, classifyWater, computeMoisture, computeTemperature, classifyBaseTerrain, computeMovementAndDefense } from './world-map-terrain';
import { generateRivers } from './world-map-hydrology';
import { placeCities } from './world-map-cities';
import { buildRoadNetwork } from './world-map-roads';
import { placeFortresses, placeAirfields, placeSupplyDepots } from './world-map-features';
import { buildStrategicChunks } from './world-map-chunks';

export function generateWorldMap(config: WorldMapGenConfig): WorldMap {
  console.time('[WorldMap] Total generation');
  const ctx = createWorldGenContext(config);

  // Phase 1: 高度图
  console.time('[WorldMap] Heightmap');
  generateHeightmap(ctx);
  console.timeEnd('[WorldMap] Heightmap');

  // Phase 2: 坡度
  console.time('[WorldMap] Slope');
  computeSlope(ctx);
  console.timeEnd('[WorldMap] Slope');

  // Phase 3: 水域分类
  console.time('[WorldMap] Water');
  classifyWater(ctx);
  console.timeEnd('[WorldMap] Water');

  // Phase 4: 河流
  console.time('[WorldMap] Rivers');
  generateRivers(ctx);
  console.timeEnd('[WorldMap] Rivers');

  // Phase 5: 湿度
  console.time('[WorldMap] Moisture');
  computeMoisture(ctx);
  console.timeEnd('[WorldMap] Moisture');

  // Phase 6: 温度
  console.time('[WorldMap] Temperature');
  computeTemperature(ctx);
  console.timeEnd('[WorldMap] Temperature');

  // Phase 7: 地形分类
  console.time('[WorldMap] Terrain classification');
  classifyBaseTerrain(ctx);
  console.timeEnd('[WorldMap] Terrain classification');

  // Phase 8: 城市
  console.time('[WorldMap] Cities');
  placeCities(ctx);
  console.timeEnd('[WorldMap] Cities');

  // Phase 9: 道路
  console.time('[WorldMap] Roads');
  buildRoadNetwork(ctx);
  console.timeEnd('[WorldMap] Roads');

  // Phase 10: 要塞、机场、补给点
  console.time('[WorldMap] Features');
  placeFortresses(ctx);
  placeAirfields(ctx);
  placeSupplyDepots(ctx);
  console.timeEnd('[WorldMap] Features');

  // Phase 11: 移动和防御
  console.time('[WorldMap] Movement & Defense');
  computeMovementAndDefense(ctx);
  console.timeEnd('[WorldMap] Movement & Defense');

  // Build WorldMap
  const worldMap: WorldMap = {
    id: `world_${config.seed}_${config.width}x${config.height}`,
    seed: config.seed,
    width: config.width,
    height: config.height,
    chunkSize: config.chunkSize,
    cells: ctx.cells,
    chunks: [],
    cities: ctx.cities,
    roads: ctx.roads,
    rivers: ctx.rivers,
    metadata: {
      generatedAt: Date.now(),
      generatorVersion: '1.0.0',
    },
  };

  // Phase 12: StrategicChunks
  console.time('[WorldMap] Strategic chunks');
  worldMap.chunks = buildStrategicChunks(worldMap);
  console.timeEnd('[WorldMap] Strategic chunks');

  // Validation & debug output
  validateWorldMap(worldMap);

  console.timeEnd('[WorldMap] Total generation');
  return worldMap;
}

function validateWorldMap(worldMap: WorldMap): void {
  const { width, height, cells, chunks, cities, roads, rivers, chunkSize } = worldMap;

  console.log('=== WorldMap Generation Report ===');
  console.log(`Size: ${width}×${height}, ChunkSize: ${chunkSize}`);
  console.log(`Chunks: ${chunks.length}×${chunks[0]?.length ?? 0}`);

  // Terrain counts
  const terrainCounts: Record<string, number> = {};
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const t = cells[y][x].baseTerrain;
      terrainCounts[t] = (terrainCounts[t] || 0) + 1;
    }
  }
  const total = width * height;
  console.log('Terrain:');
  for (const [k, v] of Object.entries(terrainCounts).sort((a, b) => b[1] - a[1])) {
    console.log(`  ${k}: ${v} (${(v / total * 100).toFixed(1)}%)`);
  }

  // Cities
  const capitalCities = cities.filter(c => c.rank === 'capital');
  const majorCities = cities.filter(c => c.rank === 'major');
  const regionalCities = cities.filter(c => c.rank === 'regional');
  const townCities = cities.filter(c => c.rank === 'town');

  console.log('Cities:');
  console.log(`  Capital: ${capitalCities.length}`);
  console.log(`  Major: ${majorCities.length}`);
  console.log(`  Regional: ${regionalCities.length}`);
  console.log(`  Town: ${townCities.length}`);

  // City cell counts
  let cityCellCount = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (cells[y][x].baseTerrain === 'city') cityCellCount++;
    }
  }
  console.log(`  Total city cells: ${cityCellCount}`);

  // Roads
  let mainRoadCells = 0;
  let secondaryRoadCells = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (cells[y][x].features.includes('main_road')) mainRoadCells++;
      if (cells[y][x].features.includes('secondary_road')) secondaryRoadCells++;
    }
  }
  console.log('Roads:');
  console.log(`  Road segments: ${roads.length}`);
  console.log(`  Main road cells: ${mainRoadCells}`);
  console.log(`  Secondary road cells: ${secondaryRoadCells}`);

  // Rivers
  const mainRivers = rivers.filter(r => r.type === 'main');
  const tributaries = rivers.filter(r => r.type === 'tributary');
  let riverCellCount = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (cells[y][x].features.includes('river')) riverCellCount++;
    }
  }
  console.log('Rivers:');
  console.log(`  Main rivers: ${mainRivers.length}`);
  console.log(`  Tributaries: ${tributaries.length}`);
  console.log(`  River cells: ${riverCellCount}`);

  // Bridges
  let bridgeCount = 0;
  let invalidBridges = 0;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (cells[y][x].features.includes('bridge')) {
        bridgeCount++;
        const hasRoad = cells[y][x].features.includes('main_road') || cells[y][x].features.includes('secondary_road');
        const hasRiver = cells[y][x].features.includes('river');
        if (!hasRoad || !hasRiver) invalidBridges++;
      }
    }
  }
  console.log('Bridges:');
  console.log(`  Bridge count: ${bridgeCount}`);
  console.log(`  Invalid bridges: ${invalidBridges}`);

  // Warnings
  if (capitalCities.length < 1) console.warn('[WorldMap] WARNING: No capital city');
  if (majorCities.length < 6) console.warn('[WorldMap] WARNING: Less than 6 major cities');
  if (mainRivers.length < 5) console.warn('[WorldMap] WARNING: Less than 5 main rivers');
  if (invalidBridges > 0) console.warn('[WorldMap] WARNING: Invalid bridges found');
  if ((terrainCounts['desert'] || 0) / total > 0.04) console.warn('[WorldMap] WARNING: Desert ratio exceeds 4%');

  console.log('=== End Report ===');
}
