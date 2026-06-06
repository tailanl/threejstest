/**
 * 战术地图从详细地图生成 - 桥接模块
 *
 * DetailMap / OperationMap → GameMap
 */

import type { TerrainType, TacticalFeatureType, Position, MapCell, GameMap, CapturePoint } from './types';
import type { DetailMap, DetailMapCell } from './detail-map-types';

// ─── 配置 ───────────────────────────────────────────────

export type BattleType =
  | 'encounter'
  | 'urban_assault'
  | 'bridge_crossing'
  | 'hill_assault'
  | 'forest_fight'
  | 'road_ambush'
  | 'fortress_assault'
  | 'open_field';

export type AttackerDirection = 'west' | 'east' | 'north' | 'south';

export interface TacticalFromDetailConfig {
  width: number;
  height: number;
  center: { x: number; z: number };
  radius?: number;
  attackerDirection: AttackerDirection;
  battleType: BattleType;
  seed: number;
  preserveRoads: boolean;
  preserveRivers: boolean;
  preserveUrban: boolean;
  preserveElevation: boolean;
}

export const DEFAULT_TACTICAL_FROM_DETAIL_CONFIG: TacticalFromDetailConfig = {
  width: 16,
  height: 12,
  center: { x: 0, z: 0 },
  attackerDirection: 'west',
  battleType: 'encounter',
  seed: 20260606,
  preserveRoads: true,
  preserveRivers: true,
  preserveUrban: true,
  preserveElevation: true,
};

// ─── Seeded RNG ─────────────────────────────────────────

function createRNG(seed: number) {
  let s = seed | 0;
  return {
    next(): number {
      s = (s * 1664525 + 1013904223) | 0;
      return (s >>> 0) / 4294967296;
    },
  };
}

// ─── 地形合成优先级 ──────────────────────────────────────

function resolveTacticalTerrain(detailCell: DetailMapCell): TerrainType {
  const features = detailCell.features ?? [];

  if (features.includes('bridge')) {
    return 'bridge';
  }

  if (
    features.includes('city_center') ||
    features.includes('urban_block') ||
    features.includes('industrial')
  ) {
    return 'city';
  }

  if (detailCell.terrain === 'city') {
    return 'city';
  }

  if (features.includes('river')) {
    return detailCell.terrain === 'water' ? 'water' : detailCell.terrain;
  }

  if (features.includes('main_road') || features.includes('secondary_road')) {
    if (detailCell.terrain === 'water') return 'bridge';
    return 'road';
  }

  return detailCell.terrain;
}

// ─── DetailMapCell → MapCell 转换 ────────────────────────

function convertDetailCellToMapCell(
  detailCell: DetailMapCell,
  tacticalX: number,
  tacticalZ: number,
  config: TacticalFromDetailConfig,
): MapCell {
  const terrain = resolveTacticalTerrain(detailCell);
  const features = [...detailCell.features];

  // checkpoint / supply_point → fortress
  if (features.includes('checkpoint') || features.includes('supply_point')) {
    return {
      position: { x: tacticalX, z: tacticalZ },
      terrain: 'fortress',
      unit: null,
      fortified: false,
      capturePointId: null,
      isRoad: detailCell.isRoad,
      roadType: detailCell.roadType,
      features,
    };
  }

  // suburb → city or plains
  if (features.includes('suburb')) {
    const resolvedTerrain: TerrainType = detailCell.terrain === 'city' ? 'city' : 'plains';
    return {
      position: { x: tacticalX, z: tacticalZ },
      terrain: resolvedTerrain,
      unit: null,
      fortified: false,
      capturePointId: null,
      isRoad: detailCell.isRoad,
      roadType: detailCell.roadType,
      features,
    };
  }

  // hill → mountain or plains
  if (features.includes('hill')) {
    const resolvedTerrain: TerrainType = terrain === 'mountain' ? 'mountain' : 'plains';
    return {
      position: { x: tacticalX, z: tacticalZ },
      terrain: resolvedTerrain,
      unit: null,
      fortified: false,
      capturePointId: null,
      isRoad: detailCell.isRoad,
      roadType: detailCell.roadType,
      features,
    };
  }

  return {
    position: { x: tacticalX, z: tacticalZ },
    terrain,
    unit: null,
    fortified: false,
    capturePointId: null,
    isRoad: detailCell.isRoad,
    roadType: detailCell.roadType,
    features,
  };
}

// ─── 坐标裁剪 ───────────────────────────────────────────

