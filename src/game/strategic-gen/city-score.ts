import { StrategicGenContext, GenPosition, forEachCell, clamp01 } from './gen-context';

function distanceToRiver(x: number, y: number, ctx: StrategicGenContext): number {
  if (ctx.riverLayer[y][x].isRiver) return 0;
  for (let r = 1; r <= 12; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < ctx.width && ny >= 0 && ny < ctx.height) {
          if (ctx.riverLayer[ny][nx].isRiver) return r;
        }
      }
    }
  }
  return 999;
}

function distanceToOcean(x: number, y: number, ctx: StrategicGenContext): number {
  if (ctx.oceanMask[y][x]) return 0;
  for (let r = 1; r <= 12; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < ctx.width && ny >= 0 && ny < ctx.height) {
          if (ctx.oceanMask[ny][nx]) return r;
        }
      }
    }
  }
  return 999;
}

function distanceToLake(x: number, y: number, ctx: StrategicGenContext): number {
  if (ctx.lakeMask[y][x]) return 0;
  for (let r = 1; r <= 8; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
        const nx = x + dx, ny = y + dy;
        if (nx >= 0 && nx < ctx.width && ny >= 0 && ny < ctx.height) {
          if (ctx.lakeMask[ny][nx]) return r;
        }
      }
    }
  }
  return 999;
}

function computeCentralityScore(x: number, y: number, ctx: StrategicGenContext): number {
  const cx = ctx.width / 2;
  const cy = ctx.height / 2;
  const maxDist = Math.sqrt(cx * cx + cy * cy);
  return 1 - Math.sqrt((x - cx) ** 2 + (y - cy) ** 2) / maxDist;
}

function computeCityScoreAt(x: number, y: number, ctx: StrategicGenContext): number {
  const terrain = ctx.baseTerrain[y][x];
  if (terrain === 'water') return -999;
  if (terrain === 'mountain') return -300;

  const slope = ctx.slope[y][x];
  if (slope > 0.20) return -200;

  const distRiver = distanceToRiver(x, y, ctx);
  const distOcean = distanceToOcean(x, y, ctx);
  const distLake = distanceToLake(x, y, ctx);

  const flatScore = clamp01(1 - slope / 0.18) * 35;

  const riverScore =
    distRiver === 0 ? -50 :
    distRiver <= 2 ? 30 :
    distRiver <= 5 ? 18 :
    distRiver <= 9 ? 8 : 0;

  const coastScore =
    distOcean === 0 ? -999 :
    distOcean <= 2 ? 22 :
    distOcean <= 5 ? 12 : 0;

  const lakeScore = distLake <= 3 ? 10 : 0;

  const terrainScore =
    terrain === 'plains' ? 30 :
    terrain === 'highland' ? 10 :
    terrain === 'forest' ? -6 :
    terrain === 'marshland' ? -35 :
    terrain === 'desert' ? -18 : 0;

  const centralityScore = computeCentralityScore(x, y, ctx) * 12;
  const chokepointScore = ctx.chokepointValue[y][x] * 10;

  return flatScore + riverScore + coastScore + lakeScore + terrainScore + centralityScore + chokepointScore;
}

export function computeCityScores(ctx: StrategicGenContext): number[][] {
  const scores: number[][] = [];
  for (let y = 0; y < ctx.height; y++) {
    scores[y] = [];
    for (let x = 0; x < ctx.width; x++) {
      scores[y][x] = computeCityScoreAt(x, y, ctx);
    }
  }
  return scores;
}
