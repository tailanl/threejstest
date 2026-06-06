// ===== 战略模式引擎 - 核心逻辑 =====

import { Faction, AIDifficulty, UnitType } from './types';
import { UNIT_CONFIGS } from './config';
import {
  StrategicGameState,
  StrategicMap,
  StrategicForce,
  StrategicUnit,
  StrategicPosition,
  StrategicSector,
  StrategicCombatLog,
  ForceTemplate,
  StrategicDeploymentInfo,
  ReinforcementInfo,
  StrategicTerrainType,
  STRATEGIC_TERRAIN_CONFIGS,
} from './strategic-types';
import { generateStrategicMap, getSector, getStrategicNeighbors } from './strategic-map';

// ===== Force Templates (PLA-style formations) =====

/** 装甲营 (Armor Battalion) */
const ARMOR_BATTALION: ForceTemplate = {
  name: '装甲营',
  units: [
    { type: 'tank', count: 4 },
    { type: 'ifv', count: 2 },
    { type: 'supply', count: 1 },
  ],
  moveRange: 2,
  vision: 2,
  cost: 25,
};

/** 机械化步兵营 (Mechanized Infantry Battalion) */
const MECH_INF_BATTALION: ForceTemplate = {
  name: '机械化步兵营',
  units: [
    { type: 'tank', count: 2 },
    { type: 'ifv', count: 3 },
    { type: 'infantry', count: 2 },
    { type: 'supply', count: 1 },
  ],
  moveRange: 2,
  vision: 2,
  cost: 20,
};

/** 炮兵营 (Artillery Battalion) */
const ARTILLERY_BATTALION: ForceTemplate = {
  name: '炮兵营',
  units: [
    { type: 'artillery', count: 3 },
    { type: 'mlrs', count: 2 },
    { type: 'supply', count: 1 },
  ],
  moveRange: 1,
  vision: 3,
  cost: 18,
};

/** 侦察营 (Recon Battalion) */
const RECON_BATTALION: ForceTemplate = {
  name: '侦察营',
  units: [
    { type: 'scout', count: 3 },
    { type: 'helicopter', count: 2 },
  ],
  moveRange: 3,
  vision: 4,
  cost: 15,
};

/** 防空营 (Air Defense Battalion) */
const AIR_DEFENSE_BATTALION: ForceTemplate = {
  name: '防空营',
  units: [
    { type: 'sam', count: 3 },
    { type: 'supply', count: 2 },
  ],
  moveRange: 2,
  vision: 2,
  cost: 14,
};

/** 工兵营 (Engineer Battalion) */
const ENGINEER_BATTALION: ForceTemplate = {
  name: '工兵营',
  units: [
    { type: 'engineer', count: 3 },
    { type: 'infantry', count: 2 },
    { type: 'supply', count: 1 },
  ],
  moveRange: 2,
  vision: 2,
  cost: 16,
};

/** 综合旅 (Combined Arms Brigade) */
const COMBINED_ARMS_BRIGADE: ForceTemplate = {
  name: '综合旅',
  units: [
    { type: 'tank', count: 2 },
    { type: 'ifv', count: 2 },
    { type: 'artillery', count: 1 },
    { type: 'scout', count: 1 },
    { type: 'infantry', count: 1 },
    { type: 'supply', count: 1 },
  ],
  moveRange: 2,
  vision: 3,
  cost: 22,
};

/** All available force templates */
export const FORCE_TEMPLATES: Record<string, ForceTemplate> = {
  armor: ARMOR_BATTALION,
  mech_inf: MECH_INF_BATTALION,
  artillery: ARTILLERY_BATTALION,
  recon: RECON_BATTALION,
  air_defense: AIR_DEFENSE_BATTALION,
  engineer: ENGINEER_BATTALION,
  combined: COMBINED_ARMS_BRIGADE,
};

// ===== Force creation helpers =====

let forceIdCounter = 0;

/** Calculate aggregate combat power for a force (includes armor penetration bonus) */
function calculateCombatPower(units: StrategicUnit[]): number {
  let power = 0;
  for (const su of units) {
    const config = UNIT_CONFIGS[su.type];
    if (config) {
      // Base attack power + armor penetration bonus
      power += (config.stats.attack + config.stats.armorPenetration * 0.3) * su.count;
    }
  }
  return power;
}

/** Calculate aggregate defense power for a force (includes armor bonus) */
function calculateDefensePower(units: StrategicUnit[]): number {
  let power = 0;
  for (const su of units) {
    const config = UNIT_CONFIGS[su.type];
    if (config) {
      // Base defense + armor bonus
      power += (config.stats.defense + config.stats.armor * 0.4) * su.count;
    }
  }
  return power;
}

/** Create a strategic force from a template */
function createForce(
  templateKey: string,
  faction: Faction,
  position: StrategicPosition,
  ordinal: number,
): StrategicForce {
  const template = FORCE_TEMPLATES[templateKey];
  if (!template) throw new Error(`Unknown force template: ${templateKey}`);

  forceIdCounter++;
  const factionName = faction === 'red' ? '红方' : '蓝方';
  const name = `第${ordinal}${template.name}`;

  // Deep copy units
  const units: StrategicUnit[] = template.units.map(u => ({ ...u }));

  return {
    id: `${faction}_force_${forceIdCounter}`,
    faction,
    name: `${factionName}${name}`,
    units,
    position,
    canMove: true,
    hasAttacked: false,
    isAlive: true,
    combatPower: calculateCombatPower(units),
    defensePower: calculateDefensePower(units),
    moveRange: template.moveRange,
    vision: template.vision,
    templateKey,
  };
}

// ===== Initial deployment configurations =====

interface StrategicDeployConfig {
  templateKey: string;
  position: StrategicPosition;
  ordinal: number;
}

/** Red side deployment — West/Northwest of the map */
const RED_STRATEGIC_DEPLOYMENT: StrategicDeployConfig[] = [
  { templateKey: 'armor', position: { x: 0, y: 3 }, ordinal: 1 },
  { templateKey: 'mech_inf', position: { x: 0, y: 5 }, ordinal: 1 },
  { templateKey: 'mech_inf', position: { x: 1, y: 1 }, ordinal: 2 },
  { templateKey: 'artillery', position: { x: 0, y: 4 }, ordinal: 1 },
  { templateKey: 'recon', position: { x: 1, y: 0 }, ordinal: 1 },
  { templateKey: 'air_defense', position: { x: 0, y: 6 }, ordinal: 1 },
  { templateKey: 'combined', position: { x: 1, y: 7 }, ordinal: 1 },
];

/** Blue side deployment — East/Southeast of the map */
const BLUE_STRATEGIC_DEPLOYMENT: StrategicDeployConfig[] = [
  { templateKey: 'armor', position: { x: 9, y: 4 }, ordinal: 1 },
  { templateKey: 'mech_inf', position: { x: 9, y: 2 }, ordinal: 1 },
  { templateKey: 'mech_inf', position: { x: 8, y: 6 }, ordinal: 2 },
  { templateKey: 'artillery', position: { x: 9, y: 3 }, ordinal: 1 },
  { templateKey: 'recon', position: { x: 8, y: 7 }, ordinal: 1 },
  { templateKey: 'engineer', position: { x: 9, y: 5 }, ordinal: 1 },
  { templateKey: 'combined', position: { x: 8, y: 1 }, ordinal: 1 },
];