function cropDetailMap(
  detailMap: DetailMap,
  center: { x: number; z: number },
  width: number,
  height: number,
): DetailMapCell[][] {
  const startX = center.x - Math.floor(width / 2);
  const startZ = center.z - Math.floor(height / 2);
  const result: DetailMapCell[][] = [];

  for (let tz = 0; tz < height; tz++) {
    result[tz] = [];
    for (let tx = 0; tx < width; tx++) {
      const dx = startX + tx;
      const dz = startZ + tz;

      // clamp to detail map bounds
      const cx = Math.max(0, Math.min(detailMap.width - 1, dx));
      const cz = Math.max(0, Math.min(detailMap.height - 1, dz));

      result[tz][tx] = detailMap.cells[cz][cx];
    }
  }

  return result;
}

// ─── 按战斗类型强化战术图 ────────────────────────────────

function applyBattleTypeModifications(
  cells: MapCell[][],
  battleType: BattleType,
  rng: ReturnType<typeof createRNG>,
  config: TacticalFromDetailConfig,
): void {
  const h = cells.length;
  const w = cells[0]?.length ?? 0;

  switch (battleType) {
    case 'encounter': {
      // 清理过多障碍，中心保持可通行
      for (let z = 0; z < h; z++) {
        for (let x = 0; x < w; x++) {
          const cell = cells[z][x];
          const cx = Math.abs(x - w / 2);
          const cz = Math.abs(z - h / 2);
          const dist = Math.sqrt(cx * cx + cz * cz);
          // 中心区域清理山地
          if (dist < 3 && cell.terrain === 'mountain' && rng.next() < 0.6) {
            cell.terrain = 'plains';
          }
          // 清理过多森林
          if (cell.terrain === 'forest' && rng.next() < 0.15) {
            cell.terrain = 'plains';
          }
        }
      }
      break;
    }

    case 'urban_assault': {
      // 中心40%区域加强city
      const margin = 0.3;
      for (let z = Math.floor(h * margin); z < Math.ceil(h * (1 - margin)); z++) {
        for (let x = Math.floor(w * margin); x < Math.ceil(w * (1 - margin)); x++) {
          const cell = cells[z][x];
          if (cell.terrain === 'plains' && rng.next() < 0.35) {
            cell.terrain = 'city';
            if (!cell.features) cell.features = [];
            if (!cell.features.includes('urban_block')) cell.features.push('urban_block');
          }
        }
      }
      // 边缘保持至少一侧开阔（进攻方部署区）
      const dir = config.attackerDirection;
      if (dir === 'west') {
        for (let z = 0; z < h; z++) for (let x = 0; x < 3; x++) {
          if (cells[z][x].terrain === 'city' || cells[z][x].terrain === 'mountain') {
            cells[z][x].terrain = 'plains';
          }
        }
      } else if (dir === 'east') {
        for (let z = 0; z < h; z++) for (let x = w - 3; x < w; x++) {
          if (cells[z][x].terrain === 'city' || cells[z][x].terrain === 'mountain') {
            cells[z][x].terrain = 'plains';
          }
        }
      } else if (dir === 'north') {
        for (let z = 0; z < 3; z++) for (let x = 0; x < w; x++) {
          if (cells[z][x].terrain === 'city' || cells[z][x].terrain === 'mountain') {
            cells[z][x].terrain = 'plains';
          }
        }
      } else {
        for (let z = h - 3; z < h; z++) for (let x = 0; x < w; x++) {
          if (cells[z][x].terrain === 'city' || cells[z][x].terrain === 'mountain') {
            cells[z][x].terrain = 'plains';
          }
        }
      }
      break;
    }

    case 'bridge_crossing': {
      // 确保有river横切
      let hasRiver = false;
      for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
        if (cells[z][x].terrain === 'water' || cells[z][x].features?.includes('river')) {
          hasRiver = true;
        }
      }
      if (!hasRiver) {
        // 从detailMap中延伸river：在中部画一条横向河流
        const rz = Math.floor(h / 2);
        for (let x = 0; x < w; x++) {
          const cell = cells[rz]?.[x];
          if (!cell) continue;
          cell.terrain = 'water';
          if (!cell.features) cell.features = [];
          if (!cell.features.includes('river')) cell.features.push('river');
        }
      }
      // 确保至少1个bridge
      let hasBridge = false;
      for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
        if (cells[z]?.[x]?.terrain === 'bridge') hasBridge = true;
      }
      if (!hasBridge) {
        // 在road+river交叉处或中间水域处放桥
        const midX = Math.floor(w / 2);
        for (let z = 0; z < h; z++) {
          const cell = cells[z]?.[midX];
          if (!cell) continue;
          if (cell.terrain === 'water' || cell.features?.includes('river')) {
            cell.terrain = 'bridge';
            if (!cell.features) cell.features = [];
            if (!cell.features.includes('bridge')) cell.features.push('bridge');
            hasBridge = true;
            break;
          }
        }
      }
      break;
    }

    case 'hill_assault': {
      // 中心保留mountain/highland，打通至少一条上山道路
      for (let z = Math.floor(h * 0.3); z < Math.ceil(h * 0.7); z++) {
        for (let x = Math.floor(w * 0.3); x < Math.ceil(w * 0.7); x++) {
          if (cells[z][x].terrain === 'plains' && rng.next() < 0.25) {
            cells[z][x].terrain = 'mountain';
          }
        }
      }
      // 打通一条上山通道
      const pathX = Math.floor(w / 2);
      for (let z = 0; z < h; z++) {
        if (cells[z][pathX].terrain === 'mountain' && rng.next() < 0.4) {
          cells[z][pathX].terrain = 'road';
          cells[z][pathX].isRoad = true;
          cells[z][pathX].roadType = 'main';
        }
      }
      break;
    }

    case 'forest_fight': {
      // 森林比例35%~55%，清理一条主通道
      let forestCount = 0;
      const total = w * h;
      for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
        if (cells[z][x].terrain === 'forest') forestCount++;
      }
      const forestRatio = forestCount / total;
      if (forestRatio < 0.35) {
        // 补充森林
        for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
          if (cells[z][x].terrain === 'plains' && rng.next() < 0.25) {
            cells[z][x].terrain = 'forest';
          }
        }
      } else if (forestRatio > 0.55) {
        // 减少森林
        for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
          if (cells[z][x].terrain === 'forest' && rng.next() < 0.2) {
            cells[z][x].terrain = 'plains';
          }
        }
      }
      // 清理一条主通道
      const channelX = Math.floor(w / 2);
      for (let z = 0; z < h; z++) {
        if (cells[z][channelX].terrain === 'forest') {
          cells[z][channelX].terrain = 'plains';
        }
      }
      break;
    }

    case 'road_ambush': {
      // 确保main_road从一边连到另一边，两侧有掩体
      const midZ = Math.floor(h / 2);
      for (let x = 0; x < w; x++) {
        const cell = cells[midZ]?.[x];
        if (!cell) continue;
        cell.terrain = 'road';
        cell.isRoad = true;
        cell.roadType = 'main';
        if (!cell.features) cell.features = [];
        if (!cell.features.includes('main_road')) cell.features.push('main_road');
      }
      // 道路两侧生成掩体
      for (let x = 0; x < w; x++) {
        for (const dz of [-1, 1]) {
          const nz = midZ + dz;
          if (nz >= 0 && nz < h) {
            if (cells[nz][x].terrain === 'plains' && rng.next() < 0.4) {
              cells[nz][x].terrain = 'forest';
            }
          }
        }
      }
      break;
    }

    case 'fortress_assault': {
      // 中心或防守方后方放fortress
      const defSide = config.attackerDirection === 'west' ? w - 3 :
                      config.attackerDirection === 'east' ? 2 :
                      config.attackerDirection === 'north' ? Math.floor(h / 2) : Math.floor(h / 2);
      const defX = config.attackerDirection === 'north' || config.attackerDirection === 'south'
        ? Math.floor(w / 2)
        : defSide;
      const defZ = config.attackerDirection === 'west' || config.attackerDirection === 'east'
        ? Math.floor(h / 2)
        : defSide;

      if (defX >= 0 && defX < w && defZ >= 0 && defZ < h) {
        cells[defZ][defX].terrain = 'fortress';
      }
      // 外围有道路或开阔接近路线
      const approachX = config.attackerDirection === 'west' ? Math.floor(w / 2) :
                        config.attackerDirection === 'east' ? Math.floor(w / 2) : defX;
      const approachZ = config.attackerDirection === 'north' ? Math.floor(h / 2) :
                        config.attackerDirection === 'south' ? Math.floor(h / 2) : defZ;
      for (let z = 0; z < h; z++) {
        if (cells[z][approachX].terrain === 'mountain' && rng.next() < 0.5) {
          cells[z][approachX].terrain = 'plains';
        }
      }
      break;
    }

    case 'open_field': {
      // 大部分plains，少量forest/hill
      for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
        const cell = cells[z][x];
        if (cell.terrain === 'mountain' && rng.next() < 0.7) {
          cell.terrain = 'plains';
        }
        if (cell.terrain === 'forest' && rng.next() < 0.5) {
          cell.terrain = 'plains';
        }
        if (cell.terrain === 'city' && rng.next() < 0.6) {
          cell.terrain = 'plains';
        }
      }
      break;
    }
  }
}

