import { StrategicGenContext, GenPosition, forEachCell, getNeighbors8, distance, create2DArray, clamp01 } from './gen-context';
import { StrategicGenConfig } from './strategic-gen-config';

// === Chokepoint Value ===
export function computeChokepointValue(ctx: StrategicGenContext): number[][] {
  const result = create2DArray(ctx.width, ctx.height, () => 0);
  forEachCell(ctx.width, ctx.height, (x, y) => {
    if (ctx.waterMask[y][x]) return;

    // Narrow pass: count passable neighbors vs total land neighbors
    const neighbors = getNeighbors8({ x, y }, ctx.width, ctx.height);
    const passable = neighbors.filter(n => !ctx.waterMask[n.y][n.x] && ctx.baseTerrain[n.y][n.x] !== 'mountain').length;
    const total = neighbors.length;
    const narrowScore = total > 0 ? (1 - passable / total) * 0.5 : 0;

    // Bridge score
    const bridgeScore = ctx.riverLayer[y][x].isRiver ? 0.3 : 0;

    // Road junction score
    let roadCount = 0;
    for (const n of neighbors) {
      if (ctx.features[n.y][n.x].has('main_road') || ctx.features[n.y][n.x].has('secondary_road')) roadCount++;
    }
    const junctionScore = roadCount >= 3 ? 0.4 : roadCount >= 2 ? 0.2 : 0;

    result[y][x] = clamp01(narrowScore + bridgeScore + junctionScore);
  });
  return result;
}

// === Defensive Value ===
export function computeDefensiveValue(ctx: StrategicGenContext): number[][] {
  const result = create2DArray(ctx.width, ctx.height, () => 0);
  forEachCell(ctx.width, ctx.height, (x, y) => {
    if (ctx.waterMask[y][x]) return;

    const terrainDef =
      ctx.baseTerrain[y][x] === 'mountain' ? 0.8 :
      ctx.baseTerrain[y][x] === 'highland' ? 0.5 :
      ctx.baseTerrain[y][x] === 'forest' ? 0.3 : 0;

    const elevationAdv = ctx.elevation[y][x] * 0.3;

    const riverBarrier = ctx.riverLayer[y][x].isRiver ? 0.2 : 0;

    const cityBonus = ctx.features[y][x].has('city') ? 0.3 : 0;
    const fortressBonus = ctx.features[y][x].has('fortress') ? 0.4 : 0;

    result[y][x] = clamp01(terrainDef + elevationAdv + riverBarrier + cityBonus + fortressBonus);
  });
  return result;
}

// === Ports ===
function placePorts(ctx: StrategicGenContext): void {
  for (const city of ctx.cities) {
    if (city.rank === 'town') continue;
    const { x, y } = city.position;
    let distOcean = 999;
    for (let r = 1; r <= 3; r++) {
      for (const n of getNeighbors8({ x, y }, ctx.width, ctx.height)) {
        if (ctx.oceanMask[n.y][n.x]) { distOcean = r; break; }
      }
      if (distOcean <= 3) break;
    }
    if (distOcean <= 2 && ctx.slope[y][x] <= 0.12) {
      ctx.features[y][x].add('port');
    }
  }
}

// === Fortresses ===
function isNearBridge(pos: GenPosition, ctx: StrategicGenContext, radius: number): boolean {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = pos.x + dx, ny = pos.y + dy;
      if (nx >= 0 && nx < ctx.width && ny >= 0 && ny < ctx.height) {
        if (ctx.features[ny][nx].has('bridge')) return true;
      }
    }
  }
  return false;
}

function hasRoadNearby(pos: GenPosition, ctx: StrategicGenContext, radius: number): boolean {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = pos.x + dx, ny = pos.y + dy;
      if (nx >= 0 && nx < ctx.width && ny >= 0 && ny < ctx.height) {
        if (ctx.features[ny][nx].has('main_road') || ctx.features[ny][nx].has('secondary_road')) return true;
      }
    }
  }
  return false;
}