/** Find nearest passable sector from a target position */
function findNearestPassable(
  map: StrategicMap,
  target: StrategicPosition,
): StrategicPosition {
  const sector = getSector(map, target);
  if (sector && STRATEGIC_TERRAIN_CONFIGS[sector.terrain].isPassable && !sector.force) {
    return target;
  }

  // BFS to find nearest passable empty sector
  const visited = new Set<string>();
  const queue: StrategicPosition[] = [target];
  visited.add(`${target.x},${target.y}`);

  while (queue.length > 0) {
    const current = queue.shift()!;
    const dirs = [
      { x: 0, y: -1 }, { x: 0, y: 1 },
      { x: -1, y: 0 }, { x: 1, y: 0 },
      { x: -1, y: -1 }, { x: 1, y: -1 },
      { x: -1, y: 1 }, { x: 1, y: 1 },
    ];

    for (const d of dirs) {
      const next = { x: current.x + d.x, y: current.y + d.y };
      const key = `${next.x},${next.y}`;
      if (visited.has(key)) continue;
      if (next.x < 0 || next.x >= map.width || next.y < 0 || next.y >= map.height) continue;
      visited.add(key);

      const nextSector = getSector(map, next);
      if (nextSector && STRATEGIC_TERRAIN_CONFIGS[nextSector.terrain].isPassable && !nextSector.force) {
        return next;
      }
      queue.push(next);
    }
  }

  // Fallback
  return target;
}

// ===== Core Engine Functions =====

/** Initialize strategic game state */
export function initStrategicGame(difficulty: AIDifficulty = 'normal'): StrategicGameState {
  const map = generateStrategicMap();
  const forces: StrategicForce[] = [];

  // Deploy red forces
  for (const deploy of RED_STRATEGIC_DEPLOYMENT) {
    let pos = deploy.position;
    const sector = getSector(map, pos);
    if (!sector || !STRATEGIC_TERRAIN_CONFIGS[sector.terrain].isPassable || sector.force) {
      // Find nearest passable sector
      pos = findNearestPassable(map, pos);
    }
    const force = createForce(deploy.templateKey, 'red', pos, deploy.ordinal);
    forces.push(force);
    const targetSector = getSector(map, pos);
    if (targetSector) {
      targetSector.force = force;
    }
  }

  // Deploy blue forces
  for (const deploy of BLUE_STRATEGIC_DEPLOYMENT) {
    let pos = deploy.position;
    const sector = getSector(map, pos);
    if (!sector || !STRATEGIC_TERRAIN_CONFIGS[sector.terrain].isPassable || sector.force) {
      pos = findNearestPassable(map, pos);
    }
    const force = createForce(deploy.templateKey, 'blue', pos, deploy.ordinal);
    forces.push(force);
    const targetSector = getSector(map, pos);
    if (targetSector) {
      targetSector.force = force;
    }
  }

  const state: StrategicGameState = {
    map,
    forces,
    currentFaction: 'red',
    turn: 1,
    phase: 'selectForce',
    selectedForce: null,
    movableSectors: [],
    attackableSectors: [],
    winner: null,
    combatLog: [],
    aiDifficulty: difficulty,
    visibleSectors: calculateStrategicVisibility(
      { map, forces, currentFaction: 'red', visibleSectors: new Set() } as StrategicGameState,
      'red'
    ),
    reinforcements: {
      nextReinforcementTurn: 8,
      redReinforcementsRemaining: 3,
      blueReinforcementsRemaining: 3,
      maxReinforcements: 3,
      reinforcementForceTemplate: 'mech_inf',
      lastSpawnPositions: { red: null, blue: null },
    },
  };

  return state;
}

/** Calculate movable sectors for a force using BFS */
export function getMovableSectors(
  state: StrategicGameState,
  force: StrategicForce,
): StrategicPosition[] {
  if (!force.canMove || !force.isAlive) return [];

  const moveRange = force.moveRange;
  const positions: StrategicPosition[] = [];
  const visited = new Map<string, number>(); // key -> remaining move points
  const queue: { pos: StrategicPosition; remaining: number }[] = [
    { pos: force.position, remaining: moveRange },
  ];

  visited.set(`${force.position.x},${force.position.y}`, moveRange);

  while (queue.length > 0) {
    const current = queue.shift()!;

    for (const neighbor of getStrategicNeighbors(state.map, current.pos)) {
      const sector = getSector(state.map, neighbor);
      if (!sector) continue;

      const terrainConfig = STRATEGIC_TERRAIN_CONFIGS[sector.terrain];
      if (!terrainConfig.isPassable) continue;

      const moveCost = terrainConfig.moveCost;
      const remaining = current.remaining - moveCost;
      if (remaining < 0) continue;

      const key = `${neighbor.x},${neighbor.y}`;
      const prevRemaining = visited.get(key);
      if (prevRemaining !== undefined && prevRemaining >= remaining) continue;

      // Check if sector has a friendly force (can't move through friendly forces)
      if (sector.force && sector.force.id !== force.id && sector.force.isAlive && sector.force.faction === force.faction) {
        continue;
      }

      // Can move through empty sectors or sectors with enemy forces (attack)
      visited.set(key, remaining);
      queue.push({ pos: neighbor, remaining });

      // Don't include starting position
      if (neighbor.x !== force.position.x || neighbor.y !== force.position.y) {
        // Only include sectors without friendly forces
        if (!sector.force || sector.force.faction !== force.faction) {
          if (!positions.some(p => p.x === neighbor.x && p.y === neighbor.y)) {
            positions.push(neighbor);
          }
        }
      }
    }
  }

  return positions;
}

/** Calculate attackable sectors for a force (adjacent sectors with enemy forces) */
export function getAttackableSectors(
  state: StrategicGameState,
  force: StrategicForce,
): StrategicPosition[] {
  if (!force.isAlive) return [];

  const positions: StrategicPosition[] = [];
  const neighbors = getStrategicNeighbors(state.map, force.position);

  for (const neighbor of neighbors) {
    const sector = getSector(state.map, neighbor);
    if (!sector) continue;

    // There must be an enemy force in the adjacent sector
    if (sector.force && sector.force.faction !== force.faction && sector.force.isAlive) {
      positions.push(neighbor);
    }
  }

  return positions;
}

/** Move a force to a new sector */
export function moveForce(
  state: StrategicGameState,
  force: StrategicForce,
  target: StrategicPosition,
): StrategicGameState {
  if (!force.canMove || !force.isAlive) return state;

  // Deep copy state
  const newMap = {
    ...state.map,
    sectors: state.map.sectors.map(row => row.map(sector => ({ ...sector, force: sector.force ? { ...sector.force, units: sector.force.units.map(u => ({ ...u })) } : null }))),
  };
  const newForces = state.forces.map(f => ({
    ...f,
    units: f.units.map(u => ({ ...u })),
  }));

  // Remove force from old sector
  const oldSector = getSector(newMap, force.position);
  if (oldSector) oldSector.force = null;

  // Find and update the force
  const movedForce = newForces.find(f => f.id === force.id);
  if (movedForce) {
    movedForce.position = target;
    movedForce.canMove = false;
  }

  // Check if target sector has an enemy force (combat will happen)
  const targetSector = getSector(newMap, target);
  const enemyForce = targetSector?.force;

  if (enemyForce && enemyForce.faction !== force.faction && enemyForce.isAlive) {
    // Combat! The attacking force stays at original position if they lose
    // We handle this in resolveStrategicCombat flow — for now, mark the move
    // The combat resolution should be called separately
  }

  // Place force at new sector (if no enemy, or after combat resolution)
  if (targetSector && (!targetSector.force || !targetSector.force.isAlive)) {
    targetSector.force = movedForce || null;
  }

  const updatedState: StrategicGameState = {
    ...state,
    map: newMap,
    forces: newForces,
    selectedForce: movedForce || null,
    movableSectors: [],
    attackableSectors: movedForce && !movedForce.hasAttacked
      ? getAttackableSectors(
          { ...state, map: newMap, forces: newForces },
          movedForce,
        )
      : [],
    phase: 'selectForce',
  };

  return updatedState;
}

