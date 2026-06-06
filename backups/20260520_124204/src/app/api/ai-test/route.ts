// ===== AI Win Rate Test API =====
// Runs AI vs AI games and returns win rate statistics

import { NextRequest, NextResponse } from 'next/server';
import { initGameState, getMovablePositions, getAttackablePositions, moveUnit, attackUnit, endTurn } from '@/game/engine';
import { aiExecuteTurn } from '@/game/ai';
import { initStrategicGame, aiExecuteStrategicTurn, endStrategicTurn, getMovableSectors, getAttackableSectors, moveForce, executeStrategicAttack, FORCE_TEMPLATES } from '@/game/strategic-engine';
import { getSector } from '@/game/strategic-map';
import { TERRAIN_CONFIGS, UNIT_CONFIGS, MAP_WIDTH, MAP_HEIGHT } from '@/game/config';
import { STRATEGIC_TERRAIN_CONFIGS } from '@/game/strategic-types';
import type { AIDifficulty, Faction, GameState, Unit, Position } from '@/game/types';
import type { StrategicGameState, StrategicForce, StrategicPosition } from '@/game/strategic-types';

interface AITestRequest {
  gameCount: number;
  difficulty: AIDifficulty;
  mode: 'tactical' | 'strategic';
}

interface GameResult {
  winner: Faction | 'draw';
  turns: number;
}

interface AITestSummary {
  redWins: number;
  blueWins: number;
  draws: number;
  avgTurns: number;
  redWinRate: number;
}

interface AITestResponse {
  results: GameResult[];
  summary: AITestSummary;
}

const MAX_GAMES = 100;
const MAX_TURNS_TACTICAL = 200;
const MAX_TURNS_STRATEGIC = 100;

function manhattanDist(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
}

/** Evaluate position for any faction's AI */
function evaluatePositionForFaction(
  unit: Unit,
  pos: Position,
  state: GameState,
  allAiUnits: Unit[],
  faction: Faction,
): number {
  let score = 0;
  const cell = state.map.cells[pos.z]?.[pos.x];
  if (!cell) return -100;

  const terrainConfig = TERRAIN_CONFIGS[cell.terrain];
  score += terrainConfig.stats.defenseBonus * 0.5;

  const friendlyUnits = allAiUnits.filter(u => u.id !== unit.id && u.isAlive);
  let nearbyFriendCount = 0;
  let closestFriendlyDist = Infinity;

  for (const friend of friendlyUnits) {
    const dist = manhattanDist(pos, friend.position);
    if (dist <= 3) nearbyFriendCount++;
    closestFriendlyDist = Math.min(closestFriendlyDist, dist);
  }

  if (nearbyFriendCount >= 1) score += nearbyFriendCount * 5;
  if (nearbyFriendCount >= 2) score += 8;
  if (closestFriendlyDist > 5) score -= closestFriendlyDist * 0.5;

  // Forward direction: red pushes right (increasing x), blue pushes left (decreasing x)
  const forwardScore = faction === 'red' ? pos.x : (MAP_WIDTH - 1 - pos.x);

  if (unit.type === 'artillery' || unit.type === 'mlrs') {
    const frontLine = friendlyUnits
      .filter(u => u.type !== 'artillery' && u.type !== 'mlrs')
      .reduce((min, u) => {
        const uForward = faction === 'red' ? u.position.x : (MAP_WIDTH - 1 - u.position.x);
        return Math.min(min, uForward);
      }, MAP_WIDTH);
    const myForward = faction === 'red' ? pos.x : (MAP_WIDTH - 1 - pos.x);
    const distFromFront = frontLine - myForward; // Positive = behind front
    if (distFromFront >= 2) score += 15;
    else if (distFromFront >= 1) score += 5;
    else score -= 20;

    const enemies = state.units.filter(u => u.faction !== unit.faction && u.isAlive);
    if (enemies.some(e => manhattanDist(pos, e.position) <= unit.stats.attackRange)) {
      score += 25;
    }
  }

  if (unit.type === 'scout') {
    const edgeDist = Math.min(pos.z, MAP_HEIGHT - 1 - pos.z);
    if (edgeDist <= 2) score += 10;
    score += forwardScore * 1.5;
  }

  const enemies = state.units.filter(u => u.faction !== unit.faction && u.isAlive);
  for (const enemy of enemies) {
    const dist = manhattanDist(pos, enemy.position);
    if (dist <= unit.stats.attackRange) {
      score += 30;
      score += (1 - enemy.stats.hp / enemy.stats.maxHp) * 20;
    } else if (dist <= unit.stats.attackRange + 2) {
      score += 10;
    }
  }

  if (unit.type === 'tank' || unit.type === 'ifv') {
    score += forwardScore * 0.5;
  }

  if (unit.type === 'infantry') {
    if (cell.terrain === 'city') score += 30;
    if (cell.terrain === 'fortress') score += 35;
    if (cell.terrain === 'forest') score += 10;
  }

  if (unit.type === 'helicopter') {
    score += forwardScore * 1.0;
    for (const enemy of enemies) {
      const dist = manhattanDist(pos, enemy.position);
      if (dist <= unit.stats.attackRange) {
        score += 35;
        if (enemy.type === 'artillery' || enemy.type === 'mlrs') score += 20;
        if (enemy.type === 'supply') score += 15;
      }
    }
  }

  if (unit.type === 'sam') {
    const nearbyFriendCount2 = friendlyUnits.filter(u => manhattanDist(pos, u.position) <= 3).length;
    score += nearbyFriendCount2 * 8;
  }

  if (unit.type === 'supply') {
    const injuredFriend = friendlyUnits.filter(u => u.stats.hp < u.stats.maxHp * 0.8);
    for (const friend of injuredFriend) {
      const dist = manhattanDist(pos, friend.position);
      if (dist <= 2) score += 15;
      else if (dist <= 4) score += 5;
    }
  }

  return score;
}

