// ===== 战棋游戏引擎 - 核心逻辑 =====

import { 
  Unit, Position, GameState, Faction, GamePhase, 
  CombatLogEntry, MapCell, UnitType, AIDifficulty, TurnSummary, TurnEvent, MapType,
  DamagePopup, CombatToast, TacticalDeploymentInfo, TACTICAL_UNIT_COSTS, TACTICAL_DEPLOYMENT_BUDGET,
  CapturePoint, CapturePointType, GameMap, LevelUpNotification, BattleStats, DEFAULT_BATTLE_STATS,
  WeatherType, ReinforcementUnit, ReinforcementInfo, IntelReport,
  HeroAbility, SaveMeta, SAVE_VERSION
} from './types';
import { UNIT_CONFIGS, TERRAIN_CONFIGS, RED_DEPLOYMENT, BLUE_DEPLOYMENT, adaptDeployment, FORTIFY_DEFENSE_BONUS, FORTIFY_DURATION, CAPTURE_POINT_CONFIGS, STEALTH_TERRAIN_BONUS, XP_PER_DAMAGE, XP_PER_KILL, XP_PER_CAPTURE, MAX_LEVEL, LEVEL_XP_THRESHOLDS, LEVEL_UP_BONUSES, WEATHER_CONFIGS, WEATHER_CHANGE_TURNS, MINE_DAMAGE, MINE_DETECTION_RANGE, REINFORCEMENT_INTERVAL, REINFORCEMENT_POOL, SUPPLY_AMMO_AMOUNT, MORALE_HIGH_THRESHOLD, MORALE_LOW_THRESHOLD, MORALE_CRUSH_THRESHOLD, MORALE_LOSS_ON_DAMAGE, MORALE_LOSS_ON_ALLY_KILL, MORALE_RECOVERY_PER_TURN, SUPPLY_MORALE_BOOST, MAX_HEROES_PER_SIDE, MAP_WIDTH, MAP_HEIGHT } from './config';
import { getHeroDefinition, getFreshHeroAbilities, getHeroesForFaction } from './heroes';
import { generateMap, getCell, getNeighbors } from './map';

// v84.0: Removed unitIdCounter — now using crypto.randomUUID() to prevent ID collisions
// on concurrent game initialization (e.g., two browser tabs, HMR during dev).
let notificationIdCounter = 0;
let popupIdCounter = 0;

// v84.0: Deep-copy a unit to prevent shared-reference mutations across state snapshots.
// Shallow spread ({ ...u }) only copies top-level properties; nested objects like
// stats and abilities[].effect are shared by reference. This helper deep-copies
// these mutable nested structures.
// Note: actionHistory is NOT deep-copied because (a) entries are flat objects
// (no nested mutation risk), and (b) _recordAction always creates a new array via
// spread, so the array reference is never mutated in place.
function _deepCopyUnit(u: Unit): Unit {
  return {
    ...u,
    stats: { ...u.stats },
    abilities: u.abilities.map(a => ({
      ...a,
      effect: { ...a.effect },
    })),
  };
}

// v67.0: Compute veterancy title based on unit level and kill count
export function getVeterancyTitle(unit: Unit): string | null {
  if (unit.level >= 4 && unit.killCount >= 5) return '传奇';
  if (unit.level >= 3 && unit.killCount >= 3) return '精英';
  if (unit.level >= 2 && unit.killCount >= 1) return '老兵';
  return null;
}

// v67.0: Track kills per turn for streak detection
export function getKillStreakLabel(killCount: number): { label: string; icon: string } | null {
  if (killCount >= 5) return { label: '无双', icon: '💀' };
  if (killCount >= 4) return { label: '四杀', icon: '🔥' };
  if (killCount >= 3) return { label: '三杀', icon: '⚔️' };
  if (killCount >= 2) return { label: '双杀', icon: '✨' };
  return null;
}

// v26.0: Helper to append an action record to a unit (immutable)
function _recordAction(unit: Unit, record: Omit<import('./types').UnitActionRecord, 'position'> & { position?: { x: number; z: number } }): Unit {
  if (!record.position) return unit;
  return {
    ...unit,
    actionHistory: [...(unit.actionHistory || []).slice(-49), { ...record, position: record.position } as import('./types').UnitActionRecord],
  };
}

/** Create game state with hero selection phase */
export function initHeroSelectionState(difficulty: AIDifficulty = 'normal', mapType: MapType = 'random', redHeroId?: string | null, blueHeroId?: string | null): GameState {
  const state = initGameState(difficulty, mapType);
  return {
    ...state,
    phase: 'heroSelection' as GamePhase,
    // Store selected heroes in a custom field via type cast
  } as GameState;
}

/** v58.0: Auto-assign a blue hero for the AI opponent */
export function assignBlueHero(
  units: Unit[],
  map: GameMap,
  difficulty: AIDifficulty
): { units: Unit[]; map: GameMap } | null {
  // Blue hero IDs — pick based on difficulty
  const allBlueHeroes = [
    'hero_blue_infantry', 'hero_blue_mlrs', 'hero_blue_sam',
    'hero_blue_tank2', 'hero_blue_scout2', 'hero_blue_engineer',
  ];
  // On easy: pick from simpler heroes. On hard: pick from stronger ones.
  const pool = difficulty === 'easy'
    ? ['hero_blue_engineer', 'hero_blue_infantry', 'hero_blue_sam']
    : difficulty === 'hard'
    ? ['hero_blue_tank2', 'hero_blue_mlrs', 'hero_blue_scout2']
    : allBlueHeroes;
  const heroId = pool[Math.floor(Math.random() * pool.length)];
  const hero = getHeroDefinition(heroId);
  if (!hero) return null;

  // Find first blue unit of the hero's type and upgrade it
  const heroUnitIdx = units.findIndex(u => u.faction === 'blue' && u.type === hero.unitType && u.isAlive);
  if (heroUnitIdx < 0) return null;

  const heroUnit = createUnit(hero.unitType, 'blue', units[heroUnitIdx].position, heroId);
  const newUnits = [...units];
  newUnits[heroUnitIdx] = heroUnit;

  // Update map cell reference
  const newMap = { ...map, cells: map.cells.map(row => row.map(cell => ({ ...cell }))) };
  const cell = newMap.cells[heroUnit.position.z]?.[heroUnit.position.x];
  if (cell) cell.unit = heroUnit;

  return { units: newUnits, map: newMap };
}

/** Create unit (with optional hero support) */
export function createUnit(type: UnitType, faction: Faction, position: Position, heroId?: string | null): Unit {
  const config = UNIT_CONFIGS[type];
  // v84.0: Use crypto.randomUUID() instead of incrementing counter to prevent ID collisions
  // v87.0: Use 12 chars (48 bits entropy) — 8 chars (32 bits) was insufficient with frequent re-initializations
  const unitId = crypto.randomUUID().slice(0, 12);
  const hero = heroId ? getHeroDefinition(heroId) : null;
  const isHero = !!hero;
  const baseHp = config.baseHp + (hero?.statBoosts.hp ?? 0);
  return {
    id: `${faction}_${type}_${unitId}`,
    type,
    faction,
    position,
    stats: {
      hp: baseHp,
      maxHp: baseHp,
      attack: config.stats.attack + (hero?.statBoosts.attack ?? 0),
      defense: config.stats.defense + (hero?.statBoosts.defense ?? 0),
      armor: config.stats.armor + (hero?.statBoosts.armor ?? 0),
      armorPenetration: config.stats.armorPenetration + (hero?.statBoosts.armorPenetration ?? 0),
      moveRange: config.stats.moveRange + (hero?.statBoosts.moveRange ?? 0),
      attackRange: config.stats.attackRange + (hero?.statBoosts.attackRange ?? 0),
      vision: config.stats.vision + (hero?.statBoosts.vision ?? 0),
      ammo: config.maxAmmo,
      maxAmmo: config.maxAmmo,
      morale: 100,
    },
    canMove: true,
    canAttack: true,
    attackedThisTurn: false,
    isAlive: true,
    name: hero?.name ?? config.name,
    description: hero?.lore ?? config.description,
    isStealthed: false,
    stealthCooldown: 0,
    stealthTurnsRemaining: 0,
    level: isHero ? 2 : 1,
    xp: isHero ? LEVEL_XP_THRESHOLDS[1] || 50 : 0,
    xpToNextLevel: isHero ? (LEVEL_XP_THRESHOLDS[2] || 120) : (LEVEL_XP_THRESHOLDS[1] || 50),
    killCount: 0,
    totalDamageDealt: 0,
    isHero,
    heroId: heroId ?? null,
    abilities: heroId ? getFreshHeroAbilities(heroId) : [],
    // v25.0: Initialize action history
    actionHistory: [],
  };
}

/** 部署配置 (用于任务模式) */
export interface CustomDeploymentConfig {
  type: UnitType;
  x: number;
  z: number;
}

/** Internal helper: creates base game state given a generated map and adapted deployment arrays */
function _createBaseGameState(
  difficulty: AIDifficulty,
  map: GameMap,
  redDeploy: { type: UnitType; position: Position; faction: Faction }[],
  blueDeploy: { type: UnitType; position: Position; faction: Faction }[],
): GameState {
  // v84.0: No longer reset unitIdCounter (using UUIDs). Reset other counters for new game.
  popupIdCounter = 0;
  notificationIdCounter = 0;
  const units: Unit[] = [];

  // Deploy red
  for (const deploy of redDeploy) {
    if (deploy.position.x >= 0 && deploy.position.x < map.width && deploy.position.z >= 0 && deploy.position.z < map.height) {
      const unit = createUnit(deploy.type, deploy.faction, deploy.position);
      units.push(unit);
      const cell = getCell(map, deploy.position);
      if (cell) cell.unit = unit;
    }
  }

  // Deploy blue
  for (const deploy of blueDeploy) {
    if (deploy.position.x >= 0 && deploy.position.x < map.width && deploy.position.z >= 0 && deploy.position.z < map.height) {
      const unit = createUnit(deploy.type, deploy.faction, deploy.position);
      units.push(unit);
      const cell = getCell(map, deploy.position);
      if (cell) cell.unit = unit;
    }
  }

  // Generate capture points
  const capturePoints = generateCapturePoints(map);

  // Update map cells with capture point references
  const newMap = { ...map, cells: map.cells.map(row => row.map(cell => ({ ...cell }))) };
  for (const cp of capturePoints) {
    const cell = newMap.cells[cp.position.z]?.[cp.position.x];
    if (cell) cell.capturePointId = cp.id;
  }

  // Generate minefields (3-5 randomly placed)
  const minefields: { x: number; z: number; owner: Faction }[] = [];
  const mineCount = 3 + Math.floor(Math.random() * 3); // 3-5 mines
  for (let i = 0; i < mineCount; i++) {
    for (let attempt = 0; attempt < 50; attempt++) {
      const mx = Math.floor(Math.random() * map.width);
      const mz = Math.floor(Math.random() * map.height);
      const cell = getCell(map, { x: mx, z: mz });
      if (!cell) continue;
      const terrain = TERRAIN_CONFIGS[cell.terrain];
      if (!terrain.stats.isPassable) continue;
      if (['water', 'mountain', 'city', 'fortress'].includes(cell.terrain)) continue;
      if (capturePoints.some(cp => cp.position.x === mx && cp.position.z === mz)) continue;
      if (minefields.some(m => m.x === mx && m.z === mz)) continue;
      if (cell.unit) continue; // Don't place mine on occupied cells
      const owner: Faction = mx < map.width / 2 ? 'blue' : 'red';
      minefields.push({ x: mx, z: mz, owner });
      break;
    }
  }
  // Update map cells with minefields
  for (const mine of minefields) {
    const cell = newMap.cells[mine.z]?.[mine.x];
    if (cell) {
      cell.hasMinefield = true;
      cell.minefieldOwner = mine.owner;
    }
  }

  return {
    map: newMap,
    units,
    currentFaction: 'red',
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
    capturePoints,
    battleStats: { ...DEFAULT_BATTLE_STATS },
    currentWeather: 'clear' as WeatherType,
    weatherTurnsRemaining: WEATHER_CHANGE_TURNS,
    // v89.0: Initial next weather forecast
    nextWeather: (() => {
      const wt: WeatherType[] = ['clear', 'clear', 'rain', 'fog', 'snow', 'sandstorm'];
      return wt[Math.floor(Math.random() * wt.length)];
    })(),
    reinforcements: { red: [], blue: [] },
    reinforcementBudget: { red: 0, blue: 0 },
    // v25.0: AI dynamic difficulty
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
    gameStartTime: Date.now(), // v41.0: added missing field
    // v67.0: Kill tracking per turn for streak notifications
    turnKillCounts: { red: 0, blue: 0 },
    // Recon/intelligence system
    revealedCells: new Set<string>(),
    revealedUnits: [],
    intelReports: [],
  };
}

/** 使用自定义部署配置初始化游戏状态 */
export function initGameStateWithDeployment(
  difficulty: AIDifficulty = 'normal',
  mapType: MapType = 'random',
  redCustom?: CustomDeploymentConfig[],
  blueCustom?: CustomDeploymentConfig[],
): GameState {
  const map = generateMap(mapType);

  // Build DeployConfig arrays from custom overrides or use defaults
  // v62.0: Custom deployments adapted once here; defaults adapted once below
  const redDeploy = redCustom
    ? redCustom.map(d => ({ type: d.type, position: { x: d.x, z: d.z }, faction: 'red' as Faction }))
    : RED_DEPLOYMENT.map(d => ({ type: d.type, position: { x: d.position.x, z: d.position.z }, faction: 'red' as Faction }));
  const blueDeploy = blueCustom
    ? blueCustom.map(d => ({ type: d.type, position: { x: d.x, z: d.z }, faction: 'blue' as Faction }))
    : BLUE_DEPLOYMENT.map(d => ({ type: d.type, position: { x: d.position.x, z: d.position.z }, faction: 'blue' as Faction }));

  // Adapt deployment positions to map passability (single adaptation for both paths)
  const redAdapted = adaptDeployment(redDeploy, map.cells, mapType);
  const blueAdapted = adaptDeployment(blueDeploy, map.cells, mapType);

  return _createBaseGameState(difficulty, map, redAdapted, blueAdapted);
}

/** 初始化游戏状态 */
export function initGameState(difficulty: AIDifficulty = 'normal', mapType: MapType = 'random'): GameState {
  const map = generateMap(mapType);

  // 根据地图类型调整部署位置
  const redDeploy = adaptDeployment(RED_DEPLOYMENT, map.cells, mapType);
  const blueDeploy = adaptDeployment(BLUE_DEPLOYMENT, map.cells, mapType);

  return _createBaseGameState(difficulty, map, redDeploy, blueDeploy);
}

/** 计算可移动位置 (BFS) */
export function getMovablePositions(state: GameState, unit: Unit): Position[] {
  if (!unit.canMove || !unit.isAlive) return [];
  
  const isVehicle = UNIT_CONFIGS[unit.type].isVehicle;
  const isHelicopter = unit.type === 'helicopter';
  
  // Sandstorm grounds helicopters
  if (isHelicopter && state.currentWeather === 'sandstorm') return [];
  
  const moveRange = unit.stats.moveRange;
  // v40.0: Apply hero extraMoveRange passive
  let effectiveMoveRange = moveRange;
  if (unit.isHero && unit.abilities.length > 0) {
    const moveBonus = unit.abilities.find(a => a.type === 'passive' && (a.effect as any).extraMoveRange);
    if (moveBonus && (moveBonus.effect as any).extraMoveRange) effectiveMoveRange += (moveBonus.effect as any).extraMoveRange;
  }
  const positions: Position[] = [];
  // v35.0: Use Set for O(1) dedup instead of positions.some() O(n²)
  const positionSet = new Set<string>();
  const visited = new Map<string, number>(); // key -> remaining move points
  const queue: { pos: Position; remaining: number }[] = [{ pos: unit.position, remaining: effectiveMoveRange }];
  
  visited.set(`${unit.position.x},${unit.position.z}`, effectiveMoveRange);
  
  // v65.0: Use index-based dequeue instead of queue.shift() O(n)
  let qi = 0;
  while (qi < queue.length) {
    const current = queue[qi++]!;
    
    for (const neighbor of getNeighbors(state.map, current.pos)) {
      const cell = getCell(state.map, neighbor);
      if (!cell) continue;
      
      const terrainConfig = TERRAIN_CONFIGS[cell.terrain];
      // Helicopters ignore terrain movement cost - all terrain costs 1
      const moveCost = isHelicopter ? 1 : terrainConfig.stats.moveCost;
      
      // Weather movement modifier
      const weatherConfig = WEATHER_CONFIGS[state.currentWeather];
      // v77.0: Helicopters fly above weather effects — only sandstorm affects them
      const weatherMoveCost = isHelicopter ? moveCost : moveCost * weatherConfig.movementModifier;
      
      // 检查通行性 - helicopters can fly over any terrain except water
      if (!isHelicopter) {
        if (!terrainConfig.stats.isPassable) continue;
        if (isVehicle && !terrainConfig.stats.isPassableByVehicle) continue;
      } else {
        // Helicopters can fly over impassable terrain (mountains, swamps) but not water
        if (cell.terrain === 'water') continue;
      }
      
      // 检查是否有单位占据（友方或已探测的敌方）
      // v56.0: Undetected stealthed enemies must NOT block movement — doing so leaks their position
      // (player sees an inexplicably impassable empty cell). Friendly units still block as normal.
      let hasUndetectedStealthedEnemy = false;
      if (cell.unit && cell.unit.id !== unit.id && cell.unit.isAlive) {
        if (cell.unit.faction === unit.faction) continue; // friendly always blocks
        if (isUnitDetected(state, cell.unit, unit.faction)) continue; // detected enemy blocks
        // v73.0: undetected stealthed enemy — allow passage but DON'T add to positions
        // (moving there would overwrite the stealthed enemy's map reference)
        hasUndetectedStealthedEnemy = true;
      }
      
      const remaining = current.remaining - weatherMoveCost;
      if (remaining < 0) continue;
      
      const key = `${neighbor.x},${neighbor.z}`;
      const prevRemaining = visited.get(key);
      if (prevRemaining !== undefined && prevRemaining >= remaining) continue;
      
      visited.set(key, remaining);
      queue.push({ pos: neighbor, remaining });
      
      // 排除起始位置
      if (neighbor.x !== unit.position.x || neighbor.z !== unit.position.z) {
        // v73.0: Skip cells occupied by undetected stealthed enemies
        if (!hasUndetectedStealthedEnemy) {
          const posKey = `${neighbor.x},${neighbor.z}`;
          if (!positionSet.has(posKey)) {
            positionSet.add(posKey);
            positions.push(neighbor);
          }
        }
      }
    }
  }
  
  return positions;
}

/** 计算可攻击位置 */
export function getAttackablePositions(state: GameState, unit: Unit): Position[] {
  if (!unit.canAttack || !unit.isAlive) return [];
  
  // Ammo check: unit with 0 ammo cannot attack
  if (unit.stats.ammo !== undefined && unit.stats.ammo !== null && unit.stats.ammo <= 0) return [];
  
  // Morale check: panicked units cannot attack
  if (unit.stats.morale !== undefined && unit.stats.morale !== null && unit.stats.morale < MORALE_CRUSH_THRESHOLD) return [];
  
  // v40.0: Apply hero attackRangeBonus passive
  let effectiveAttackRange = unit.stats.attackRange;
  if (unit.isHero && unit.abilities.length > 0) {
    const rangeBonus = unit.abilities.find(a => a.type === 'passive' && (a.effect as any).attackRangeBonus);
    if (rangeBonus && (rangeBonus.effect as any).attackRangeBonus) effectiveAttackRange += (rangeBonus.effect as any).attackRangeBonus;
  }
  const positions: Position[] = [];
  const enemyUnits = state.units.filter(u => u.faction !== unit.faction && u.isAlive && isUnitDetected(state, u, unit.faction));
  
  for (const enemy of enemyUnits) {
    const dist = Math.abs(enemy.position.x - unit.position.x) + Math.abs(enemy.position.z - unit.position.z);
    if (dist >= 1 && dist <= effectiveAttackRange) {
      positions.push(enemy.position);
    }
  }
  
  return positions;
}

/** 执行移动 */
export function moveUnit(state: GameState, unit: Unit, targetPos: Position): GameState {
  if (!unit.canMove || !unit.isAlive) return state;
  
  // Save previous state for undo (before move)
  // v88.0: Use _deepCopyUnit for consistent deep-copy (includes abilities)
  const previousState: GameState = {
    ...state,
    map: { ...state.map, cells: state.map.cells.map(row => row.map(cell => ({ ...cell }))) },
    units: state.units.map(u => _deepCopyUnit(u)),
    selectedUnit: state.selectedUnit ? { ...state.selectedUnit } : null,
    previousState: null, // Only keep one level of undo
  };
  
  const newState = { ...state };
  // v34.0: Deep-copy battleStats to avoid mutating input state (undo regression)
  const newBattleStats: BattleStats = {
    red: { ...state.battleStats.red },
    blue: { ...state.battleStats.blue },
  };
  newState.battleStats = newBattleStats;
  const newMap = { ...newState.map, cells: newState.map.cells.map(row => row.map(cell => ({ ...cell }))) };
  // v84.0: Deep-copy units to prevent shared-reference mutations (abilities, stats, etc.)
  const newUnits = newState.units.map(u => _deepCopyUnit(u));
  
  // 从旧位置移除
  const oldCell = getCell(newMap, unit.position);
  if (oldCell) oldCell.unit = null;
  
  // 更新单位位置
  const movedUnit = newUnits.find(u => u.id === unit.id);
  if (movedUnit) {
    movedUnit.position = targetPos;
    movedUnit.canMove = false;
  }
  
  // 放到新位置
  const newCell = getCell(newMap, targetPos);
  if (newCell && movedUnit) newCell.unit = movedUnit;
  
  // Check for minefield at destination
  const mineDamagePopups: DamagePopup[] = [];
  const mineCombatLog: CombatLogEntry[] = [];
  if (newCell?.hasMinefield && movedUnit) {
    // Only enemy mines trigger
    if (newCell.minefieldOwner !== movedUnit.faction) {
      const mineOwner = newCell.minefieldOwner;
      const mineDamage = MINE_DAMAGE;
      movedUnit.stats = { ...movedUnit.stats, hp: Math.max(0, movedUnit.stats.hp - mineDamage) };
      newCell.hasMinefield = false;
      newCell.minefieldOwner = undefined;
      
      mineDamagePopups.push({
        id: ++popupIdCounter,
        x: targetPos.x,
        z: targetPos.z,
        value: mineDamage,
        type: 'damage',
        timestamp: Date.now(),
      });
      
      mineCombatLog.push({
        turn: newState.turn,
        attacker: `💣 地雷(${mineOwner === 'red' ? '红方' : '蓝方'})`,
        defender: `${movedUnit.name}(${movedUnit.faction === 'red' ? '红方' : '蓝方'})`,
        damage: mineDamage,
        defenderRemainingHp: movedUnit.stats.hp,
        attackerFaction: mineOwner ?? 'red',
        eventType: movedUnit.stats.hp <= 0 ? 'destroy' : 'attack',
      });
      
      // If unit died from mine, remove from map
      if (movedUnit.stats.hp <= 0) {
        movedUnit.isAlive = false;
        newCell.unit = null;
      }

      // v33.0: Track mine damage in battleStats
      if (mineOwner) {
        newState.battleStats[mineOwner].damageDealt += mineDamage;
        newState.battleStats[movedUnit.faction].damageReceived += mineDamage;
        if (movedUnit.stats.hp <= 0) {
          newState.battleStats[mineOwner].unitsDestroyed += 1;
          newState.battleStats[mineOwner].kills += 1;
          newState.battleStats[movedUnit.faction].unitsLost += 1;
        }
      }
    }
  }

  // v27.0: Record move action AFTER all mutations (mine damage, etc.)
  // Fixes v26.0 bug where mine damage was lost because _recordAction was called before mutations
  if (movedUnit) {
    const movedIdx = newUnits.findIndex(u => u.id === movedUnit.id);
    if (movedIdx >= 0) {
      newUnits[movedIdx] = _recordAction(movedUnit, {
        turn: newState.turn, type: 'move',
        description: `移动至 (${targetPos.x}, ${targetPos.z})`,
        position: { x: targetPos.x, z: targetPos.z },
      });
    }
  }
  
  // Merge mine popups with existing
  const existingPopups = newState.damagePopups || [];
  const mergedMinePopups = [...existingPopups, ...mineDamagePopups];
  
  // v27.0: Cache attackablePositions to avoid duplicate BFS (M5 perf fix)
  const attackablePositions = movedUnit && movedUnit.isAlive && movedUnit.canAttack
    ? getAttackablePositions({ ...newState, map: newMap, units: newUnits }, movedUnit)
    : [];
  
  // v78.0: Check victory if mine killed the moved unit
  let mineVictory: { winner: Faction; reason: 'annihilation' } | null = null;
  if (movedUnit && !movedUnit.isAlive) {
    const redAlive = newUnits.filter(u => u.faction === 'red' && u.isAlive).length;
    const blueAlive = newUnits.filter(u => u.faction === 'blue' && u.isAlive).length;
    if (redAlive === 0 || blueAlive === 0) {
      mineVictory = { winner: redAlive === 0 ? 'blue' : 'red', reason: 'annihilation' };
    }
  }
  
  return {
    ...newState,
    map: newMap,
    units: newUnits,
    selectedUnit: movedUnit && movedUnit.isAlive ? newUnits[newUnits.findIndex(u => u.id === movedUnit.id)] ?? null : null,
    movablePositions: [],
    attackablePositions,
    movePath: [],
    phase: mineVictory ? 'gameOver' as GamePhase : (movedUnit && movedUnit.canAttack && attackablePositions.length > 0 ? 'attackUnit' : 'selectUnit'),
    winner: mineVictory?.winner ?? newState.winner,
    victoryReason: mineVictory?.reason ?? newState.victoryReason,
    previousState,
    damagePopups: mergedMinePopups,
    combatLog: (() => {
      const combined = [...newState.combatLog, ...mineCombatLog];
      return combined.length > 200 ? combined.slice(-200) : combined;
    })(),
    shakeActive: mineDamagePopups.length > 0,
    shakeIntensity: mineDamagePopups.length > 0 ? 1.5 : 1,
  };
}