/** Resolve combat between two forces */
export function resolveStrategicCombat(
  attacker: StrategicForce,
  defender: StrategicForce,
  terrain: StrategicTerrainType,
): {
  result: 'attacker_wins' | 'defender_wins' | 'draw';
  attackerLosses: number;
  defenderLosses: number;
  attackerSurviving: StrategicUnit[];
  defenderSurviving: StrategicUnit[];
} {
  const terrainConfig = STRATEGIC_TERRAIN_CONFIGS[terrain];

  // Calculate effective powers
  const attackerPower = attacker.combatPower * terrainConfig.attackModifier;
  const defenderPower = defender.defensePower * terrainConfig.defenseModifier;

  // Random factor: ±20%
  const attackerRoll = 0.8 + Math.random() * 0.4;
  const defenderRoll = 0.8 + Math.random() * 0.4;

  const effectiveAttackerPower = attackerPower * attackerRoll;
  const effectiveDefenderPower = defenderPower * defenderRoll;

  // Determine result
  let result: 'attacker_wins' | 'defender_wins' | 'draw';
  let attackerLossRatio: number;
  let defenderLossRatio: number;

  const powerRatio = effectiveAttackerPower / Math.max(effectiveDefenderPower, 1);

  if (effectiveAttackerPower > effectiveDefenderPower * 1.3) {
    // Decisive attacker victory
    result = 'attacker_wins';
    defenderLossRatio = 0.6 + Math.random() * 0.3; // 60-90% losses
    attackerLossRatio = 0.05 + Math.random() * 0.15; // 5-20% losses
  } else if (effectiveAttackerPower > effectiveDefenderPower) {
    // Marginal attacker victory
    result = 'attacker_wins';
    defenderLossRatio = 0.4 + Math.random() * 0.3; // 40-70% losses
    attackerLossRatio = 0.15 + Math.random() * 0.2; // 15-35% losses
  } else if (effectiveDefenderPower > effectiveAttackerPower * 1.3) {
    // Decisive defender victory
    result = 'defender_wins';
    attackerLossRatio = 0.6 + Math.random() * 0.3; // 60-90% losses
    defenderLossRatio = 0.05 + Math.random() * 0.15; // 5-20% losses
  } else if (effectiveDefenderPower > effectiveAttackerPower) {
    // Marginal defender victory
    result = 'defender_wins';
    attackerLossRatio = 0.4 + Math.random() * 0.3; // 40-70% losses
    defenderLossRatio = 0.15 + Math.random() * 0.2; // 15-35% losses
  } else {
    // Draw — both sides take heavy losses
    result = 'draw';
    attackerLossRatio = 0.35 + Math.random() * 0.25; // 35-60% losses
    defenderLossRatio = 0.35 + Math.random() * 0.25; // 35-60% losses
  }

  // Apply losses proportionally to each unit type
  const attackerSurviving = applyLosses(attacker.units, attackerLossRatio);
  const defenderSurviving = applyLosses(defender.units, defenderLossRatio);

  // Calculate actual loss counts
  const attackerOriginalCount = attacker.units.reduce((sum, u) => sum + u.count, 0);
  const defenderOriginalCount = defender.units.reduce((sum, u) => sum + u.count, 0);
  const attackerSurvivingCount = attackerSurviving.reduce((sum, u) => sum + u.count, 0);
  const defenderSurvivingCount = defenderSurviving.reduce((sum, u) => sum + u.count, 0);

  return {
    result,
    attackerLosses: attackerOriginalCount - attackerSurvivingCount,
    defenderLosses: defenderOriginalCount - defenderSurvivingCount,
    attackerSurviving,
    defenderSurviving,
  };
}

/** Apply proportional losses to unit list */
function applyLosses(units: StrategicUnit[], lossRatio: number): StrategicUnit[] {
  return units.map(u => {
    const lostCount = Math.round(u.count * lossRatio);
    const survivingCount = Math.max(0, u.count - lostCount);
    return { ...u, count: survivingCount };
  }).filter(u => u.count > 0);
}

/** Execute a strategic attack (move + combat) */
export function executeStrategicAttack(
  state: StrategicGameState,
  attacker: StrategicForce,
  target: StrategicPosition,
): StrategicGameState {
  // Deep copy state
  const newMap = {
    ...state.map,
    sectors: state.map.sectors.map(row =>
      row.map(sector => ({
        ...sector,
        force: sector.force
          ? { ...sector.force, units: sector.force.units.map(u => ({ ...u })) }
          : null,
      }))
    ),
  };
  const newForces = state.forces.map(f => ({
    ...f,
    units: f.units.map(u => ({ ...u })),
  }));

  const attackerForce = newForces.find(f => f.id === attacker.id);
  const defenderSector = getSector(newMap, target);
  const defenderForce = defenderSector?.force
    ? newForces.find(f => f.id === defenderSector.force!.id)
    : null;

  if (!attackerForce || !defenderForce || !defenderSector) return state;

  // Remove attacker from old sector
  const oldSector = getSector(newMap, attackerForce.position);
  if (oldSector) oldSector.force = null;

  // Resolve combat
  const combatResult = resolveStrategicCombat(attackerForce, defenderForce, defenderSector.terrain);

  // Apply combat results
  attackerForce.units = combatResult.attackerSurviving;
  attackerForce.combatPower = calculateCombatPower(combatResult.attackerSurviving);
  attackerForce.defensePower = calculateDefensePower(combatResult.attackerSurviving);
  attackerForce.canMove = false;
  attackerForce.hasAttacked = true;

  defenderForce.units = combatResult.defenderSurviving;
  defenderForce.combatPower = calculateCombatPower(combatResult.defenderSurviving);
  defenderForce.defensePower = calculateDefensePower(combatResult.defenderSurviving);

  // Check if forces are destroyed
  const attackerTotalUnits = attackerForce.units.reduce((sum, u) => sum + u.count, 0);
  const defenderTotalUnits = defenderForce.units.reduce((sum, u) => sum + u.count, 0);

  if (attackerTotalUnits === 0) {
    attackerForce.isAlive = false;
  }
  if (defenderTotalUnits === 0) {
    defenderForce.isAlive = false;
  }

  // Handle movement based on result
  if (combatResult.result === 'attacker_wins' || combatResult.result === 'draw') {
    if (defenderForce.isAlive) {
      // Defender survived — attacker stays in original position if draw
      if (combatResult.result === 'draw') {
        const attackerOldPos = attacker.position;
        const attackerSector = getSector(newMap, attackerOldPos);
        if (attackerSector) attackerSector.force = attackerForce;
        attackerForce.position = attackerOldPos;
      } else {
        // Attacker wins but defender survived — attacker moves adjacent
        // Keep attacker at original position (they pushed the defender back)
        const attackerOldPos = attacker.position;
        const attackerSector = getSector(newMap, attackerOldPos);
        if (attackerSector) attackerSector.force = attackerForce;
        attackerForce.position = attackerOldPos;
      }
    } else {
      // Defender destroyed — attacker occupies the sector
      defenderSector.force = attackerForce;
      attackerForce.position = target;
    }
  } else {
    // Defender wins — attacker stays in original position
    const attackerOldPos = attacker.position;
    const attackerSector = getSector(newMap, attackerOldPos);
    if (attackerSector) attackerSector.force = attackerForce;
    attackerForce.position = attackerOldPos;

    // Clear defender sector and re-place defender
    if (defenderForce.isAlive) {
      defenderSector.force = defenderForce;
    } else {
      defenderSector.force = null;
    }
  }

  // Combat log
  const logEntry: StrategicCombatLog = {
    turn: state.turn,
    attacker: attackerForce.name,
    defender: defenderForce.name,
    attackerFaction: attackerForce.faction,
    result: combatResult.result,
    attackerLosses: combatResult.attackerLosses,
    defenderLosses: combatResult.defenderLosses,
  };

  // Check for victory
  const redAlive = newForces.filter(f => f.faction === 'red' && f.isAlive).length;
  const blueAlive = newForces.filter(f => f.faction === 'blue' && f.isAlive).length;

  let winner: Faction | null = state.winner;
  let phase = state.phase;
  if (redAlive === 0) { winner = 'blue'; phase = 'gameOver'; }
  else if (blueAlive === 0) { winner = 'red'; phase = 'gameOver'; }

  return {
    ...state,
    map: newMap,
    forces: newForces,
    selectedForce: null,
    movableSectors: [],
    attackableSectors: [],
    combatLog: (() => {
      const combined = [...state.combatLog, logEntry];
      return combined.length > 100 ? combined.slice(-100) : combined;
    })(),
    winner,
    phase,
  };
}