/** Difficulty parameters for AI */
const DIFF_PARAMS: Record<AIDifficulty, {
  targetRandomness: number;
  moveRandomness: number;
  skipAttackChance: number;
  preferLowHp: number;
  suboptimalMoveChance: number;
}> = {
  easy: { targetRandomness: 0.7, moveRandomness: 0.5, skipAttackChance: 0.3, preferLowHp: 0.1, suboptimalMoveChance: 0.3 },
  normal: { targetRandomness: 0.2, moveRandomness: 0.1, skipAttackChance: 0.05, preferLowHp: 0.5, suboptimalMoveChance: 0 },
  hard: { targetRandomness: 0, moveRandomness: 0, skipAttackChance: 0, preferLowHp: 1.0, suboptimalMoveChance: 0 },
};

/** Execute AI turn for any faction (tactical) */
function executeFactionAITurn(state: GameState, faction: Faction, difficulty: AIDifficulty): GameState {
  const params = DIFF_PARAMS[difficulty];
  const makeSuboptimalMove = Math.random() < params.suboptimalMoveChance;
  let currentState = state;

  const allAiUnits = currentState.units.filter(u => u.faction === faction && u.isAlive);
  const priority: Record<string, number> = {
    scout: 10, helicopter: 9, ifv: 8, tank: 7, engineer: 6, infantry: 5, sam: 4, artillery: 3, mlrs: 2, supply: 1,
  };
  const aiUnits = [...allAiUnits].sort((a, b) => (priority[b.type] || 0) - (priority[a.type] || 0));

  for (const unitRef of aiUnits) {
    if (currentState.phase === 'gameOver') break;
    const unit = currentState.units.find(u => u.id === unitRef.id);
    if (!unit || !unit.isAlive) continue;

    // Move
    if (unit.canMove) {
      const movable = getMovablePositions(currentState, unit);
      if (movable.length > 0) {
        let bestPos = unit.position;
        let bestScore = evaluatePositionForFaction(unit, unit.position, currentState, allAiUnits, faction);

        for (const pos of movable) {
          let score = evaluatePositionForFaction(unit, pos, currentState, allAiUnits, faction);
          score += (Math.random() - 0.5) * params.moveRandomness * 50;
          if (makeSuboptimalMove) score += (Math.random() - 0.5) * 80;
          if (score > bestScore) { bestScore = score; bestPos = pos; }
        }

        if (bestPos.x !== unit.position.x || bestPos.z !== unit.position.z) {
          currentState = moveUnit(currentState, unit, bestPos);
        } else {
          const newUnits = currentState.units.map(u =>
            u.id === unit.id ? { ...u, canMove: false } : u
          );
          currentState = { ...currentState, units: newUnits, selectedUnit: null, movablePositions: [], attackablePositions: [] };
        }
      }
    }

    // Attack
    const updatedUnit = currentState.units.find(u => u.id === unitRef.id);
    if (updatedUnit && updatedUnit.canAttack && updatedUnit.isAlive) {
      const attackable = getAttackablePositions(currentState, updatedUnit);
      if (attackable.length > 0) {
        if (Math.random() >= params.skipAttackChance) {
          let bestTarget = attackable[0];
          let bestPriority = -Infinity;

          for (const targetPos of attackable) {
            const target = currentState.units.find(u =>
              u.position.x === targetPos.x && u.position.z === targetPos.z && u.isAlive && u.faction !== faction
            );
            if (!target) continue;

            let pScore = 0;
            pScore += (1 - target.stats.hp / target.stats.maxHp) * 40 * params.preferLowHp;
            pScore += target.stats.attack * 0.5;
            pScore += target.type === 'artillery' ? 15 : 0;
            pScore += target.type === 'mlrs' ? 15 : 0;
            pScore += target.type === 'tank' ? 10 : 0;
            pScore += (Math.random() - 0.5) * params.targetRandomness * 50;

            if (pScore > bestPriority) { bestPriority = pScore; bestTarget = targetPos; }
          }

          currentState = attackUnit(currentState, updatedUnit, bestTarget);
        } else {
          const newUnits = currentState.units.map(u =>
            u.id === unitRef.id ? { ...u, canAttack: false } : u
          );
          currentState = { ...currentState, units: newUnits };
        }
      } else {
        const newUnits = currentState.units.map(u =>
          u.id === unitRef.id ? { ...u, canAttack: false } : u
        );
        currentState = { ...currentState, units: newUnits };
      }
    }

    if (currentState.phase === 'gameOver') break;
  }

  if (currentState.phase !== 'gameOver') {
    currentState = endTurn(currentState);
  }

  return currentState;
}