/** 补给车治疗：在回合开始时治疗相邻友军 */
export function processSupplyHealing(state: GameState): { state: GameState; healPopups: DamagePopup[] } {
  const healPopups: DamagePopup[] = [];
  // v89.0: Use _deepCopyUnit for consistent deep-copy (includes abilities)
  const newUnits = state.units.map(u => _deepCopyUnit(u));
  const newMap = { ...state.map, cells: state.map.cells.map(row => row.map(cell => ({ ...cell }))) };
  const newBattleStats: BattleStats = {
    red: { ...state.battleStats.red },
    blue: { ...state.battleStats.blue },
  };
  let totalHealing = 0;
  
  // 找到当前阵营的所有补给车
  const supplyTrucks = newUnits.filter(u => 
    u.type === 'supply' && u.isAlive && u.faction === state.currentFaction
  );
  
  for (const truck of supplyTrucks) {
    // v37.0: Integrate hero supply bonus (angel_heal_passive: +5 heal, +1 range)
    const heroBonus = getHeroSupplyBonus(truck);
    const healAmount = (UNIT_CONFIGS.supply.healAmount ?? 10) + heroBonus.healBonus;
    const healRange = (UNIT_CONFIGS.supply.healRange ?? 1) + heroBonus.rangeBonus;
    
    // 查找范围内的友军（不包括自身）
    for (const unit of newUnits) {
      if (!unit.isAlive || unit.id === truck.id || unit.faction !== truck.faction) continue;
      
      const dist = Math.abs(unit.position.x - truck.position.x) + Math.abs(unit.position.z - truck.position.z);
      if (dist > 0 && dist <= healRange) {
        let unitChanged = false;
        let actualHeal = 0;
        // HP healing
        if (unit.stats.hp < unit.stats.maxHp) {
          actualHeal = Math.min(healAmount, unit.stats.maxHp - unit.stats.hp);
          unit.stats = { ...unit.stats, hp: unit.stats.hp + actualHeal };
          totalHealing += actualHeal;
          unitChanged = true;
        }
        // v34.0: Ammo resupply BEFORE _recordAction (was after — stale reference bug)
        if (unit.stats.ammo !== undefined && unit.stats.ammo !== null && unit.stats.maxAmmo !== undefined && unit.stats.ammo < unit.stats.maxAmmo) {
          const ammoRestore = Math.min(SUPPLY_AMMO_AMOUNT, unit.stats.maxAmmo - unit.stats.ammo);
          unit.stats = { ...unit.stats, ammo: unit.stats.ammo + ammoRestore };
          unitChanged = true;
          
          healPopups.push({
            id: ++popupIdCounter,
            x: unit.position.x,
            z: unit.position.z,
            value: ammoRestore,
            type: 'ammo',
            timestamp: Date.now(),
          });
        }
        // v34.0: Morale boost BEFORE _recordAction (was after — stale reference bug)
        if (unit.stats.morale !== undefined && unit.stats.morale !== null && unit.stats.morale < 100) {
          const moraleBoost = Math.min(SUPPLY_MORALE_BOOST, 100 - unit.stats.morale);
          unit.stats = { ...unit.stats, morale: unit.stats.morale + moraleBoost };
          unitChanged = true;
          
          healPopups.push({
            id: ++popupIdCounter,
            x: unit.position.x,
            z: unit.position.z,
            value: moraleBoost,
            type: 'morale',
            timestamp: Date.now(),
          });
        }
        
        // v34.0: Record actions AFTER all mutations (HP + ammo + morale applied first)
        if (actualHeal > 0) {
          const truckRecIdx = newUnits.findIndex(u => u.id === truck.id);
          if (truckRecIdx >= 0) {
            // v34.0: Re-fetch truck from newUnits to avoid stale actionHistory
            const currentTruck = newUnits[truckRecIdx];
            newUnits[truckRecIdx] = _recordAction(currentTruck, {
              turn: state.turn, type: 'heal',
              description: `治疗 ${unit.name} +${actualHeal}`,
              value: actualHeal, targetName: unit.name,
              position: { x: currentTruck.position.x, z: currentTruck.position.z },
            });
          }
          const healedRecIdx = newUnits.findIndex(u => u.id === unit.id);
          if (healedRecIdx >= 0) {
            newUnits[healedRecIdx] = _recordAction(unit, {
              turn: state.turn, type: 'heal',
              description: `被 ${truck.name} 治疗 +${actualHeal}`,
              value: actualHeal, targetName: truck.name,
              position: { x: unit.position.x, z: unit.position.z },
            });
          }
          
          healPopups.push({
            id: ++popupIdCounter,
            x: unit.position.x,
            z: unit.position.z,
            value: actualHeal,
            type: 'heal',
            timestamp: Date.now(),
          });
        }
        
        // v34.0: Update map cell with fresh unit reference
        // v76.0: Removed inner-loop cell update — outer loop handles ALL units below
      }
    }
  }
  
  // Track healing in battle stats
  if (totalHealing > 0) {
    newBattleStats[state.currentFaction].healingDone += totalHealing;
  }
  
  // Update ALL unit references in map (covers both healed and non-healed units)
  for (const unit of newUnits) {
    if (unit.isAlive) {
      const cell = getCell(newMap, unit.position);
      if (cell) cell.unit = unit;
    }
  }
  
  return {
    state: { ...state, units: newUnits, map: newMap, battleStats: newBattleStats },
    healPopups,
  };
}

/** 计算伤害（含装甲机制）
 * 
 * 伤害公式:
 * 1. 基础伤害 = 攻击力 + 地形攻击加成 - (防御力 + 地形防御加成 + 工事加成) * 0.5
 * 2. 有效装甲 = max(0, 防御方装甲 - 攻击方穿甲)
 * 3. 装甲减免率 = effectiveArmor / (effectiveArmor + ARMOR_SCALING_CONSTANT)
 *    - 使用递减公式，装甲越高减免越多但收益递减
 *    - ARMOR_SCALING_CONSTANT = 50 时: 
 *      - 10装甲 → 16.7%减免
 *      - 20装甲 → 28.6%减免
 *      - 40装甲 → 44.4%减免
 * 4. 高爆伤害(HE)对装甲额外减免穿透50%
 * 5. 侧翼攻击(从背后攻击)额外减免50%装甲
 * 6. 最终伤害 = 基础伤害 * (1 - 装甲减免率) * 随机浮动
 */
const ARMOR_SCALING_CONSTANT = 50; // 装甲缩放常数
const FLANK_ARMOR_REDUCTION = 0.5; // 侧翼攻击装甲削减比例
const HE_ARMOR_PENALTY = 0.5; // HE武器穿甲削减比例

// v84.0: Removed module-level _attackerTerrainAtkBonus — now passed as explicit parameter
// to _computeDeterministicDamage, calculateDamage, estimateDamage, calculateKillProbability.
// This eliminates the race condition where concurrent attacks could corrupt the shared mutable state.
// setAttackerTerrainAtkBonus is kept as a no-op for backward compatibility (calls from game-store).

/** v84.0: No-op kept for backward compatibility. Terrain bonus is now passed as explicit parameter. */
export function setAttackerTerrainAtkBonus(_bonus: number): void {
  // No-op: terrain bonus is now passed as explicit parameter to damage functions
}

/**
 * 计算确定性伤害基数（不含随机浮动和天气修正）
 * 提取自 calculateDamage，供蒙特卡洛模拟复用
 */
function _computeDeterministicDamage(attacker: Unit, defender: Unit, defenderCell: MapCell, isCounterAttack: boolean = false, extraFortifyDefense: number = 0, attackerTerrainAtkBonus: number = 0): number {
  const terrainConfig = TERRAIN_CONFIGS[defenderCell.terrain];
  const terrainDefBonus = terrainConfig.stats.defenseBonus;
  // v84.0: Terrain attack bonus now passed as explicit parameter (was module-level mutable state)
  const terrainAtkBonus = attackerTerrainAtkBonus;
  // v51.0: Include hero fortify defense bonus (fortify_master_passive: +10)
  const fortifyBonus = defenderCell.fortified ? (FORTIFY_DEFENSE_BONUS + extraFortifyDefense) : 0;

  const baseDamage = Math.max(
    attacker.stats.attack + terrainAtkBonus - (defender.stats.defense + terrainDefBonus + fortifyBonus) * 0.5,
    attacker.stats.attack * 0.15
  );

  let armorPenetration = attacker.stats.armorPenetration;
  const attackerConfig = UNIT_CONFIGS[attacker.type];
  if (attackerConfig?.damageType === 'he') {
    armorPenetration = Math.floor(armorPenetration * HE_ARMOR_PENALTY);
  }

  let effectiveArmor = Math.max(0, defender.stats.armor - armorPenetration);

  const attackDist = Math.abs(attacker.position.x - defender.position.x) + Math.abs(attacker.position.z - defender.position.z);
  const isFlanking = !isCounterAttack && attackDist <= 1 && !attacker.canMove;
  if (isFlanking) {
    effectiveArmor = Math.floor(effectiveArmor * FLANK_ARMOR_REDUCTION);
  }

  const damageReduction = effectiveArmor / (effectiveArmor + ARMOR_SCALING_CONSTANT);
  let armorModifiedDamage = baseDamage * (1 - damageReduction);

  // v55.0: REMOVED helicopter-vs-SAM direct 0.7x here. The SAM aura reduction is handled
  // separately in attackUnit() and estimateDamage() via proximity check to nearby friendly SAMs.
  // Having both caused a DOUBLE reduction (0.7x × 0.7x = 0.49x) for helicopters attacking near SAMs.

  // === Morale damage modifier ===
  if (attacker.stats.morale !== undefined && attacker.stats.morale !== null) {
    if (attacker.stats.morale > MORALE_HIGH_THRESHOLD) {
      armorModifiedDamage *= 1.1;
    } else if (attacker.stats.morale < MORALE_LOW_THRESHOLD) {
      armorModifiedDamage *= 0.9;
    }
  }
  if (defender.stats.morale !== undefined && defender.stats.morale !== null && defender.stats.morale < MORALE_LOW_THRESHOLD) {
    armorModifiedDamage *= 1.1;
  }

  // === Hero passive ability modifiers ===
  // v33.0: Compute armor penetration bonus FIRST (if any), then apply additive/multiplicative bonuses
  // Previously armorPenetrationBonus reset all previously accumulated damageBonus/damageMultiplier
  let heroDamageBonus = 0;
  let heroDamageMultiplier = 1;
  if (attacker.isHero && attacker.abilities.length > 0) {
    for (const ability of attacker.abilities) {
      if (ability.type !== 'passive') continue;
      if (ability.effect.damageBonus) {
        heroDamageBonus += ability.effect.damageBonus;
      }
      if (ability.effect.damageMultiplier && ability.id !== 'shadow_stealth_passive') {
        // v38.0 → v39.0: armor_pierce_passive only applies vs fortified enemies
        // Use defenderCell parameter directly (NOT state.map which isn't available in _computeDeterministicDamage)
        // v40.0: Skip shadow_stealth_passive here — it applies only when stealthed (handled in stealth block below)
        if (ability.id === 'armor_pierce_passive') {
          if (defenderCell && defenderCell.fortified) {
            heroDamageMultiplier *= ability.effect.damageMultiplier;
          }
        } else {
          heroDamageMultiplier *= ability.effect.damageMultiplier;
        }
      }
      if (ability.effect.armorPenetrationBonus) {
        // Recalculate effective armor with bonus penetration
        const bonusPen = attacker.stats.armorPenetration + ability.effect.armorPenetrationBonus;
        let hePen = bonusPen;
        const atkConfig = UNIT_CONFIGS[attacker.type];
        if (atkConfig?.damageType === 'he') {
          hePen = Math.floor(hePen * HE_ARMOR_PENALTY);
        }
        effectiveArmor = Math.max(0, defender.stats.armor - hePen);
        if (isFlanking) {
          effectiveArmor = Math.floor(effectiveArmor * FLANK_ARMOR_REDUCTION);
        }
        const newReduction = effectiveArmor / (effectiveArmor + ARMOR_SCALING_CONSTANT);
        armorModifiedDamage = baseDamage * (1 - newReduction);
        // v35.0: Re-apply morale modifiers that were lost by the reset above
        if (attacker.stats.morale !== undefined && attacker.stats.morale !== null) {
          if (attacker.stats.morale > MORALE_HIGH_THRESHOLD) armorModifiedDamage *= 1.1;
          else if (attacker.stats.morale < MORALE_LOW_THRESHOLD) armorModifiedDamage *= 0.9;
        }
        if (defender.stats.morale !== undefined && defender.stats.morale !== null && defender.stats.morale < MORALE_LOW_THRESHOLD) {
          armorModifiedDamage *= 1.1;
        }
      }
    }
    // Apply accumulated additive/multiplicative bonuses on top
    if (heroDamageBonus > 0 || heroDamageMultiplier !== 1) {
      armorModifiedDamage = armorModifiedDamage * heroDamageMultiplier + heroDamageBonus;
    }
    if (attacker.isStealthed) {
      // v57.0: Only apply shadow_stealth_passive — armor_pierce_passive has its own
      // fortified-gate in the defender passive loop above and should NOT double here.
      for (const ability of attacker.abilities) {
        if (ability.id === 'shadow_stealth_passive' && ability.effect.damageMultiplier && ability.trigger === 'onAttack') {
          armorModifiedDamage *= ability.effect.damageMultiplier;
        }
      }
    }
    if (attacker.tempDamageBuff && attacker.tempDamageBuffTurns && attacker.tempDamageBuffTurns > 0) {
      armorModifiedDamage *= attacker.tempDamageBuff;
    }
  }
  // v37.0: tempDefenseBuff moved OUTSIDE isHero check so lock_on_active works on ALL units, not just heroes
  if (defender.tempDefenseBuff && defender.tempDefenseBuffTurns && defender.tempDefenseBuffTurns > 0) {
    armorModifiedDamage -= defender.tempDefenseBuff;
  }
  if (defender.isHero && defender.abilities.length > 0) {
    for (const ability of defender.abilities) {
      if (ability.type !== 'passive') continue;
      // Skip air_shield_passive here — it is handled explicitly in attackUnit
      // (helicopter check) to avoid double-applying its defenseBonus.
      if (ability.id === 'air_shield_passive') continue;
      if (ability.effect.defenseBonus) {
        // v54.0: fortify_master_passive defenseBonus only applies when in fortification
        if (ability.id === 'fortify_master_passive' && !defenderCell.fortified) continue;
        armorModifiedDamage -= ability.effect.defenseBonus;
      }
    }
  }

  // v33.0: Clamp to minimum 0 to prevent negative damage from stacking defense passives
  return Math.max(0, armorModifiedDamage);
}

function calculateDamage(attacker: Unit, defender: Unit, defenderCell: MapCell, isCounterAttack: boolean = false, extraFortifyDefense: number = 0, attackerTerrainAtkBonus: number = 0): number {
  // v84.0: Terrain bonus now passed as explicit parameter (was module-level mutable state)
  const deterministicDamage = _computeDeterministicDamage(attacker, defender, defenderCell, isCounterAttack, extraFortifyDefense, attackerTerrainAtkBonus);
  // 随机浮动 ±15%
  const variance = deterministicDamage * 0.15;
  const damage = Math.round(deterministicDamage + (Math.random() * 2 - 1) * variance);
  return Math.max(1, damage);
}

/**
 * 蒙特卡洛模拟计算击杀概率
 * 运行 100 次模拟攻击，统计击杀率、预期伤害和伤害范围
 */
export interface KillProbabilityResult {
  killProbability: number; // 0-100 百分比
  expectedDamage: number;
  minDamage: number;
  maxDamage: number;
}

export function calculateKillProbability(
  attacker: Unit,
  defender: Unit,
  defenderCell: MapCell,
  isCounterAttack: boolean = false,
  weather?: WeatherType,
  attackerTerrainType?: string,
  allUnits?: Unit[],
): KillProbabilityResult {
  const SIMULATIONS = 100;
  // v84.0: Terrain bonus now passed explicitly (was module-level mutable state with save/restore)
  const attackerAtkBonus = attackerTerrainType
    ? (TERRAIN_CONFIGS[attackerTerrainType]?.stats.attackBonus ?? 0)
    : 0;
  // v72.0: Calculate hero fortify_master_passive bonus (matching estimateDamage/attackUnit)
  let extraFortifyDefense = 0;
  if (defenderCell.fortified && allUnits) {
    const fortHeroes = allUnits.filter(u =>
      u.isAlive && u.faction === defender.faction && u.isHero &&
      u.abilities.some(a => a.id === 'fortify_master_passive') &&
      Math.abs(u.position.x - defender.position.x) + Math.abs(u.position.z - defender.position.z) <= 3
    );
    if (fortHeroes.length > 0) extraFortifyDefense = 10;
  }
  const deterministicDamage = _computeDeterministicDamage(attacker, defender, defenderCell, isCounterAttack, extraFortifyDefense, attackerAtkBonus);
  const weatherModifier = WEATHER_CONFIGS[weather || 'clear'].attackModifier;

  let kills = 0;
  let totalDamage = 0;
  let minDmg = Infinity;
  let maxDmg = -Infinity;

  for (let i = 0; i < SIMULATIONS; i++) {
    const variance = deterministicDamage * 0.15;
    let damage = Math.round(deterministicDamage + (Math.random() * 2 - 1) * variance);
    damage = Math.round(damage * weatherModifier);
    // v64.0: Apply SAM anti-air reduction (matches attackUnit logic)
    if (attacker.type === 'helicopter') {
      // v65.0: Use correct antiAirRange from config (matches attackUnit/estimateDamage)
      const samConfig = UNIT_CONFIGS.sam as typeof UNIT_CONFIGS.sam & { antiAirRange?: number };
      const aaRange = samConfig.antiAirRange ?? 2;
      const aaReduction = samConfig.antiAirReduction ?? 0.3;
      // v77.0: Fixed — only SAM units provide anti-air, not MLRS (matching attackUnit/estimateDamage)
      const aaUnits = (allUnits || []).filter(u =>
        u.faction !== attacker.faction && u.isAlive &&
        u.type === 'sam' &&
        Math.abs(u.position.x - defender.position.x) + Math.abs(u.position.z - defender.position.z) <= aaRange
      );
      if (aaUnits.length > 0) {
        damage = Math.round(damage * (1 - aaReduction));
      }
      // v70.0: Apply air_shield_passive reduction (matches attackUnit and estimateDamage)
      if (allUnits) {
        const airShieldAllies = allUnits.filter(u =>
          u.isAlive && u.faction === defender.faction && u.id !== defender.id &&
          u.isHero && u.abilities.some(a => a.id === 'air_shield_passive') &&
          Math.abs(u.position.x - defender.position.x) + Math.abs(u.position.z - defender.position.z) <= 2
        );
        if (airShieldAllies.length > 0) {
          damage = Math.max(1, damage - 10);
        }
      }
    }
    damage = Math.max(1, damage);

    if (damage >= defender.stats.hp) kills++;
    totalDamage += damage;
    if (damage < minDmg) minDmg = damage;
    if (damage > maxDmg) maxDmg = damage;
  }

  // v84.0: No longer need to restore _attackerTerrainAtkBonus (now passed as parameter)

  return {
    killProbability: Math.round((kills / SIMULATIONS) * 100),
    expectedDamage: Math.round(totalDamage / SIMULATIONS),
    minDamage: minDmg === Infinity ? 0 : minDmg,
    maxDamage: maxDmg === -Infinity ? 0 : maxDmg,
  };
}

/** 计算预计伤害范围（用于UI预览）
 * v30.0: Refactored to use _computeDeterministicDamage for full accuracy — now includes
 * hero passive abilities, morale modifiers, stealth attack bonus, temp buffs, and SAM aura.
 * @param hasMoved When true and attacker is within melee range, applies flanking armor reduction.
 *                 When undefined/false, no flanking is applied (safe default for previews where
 *                 move state is unknown).
 */
export function estimateDamage(
  attacker: Unit, defender: Unit, defenderCell: MapCell, hasMoved?: boolean,
  weather?: WeatherType, nearbyUnits?: Unit[],
  attackerTerrainType?: string
): { min: number; max: number; reduction: number; isFlanking: boolean } {
  // Create a temporary attacker with canMove=false to simulate post-move state for flanking
  const previewAttacker: Unit = hasMoved ? { ...attacker, canMove: false } : attacker;

  // v84.0: Terrain attack bonus now passed explicitly (was module-level mutable state)
  const attackerAtkBonus = attackerTerrainType
    ? (TERRAIN_CONFIGS[attackerTerrainType]?.stats.attackBonus ?? 0)
    : 0;

  // Use the same deterministic calculation as actual combat
  // v51.0: Include hero fortify defense bonus in estimate
  let estimateHeroFortifyDefense = 0;
  if (defenderCell.fortified && nearbyUnits) {
    const fortHeroes = nearbyUnits.filter(u =>
      u.isAlive && u.faction === defender.faction && u.isHero &&
      u.abilities.some(a => a.id === 'fortify_master_passive') &&
      Math.abs(u.position.x - defender.position.x) + Math.abs(u.position.z - defender.position.z) <= 3
    );
    if (fortHeroes.length > 0) {
      estimateHeroFortifyDefense = 10;
    }
  }
  const deterministicDamage = _computeDeterministicDamage(previewAttacker, defender, defenderCell, false, estimateHeroFortifyDefense, attackerAtkBonus);

  // Apply SAM anti-air aura reduction (matching attackUnit logic in attackUnit)
  // v36.0: REMOVED the direct SAM 0.7x reduction here — it was already applied inside
  // _computeDeterministicDamage (line 662-664). This was causing a DOUBLE reduction (0.49x)
  // making helicopter vs SAM damage preview show roughly half the actual damage.
  // v89.0: Reordered to match attackUnit: deterministic → variance → weather → SAM → air shield
  // Previously: deterministic → SAM → air shield → weather → variance (MISMATCH)
  // Apply weather attack modifier first (after deterministic, before variance)
  const weatherConfig = WEATHER_CONFIGS[weather || 'clear'];
  let finalDamage = deterministicDamage * weatherConfig.attackModifier;

  // v78.0: Unified flanking check — matches _computeDeterministicDamage logic
  // Actual combat: !isCounterAttack && attackDist <= 1 && !attacker.canMove
  // Preview: previewAttacker already has canMove=false if hasMoved, so we check that
  const attackDist = Math.abs(attacker.position.x - defender.position.x) + Math.abs(attacker.position.z - defender.position.z);
  const isFlanking = attackDist <= 1 && !previewAttacker.canMove;

  // Compute reduction for UI display — must match _computeDeterministicDamage exactly
  // v84.0: Include hero armorPenetrationBonus in the calculation (was missing before)
  let armorPenetration = attacker.stats.armorPenetration;
  if (attacker.isHero && attacker.abilities) {
    for (const ability of attacker.abilities) {
      if (ability.effect?.armorPenetrationBonus) {
        armorPenetration += ability.effect.armorPenetrationBonus;
      }
    }
  }
  const attackerConfig = UNIT_CONFIGS[attacker.type];
  if (attackerConfig?.damageType === 'he') {
    armorPenetration = Math.floor(armorPenetration * HE_ARMOR_PENALTY);
  }
  let effectiveArmor = Math.max(0, defender.stats.armor - armorPenetration);

  // Apply flanking armor reduction (matching _computeDeterministicDamage lines 745-748)
  if (isFlanking) {
    effectiveArmor = Math.floor(effectiveArmor * FLANK_ARMOR_REDUCTION);
  }

  const damageReduction = effectiveArmor / (effectiveArmor + ARMOR_SCALING_CONSTANT);

  // Apply SAM anti-air aura reduction (after weather, before variance — matching attackUnit)
  if (attacker.type === 'helicopter') {
    if (nearbyUnits) {
      const samConfig = UNIT_CONFIGS.sam as typeof UNIT_CONFIGS.sam & { antiAirRange?: number; antiAirReduction?: number };
      const aaRange = samConfig.antiAirRange ?? 2;
      const aaReduction = samConfig.antiAirReduction ?? 0.3;
      const friendlySams = nearbyUnits.filter(u =>
        u.type === 'sam' && u.isAlive && u.faction === defender.faction && u.id !== defender.id &&
        Math.abs(u.position.x - defender.position.x) + Math.abs(u.position.z - defender.position.z) <= aaRange
      );
      if (friendlySams.length > 0) {
        finalDamage *= (1 - aaReduction);
      }
    }
    // v51.0: Include air_shield_passive reduction (matching attackUnit)
    if (nearbyUnits) {
      const airShieldAllies = nearbyUnits.filter(u =>
        u.isAlive && u.faction === defender.faction && u.id !== defender.id &&
        u.isHero && u.abilities.some(a => a.id === 'air_shield_passive') &&
        Math.abs(u.position.x - defender.position.x) + Math.abs(u.position.z - defender.position.z) <= 2
      );
      if (airShieldAllies.length > 0) {
        finalDamage = Math.max(1, finalDamage - 10);
      }
    }
  }

  // v89.0: Apply variance LAST — matching attackUnit (calculateDamage applies variance before weather/SAM)
  // Since calculateDamage does: deterministic → ±15% → then attackUnit does: weather → SAM → air shield
  // estimateDamage must replicate: deterministic → weather → SAM → air shield → ±15%
  const variance = finalDamage * 0.15;
  const min = Math.max(1, Math.round(finalDamage - variance));
  const max = Math.max(1, Math.round(finalDamage + variance));

  return { min, max, reduction: Math.round(damageReduction * 100), isFlanking };
}