/** Find a valid reinforcement spawn position near a faction's existing forces */
function findReinforcementSpawnPosition(
  map: StrategicMap,
  faction: Faction,
  forces: StrategicForce[],
): StrategicPosition | null {
  // Determine spawn edge based on faction
  const spawnX = faction === 'red' ? 0 : 9;
  const spawnXRange = faction === 'red' ? [0, 1] : [8, 9];

  // Collect all valid spawn candidates near the faction's edge
  const candidates: StrategicPosition[] = [];
  for (let y = 0; y < map.height; y++) {
    for (const x of spawnXRange) {
      const sector = getSector(map, { x, y });
      if (!sector) continue;
      if (!STRATEGIC_TERRAIN_CONFIGS[sector.terrain].isPassable) continue;
      if (sector.force && sector.force.isAlive) continue; // Occupied
      candidates.push({ x, y });
    }
  }

  if (candidates.length === 0) {
    // Fallback: BFS from edge to find nearest passable empty sector
    const visited = new Set<string>();
    const queue: StrategicPosition[] = [{ x: spawnX, y: Math.floor(map.height / 2) }];
    visited.add(`${queue[0].x},${queue[0].y}`);
    while (queue.length > 0) {
      const current = queue.shift()!;
      const sector = getSector(map, current);
      if (sector && STRATEGIC_TERRAIN_CONFIGS[sector.terrain].isPassable && !sector.force) {
        candidates.push(current);
        break;
      }
      const dirs = [
        { x: 0, y: -1 }, { x: 0, y: 1 },
        { x: -1, y: 0 }, { x: 1, y: 0 },
      ];
      for (const d of dirs) {
        const next = { x: current.x + d.x, y: current.y + d.y };
        const key = `${next.x},${next.y}`;
        if (visited.has(key)) continue;
        if (next.x < 0 || next.x >= map.width || next.y < 0 || next.y >= map.height) continue;
        visited.add(key);
        queue.push(next);
      }
    }
  }

  if (candidates.length === 0) return null;

  // Prefer positions near existing friendly forces
  const factionForces = forces.filter(f => f.faction === faction && f.isAlive);
  let bestPos = candidates[0];
  let bestScore = -Infinity;

  for (const candidate of candidates) {
    let score = 0;
    if (factionForces.length > 0) {
      // Score based on proximity to nearest friendly force
      for (const f of factionForces) {
        const dist = Math.abs(candidate.x - f.position.x) + Math.abs(candidate.y - f.position.y);
        if (dist <= 2) score += 10;
        else if (dist <= 4) score += 5;
        else score -= dist;
      }
    }
    if (score > bestScore) {
      bestScore = score;
      bestPos = candidate;
    }
  }

  return bestPos;
}

/** Process reinforcements at the end of a turn */
function processReinforcements(state: StrategicGameState): StrategicGameState {
  if (!state.reinforcements) return state;
  const reinforcements = { ...state.reinforcements };

  // Only process when red faction's turn starts (turn increments)
  if (state.turn < reinforcements.nextReinforcementTurn) return state;
  if (state.currentFaction !== 'red') return state; // Only check on red turn start

  let currentState = { ...state, reinforcements };
  const newCombatLog = [...state.combatLog];

  // Check both factions for reinforcements
  const factionsToCheck: Faction[] = ['red', 'blue'];
  for (const faction of factionsToCheck) {
    const remaining = faction === 'red'
      ? reinforcements.redReinforcementsRemaining
      : reinforcements.blueReinforcementsRemaining;

    if (remaining <= 0) continue;

    // Find spawn position
    const spawnPos = findReinforcementSpawnPosition(currentState.map, faction, currentState.forces);
    if (!spawnPos) continue;

    // Create reinforcement force
    const forceOrdinal = currentState.forces.filter(f => f.faction === faction).length + 1;
    const newForce = createForce(reinforcements.reinforcementForceTemplate, faction, spawnPos, forceOrdinal);

    // Place on map
    const targetSector = getSector(currentState.map, spawnPos);
    if (targetSector) targetSector.force = newForce;

    // Add to forces
    const newForces = [...currentState.forces, newForce];
    currentState = { ...currentState, forces: newForces, map: { ...currentState.map } };

    // Update counters
    if (faction === 'red') {
      reinforcements.redReinforcementsRemaining--;
    } else {
      reinforcements.blueReinforcementsRemaining--;
    }

    // Update last spawn positions
    reinforcements.lastSpawnPositions = {
      ...reinforcements.lastSpawnPositions,
      [faction]: spawnPos,
    };

    // Add combat log entry
    const factionName = faction === 'red' ? '红方' : '蓝方';
    newCombatLog.push({
      turn: state.turn,
      attacker: `${factionName}增援`,
      defender: `${factionName}战场`,
      attackerFaction: faction,
      result: 'attacker_wins',
      attackerLosses: 0,
      defenderLosses: 0,
    });
  }

  // Set next reinforcement turn
  reinforcements.nextReinforcementTurn = reinforcements.nextReinforcementTurn + 6;

  return {
    ...currentState,
    reinforcements,
    combatLog: (() => {
      const trimmed = newCombatLog;
      return trimmed.length > 100 ? trimmed.slice(-100) : trimmed;
    })(),
  };
}