/** Run a single tactical AI vs AI game */
function runTacticalGame(difficulty: AIDifficulty): GameResult {
  let state = initGameState(difficulty, 'random');
  let turns = 0;

  while (state.phase !== 'gameOver' && turns < MAX_TURNS_TACTICAL) {
    if (state.currentFaction === 'red') {
      state = executeFactionAITurn(state, 'red', difficulty);
    } else {
      // Use existing blue AI
      state = aiExecuteTurn(state);
    }
    turns++;
  }

  if (state.winner) {
    return { winner: state.winner, turns };
  }

  const redAlive = state.units.filter(u => u.faction === 'red' && u.isAlive).length;
  const blueAlive = state.units.filter(u => u.faction === 'blue' && u.isAlive).length;

  if (redAlive > blueAlive) return { winner: 'red' as Faction, turns };
  if (blueAlive > redAlive) return { winner: 'blue' as Faction, turns };
  return { winner: 'draw', turns };
}

/** Evaluate strategic position for any faction */
function evaluateStrategicPositionForFaction(
  force: StrategicForce,
  pos: StrategicPosition,
  state: StrategicGameState,
  allAiForces: StrategicForce[],
  faction: Faction,
): number {
  let score = 0;
  const sector = getSector(state.map, pos);
  if (!sector) return -100;

  const terrainConfig = STRATEGIC_TERRAIN_CONFIGS[sector.terrain];
  score += (terrainConfig.defenseModifier - 1) * 30;
  if (sector.terrain === 'city') score += 15;

  for (const friend of allAiForces) {
    if (friend.id === force.id || !friend.isAlive) continue;
    const dist = Math.abs(pos.x - friend.position.x) + Math.abs(pos.y - friend.position.y);
    if (dist <= 2) score += 8;
    if (dist <= 4) score += 3;
    if (dist > 6) score -= dist * 0.3;
  }

  const enemyForces = state.forces.filter(f => f.faction !== faction && f.isAlive);
  for (const enemy of enemyForces) {
    const dist = Math.abs(pos.x - enemy.position.x) + Math.abs(pos.y - enemy.position.y);
    if (dist <= 1) {
      if (force.combatPower > enemy.defensePower) score += 25;
      else if (force.combatPower > enemy.defensePower * 0.7) score += 10;
      else score -= 15;
    } else if (dist <= 3) {
      score += 5;
    }
  }

  // Red pushes right (increasing x), blue pushes left (decreasing x)
  const forwardDir = faction === 'red' ? pos.x : (9 - pos.x);
  score += forwardDir * 0.5;

  return score;
}