/** 执行攻击 */
export function attackUnit(state: GameState, attacker: Unit, targetPos: Position): GameState {
  const newState = { ...state };
  const newMap = { ...newState.map, cells: newState.map.cells.map(row => row.map(cell => ({ ...cell }))) };
  // v84.0: Deep-copy units to prevent shared-reference mutations (abilities, stats, etc.)
  const newUnits = newState.units.map(u => _deepCopyUnit(u));
  
  // v84.0: Save previousState for undo support (matches moveUnit pattern)
  if (!state.previousState) {
    newState.previousState = {
      ...state,
      units: state.units.map(u => _deepCopyUnit(u)),
      map: { ...state.map, cells: state.map.cells.map(row => row.map(cell => ({ ...cell }))) },
      battleStats: { red: { ...state.battleStats.red }, blue: { ...state.battleStats.blue } },
      selectedUnit: state.selectedUnit ? _deepCopyUnit(state.selectedUnit) : null,
      previousState: null, // Only keep one level of undo
    };
  }
  
  let attackerUnit = newUnits.find(u => u.id === attacker.id);
  const defenderUnit = newUnits.find(u => 
    u.position.x === targetPos.x && u.position.z === targetPos.z && u.faction !== attacker.faction && u.isAlive &&
    isUnitDetected({ ...state, map: newMap, units: newUnits }, u, attacker.faction)
  );
  
  if (!attackerUnit || !defenderUnit) return state;
  
  const defenderCell = getCell(newMap, targetPos);
  if (!defenderCell) return state;
  
  // 计算伤害
  // === Ammo check ===
  if (attackerUnit.stats.ammo !== undefined && attackerUnit.stats.ammo !== null && attackerUnit.stats.ammo <= 0) return state;

  // === Morale check: panicked units cannot attack ===
  if (attackerUnit.stats.morale !== undefined && attackerUnit.stats.morale !== null && attackerUnit.stats.morale < MORALE_CRUSH_THRESHOLD) return state;

  // v33.0: Set attacker terrain attack bonus from attacker's cell position
  const attackerCellForBonus = getCell(newMap, attackerUnit.position);
  const attackerTerrainAtkBonus = attackerCellForBonus ? TERRAIN_CONFIGS[attackerCellForBonus.terrain].stats.attackBonus : 0;

  // v51.0: Check for hero fortify_master_passive defense bonus on defender's cell
  let heroFortifyDefense = 0;
  if (defenderCell.fortified) {
    const nearbyHeroes = newUnits.filter(u =>
      u.isAlive && u.faction === defenderUnit.faction && u.isHero &&
      u.abilities.some(a => a.id === 'fortify_master_passive') &&
      Math.abs(u.position.x - defenderUnit.position.x) + Math.abs(u.position.z - defenderUnit.position.z) <= 3
    );
    if (nearbyHeroes.length > 0) {
      heroFortifyDefense = 10; // fortify_master_passive grants +10 defense
    }
  }

  let damage = calculateDamage(attackerUnit, defenderUnit, defenderCell, false, heroFortifyDefense, attackerTerrainAtkBonus);

  // Apply weather attack modifier
  const weatherConfig = WEATHER_CONFIGS[state.currentWeather];
  damage = Math.round(damage * weatherConfig.attackModifier);

  // Check for friendly SAM anti-air aura near defender (reduces incoming helicopter damage)
  if (attackerUnit.type === 'helicopter') {
    const samConfig = UNIT_CONFIGS.sam as typeof UNIT_CONFIGS.sam & { antiAirRange?: number; antiAirReduction?: number };
    const aaRange = samConfig.antiAirRange ?? 2;
    const aaReduction = samConfig.antiAirReduction ?? 0.3;
    const friendlySams = newUnits.filter(u =>
      u.type === 'sam' && u.isAlive && u.faction === defenderUnit.faction && u.id !== defenderUnit.id &&
      Math.abs(u.position.x - defenderUnit.position.x) + Math.abs(u.position.z - defenderUnit.position.z) <= aaRange
    );
    if (friendlySams.length > 0) {
      damage = Math.round(damage * (1 - aaReduction));
    }
    // v36.0: Air shield hero passive — allies within 2 cells get +10 anti-air defense
    const airShieldAllies = newUnits.filter(u =>
      u.isAlive && u.faction === defenderUnit.faction && u.id !== defenderUnit.id &&
      u.isHero && u.abilities.some(a => a.id === 'air_shield_passive') &&
      Math.abs(u.position.x - defenderUnit.position.x) + Math.abs(u.position.z - defenderUnit.position.z) <= 2
    );
    if (airShieldAllies.length > 0) {
      damage = Math.max(1, damage - 10);
    }
  }

  // 提前声明弹窗和日志数组（支持HE溅射伤害）
  const damagePopups: DamagePopup[] = [];
  const newCombatLogEntries: CombatLogEntry[] = [];

  // 应用主目标伤害 + 追踪总伤害
  defenderUnit.stats = { ...defenderUnit.stats, hp: Math.max(0, defenderUnit.stats.hp - damage) };
  attackerUnit.totalDamageDealt += damage;

  // Modern combat: apply suppression after damage
  if (defenderUnit.modern) {
    defenderUnit.modern.suppression = Math.min(100, (defenderUnit.modern.suppression ?? 0) + damage * 0.5);
    defenderUnit.modern.morale = Math.max(0, (defenderUnit.modern.morale ?? 100) - damage * 0.3);
  }

  if (defenderUnit.stats.hp <= 0) {
    defenderUnit.isAlive = false;
    const cell = getCell(newMap, targetPos);
    if (cell) cell.unit = null;
  }

  // 主目标伤害弹窗
  damagePopups.push({
    id: ++popupIdCounter,
    x: targetPos.x,
    z: targetPos.z,
    value: damage,
    type: defenderUnit.stats.hp <= 0 ? 'kill' : 'damage',
    timestamp: Date.now(),
  });

  attackerUnit.canAttack = false;
  // v40.0: hit_and_run_passive allows moving after attacking
  const hasHitAndRun = attackerUnit.isHero && attackerUnit.abilities.some(a => a.id === 'hit_and_run_passive');
  if (!hasHitAndRun) {
    attackerUnit.canMove = false;
  }
  attackerUnit.attackedThisTurn = true;
  // v41.0: Capture wasStealthed before clearing, so non-stealthed units don't get cooldown
  const wasStealthed = attackerUnit.isStealthed;
  attackerUnit.isStealthed = false;
  // === Ammo decrement ===
  if (attackerUnit.stats.ammo !== undefined && attackerUnit.stats.ammo !== null && attackerUnit.stats.maxAmmo !== undefined) {
    attackerUnit.stats = { ...attackerUnit.stats, ammo: Math.max(0, attackerUnit.stats.ammo - 1) };
    damagePopups.push({
      id: ++popupIdCounter,
      x: attackerUnit.position.x,
      z: attackerUnit.position.z,
      value: -1,
      type: 'ammo',
      timestamp: Date.now(),
    });
  }
  // === Morale: defender loses morale on taking damage ===
  if (defenderUnit.stats.morale !== undefined && defenderUnit.stats.morale !== null) {
    defenderUnit.stats = { ...defenderUnit.stats, morale: Math.max(0, defenderUnit.stats.morale - MORALE_LOSS_ON_DAMAGE) };
    damagePopups.push({
      id: ++popupIdCounter,
      x: defenderUnit.position.x,
      z: defenderUnit.position.z,
      value: -MORALE_LOSS_ON_DAMAGE,
      type: 'morale',
      timestamp: Date.now(),
    });
  }
  if (wasStealthed && attackerUnit.stealthCooldown === 0) {
    attackerUnit.stealthCooldown = UNIT_CONFIGS[attacker.type].stealthCooldownMax ?? 3;
  }

  // 反击（如果防御方存活且在攻击范围内）
  // v33.0: Add ammo and morale checks for counter-attacks (matching primary attack rules)
  let counterDamage = 0;
  const canCounterAttack = defenderUnit.isAlive &&
    defenderUnit.stats.hp > 0 &&
    (defenderUnit.stats.ammo === undefined || defenderUnit.stats.ammo === null || defenderUnit.stats.ammo > 0) &&
    (defenderUnit.stats.morale === undefined || defenderUnit.stats.morale === null || defenderUnit.stats.morale >= MORALE_CRUSH_THRESHOLD);
  if (canCounterAttack) {
    const counterDist = Math.abs(attackerUnit.position.x - defenderUnit.position.x) + Math.abs(attackerUnit.position.z - defenderUnit.position.z);
    // v93.0: Include hero attackRangeBonus for counter-attack eligibility (matching getAttackablePositions)
    let effectiveCounterRange = defenderUnit.stats.attackRange;
    if (defenderUnit.isHero && defenderUnit.abilities.length > 0) {
      const rangeBonus = defenderUnit.abilities.find(a => a.type === 'passive' && (a.effect as any).attackRangeBonus);
      if (rangeBonus && (rangeBonus.effect as any).attackRangeBonus) effectiveCounterRange += (rangeBonus.effect as any).attackRangeBonus;
    }
    if (counterDist <= effectiveCounterRange) {
      const attackerCell = getCell(newMap, attackerUnit.position);
      if (attackerCell) {
        // v84.0: For counter-attack, compute terrain bonus from defenderUnit's cell
        const counterAttackerCell = getCell(newMap, defenderUnit.position);
        const counterTerrainAtkBonus = counterAttackerCell ? TERRAIN_CONFIGS[counterAttackerCell.terrain].stats.attackBonus : 0;
        // v70.0: Counter-attack also checks fortify_master_passive on attacker's cell
        let counterHeroFortifyDefense = 0;
        if (attackerCell.fortified && attackerUnit) {
          const counterFortHeroes = newUnits.filter(u =>
            u.isAlive && u.faction === attackerUnit!.faction && u.isHero &&
            u.abilities.some(a => a.id === 'fortify_master_passive') &&
            Math.abs(u.position.x - attackerUnit!.position.x) + Math.abs(u.position.z - attackerUnit!.position.z) <= 3
          );
          if (counterFortHeroes.length > 0) counterHeroFortifyDefense = 10;
        }
        counterDamage = Math.round(calculateDamage(defenderUnit, attackerUnit, attackerCell, true, counterHeroFortifyDefense, counterTerrainAtkBonus) * 0.6); // 反击伤害60%
        // v30.0: Apply weather modifier to counter damage
        counterDamage = Math.round(counterDamage * weatherConfig.attackModifier);
        // v75.0: SAM anti-air aura also reduces counter-attack damage from helicopters
        if (defenderUnit.type === 'helicopter' && attackerUnit) {
          const samConfig = UNIT_CONFIGS.sam as typeof UNIT_CONFIGS.sam & { antiAirRange?: number; antiAirReduction?: number };
          const aaRange = samConfig.antiAirRange ?? 2;
          const aaReduction = samConfig.antiAirReduction ?? 0.3;
          const friendlySams = newUnits.filter(u =>
            u.type === 'sam' && u.isAlive && u.faction === attackerUnit!.faction && u.id !== attackerUnit!.id &&
            Math.abs(u.position.x - attackerUnit!.position.x) + Math.abs(u.position.z - attackerUnit!.position.z) <= aaRange
          );
          if (friendlySams.length > 0) {
            counterDamage = Math.round(counterDamage * (1 - aaReduction));
          }
          // Air shield hero passive — allies within 2 cells get +10 anti-air defense
          const airShieldAllies = newUnits.filter(u =>
            u.isAlive && u.faction === attackerUnit!.faction && u.id !== attackerUnit!.id &&
            u.isHero && u.abilities.some(a => a.id === 'air_shield_passive') &&
            Math.abs(u.position.x - attackerUnit!.position.x) + Math.abs(u.position.z - attackerUnit!.position.z) <= 2
          );
          if (airShieldAllies.length > 0) {
            counterDamage = Math.max(1, counterDamage - 10);
          }
        }
        // Hero counter attack bonus
        if (defenderUnit.isHero && defenderUnit.abilities.length > 0) {
          for (const ability of defenderUnit.abilities) {
            if (ability.type === 'passive' && ability.effect.counterAttackBonus) {
              counterDamage = Math.round(counterDamage * (1 + ability.effect.counterAttackBonus));
            }
          }
        }
        attackerUnit.stats = { ...attackerUnit.stats, hp: Math.max(0, attackerUnit.stats.hp - counterDamage) };

        if (attackerUnit.stats.hp <= 0) {
          attackerUnit.isAlive = false;
          const cell = getCell(newMap, attackerUnit.position);
          if (cell) cell.unit = null;
        }
      }
    }
  }
  // v36.0: Counter-attack consumes defender's ammo (was free before — SAMs could counter-attack infinitely)
  if (counterDamage > 0 && defenderUnit.stats.ammo !== undefined && defenderUnit.stats.ammo !== null && defenderUnit.stats.maxAmmo !== undefined) {
    defenderUnit.stats = { ...defenderUnit.stats, ammo: Math.max(0, defenderUnit.stats.ammo - 1) };
    damagePopups.push({
      id: ++popupIdCounter,
      x: defenderUnit.position.x,
      z: defenderUnit.position.z,
      value: -1,
      type: 'ammo',
      timestamp: Date.now(),
    });
  }
  if (counterDamage > 0) {
    damagePopups.push({
      id: ++popupIdCounter,
      x: attackerUnit.position.x,
      z: attackerUnit.position.z,
      value: counterDamage,
      type: 'counter',
      timestamp: Date.now(),
    });
  }

  // HE溅射伤害：对主目标相邻敌方单位造成30%伤害
  const attackerConfig = UNIT_CONFIGS[attacker.type];
  const isHE = attackerConfig?.damageType === 'he';
  let splashTargets: typeof newUnits = [];
  let splashDamage = 0;
  if (isHE) {
    let splashRadius = 1;
    let splashDamageRatio = 0.3;
    // v40.0: Hero splash_passive enhances splash for hero artillery
    if (attacker.isHero) {
      const splashPassive = attacker.abilities.find(a => a.id === 'splash_passive');
      if (splashPassive && splashPassive.effect) {
        if (splashPassive.effect.aoeRadius) splashRadius = splashPassive.effect.aoeRadius;
        if (splashPassive.effect.aoeDamage) splashDamageRatio = splashPassive.effect.aoeDamage;
      }
    }
    splashDamage = Math.round(damage * splashDamageRatio);

    // Find enemy units adjacent to target (Manhattan distance 1) that are NOT the main target
    // v28.0: Also check stealth detection for splash targets
    splashTargets = newUnits.filter(u =>
      u.faction !== attacker.faction &&
      u.isAlive &&
      u.id !== defenderUnit.id &&
      Math.abs(u.position.x - targetPos.x) + Math.abs(u.position.z - targetPos.z) <= splashRadius &&
      isUnitDetected({ ...state, map: newMap, units: newUnits }, u, attacker.faction)
    );

    for (const splashTarget of splashTargets) {
      const splashUnit = newUnits.find(u => u.id === splashTarget.id);
      if (splashUnit) {
        const actualSplash = Math.max(1, splashDamage);
        splashUnit.stats = { ...splashUnit.stats, hp: Math.max(0, splashUnit.stats.hp - actualSplash) };
        if (splashUnit.stats.hp <= 0) {
          splashUnit.isAlive = false;
          const splashCell = getCell(newMap, splashTarget.position);
          if (splashCell) splashCell.unit = null;
        }
        damagePopups.push({
          id: ++popupIdCounter,
          x: splashTarget.position.x,
          z: splashTarget.position.z,
          value: actualSplash,
          type: 'damage',
          timestamp: Date.now(),
        });
        newCombatLogEntries.unshift({
          turn: state.turn,
          attacker: `${attackerUnit.name}(${attackerUnit.faction === 'red' ? '红方' : '蓝方'})`,
          defender: `${splashUnit.name}(${splashUnit.faction === 'red' ? '红方' : '蓝方'})`,
          damage: actualSplash,
          defenderRemainingHp: splashUnit.stats.hp,
          attackerFaction: attackerUnit.faction,
          eventType: splashUnit.stats.hp <= 0 ? 'destroy' : 'attack',
        });
      }
    }
  }

  // 战斗日志
  const logEntry: CombatLogEntry = {
    turn: state.turn,
    attacker: `${attackerUnit.name}(${attackerUnit.faction === 'red' ? '红方' : '蓝方'})`,
    defender: `${defenderUnit.name}(${defenderUnit.faction === 'red' ? '红方' : '蓝方'})`,
    damage: damage,
    defenderRemainingHp: defenderUnit.stats.hp,
    defenderMaxHp: defenderUnit.stats.maxHp,
    attackerFaction: attackerUnit.faction,
    counterDamage: counterDamage > 0 ? counterDamage : undefined,
    counterAttackerRemainingHp: counterDamage > 0 ? attackerUnit.stats.hp : undefined,
    wasCounterKill: counterDamage > 0 && attackerUnit.stats.hp <= 0,
    eventType: defenderUnit.stats.hp <= 0 ? 'destroy' : 'attack',
    // v25.0: Click-to-focus support
    attackerPosition: { x: attackerUnit.position.x, z: attackerUnit.position.z },
    defenderPosition: { x: defenderUnit.position.x, z: defenderUnit.position.z },
    attackerUnitId: attackerUnit.id,
    defenderUnitId: defenderUnit.id,
  };
  newCombatLogEntries.unshift(logEntry);

  // 战斗结果通知
  const combatToast: CombatToast = {
    id: ++popupIdCounter,
    attackerName: attackerUnit.name,
    defenderName: defenderUnit.name,
    attackerFaction: attackerUnit.faction,
    damage,
    defenderRemainingHp: defenderUnit.stats.hp,
    counterDamage: counterDamage > 0 ? counterDamage : undefined,
    attackerRemainingHp: counterDamage > 0 ? attackerUnit.stats.hp : undefined,
    wasKill: defenderUnit.stats.hp <= 0,
    wasCounterKill: counterDamage > 0 && attackerUnit.stats.hp <= 0 ? true : undefined,
    timestamp: Date.now(),
    // v76.0: Include attacker's kill count for streak display
    // v77.0: Fixed operator precedence — parens around (killCount ?? 0)
    attackerKillCount: (attackerUnit.killCount ?? 0) + (defenderUnit.stats.hp <= 0 ? 1 : 0),
    // v89.0: Defender unit type for kill notification icon
    defenderType: defenderUnit.type,
  };

  // === 经验值系统 ===
  // === 战斗统计 ===
  const attackerFaction = attackerUnit.faction;
  const defenderFaction = defenderUnit.faction;
  const newBattleStats: BattleStats = {
    red: { ...state.battleStats.red },
    blue: { ...state.battleStats.blue },
  };
  // Track main attack damage
  newBattleStats[attackerFaction].damageDealt += damage;
  newBattleStats[attackerFaction].attacks += 1;
  newBattleStats[defenderFaction].damageReceived += damage;
  // Track counter damage
  if (counterDamage > 0) {
    newBattleStats[defenderFaction].damageDealt += counterDamage;
    newBattleStats[attackerFaction].damageReceived += counterDamage;
  }
  // === Morale: nearby allies of defender lose morale if defender is killed ===
  const defenderWasKilled = defenderUnit.stats.hp <= 0;
  if (defenderWasKilled) {
    const nearbyAllies = newUnits.filter(u =>
      u.isAlive && u.id !== defenderUnit.id && u.faction === defenderUnit.faction &&
      Math.abs(u.position.x - targetPos.x) + Math.abs(u.position.z - targetPos.z) <= 2
    );
    for (const ally of nearbyAllies) {
      if (ally.stats.morale !== undefined && ally.stats.morale !== null) {
        ally.stats = { ...ally.stats, morale: Math.max(0, ally.stats.morale - MORALE_LOSS_ON_ALLY_KILL) };
        damagePopups.push({
          id: ++popupIdCounter,
          x: ally.position.x,
          z: ally.position.z,
          value: -MORALE_LOSS_ON_ALLY_KILL,
          type: 'morale',
          timestamp: Date.now(),
        });
      }
    }
  }
  if (defenderWasKilled) {
    newBattleStats[attackerFaction].unitsDestroyed += 1;
    newBattleStats[attackerFaction].kills += 1;
    newBattleStats[defenderFaction].unitsLost += 1;
  }
  // Track counter-kill
  const attackerWasCounterKilled = counterDamage > 0 && attackerUnit.stats.hp <= 0;
  if (attackerWasCounterKilled) {
    newBattleStats[defenderFaction].unitsDestroyed += 1;
    newBattleStats[defenderFaction].kills += 1;
    newBattleStats[attackerFaction].unitsLost += 1;
  }

  // Track HE splash kills in battle stats
  if (isHE) {
    for (const splashTarget of splashTargets) {
      if (!splashTarget.isAlive) {
        // splashTarget.isAlive was already set to false above if killed
        const splashUnitCheck = newUnits.find(u => u.id === splashTarget.id);
        if (splashUnitCheck && !splashUnitCheck.isAlive) {
          newBattleStats[attackerFaction].unitsDestroyed += 1;
          newBattleStats[attackerFaction].kills += 1;
          newBattleStats[splashUnitCheck.faction].unitsLost += 1;
        }
      }
    }
  }

  // v27.0: Sync fully-mutated attacker/defender into newUnits (fix stale reference bug)
  // All combat mutations (HP, ammo, morale, stealthCooldown, counter-damage) have been
  // applied to attackerUnit/defenderUnit local references. Ensure newUnits reflects them.
  const finalAtkIdx = newUnits.findIndex(u => u.id === attacker.id);
  if (finalAtkIdx >= 0) newUnits[finalAtkIdx] = attackerUnit;
  const finalDefIdx = newUnits.findIndex(u => u.id === defenderUnit.id);
  if (finalDefIdx >= 0) newUnits[finalDefIdx] = defenderUnit;

  // v27.0: Record action history AFTER all mutations (was before ammo/morale/counter in v26.0)
  if (finalAtkIdx >= 0) {
    newUnits[finalAtkIdx] = _recordAction(newUnits[finalAtkIdx], {
      turn: state.turn, type: 'attack',
      description: `攻击 ${defenderUnit.name}`,
      value: damage, targetName: defenderUnit.name,
      position: { x: targetPos.x, z: targetPos.z },
    });
  }
  if (finalDefIdx >= 0) {
    newUnits[finalDefIdx] = _recordAction(newUnits[finalDefIdx], {
      turn: state.turn, type: 'damage_taken',
      description: `被 ${attackerUnit.name} 攻击`,
      value: damage, targetName: attackerUnit.name,
      position: { x: targetPos.x, z: targetPos.z },
    });
  }

  // Cap damagePopups and combatToasts to prevent memory leaks (keep last 50 each)
  const existingPopups = newState.damagePopups || [];
  const existingToasts = newState.combatToasts || [];
  const MAX_POPUPS = 50;
  const MAX_TOASTS = 20;
  const trimmedPopups = existingPopups.length > MAX_POPUPS ? existingPopups.slice(-MAX_POPUPS) : existingPopups;
  const trimmedToasts = existingToasts.length > MAX_TOASTS ? existingToasts.slice(-MAX_TOASTS) : existingToasts;

  // Compute shake intensity based on attacker unit type
  const attackerType = attackerUnit.type;
  let computedShakeIntensity: number;
  if (attackerUnit.isHero) {
    computedShakeIntensity = 2; // Hero abilities
  } else if (attackerType === 'mlrs' || attackerType === 'artillery') {
    computedShakeIntensity = 3; // Heavy shake
  } else if (attackerType === 'tank' || attackerType === 'ifv' || attackerType === 'helicopter') {
    computedShakeIntensity = 1.5; // Medium shake
  } else {
    computedShakeIntensity = 0.5; // Light shake (infantry/scout/engineer/supply/sam)
  }

  let xpGrantedState: GameState = {
    ...newState,
    map: newMap,
    units: newUnits,
    damagePopups: [...trimmedPopups, ...damagePopups],
    combatToasts: [...trimmedToasts, combatToast],
    combatLog: (() => {
      const combined = [...newState.combatLog, ...newCombatLogEntries];
      return combined.length > 200 ? combined.slice(-200) : combined;
    })(),
    shakeActive: true,
    shakeIntensity: computedShakeIntensity,
    battleStats: newBattleStats,
  };
  
  // 攻击者获得伤害经验
  if (attackerUnit.isAlive) {
    xpGrantedState = grantXP(xpGrantedState, attackerUnit, Math.floor(damage / XP_PER_DAMAGE), 'damage');
    const updatedAttacker = xpGrantedState.units.find(u => u.id === attacker.id);
    if (updatedAttacker) attackerUnit = updatedAttacker;
  }
  
  // 击杀奖励
  if (!defenderUnit.isAlive && attackerUnit.isAlive) {
    attackerUnit = { ...attackerUnit, killCount: attackerUnit.killCount + 1 };
    const killIdx = xpGrantedState.units.findIndex(u => u.id === attacker.id);
    if (killIdx >= 0) {
      const updatedUnits = [...xpGrantedState.units];
      updatedUnits[killIdx] = attackerUnit;
      xpGrantedState = { ...xpGrantedState, units: updatedUnits };
    }
    xpGrantedState = grantXP(xpGrantedState, attackerUnit, XP_PER_KILL, 'kill');
    // v67.0: Track kills per turn for streak detection
    const faction = attackerUnit.faction;
    xpGrantedState = { ...xpGrantedState, turnKillCounts: { ...xpGrantedState.turnKillCounts, [faction]: (xpGrantedState.turnKillCounts[faction] || 0) + 1 } };
  }

  // HE splash kill XP rewards
  if (isHE && attackerUnit.isAlive) {
    for (const splashTarget of splashTargets) {
      const splashUnitCheck = xpGrantedState.units.find(u => u.id === splashTarget.id);
      if (splashUnitCheck && !splashUnitCheck.isAlive) {
        attackerUnit = { ...attackerUnit, killCount: attackerUnit.killCount + 1 };
        const splashKillIdx = xpGrantedState.units.findIndex(u => u.id === attacker.id);
        if (splashKillIdx >= 0) {
          const updatedUnits = [...xpGrantedState.units];
          updatedUnits[splashKillIdx] = attackerUnit;
          xpGrantedState = { ...xpGrantedState, units: updatedUnits };
        }
        xpGrantedState = grantXP(xpGrantedState, attackerUnit, XP_PER_KILL, 'kill');
        // v67.0: Track splash kills per turn
        const splashFaction = attackerUnit.faction;
        xpGrantedState = { ...xpGrantedState, turnKillCounts: { ...xpGrantedState.turnKillCounts, [splashFaction]: (xpGrantedState.turnKillCounts[splashFaction] || 0) + 1 } };
      }
    }
  }
  
  // v40.0: Grant damage XP for splash damage (was only kill XP before)
  if (isHE && attackerUnit.isAlive && splashDamage > 0) {
    const aliveSplashTargets = splashTargets.filter(t => {
      const check = xpGrantedState.units.find(u => u.id === t.id);
      return check && check.isAlive;
    });
    if (aliveSplashTargets.length > 0) {
      xpGrantedState = grantXP(xpGrantedState, attackerUnit, Math.floor(splashDamage * aliveSplashTargets.length / XP_PER_DAMAGE), 'damage');
      const updatedAttacker2 = xpGrantedState.units.find(u => u.id === attacker.id);
      if (updatedAttacker2) attackerUnit = updatedAttacker2;
    }
  }
  
  // 检查胜负
  const redAlive = xpGrantedState.units.filter(u => u.faction === 'red' && u.isAlive).length;
  const blueAlive = xpGrantedState.units.filter(u => u.faction === 'blue' && u.isAlive).length;
  
  let winner: Faction | null = null;
  let phase: GamePhase = 'selectUnit';
  if (redAlive === 0) { winner = 'blue'; phase = 'gameOver'; }
  else if (blueAlive === 0) { winner = 'red'; phase = 'gameOver'; }
  
  // v40.0: hit_and_run_passive — return with moveUnit phase instead of selectUnit
  if (winner === null && hasHitAndRun && attackerUnit.isAlive && attackerUnit.canMove) {
    const movePositions = getMovablePositions(xpGrantedState, attackerUnit);
    return {
      ...xpGrantedState,
      selectedUnit: attackerUnit,
      movablePositions: movePositions,
      attackablePositions: [],
      movePath: [],
      phase: 'moveUnit' as GamePhase,
      winner,
      previousState: null,
    };
  }
  
  // v84.0: No longer need to reset _attackerTerrainAtkBonus (now passed as parameter)

  return {
    ...xpGrantedState,
    selectedUnit: null,
    movablePositions: [],
    attackablePositions: [],
    movePath: [],
    phase,
    winner,
    previousState: null,
  };
}