/** End strategic turn */
export function endStrategicTurn(state: StrategicGameState): StrategicGameState {
  const nextFaction: Faction = state.currentFaction === 'red' ? 'blue' : 'red';
  const nextTurn = nextFaction === 'red' ? state.turn + 1 : state.turn;

  // Reset all forces of the NEXT faction
  const newForces = state.forces.map(f => ({
    ...f,
    canMove: f.faction === nextFaction ? f.isAlive : f.canMove,
    hasAttacked: f.faction === nextFaction ? false : f.hasAttacked,
  }));

  // Update map force references
  const newMap = {
    ...state.map,
    sectors: state.map.sectors.map(row =>
      row.map(sector => ({
        ...sector,
        force: sector.force
          ? newForces.find(f => f.id === sector.force!.id) || null
          : null,
      }))
    ),
  };

  // Check game over
  const redAlive = newForces.filter(f => f.faction === 'red' && f.isAlive).length;
  const blueAlive = newForces.filter(f => f.faction === 'blue' && f.isAlive).length;
  let winner: Faction | null = state.winner;
  let phase: StrategicGameState['phase'] = nextFaction === 'blue' ? 'aiTurn' : 'selectForce';

  if (redAlive === 0) { winner = 'blue'; phase = 'gameOver'; }
  else if (blueAlive === 0) { winner = 'red'; phase = 'gameOver'; }

  const visibility = calculateStrategicVisibility(
    { ...state, map: newMap, forces: newForces, currentFaction: nextFaction } as StrategicGameState,
    nextFaction,
  );

  let newState: StrategicGameState = {
    ...state,
    map: newMap,
    forces: newForces,
    currentFaction: nextFaction,
    turn: nextTurn,
    phase,
    selectedForce: null,
    movableSectors: [],
    attackableSectors: [],
    winner,
    visibleSectors: visibility,
  };

  // Process reinforcements when a new full turn begins (red's turn start)
  newState = processReinforcements(newState);

  return newState;
}

/** Calculate visible sectors for a faction */
export function calculateStrategicVisibility(
  state: StrategicGameState,
  faction: Faction,
): Set<string> {
  const visible = new Set<string>();
  const factionForces = state.forces.filter(f => f.faction === faction && f.isAlive);

  for (const force of factionForces) {
    // The sector the force is in is always visible
    visible.add(`${force.position.x},${force.position.y}`);

    // BFS to reveal sectors within vision range
    const queue: { pos: StrategicPosition; remaining: number }[] = [
      { pos: force.position, remaining: force.vision },
    ];
    const visited = new Set<string>();
    visited.add(`${force.position.x},${force.position.y}`);

    while (queue.length > 0) {
      const current = queue.shift()!;

      for (const neighbor of getStrategicNeighbors(state.map, current.pos)) {
        const key = `${neighbor.x},${neighbor.y}`;
        if (visited.has(key)) continue;
        visited.add(key);

        const sector = getSector(state.map, neighbor);
        if (!sector) continue;

        const terrainConfig = STRATEGIC_TERRAIN_CONFIGS[sector.terrain];
        const cost = sector.terrain === 'mountain' || sector.terrain === 'highland' ? 2 : 1;
        const remaining = current.remaining - cost;

        if (remaining < 0) continue;

        visible.add(key);
        queue.push({ pos: neighbor, remaining });
      }
    }
  }

  return visible;
}

/** Select a force */
export function selectStrategicForce(
  state: StrategicGameState,
  force: StrategicForce,
): StrategicGameState {
  if (!force.isAlive) return state;
  if (force.faction !== state.currentFaction) return state;

  const movable = getMovableSectors(state, force);
  const attackable = getAttackableSectors(state, force);

  return {
    ...state,
    selectedForce: force,
    movableSectors: movable,
    attackableSectors: attackable,
    phase: 'moveForce',
  };
}

/** Deselect force */
export function deselectStrategicForce(state: StrategicGameState): StrategicGameState {
  return {
    ...state,
    selectedForce: null,
    movableSectors: [],
    attackableSectors: [],
    phase: 'selectForce',
  };
}

// ===== AI Logic =====

/** Strategic AI difficulty parameters */
const STRATEGIC_AI_PARAMS: Record<AIDifficulty, {
  moveRandomness: number;
  attackRandomness: number;
  skipAttackChance: number;
  preferWeakTarget: number;
}> = {
  easy: {
    moveRandomness: 0.5,
    attackRandomness: 0.4,
    skipAttackChance: 0.1,
    preferWeakTarget: 0.3,
  },
  normal: {
    moveRandomness: 0.15,
    attackRandomness: 0.1,
    skipAttackChance: 0.01,
    preferWeakTarget: 0.7,
  },
  hard: {
    moveRandomness: 0,
    attackRandomness: 0,
    skipAttackChance: 0,
    preferWeakTarget: 1.0,
  },
};

/** Evaluate a strategic position for a force */
function evaluateStrategicPosition(
  force: StrategicForce,
  pos: StrategicPosition,
  state: StrategicGameState,
  allAiForces: StrategicForce[],
): number {
  let score = 0;
  const sector = getSector(state.map, pos);
  if (!sector) return -100;

  const terrainConfig = STRATEGIC_TERRAIN_CONFIGS[sector.terrain];

  // Terrain defense bonus
  score += (terrainConfig.defenseModifier - 1) * 30;

  // City sectors are strategically valuable (reduced to prevent city-stalling)
  if (sector.terrain === 'city') score += 10;

  // Proximity to friendly forces (formation bonus)
  for (const friend of allAiForces) {
    if (friend.id === force.id || !friend.isAlive) continue;
    const dist = Math.abs(pos.x - friend.position.x) + Math.abs(pos.y - friend.position.y);
    if (dist <= 2) score += 8;
    if (dist <= 4) score += 3;
    if (dist > 6) score -= dist * 0.3;
  }

  // Proximity to enemy forces
  const enemyForces = state.forces.filter(f => f.faction !== force.faction && f.isAlive);
  for (const enemy of enemyForces) {
    const dist = Math.abs(pos.x - enemy.position.x) + Math.abs(pos.y - enemy.position.y);
    if (dist <= 1) {
      // Adjacent to enemy — evaluate attack opportunity
      if (force.combatPower > enemy.defensePower) {
        score += 25; // Strong attack opportunity
      } else if (force.combatPower > enemy.defensePower * 0.7) {
        score += 10; // Risky attack
      } else {
        score -= 15; // Too risky
      }
    } else if (dist <= 3) {
      score += 5; // Approaching enemy
    }
  }

  // Different force types have different strategic preferences
  if (force.name.includes('炮兵') || force.name.includes('火箭')) {
    // Artillery should stay behind the front line
    const frontLineForces = allAiForces.filter(f =>
      f.id !== force.id && f.isAlive && !f.name.includes('炮兵') && !f.name.includes('补给')
    );
    if (frontLineForces.length > 0) {
      const avgFrontX = frontLineForces.reduce((sum, f) => sum + f.position.x, 0) / frontLineForces.length;
      // Blue side: higher x = further from front, so artillery should be at higher x
      const distFromFront = pos.x - avgFrontX;
      if (distFromFront >= 2) score += 15;
      else if (distFromFront >= 1) score += 5;
      else score -= 20;
    }
  }

  if (force.name.includes('侦察')) {
    // Recon should push forward and flank
    score += (9 - pos.x) * 2; // Move toward enemy side
    const edgeDist = Math.min(pos.y, 7 - pos.y);
    if (edgeDist <= 1) score += 10; // Flanking
  }

  if (force.name.includes('防空') || force.name.includes('补给')) {
    // Support units should stay near friendly clusters
    const nearbyFriends = allAiForces.filter(f =>
      f.id !== force.id && f.isAlive &&
      Math.abs(pos.x - f.position.x) + Math.abs(pos.y - f.position.y) <= 2
    );
    score += nearbyFriends.length * 8;
    // Avoid front line
    const frontForces = allAiForces.filter(f =>
      f.id !== force.id && f.isAlive && (f.name.includes('装甲') || f.name.includes('步兵'))
    );
    if (frontForces.length > 0) {
      const avgFrontX = frontForces.reduce((sum, f) => sum + f.position.x, 0) / frontForces.length;
      if (pos.x < avgFrontX) score -= 15;
    }
  }

  // General: move toward enemy territory (strong advance bonus)
  score += (9 - pos.x) * 5;

  // Reinforcement proximity bonus — move near expected spawn points
  if (state.reinforcements) {
    const turnsUntilReinforcement = state.reinforcements.nextReinforcementTurn - state.turn;
    if (turnsUntilReinforcement <= 3 && turnsUntilReinforcement > 0) {
      // AI should position forces near faction spawn edge to protect incoming reinforcements
      const spawnEdgeX = 1; // Red reinforcements spawn near x=1
      const distToSpawn = Math.abs(pos.x - spawnEdgeX);
      if (distToSpawn <= 2) score += (3 - turnsUntilReinforcement) * 3;
    }
  }

  return score;
}