// ─── 自动判断 battleType ────────────────────────────────

export function inferBattleTypeFromDetailMap(params: {
  detailMap: DetailMap;
  center: { x: number; z: number };
  radius?: number;
}): BattleType {
  const { detailMap, center, radius = 6 } = params;

  let bridgeCount = 0;
  let cityCount = 0;
  let mountainCount = 0;
  let forestCount = 0;
  let roadCount = 0;
  let total = 0;

  for (let dz = -radius; dz <= radius; dz++) {
    for (let dx = -radius; dx <= radius; dx++) {
      const x = center.x + dx;
      const z = center.z + dz;
      if (x < 0 || x >= detailMap.width || z < 0 || z >= detailMap.height) continue;
      if (dx * dx + dz * dz > radius * radius) continue;

      const cell = detailMap.cells[z][x];
      total++;

      if (cell.features.includes('bridge')) bridgeCount++;
      if (cell.terrain === 'city' || cell.features.includes('urban_block') || cell.features.includes('city_center')) cityCount++;
      if (cell.terrain === 'mountain' || cell.features.includes('hill')) mountainCount++;
      if (cell.terrain === 'forest' || cell.features.includes('forest_patch')) forestCount++;
      if (cell.features.includes('main_road') || cell.features.includes('secondary_road')) roadCount++;
    }
  }

  if (total === 0) return 'encounter';

  if (bridgeCount > 0) return 'bridge_crossing';
  if (cityCount / total > 0.25) return 'urban_assault';
  if (mountainCount / total > 0.3) return 'hill_assault';
  if (forestCount / total > 0.35) return 'forest_fight';
  if (roadCount > 3) return 'road_ambush';

  return 'encounter';
}