/** Strategic AI difficulty params */
const STRAT_PARAMS: Record<AIDifficulty, {
  moveRandomness: number;
  attackRandomness: number;
  skipAttackChance: number;
  preferWeakTarget: number;
}> = {
  easy: { moveRandomness: 0.5, attackRandomness: 0.4, skipAttackChance: 0.25, preferWeakTarget: 0.2 },
  normal: { moveRandomness: 0.15, attackRandomness: 0.1, skipAttackChance: 0.05, preferWeakTarget: 0.6 },
  hard: { moveRandomness: 0, attackRandomness: 0, skipAttackChance: 0, preferWeakTarget: 1.0 },
};

/** Execute strategic AI turn for any faction */
function executeFactionStrategicAITurn(state: StrategicGameState, faction: Faction, difficulty: AIDifficulty): StrategicGameState {
  const params = STRAT_PARAMS[difficulty];
  let currentState = { ...state };
  const allAiForces = currentState.forces.filter(f => f.faction === faction && f.isAlive);

  for (const forceRef of allAiForces) {
    if (currentState.phase === 'gameOver') break;
    const force = currentState.forces.find(f => f.id === forceRef.id);
    if (!force || !force.isAlive || !force.canMove) continue;

    // Attack check
    const attackable = getAttackableSectors(currentState, force);
    if (attackable.length > 0 && Math.random() > params.skipAttackChance) {
      let bestTarget = attackable[0];
      let bestScore = -Infinity;
      for (const target of attackable) {
        const sector = getSector(currentState.map, target);
        if (!sector?.force) continue;
        let score = 0;
        const enemy = sector.force;
        const powerRatio = force.combatPower / Math.max(enemy.defensePower, 1);
        score += powerRatio * 30 * params.preferWeakTarget;
        if (sector.terrain === 'city') score += 15;
        const terrainConfig = STRATEGIC_TERRAIN_CONFIGS[sector.terrain];
        score -= (terrainConfig.defenseModifier - 1) * 20;
        score += (Math.random() - 0.5) * params.attackRandomness * 60;
        if (score > bestScore) { bestScore = score; bestTarget = target; }
      }
      currentState = executeStrategicAttack(currentState, force, bestTarget);
      continue;
    }

    // Move
    const movable = getMovableSectors(currentState, force);
    if (movable.length > 0) {
      let bestPos = force.position;
      let bestScore = evaluateStrategicPositionForFaction(force, force.position, currentState, allAiForces, faction);

      for (const pos of movable) {
        let score = evaluateStrategicPositionForFaction(force, pos, currentState, allAiForces, faction);
        score += (Math.random() - 0.5) * params.moveRandomness * 50;
        if (score > bestScore) { bestScore = score; bestPos = pos; }
      }

      if (bestPos.x !== force.position.x || bestPos.y !== force.position.y) {
        const targetSector = getSector(currentState.map, bestPos);
        if (targetSector?.force && targetSector.force.faction !== faction && targetSector.force.isAlive) {
          currentState = executeStrategicAttack(currentState, force, bestPos);
        } else {
          currentState = moveForce(currentState, force, bestPos);
        }
      } else {
        const newForces = currentState.forces.map(f =>
          f.id === force.id ? { ...f, canMove: false } : f
        );
        currentState = { ...currentState, forces: newForces };
      }
    } else {
      const newForces = currentState.forces.map(f =>
        f.id === force.id ? { ...f, canMove: false } : f
      );
      currentState = { ...currentState, forces: newForces };
    }
  }

  if (currentState.phase !== 'gameOver') {
    currentState = endStrategicTurn(currentState);
  }

  return currentState;
}