/** 工程车修建工事 */
export function buildFortification(state: GameState, unit: Unit): GameState {
  // v64.0: Only require canAttack (allow move-then-build, consistent with attack behavior)
  if (!unit.isAlive || !unit.canAttack) return state;
  if (unit.type !== 'engineer') return state;
  
  const newMap = { ...state.map, cells: state.map.cells.map(row => row.map(cell => ({ ...cell }))) };
  // v89.0: Use _deepCopyUnit for consistent deep-copy (includes abilities/stats)
  const newUnits = state.units.map(u => _deepCopyUnit(u));
  
  // 设置当前格子的工事
  const cell = getCell(newMap, unit.position);
  if (!cell) return state;
  if (cell.fortified) return state; // Already fortified
  cell.fortified = true;
  // v89.0: Always set fortifyDuration (not just for heroes) — prevents stale extended values
  const heroFortBonus = getHeroFortifyBonus(unit);
  cell.fortifiedByTurn = state.turn;
  cell.fortifyDuration = FORTIFY_DURATION + heroFortBonus.durationBonus;
  
  // 标记工程车已行动
  const engineer = newUnits.find(u => u.id === unit.id);
  if (engineer) {
    engineer.canMove = false;
    engineer.canAttack = false;
    // v26.0: Record fortify action
    const engIdx = newUnits.findIndex(u => u.id === engineer.id);
    if (engIdx >= 0) {
      newUnits[engIdx] = _recordAction(engineer, {
        turn: state.turn, type: 'fortify',
        description: '修建工事',
        position: { x: unit.position.x, z: unit.position.z },
      });
    }
  }
  
  // 更新地图中的单位引用
  // v34.0: Use fresh unit reference from newUnits after _recordAction
  const freshEngineer = newUnits[newUnits.findIndex(u => u.id === unit.id)];
  const cellWithUnit = getCell(newMap, unit.position);
  if (cellWithUnit && freshEngineer) cellWithUnit.unit = freshEngineer;
  
  // 添加战斗日志
  const logEntry: CombatLogEntry = {
    turn: state.turn,
    attacker: `${engineer?.name ?? '工程车'}(${unit.faction === 'red' ? '红方' : '蓝方'})`,
    defender: '工事',
    damage: 0,
    defenderRemainingHp: 0,
    attackerFaction: unit.faction,
    eventType: 'attack', // reuse for log display
  };

  // Track fort built in battle stats
  const newBattleStats: BattleStats = {
    red: { ...state.battleStats.red },
    blue: { ...state.battleStats.blue },
  };
  newBattleStats[unit.faction].fortsBuilt += 1;
  
  return {
    ...state,
    map: newMap,
    units: newUnits,
    selectedUnit: null,
    movablePositions: [],
    attackablePositions: [],
    movePath: [],
    phase: 'selectUnit',
    previousState: null,
    combatLog: (() => {
      const combined = [...state.combatLog, logEntry];
      return combined.length > 200 ? combined.slice(-200) : combined;
    })(),
    battleStats: newBattleStats,
  };
}

/** 工程车排雷 — 支持清除相邻格子地雷（targetPos参数） */
export function clearMinefield(state: GameState, unit: Unit, targetPos?: Position): GameState {
  // v64.0: Only require canAttack (allow move-then-clear)
  if (!unit.isAlive || !unit.canAttack) return state;
  if (unit.type !== 'engineer') return state;

  const clearPos = targetPos ?? unit.position;
  const cell = getCell(state.map, clearPos);
  if (!cell || !cell.hasMinefield) return state;
  // Can only clear ENEMY mines (not your own faction's mines)
  if (cell.minefieldOwner === unit.faction) return state;
  // If clearing adjacent, validate range
  if (targetPos) {
    const dist = Math.abs(targetPos.x - unit.position.x) + Math.abs(targetPos.z - unit.position.z);
    if (dist > 1) return state;
  }

  const newMap = { ...state.map, cells: state.map.cells.map(row => row.map(c => ({ ...c }))) };
  // v89.0: Use _deepCopyUnit for consistent deep-copy (includes abilities/stats)
  const newUnits = state.units.map(u => _deepCopyUnit(u));

  const targetCell = getCell(newMap, clearPos);
  if (targetCell) {
    targetCell.hasMinefield = false;
    targetCell.minefieldOwner = undefined;
  }

  const engineer = newUnits.find(u => u.id === unit.id);
  if (engineer) {
    engineer.canMove = false;
    engineer.canAttack = false;
    // v32.0: Record mine clear action
    const engIdx = newUnits.findIndex(u => u.id === engineer.id);
    if (engIdx >= 0) {
      newUnits[engIdx] = _recordAction(engineer, {
        turn: state.turn, type: 'ability',
        description: `排雷 (${clearPos.x}, ${clearPos.z})`,
        position: { x: clearPos.x, z: clearPos.z },
      });
    }
  }

  // Update map unit reference
  const finalEngineer = newUnits.find(u => u.id === unit.id);
  if (targetCell && finalEngineer) targetCell.unit = finalEngineer;

  const logEntry: CombatLogEntry = {
    turn: state.turn,
    attacker: `${engineer?.name ?? '工程车'}(${unit.faction === 'red' ? '红方' : '蓝方'})`,
    defender: '💣 地雷',
    damage: 0,
    defenderRemainingHp: 0,
    attackerFaction: unit.faction,
    eventType: 'attack',
  };

  return {
    ...state,
    map: newMap,
    units: newUnits,
    selectedUnit: null,
    movablePositions: [],
    attackablePositions: [],
    movePath: [],
    phase: 'selectUnit' as GamePhase,
    previousState: null,
    combatLog: (() => {
      const combined = [...state.combatLog, logEntry];
      return combined.length > 200 ? combined.slice(-200) : combined;
    })(),
  };
}

/** 撤退单位 — 单位自愿撤退（消耗整回合，移动1-2格远离敌人） */
export function retreatUnit(state: GameState, unit: Unit): GameState {
  if (!unit.isAlive || unit.faction !== state.currentFaction) return state;
  if (!unit.canMove && !unit.canAttack) return state; // already acted
  // v76.0: Sandstorm grounds helicopters — can't retreat either (matching getMovablePositions)
  if (unit.type === 'helicopter' && state.currentWeather === 'sandstorm') return state;

  // Find nearest detected enemy
  const enemies = state.units.filter(u => u.faction !== unit.faction && u.isAlive && isUnitDetected(state, u, unit.faction));
  if (enemies.length === 0) return state; // no enemies to retreat from

  let nearestEnemy = enemies[0];
  let nearestDist = Infinity;
  for (const e of enemies) {
    const d = Math.abs(e.position.x - unit.position.x) + Math.abs(e.position.z - unit.position.z);
    if (d < nearestDist) {
      nearestDist = d;
      nearestEnemy = e;
    }
  }

  // Direction away from nearest enemy
  const dx = Math.sign(unit.position.x - nearestEnemy.position.x) || (Math.random() < 0.5 ? 1 : -1);
  const dz = Math.sign(unit.position.z - nearestEnemy.position.z) || (Math.random() < 0.5 ? 1 : -1);

  // Find best retreat position using BFS within movement range
  // v70.0: Retreat respects unit's moveRange and terrain movement costs (previously allowed teleport up to 2 cells)
  const retreatCandidates: { pos: Position; defense: number }[] = [];
  const effectiveMoveRange = unit.stats.moveRange || 2;
  
  // v74.0: Use Map for best-remaining-wins BFS (matching getMovablePositions v65.0)
  const visited = new Map<string, number>(); // key -> remaining move points
  const queue: { x: number; z: number; cost: number; remaining: number }[] = [{ x: unit.position.x, z: unit.position.z, cost: 0, remaining: effectiveMoveRange }];
  visited.set(`${unit.position.x},${unit.position.z}`, effectiveMoveRange);
  const isVehicle = UNIT_CONFIGS[unit.type]?.isVehicle ?? false;
  
  // v72.0: Fixed O(n) splice dequeue to O(1) index approach (matching getMovablePositions v65.0)
  let qi = 0;
  while (qi < queue.length) {
    const curr = queue[qi++]!;
    
    const neighbors = [
      { x: curr.x + 1, z: curr.z },
      { x: curr.x - 1, z: curr.z },
      { x: curr.x, z: curr.z + 1 },
      { x: curr.x, z: curr.z - 1 },
    ];
    
    for (const n of neighbors) {
      const key = `${n.x},${n.z}`;
      if (n.x < 0 || n.x >= state.map.width || n.z < 0 || n.z >= state.map.height) continue;
      const nCell = state.map.cells[n.z]?.[n.x];
      if (!nCell) continue;
      const nTerrain = TERRAIN_CONFIGS[nCell.terrain];
      // v71.0: Helicopters can fly over impassable terrain (except water), matching getMovablePositions
      const isHelicopter = unit.type === 'helicopter';
      if (isHelicopter) {
        if (nCell.terrain === 'water') continue;
      } else {
        if (!nTerrain.stats.isPassable) continue;
        if (isVehicle && !nTerrain.stats.isPassableByVehicle) continue;
      }
      
      // Weather movement modifier
      let moveCost = nTerrain.stats.moveCost;
      if (state.currentWeather && state.currentWeather !== 'clear') {
        moveCost *= WEATHER_CONFIGS[state.currentWeather]?.movementModifier ?? 1.0;
      }
      
      // v74.0: Helicopters ignore terrain movement cost
      const effectiveMoveCost = isHelicopter ? 1 : moveCost;
      const remaining = curr.remaining - effectiveMoveCost;
      if (remaining < 0) continue;
      
      // v74.0: Skip if we already reached this cell with equal or more remaining move points
      const prevRemaining = visited.get(key);
      if (prevRemaining !== undefined && prevRemaining >= remaining) continue;
      
      visited.set(key, remaining);
      queue.push({ x: n.x, z: n.z, cost: curr.cost + effectiveMoveCost, remaining });
      
      // v74.0: Check cell occupancy — undetected stealthed enemies block retreat destination
      // (matching getMovablePositions v73.0 fix — moving onto stealthed enemy corrupts map state)
      let hasUndetectedStealthedEnemy = false;
      if (nCell.unit && nCell.unit.id !== unit.id && nCell.unit.isAlive) {
        if (nCell.unit.faction === unit.faction) continue;
        if (isUnitDetected(state, nCell.unit, unit.faction)) continue;
        // undetected stealthed enemy — allow BFS passage but DON'T add as retreat candidate
        hasUndetectedStealthedEnemy = true;
      }
      
      if (!hasUndetectedStealthedEnemy) {
        // Prefer positions further from all enemies and with higher defense
        const minEnemyDist = enemies.reduce((min, e) => Math.min(min, Math.abs(e.position.x - n.x) + Math.abs(e.position.z - n.z)), 0);
        // Bonus for moving AWAY from nearest enemy
        const awayBonus = Math.abs(n.x - nearestEnemy.position.x) + Math.abs(n.z - nearestEnemy.position.z) > nearestDist ? 5 : 0;
        retreatCandidates.push({ pos: { x: n.x, z: n.z }, defense: minEnemyDist * 10 + nTerrain.stats.defenseBonus + awayBonus });
      }
    }
  }

  if (retreatCandidates.length === 0) return state; // nowhere to retreat

  // Sort by defense score (prefer safer positions)
  retreatCandidates.sort((a, b) => b.defense - a.defense);
  const retreatPos = retreatCandidates[0].pos;

  const newMap = { ...state.map, cells: state.map.cells.map(row => row.map(cell => ({ ...cell }))) };
  // v89.0: Use _deepCopyUnit for consistent deep-copy (includes abilities)
  const newUnits = state.units.map(u => _deepCopyUnit(u));

  // Remove from old position
  const oldCell = getCell(newMap, unit.position);
  if (oldCell) oldCell.unit = null;

  // Move unit
  const retreatedUnit = newUnits.find(u => u.id === unit.id);
  if (!retreatedUnit) return state;
  
  retreatedUnit.position = retreatPos;
  retreatedUnit.canMove = false;
  retreatedUnit.canAttack = false;

  // Apply morale penalty: -5 HP (min 1)
  const hpLoss = Math.min(5, retreatedUnit.stats.hp - 1);
  retreatedUnit.stats = { ...retreatedUnit.stats, hp: retreatedUnit.stats.hp - hpLoss };

  // v32.0: Record retreat action AFTER all mutations (fix stale reference)
  const retIdx = newUnits.findIndex(u => u.id === retreatedUnit.id);
  if (retIdx >= 0) {
    newUnits[retIdx] = _recordAction(retreatedUnit, {
      turn: state.turn, type: 'retreat',
      description: `撤退至 (${retreatPos.x}, ${retreatPos.z})`,
      position: { x: retreatPos.x, z: retreatPos.z },
    });
  }

  // Place at new position (use the final reference from newUnits, not stale retreatedUnit)
  const finalRetreatedUnit = newUnits[retIdx] ?? retreatedUnit;
  const newCell = getCell(newMap, retreatPos);
  if (newCell) newCell.unit = finalRetreatedUnit;

  // v41.0: Check for minefield at retreat position
  const retreatMinePopups: DamagePopup[] = [];
  const retreatMineCell = getCell(newMap, retreatPos);
  if (retreatMineCell && retreatMineCell.hasMinefield && retreatMineCell.minefieldOwner !== finalRetreatedUnit.faction) {
    const mineDamage = MINE_DAMAGE;
    retreatMinePopups.push({ id: ++popupIdCounter, x: retreatPos.x, z: retreatPos.z, value: mineDamage, type: 'damage', timestamp: Date.now() });
    finalRetreatedUnit.stats = { ...finalRetreatedUnit.stats, hp: Math.max(0, finalRetreatedUnit.stats.hp - mineDamage) };
    if (finalRetreatedUnit.stats.hp <= 0) {
      finalRetreatedUnit.isAlive = false;
      if (retreatMineCell) retreatMineCell.unit = null;
      finalRetreatedUnit.canMove = false;
      finalRetreatedUnit.canAttack = false;
    }
    // Clear minefield
    retreatMineCell.hasMinefield = false;
    retreatMineCell.minefieldOwner = undefined;
  }

  const combatLogEntry: CombatLogEntry = {
    turn: state.turn,
    attacker: `${UNIT_CONFIGS[unit.type].name}(${unit.faction === 'red' ? '红方' : '蓝方'})`,
    defender: '撤退',
    damage: hpLoss,
    defenderRemainingHp: finalRetreatedUnit.stats.hp,
    attackerFaction: unit.faction,
    eventType: 'retreat',
    action: 'retreat',
    unitName: UNIT_CONFIGS[unit.type].name,
    // v26.0: Click-to-focus support
    attackerPosition: { x: retreatPos.x, z: retreatPos.z },
    attackerUnitId: unit.id,
  };

  // Damage popup for HP loss
  const retreatPopups: DamagePopup[] = [{
    id: ++popupIdCounter,
    x: retreatPos.x,
    z: retreatPos.z,
    value: -hpLoss,
    type: 'damage',
    timestamp: Date.now(),
  }];

  // Track retreat in battle stats
  const faction = unit.faction;
  const newBattleStats: BattleStats = {
    red: { ...state.battleStats.red },
    blue: { ...state.battleStats.blue },
  };
  newBattleStats[faction].retreated += 1;
  // v33.0: Track retreat HP loss as damageReceived for accurate stats
  newBattleStats[faction].damageReceived += hpLoss;

  return {
    ...state,
    units: newUnits,
    map: newMap,
    selectedUnit: null,
    movablePositions: [],
    attackablePositions: [],
    movePath: [],
    phase: 'selectUnit',
    previousState: null,
    combatLog: (() => {
      const combined = [combatLogEntry, ...state.combatLog];
      return combined.length > 200 ? combined.slice(-200) : combined;
    })(),
    battleStats: newBattleStats,
    damagePopups: [...(state.damagePopups || []), ...retreatPopups, ...retreatMinePopups],
  };
}

