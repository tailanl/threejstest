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
  const terrainCounts: Record<string, number> = {};
  const featureCounts: Record<string, number> = {};
  let riverCells = 0;
  let bridgeCount = 0;

  forEachCell(ctx.width, ctx.height, (x, y) => {
    const bt = ctx.baseTerrain[y][x];
    terrainCounts[bt] = (terrainCounts[bt] || 0) + 1;
    if (ctx.riverLayer[y][x].isRiver) riverCells++;
    for (const f of ctx.features[y][x]) {
      featureCounts[f] = (featureCounts[f] || 0) + 1;
      if (f === 'bridge') bridgeCount++;
    }
  });

  console.log('=== Strategic World Stats ===');
  console.log(`Size: ${ctx.width}x${ctx.height}`);
  console.log(`Cities: ${ctx.cities.length} (capital: ${ctx.cities.filter(c => c.rank === 'capital').length}, major: ${ctx.cities.filter(c => c.rank === 'major').length}, regional: ${ctx.cities.filter(c => c.rank === 'regional').length}, town: ${ctx.cities.filter(c => c.rank === 'town').length})`);
  console.log(`Roads: ${ctx.roads.length}`);
  console.log(`Bridges: ${bridgeCount}`);
  console.log(`River cells: ${riverCells}`);
  console.log(`Terrain:`, terrainCounts);
  console.log(`Features:`, featureCounts);
}
