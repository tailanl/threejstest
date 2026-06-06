import { StrategicGenContext, GenPosition, CityNode, forEachCell, distance } from './gen-context';
import { StrategicGenConfig } from './strategic-gen-config';
import { CityRank } from '../strategic-types';

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
      populationScore: cityImportance(rank),
      supplyValue: rank === 'capital' ? 100 : rank === 'major' ? 70 : rank === 'regional' ? 40 : 18,
      victoryPointValue: cityImportance(rank),
    };

    ctx.cities.push(city);
    ctx.features[bestY][bestX].add('city');
    if (rank === 'capital') ctx.features[bestY][bestX].add('capital');
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