/** 结束回合 */
export function endTurn(state: GameState): GameState {
  // v84.0: No longer need to reset _attackerTerrainAtkBonus (now passed as parameter)
  const nextFaction: Faction = state.currentFaction === 'red' ? 'blue' : 'red';
  const nextTurn = nextFaction === 'red' ? state.turn + 1 : state.turn;
  // v56.0: Record timestamp at turn start for per-turn healing calculation
  const turnStartTimestamp = Date.now();
  // v67.0: Reset kill counts for the faction whose turn is starting
  const resetKillCounts = nextFaction === 'red'
    ? { red: 0, blue: 0 }  // New round — reset both
    : { ...state.turnKillCounts, blue: 0 };  // Blue's turn — reset blue only
  
  // Compute turn summary for the ending faction
  const factionLogs = state.combatLog.filter(log => log.turn === state.turn && log.attackerFaction === state.currentFaction);
  const enemyAttackLogs = state.combatLog.filter(log => log.turn === state.turn && log.attackerFaction !== state.currentFaction && log.eventType !== 'counter');
  const totalDamageDealt = factionLogs.filter(l => l.eventType !== 'counter').reduce((sum, log) => sum + log.damage, 0);
  const totalDamageReceived = enemyAttackLogs.reduce((sum, log) => sum + log.damage, 0);
  const unitsDestroyed = factionLogs.filter(log => log.eventType === 'destroy').length;
  const unitsLost = enemyAttackLogs.filter(log => log.eventType === 'destroy').length;
  
  // v56.0: Compute healing from damagePopups with type 'heal' for THIS TURN ONLY.
  // Previously used all-time popups, inflating the number in late-game turn summaries.
  const totalHealing = (state.damagePopups || []).filter(p =>
    p.type === 'heal' && p.timestamp > (state.lastTurnTimestamp || 0)
  ).reduce((sum, p) => sum + p.value, 0);
  
  // Compute abilities used from combat log
  const abilitiesUsed: string[] = [];
  const seenAbilities = new Set<string>();
  for (const log of factionLogs) {
    if (log.action === 'hero_ability' && log.unitName && !seenAbilities.has(log.unitName)) {
      seenAbilities.add(log.unitName);
      abilitiesUsed.push(log.unitName);
    }
  }
  
  // Build timeline events from combat log for this turn
  const allTurnLogs = state.combatLog.filter(log => log.turn === state.turn);
  const events: TurnEvent[] = [];
  for (const log of allTurnLogs.reverse()) {
    if (log.action === 'retreat') {
      events.push({ type: 'retreat', description: `${log.attacker} 撤退`, unitName: log.attacker });
    } else if (log.action === 'hero_ability') {
      events.push({ type: 'ability', description: `${log.attacker} 使用 ${log.unitName || '技能'}`, unitName: log.attacker, value: log.damage });
    } else if (log.eventType === 'destroy' && log.attackerFaction === state.currentFaction) {
      events.push({ type: 'destroy', description: `${log.attacker} 击毁 ${log.defender}`, unitName: log.attacker, targetName: log.defender, value: log.damage, unitType: log.attackerFaction });
    } else if (log.eventType === 'destroy' && log.attackerFaction !== state.currentFaction) {
      events.push({ type: 'destroy', description: `${log.defender} 被击毁`, targetName: log.defender, value: log.damage, targetFaction: state.currentFaction });
    } else if (log.eventType === 'counter') {
      events.push({ type: 'counter', description: `${log.attacker} 反击 ${log.defender}`, unitName: log.attacker, targetName: log.defender, value: log.counterDamage ?? log.damage });
    } else if (log.eventType === 'attack' && log.attackerFaction === state.currentFaction && log.damage > 0) {
      events.push({ type: 'attack', description: `${log.attacker} 攻击 ${log.defender}`, unitName: log.attacker, targetName: log.defender, value: log.damage });
    }
  }
  
  // Weather system: change weather every N turns
  let newWeather = state.currentWeather;
  let newWeatherTurns = state.weatherTurnsRemaining - 1;
  let weatherChanged = false;
  // v89.0: Track next weather for forecast display
  let computedNextWeather = state.nextWeather ?? state.currentWeather;
  if (newWeatherTurns <= 0) {
    // Random weather change (weighted toward clear)
    const weatherTypes: WeatherType[] = ['clear', 'clear', 'rain', 'fog', 'snow', 'sandstorm'];
    const newWeatherType = weatherTypes[Math.floor(Math.random() * weatherTypes.length)];
    newWeather = newWeatherType;
    newWeatherTurns = WEATHER_CHANGE_TURNS;
    weatherChanged = newWeather !== state.currentWeather;
    // v89.0: Pre-determine the NEXT weather after this one
    computedNextWeather = weatherTypes[Math.floor(Math.random() * weatherTypes.length)];
  }
  
  // v34.0: Deep-copy units including abilities to avoid mutating input state's cooldowns
  // v84.0: Use _deepCopyUnit to also deep-copy abilities.effect
  const newUnits = state.units.map(u => ({
    ..._deepCopyUnit(u),
    canMove: u.isAlive,
    canAttack: u.isAlive,
    attackedThisTurn: false,
  }));
  
  // === Morale recovery: ending faction's units recover MORALE_RECOVERY_PER_TURN morale (capped at 100) ===
  // v64.0: Only apply to the faction that just ended their turn (not both factions)
  // v37.0: Generate morale recovery popups so players can see morale changes
  const moralePopups: DamagePopup[] = [];
  for (const unit of newUnits) {
    if (unit.isAlive && unit.faction === state.currentFaction && unit.stats.morale !== undefined && unit.stats.morale !== null) {
      const oldMorale = unit.stats.morale;
      unit.stats = { ...unit.stats, morale: Math.min(100, (unit.stats.morale ?? 100) + MORALE_RECOVERY_PER_TURN) };
      const recovered = (unit.stats.morale ?? 100) - oldMorale;
      if (recovered > 0) {
        moralePopups.push({ id: ++popupIdCounter, x: unit.position.x, z: unit.position.z, value: recovered, type: 'morale', timestamp: Date.now() });
      }
    }
    // === Hero ability cooldown reduction ===
    // v47.0: Only decrement cooldowns for the current faction's units.
    // Previously ALL units (both factions) were decremented, meaning hero cooldowns
    // were halved (decremented twice per round).
    if (unit.isAlive && unit.faction === state.currentFaction) {
      // v68.0: Decrement temp buffs OUTSIDE abilities.length guard
      // Previously gated behind abilities.length > 0, making buffs permanent on non-hero units
      if (unit.tempDefenseBuffTurns && unit.tempDefenseBuffTurns > 0) {
        unit.tempDefenseBuffTurns--;
        if (unit.tempDefenseBuffTurns <= 0) {
          unit.tempDefenseBuff = undefined;
          unit.tempDefenseBuffTurns = undefined;
        }
      }
      if (unit.tempDamageBuffTurns && unit.tempDamageBuffTurns > 0) {
        unit.tempDamageBuffTurns--;
        if (unit.tempDamageBuffTurns <= 0) {
          unit.tempDamageBuff = undefined;
          unit.tempDamageBuffTurns = undefined;
        }
      }
      if (unit.abilities.length > 0) {
        for (const ability of unit.abilities) {
          if (ability.currentCooldown > 0) {
            ability.currentCooldown--;
          }
        }
      }
    }
  }
  
  // 更新地图中的单位引用
  const newMap = { ...state.map, cells: state.map.cells.map(row => row.map(cell => ({ ...cell }))) };
  for (const unit of newUnits) {
    if (unit.isAlive) {
      const cell = getCell(newMap, unit.position);
      if (cell) cell.unit = unit;
    }
  }
  
  // Show turn summary only when it's the player's turn (after AI finishes)
  const showSummary = nextFaction === 'red' && state.turn > 1;
  
  // 检查游戏是否结束
  const nextRedAlive = newUnits.filter(u => u.faction === 'red' && u.isAlive).length;
  const nextBlueAlive = newUnits.filter(u => u.faction === 'blue' && u.isAlive).length;
  let winner: Faction | null = state.winner;
  let phase: GamePhase = nextFaction === 'blue' ? 'aiTurn' : 'selectUnit';
  let victoryReason: string | null = null;
  
  // 胜利条件 1: 歼灭敌方所有单位
  if (nextRedAlive === 0) { winner = 'blue'; phase = 'gameOver'; victoryReason = '歼灭胜利'; }
  else if (nextBlueAlive === 0) { winner = 'red'; phase = 'gameOver'; victoryReason = '歼灭胜利'; }
  
  // 胜利条件 2: 占领据点胜利检查已移至 processCaptureProgress 之后 (line ~2064)
  // v58.0: Previously ran BEFORE capture processing, causing premature victory on stale data.
  
  // Process fortification decay for the next faction
  let decayedMap = newMap;
  for (let z = 0; z < newMap.height; z++) {
    for (let x = 0; x < newMap.width; x++) {
      const cell = decayedMap.cells[z]?.[x];
      if (cell && cell.fortified) {
        // v37.0→v79.0: Support extended fortification duration from hero fortify_master_passive
        // v79.0: Fixed — always use build turn from fortifiedByTurn, duration from fortifyDuration field
        const fortStart = cell.fortifiedByTurn ?? 0;
        const fortDuration = cell.fortifyDuration ?? FORTIFY_DURATION;
        if (cell.fortifiedByTurn !== undefined && nextTurn - fortStart >= fortDuration) {
          if (decayedMap === newMap) {
            decayedMap = { ...newMap, cells: newMap.cells.map(row => row.map(c => ({ ...c }))) };
          }
          const decayCell = decayedMap.cells[z]?.[x];
          if (decayCell) {
            decayCell.fortified = false;
            decayCell.fortifiedByTurn = undefined;
            // v89.0: Clear fortifyDuration so rebuild by non-hero uses default
            decayCell.fortifyDuration = undefined;
          }
        }
      }
    }
  }

  // Snapshot capture point owners before processing capture progress
  const captureOwnersBefore = new Map(state.capturePoints.map(cp => [cp.id, cp.owner]));
  
  // Process capture point progress
  // v34.0: Capture should be from the perspective of the faction that JUST moved (state.currentFaction),
  // but we already set currentFaction = nextFaction above. Temporarily override for capture processing.
  let currentState: GameState = {
    ...state,
    map: decayedMap,
    units: newUnits,
    currentFaction: nextFaction,
    turn: nextTurn,
    phase,
    selectedUnit: null,
    movablePositions: [],
    attackablePositions: [],
    movePath: [],
    turnSummaries: state.turnSummaries,
    lastTurnSummary: state.lastTurnSummary,
    previousState: null,
    winner,
    victoryReason: victoryReason ?? null,
    currentWeather: newWeather,
    weatherTurnsRemaining: newWeatherTurns,
    // v89.0: Store next weather forecast
    nextWeather: computedNextWeather,
    lastTurnTimestamp: turnStartTimestamp,
    // v67.0: Reset kill counts for new turn/faction
    turnKillCounts: resetKillCounts,
  };

  // Add weather change combat log entry
  if (weatherChanged) {
    const oldConfig = WEATHER_CONFIGS[state.currentWeather];
    const newConfig = WEATHER_CONFIGS[newWeather];
    const weatherLogEntry: CombatLogEntry = {
      turn: state.turn,
      attacker: '天气变化',
      defender: `${oldConfig.icon} ${oldConfig.name} → ${newConfig.icon} ${newConfig.name}`,
      damage: 0,
      defenderRemainingHp: 0,
      attackerFaction: state.currentFaction,
      eventType: 'attack',
      action: undefined,
    };
    const weatherCombined = [weatherLogEntry, ...currentState.combatLog];
    currentState = { ...currentState, combatLog: weatherCombined.length > 200 ? weatherCombined.slice(-200) : weatherCombined };
  }

  // v34.0: Temporarily set currentFaction to the ending faction for capture processing
  currentState = processCaptureProgress({ ...currentState, currentFaction: state.currentFaction });
  
  // Compute capture changes after processing
  let capturesGained = 0;
  let capturesLost = 0;
  for (const cp of currentState.capturePoints) {
    const prevOwner = captureOwnersBefore.get(cp.id);
    if (prevOwner !== cp.owner) {
      if (cp.owner === state.currentFaction) capturesGained++;
      else if (prevOwner === state.currentFaction) capturesLost++;
    }
  }
  // Add capture events to timeline
  for (const cp of currentState.capturePoints) {
    const prevOwner = captureOwnersBefore.get(cp.id);
    if (prevOwner !== cp.owner && cp.owner === state.currentFaction) {
      events.unshift({ type: 'capture', description: `占领了 ${cp.name}`, unitName: cp.name });
    }
  }
  // Add heal events to timeline if any healing occurred
  if (totalHealing > 0) {
    // v63.0: Filter heal popups by turn timestamp (same as totalHealing calculation)
    const healCount = (state.damagePopups || []).filter(p =>
      p.type === 'heal' && p.timestamp > (state.lastTurnTimestamp || 0)
    ).length;
    events.unshift({ type: 'heal', description: `补给治疗 +${totalHealing} (${healCount}单位)`, value: totalHealing });
  }
  
  // Build the enhanced turn summary with all data
  const turnSummary: TurnSummary = {
    turn: state.turn,
    faction: state.currentFaction,
    unitsDestroyed,
    totalDamageDealt,
    totalDamageReceived,
    unitsMoved: state.units.filter(u => u.faction === state.currentFaction && u.isAlive && !u.canMove).length,
    unitsLost,
    totalHealing,
    abilitiesUsed,
    capturesGained,
    capturesLost,
    events,
  };
  
  // Now add the turnSummary to the state
  currentState = {
    ...currentState,
    turnSummaries: (() => {
      const combined = [...currentState.turnSummaries, turnSummary];
      return combined.length > 50 ? combined.slice(-50) : combined;
    })(),
    lastTurnSummary: showSummary ? turnSummary : currentState.lastTurnSummary,
  };

  // Process stealth decay for the next faction
  currentState = processStealthDecay(currentState);

  // v87.0: Refresh map cell unit references after stealth decay (newUnits != old refs)
  currentState = {
    ...currentState,
    map: {
      ...currentState.map,
      cells: currentState.map.cells.map(row =>
        row.map(cell => {
          if (!cell.unit) return cell;
          const fresh = currentState.units.find(u => u.id === cell.unit!.id);
          return fresh ? { ...cell, unit: fresh } : cell;
        })
      ),
    },
  };
  
  // === Reinforcement system: grant new reserves every REINFORCEMENT_INTERVAL turns ===
  if (nextTurn > 1 && nextTurn % REINFORCEMENT_INTERVAL === 0 && !currentState.winner) {
    const faction = state.currentFaction; // the faction that just ended their turn
    const pool = REINFORCEMENT_POOL;
    const randomType = pool[Math.floor(Math.random() * pool.length)];
    const newReinforcement: ReinforcementUnit = { type: randomType, deployTurn: nextTurn };
    const updatedReinforcements = {
      ...currentState.reinforcements,
      [faction]: [...currentState.reinforcements[faction], newReinforcement],
    };
    const updatedBudget = {
      ...currentState.reinforcementBudget,
      [faction]: currentState.reinforcementBudget[faction] + 1,
    };
    currentState = { ...currentState, reinforcements: updatedReinforcements, reinforcementBudget: updatedBudget };
    
    // Add combat log for reinforcement arrival
    const unitName = UNIT_CONFIGS[randomType]?.name ?? randomType;
    const reinforcementLog: CombatLogEntry = {
      turn: nextTurn,
      attacker: `🆕 增援`,
      defender: `${unitName}(${faction === 'red' ? '红方' : '蓝方'})`,
      damage: 0,
      defenderRemainingHp: 0,
      attackerFaction: faction,
      eventType: 'attack',
      action: 'reinforcement',
      unitName: `${unitName} 已加入${faction === 'red' ? '红方' : '蓝方'}增援部队`,
    };
    currentState = {
      ...currentState,
      combatLog: [reinforcementLog, ...currentState.combatLog].slice(0, 200),
    };
  }
  
  // Re-check victory points condition AFTER capture progress has been processed
  if (!currentState.winner && nextTurn >= 5 && currentState.capturePoints.length >= 3) {
    const redCPs = currentState.capturePoints.filter(cp => cp.owner === 'red').length;
    const blueCPs = currentState.capturePoints.filter(cp => cp.owner === 'blue').length;
    if (redCPs - blueCPs >= 3) {
      currentState = { ...currentState, winner: 'red', phase: 'gameOver', victoryReason: `据点胜利 (${redCPs} vs ${blueCPs})` };
    } else if (blueCPs - redCPs >= 3) {
      currentState = { ...currentState, winner: 'blue', phase: 'gameOver', victoryReason: `据点胜利 (${blueCPs} vs ${redCPs})` };
    }
  }
  
  // v25.0: AI Dynamic Difficulty Adjustment (every 3 turns)
  if (!currentState.winner && currentState.aiDynamicDifficulty.enabled && nextTurn % 3 === 0) {
    const dd = currentState.aiDynamicDifficulty;
    const redStats = currentState.battleStats.red;
    const blueStats = currentState.battleStats.blue;
    
    const killRatio = blueStats.kills > 0 ? redStats.kills / blueStats.kills : (redStats.kills > 0 ? 3 : 0);
    const dmgEff = blueStats.damageDealt > 0 ? redStats.damageDealt / blueStats.damageDealt : (redStats.damageDealt > 0 ? 3 : 0);
    
    let newDifficulty = dd.currentDifficulty;
    if ((killRatio > 2.0 || dmgEff > 2.0) && dd.currentDifficulty !== 'hard') {
      newDifficulty = dd.currentDifficulty === 'easy' ? 'normal' : 'hard';
    } else if ((killRatio < 0.4 || dmgEff < 0.4) && dd.currentDifficulty !== 'easy') {
      newDifficulty = dd.currentDifficulty === 'hard' ? 'normal' : 'easy';
    }
    
    if (newDifficulty !== dd.currentDifficulty) {
      currentState = {
        ...currentState,
        aiDifficulty: newDifficulty,
        aiDynamicDifficulty: {
          ...dd,
          currentDifficulty: newDifficulty,
          metrics: {
            ...dd.metrics,
            lastAdjustTurn: nextTurn,
            adjustmentCount: dd.metrics.adjustmentCount + 1,
          },
        },
      };
    }
    
    // Always update metrics
    currentState = {
      ...currentState,
      aiDynamicDifficulty: {
        ...currentState.aiDynamicDifficulty,
        metrics: {
          ...currentState.aiDynamicDifficulty.metrics,
          playerKillRatio: killRatio,
          playerDamageEfficiency: dmgEff,
          turnsElapsed: nextTurn,
        },
      },
    };
  }
  
  // v37.0: Include morale recovery popups in endTurn return
  currentState = {
    ...currentState,
    damagePopups: [...(currentState.damagePopups || []), ...moralePopups],
  };

  // v55.0: Process supply healing at the START of the next faction's turn.
  // Previously, supply healing was done in the store layer — red was healed TWICE per round
  // (once in onEndTurn before ending, once in runAITurn after AI finished), while blue was
  // healed ZERO times. Moving it here ensures each faction gets exactly ONE heal per round
  // at the beginning of their turn.
  if (!currentState.winner) {
    const { state: supplyState, healPopups: supplyHealPopups } = processSupplyHealing({
      ...currentState,
      currentFaction: nextFaction,
    });
    if (supplyHealPopups.length > 0) {
      currentState = {
        ...supplyState,
        damagePopups: [...(supplyState.damagePopups || []), ...supplyHealPopups],
      };
    } else {
      // Still need the updated units from processSupplyHealing even if no popups
      currentState = supplyState;
    }
  }

  return currentState;
}

/** 获取增援信息 */
export function getReinforcementInfo(state: GameState, faction: Faction): ReinforcementInfo {
  const reinforcements = state.reinforcements[faction] || [];
  const budget = state.reinforcementBudget[faction] || 0;
  const nextTurn = (() => {
    // Calculate when the next reinforcement will arrive
    const currentTurn = state.turn;
    const remainder = currentTurn % REINFORCEMENT_INTERVAL;
    return remainder === 0 ? currentTurn + REINFORCEMENT_INTERVAL : currentTurn + (REINFORCEMENT_INTERVAL - remainder);
  })();
  return { reinforcements, budget, nextReinforcementTurn: nextTurn };
}

/** 部署增援单位 */
export function deployReinforcement(state: GameState, unitType: UnitType, faction: Faction, position: Position): GameState {
  // v60.0: Check reinforcement budget before deploying
  if (state.reinforcementBudget[faction] <= 0) return state;

  const reinforcements = state.reinforcements[faction];
  if (!reinforcements || reinforcements.length === 0) return state;
  
  // Find the reinforcement of the matching type
  const idx = reinforcements.findIndex(r => r.type === unitType);
  if (idx === -1) return state;
  
  // Validate position: must be in deployment zone (back lines) or adjacent to friendly unit
  // v55.0: Use proportional ranges based on MAP_WIDTH instead of hardcoded 0-3/12-15
  const redMaxX = Math.floor(MAP_WIDTH * 0.25);
  const blueMinX = Math.floor(MAP_WIDTH * 0.75);
  const deployZone = faction === 'red'
    ? position.x >= 0 && position.x <= redMaxX
    : position.x >= blueMinX && position.x <= MAP_WIDTH - 1;
  
  const nearFriendly = state.units.some(u =>
    u.faction === faction && u.isAlive &&
    Math.abs(u.position.x - position.x) + Math.abs(u.position.z - position.z) <= 2
  );
  
  if (!deployZone && !nearFriendly) return state;
  
  // Validate cell is empty and passable
  const cell = getCell(state.map, position);
  if (!cell || !TERRAIN_CONFIGS[cell.terrain].stats.isPassable) return state;
  // v68.0 fix: Block ALL occupied cells — prevents placing unit on top of undetected stealthed enemy
  // (previously allowed deployment on undetected stealth, corrupting map/unit consistency)
  if (cell.unit) return state;
  
  // Vehicle passability check
  const isVehicle = UNIT_CONFIGS[unitType]?.isVehicle ?? false;
  const isHelicopter = unitType === 'helicopter';
  if (!isHelicopter) {
    if (isVehicle && !TERRAIN_CONFIGS[cell.terrain].stats.isPassableByVehicle) return state;
  } else if (cell.terrain === 'water') {
    return state;
  }
  
  // Create the unit
  const unit = createUnit(unitType, faction, position);
  
  // Remove from reinforcements and decrement budget
  const newReinforcements = [...reinforcements];
  newReinforcements.splice(idx, 1);
  
  const newMap = { ...state.map, cells: state.map.cells.map(row => row.map(c => ({ ...c }))) };
  const targetCell = newMap.cells[position.z]?.[position.x];
  if (targetCell) targetCell.unit = unit;
  
  const logEntry: CombatLogEntry = {
    turn: state.turn,
    attacker: `🆕 ${faction === 'red' ? '红方' : '蓝方'}`,
    defender: `${unit.name} 部署`,
    damage: 0,
    defenderRemainingHp: 0,
    attackerFaction: faction,
    eventType: 'attack',
    action: 'reinforcement',
    unitName: `${unit.name} 已部署到 (${position.x}, ${position.z})`,
  };
  
  return {
    ...state,
    map: newMap,
    units: [...state.units, unit],
    reinforcements: { ...state.reinforcements, [faction]: newReinforcements },
    reinforcementBudget: { ...state.reinforcementBudget, [faction]: Math.max(0, state.reinforcementBudget[faction] - 1) },
    combatLog: [logEntry, ...state.combatLog].slice(0, 200),
  };
}

/** 取消选择 */
export function deselectUnit(state: GameState): GameState {
  return {
    ...state,
    selectedUnit: null,
    movablePositions: [],
    attackablePositions: [],
    movePath: [],
    phase: 'selectUnit',
  };
}

/** 选择单位 */
export function selectUnit(state: GameState, unit: Unit): GameState {
  const movable = getMovablePositions(state, unit);
  const attackable = getAttackablePositions(state, unit);

  let phase: GamePhase = 'selectUnit';
  if (unit.canMove && movable.length > 0) {
    phase = 'moveUnit';
  } else if (unit.canAttack && attackable.length > 0) {
    phase = 'attackUnit';
  }

  return {
    ...state,
    selectedUnit: { ...unit },
    movablePositions: movable,
    attackablePositions: attackable,
    phase,
  };
}

/** 找到从当前位置攻击目标的最佳移动位置 */
export function findBestAttackPosition(state: GameState, unit: Unit, targetPos: Position): Position | null {
  const movable = getMovablePositions(state, unit);
  // v41.0: Apply hero attackRangeBonus passive (matching getAttackablePositions)
  let effectiveAttackRange = unit.stats.attackRange;
  if (unit.isHero && unit.abilities.length > 0) {
    const rangeBonus = unit.abilities.find(a => a.type === 'passive' && (a.effect as any).attackRangeBonus);
    if (rangeBonus && (rangeBonus.effect as any).attackRangeBonus) effectiveAttackRange += (rangeBonus.effect as any).attackRangeBonus;
  }

  // 筛选从该位置可以攻击到目标的所有可移动位置
  const attackableMoves = movable.filter(p => {
    const dist = Math.abs(p.x - targetPos.x) + Math.abs(p.z - targetPos.z);
    return dist >= 1 && dist <= effectiveAttackRange;
  });

  // 也检查当前位置是否已在攻击范围内
  const currentDist = Math.abs(unit.position.x - targetPos.x) + Math.abs(unit.position.z - targetPos.z);
  if (currentDist >= 1 && currentDist <= effectiveAttackRange) {
    // 当前位置已可攻击，不需要移动
    return unit.position;
  }

  if (attackableMoves.length === 0) return null;

  // 评分：优先高防御地形 + 靠近目标
  let bestPos = attackableMoves[0];
  let bestScore = -Infinity;

  for (const pos of attackableMoves) {
    let score = 0;
    const cell = getCell(state.map, pos);
    if (!cell) continue;
    const terrainConfig = TERRAIN_CONFIGS[cell.terrain];
    score += terrainConfig.stats.defenseBonus * 2; // 优先高防御地形
    const dist = Math.abs(pos.x - targetPos.x) + Math.abs(pos.z - targetPos.z);
    score -= dist; // 优先靠近目标（距离越小分数越高）
    if (score > bestScore) {
      bestScore = score;
      bestPos = pos;
    }
  }

  return bestPos;
}

/** 计算单位从起点到终点的BFS移动路径（仅4方向，用于动画） */
export function findMovementPath(
  state: GameState,
  unit: Unit,
  targetPos: Position
): Position[] {
  const startPos = unit.position;
  if (startPos.x === targetPos.x && startPos.z === targetPos.z) return [startPos];

  const isVehicle = UNIT_CONFIGS[unit.type].isVehicle;
  const isHelicopter = unit.type === 'helicopter';
  const movable = getMovablePositions(state, unit);
  const movableSet = new Set(movable.map(p => `${p.x},${p.z}`));
  movableSet.add(`${startPos.x},${startPos.z}`);

  if (!movableSet.has(`${targetPos.x},${targetPos.z}`)) return [startPos];

  // BFS从起点到终点
  const visited = new Map<string, string>(); // key -> parent key
  const queue: Position[] = [startPos];
  visited.set(`${startPos.x},${startPos.z}`, '');

  const dirs = [{ x: 0, z: 1 }, { x: 0, z: -1 }, { x: 1, z: 0 }, { x: -1, z: 0 }];

  // v65.0: Use index-based dequeue instead of queue.shift() O(n)
  let qi = 0;
  while (qi < queue.length) {
    const current = queue[qi++]!;
    const currentKey = `${current.x},${current.z}`;

    if (current.x === targetPos.x && current.z === targetPos.z) {
      // 重建路径
      const path: Position[] = [];
      let key: string = currentKey;
      while (key) {
        const [x, z] = key.split(',').map(Number);
        path.unshift({ x, z });
        key = visited.get(key) || '';
      }
      return path;
    }

    for (const dir of dirs) {
      const nx = current.x + dir.x;
      const nz = current.z + dir.z;
      const nKey = `${nx},${nz}`;

      if (visited.has(nKey)) continue;
      if (!movableSet.has(nKey)) continue;

      // 检查通行性
      const cell = state.map.cells[nz]?.[nx];
      if (!cell) continue;
      const terrain = TERRAIN_CONFIGS[cell.terrain];
      if (!terrain) continue;

      // Helicopters ignore terrain passability (except water)
      if (!isHelicopter) {
        if (!terrain.stats.isPassable) continue;
        if (isVehicle && !terrain.stats.isPassableByVehicle) continue;
      } else {
        if (cell.terrain === 'water') continue;
      }

      // 不能穿过敌方单位 (v59.0: undetected stealthed enemies don't block path)
      if (cell.unit && cell.unit.id !== unit.id && cell.unit.isAlive && cell.unit.faction !== unit.faction) {
        if (!cell.unit.isStealthed || isUnitDetected(state, cell.unit, unit.faction)) continue;
      }

      visited.set(nKey, currentKey);
      queue.push({ x: nx, z: nz });
    }
  }

  return [startPos]; // 找不到路径时只返回起点
}

