import { StrategicGenContext, GenPosition, forEachCell, getNeighbors8, distance } from './gen-context';
import { StrategicGenConfig } from './strategic-gen-config';
import { CityRank } from '../strategic-types';

function moveCityToNearestValidCell(ctx: StrategicGenContext, cityIdx: number): void {
  const city = ctx.cities[cityIdx];
  const { x, y } = city.position;
  let bestDist = Infinity;
  let bestPos: GenPosition = { x, y };

  for (let r = 1; r <= 10; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || nx >= ctx.width || ny < 0 || ny >= ctx.height) continue;
        if (ctx.waterMask[ny][nx]) continue;
        if (ctx.baseTerrain[ny][nx] === 'mountain') continue;
        if (ctx.slope[ny][nx] > 0.20) continue;
        const d = Math.abs(dx) + Math.abs(dy);
        if (d < bestDist) {
          bestDist = d;
          bestPos = { x: nx, y: ny };
        }
      }
    }
    if (bestDist < Infinity) break;
  }

  // Update city position
  ctx.features[y][x].delete('city');
  ctx.features[y][x].delete('capital');
  city.position = bestPos;
  ctx.features[bestPos.y][bestPos.x].add('city');
  if (city.rank === 'capital') ctx.features[bestPos.y][bestPos.x].add('capital');
}

function validateCities(ctx: StrategicGenContext): void {
  for (let i = 0; i < ctx.cities.length; i++) {
    const { x, y } = ctx.cities[i].position;
    if (ctx.waterMask[y][x] || ctx.baseTerrain[y][x] === 'mountain' || ctx.slope[y][x] > 0.2) {
      moveCityToNearestValidCell(ctx, i);
    }
  }
}

function validateRoadConnectivity(ctx: StrategicGenContext): void {
  // Check if all important cities are connected via roads
  const importantCities = ctx.cities.filter(c =>
    c.rank === 'capital' || c.rank === 'major' || c.rank === 'regional'
  );
  if (importantCities.length <= 1) return;

  // Build adjacency from roads
  const cityById = new Map(ctx.cities.map(c => [c.id, c]));
  const adj = new Map<string, Set<string>>();
  for (const city of ctx.cities) {
    adj.set(city.id, new Set());
  }
  for (const road of ctx.roads) {
    adj.get(road.fromCityId)?.add(road.toCityId);
    adj.get(road.toCityId)?.add(road.fromCityId);
  }

  // BFS from first important city
  const visited = new Set<string>();
  const queue = [importantCities[0].id];
  visited.add(importantCities[0].id);
  while (queue.length > 0) {
    const cur = queue.shift()!;
    for (const nb of (adj.get(cur) || [])) {
      if (!visited.has(nb)) {
        visited.add(nb);
        queue.push(nb);
      }
    }
  }

  // If some important cities not connected, add direct roads
  for (const city of importantCities) {
    if (visited.has(city.id)) continue;
    // Find nearest connected city
    let nearestConnected: string | null = null;
    let nearestDist = Infinity;
    for (const vid of visited) {
      const vc = cityById.get(vid);
      if (!vc) continue;
      const d = Math.abs(vc.position.x - city.position.x) + Math.abs(vc.position.y - city.position.y);
      if (d < nearestDist) { nearestDist = d; nearestConnected = vid; }
    }
    if (nearestConnected) {
      visited.add(city.id);
      adj.get(city.id)?.add(nearestConnected);
      adj.get(nearestConnected)?.add(city.id);
    }
  }
}

function validateBridges(ctx: StrategicGenContext): void {
  forEachCell(ctx.width, ctx.height, (x, y) => {
    if (!ctx.features[y][x].has('bridge')) return;
    const hasRiver = ctx.riverLayer[y][x].isRiver;
    const hasRoad = ctx.features[y][x].has('main_road') || ctx.features[y][x].has('secondary_road');
    if (!hasRiver || !hasRoad) {
      ctx.features[y][x].delete('bridge');
    }
  });
}

function validateRoadsDoNotCrossWater(ctx: StrategicGenContext): void {
  for (const road of ctx.roads) {
    const cleanPath: GenPosition[] = [];
    for (const p of road.path) {
      if (ctx.oceanMask[p.y][p.x]) {
        // Skip ocean cells - road rerouted around
        continue;
      }
      cleanPath.push(p);
    }
    if (cleanPath.length >= 2) {
      road.path = cleanPath;
    }
  }
}

export function validateAndRepairStrategicWorld(ctx: StrategicGenContext): void {
  validateCities(ctx);
  validateRoadConnectivity(ctx);
  validateBridges(ctx);
  validateRoadsDoNotCrossWater(ctx);
}

