// ===== 战略-战术集成模块 =====
// 桥接战略模式与战术模式的战斗系统

import { Faction, AIDifficulty, UnitType, MapType, Position, GameState, Unit, WeatherType } from './types';
import { StrategicForce, StrategicSector, StrategicTerrainType, StrategicUnit } from './strategic-types';
import { generateMap, getCell } from './map';
import { adaptDeployment, MAP_WIDTH, MAP_HEIGHT } from './config';
import { createUnit } from './engine';

// ===== Types =====

/** 战术战斗配置 */
export interface TacticalBattleConfig {
  attackerForce: StrategicForce;
  defenderForce: StrategicForce;
  sector: StrategicSector;
  difficulty: AIDifficulty;
}

/** 战术战斗结果 */
export interface TacticalBattleResult {
  attackerLosses: Record<UnitType, number>;
  defenderLosses: Record<UnitType, number>;
  winner: 'attacker' | 'defender' | 'draw';
  attackerSurvivingUnits: StrategicUnit[];
  defenderSurvivingUnits: StrategicUnit[];
}

// ===== Terrain Mapping =====

/** Map strategic terrain type to tactical map type */
export function mapStrategicTerrainToMapType(terrain: StrategicTerrainType): MapType {
  switch (terrain) {
    case 'plains':
      return 'random'; // random map, biased toward plains
    case 'forest':
      return 'mountain-pass'; // more forests/obstacles
    case 'mountain':
      return 'mountain-pass';
    case 'city':
      return 'urban-warfare';
    case 'desert':
      return 'desert-storm';
    case 'highland':
      return 'mountain-pass';
    case 'water':
      return 'river-valley';
    case 'marshland':
      return 'river-valley';
    default:
      return 'random';
  }
}

// ===== Deployment Position Generation =====

/** Generate deployment positions for tactical battle from strategic force composition */
function generateDeploymentPositions(
  units: StrategicUnit[],
  faction: Faction,
  mapWidth: number,
  mapHeight: number,
  existingUnits: Position[],
): Position[] {
  const positions: Position[] = [];
  const isRed = faction === 'red';
  const startXMin = isRed ? 0 : mapWidth - 4;
  const startXMax = isRed ? 3 : mapWidth - 1;
  const startZMin = 1;
  const startZMax = mapHeight - 2;

  for (const unit of units) {
    for (let i = 0; i < unit.count; i++) {
      let placed = false;
      // Try to find a valid position
      for (let attempt = 0; attempt < 100 && !placed; attempt++) {
        const x = startXMin + Math.floor(Math.random() * (startXMax - startXMin + 1));
        const z = startZMin + Math.floor(Math.random() * (startZMax - startZMin + 1));

        // Check if position is already occupied
        if (existingUnits.some(p => p.x === x && p.z === z)) continue;
        if (positions.some(p => p.x === x && p.z === z)) continue;

        // Check terrain passability (handled later by adaptDeployment)
        positions.push({ x, z });
        placed = true;
      }

      // Fallback: find any position in the deployment zone
      if (!placed) {
        for (let x = startXMin; x <= startXMax; x++) {
          for (let z = startZMin; z <= startZMax; z++) {
            if (!existingUnits.some(p => p.x === x && p.z === z) &&
                !positions.some(p => p.x === x && p.z === z)) {
              positions.push({ x, z });
              placed = true;
              break;
            }
          }
          if (placed) break;
        }
      }
    }
  }

  return positions;
}

// ===== Core Functions =====

/** Generate a tactical battle config from two opposing strategic forces */
export function generateTacticalBattleConfig(
  attackerForce: StrategicForce,
  defenderForce: StrategicForce,
  sector: StrategicSector,
  difficulty: AIDifficulty,
): TacticalBattleConfig {
  return {
    attackerForce: { ...attackerForce, units: attackerForce.units.map(u => ({ ...u })) },
    defenderForce: { ...defenderForce, units: defenderForce.units.map(u => ({ ...u })) },
    sector: { ...sector },
    difficulty,
  };
}