/** AI execute action for a single force */
function aiActForce(
  state: StrategicGameState,
  force: StrategicForce,
  difficulty: AIDifficulty,
  allAiForces: StrategicForce[],
): StrategicGameState {
  const params = STRATEGIC_AI_PARAMS[difficulty];
  let currentState = { ...state };

  if (!force.canMove || !force.isAlive) return currentState;

  // 1. Check if there's an adjacent enemy to attack
  const attackable = getAttackableSectors(currentState, force);

  if (attackable.length > 0 && Math.random() > params.skipAttackChance) {
    // Choose best target to attack
    let bestTarget = attackable[0];
    let bestScore = -Infinity;

    for (const target of attackable) {
      const sector = getSector(currentState.map, target);
      if (!sector || !sector.force) continue;

      let score = 0;
      const enemy = sector.force;

      // Prefer weaker enemies
      const powerRatio = force.combatPower / Math.max(enemy.defensePower, 1);
      score += powerRatio * 30 * params.preferWeakTarget;

      // City sectors are high value targets
      if (sector.terrain === 'city') score += 15;

      // Terrain defense modifier — prefer attacking in favorable terrain
      const terrainConfig = STRATEGIC_TERRAIN_CONFIGS[sector.terrain];
      score -= (terrainConfig.defenseModifier - 1) * 20; // Penalize attacking into defensive terrain

      // Damaged enemies are easier targets
      const totalUnits = enemy.units.reduce((sum, u) => sum + u.count, 0);
      score += (1 - totalUnits / 10) * 10; // Approximate weakness

      // Flanking bonus: prefer attacking enemies adjacent to other friendly forces
      const enemyNeighbors = getStrategicNeighbors(currentState.map, target);
      let adjacentFriendlies = 0;
      for (const nb of enemyNeighbors) {
        const nbSector = getSector(currentState.map, nb);
        if (nbSector?.force && nbSector.force.faction === force.faction && nbSector.force.isAlive) {
          adjacentFriendlies++;
        }
      }
      if (adjacentFriendlies >= 2) score += 15; // Strong flanking position
      else if (adjacentFriendlies >= 1) score += 8; // Basic flanking

      // Randomness
      score += (Math.random() - 0.5) * params.attackRandomness * 60;

      if (score > bestScore) {
        bestScore = score;
        bestTarget = target;
      }
    }

    // Move adjacent to target first if needed, then attack
    const dist = Math.abs(force.position.x - bestTarget.x) + Math.abs(force.position.y - bestTarget.y);
    if (dist === 1) {
      // Already adjacent, attack directly
      currentState = executeStrategicAttack(currentState, force, bestTarget);
    } else {
      // Need to move closer first — move to a sector adjacent to target
      currentState = executeStrategicAttack(currentState, force, bestTarget);
    }

    return currentState;
  }

  // 2. No adjacent enemy to attack — move toward strategic position
  const movable = getMovableSectors(currentState, force);

  if (movable.length > 0) {
    let bestPos = force.position;
    let bestScore = evaluateStrategicPosition(force, force.position, currentState, allAiForces);

    for (const pos of movable) {
      let score = evaluateStrategicPosition(force, pos, currentState, allAiForces);
      score += (Math.random() - 0.5) * params.moveRandomness * 50;

      if (score > bestScore) {
        bestScore = score;
        bestPos = pos;
      }
    }

    if (bestPos.x !== force.position.x || bestPos.y !== force.position.y) {
      // Check if the target sector has an enemy
      const targetSector = getSector(currentState.map, bestPos);
      if (targetSector?.force && targetSector.force.faction !== force.faction && targetSector.force.isAlive) {
        // Attack the enemy
        currentState = executeStrategicAttack(currentState, force, bestPos);
      } else {
        // Just move
        currentState = moveForce(currentState, force, bestPos);
      }
    } else {
      // Stay in place — mark as moved
      const newForces = currentState.forces.map(f =>
        f.id === force.id ? { ...f, canMove: false } : f
      );
      currentState = { ...currentState, forces: newForces };
    }
  } else {
    // No movable sectors — mark as moved
    const newForces = currentState.forces.map(f =>
      f.id === force.id ? { ...f, canMove: false } : f
    );
    currentState = { ...currentState, forces: newForces };
  }

  return currentState;
}

/** AI execute strategic turn */
export function aiExecuteStrategicTurn(state: StrategicGameState): StrategicGameState {
  const difficulty = state.aiDifficulty || 'normal';
  let currentState = { ...state };

  // Get all AI forces (blue side)
  const allAiForces = currentState.forces.filter(f => f.faction === 'blue' && f.isAlive);

  // Sort by action priority: recon > armor > mech_inf > combined > engineer > air_defense > artillery
  const priorityMap: Record<string, number> = {
    recon: 10,
    armor: 8,
    mech_inf: 7,
    combined: 6,
    engineer: 5,
    air_defense: 4,
    artillery: 3,
  };

  const sortedForces = [...allAiForces].sort((a, b) => {
    const aPriority = Object.entries(FORCE_TEMPLATES).find(
      ([_, tmpl]) => tmpl.name === a.name.replace(/^(红方|蓝方)第\d+/, '')
    );
    const bPriority = Object.entries(FORCE_TEMPLATES).find(
      ([_, tmpl]) => tmpl.name === b.name.replace(/^(红方|蓝方)第\d+/, '')
    );

    const aScore = aPriority ? priorityMap[aPriority[0]] || 0 : 0;
    const bScore = bPriority ? priorityMap[bPriority[0]] || 0 : 0;

    return bScore - aScore;
  });

  for (const force of sortedForces) {
    if (currentState.phase === 'gameOver') break;

    // Refresh force reference from current state
    const currentForce = currentState.forces.find(f => f.id === force.id);
    if (currentForce && currentForce.isAlive) {
      currentState = aiActForce(currentState, currentForce, difficulty, allAiForces);
    }
  }

  if (currentState.phase !== 'gameOver') {
    currentState = endStrategicTurn(currentState);
  }

  return currentState;
}

// ===== Quick Skip / Auto-resolve =====

/** Auto-play a strategic turn for the given faction using AI logic.
 *  For red player: lets the player skip their turn and let AI handle it. */
