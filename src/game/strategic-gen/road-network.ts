import { StrategicGenContext, GenPosition, CityNode, RoadEdge, getNeighbors8, diagonalDistance, create2DArray } from './gen-context';
import { StrategicGenConfig } from './strategic-gen-config';

function cityImportance(city: CityNode): number {
  switch (city.rank) {
    case 'capital': return 100;
    case 'major': return 70;
    case 'regional': return 35;
    case 'town': return 12;
  }
}

// Union-Find for MST
class UnionFind {
  parent: number[];
  rank: number[];
  constructor(n: number) {
    this.parent = Array.from({ length: n }, (_, i) => i);
    this.rank = new Array(n).fill(0);
  }
  find(u: number): number {
    if (this.parent[u] !== u) this.parent[u] = this.find(this.parent[u]);
    return this.parent[u];
  }
  union(a: number, b: number): boolean {
    const ra = this.find(a), rb = this.find(b);
    if (ra === rb) return false;
    if (this.rank[ra] < this.rank[rb]) this.parent[ra] = rb;
    else if (this.rank[ra] > this.rank[rb]) this.parent[rb] = ra;
    else { this.parent[rb] = ra; this.rank[ra]++; }
    return true;
  }
}

interface AStarResult {
  path: GenPosition[];
  cost: number;
}

function aStarRoad(start: GenPosition, goal: GenPosition, ctx: StrategicGenContext): AStarResult {
  const { width, height, roadCost } = ctx;
  const key = (p: GenPosition) => `${p.x},${p.y}`;

  const gScore = new Map<string, number>();
  const fScore = new Map<string, number>();
  const cameFrom = new Map<string, string>();
  const openSet = new Set<string>();

  const sk = key(start);
  gScore.set(sk, 0);
  fScore.set(sk, diagonalDistance(start, goal));
  openSet.add(sk);

  let iter = 0;
  const maxIter = width * height * 2;

  while (openSet.size > 0 && iter < maxIter) {
    iter++;
    let currentKey = '';
    let bestF = Infinity;
    for (const k of openSet) {
      const f = fScore.get(k) ?? Infinity;
      if (f < bestF) { bestF = f; currentKey = k; }
    }

    if (currentKey === key(goal)) {
      const path: GenPosition[] = [];
      let ck: string | undefined = currentKey;
      while (ck && ck !== sk) {
        const [cx, cy] = ck.split(',').map(Number);
        path.unshift({ x: cx, y: cy });
        ck = cameFrom.get(ck);
      }
      path.unshift(start);
      return { path, cost: gScore.get(currentKey) ?? 0 };
    }

    openSet.delete(currentKey);
    const [cx, cy] = currentKey.split(',').map(Number);
    const current: GenPosition = { x: cx, y: cy };

    for (const n of getNeighbors8(current, width, height)) {
      const nk = key(n);
      const moveCost = roadCost[n.y][n.x];
      if (moveCost >= 999) continue;

      const tentativeG = (gScore.get(currentKey) ?? Infinity) + moveCost;
      if (tentativeG < (gScore.get(nk) ?? Infinity)) {
        cameFrom.set(nk, currentKey);
        gScore.set(nk, tentativeG);
        fScore.set(nk, tentativeG + diagonalDistance(n, goal));
        openSet.add(nk);
      }
    }
  }

  // Fallback: straight line
  const path: GenPosition[] = [];
  const dx = goal.x - start.x;
  const dy = goal.y - start.y;
  const steps = Math.max(Math.abs(dx), Math.abs(dy), 1);
  for (let i = 0; i <= steps; i++) {
    path.push({
      x: Math.round(start.x + dx * i / steps),
      y: Math.round(start.y + dy * i / steps),
    });
  }
  return { path, cost: 9999 };
}

function writeRoadPath(path: GenPosition[], roadType: 'main' | 'secondary' | 'military', ctx: StrategicGenContext): void {
  const feature = roadType === 'main' ? 'main_road' : 'secondary_road';
  for (const p of path) {
    if (ctx.oceanMask[p.y][p.x]) continue;
    ctx.features[p.y][p.x].add(feature);
    if (ctx.riverLayer[p.y][p.x].isRiver) {
      ctx.features[p.y][p.x].add('bridge');
    }
  }
}