export function printStrategicWorldStats(ctx: StrategicGenContext): void {
  const total = ctx.width * ctx.height;
  const terrainCounts: Record<string, number> = {};
  const featureCounts: Record<string, number> = {};
  let riverCells = 0;
  let bridgeCount = 0;
  let cityTileCount = 0;

  forEachCell(ctx.width, ctx.height, (x, y) => {
    const bt = ctx.baseTerrain[y][x];
    terrainCounts[bt] = (terrainCounts[bt] || 0) + 1;
    if (ctx.riverLayer[y][x].isRiver) riverCells++;
    const isCity = ctx.features[y][x].has('city') || ctx.features[y][x].has('capital');
    if (isCity) cityTileCount++;
    for (const f of ctx.features[y][x]) {
      featureCounts[f] = (featureCounts[f] || 0) + 1;
      if (f === 'bridge') bridgeCount++;
    }
  });

  // City area stats
  const capitalTiles = ctx.cities.filter(c => c.rank === 'capital')
    .reduce((sum, c) => sum + Math.PI * c.radius * c.radius, 0);
  const majorTiles = ctx.cities.filter(c => c.rank === 'major');
  const majorAvgTiles = majorTiles.length > 0
    ? majorTiles.reduce((sum, c) => sum + Math.PI * c.radius * c.radius, 0) / majorTiles.length
    : 0;

  const desertRatio = (terrainCounts['desert'] || 0) / total;

  console.log('=== Strategic World Stats ===');
  console.log(`Size: ${ctx.width}x${ctx.height} (${total} cells)`);
  console.log(`Cities: ${ctx.cities.length} (capital: ${ctx.cities.filter(c => c.rank === 'capital').length}, major: ${ctx.cities.filter(c => c.rank === 'major').length}, regional: ${ctx.cities.filter(c => c.rank === 'regional').length}, town: ${ctx.cities.filter(c => c.rank === 'town').length})`);
  console.log(`Roads: ${ctx.roads.length}`);
  console.log(`Bridges: ${bridgeCount}`);
  console.log(`River cells: ${riverCells}`);
  console.log(`City tile count: ${cityTileCount}`);
  console.log(`Capital tile count: ~${Math.round(capitalTiles)}`);
  console.log(`Major avg tile count: ~${Math.round(majorAvgTiles)}`);
  console.log(`Terrain:`, Object.fromEntries(Object.entries(terrainCounts).map(([k, v]) => [k, `${v} (${(v / total * 100).toFixed(1)}%)`])));
  console.log(`Features:`, featureCounts);

  // Warnings
  if (desertRatio > 0.06) {
    console.warn(`⚠️ WARNING: desertRatio = ${(desertRatio * 100).toFixed(1)}% > 6%`);
  }

  // Validation summary
  const capitalOnWater = ctx.cities.filter(c => c.rank === 'capital').some(c => ctx.waterMask[c.position.y][c.position.x]);
  const capitalOnMountain = ctx.cities.filter(c => c.rank === 'capital').some(c => ctx.baseTerrain[c.position.y][c.position.x] === 'mountain');
  const majorOnWater = ctx.cities.filter(c => c.rank === 'major').some(c => ctx.waterMask[c.position.y][c.position.x]);

  console.log(`\n=== Validation ===`);
  console.log(`desertRatio: ${(desertRatio * 100).toFixed(1)}% ${desertRatio <= 0.04 ? '✅' : desertRatio <= 0.06 ? '⚠️' : '❌'}`);
  console.log(`cityTileCount: ${cityTileCount} ${cityTileCount >= 60 ? '✅' : '❌'}`);
  console.log(`capitalTileCount: ~${Math.round(capitalTiles)} ${capitalTiles >= 25 ? '✅' : '❌'}`);
  console.log(`majorAvgTileCount: ~${Math.round(majorAvgTiles)} ${majorAvgTiles >= 9 ? '✅' : '❌'}`);
  console.log(`Capital on water: ${capitalOnWater ? '❌' : '✅'}`);
  console.log(`Capital on mountain: ${capitalOnMountain ? '❌' : '✅'}`);
  console.log(`Major on water: ${majorOnWater ? '❌' : '✅'}`);

  // Check capital-major road connectivity
  const capitalIds = new Set(ctx.cities.filter(c => c.rank === 'capital').map(c => c.id));
  const majorIds = new Set(ctx.cities.filter(c => c.rank === 'major').map(c => c.id));
  const connectedToCapital = new Set<string>();
  for (const road of ctx.roads) {
    if (capitalIds.has(road.fromCityId)) connectedToCapital.add(road.toCityId);
    if (capitalIds.has(road.toCityId)) connectedToCapital.add(road.fromCityId);
  }
  const allMajorsConnected = [...majorIds].every(id => connectedToCapital.has(id));
  console.log(`Capital-Major road connected: ${allMajorsConnected ? '✅' : '❌'}`);

  // Check bridges are valid (road + river)
  let invalidBridges = 0;
  forEachCell(ctx.width, ctx.height, (x, y) => {
    if (ctx.features[y][x].has('bridge')) {
      const hasRoad = ctx.features[y][x].has('main_road') || ctx.features[y][x].has('secondary_road');
      const hasRiver = ctx.riverLayer[y][x].isRiver;
      if (!hasRoad || !hasRiver) invalidBridges++;
    }
  });
  console.log(`Bridges all valid: ${invalidBridges === 0 ? '✅' : `❌ (${invalidBridges} invalid)`}`);
}