// ─── 部署区生成 ─────────────────────────────────────────

export function createDeploymentZonesForTacticalMap(params: {
  map: GameMap;
  attackerDirection: AttackerDirection;
  battleType: BattleType;
}): { attackerZone: Position[]; defenderZone: Position[] } {
  const { map, attackerDirection, battleType } = params;
  const attackerZone: Position[] = [];
  const defenderZone: Position[] = [];

  const w = map.width;
  const h = map.height;
  const deployDepth = 3;

  const isPassable = (terrain: TerrainType): boolean => {
    return terrain !== 'water' && terrain !== 'mountain';
  };

  switch (attackerDirection) {
    case 'west':
      for (let z = 0; z < h; z++) for (let x = 0; x < deployDepth; x++) {
        if (isPassable(map.cells[z][x].terrain)) attackerZone.push({ x, z });
      }
      for (let z = 0; z < h; z++) for (let x = w - deployDepth; x < w; x++) {
        if (isPassable(map.cells[z][x].terrain)) defenderZone.push({ x, z });
      }
      break;
    case 'east':
      for (let z = 0; z < h; z++) for (let x = w - deployDepth; x < w; x++) {
        if (isPassable(map.cells[z][x].terrain)) attackerZone.push({ x, z });
      }
      for (let z = 0; z < h; z++) for (let x = 0; x < deployDepth; x++) {
        if (isPassable(map.cells[z][x].terrain)) defenderZone.push({ x, z });
      }
      break;
    case 'north':
      for (let z = 0; z < deployDepth; z++) for (let x = 0; x < w; x++) {
        if (isPassable(map.cells[z][x].terrain)) attackerZone.push({ x, z });
      }
      for (let z = h - deployDepth; z < h; z++) for (let x = 0; x < w; x++) {
        if (isPassable(map.cells[z][x].terrain)) defenderZone.push({ x, z });
      }
      break;
    case 'south':
      for (let z = h - deployDepth; z < h; z++) for (let x = 0; x < w; x++) {
        if (isPassable(map.cells[z][x].terrain)) attackerZone.push({ x, z });
      }
      for (let z = 0; z < deployDepth; z++) for (let x = 0; x < w; x++) {
        if (isPassable(map.cells[z][x].terrain)) defenderZone.push({ x, z });
      }
      break;
  }

  // bridge_crossing: 双方部署区在河流两侧
  if (battleType === 'bridge_crossing') {
    // 找到river行，确保部署区在river两侧
    // 已由方向控制，无需额外处理
  }

  return { attackerZone, defenderZone };
}