// ===== Tactical Deployment Phase =====

/** Initialize game state in deployment phase with no units deployed */
export function initDeploymentState(difficulty: AIDifficulty = 'normal', mapType: MapType = 'random'): GameState {
  // v84.0: No longer reset unitIdCounter (using UUIDs). Reset other counters for new game.
  popupIdCounter = 0;
  notificationIdCounter = 0;
  const map = generateMap(mapType);

  // Generate capture points
  const capturePoints = generateCapturePoints(map);

  // Update map cells with capture point references
  const newMap = { ...map, cells: map.cells.map(row => row.map(cell => ({ ...cell }))) };
  for (const cp of capturePoints) {
    const cell = newMap.cells[cp.position.z]?.[cp.position.x];
    if (cell) cell.capturePointId = cp.id;
  }

  const deployment: TacticalDeploymentInfo = {
    redBudget: TACTICAL_DEPLOYMENT_BUDGET,
    blueBudget: TACTICAL_DEPLOYMENT_BUDGET,
    redBudgetUsed: 0,
    blueBudgetUsed: 0,
    unitCosts: { ...TACTICAL_UNIT_COSTS },
  };

  return {
    map: newMap,
    units: [],
    currentFaction: 'red',
    phase: 'deployment',
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
    deployment,
    capturePoints,
    battleStats: { ...DEFAULT_BATTLE_STATS },
    currentWeather: 'clear' as WeatherType,
    weatherTurnsRemaining: WEATHER_CHANGE_TURNS,
    // v89.0: Initial next weather forecast for tactical mode
    nextWeather: (() => {
      const wt: WeatherType[] = ['clear', 'clear', 'rain', 'fog', 'snow', 'sandstorm'];
      return wt[Math.floor(Math.random() * wt.length)];
    })(),
    reinforcements: { red: [], blue: [] },
    reinforcementBudget: { red: 0, blue: 0 },
    // v25.0: AI dynamic difficulty
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
    gameStartTime: Date.now(), // v41.0: added missing field
    // v67.0: Kill tracking per turn for streak notifications
    turnKillCounts: { red: 0, blue: 0 },
    // Recon/intelligence system
    revealedCells: new Set<string>(),
    revealedUnits: [],
    intelReports: [],
  };
}

/** Grant XP to a unit and check for level ups. Returns updated state. */
export function grantXP(
  state: GameState,
  unit: Unit,
  amount: number,
  _source: 'damage' | 'kill' | 'capture'
): GameState {
  if (unit.level >= MAX_LEVEL) return state;
  
  const newUnits = state.units.map(u => _deepCopyUnit(u));
  const target = newUnits.find(u => u.id === unit.id);
  if (!target) return state;
  
  target.xp += amount;
  
  const notifications: LevelUpNotification[] = [];
  
  // Check level ups (can level up multiple times)
  while (target.level < MAX_LEVEL && target.xp >= target.xpToNextLevel) {
    const oldLevel = target.level;
    target.level++;
    
    // Apply stat bonuses
    const bonus = LEVEL_UP_BONUSES[target.type];
    if (bonus) {
      target.stats.attack += bonus.attack;
      target.stats.defense += bonus.defense;
      target.stats.armor += bonus.armor;
      target.stats.armorPenetration += bonus.armorPenetration;
      target.stats.maxHp += bonus.maxHp;
      target.stats.hp = Math.min(target.stats.hp + bonus.maxHp, target.stats.maxHp);
      target.stats.vision += bonus.vision;
      target.stats.moveRange += bonus.moveRange;
      target.stats.attackRange += bonus.attackRange;
    }
    
    // Set next level threshold
    target.xpToNextLevel = LEVEL_XP_THRESHOLDS[target.level] ?? 999;
    
    notifications.push({
      id: ++notificationIdCounter,
      unitId: target.id,
      unitName: target.name,
      faction: target.faction,
      oldLevel,
      newLevel: target.level,
      bonus,
      timestamp: Date.now(),
    });
  }
  
  // v59.0: Only copy the row containing the target unit, not the entire map
  const targetRow = target.position.z;
  const targetCol = target.position.x;
  const newCells = state.map.cells.map((row, r) =>
    r === targetRow
      ? row.map((cell, c) =>
          c === targetCol
            ? { ...cell, unit: target }
            : cell
        )
      : row
  );
  const newMap = { ...state.map, cells: newCells };
  // cell.unit already set above via the targeted row/col copy
  
  // Create XP popup
  const xpPopup: DamagePopup = {
    id: ++popupIdCounter,
    x: target.position.x,
    z: target.position.z,
    value: amount,
    type: 'xp',
    timestamp: Date.now(),
  };
  
  // Create level-up popups
  const levelUpPopups: DamagePopup[] = notifications.map(n => ({
    id: ++popupIdCounter,
    x: target.position.x,
    z: target.position.z,
    value: n.newLevel,
    type: 'levelup' as const,
    timestamp: Date.now() + 500,
  }));
  
  return {
    ...state,
    map: newMap,
    units: newUnits,
    damagePopups: (() => {
      const combined = [...(state.damagePopups || []), xpPopup, ...levelUpPopups];
      return combined.length > 50 ? combined.slice(-50) : combined;
    })(),
    levelUpNotifications: (() => {
      const combined = [...(state.levelUpNotifications || []), ...notifications];
      return combined.length > 20 ? combined.slice(-20) : combined;
    })(),
  };
}

/** Check if a position is within the deployment zone for a faction.
 *  During deployment, units can be placed in:
 *  1. The default starting zone (x:0-3 for red, x:12-15 for blue)
 *  2. Within captureRadius of any capture point owned by their faction
 */
function isInDeploymentZone(pos: Position, faction: Faction, capturePoints: CapturePoint[]): boolean {
  // v60.0: Use proportional ranges matching deployReinforcement (MAP_WIDTH * 0.25/0.75)
  if (faction === 'red') {
    if (pos.x >= 0 && pos.x <= Math.floor(MAP_WIDTH * 0.25)) return true;
  } else {
    if (pos.x >= Math.floor(MAP_WIDTH * 0.75) && pos.x <= MAP_WIDTH - 1) return true;
  }

  // Check if within captureRadius of any owned capture point
  for (const cp of capturePoints) {
    if (cp.owner !== faction || !cp.isDeploymentZone) continue;
    const dist = Math.abs(pos.x - cp.position.x) + Math.abs(pos.z - cp.position.z);
    if (dist <= cp.captureRadius) return true;
  }

  return false;
}

/** Get the current deployment budget remaining for a faction */
export function getTacticalDeploymentBudget(state: GameState, faction: Faction): number {
  if (!state.deployment) return 0;
  const used = faction === 'red' ? state.deployment.redBudgetUsed : state.deployment.blueBudgetUsed;
  const total = faction === 'red' ? state.deployment.redBudget : state.deployment.blueBudget;
  return total - used;
}

/** Deploy a unit during the deployment phase */
export function deployUnit(
  state: GameState,
  unitType: UnitType,
  faction: Faction,
  position: Position,
): GameState {
  if (state.phase !== 'deployment') return state;
  if (!state.deployment) return state;

  const cost = TACTICAL_UNIT_COSTS[unitType];
  if (cost === undefined) return state;

  // Check budget
  const budgetRemaining = getTacticalDeploymentBudget(state, faction);
  if (cost > budgetRemaining) return state;

  // Check deployment zone (includes capture point zones)
  if (!isInDeploymentZone(position, faction, state.capturePoints)) return state;

  // Check position is valid
  if (position.x < 0 || position.x >= state.map.width || position.z < 0 || position.z >= state.map.height) return state;

  const cell = state.map.cells[position.z]?.[position.x];
  if (!cell) return state;

  // Check terrain is passable for this unit type
  const isVehicle = UNIT_CONFIGS[unitType]?.isVehicle ?? false;
  const isHelicopter = unitType === 'helicopter';

  if (!isHelicopter) {
    if (!TERRAIN_CONFIGS[cell.terrain].stats.isPassable) return state;
    if (isVehicle && !TERRAIN_CONFIGS[cell.terrain].stats.isPassableByVehicle) return state;
  } else {
    if (cell.terrain === 'water') return state;
  }

  // Check cell is not occupied
  if (cell.unit) return state;

  // Create and place the unit
  const unit = createUnit(unitType, faction, position);

  // Deep copy map
  const newMap = { ...state.map, cells: state.map.cells.map(row => row.map(c => ({ ...c }))) };
  const newCell = newMap.cells[position.z]?.[position.x];
  if (newCell) newCell.unit = unit;

  const newUnits = [...state.units, unit];

  // Update budget
  const newDeployment = { ...state.deployment };
  if (faction === 'red') {
    newDeployment.redBudgetUsed += cost;
  } else {
    newDeployment.blueBudgetUsed += cost;
  }

  return {
    ...state,
    map: newMap,
    units: newUnits,
    deployment: newDeployment,
  };
}

/** Remove a deployed unit during the deployment phase */
export function removeDeployedUnit(state: GameState, unitId: string): GameState {
  if (state.phase !== 'deployment') return state;
  if (!state.deployment) return state;

  const unit = state.units.find(u => u.id === unitId);
  if (!unit) return state;

  const cost = TACTICAL_UNIT_COSTS[unit.type];

  // Deep copy map
  const newMap = { ...state.map, cells: state.map.cells.map(row => row.map(c => ({ ...c }))) };

  // Remove unit from map
  const cell = newMap.cells[unit.position.z]?.[unit.position.x];
  if (cell && cell.unit?.id === unitId) {
    cell.unit = null;
  }

  const newUnits = state.units.filter(u => u.id !== unitId);

  // Refund budget
  const newDeployment = { ...state.deployment };
  if (cost !== undefined) {
    if (unit.faction === 'red') {
      newDeployment.redBudgetUsed = Math.max(0, newDeployment.redBudgetUsed - cost);
    } else {
      newDeployment.blueBudgetUsed = Math.max(0, newDeployment.blueBudgetUsed - cost);
    }
  }

  return {
    ...state,
    map: newMap,
    units: newUnits,
    deployment: newDeployment,
  };
}

/** Confirm tactical deployment and start the game.
 *  Auto-deploys blue units if needed. */
export function confirmTacticalDeployment(state: GameState): GameState {
  if (state.phase !== 'deployment') return state;

  let currentState = { ...state };

  // Ensure red has at least 1 unit
  const redUnits = currentState.units.filter(u => u.faction === 'red');
  if (redUnits.length === 0) {
    return state; // Can't start without any red units
  }

  // Auto-deploy blue units if none deployed
  const blueUnits = currentState.units.filter(u => u.faction === 'blue');
  if (blueUnits.length === 0) {
    currentState = autoDeployBlueTactical(currentState);
  }

  // Transition to game play
  const newUnits = currentState.units.map(u => ({
    ...u,
    canMove: true,
    canAttack: true,
    attackedThisTurn: false,
  }));

  // Update map references
  const newMap = { ...currentState.map, cells: currentState.map.cells.map(row => row.map(cell => ({ ...cell }))) };
  for (const unit of newUnits) {
    if (unit.isAlive) {
      const cell = newMap.cells[unit.position.z]?.[unit.position.x];
      if (cell) cell.unit = unit;
    }
  }

  return {
    ...currentState,
    map: newMap,
    units: newUnits,
    phase: 'selectUnit',
    selectedUnit: null,
    movablePositions: [],
    attackablePositions: [],
    movePath: [],
  };
}

/** Auto-deploy blue units for tactical mode */
function autoDeployBlueTactical(state: GameState): GameState {
  let currentState = { ...state };
  if (!currentState.deployment) return currentState;

  const blueBudget = currentState.deployment.blueBudget - currentState.deployment.blueBudgetUsed;

  // Template for blue deployment: a balanced force
  const deploymentTemplate: UnitType[] = ['tank', 'tank', 'ifv', 'ifv', 'ifv', 'artillery', 'artillery', 'scout', 'infantry', 'infantry', 'infantry', 'mlrs', 'engineer', 'helicopter'];

  let remainingBudget = blueBudget;
  let blueCount = 0;

  for (const unitType of deploymentTemplate) {
    const cost = TACTICAL_UNIT_COSTS[unitType];
    if (cost > remainingBudget) continue;

    // Find a passable, empty cell in blue deployment zone (x >= 75% of map width)
    let placed = false;
    // v90.0: Use proportional range instead of hardcoded 12-15 (breaks on non-20-width maps)
    const blueMinX = Math.floor(MAP_WIDTH * 0.75);
    for (let x = MAP_WIDTH - 1; x >= blueMinX && !placed; x--) {
      for (let z = 0; z < state.map.height && !placed; z++) {
        const cell = currentState.map.cells[z]?.[x];
        if (!cell) continue;

        const isVehicle = UNIT_CONFIGS[unitType]?.isVehicle ?? false;
        const isHelicopter = unitType === 'helicopter';

        let passable = false;
        if (isHelicopter) {
          passable = cell.terrain !== 'water' && !cell.unit;
        } else {
          passable = TERRAIN_CONFIGS[cell.terrain].stats.isPassable && !cell.unit;
          if (passable && isVehicle) {
            passable = TERRAIN_CONFIGS[cell.terrain].stats.isPassableByVehicle;
          }
        }

        if (passable) {
          const newState = deployUnit(currentState, unitType, 'blue', { x, z });
          if (newState !== currentState) {
            currentState = newState;
            remainingBudget -= cost;
            blueCount++;
            placed = true;
          }
        }
      }
    }
  }

  return currentState;
}

// ===== Capture Point & Stealth Mechanics =====

let capturePointIdCounter = 0;

/** Generate capture points based on map terrain */
export function generateCapturePoints(map: GameMap): CapturePoint[] {
  const capturePoints: CapturePoint[] = [];
  capturePointIdCounter = 0;

  const minDistance = 3; // minimum distance between capture points

  /** Helper: check if a position is too close to existing capture points */
  const isTooClose = (pos: Position): boolean => {
    return capturePoints.some(cp => 
      Math.abs(cp.position.x - pos.x) + Math.abs(cp.position.z - pos.z) < minDistance
    );
  };

  /** Helper: create a capture point */
  const createCP = (type: CapturePointType, pos: Position, owner: Faction | null, name: string, isDeploymentZone: boolean): CapturePoint => {
    const config = CAPTURE_POINT_CONFIGS[type];
    capturePointIdCounter++;
    return {
      id: `cp_${type}_${capturePointIdCounter}`,
      position: pos,
      name,
      type,
      owner,
      captureProgress: { red: 0, blue: 0 },
      captureThreshold: config.captureThreshold,
      captureRadius: config.captureRadius,
      providesVision: config.providesVision,
      isDeploymentZone,
    };
  };

  // 1. City cells become "stronghold" capture points
  for (let z = 0; z < map.height; z++) {
    for (let x = 0; x < map.width; x++) {
      const cell = map.cells[z]?.[x];
      if (!cell || cell.terrain !== 'city') continue;
      if (isTooClose({ x, z })) continue;
      
      // Determine initial owner based on position
      let owner: Faction | null = null;
      let name = '据点';
      let isDeploymentZone = false;
      
      if (x <= Math.floor(MAP_WIDTH * 0.25)) {
        owner = 'red';
        name = `红方要塞${capturePoints.filter(cp => cp.type === 'stronghold' && cp.owner === 'red').length + 1}`;
        isDeploymentZone = true;
      } else if (x >= Math.floor(MAP_WIDTH * 0.75)) {
        owner = 'blue';
        name = `蓝方要塞${capturePoints.filter(cp => cp.type === 'stronghold' && cp.owner === 'blue').length + 1}`;
        isDeploymentZone = true;
      } else {
        owner = null;
        name = `中立据点${capturePoints.filter(cp => cp.type === 'stronghold' && cp.owner === null).length + 1}`;
        isDeploymentZone = true;
      }
      
      capturePoints.push(createCP('stronghold', { x, z }, owner, name, isDeploymentZone));
    }
  }

  // 2. Bridge cells become "bridgehead" capture points
  for (let z = 0; z < map.height; z++) {
    for (let x = 0; x < map.width; x++) {
      const cell = map.cells[z]?.[x];
      if (!cell || cell.terrain !== 'bridge') continue;
      if (isTooClose({ x, z })) continue;
      
      const name = `桥头堡${capturePoints.filter(cp => cp.type === 'bridgehead').length + 1}`;
      capturePoints.push(createCP('bridgehead', { x, z }, null, name, true));
    }
  }

  // 3. Place 1-2 "supply_base" at strategic positions
  const supplyBasePositions: Position[] = [];
  // Look for road or plains cells near the center
  const midX = Math.floor(map.width / 2);
  const midZ = Math.floor(map.height / 2);
  
  // Try positions in the middle band
  const candidatePositions: Position[] = [];
  for (let z = Math.floor(map.height * 0.25); z < Math.floor(map.height * 0.75); z++) {
    for (let x = Math.floor(map.width * 0.3); x < Math.floor(map.width * 0.7); x++) {
      const cell = map.cells[z]?.[x];
      if (!cell) continue;
      if (cell.terrain === 'plains' || cell.terrain === 'road' || cell.terrain === 'desert') {
        if (!isTooClose({ x, z })) {
          candidatePositions.push({ x, z });
        }
      }
    }
  }

  // Sort candidates by distance from center to pick strategic ones
  candidatePositions.sort((a, b) => {
    const distA = Math.abs(a.x - midX) + Math.abs(a.z - midZ);
    const distB = Math.abs(b.x - midX) + Math.abs(b.z - midZ);
    return distA - distB;
  });

  // Place up to 2 supply bases
  const supplyCount = Math.min(2, candidatePositions.length);
  for (let i = 0; i < supplyCount; i++) {
    const idx = i * Math.max(1, Math.floor(candidatePositions.length / (supplyCount + 1)));
    const pos = candidatePositions[idx];
    if (pos && !isTooClose(pos)) {
      const name = `补给基地${supplyBasePositions.length + 1}`;
      capturePoints.push(createCP('supply_base', pos, null, name, true));
      supplyBasePositions.push(pos);
    }
  }

  // 4. Place 1 "comm_hub" at center-ish
  const commHubCandidates: Position[] = [];
  for (let z = Math.floor(map.height * 0.35); z < Math.floor(map.height * 0.65); z++) {
    for (let x = Math.floor(map.width * 0.35); x < Math.floor(map.width * 0.65); x++) {
      const cell = map.cells[z]?.[x];
      if (!cell) continue;
      if (cell.terrain !== 'water' && !isTooClose({ x, z })) {
        commHubCandidates.push({ x, z });
      }
    }
  }

  commHubCandidates.sort((a, b) => {
    const distA = Math.abs(a.x - midX) + Math.abs(a.z - midZ);
    const distB = Math.abs(b.x - midX) + Math.abs(b.z - midZ);
    return distA - distB;
  });

  if (commHubCandidates.length > 0) {
    const pos = commHubCandidates[0];
    capturePoints.push(createCP('comm_hub', pos, null, '通信枢纽', false));
  }

  // If we didn't generate any capture points, add at least one in the center
  if (capturePoints.length === 0) {
    const centerPos = { x: midX, z: midZ };
    const cell = map.cells[midZ]?.[midX];
    if (cell && cell.terrain !== 'water') {
      capturePoints.push(createCP('stronghold', centerPos, null, '中立据点', true));
    } else {
      // Find nearest passable cell to center
      for (let radius = 1; radius < 5; radius++) {
        let found = false;
        for (let dz = -radius; dz <= radius && !found; dz++) {
          for (let dx = -radius; dx <= radius && !found; dx++) {
            const nx = midX + dx;
            const nz = midZ + dz;
            const ncell = map.cells[nz]?.[nx];
            if (ncell && ncell.terrain !== 'water') {
              capturePoints.push(createCP('stronghold', { x: nx, z: nz }, null, '中立据点', true));
              found = true;
            }
          }
        }
        if (found) break;
      }
    }
  }

  return capturePoints;
}

/** Get vision provided by capture points owned by a faction */
export function capturePointVision(state: GameState, faction: Faction): Set<string> {
  const visibleCells = new Set<string>();
  
  for (const cp of state.capturePoints) {
    if (cp.owner !== faction) continue;
    
    const visionRadius = cp.providesVision;
    for (let dz = -visionRadius; dz <= visionRadius; dz++) {
      for (let dx = -visionRadius; dx <= visionRadius; dx++) {
        const dist = Math.abs(dx) + Math.abs(dz);
        if (dist <= visionRadius) {
          const nx = cp.position.x + dx;
          const nz = cp.position.z + dz;
          if (nx >= 0 && nx < state.map.width && nz >= 0 && nz < state.map.height) {
            visibleCells.add(`${nx},${nz}`);
          }
        }
      }
    }
  }
  
  return visibleCells;
}

/** Process capture point progress at the end of each turn */
export function processCaptureProgress(state: GameState): GameState {
  // v90.0: Deep-copy captureProgress to prevent shared-reference mutations across state snapshots.
  // Shallow spread ({ ...cp }) only copies top-level fields; the nested captureProgress object
  // was shared by reference with the input state, risking cross-state corruption.
  const newCapturePoints = state.capturePoints.map(cp => ({ ...cp, captureProgress: { ...cp.captureProgress } }));
  let changed = false;

  for (const cp of newCapturePoints) {
    // v84: Single-pass unit iteration (was 3 separate loops per capture point)
    let friendlyCount = 0;
    let enemyCount = 0;
    let friendlyProgress = 0;
    let enemyProgress = 0;
    // v89.0: terrainBonus removed — now computed per-unit from unit's own cell

    for (const unit of state.units) {
      if (!unit.isAlive) continue;
      const dist = Math.abs(unit.position.x - cp.position.x) + Math.abs(unit.position.z - cp.position.z);
      if (dist > cp.captureRadius) continue;

      const isFriendly = unit.faction === state.currentFaction;
      // v68.0: Undetected stealthed units shouldn't contribute to capture at all
      const isDetected = !unit.isStealthed || isUnitDetected(state, unit, state.currentFaction);
      if (!isDetected) continue;

      // Count for net-unit direction (any faction, detection-filtered)
      if (isFriendly) friendlyCount++;
      else enemyCount++;

      // v89.0: Stealth terrain bonus based on UNIT's position (not capture point's), only for stealthed
      const stealthMultiplier = unit.isStealthed ? 0.5 : 1.0;
      const unitCell = state.map.cells[unit.position.z]?.[unit.position.x];
      const unitTerrainBonus = unit.isStealthed && unitCell ? (STEALTH_TERRAIN_BONUS[unitCell.terrain] ?? 0) : 0;
      const contrib = Math.round((15 + unitTerrainBonus) * stealthMultiplier);
      if (isFriendly) friendlyProgress += contrib;
      else enemyProgress += contrib;
    }

    // Calculate progress change based on net presence
    const netUnits = friendlyCount - enemyCount;
    let progressChange = 0;

    if (netUnits > 0) {
      progressChange = friendlyProgress;
    } else if (netUnits < 0) {
      progressChange = -enemyProgress;
    } else {
      // No units nearby - progress decays
      if (cp.captureProgress.red > 0 || cp.captureProgress.blue > 0) {
        cp.captureProgress = {
          red: Math.max(0, cp.captureProgress.red - 10),
          blue: Math.max(0, cp.captureProgress.blue - 10),
        };
        changed = true;
      }
      continue;
    }

    // v60.0: Apply progress change — opponent gets NEGATED change (not Math.abs)
    // Old code used Math.abs which prevented opponent from GAINING progress
    if (state.currentFaction === 'red') {
      cp.captureProgress = {
        red: Math.max(0, Math.min(100, cp.captureProgress.red + progressChange)),
        blue: Math.max(0, Math.min(100, cp.captureProgress.blue - progressChange)),
      };
    } else {
      cp.captureProgress = {
        red: Math.max(0, Math.min(100, cp.captureProgress.red - progressChange)),
        blue: Math.max(0, Math.min(100, cp.captureProgress.blue + progressChange)),
      };
    }

    // Check for ownership change
    if (cp.captureProgress.red >= cp.captureThreshold && cp.owner !== 'red') {
      cp.owner = 'red';
      cp.captureProgress = { red: cp.captureThreshold, blue: 0 };
      changed = true;
    } else if (cp.captureProgress.blue >= cp.captureThreshold && cp.owner !== 'blue') {
      cp.owner = 'blue';
      cp.captureProgress = { red: 0, blue: cp.captureThreshold };
      changed = true;
    } else if (cp.captureProgress.red > 0 || cp.captureProgress.blue > 0) {
      changed = true;
    }
  }

  if (changed) {
    let xpState = { ...state, capturePoints: newCapturePoints };
    // Grant XP only for capture points that JUST changed ownership this turn
    for (let i = 0; i < newCapturePoints.length; i++) {
      const newCp = newCapturePoints[i];
      const oldCp = state.capturePoints[i];
      if (newCp.owner !== oldCp.owner && newCp.owner) {
        // Ownership changed - grant XP to nearby units of the new owner
        const faction = newCp.owner;
        for (const nearbyUnit of xpState.units.filter(u => u.faction === faction && u.isAlive)) {
          const dist = Math.abs(nearbyUnit.position.x - newCp.position.x) + Math.abs(nearbyUnit.position.z - newCp.position.z);
          if (dist <= newCp.captureRadius) {
            xpState = grantXP(xpState, nearbyUnit, XP_PER_CAPTURE, 'capture');
          }
        }
      }
    }
    return xpState;
  }
  return state;
}