/** Run a single strategic AI vs AI game */
function runStrategicGame(difficulty: AIDifficulty): GameResult {
  let state = initStrategicGame(difficulty);
  let turns = 0;

  while (state.phase !== 'gameOver' && turns < MAX_TURNS_STRATEGIC) {
    if (state.currentFaction === 'red') {
      state = executeFactionStrategicAITurn(state, 'red', difficulty);
    } else {
      state = aiExecuteStrategicTurn(state);
    }
    turns++;
  }

  if (state.winner) {
    return { winner: state.winner, turns };
  }

  const redAlive = state.forces.filter(f => f.faction === 'red' && f.isAlive).length;
  const blueAlive = state.forces.filter(f => f.faction === 'blue' && f.isAlive).length;

  if (redAlive > blueAlive) return { winner: 'red' as Faction, turns };
  if (blueAlive > redAlive) return { winner: 'blue' as Faction, turns };
  return { winner: 'draw', turns };
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json() as AITestRequest;
    const { gameCount, difficulty, mode } = body;

    if (!gameCount || gameCount < 1 || gameCount > MAX_GAMES) {
      return NextResponse.json(
        { error: `gameCount must be between 1 and ${MAX_GAMES}` },
        { status: 400 },
      );
    }

    if (!['easy', 'normal', 'hard'].includes(difficulty)) {
      return NextResponse.json(
        { error: 'difficulty must be easy, normal, or hard' },
        { status: 400 },
      );
    }

    if (!['tactical', 'strategic'].includes(mode)) {
      return NextResponse.json(
        { error: 'mode must be tactical or strategic' },
        { status: 400 },
      );
    }

    const results: GameResult[] = [];

    for (let i = 0; i < gameCount; i++) {
      const result = mode === 'tactical'
        ? runTacticalGame(difficulty)
        : runStrategicGame(difficulty);
      results.push(result);
    }

    const redWins = results.filter(r => r.winner === 'red').length;
    const blueWins = results.filter(r => r.winner === 'blue').length;
    const draws = results.filter(r => r.winner === 'draw').length;
    const avgTurns = Math.round(results.reduce((sum, r) => sum + r.turns, 0) / results.length);
    const redWinRate = Math.round((redWins / gameCount) * 1000) / 10;

    const response: AITestResponse = {
      results,
      summary: { redWins, blueWins, draws, avgTurns, redWinRate },
    };

    return NextResponse.json(response);
  } catch (error) {
    console.error('AI test error:', error);
    return NextResponse.json(
      { error: 'Internal server error during AI test' },
      { status: 500 },
    );
  }
}
