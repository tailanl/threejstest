import { StrategicGenContext, GenPosition, create2DArray, forEachCell, getNeighbors8, clamp01 } from './gen-context';
import { StrategicGenConfig } from './strategic-gen-config';

let riverCounter = 0;

function canBeRiverSource(x: number, y: number, ctx: StrategicGenContext): boolean {
  if (ctx.waterMask[y][x]) return false;
  if (isNearMapEdge(x, y, ctx.width, ctx.height, 4)) return false;
  if (ctx.elevation[y][x] < 0.55) return false;
  if (ctx.slope[y][x] < 0.015) return false;
  return true;
}

function isNearMapEdge(x: number, y: number, width: number, height: number, margin: number): boolean {
  return x < margin || x >= width - margin || y < margin || y >= height - margin;
}

function computeRiverSourceScore(x: number, y: number, ctx: StrategicGenContext): number {
  return ctx.elevation[y][x] * 0.45 + ctx.moisture[y][x] * 0.30 + ctx.slope[y][x] * 0.10 + ctx.rng.next() * 0.15;
}

function scoreRiverNextCell(
  from: GenPosition,
  to: GenPosition,
  previousDir: GenPosition | null,
  ctx: StrategicGenContext
): number {
  const fromH = ctx.elevation[from.y][from.x];
  const toH = ctx.elevation[to.y][to.x];
  const heightDrop = fromH - toH;
  const moistureBonus = ctx.moisture[to.y][to.x] * 8;
  const existingRiverBonus = ctx.riverLayer[to.y][to.x].isRiver ? 35 : 0;
  const turnPenalty = previousDir ? computeTurnPenalty(from, to, previousDir) : 0;
  const uphillPenalty = heightDrop < 0 ? Math.abs(heightDrop) * 80 : 0;
  return heightDrop * 100 + moistureBonus + existingRiverBonus - turnPenalty - uphillPenalty;
}

function computeTurnPenalty(from: GenPosition, to: GenPosition, previousDir: GenPosition): number {
  const dx1 = to.x - from.x;
  const dy1 = to.y - from.y;
  const dot = dx1 * previousDir.x + dy1 * previousDir.y;
  const len1 = Math.sqrt(dx1 * dx1 + dy1 * dy1);
  const len2 = Math.sqrt(previousDir.x * previousDir.x + previousDir.y * previousDir.y);
  if (len1 === 0 || len2 === 0) return 0;
  const cos = dot / (len1 * len2);
  return (1 - cos) * 15;
}

function carveOutlet(current: GenPosition, ctx: StrategicGenContext): GenPosition | null {
  const candidates = getNeighbors8(current, ctx.width, ctx.height)
    .filter(p => !ctx.oceanMask[p.y][p.x]);
  if (candidates.length === 0) return null;
  candidates.sort((a, b) => ctx.elevation[a.y][a.x] - ctx.elevation[b.y][b.x]);
  const next = candidates[0];
  ctx.elevation[next.y][next.x] -= 0.035;
  ctx.elevation[current.y][current.x] -= 0.015;
  return next;
}

function traceRiver(source: GenPosition, ctx: StrategicGenContext, config: StrategicGenConfig): GenPosition[] {
  const path: GenPosition[] = [{ ...source }];
  let current = { ...source };
  let previousDir: GenPosition | null = null;
  let stuckCount = 0;

  for (let step = 0; step < config.rivers.maxRiverLength; step++) {
    if (ctx.waterMask[current.y][current.x] || isNearMapEdge(current.x, current.y, ctx.width, ctx.height, 1)) {
      break;
    }

    const neighbors = getNeighbors8(current, ctx.width, ctx.height)
      .filter(p => !ctx.oceanMask[p.y][p.x] || (ctx.oceanMask[p.y][p.x] && path.length > 3));

    if (neighbors.length === 0) break;

    let best: GenPosition | null = null;
    let bestScore = -Infinity;

    for (const n of neighbors) {
      if (path.some(p => p.x === n.x && p.y === n.y)) continue;
      const score = scoreRiverNextCell(current, n, previousDir, ctx);
      if (score > bestScore) {
        bestScore = score;
        best = n;
      }
    }

    if (!best) {
      stuckCount++;
      if (stuckCount > 3) {
        const outlet = carveOutlet(current, ctx);
        if (!outlet) break;
        best = outlet;
      } else {
        break;
      }
    } else {
      stuckCount = 0;
    }

    previousDir = { x: best.x - current.x, y: best.y - current.y };
    path.push(best);
    current = best;

    if (ctx.waterMask[current.y][current.x]) break;
  }

  return path;
}

function writeRiverPath(riverId: string, path: GenPosition[], ctx: StrategicGenContext): void {
  for (let i = 0; i < path.length; i++) {
    const p = path[i];
    const t = i / Math.max(1, path.length - 1);
    const flowAmount = 0.2 + t * 0.8;
    const width = flowAmount > 0.8 ? 3 : flowAmount > 0.5 ? 2 : 1;

    ctx.riverLayer[p.y][p.x] = {
      isRiver: true,
      riverId,
      flowAmount,
      width,
      isMainRiver: path.length >= 24,
    };
    ctx.features[p.y][p.x].add('river');
  }
}

export function generateRiverNetwork(ctx: StrategicGenContext, config: StrategicGenConfig): void {
  const { width, height } = ctx;

  // Score all possible sources
  const sources: Array<{ x: number; y: number; score: number }> = [];
  forEachCell(width, height, (x, y) => {
    if (!canBeRiverSource(x, y, ctx)) return;
    sources.push({ x, y, score: computeRiverSourceScore(x, y, ctx) });
  });

  sources.sort((a, b) => b.score - a.score);

  // Place main rivers
  const minSourceDist = Math.max(6, Math.floor(Math.min(width, height) / (config.rivers.mainRiverCount + 1)));
  const placed: GenPosition[] = [];

  for (const src of sources) {
    if (placed.length >= config.rivers.mainRiverCount) break;

    const tooClose = placed.some(p => Math.abs(p.x - src.x) + Math.abs(p.y - src.y) < minSourceDist);
    if (tooClose) continue;

    const path = traceRiver({ x: src.x, y: src.y }, ctx, config);
    if (path.length < config.rivers.minRiverLength) continue;

    const riverId = `river_${++riverCounter}`;
    writeRiverPath(riverId, path, ctx);
    placed.push({ x: src.x, y: src.y });

    // Tributaries
    if (ctx.rng.next() < config.rivers.tributaryChance) {
      const midIdx = Math.floor(path.length * (0.3 + ctx.rng.next() * 0.4));
      const tribSource = path[midIdx];
      if (tribSource && !ctx.waterMask[tribSource.y][tribSource.x]) {
        const tribPath = traceRiver(tribSource, ctx, config);
        if (tribPath.length >= config.rivers.minRiverLength / 2) {
          writeRiverPath(`${riverId}_trib`, tribPath, ctx);
        }
      }
    }
  }
}