/** Enter stealth mode with a unit */
export function enterStealth(state: GameState, unit: Unit): GameState {
  const config = UNIT_CONFIGS[unit.type];
  
  // Check preconditions
  if (!config.canStealth) return state;
  if (!unit.isAlive) return state;
  if (unit.isStealthed) return state;
  if (unit.stealthCooldown > 0) return state;
  // v38.0: ghost_vision_passive allows stealth even when canMove/canAttack are partially consumed
  const hasFreeStealthCheck = unit.isHero && unit.abilities.some(a => a.id === 'ghost_vision_passive');
  if (!hasFreeStealthCheck && (!unit.canMove || !unit.canAttack)) return state; // must use entire turn to stealth
  
  // Check terrain - must be on stealth-capable terrain
  const cell = getCell(state.map, unit.position);
  if (!cell) return state;
  // v38.0: shadow_stealth_passive allows stealth on ANY terrain
  const hasAnyTerrainStealth = unit.isHero && unit.abilities.some(a => a.id === 'shadow_stealth_passive');
  if (!hasAnyTerrainStealth) {
    const stealthTerrains = ['forest', 'city', 'fortress', 'swamp', 'mountain'];
    if (!stealthTerrains.includes(cell.terrain)) return state;
  }

  // v38.0: ghost_vision_passive allows free-action stealth (doesn't consume move/attack)
  const hasFreeStealth = unit.isHero && unit.abilities.some(a => a.id === 'ghost_vision_passive');

  // v89.0: Use _deepCopyUnit for consistent deep-copy (includes abilities/stats)
  const newUnits = state.units.map(u => _deepCopyUnit(u));
  const stealthedUnit = newUnits.find(u => u.id === unit.id);
  if (!stealthedUnit) return state;

  stealthedUnit.isStealthed = true;
  stealthedUnit.stealthTurnsRemaining = config.stealthDuration;
  // v38.0: ghost_vision_passive allows stealth without consuming actions
  if (!hasFreeStealth) {
    stealthedUnit.canMove = false;
    stealthedUnit.canAttack = false;
  }
  // v26.0: Record stealth action
  const stealthIdx = newUnits.findIndex(u => u.id === stealthedUnit.id);
  if (stealthIdx >= 0) {
    newUnits[stealthIdx] = _recordAction(stealthedUnit, {
      turn: state.turn, type: 'stealth',
      description: `进入隐蔽 (${config.stealthDuration}回合)`,
      position: { x: unit.position.x, z: unit.position.z },
    });
  }

  return {
    ...state,
    units: newUnits,
    selectedUnit: null,
    movablePositions: [],
    attackablePositions: [],
    movePath: [],
    phase: 'selectUnit',
    previousState: null,
  };
}

/** Process stealth decay at the start of each turn */
export function processStealthDecay(state: GameState): GameState {
  // v87.0: Use _deepCopyUnit for defensive consistency (abilities/stats deep-copied)
  const newUnits = state.units.map(u => _deepCopyUnit(u));
  let changed = false;

  for (const unit of newUnits) {
    if (!unit.isAlive) continue;
    if (unit.faction !== state.currentFaction) continue;
    if (!unit.isStealthed) {
      // Decrement cooldown for non-stealthed units
      if (unit.stealthCooldown > 0) {
        unit.stealthCooldown--;
        changed = true;
      }
      continue;
    }

    // Decrement stealth turns remaining
    unit.stealthTurnsRemaining--;

    if (unit.stealthTurnsRemaining <= 0) {
      // Stealth expires
      unit.isStealthed = false;
      unit.stealthTurnsRemaining = 0;
      unit.stealthCooldown = UNIT_CONFIGS[unit.type].stealthCooldownMax;
      changed = true;
    }
  }

  if (changed) {
    return { ...state, units: newUnits };
  }
  return state;
}

/** Check if a unit is detected (visible) by a given faction */
export function isUnitDetected(state: GameState, unit: Unit, viewerFaction: Faction): boolean {
  if (!unit.isAlive) return false;
  if (unit.faction === viewerFaction) return true; // always see your own units
  
  // Non-stealthed units follow normal vision rules (visibility determined elsewhere)
  if (!unit.isStealthed) return true;

  // Weather affects stealth detection distance via visionModifier
  // Negative visionModifier (e.g. fog: -3) reduces detection range
  const weatherVisionModifier = WEATHER_CONFIGS[state.currentWeather].visionModifier;

  // Stealthed units are only detected if:
  // 1. An enemy unit is adjacent (1 cell distance)
  for (const viewer of state.units) {
    if (!viewer.isAlive || viewer.faction !== viewerFaction) continue;
    const dist = Math.abs(viewer.position.x - unit.position.x) + Math.abs(viewer.position.z - unit.position.z);
    
    // Adjacent unit detects stealthed (adjusted for weather)
    const adjustedAdjDist = 1 + Math.round(weatherVisionModifier / 2);
    if (dist <= Math.max(1, adjustedAdjDist)) return true;
    
    // 2. A scout unit is within 2 cells (adjusted for weather)
    const adjustedScoutDist = 2 + Math.round(weatherVisionModifier / 2);
    if (viewer.type === 'scout' && dist <= Math.max(1, adjustedScoutDist)) return true;
  }

  // 3. The unit is in a capture point owned by the viewer
  for (const cp of state.capturePoints) {
    if (cp.owner !== viewerFaction) continue;
    const dist = Math.abs(unit.position.x - cp.position.x) + Math.abs(unit.position.z - cp.position.z);
    if (dist <= cp.providesVision) return true;
  }

  return false;
}

/** Get all units visible to a given faction (filtering stealthed units) */
export function getVisibleUnits(state: GameState, faction: Faction): Unit[] {
  return state.units.filter(unit => {
    if (!unit.isAlive) return false;
    if (unit.faction === faction) return true;
    return isUnitDetected(state, unit, faction);
  });
}

// ===== Hero Ability System =====

/** Shared helper: grant XP to a hero unit and process level-ups.
 *  Returns the list of LevelUpNotifications generated. */
function _grantHeroXP(
  heroUnit: Unit, xpGain: number, popups: DamagePopup[]
): LevelUpNotification[] {
  heroUnit.xp = (heroUnit.xp || 0) + xpGain;
  // v91.0: Show XP gain popup for hero
  if (xpGain > 0) {
    popups.push({ id: ++popupIdCounter, x: heroUnit.position.x, z: heroUnit.position.z, value: xpGain, type: 'xp', timestamp: Date.now() });
  }
  const notifications: LevelUpNotification[] = [];
  while (heroUnit.level < MAX_LEVEL && heroUnit.xp >= (heroUnit.xpToNextLevel || 999)) {
    const oldLevel = heroUnit.level;
    heroUnit.level++;
    const bonus = LEVEL_UP_BONUSES[heroUnit.type];
    if (bonus) {
      heroUnit.stats = { ...heroUnit.stats,
        attack: heroUnit.stats.attack + bonus.attack,
        defense: heroUnit.stats.defense + bonus.defense,
        armor: heroUnit.stats.armor + bonus.armor,
        armorPenetration: heroUnit.stats.armorPenetration + bonus.armorPenetration,
        maxHp: heroUnit.stats.maxHp + bonus.maxHp,
        hp: Math.min(heroUnit.stats.hp + bonus.maxHp, heroUnit.stats.maxHp + bonus.maxHp),
        vision: heroUnit.stats.vision + bonus.vision,
        moveRange: heroUnit.stats.moveRange + bonus.moveRange,
        attackRange: heroUnit.stats.attackRange + bonus.attackRange,
      };
    }
    heroUnit.xpToNextLevel = LEVEL_XP_THRESHOLDS[heroUnit.level] ?? 999;
    popups.push({ id: ++popupIdCounter, x: heroUnit.position.x, z: heroUnit.position.z, value: heroUnit.level, type: 'levelup', timestamp: Date.now() });
    notifications.push({
      id: ++notificationIdCounter,
      unitId: heroUnit.id,
      unitName: heroUnit.name,
      faction: heroUnit.faction,
      oldLevel,
      newLevel: heroUnit.level,
      bonus,
      timestamp: Date.now(),
    });
  }
  return notifications;
}