// ─── 战术目标点生成 ──────────────────────────────────────

export function createTacticalObjectives(params: {
  map: GameMap;
  battleType: BattleType;
}): CapturePoint[] {
  const { map, battleType } = params;
  const w = map.width;
  const h = map.height;
  const objectives: CapturePoint[] = [];

  const midX = Math.floor(w / 2);
  const midZ = Math.floor(h / 2);

  const findNearest = (terrain: TerrainType, fromX: number, fromZ: number): Position | null => {
    let best: Position | null = null;
    let bestDist = Infinity;
    for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
      if (map.cells[z][x].terrain === terrain) {
        const d = Math.abs(x - fromX) + Math.abs(z - fromZ);
        if (d < bestDist) { bestDist = d; best = { x, z }; }
      }
    }
    return best;
  };

  const findNearestFeature = (feature: TacticalFeatureType, fromX: number, fromZ: number): Position | null => {
    let best: Position | null = null;
    let bestDist = Infinity;
    for (let z = 0; z < h; z++) for (let x = 0; x < w; x++) {
      if (map.cells[z][x].features?.includes(feature)) {
        const d = Math.abs(x - fromX) + Math.abs(z - fromZ);
        if (d < bestDist) { bestDist = d; best = { x, z }; }
      }
    }
    return best;
  };

  switch (battleType) {
    case 'bridge_crossing': {
      const bridgePos = findNearest('bridge', midX, midZ);
      if (bridgePos) {
        objectives.push({
          id: 'obj_bridge',
          position: bridgePos,
          name: '桥头堡',
          type: 'bridgehead',
          owner: null,
          captureProgress: { red: 0, blue: 0 },
          captureThreshold: 100,
          captureRadius: 2,
          providesVision: 3,
          isDeploymentZone: false,
        });
      }
      break;
    }

    case 'urban_assault': {
      const centerPos = findNearestFeature('city_center', midX, midZ) ?? findNearest('city', midX, midZ) ?? { x: midX, z: midZ };
      objectives.push({
        id: 'obj_comm',
        position: centerPos,
        name: '通信枢纽',
        type: 'comm_hub',
        owner: null,
        captureProgress: { red: 0, blue: 0 },
        captureThreshold: 100,
        captureRadius: 2,
        providesVision: 3,
        isDeploymentZone: false,
      });
      // 第二个据点
      const cityPos2 = findNearest('city', centerPos.x + 3, centerPos.z);
      if (cityPos2 && (cityPos2.x !== centerPos.x || cityPos2.z !== centerPos.z)) {
        objectives.push({
          id: 'obj_stronghold',
          position: cityPos2,
          name: '城市据点',
          type: 'stronghold',
          owner: null,
          captureProgress: { red: 0, blue: 0 },
          captureThreshold: 100,
          captureRadius: 2,
          providesVision: 3,
          isDeploymentZone: false,
        });
      }
      break;
    }

    case 'hill_assault': {
      const hillPos = findNearest('mountain', midX, midZ) ?? { x: midX, z: midZ };
      objectives.push({
        id: 'obj_hill',
        position: hillPos,
        name: '高地据点',
        type: 'stronghold',
        owner: null,
        captureProgress: { red: 0, blue: 0 },
        captureThreshold: 100,
        captureRadius: 2,
        providesVision: 4,
        isDeploymentZone: false,
      });
      break;
    }

    case 'road_ambush': {
      const roadPos = findNearest('road', midX, midZ) ?? { x: midX, z: midZ };
      objectives.push({
        id: 'obj_supply',
        position: roadPos,
        name: '补给站',
        type: 'supply_base',
        owner: null,
        captureProgress: { red: 0, blue: 0 },
        captureThreshold: 100,
        captureRadius: 2,
        providesVision: 3,
        isDeploymentZone: false,
      });
      break;
    }

    case 'fortress_assault': {
      const fortPos = findNearest('fortress', midX, midZ) ?? { x: midX, z: midZ };
      objectives.push({
        id: 'obj_fortress',
        position: fortPos,
        name: '要塞',
        type: 'stronghold',
        owner: null,
        captureProgress: { red: 0, blue: 0 },
        captureThreshold: 100,
        captureRadius: 2,
        providesVision: 4,
        isDeploymentZone: false,
      });
      break;
    }

    default: {
      // encounter / open_field / forest_fight
      objectives.push({
        id: 'obj_center',
        position: { x: midX, z: midZ },
        name: '中央据点',
        type: 'supply_base',
        owner: null,
        captureProgress: { red: 0, blue: 0 },
        captureThreshold: 100,
        captureRadius: 2,
        providesVision: 3,
        isDeploymentZone: false,
      });
      break;
    }
  }

  return objectives;
}