export function autoPlayStrategicTurn(state: StrategicGameState, faction: Faction = 'red'): StrategicGameState {
  if (state.phase === 'gameOver' || state.phase === 'deployment') return state;
  if (state.currentFaction !== faction) return state;

  const difficulty = state.aiDifficulty || 'normal';
  let currentState = { ...state };

  // Get all forces of the specified faction that are alive
  const allFactionForces = currentState.forces.filter(f => f.faction === faction && f.isAlive);

  // Sort by same priority as AI
  const priorityMap: Record<string, number> = {
    recon: 10,
    armor: 8,
    mech_inf: 7,
    combined: 6,
    engineer: 5,
    air_defense: 4,
    artillery: 3,
  };

  const sortedForces = [...allFactionForces].sort((a, b) => {
    const aPriority = Object.entries(FORCE_TEMPLATES).find(
      ([_, tmpl]) => tmpl.name === a.name.replace(/^(红方|蓝方)第\d+/, '')
    );
    const bPriority = Object.entries(FORCE_TEMPLATES).find(
      ([_, tmpl]) => tmpl.name === b.name.replace(/^(红方|蓝方)第\d+/, '')
    );

    const aScore = aPriority ? priorityMap[aPriority[0]] || 0 : 0;
    const bScore = bPriority ? priorityMap[bPriority[0]] || 0 : 0;

    return bScore - aScore;
  });

  for (const force of sortedForces) {
    if (currentState.phase === 'gameOver') break;

    // Refresh force reference from current state
    const currentForce = currentState.forces.find(f => f.id === force.id);
    if (currentForce && currentForce.isAlive) {
      currentState = aiActForce(currentState, currentForce, difficulty, allFactionForces);
    }
  }

  if (currentState.phase !== 'gameOver') {
    currentState = endStrategicTurn(currentState);
  }

  return currentState;
}

/** Quick resolve all combat — instantly process all red forces' actions at once
 *  without animation delays. Uses simplified logic: each red force attacks an
 *  adjacent enemy if possible, otherwise moves toward best position. */
export function quickResolveAll(state: StrategicGameState): StrategicGameState {
  if (state.phase === 'gameOver' || state.phase === 'deployment') return state;
  if (state.currentFaction !== 'red') return state;

  const difficulty = state.aiDifficulty || 'normal';
  let currentState = { ...state };

  // Process all red forces
  const redForces = currentState.forces.filter(f => f.faction === 'red' && f.isAlive && f.canMove);

  for (const force of redForces) {
    if (currentState.phase === 'gameOver') break;

    // Refresh force reference
    const currentForce = currentState.forces.find(f => f.id === force.id);
    if (!currentForce || !currentForce.isAlive) continue;

    // Check for adjacent enemies to attack first
    const attackable = getAttackableSectors(currentState, currentForce);

    if (attackable.length > 0) {
      // Attack the weakest adjacent enemy
      let bestTarget = attackable[0];
      let bestPowerRatio = -Infinity;

      for (const target of attackable) {
        const sector = getSector(currentState.map, target);
        if (!sector?.force) continue;

        const powerRatio = currentForce.combatPower / Math.max(sector.force.defensePower, 1);
        if (powerRatio > bestPowerRatio) {
          bestPowerRatio = powerRatio;
          bestTarget = target;
        }
      }

      currentState = executeStrategicAttack(currentState, currentForce, bestTarget);
    } else {
      // Move toward best strategic position
      const movable = getMovableSectors(currentState, currentForce);

      if (movable.length > 0) {
        const allRedForces = currentState.forces.filter(f => f.faction === 'red' && f.isAlive);
        let bestPos = currentForce.position;
        let bestScore = -Infinity;

        for (const pos of movable) {
          // Evaluate position but with a red-side perspective (move toward enemy = +x direction)
          const sector = getSector(currentState.map, pos);
          if (!sector) continue;

          let score = 0;
          const terrainConfig = STRATEGIC_TERRAIN_CONFIGS[sector.terrain];
          score += (terrainConfig.defenseModifier - 1) * 30;
          if (sector.terrain === 'city') score += 15;

          // Red side: move toward higher x (toward enemy)
          score += pos.x * 2;

          // Proximity to friendly forces
          for (const friend of allRedForces) {
            if (friend.id === currentForce.id || !friend.isAlive) continue;
            const dist = Math.abs(pos.x - friend.position.x) + Math.abs(pos.y - friend.position.y);
            if (dist <= 2) score += 8;
            if (dist <= 4) score += 3;
          }

          // Proximity to enemy forces
          const enemyForces = currentState.forces.filter(f => f.faction === 'blue' && f.isAlive);
          for (const enemy of enemyForces) {
            const dist = Math.abs(pos.x - enemy.position.x) + Math.abs(pos.y - enemy.position.y);
            if (dist <= 1 && currentForce.combatPower > enemy.defensePower) score += 25;
            else if (dist <= 3) score += 5;
          }

          if (score > bestScore) {
            bestScore = score;
            bestPos = pos;
          }
        }

        if (bestPos.x !== currentForce.position.x || bestPos.y !== currentForce.position.y) {
          const targetSector = getSector(currentState.map, bestPos);
          if (targetSector?.force && targetSector.force.faction !== currentForce.faction && targetSector.force.isAlive) {
            currentState = executeStrategicAttack(currentState, currentForce, bestPos);
          } else {
            currentState = moveForce(currentState, currentForce, bestPos);
          }
        }
      }

      // Mark force as moved even if staying in place
      const updatedForce = currentState.forces.find(f => f.id === currentForce.id);
      if (updatedForce && updatedForce.canMove) {
        const newForces = currentState.forces.map(f =>
          f.id === currentForce.id ? { ...f, canMove: false } : f
        );
        currentState = { ...currentState, forces: newForces };
      }
    }
  }

  // End the turn
  if (currentState.phase !== 'gameOver') {
    currentState = endStrategicTurn(currentState);
  }

  return currentState;
}

// ===== Deployment Phase =====

/** Deployment budget per side */
const STRATEGIC_DEPLOYMENT_BUDGET = 100;

/** Initialize strategic game in deployment phase */
export function initStrategicDeployment(difficulty: AIDifficulty = 'normal'): StrategicGameState {
  const map = generateStrategicMap();

  // Calculate deployment zones
  // Red: x 0-2, Blue: x 7-9
  const redZone: StrategicPosition[] = [];
  const blueZone: StrategicPosition[] = [];

  for (let y = 0; y < map.height; y++) {
    for (let x = 0; x < map.width; x++) {
      const sector = getSector(map, { x, y });
      if (!sector) continue;
      if (!STRATEGIC_TERRAIN_CONFIGS[sector.terrain].isPassable) continue;

      if (x >= 0 && x <= 2) {
        redZone.push({ x, y });
      }
      if (x >= 7 && x <= 9) {
        blueZone.push({ x, y });
      }
    }
  }

  const deployment: StrategicDeploymentInfo = {
    redBudget: STRATEGIC_DEPLOYMENT_BUDGET,
    blueBudget: STRATEGIC_DEPLOYMENT_BUDGET,
    redBudgetUsed: 0,
    blueBudgetUsed: 0,
    deploymentZones: {
      red: redZone,
      blue: blueZone,
    },
  };

  const state: StrategicGameState = {
    map,
    forces: [],
    currentFaction: 'red',
    turn: 1,
    phase: 'deployment',
    selectedForce: null,
    movableSectors: [],
    attackableSectors: [],
    winner: null,
    combatLog: [],
    aiDifficulty: difficulty,
    visibleSectors: new Set<string>(
      [...redZone, ...blueZone].map(p => `${p.x},${p.y}`)
    ),
    deployment,
    reinforcements: {
      nextReinforcementTurn: 8,
      redReinforcementsRemaining: 3,
      blueReinforcementsRemaining: 3,
      maxReinforcements: 3,
      reinforcementForceTemplate: 'mech_inf',
      lastSpawnPositions: { red: null, blue: null },
    },
  };

  return state;
}