/** Use a hero's active ability */
export function executeHeroAbility(state: GameState, unit: Unit, abilityId: string, targetPos?: Position): GameState {
  if (!unit.isHero || !unit.canAttack || !unit.isAlive || state.currentFaction !== unit.faction) return state;
    // v76.0: Damage-dealing hero abilities should respect ammo constraint
  const damageAbilities = ['firestorm_active', 'strafing_run_active', 'guided_barrage_active', 'assassinate_active'];
  if (damageAbilities.includes(abilityId)) {
    if (unit.stats.ammo !== undefined && unit.stats.ammo !== null && unit.stats.ammo <= 0) return state;
  }

  const ability = unit.abilities.find(a => a.id === abilityId);
  if (!ability || ability.type !== 'active') return state;
  if (ability.currentCooldown > 0) return state;

  const newMap = { ...state.map, cells: state.map.cells.map(row => row.map(cell => ({ ...cell }))) };
  // v90.0: Use _deepCopyUnit for consistency with rest of codebase (was inline deep-copy)
  const newUnits = state.units.map(u => _deepCopyUnit(u));
  const heroUnit = newUnits.find(u => u.id === unit.id);
  if (!heroUnit) return state;

  // v76.0: Consume 1 ammo for damage-dealing hero abilities
  const isDamageAbility = damageAbilities.includes(abilityId);
  if (isDamageAbility && heroUnit.stats.ammo !== undefined && heroUnit.stats.ammo !== null) {
    heroUnit.stats.ammo = Math.max(0, heroUnit.stats.ammo - 1);
  }

  const popups: DamagePopup[] = [];

  // Set cooldown
  heroUnit.abilities = heroUnit.abilities.map(a => a.id === abilityId ? { ...a, currentCooldown: a.cooldown } : a);

  // v33.0: _recordAction moved to END of each ability branch to prevent stale reference.
  // Previously it was here, causing all subsequent mutations (tempDefenseBuff, canAttack, etc.)
  // to write to a stale object and be silently lost.

  // Execute ability based on hero/ability
  const heroDef = getHeroDefinition(unit.heroId || '');

  if (abilityId === 'fortify_active') {
    // Defense buff ability (self)
    const defBonus = ability.effect.defenseBonus || 30;
    const duration = 2;
    heroUnit.tempDefenseBuff = defBonus;
    heroUnit.tempDefenseBuffTurns = duration;
    heroUnit.canAttack = false;
    heroUnit.canMove = false;
    heroUnit.attackedThisTurn = true;
    popups.push({
      id: ++popupIdCounter, x: heroUnit.position.x, z: heroUnit.position.z,
      value: defBonus, type: 'morale', timestamp: Date.now(),
    });
    const logEntry: CombatLogEntry = {
      turn: state.turn, attacker: `${heroUnit.name}(${unit.faction === 'red' ? '红方' : '蓝方'})`,
      defender: '技能', damage: 0, defenderRemainingHp: 0,
      attackerFaction: unit.faction, eventType: 'attack', action: 'hero_ability',
      unitName: `${ability.icon} ${ability.name}`,
    };
    const heroRecIdx = newUnits.findIndex(u => u.id === heroUnit.id);
    if (heroRecIdx >= 0) {
      newUnits[heroRecIdx] = _recordAction(heroUnit, {
        turn: state.turn, type: 'ability',
        description: `${ability.icon} ${ability.name}`,
        position: { x: unit.position.x, z: unit.position.z },
      });
    }
    return { ...state, map: newMap, units: newUnits, damagePopups: [...(state.damagePopups || []), ...popups], combatLog: [logEntry, ...state.combatLog].slice(0, 200), selectedUnit: null, movablePositions: [], attackablePositions: [], phase: 'selectUnit' as GamePhase };
  }

  // v36.0: armor_break_active is now a proper offensive ability — removes target fortification and deals 40 damage
  if (abilityId === 'armor_break_active') {
    if (!targetPos) return state;
    // v71.0: Hero targeted abilities must be within range (attackRange + 1)
    const abDist = Math.abs(targetPos.x - unit.position.x) + Math.abs(targetPos.z - unit.position.z);
    if (abDist > (unit.stats.attackRange || 2) + 1) return state;
    const target = newUnits.find(u => u.position.x === targetPos.x && u.position.z === targetPos.z && u.faction !== unit.faction && u.isAlive
      && isUnitDetected({ ...state, map: newMap, units: newUnits }, u, unit.faction));
    // v55.0: Cannot armor_break undetected stealthed enemies
    if (!target) return state;
    let baseDmg = ability.effect.damageBonus || 40;
    // v52.0: Apply iron_wall_passive flat -8 reduction and tempDefenseBuff
    if (target.isHero && target.abilities.some(a => a.id === 'iron_wall_passive')) baseDmg = Math.max(1, baseDmg - 8);
    if (target.tempDefenseBuff) baseDmg = Math.max(1, baseDmg - target.tempDefenseBuff);
    const targetCellAb = getCell(newMap, targetPos);
    if (targetCellAb?.fortified) baseDmg = Math.max(1, baseDmg - FORTIFY_DEFENSE_BONUS);
    target.stats = { ...target.stats, hp: Math.max(0, target.stats.hp - baseDmg) };
    // Remove fortification from target cell
    if (targetCellAb && targetCellAb.fortified) {
      targetCellAb.fortified = false;
      targetCellAb.fortifiedByTurn = 0;
      popups.push({ id: ++popupIdCounter, x: targetPos.x, z: targetPos.z, value: -1, type: 'morale', timestamp: Date.now() });
    }
    if (target.stats.hp <= 0) {
      target.isAlive = false;
      if (targetCellAb) targetCellAb.unit = null;
    }
    popups.push({ id: ++popupIdCounter, x: targetPos.x, z: targetPos.z, value: baseDmg, type: 'damage', timestamp: Date.now() });
    // v37.0: Track battleStats for armor_break_active
    const abBattleStats: BattleStats = { ...state.battleStats, red: { ...state.battleStats.red }, blue: { ...state.battleStats.blue } };
    abBattleStats[unit.faction].damageDealt += baseDmg;
    // v39.0: Track defender damageReceived and unitsLost
    abBattleStats[target.faction].damageReceived = (abBattleStats[target.faction].damageReceived || 0) + baseDmg;
    if (target.stats.hp <= 0) {
      abBattleStats[unit.faction].kills += 1;
      abBattleStats[unit.faction].unitsDestroyed += 1;
      abBattleStats[target.faction].unitsLost += 1;
      // Ally morale loss on kill
      for (const ally of newUnits) {
        if (ally.isAlive && ally.faction === target.faction && ally.id !== target.id) {
          const allyDist = Math.abs(ally.position.x - target.position.x) + Math.abs(ally.position.z - target.position.z);
          if (allyDist <= 3 && ally.stats.morale !== undefined && ally.stats.morale !== null) {
            ally.stats = { ...ally.stats, morale: Math.max(0, ally.stats.morale - 5) };
          }
        }
      }
    }
    if (heroUnit) {
      heroUnit.totalDamageDealt = (heroUnit.totalDamageDealt || 0) + baseDmg;
    }
    // v41.0: Grant XP + level-up for armor_break_active
    const abNotifications = _grantHeroXP(heroUnit, baseDmg + (target.stats.hp <= 0 ? XP_PER_KILL : 0), popups);
    heroUnit.canAttack = false; heroUnit.canMove = false; heroUnit.attackedThisTurn = true;
    const logEntry: CombatLogEntry = { turn: state.turn, attacker: `${heroUnit.name}`, defender: target.name, damage: baseDmg, defenderRemainingHp: target.stats.hp, attackerFaction: unit.faction, eventType: target.stats.hp <= 0 ? 'destroy' : 'attack', action: 'hero_ability', unitName: `${ability.icon} ${ability.name}` };
    const abRecIdx = newUnits.findIndex(u => u.id === heroUnit.id);
    if (abRecIdx >= 0) newUnits[abRecIdx] = _recordAction(heroUnit, { turn: state.turn, type: 'ability', description: `${ability.icon} ${ability.name}`, position: { x: unit.position.x, z: unit.position.z } });
    return _applyVictoryCheck({ ...state, map: newMap, units: newUnits, battleStats: abBattleStats, damagePopups: [...(state.damagePopups || []), ...popups], combatLog: [logEntry, ...state.combatLog].slice(0, 200), selectedUnit: null, movablePositions: [], attackablePositions: [], phase: 'selectUnit' as GamePhase, levelUpNotifications: (() => { const combined = [...(state.levelUpNotifications || []), ...abNotifications]; return combined.length > 20 ? combined.slice(-20) : combined; })() });
  }

  if (abilityId === 'firestorm_active') {
    // AoE damage to all enemies in radius
    const radius = ability.effect.aoeRadius || 2;
    const aoeDmg = ability.effect.aoeDamage || 25;
    // v35.0: Track battleStats and XP for AoE kills/damage
    let aoeTotalDmg = 0;
    let aoeKills = 0;
    const newBattleStats: BattleStats = {
      red: { ...state.battleStats.red },
      blue: { ...state.battleStats.blue },
    };
    for (const target of newUnits) {
      if (!target.isAlive || target.faction === unit.faction) continue;
      // v56.0: Firestorm should not hit undetected stealthed enemies (consistent with strafing_run/guided_barrage)
      if (!isUnitDetected({ ...state, map: newMap, units: newUnits }, target, unit.faction)) continue;
      const dist = Math.abs(target.position.x - unit.position.x) + Math.abs(target.position.z - unit.position.z);
      if (dist <= radius) {
        // v52.0: Apply defensive passives to AoE hero ability damage
        let effDmg = aoeDmg;
        if (target.isHero && target.abilities.some(a => a.id === 'iron_wall_passive')) effDmg = Math.max(1, effDmg - 8);
        if (target.tempDefenseBuff) effDmg = Math.max(1, effDmg - target.tempDefenseBuff);
        const aoeCell = getCell(newMap, target.position);
        if (aoeCell?.fortified) effDmg = Math.max(1, effDmg - FORTIFY_DEFENSE_BONUS);
        target.stats = { ...target.stats, hp: Math.max(0, target.stats.hp - effDmg) };
        aoeTotalDmg += effDmg;
        if (target.stats.hp <= 0) {
          target.isAlive = false;
          aoeKills++;
          const cell = getCell(newMap, target.position);
          if (cell) cell.unit = null;
          // Ally morale loss on kill
          for (const ally of newUnits) {
            if (ally.isAlive && ally.faction === target.faction && ally.id !== target.id) {
              const allyDist = Math.abs(ally.position.x - target.position.x) + Math.abs(ally.position.z - target.position.z);
              if (allyDist <= 3 && ally.stats.morale !== undefined && ally.stats.morale !== null) {
                ally.stats = { ...ally.stats, morale: Math.max(0, ally.stats.morale - 5) };
              }
            }
          }
        }
        popups.push({ id: ++popupIdCounter, x: target.position.x, z: target.position.z, value: effDmg, type: 'damage', timestamp: Date.now() });
      }
    }
    // Update battleStats
    newBattleStats[unit.faction].damageDealt += aoeTotalDmg;
    // v38.0 → v39.0: Track kills, unitsDestroyed, AND defender damageReceived/unitsLost
    if (aoeKills > 0) {
      newBattleStats[unit.faction].kills += aoeKills;
      newBattleStats[unit.faction].unitsDestroyed += aoeKills;
      // Track defender losses
      const enemyFaction = unit.faction === 'red' ? 'blue' : 'red';
      newBattleStats[enemyFaction].unitsLost += aoeKills;
    }
    // Track defender damageReceived
    const enemyFaction1 = unit.faction === 'red' ? 'blue' : 'red';
    newBattleStats[enemyFaction1].damageReceived = (newBattleStats[enemyFaction1].damageReceived || 0) + aoeTotalDmg;
    if (heroUnit) {
      heroUnit.totalDamageDealt = (heroUnit.totalDamageDealt || 0) + aoeTotalDmg;
    }
    // XP grant + level-up for firestorm
    const aoeNotifications = _grantHeroXP(heroUnit, aoeTotalDmg + aoeKills * (XP_PER_KILL || 30), popups);
    heroUnit.canAttack = false; heroUnit.canMove = false; heroUnit.attackedThisTurn = true;
    const logEntry: CombatLogEntry = { turn: state.turn, attacker: `${heroUnit.name}`, defender: `烈焰风暴(命中${aoeKills}击杀)`, damage: aoeTotalDmg, defenderRemainingHp: 0, attackerFaction: unit.faction, eventType: aoeKills > 0 ? 'destroy' : 'attack', action: 'hero_ability' };
    // v33.0: Record action AFTER all mutations
    const recIdx1 = newUnits.findIndex(u => u.id === heroUnit.id);
    if (recIdx1 >= 0) newUnits[recIdx1] = _recordAction(heroUnit, { turn: state.turn, type: 'ability', description: `${ability.icon} ${ability.name}`, position: { x: unit.position.x, z: unit.position.z } });
    return _applyVictoryCheck({ ...state, map: newMap, units: newUnits, battleStats: newBattleStats, damagePopups: [...(state.damagePopups || []), ...popups], combatLog: [logEntry, ...state.combatLog].slice(0, 200), selectedUnit: null, movablePositions: [], attackablePositions: [], phase: 'selectUnit' as GamePhase, levelUpNotifications: (() => { const combined = [...(state.levelUpNotifications || []), ...aoeNotifications]; return combined.length > 20 ? combined.slice(-20) : combined; })() });
  }

  if (abilityId === 'emergency_resupply_active') {
    // Heal all allies in radius
    const radius = ability.effect.aoeRadius || 2;
    // v56.0: Read heal amount from ability effect instead of hardcoding
    const healAmount = Math.abs(ability.effect.aoeDamage || 20);
    // v39.0: Track healing in battleStats
    const resupplyStats: BattleStats = { ...state.battleStats, red: { ...state.battleStats.red }, blue: { ...state.battleStats.blue } };
    let totalHealing = 0;
    for (const target of newUnits) {
      if (!target.isAlive || target.faction !== unit.faction || target.id === unit.id) continue;
      const dist = Math.abs(target.position.x - unit.position.x) + Math.abs(target.position.z - unit.position.z);
      if (dist <= radius && target.stats.hp < target.stats.maxHp) {
        const actual = Math.min(healAmount, target.stats.maxHp - target.stats.hp);
        target.stats = { ...target.stats, hp: target.stats.hp + actual };
        totalHealing += actual;
        popups.push({ id: ++popupIdCounter, x: target.position.x, z: target.position.z, value: actual, type: 'heal', timestamp: Date.now() });
      }
    }
    resupplyStats[unit.faction].healingDone = (resupplyStats[unit.faction].healingDone || 0) + totalHealing;
    heroUnit.canAttack = false; heroUnit.canMove = false; heroUnit.attackedThisTurn = true;
    const logEntry: CombatLogEntry = { turn: state.turn, attacker: `${heroUnit.name}`, defender: '紧急救治', damage: 0, defenderRemainingHp: 0, attackerFaction: unit.faction, eventType: 'attack', action: 'hero_ability' };
    const recIdx2 = newUnits.findIndex(u => u.id === heroUnit.id);
    if (recIdx2 >= 0) newUnits[recIdx2] = _recordAction(heroUnit, { turn: state.turn, type: 'ability', description: `${ability.icon} ${ability.name}`, position: { x: unit.position.x, z: unit.position.z } });
    return { ...state, map: newMap, units: newUnits, battleStats: resupplyStats, damagePopups: [...(state.damagePopups || []), ...popups], combatLog: [logEntry, ...state.combatLog].slice(0, 200), selectedUnit: null, movablePositions: [], attackablePositions: [], phase: 'selectUnit' as GamePhase };
  }

  if (abilityId === 'strafing_run_active' || abilityId === 'guided_barrage_active') {
    // AoE damage along line or at target
    // v41.0: guided_barrage uses damageBonus for main target, aoeDamage for splash
    const mainTargetDmg = abilityId === 'guided_barrage_active'
      ? (ability.effect.damageBonus || ability.effect.aoeDamage || 20)
      : (ability.effect.aoeDamage || ability.effect.damageBonus || 20);
    const splashDmg = abilityId === 'guided_barrage_active'
      ? Math.round(mainTargetDmg * 0.5)
      : (ability.effect.aoeDamage || ability.effect.damageBonus || 20);
    const aoeDmg = ability.effect.aoeDamage || ability.effect.damageBonus || 20;
    const radius = ability.effect.aoeRadius || 1;
    // v35.0: Track battleStats and XP for AoE
    let aoeTotalDmg = 0;
    let aoeKills = 0;
    const aoeBattleStats: BattleStats = {
      red: { ...state.battleStats.red },
      blue: { ...state.battleStats.blue },
    };
    const targets = targetPos
      ? newUnits.filter(t => t.isAlive && t.faction !== unit.faction && Math.abs(t.position.x - targetPos.x) + Math.abs(t.position.z - targetPos.z) <= radius
        && isUnitDetected({ ...state, map: newMap, units: newUnits }, t, unit.faction))
      : newUnits.filter(t => t.isAlive && t.faction !== unit.faction && Math.abs(t.position.x - unit.position.x) + Math.abs(t.position.z - unit.position.z) <= radius
        && isUnitDetected({ ...state, map: newMap, units: newUnits }, t, unit.faction));
    // v55.0: AoE abilities cannot target undetected stealthed enemies
    for (const target of targets) {
      const isMainTarget = abilityId === 'guided_barrage_active' && targetPos && target.position.x === targetPos.x && target.position.z === targetPos.z;
      let dmg = abilityId === 'guided_barrage_active' ? (isMainTarget ? mainTargetDmg : splashDmg) : aoeDmg;
      // v52.0: Apply defensive passives to AoE hero ability damage
      if (target.isHero && target.abilities.some(a => a.id === 'iron_wall_passive')) dmg = Math.max(1, dmg - 8);
      if (target.tempDefenseBuff) dmg = Math.max(1, dmg - target.tempDefenseBuff);
      const strafeCell = getCell(newMap, target.position);
      if (strafeCell?.fortified) dmg = Math.max(1, dmg - FORTIFY_DEFENSE_BONUS);
      target.stats = { ...target.stats, hp: Math.max(0, target.stats.hp - dmg) };
      aoeTotalDmg += dmg;
      if (target.stats.hp <= 0) {
        target.isAlive = false; aoeKills++;
        const cell = getCell(newMap, target.position); if (cell) cell.unit = null;
        // Ally morale loss on kill
        for (const ally of newUnits) {
          if (ally.isAlive && ally.faction === target.faction && ally.id !== target.id) {
            const allyDist = Math.abs(ally.position.x - target.position.x) + Math.abs(ally.position.z - target.position.z);
            if (allyDist <= 3 && ally.stats.morale !== undefined && ally.stats.morale !== null) {
              ally.stats = { ...ally.stats, morale: Math.max(0, ally.stats.morale - 5) };
            }
          }
        }
      }
      popups.push({ id: ++popupIdCounter, x: target.position.x, z: target.position.z, value: dmg, type: 'damage', timestamp: Date.now() });
    }
    aoeBattleStats[unit.faction].damageDealt += aoeTotalDmg;
    // v38.0 → v39.0: Track kills, unitsDestroyed, AND defender damageReceived/unitsLost
    const enemyFaction = unit.faction === 'red' ? 'blue' : 'red';
    if (aoeKills > 0) {
      aoeBattleStats[unit.faction].kills += aoeKills;
      aoeBattleStats[unit.faction].unitsDestroyed += aoeKills;
      aoeBattleStats[enemyFaction].unitsLost += aoeKills;
    }
    aoeBattleStats[enemyFaction].damageReceived = (aoeBattleStats[enemyFaction].damageReceived || 0) + aoeTotalDmg;
    if (heroUnit) {
      heroUnit.totalDamageDealt = (heroUnit.totalDamageDealt || 0) + aoeTotalDmg;
    }
    // XP grant + level-up for strafing_run / guided_barrage
    const strafingNotifications = _grantHeroXP(heroUnit, aoeTotalDmg + aoeKills * (XP_PER_KILL || 30), popups);
    heroUnit.canAttack = false; heroUnit.canMove = false; heroUnit.attackedThisTurn = true;
    const logEntry: CombatLogEntry = { turn: state.turn, attacker: `${heroUnit.name}`, defender: `${ability.name}(${aoeKills}击杀)`, damage: aoeTotalDmg, defenderRemainingHp: 0, attackerFaction: unit.faction, eventType: aoeKills > 0 ? 'destroy' : 'attack', action: 'hero_ability' };
    const recIdx3 = newUnits.findIndex(u => u.id === heroUnit.id);
    if (recIdx3 >= 0) newUnits[recIdx3] = _recordAction(heroUnit, { turn: state.turn, type: 'ability', description: `${ability.icon} ${ability.name}`, position: { x: unit.position.x, z: unit.position.z } });
    return _applyVictoryCheck({ ...state, map: newMap, units: newUnits, battleStats: aoeBattleStats, damagePopups: [...(state.damagePopups || []), ...popups], combatLog: [logEntry, ...state.combatLog].slice(0, 200), selectedUnit: null, movablePositions: [], attackablePositions: [], phase: 'selectUnit' as GamePhase, levelUpNotifications: (() => { const combined = [...(state.levelUpNotifications || []), ...strafingNotifications]; return combined.length > 20 ? combined.slice(-20) : combined; })() });
  }

  if (abilityId === 'assassinate_active') {
    // Double damage to target below 50% HP
    if (!targetPos) return state;
    // v71.0: Range check for targeted ability
    const asDist = Math.abs(targetPos.x - unit.position.x) + Math.abs(targetPos.z - unit.position.z);
    if (asDist > (unit.stats.attackRange || 2) + 1) return state;
    const target = newUnits.find(u => u.position.x === targetPos.x && u.position.z === targetPos.z && u.faction !== unit.faction && u.isAlive
      && isUnitDetected({ ...state, map: newMap, units: newUnits }, u, unit.faction));
    // v55.0: Cannot assassinate undetected stealthed enemies
    if (!target) return state;
    const dmgMult = target.stats.hp < target.stats.maxHp * 0.5 ? 2.0 : 1.0;
    let baseDmg = Math.round(heroUnit.stats.attack * dmgMult);
    // v52.0: Apply defensive passives to assassinate damage
    if (target.isHero && target.abilities.some(a => a.id === 'iron_wall_passive')) baseDmg = Math.max(1, baseDmg - 8);
    if (target.tempDefenseBuff) baseDmg = Math.max(1, baseDmg - target.tempDefenseBuff);
    const assCell = getCell(newMap, target.position);
    if (assCell?.fortified) baseDmg = Math.max(1, baseDmg - FORTIFY_DEFENSE_BONUS);
    target.stats = { ...target.stats, hp: Math.max(0, target.stats.hp - baseDmg) };
    if (target.stats.hp <= 0) { target.isAlive = false; const cell = getCell(newMap, target.position); if (cell) cell.unit = null; }
    popups.push({ id: ++popupIdCounter, x: target.position.x, z: target.position.z, value: baseDmg, type: 'damage', timestamp: Date.now() });
    // v38.0: Track battleStats for assassinate_active
    const assBattleStats: BattleStats = { ...state.battleStats, red: { ...state.battleStats.red }, blue: { ...state.battleStats.blue } };
    assBattleStats[unit.faction].damageDealt += baseDmg;
    // v39.0: Track defender damageReceived and unitsLost
    assBattleStats[target.faction].damageReceived = (assBattleStats[target.faction].damageReceived || 0) + baseDmg;
    if (target.stats.hp <= 0) {
      assBattleStats[unit.faction].kills += 1;
      assBattleStats[unit.faction].unitsDestroyed += 1;
      assBattleStats[target.faction].unitsLost += 1;
      for (const ally of newUnits) {
        if (ally.isAlive && ally.faction === target.faction && ally.id !== target.id) {
          const allyDist = Math.abs(ally.position.x - target.position.x) + Math.abs(ally.position.z - target.position.z);
          if (allyDist <= 3 && ally.stats.morale !== undefined && ally.stats.morale !== null) {
            ally.stats = { ...ally.stats, morale: Math.max(0, ally.stats.morale - 5) };
          }
        }
      }
    }
    heroUnit.totalDamageDealt = (heroUnit.totalDamageDealt || 0) + baseDmg;
    // v41.0: Grant XP + level-up for assassinate_active
    const asNotifications = _grantHeroXP(heroUnit, baseDmg + (target.stats.hp <= 0 ? XP_PER_KILL : 0), popups);
    heroUnit.canAttack = false; heroUnit.canMove = false; heroUnit.attackedThisTurn = true;
    const logEntry: CombatLogEntry = { turn: state.turn, attacker: `${heroUnit.name}`, defender: target.name, damage: baseDmg, defenderRemainingHp: target.stats.hp, attackerFaction: unit.faction, eventType: target.stats.hp <= 0 ? 'destroy' : 'attack', action: 'hero_ability' };
    const recIdx4 = newUnits.findIndex(u => u.id === heroUnit.id);
    if (recIdx4 >= 0) newUnits[recIdx4] = _recordAction(heroUnit, { turn: state.turn, type: 'ability', description: `${ability.icon} ${ability.name}`, position: { x: unit.position.x, z: unit.position.z } });
    return _applyVictoryCheck({ ...state, map: newMap, units: newUnits, battleStats: assBattleStats, damagePopups: [...(state.damagePopups || []), ...popups], combatLog: [logEntry, ...state.combatLog].slice(0, 200), selectedUnit: null, movablePositions: [], attackablePositions: [], phase: 'selectUnit' as GamePhase, levelUpNotifications: (() => { const combined = [...(state.levelUpNotifications || []), ...asNotifications]; return combined.length > 20 ? combined.slice(-20) : combined; })() });
  }

  if (abilityId === 'lock_on_active') {
    // Reduce target defense for 2 turns (v28.0: use tempDefenseBuff with negative value for auto-expiry)
    if (!targetPos) return state;
    // v71.0: Range check for targeted ability
    const loDist = Math.abs(targetPos.x - unit.position.x) + Math.abs(targetPos.z - unit.position.z);
    if (loDist > (unit.stats.attackRange || 2) + 1) return state;
    // v55.0: Cannot lock_on undetected stealthed enemies (information exploit fix, matching armor_break_active pattern)
    const target = newUnits.find(u => u.position.x === targetPos.x && u.position.z === targetPos.z && u.faction !== unit.faction && u.isAlive
      && isUnitDetected({ ...state, map: newMap, units: newUnits }, u, unit.faction));
    if (!target) return state;
    const defReduction = Math.floor(target.stats.defense * 0.5);
    target.tempDefenseBuff = -defReduction; // negative = debuff (increases incoming damage via -= negative)
    target.tempDefenseBuffTurns = 2;
    heroUnit.canAttack = false; heroUnit.canMove = false; heroUnit.attackedThisTurn = true;
    popups.push({ id: ++popupIdCounter, x: target.position.x, z: target.position.z, value: -defReduction, type: 'morale', timestamp: Date.now() });
    const logEntry: CombatLogEntry = { turn: state.turn, attacker: `${heroUnit.name}`, defender: target.name, damage: 0, defenderRemainingHp: target.stats.hp, attackerFaction: unit.faction, eventType: 'attack', action: 'hero_ability' };
    const recIdx5 = newUnits.findIndex(u => u.id === heroUnit.id);
    if (recIdx5 >= 0) newUnits[recIdx5] = _recordAction(heroUnit, { turn: state.turn, type: 'ability', description: `${ability.icon} ${ability.name}`, position: { x: unit.position.x, z: unit.position.z } });
    return { ...state, map: newMap, units: newUnits, damagePopups: [...(state.damagePopups || []), ...popups], combatLog: [logEntry, ...state.combatLog].slice(0, 200), selectedUnit: null, movablePositions: [], attackablePositions: [], phase: 'selectUnit' as GamePhase };
  }

  if (abilityId === 'charge_active' || abilityId === 'flanking_maneuver_active') {
    // Damage multiplier buff for next attack (or immediate if target)
    const dmgMult = ability.effect.damageMultiplier || 1.4;
    heroUnit.tempDamageBuff = dmgMult;
    heroUnit.tempDamageBuffTurns = 2;
    heroUnit.canAttack = false; /* preserve canMove so hero can reposition after buffing */ heroUnit.attackedThisTurn = true;
    popups.push({ id: ++popupIdCounter, x: heroUnit.position.x, z: heroUnit.position.z, value: Math.round(dmgMult * 100), type: 'morale', timestamp: Date.now() });
    const logEntry: CombatLogEntry = { turn: state.turn, attacker: `${heroUnit.name}`, defender: ability.name, damage: 0, defenderRemainingHp: 0, attackerFaction: unit.faction, eventType: 'attack', action: 'hero_ability' };
    const recIdx6 = newUnits.findIndex(u => u.id === heroUnit.id);
    if (recIdx6 >= 0) newUnits[recIdx6] = _recordAction(heroUnit, { turn: state.turn, type: 'ability', description: `${ability.icon} ${ability.name}`, position: { x: unit.position.x, z: unit.position.z } });
    return { ...state, map: newMap, units: newUnits, damagePopups: [...(state.damagePopups || []), ...popups], combatLog: [logEntry, ...state.combatLog].slice(0, 200), selectedUnit: null, movablePositions: [], attackablePositions: [], phase: 'selectUnit' as GamePhase };
  }

  if (abilityId === 'mass_fortify_active') {
    // Fortify all allies in radius
    const radius = ability.effect.aoeRadius || 2;
    // v89.0: Track fortifications built for battleStats
    let fortifiedCount = 0;
    const fortifyBattleStats: BattleStats = { ...state.battleStats, red: { ...state.battleStats.red }, blue: { ...state.battleStats.blue } };
    for (const ally of newUnits) {
      if (!ally.isAlive || ally.faction !== unit.faction) continue;
      const dist = Math.abs(ally.position.x - unit.position.x) + Math.abs(ally.position.z - unit.position.z);
      if (dist <= radius) {
        const cell = getCell(newMap, ally.position);
        if (cell && !cell.fortified) {
          // v71.0: Ignore undetected stealthed enemies (same class as getMovablePositions v56.0)
          const isOccupiedByBlocker = cell.unit && cell.unit.isAlive && cell.unit.id !== ally.id &&
            (cell.unit.faction === unit.faction || isUnitDetected({ ...state, map: newMap, units: newUnits }, cell.unit, unit.faction));
          if (!isOccupiedByBlocker) {
            cell.fortified = true;
            // v89.0: Always set fortifyDuration (not just for heroes)
            cell.fortifiedByTurn = state.turn;
            const fortBonus = getHeroFortifyBonus(unit);
            cell.fortifyDuration = FORTIFY_DURATION + fortBonus.durationBonus;
            // v89.0: Count successful fortifications
            fortifiedCount++;
          }
        }
      }
    }
    // v89.0: Track fortsBuilt in battleStats
    fortifyBattleStats[unit.faction].fortsBuilt += fortifiedCount;
    heroUnit.canAttack = false; heroUnit.canMove = false; heroUnit.attackedThisTurn = true;
    popups.push({ id: ++popupIdCounter, x: heroUnit.position.x, z: heroUnit.position.z, value: radius, type: 'morale', timestamp: Date.now() });
    const logEntry: CombatLogEntry = { turn: state.turn, attacker: `${heroUnit.name}`, defender: '战场重建', damage: 0, defenderRemainingHp: 0, attackerFaction: unit.faction, eventType: 'attack', action: 'hero_ability' };
    const recIdx7 = newUnits.findIndex(u => u.id === heroUnit.id);
    if (recIdx7 >= 0) newUnits[recIdx7] = _recordAction(heroUnit, { turn: state.turn, type: 'ability', description: `${ability.icon} ${ability.name}`, position: { x: unit.position.x, z: unit.position.z } });
    return { ...state, map: newMap, units: newUnits, battleStats: fortifyBattleStats, damagePopups: [...(state.damagePopups || []), ...popups], combatLog: [logEntry, ...state.combatLog].slice(0, 200), selectedUnit: null, movablePositions: [], attackablePositions: [], phase: 'selectUnit' as GamePhase };
  }

  if (abilityId === 'mark_target_active') {
    // Reveal stealth enemies in radius
    const radius = ability.effect.extraVision || 3;
    for (const target of newUnits) {
      if (!target.isAlive || target.faction === unit.faction) continue;
      const dist = Math.abs(target.position.x - unit.position.x) + Math.abs(target.position.z - unit.position.z);
      if (dist <= radius && target.isStealthed) {
        target.isStealthed = false;
        // v39.0: Set stealthCooldown so revealed units can't immediately re-stealth
        const targetConfig = UNIT_CONFIGS[target.type];
        target.stealthCooldown = targetConfig?.stealthCooldownMax ?? 3;
        target.stealthTurnsRemaining = 0;
        popups.push({ id: ++popupIdCounter, x: target.position.x, z: target.position.z, value: 0, type: 'morale', timestamp: Date.now() });
      }
    }
    heroUnit.canAttack = false; heroUnit.canMove = false; heroUnit.attackedThisTurn = true;
    const logEntry: CombatLogEntry = { turn: state.turn, attacker: `${heroUnit.name}`, defender: '战术标记', damage: 0, defenderRemainingHp: 0, attackerFaction: unit.faction, eventType: 'attack', action: 'hero_ability' };
    const recIdx8 = newUnits.findIndex(u => u.id === heroUnit.id);
    if (recIdx8 >= 0) newUnits[recIdx8] = _recordAction(heroUnit, { turn: state.turn, type: 'ability', description: `${ability.icon} ${ability.name}`, position: { x: unit.position.x, z: unit.position.z } });
    return { ...state, map: newMap, units: newUnits, damagePopups: [...(state.damagePopups || []), ...popups], combatLog: [logEntry, ...state.combatLog].slice(0, 200), selectedUnit: null, movablePositions: [], attackablePositions: [], phase: 'selectUnit' as GamePhase };
  }

  // Generic fallback
  heroUnit.canAttack = false; heroUnit.canMove = false; heroUnit.attackedThisTurn = true;
  const recIdxFb = newUnits.findIndex(u => u.id === heroUnit.id);
  if (recIdxFb >= 0) newUnits[recIdxFb] = _recordAction(heroUnit, { turn: state.turn, type: 'ability', description: `${ability.icon} ${ability.name}`, position: { x: unit.position.x, z: unit.position.z } });
  let fbResult: GameState = { ...state, map: newMap, units: newUnits, phase: 'selectUnit' as GamePhase };
  // v73.0: Check victory after ability (AoE abilities can kill all enemies)
  return _applyVictoryCheck(fbResult);
}

/** v73.0: Check if a faction has been eliminated and set gameOver if so */
function _applyVictoryCheck(state: GameState): GameState {
  const redAlive = state.units.filter(u => u.faction === 'red' && u.isAlive).length;
  const blueAlive = state.units.filter(u => u.faction === 'blue' && u.isAlive).length;
  // v78.0: Handle mutual annihilation (e.g., AoE ability kills last enemies + last friendlies)
  if (redAlive === 0 && blueAlive === 0) {
    // v87.0: Award win to current faction (the aggressor should benefit from mutual annihilation)
    return { ...state, winner: state.currentFaction, phase: 'gameOver' as GamePhase, victoryReason: '同归于尽' };
  }
  if (redAlive === 0 && blueAlive > 0) return { ...state, winner: 'blue', phase: 'gameOver' as GamePhase, victoryReason: '歼灭胜利' };
  if (blueAlive === 0 && redAlive > 0) return { ...state, winner: 'red', phase: 'gameOver' as GamePhase, victoryReason: '歼灭胜利' };
  return state;
}

/** Check if a hero ability needs a target position */
export function heroAbilityNeedsTarget(abilityId: string): boolean {
  return ['assassinate_active', 'guided_barrage_active', 'lock_on_active', 'armor_break_active'].includes(abilityId);
}

/** Get effective supply heal range for a hero supply unit */
export function getHeroSupplyBonus(unit: Unit): { healBonus: number; rangeBonus: number } {
  if (!unit.isHero) return { healBonus: 0, rangeBonus: 0 };
  // v36.0: Match by specific ability ID instead of fragile trigger === 'onTurnStart' heuristic.
  // Previously any hero with a passive onTurnStart trigger got supply bonuses.
  // v40.0: Read bonus values from ability effect instead of hardcoding
  const ability = unit.abilities.find(a => a.id === 'angel_heal_passive');
  if (ability) {
    return {
      healBonus: (ability.effect as any).healAmountBonus || 5,
      rangeBonus: (ability.effect as any).healRangeBonus || 1,
    };
  }
  return { healBonus: 0, rangeBonus: 0 };
}

/** Get effective fortify duration bonus for a hero engineer */
export function getHeroFortifyBonus(unit: Unit): { durationBonus: number; defenseBonus: number } {
  if (!unit.isHero) return { durationBonus: 0, defenseBonus: 0 };
  const ability = unit.abilities.find(a => a.id === 'fortify_master_passive');
  if (ability) {
    return { durationBonus: (ability.effect as any).durationBonus ?? 3, defenseBonus: ability.effect.defenseBonus || 0 };
  }
  return { durationBonus: 0, defenseBonus: 0 };
}

let intelReportIdCounter = 0;

const RECON_RADIUS = 1;
const RECON_REVEAL_TURNS = 3;

export function canUseRecon(unit: Unit): boolean {
  return (unit.type === 'scout' || unit.type === 'uav') && unit.isAlive && unit.canMove;
}

export function getReconRange(state: GameState, unit: Unit): number {
  const baseVision = unit.stats.vision;
  const weatherConfig = WEATHER_CONFIGS[state.currentWeather];
  const effectiveVision = Math.max(1, baseVision + weatherConfig.visionModifier);
  return Math.min(effectiveVision, RECON_RADIUS + 2);
}

export function executeRecon(state: GameState, reconUnit: Unit, targetPosition: Position): GameState {
  if (!canUseRecon(reconUnit)) {
    console.warn('[Recon] Unit cannot use recon ability:', reconUnit.id, reconUnit.type);
    return state;
  }

  const dx = Math.abs(targetPosition.x - reconUnit.position.x);
  const dz = Math.abs(targetPosition.z - reconUnit.position.z);
  const distance = Math.max(dx, dz);
  const reconRange = getReconRange(state, reconUnit);

  if (distance > reconRange) {
    console.warn('[Recon] Target out of recon range:', distance, '>', reconRange);
    return state;
  }

  const newRevealedCells = new Set(state.revealedCells);
  const newRevealedUnits = [...state.revealedUnits];
  const unitsFound: { unitId: string; unitType: UnitType; position: Position; estimatedStrength: number }[] = [];

  for (let z = targetPosition.z - RECON_RADIUS; z <= targetPosition.z + RECON_RADIUS; z++) {
    for (let x = targetPosition.x - RECON_RADIUS; x <= targetPosition.x + RECON_RADIUS; x++) {
      if (x < 0 || x >= state.map.width || z < 0 || z >= state.map.height) continue;

      const cellKey = `${x},${z}`;
      newRevealedCells.add(cellKey);

      const cell = getCell(state.map, { x, z });
      if (cell?.unit && cell.unit.faction !== reconUnit.faction && cell.unit.isAlive) {
        const enemyUnit = cell.unit;

        if (!newRevealedUnits.includes(enemyUnit.id)) {
          newRevealedUnits.push(enemyUnit.id);
        }

        const estimatedStrength = Math.round(
          (enemyUnit.stats.attack + enemyUnit.stats.defense + enemyUnit.stats.armor) *
          (enemyUnit.stats.hp / enemyUnit.stats.maxHp) *
          (1 + enemyUnit.level * 0.15)
        );

        unitsFound.push({
          unitId: enemyUnit.id,
          unitType: enemyUnit.type,
          position: { ...enemyUnit.position },
          estimatedStrength,
        });
      }
    }
  }

  intelReportIdCounter += 1;
  const report: import('./types').IntelReport = {
    id: intelReportIdCounter,
    turn: state.turn,
    sector: { ...targetPosition },
    faction: reconUnit.faction,
    unitsFound,
    timestamp: Date.now(),
  };

  const updatedUnits = state.units.map(u => {
    if (u.id === reconUnit.id) {
      return {
        ...u,
        canMove: false,
        canAttack: false,
      };
    }
    if (unitsFound.some(found => found.unitId === u.id)) {
      return {
        ...u,
        isStealthed: false,
      };
    }
    return u;
  });

  return {
    ...state,
    units: updatedUnits,
    revealedCells: newRevealedCells,
    revealedUnits: newRevealedUnits,
    intelReports: [...state.intelReports, report],
  };
}

export function processReconDecay(state: GameState): GameState {
  if (state.turn % RECON_REVEAL_TURNS !== 0) return state;

  const expiredCells = new Set<string>();
  const stillRevealedUnits: string[] = [];

  for (const unitId of state.revealedUnits) {
    const unit = state.units.find(u => u.id === unitId);
    if (unit && unit.isAlive && unit.isStealthed === false) {
      stillRevealedUnits.push(unitId);
    }
  }

  return {
    ...state,
    revealedUnits: stillRevealedUnits,
  };
}