export function buildRoadNetwork(ctx: StrategicGenContext, config: StrategicGenConfig): void {
  const { cities } = ctx;
  if (cities.length < 2) return;

  const capital = cities.filter(c => c.rank === 'capital');
  const majors = cities.filter(c => c.rank === 'major');
  const regionals = cities.filter(c => c.rank === 'regional');
  const towns = cities.filter(c => c.rank === 'town');

  const roadPairs: Array<{ from: CityNode; to: CityNode; priority: number }> = [];

  // Rule 1: capital connects to all majors
  for (const cap of capital) {
    for (const maj of majors) {
      roadPairs.push({ from: cap, to: maj, priority: 100 });
    }
  }

  // Rule 2: majors are interconnected (MST among majors)
  const majorEdges: Array<{ i: number; j: number; dist: number }> = [];
  for (let i = 0; i < majors.length; i++) {
    for (let j = i + 1; j < majors.length; j++) {
      majorEdges.push({ i, j, dist: diagonalDistance(majors[i].position, majors[j].position) });
    }
  }
  majorEdges.sort((a, b) => a.dist - b.dist);
  const ufMajor = new UnionFind(majors.length);
  for (const e of majorEdges) {
    if (ufMajor.union(e.i, e.j)) {
      roadPairs.push({ from: majors[e.i], to: majors[e.j], priority: 80 });
    }
  }

  // Rule 3: each regional connects to nearest major
  for (const reg of regionals) {
    let nearestMajor: CityNode | null = null;
    let nearestDist = Infinity;
    for (const maj of majors) {
      const d = diagonalDistance(reg.position, maj.position);
      if (d < nearestDist) { nearestDist = d; nearestMajor = maj; }
    }
    if (nearestMajor) {
      roadPairs.push({ from: reg, to: nearestMajor, priority: 60 });
    }
  }

  // Rule 4: each town connects to nearest regional or major
  for (const town of towns) {
    let nearest: CityNode | null = null;
    let nearestDist = Infinity;
    // Prefer regional first
    for (const reg of regionals) {
      const d = diagonalDistance(town.position, reg.position);
      if (d < nearestDist) { nearestDist = d; nearest = reg; }
    }
    for (const maj of majors) {
      const d = diagonalDistance(town.position, maj.position);
      if (d < nearestDist) { nearestDist = d; nearest = maj; }
    }
    if (nearest) {
      roadPairs.push({ from: town, to: nearest, priority: 40 });
    }
  }

  // Extra edges for redundancy
  const allCityPairs: Array<{ from: CityNode; to: CityNode; dist: number }> = [];
  for (let i = 0; i < cities.length; i++) {
    for (let j = i + 1; j < cities.length; j++) {
      allCityPairs.push({ from: cities[i], to: cities[j], dist: diagonalDistance(cities[i].position, cities[j].position) });
    }
  }
  allCityPairs.sort((a, b) => a.dist - b.dist);

  const existingPairs = new Set(roadPairs.map(p => `${p.from.id}-${p.to.id}`));
  for (const pair of allCityPairs) {
    if (existingPairs.has(`${pair.from.id}-${pair.to.id}`) || existingPairs.has(`${pair.to.id}-${pair.from.id}`)) continue;
    const shortBonus = pair.dist < (ctx.width + ctx.height) / 4 ? 1.5 : 1;
    if (ctx.rng.next() < config.roads.extraRoadRatio * shortBonus * 0.3) {
      roadPairs.push({ from: pair.from, to: pair.to, priority: 20 });
    }
    if (roadPairs.length >= cities.length * (1 + config.roads.extraRoadRatio)) break;
  }

  // Build roads via A*
  let roadId = 0;
  for (const pair of roadPairs) {
    const isMain = pair.priority >= 60;
    const roadType: 'main' | 'secondary' = isMain ? 'main' : 'secondary';

    const result = aStarRoad(pair.from.position, pair.to.position, ctx);
    if (result.path.length < 2) continue;

    const road: RoadEdge = {
      id: `road_${++roadId}`,
      fromCityId: pair.from.id,
      toCityId: pair.to.id,
      path: result.path,
      roadType,
    };

    ctx.roads.push(road);
    writeRoadPath(result.path, roadType, ctx);
  }
}