/** Get the current budget remaining for a faction */
export function getDeploymentBudget(state: StrategicGameState, faction: Faction): number {
  if (!state.deployment) return 0;
  const used = faction === 'red' ? state.deployment.redBudgetUsed : state.deployment.blueBudgetUsed;
  const total = faction === 'red' ? state.deployment.redBudget : state.deployment.blueBudget;
  return total - used;
}

/** Deploy a force from template at a position during deployment phase */
export function deployForce(
  state: StrategicGameState,
  templateKey: string,
  faction: Faction,
  position: StrategicPosition,
): StrategicGameState {
  if (state.phase !== 'deployment') return state;

  const template = FORCE_TEMPLATES[templateKey];
  if (!template) return state;

  // Check budget
  const budgetRemaining = getDeploymentBudget(state, faction);
  if (template.cost > budgetRemaining) return state;

  // Check deployment zone
  const zone = faction === 'red' ? state.deployment!.deploymentZones.red : state.deployment!.deploymentZones.blue;
  const inZone = zone.some(p => p.x === position.x && p.y === position.y);
  if (!inZone) return state;

  // Check sector is passable and empty
  const sector = getSector(state.map, position);
  if (!sector || !STRATEGIC_TERRAIN_CONFIGS[sector.terrain].isPassable || sector.force) return state;

  // Count ordinal for naming
  const factionForces = state.forces.filter(f => f.faction === faction);
  const sameTemplateCount = factionForces.filter(f => {
    const tmpl = FORCE_TEMPLATES[templateKey];
    return tmpl && f.name.includes(tmpl.name);
  }).length;

  const force = createForce(templateKey, faction, position, sameTemplateCount + 1);

  // Deep copy map and place force
  const newMap = {
    ...state.map,
    sectors: state.map.sectors.map(row =>
      row.map(s => ({ ...s, force: s.force ? { ...s.force, units: s.force.units.map(u => ({ ...u })) } : null }))
    ),
  };

  const targetSector = getSector(newMap, position);
  if (targetSector) targetSector.force = force;

  const newForces = [...state.forces, force];

  // Update budget
  const newDeployment = { ...state.deployment! };
  if (faction === 'red') {
    newDeployment.redBudgetUsed += template.cost;
  } else {
    newDeployment.blueBudgetUsed += template.cost;
  }

  return {
    ...state,
    map: newMap,
    forces: newForces,
    deployment: newDeployment,
  };
}

/** Remove a deployed force during deployment phase */
export function removeDeployedForce(state: StrategicGameState, forceId: string): StrategicGameState {
  if (state.phase !== 'deployment') return state;

  const force = state.forces.find(f => f.id === forceId);
  if (!force) return state;

  // Find the template key for the force to refund cost
  const templateKey = Object.entries(FORCE_TEMPLATES).find(
    ([_, tmpl]) => tmpl.name === force.name.replace(/^(红方|蓝方)第\d+/, '')
  )?.[0];

  const template = templateKey ? FORCE_TEMPLATES[templateKey] : null;

  // Deep copy map and remove force from sector
  const newMap = {
    ...state.map,
    sectors: state.map.sectors.map(row =>
      row.map(s => ({ ...s, force: s.force ? { ...s.force, units: s.force.units.map(u => ({ ...u })) } : null }))
    ),
  };

  const sector = getSector(newMap, force.position);
  if (sector && sector.force?.id === forceId) {
    sector.force = null;
  }

  const newForces = state.forces.filter(f => f.id !== forceId);

  // Refund budget
  const newDeployment = { ...state.deployment! };
  if (template) {
    if (force.faction === 'red') {
      newDeployment.redBudgetUsed = Math.max(0, newDeployment.redBudgetUsed - template.cost);
    } else {
      newDeployment.blueBudgetUsed = Math.max(0, newDeployment.blueBudgetUsed - template.cost);
    }
  }

  return {
    ...state,
    map: newMap,
    forces: newForces,
    deployment: newDeployment,
  };
}

/** Confirm deployment and start the game.
 *  Auto-deploys blue forces if they haven't been deployed. */
export function confirmDeployment(state: StrategicGameState): StrategicGameState {
  if (state.phase !== 'deployment') return state;

  // Auto-deploy blue forces if none deployed
  let currentState = { ...state };
  const blueForces = currentState.forces.filter(f => f.faction === 'blue');
  if (blueForces.length === 0) {
    currentState = autoDeployBlueForces(currentState);
  }

  // Ensure red has at least 1 force
  const redForces = currentState.forces.filter(f => f.faction === 'red');
  if (redForces.length === 0) {
    // Can't start without any red forces
    return state;
  }

  // Calculate visibility for red side
  const visibility = calculateStrategicVisibility(currentState, 'red');

  return {
    ...currentState,
    phase: 'selectForce',
    selectedForce: null,
    movableSectors: [],
    attackableSectors: [],
    visibleSectors: visibility,
  };
}

/** Auto-deploy blue forces using AI logic during deployment */
function autoDeployBlueForces(state: StrategicGameState): StrategicGameState {
  let currentState = { ...state };
  const blueZone = state.deployment!.deploymentZones.blue;
  const budget = state.deployment!.blueBudget - state.deployment!.blueBudgetUsed;

  // Template keys sorted by priority for AI deployment
  const deployPriority = ['armor', 'mech_inf', 'artillery', 'recon', 'air_defense', 'engineer', 'combined'];

  let remainingBudget = budget;
  let attempts = 0;
  const maxAttempts = 50; // Prevent infinite loops

  for (const key of deployPriority) {
    if (attempts >= maxAttempts) break;
    const template = FORCE_TEMPLATES[key];
    if (!template) continue;

    // Try to deploy 1 of each template if budget allows
    if (template.cost <= remainingBudget) {
      // Find a passable, empty sector in the blue zone
      const availablePositions = blueZone.filter(p => {
        const sector = getSector(currentState.map, p);
        return sector && STRATEGIC_TERRAIN_CONFIGS[sector.terrain].isPassable && !sector.force;
      });

      if (availablePositions.length > 0) {
        // Pick a position toward the center of the zone
        const centerPos = availablePositions.reduce((best, pos) => {
          const score = pos.y * 2 + (9 - Math.abs(pos.x - 8)); // Prefer center-y and right side
          const bestScore = best.y * 2 + (9 - Math.abs(best.x - 8));
          return score > bestScore ? pos : best;
        }, availablePositions[0]);

        currentState = deployForce(currentState, key, 'blue', centerPos);
        if (currentState.forces.some(f => f.faction === 'blue' && f.name.includes(template.name))) {
          remainingBudget -= template.cost;
        }
      }
    }
    attempts++;
  }

  // If still budget remaining, try deploying more forces
  while (remainingBudget >= 14 && attempts < maxAttempts) {
    for (const key of deployPriority) {
      const template = FORCE_TEMPLATES[key];
      if (!template || template.cost > remainingBudget) continue;

      const availablePositions = blueZone.filter(p => {
        const sector = getSector(currentState.map, p);
        return sector && STRATEGIC_TERRAIN_CONFIGS[sector.terrain].isPassable && !sector.force;
      });

      if (availablePositions.length > 0) {
        const pos = availablePositions[Math.floor(Math.random() * availablePositions.length)];
        currentState = deployForce(currentState, key, 'blue', pos);
        if (currentState.forces.length > (currentState.forces.length - 1)) {
          remainingBudget -= template.cost;
        }
      }
    }
    attempts++;
  }

  return currentState;
}