/** Initialize a tactical game state from strategic forces */
export function initTacticalFromStrategic(config: TacticalBattleConfig): GameState {
  const { attackerForce, defenderForce, sector, difficulty } = config;
  const mapType = mapStrategicTerrainToMapType(sector.terrain);
  const map = generateMap(mapType);

  // Generate deployment positions for attacker (left side) and defender (right side)
  const attackerPositions = generateDeploymentPositions(
    attackerForce.units,
    attackerForce.faction,
    MAP_WIDTH,
    MAP_HEIGHT,
    [],
  );

  const defenderPositions = generateDeploymentPositions(
    defenderForce.units,
    defenderForce.faction,
    MAP_WIDTH,
    MAP_HEIGHT,
    attackerPositions,
  );

  // Create tactical units
  const units: Unit[] = [];

  // Create attacker units
  let posIndex = 0;
  for (const strategicUnit of attackerForce.units) {
    for (let i = 0; i < strategicUnit.count; i++) {
      if (posIndex < attackerPositions.length) {
        const pos = attackerPositions[posIndex];
        // Adapt position to passable terrain
        const cell = getCell(map, pos);
        if (cell) {
          const unit = createUnit(strategicUnit.type, attackerForce.faction, pos);
          units.push(unit);
          cell.unit = unit;
        }
        posIndex++;
      }
    }
  }

  // Create defender units
  posIndex = 0;
  for (const strategicUnit of defenderForce.units) {
    for (let i = 0; i < strategicUnit.count; i++) {
      if (posIndex < defenderPositions.length) {
        const pos = defenderPositions[posIndex];
        const cell = getCell(map, pos);
        if (cell) {
          const unit = createUnit(strategicUnit.type, defenderForce.faction, pos);
          units.push(unit);
          cell.unit = unit;
        }
        posIndex++;
      }
    }
  }

  return {
    map,
    units,
    currentFaction: 'red', // Red always goes first in tactical
    phase: 'selectUnit',
    turn: 1,
    selectedUnit: null,
    movablePositions: [],
    attackablePositions: [],
    movePath: [],
    combatLog: [],
    winner: null,
    victoryReason: null,
    aiDifficulty: difficulty,
    turnSummaries: [],
    lastTurnSummary: null,
    previousState: null,
    hoveredCell: null,
    shakeActive: false,
    shakeIntensity: 1,
    movementAnimation: null,
    isAnimating: false,
    damagePopups: [],
    combatToasts: [],
    levelUpNotifications: [],
    capturePoints: [],
    battleStats: {
      red: {
        damageDealt: 0,
        damageReceived: 0,
        unitsDestroyed: 0,
        unitsLost: 0,
        healingDone: 0,
        attacks: 0,
        kills: 0,
        retreated: 0,
        fortsBuilt: 0,
      },
      blue: {
        damageDealt: 0,
        damageReceived: 0,
        unitsDestroyed: 0,
        unitsLost: 0,
        healingDone: 0,
        attacks: 0,
        kills: 0,
        retreated: 0,
        fortsBuilt: 0,
      },
    },
    currentWeather: 'clear',
    weatherTurnsRemaining: 3,
    // v89.0: Initial next weather forecast for tactical integration
    nextWeather: 'clear' as WeatherType,
    gameStartTime: null,
    reinforcements: { red: [], blue: [] },
    reinforcementBudget: { red: 0, blue: 0 },
    aiDynamicDifficulty: {
      enabled: true,
      currentDifficulty: difficulty,
      metrics: {
        playerKillRatio: 0,
        playerDamageEfficiency: 1,
        turnsElapsed: 1,
        lastAdjustTurn: 0,
        adjustmentCount: 0,
      },
    },
    // v67.0: Kill tracking per turn
    turnKillCounts: { red: 0, blue: 0 },
    // Recon/intelligence system
    revealedCells: new Set<string>(),
    revealedUnits: [],
    intelReports: [],
  };
}

/** Convert tactical battle result back to strategic force losses */
export function convertTacticalResultToStrategic(
  gameState: GameState,
  config: TacticalBattleConfig,
): {
  attackerSurviving: StrategicUnit[];
  defenderSurviving: StrategicUnit[];
  winner: 'attacker' | 'defender' | 'draw';
} {
  const { attackerForce, defenderForce } = config;

  // Count surviving units by type for each faction
  const attackerSurvivingCounts: Partial<Record<UnitType, number>> = {};
  const defenderSurvivingCounts: Partial<Record<UnitType, number>> = {};

  for (const unit of gameState.units) {
    if (!unit.isAlive) continue;

    if (unit.faction === attackerForce.faction) {
      attackerSurvivingCounts[unit.type] = (attackerSurvivingCounts[unit.type] || 0) + 1;
    } else {
      defenderSurvivingCounts[unit.type] = (defenderSurvivingCounts[unit.type] || 0) + 1;
    }
  }

  // Build surviving strategic units
  const attackerSurviving = attackerForce.units
    .map(su => ({
      ...su,
      count: attackerSurvivingCounts[su.type] || 0,
    }))
    .filter(su => su.count > 0);

  const defenderSurviving = defenderForce.units
    .map(su => ({
      ...su,
      count: defenderSurvivingCounts[su.type] || 0,
    }))
    .filter(su => su.count > 0);

  // Determine winner
  const attackerTotal = attackerSurviving.reduce((sum, u) => sum + u.count, 0);
  const defenderTotal = defenderSurviving.reduce((sum, u) => sum + u.count, 0);

  let winner: 'attacker' | 'defender' | 'draw';
  if (gameState.winner === attackerForce.faction) {
    winner = 'attacker';
  } else if (gameState.winner === defenderForce.faction) {
    winner = 'defender';
  } else {
    // No winner (e.g., game ended by player exiting)
    // Determine based on surviving unit counts
    if (attackerTotal > defenderTotal) {
      winner = 'attacker';
    } else if (defenderTotal > attackerTotal) {
      winner = 'defender';
    } else {
      winner = 'draw';
    }
  }

  return {
    attackerSurviving,
    defenderSurviving,
    winner,
  };
}