function placeFortresses(ctx: StrategicGenContext, count: number): void {
  const candidates: Array<{ x: number; y: number; score: number }> = [];
  forEachCell(ctx.width, ctx.height, (x, y) => {
    if (ctx.waterMask[y][x]) return;
    if (ctx.features[y][x].has('city')) return;

    const terrain = ctx.baseTerrain[y][x];
    const terrainBonus =
      terrain === 'highland' ? 25 :
      terrain === 'mountain' ? 18 :
      terrain === 'forest' ? 8 : 0;

    const bridgeBonus = isNearBridge({ x, y }, ctx, 3) ? 25 : 0;

    let roadJunctionScore = 0;
    const neighbors = getNeighbors8({ x, y }, ctx.width, ctx.height);
    let roadNeighbors = 0;
    for (const n of neighbors) {
      if (ctx.features[n.y][n.x].has('main_road') || ctx.features[n.y][n.x].has('secondary_road')) roadNeighbors++;
    }
    roadJunctionScore = roadNeighbors >= 3 ? 1 : roadNeighbors >= 2 ? 0.5 : 0;

    const cityOuterBonus = ctx.cities.some(c =>
      Math.abs(c.position.x - x) + Math.abs(c.position.y - y) <= 4 &&
      Math.abs(c.position.x - x) + Math.abs(c.position.y - y) >= 2
    ) ? 18 : 0;

    const score = terrainBonus + bridgeBonus + roadJunctionScore * 25 + cityOuterBonus + ctx.chokepointValue[y][x] * 35;
    if (score > 0) candidates.push({ x, y, score });
  });

  candidates.sort((a, b) => b.score - a.score);

  const minDist = 5;
  const placed: GenPosition[] = [];
  for (const c of candidates) {
    if (placed.length >= count) break;
    if (placed.some(p => Math.abs(p.x - c.x) + Math.abs(p.y - c.y) < minDist)) continue;
    ctx.features[c.y][c.x].add('fortress');
    ctx.supplyValue[c.y][c.x] += 15;
    placed.push({ x: c.x, y: c.y });
  }
}

// === Airfields ===
function distanceToMajorCity(x: number, y: number, ctx: StrategicGenContext): number {
  let minD = 999;
  for (const c of ctx.cities) {
    if (c.rank === 'capital' || c.rank === 'major') {
      minD = Math.min(minD, Math.abs(c.position.x - x) + Math.abs(c.position.y - y));
    }
  }
  return minD;
}

function placeAirfields(ctx: StrategicGenContext, count: number): void {
  const candidates: Array<{ x: number; y: number; score: number }> = [];
  forEachCell(ctx.width, ctx.height, (x, y) => {
    const terrain = ctx.baseTerrain[y][x];
    if (terrain === 'water' || terrain === 'mountain' || terrain === 'marshland') return;
    if (ctx.slope[y][x] > 0.08) return;

    const flatScore = clamp01(1 - ctx.slope[y][x] / 0.08) * 45;
    const nearCityScore = distanceToMajorCity(x, y, ctx) <= 6 ? 30 : 0;
    const roadScore = hasRoadNearby({ x, y }, ctx, 3) ? 20 : 0;

    const score = flatScore + nearCityScore + roadScore;
    if (score > 0) candidates.push({ x, y, score });
  });

  candidates.sort((a, b) => b.score - a.score);

  const minDist = 8;
  const placed: GenPosition[] = [];
  for (const c of candidates) {
    if (placed.length >= count) break;
    if (placed.some(p => Math.abs(p.x - c.x) + Math.abs(p.y - c.y) < minDist)) continue;
    ctx.features[c.y][c.x].add('airfield');
    placed.push({ x: c.x, y: c.y });
  }
}

// === Supply Depots ===
function placeSupplyDepots(ctx: StrategicGenContext, count: number): void {
  const candidates: Array<{ x: number; y: number; score: number }> = [];
  forEachCell(ctx.width, ctx.height, (x, y) => {
    if (ctx.waterMask[y][x]) return;
    if (ctx.features[y][x].has('city')) return;

    const roadBonus = hasRoadNearby({ x, y }, ctx, 2) ? 30 : 0;
    const nearCity = ctx.cities.some(c =>
      Math.abs(c.position.x - x) + Math.abs(c.position.y - y) <= 5
    ) ? 20 : 0;

    const score = roadBonus + nearCity;
    if (score > 0) candidates.push({ x, y, score });
  });

  candidates.sort((a, b) => b.score - a.score);

  const minDist = 6;
  const placed: GenPosition[] = [];
  for (const c of candidates) {
    if (placed.length >= count) break;
    if (placed.some(p => Math.abs(p.x - c.x) + Math.abs(p.y - c.y) < minDist)) continue;
    ctx.features[c.y][c.x].add('supply_depot');
    ctx.supplyValue[c.y][c.x] += 10;
    placed.push({ x: c.x, y: c.y });
  }
}

export function placeFeatures(ctx: StrategicGenContext, config: StrategicGenConfig): void {
  placePorts(ctx);
  placeFortresses(ctx, config.features.fortressCount);
  placeAirfields(ctx, config.features.airfieldCount);
  placeSupplyDepots(ctx, config.features.supplyDepotCount);
}
