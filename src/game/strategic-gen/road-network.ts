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

  // Compute all city pair distances
  const edges: Array<{ i: number; j: number; dist: number; importance: number }> = [];
  for (let i = 0; i < cities.length; i++) {
    for (let j = i + 1; j < cities.length; j++) {
      const d = diagonalDistance(cities[i].position, cities[j].position);
      const imp = cityImportance(cities[i]) + cityImportance(cities[j]);
      edges.push({ i, j, dist: d, importance: imp });
    }
  }
  edges.sort((a, b) => a.dist - b.dist);

  // MST
  const uf = new UnionFind(cities.length);
  const mstEdges: typeof edges = [];
  for (const e of edges) {
    if (uf.union(e.i, e.j)) {
      mstEdges.push(e);
      if (mstEdges.length >= cities.length - 1) break;
    }
  }

  // Extra edges
  const targetEdges = Math.floor(cities.length * (1 + config.roads.extraRoadRatio));
  const extraEdges: typeof edges = [];
  for (const e of edges) {
    if (mstEdges.includes(e)) continue;
    const shortBonus = e.dist < (ctx.width + ctx.height) / 4 ? 1.5 : 1;
    if (ctx.rng.next() < config.roads.extraRoadRatio * shortBonus * 0.5) {
      extraEdges.push(e);
    }
    if (mstEdges.length + extraEdges.length >= targetEdges) break;
  }

  const allEdges = [...mstEdges, ...extraEdges];
  let roadId = 0;

  for (const e of allEdges) {
    const from = cities[e.i];
    const to = cities[e.j];
    const isMain = from.rank !== 'town' && to.rank !== 'town' && e.dist > (ctx.width + ctx.height) / 8;
    const roadType: 'main' | 'secondary' = isMain ? 'main' : 'secondary';

    const result = aStarRoad(from.position, to.position, ctx);
    if (result.path.length < 2) continue;

    const road: RoadEdge = {
      id: `road_${++roadId}`,
      fromCityId: from.id,
      toCityId: to.id,
      path: result.path,
      roadType,
    };

    ctx.roads.push(road);
    writeRoadPath(result.path, roadType, ctx);
  }
}