// ─── 主生成函数 ─────────────────────────────────────────

export function generateTacticalMapFromDetailMap(params: {
  detailMap: DetailMap;
  config: TacticalFromDetailConfig;
}): GameMap {
  const { detailMap, config } = params;
  const rng = createRNG(config.seed);

  // 1. 裁剪DetailMap
  const croppedCells = cropDetailMap(detailMap, config.center, config.width, config.height);

  // 2. 转换为MapCell
  const cells: MapCell[][] = [];
  for (let z = 0; z < config.height; z++) {
    cells[z] = [];
    for (let x = 0; x < config.width; x++) {
      const detailCell = croppedCells[z][x];
      cells[z][x] = convertDetailCellToMapCell(detailCell, x, z, config);
    }
  }

  // 3. 按战斗类型强化
  applyBattleTypeModifications(cells, config.battleType, rng, config);

  // 4. 确保部署区可通行
  ensurePassability(cells, config);

  const map: GameMap = { width: config.width, height: config.height, cells };

  // 5. 调试输出
  logTacticalMapStats(map, config, detailMap);

  return map;
}

// ─── 确保部署区可通行 ────────────────────────────────────

function ensurePassability(cells: MapCell[][], config: TacticalFromDetailConfig): void {
  const w = config.width;
  const h = config.height;
  const dir = config.attackerDirection;
  const depth = 2;

  const clearZone = (startX: number, endX: number, startZ: number, endZ: number) => {
    for (let z = startZ; z < endZ; z++) {
      for (let x = startX; x < endX; x++) {
        if (z >= 0 && z < h && x >= 0 && x < w) {
          const t = cells[z][x].terrain;
          if (t === 'water' || t === 'mountain') {
            cells[z][x].terrain = 'plains';
          }
        }
      }
    }
  };

  switch (dir) {
    case 'west':
      clearZone(0, depth, 0, h);
      clearZone(w - depth, w, 0, h);
      break;
    case 'east':
      clearZone(w - depth, w, 0, h);
      clearZone(0, depth, 0, h);
      break;
    case 'north':
      clearZone(0, w, 0, depth);
      clearZone(0, w, h - depth, h);
      break;
    case 'south':
      clearZone(0, w, h - depth, h);
      clearZone(0, w, 0, depth);
      break;
  }
}

// ─── 调试输出 ───────────────────────────────────────────

function logTacticalMapStats(map: GameMap, config: TacticalFromDetailConfig, detailMap: DetailMap): void {
  const terrainCounts: Record<string, number> = {};
  let roadCount = 0;
  let riverCount = 0;
  let bridgeCount = 0;
  let cityCount = 0;

  for (let z = 0; z < map.height; z++) {
    for (let x = 0; x < map.width; x++) {
      const cell = map.cells[z][x];
      terrainCounts[cell.terrain] = (terrainCounts[cell.terrain] || 0) + 1;
      if (cell.isRoad) roadCount++;
      if (cell.features?.includes('river')) riverCount++;
      if (cell.terrain === 'bridge') bridgeCount++;
      if (cell.terrain === 'city') cityCount++;
    }
  }

  console.log('[TacticalMap] Generated from DetailMap:', {
    battleType: config.battleType,
    mapWidth: map.width,
    mapHeight: map.height,
    terrainCounts,
    roadCount,
    riverCount,
    bridgeCount,
    cityCount,
    attackerDirection: config.attackerDirection,
    sourceDetailMapId: detailMap.id,
    sourceCenter: config.center,
  });

  // Warnings
  if (config.battleType === 'bridge_crossing' && bridgeCount === 0) {
    console.warn('[TacticalMap] WARNING: bridge_crossing but bridge count = 0');
  }
  if (config.battleType === 'urban_assault' && cityCount < 10) {
    console.warn('[TacticalMap] WARNING: urban_assault but city count < 10');
  }
  if (config.battleType === 'hill_assault' && (terrainCounts['mountain'] || 0) < 6) {
    console.warn('[TacticalMap] WARNING: hill_assault but mountain count < 6');
  }
}
