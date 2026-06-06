import { StrategicGenContext, GenPosition, CityNode, forEachCell, distance } from './gen-context';
import { StrategicGenConfig } from './strategic-gen-config';
import { CityRank, StrategicBaseTerrainType } from '../strategic-types';

const CITY_NAMES = [
  '铁原', '春川', '原州', '大田', '清州', '全州', '光州', '大邱', '釜山', '仁川',
  '水原', '城南市', '高阳', '龙仁', '富川', '安阳', '安山', '浦项', '蔚山', '昌原',
  '天安', '牙山', '瑞山', '群山', '木浦', '丽水', '顺天', '晋州', '统营', '金泉',
  '尚州', '荣州', '安东', '忠州', '堤川', '横城', '洪川', '平昌', '江陵', '束草',
  '东海', '三陟', '太白', '闻庆', '镇川', '阴城', '丹阳', '报恩', '槐山', '沃川',
];

let cityNameIdx = 0;

function cityImportance(rank: CityRank): number {
  switch (rank) {
    case 'capital': return 100;
    case 'major': return 70;
    case 'regional': return 35;
    case 'town': return 12;
  }
}

function getCityRadius(rank: CityRank, rng: () => number): number {
  switch (rank) {
    case 'capital': return 3 + (rng() > 0.5 ? 1 : 0);
    case 'major': return 2 + (rng() > 0.5 ? 1 : 0);
    case 'regional': return 1 + (rng() > 0.5 ? 1 : 0);
    case 'town': return 1;
  }
}

function paintCityArea(city: CityNode, ctx: StrategicGenContext): void {
  const { x: cx, y: cz } = city.position;
  const radius = city.radius;

  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = cx + dx;
      const ny = cz + dy;
      if (nx < 0 || nx >= ctx.width || ny < 0 || ny >= ctx.height) continue;

      if (ctx.waterMask[ny][nx]) continue;
      if (ctx.baseTerrain[ny][nx] === 'mountain' && city.rank !== 'capital') continue;

      const d = Math.sqrt(dx * dx + dy * dy);
      const noise = ctx.rng.next() * 0.45;

      const threshold =
        city.rank === 'capital' ? radius + 0.25 :
        city.rank === 'major' ? radius :
        city.rank === 'regional' ? radius - 0.15 :
        radius - 0.35;

      if (d <= threshold + noise) {
        ctx.baseTerrain[ny][nx] = 'plains'; // city area clears terrain
        ctx.features[ny][nx].add('city');
        if (dx === 0 && dy === 0) {
          ctx.features[ny][nx].add('city_center');
        }
        if (city.rank === 'capital' && d <= 1) {
          ctx.features[ny][nx].add('capital');
        }
      }
    }
  }

  // City outskirts: clean up surrounding terrain
  for (let dy = -(radius + 2); dy <= radius + 2; dy++) {
    for (let dx = -(radius + 2); dx <= radius + 2; dx++) {
      const nx = cx + dx;
      const ny = cz + dy;
      if (nx < 0 || nx >= ctx.width || ny < 0 || ny >= ctx.height) continue;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > radius + 2 || d <= radius) continue;

      const bt = ctx.baseTerrain[ny][nx];
      // Desert near city → plains
      if (bt === 'desert') ctx.baseTerrain[ny][nx] = 'plains';
      // Some marshland near city → plains
      if (bt === 'marshland' && ctx.rng.next() > 0.4) ctx.baseTerrain[ny][nx] = 'plains';
      // Don't let city be completely surrounded by forest
      if (bt === 'forest' && ctx.rng.next() > 0.6) ctx.baseTerrain[ny][nx] = 'plains';
    }
  }
}

function applyCityDistancePenalty(
  cityScore: number[][],
  cityPos: GenPosition,
  radius: number,
  strength: number,
  width: number,
  height: number
): void {
  for (let dy = -radius; dy <= radius; dy++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const nx = cityPos.x + dx;
      const ny = cityPos.y + dy;
      if (nx < 0 || nx >= width || ny < 0 || ny >= height) continue;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d > radius) continue;
      const t = 1 - d / radius;
      cityScore[ny][nx] -= t * strength;
    }
  }
}

function placeCityRank(
  ctx: StrategicGenContext,
  rank: CityRank,
  count: number,
  minDist: number
): void {
  const penaltyRadius =
    rank === 'capital' ? 28 :
    rank === 'major' ? 13 :
    rank === 'regional' ? 7 : 4;
  const penaltyStrength =
    rank === 'capital' ? 110 :
    rank === 'major' ? 80 :
    rank === 'regional' ? 45 : 25;

  for (let i = 0; i < count; i++) {
    let bestX = -1, bestY = -1, bestScore = -Infinity;
    forEachCell(ctx.width, ctx.height, (x, y) => {
      const score = ctx.cityScore[y][x];
      if (score > bestScore) {
        // Check min distance to existing cities
        const tooClose = ctx.cities.some(c =>
          Math.abs(c.position.x - x) + Math.abs(c.position.y - y) < minDist
        );
        if (!tooClose) {
          bestScore = score;
          bestX = x;
          bestY = y;
        }
      }
    });

    if (bestX < 0) continue;

    const city: CityNode = {
      id: `city_${rank}_${i}`,
      name: CITY_NAMES[cityNameIdx++ % CITY_NAMES.length],
      position: { x: bestX, y: bestY },
      rank,
      radius: getCityRadius(rank, () => ctx.rng.next()),
      populationScore: cityImportance(rank),
      supplyValue: rank === 'capital' ? 100 : rank === 'major' ? 70 : rank === 'regional' ? 40 : 18,
      victoryPointValue: cityImportance(rank),
    };

    ctx.cities.push(city);
    paintCityArea(city, ctx);
    ctx.supplyValue[bestY][bestX] += city.supplyValue;

    applyCityDistancePenalty(ctx.cityScore, city.position, penaltyRadius, penaltyStrength, ctx.width, ctx.height);
  }
}

export function placeCities(ctx: StrategicGenContext, config: StrategicGenConfig): void {
  cityNameIdx = 0;
  placeCityRank(ctx, 'capital', config.cities.capitalCount, config.cities.minCapitalDistance);
  placeCityRank(ctx, 'major', config.cities.majorCityCount, config.cities.minMajorDistance);
  placeCityRank(ctx, 'regional', config.cities.regionalCityCount, config.cities.minRegionalDistance);
  placeCityRank(ctx, 'town', config.cities.townCount, config.cities.minTownDistance);
}
