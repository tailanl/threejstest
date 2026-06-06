// ===== AI 对手逻辑 - 增强版 =====

import { GameState, Unit, Position, Faction, AIDifficulty } from './types';
import { 
  getMovablePositions, getAttackablePositions, 
  moveUnit, attackUnit, endTurn, buildFortification, enterStealth, clearMinefield,
  deployReinforcement, retreatUnit,
  // v34.0: Added missing imports — AI hero abilities were non-functional without these
  executeHeroAbility, heroAbilityNeedsTarget,
  // v51.0: Added isUnitDetected — AI now respects stealth detection rules
  isUnitDetected
} from './engine';
import { TERRAIN_CONFIGS, UNIT_CONFIGS, MAP_WIDTH, MAP_HEIGHT, MORALE_CRUSH_THRESHOLD, WEATHER_CONFIGS } from './config';

/** AI 决策延迟（毫秒） */
export const AI_DELAY = 600;

/** 难度修正参数 */
const DIFFICULTY_PARAMS: Record<AIDifficulty, { 
  targetSelectionRandomness: number; 
  moveRandomness: number;
  skipAttackChance: number;
  preferLowHp: number;
  suboptimalMoveChance: number;
  considerCounterAttack: boolean;
}> = {
  easy: {
    targetSelectionRandomness: 0.7,
    moveRandomness: 0.5,
    skipAttackChance: 0.3,
    preferLowHp: 0.1,
    suboptimalMoveChance: 0.3,
    considerCounterAttack: false,
  },
  normal: {
    targetSelectionRandomness: 0.2,
    moveRandomness: 0.1,
    skipAttackChance: 0.05,
    preferLowHp: 0.5,
    suboptimalMoveChance: 0,
    considerCounterAttack: false,
  },
  hard: {
    targetSelectionRandomness: 0,
    moveRandomness: 0,
    skipAttackChance: 0,
    preferLowHp: 1.0,
    suboptimalMoveChance: 0,
    considerCounterAttack: true,
  },
};

/** 计算两个位置之间的曼哈顿距离 */
function manhattanDist(a: Position, b: Position): number {
  return Math.abs(a.x - b.x) + Math.abs(a.z - b.z);
}

/** 评估位置价值 - 增强版 */
function evaluatePosition(
  unit: Unit, pos: Position, state: GameState, allAiUnits: Unit[],
  precomputed?: { friendlyUnits?: Unit[]; enemies?: Unit[] },
): number {
  // v74.0: Compute effective attack range (matching getMovablePositions hero passive logic)
  let effectiveAttackRange = unit.stats.attackRange;
  if (unit.isHero && unit.abilities && unit.abilities.length > 0) {
    const rangeBonus = unit.abilities.find(a => a.type === 'passive' && a.effect && (a.effect as any).attackRangeBonus);
    if (rangeBonus) effectiveAttackRange += (rangeBonus.effect as any).attackRangeBonus;
  }

  let score = 0;
  
  const cell = state.map.cells[pos.z]?.[pos.x];
  if (!cell) return -100;

  const terrainConfig = TERRAIN_CONFIGS[cell.terrain];
  
  // 地形防御加成
  score += terrainConfig.stats.defenseBonus * 0.5;

  // v35.0: AI capture point strategy — infantry prefer uncontrolled nearby points
  if (state.capturePoints.length > 0) {
    for (const cp of state.capturePoints) {
      const cpDist = Math.abs(pos.x - cp.position.x) + Math.abs(pos.z - cp.position.z);
      if (cpDist <= cp.captureRadius + 1) {
        if (unit.type === 'infantry') {
          // Infantry get big bonus for being near uncontrolled or enemy-controlled points
          if (!cp.owner || cp.owner !== unit.faction) {
            score += 20; // High priority to capture
          } else {
            score += 5; // Already owned, minor defense bonus
          }
        } else {
          // Non-infantry units get smaller bonus for defending owned points
          if (cp.owner === unit.faction) {
            score += 8;
          }
        }
      }
    }
  }

  // v35.0 → v38.0: Weather awareness — use correct WEATHER_CONFIGS movement modifiers
  if (state.currentWeather && state.currentWeather !== 'clear') {
    const weatherMod = WEATHER_CONFIGS[state.currentWeather]?.movementModifier ?? 1.0;
    const effectiveCost = terrainConfig.stats.moveCost * weatherMod;
    if (effectiveCost > 1.5) {
      score -= Math.round((effectiveCost - 1) * 5); // Penalize based on actual weather-adjusted cost
    }
  }

  // === 阵型意识：保持与友军的支援距离 ===
  const friendlyUnits = precomputed?.friendlyUnits ?? allAiUnits.filter(u => u.id !== unit.id && u.isAlive);
  // v57.0: AI no longer sees undetected stealthed enemies — respects information asymmetry
  const enemies = precomputed?.enemies ?? state.units.filter(u => u.faction !== unit.faction && u.isAlive && isUnitDetected(state, u, unit.faction));
  let nearbyFriendCount = 0;
  let closestFriendlyDist = Infinity;
  
  for (const friend of friendlyUnits) {
    const dist = manhattanDist(pos, friend.position);
    if (dist <= 3) {
      nearbyFriendCount++;
    }
    closestFriendlyDist = Math.min(closestFriendlyDist, dist);
  }
  
  // 在友军2-3格内得到阵型加成
  if (nearbyFriendCount >= 1) score += nearbyFriendCount * 5;
  if (nearbyFriendCount >= 2) score += 8;
  // 太远离友军会被惩罚
  if (closestFriendlyDist > 5) score -= closestFriendlyDist * 0.5;

  // === 炮兵/火箭炮保持在后方 ===
  if (unit.type === 'artillery' || unit.type === 'mlrs') {
    // 炮兵/火箭炮应该远离前线：蓝方往右走（x越大越后）
    const filtered = friendlyUnits.filter(u => u.type !== 'artillery' && u.type !== 'mlrs');
    const frontLine = filtered.length > 0
      ? filtered.reduce((min, u) => Math.min(min, u.position.x), MAP_WIDTH)
      : unit.position.x;
    
    // 炮兵位置应该比前线更靠后
    const distFromFront = pos.x - frontLine;
    if (distFromFront >= 2) score += 15; // 在前线后面2格以上
    else if (distFromFront >= 1) score += 5;
    else score -= 20; // 太靠前，危险
    
    // v74.0: Use effectiveAttackRange for hero units
    const canAttackFromPos = enemies.some(e => manhattanDist(pos, e.position) <= effectiveAttackRange);
    if (canAttackFromPos) score += 25;
  }

  // === 防空导弹靠近友军集群 ===
  if (unit.type === 'sam') {
    const samNearbyFriendCount = friendlyUnits.filter(u => manhattanDist(pos, u.position) <= 3).length;
    score += samNearbyFriendCount * 8; // 靠近友军提供防空
    
    // SAM: prefer positions near friendly helicopters and high-value units
    const samFriendlies = friendlyUnits;
    for (const friend of samFriendlies) {
      const dist = Math.abs(pos.x - friend.position.x) + Math.abs(pos.z - friend.position.z);
      if (dist <= 2 && (friend.type === 'helicopter' || friend.type === 'artillery' || friend.type === 'mlrs')) {
        score += 12; // Bonus for shielding high-value units
      }
    }
    
    // 不应太靠前
    const filtered = friendlyUnits.filter(u => u.type !== 'sam' && u.type !== 'supply');
    const frontLine = filtered.length > 0
      ? filtered.reduce((min, u) => Math.min(min, u.position.x), MAP_WIDTH)
      : unit.position.x;
    const distFromFront = pos.x - frontLine;
    if (distFromFront < 0) score -= 15;
  }

  // === 补给车保持在后方靠近友军 ===
  if (unit.type === 'supply') {
    // 补给车应靠近受伤友军
    const injuredFriend = friendlyUnits.filter(u => u.stats.hp < u.stats.maxHp * 0.8);
    for (const friend of injuredFriend) {
      const dist = manhattanDist(pos, friend.position);
      if (dist <= 2) score += 15; // 靠近受伤友军
      else if (dist <= 4) score += 5;
    }
    // 补给车不应在前线
    const filtered = friendlyUnits.filter(u => u.type !== 'supply');
    const frontLine = filtered.length > 0
      ? filtered.reduce((min, u) => Math.min(min, u.position.x), MAP_WIDTH)
      : unit.position.x;
    const distFromFront = pos.x - frontLine;
    if (distFromFront < 0) score -= 20;
    else if (distFromFront >= 1) score += 5;
    
    // Supply truck: prefer positions near allies that have attacked (for ammo resupply)
    const attackedAllies = friendlyUnits.filter(u => !u.canAttack);
    for (const ally of attackedAllies) {
      const dist = Math.abs(pos.x - ally.position.x) + Math.abs(pos.z - ally.position.z);
      if (dist <= 2) {
        score += 10; // Bonus for being near allies that need resupply
      }
    }
  }

  // === 工程车配合前线 ===
  if (unit.type === 'engineer') {
    // 工程车应靠近前线但不在最前面
    const filtered = friendlyUnits.filter(u => u.type === 'tank' || u.type === 'ifv');
    const frontLine = filtered.length > 0
      ? filtered.reduce((min, u) => Math.min(min, u.position.x), MAP_WIDTH)
      : unit.position.x;
    const distFromFront = pos.x - frontLine;
    if (distFromFront >= 0 && distFromFront <= 2) score += 10;
    else if (distFromFront < 0) score -= 10;
    // 工程车在城市/要塞地形有加成
    if (cell.terrain === 'city' || cell.terrain === 'fortress') score += 10;
  }

  // === 武装直升机侧翼突袭 ===
  if (unit.type === 'helicopter') {
    // 直升机可以越地形，优先突袭后方脆皮
    const heliHasAmmo = (unit.stats.ammo ?? 0) > 0;
    // v77.0: Use effectiveAttackRange (matching attack phase), not raw stats
    const heliEffectiveRange = effectiveAttackRange;
    for (const enemy of enemies) {
      const dist = manhattanDist(pos, enemy.position);
      if (dist <= heliEffectiveRange && heliHasAmmo) {
        score += 35; // 直升机攻击加成高
        if (enemy.type === 'artillery' || enemy.type === 'mlrs') score += 20; // 优先攻击炮兵
        if (enemy.type === 'supply') score += 15; // 也攻击补给车
      }
    }
    // 直升机向前推进
    score += (MAP_WIDTH - 1 - pos.x) * 1.0;
    // v41.0: Avoid enemy SAM anti-air range
    const enemySamUnits = enemies.filter(e => e.type === 'sam' && e.isAlive);
    for (const sam of enemySamUnits) {
      const samDist = manhattanDist(pos, sam.position);
      const aaRange = UNIT_CONFIGS.sam.antiAirRange ?? 2;
      if (samDist <= aaRange + 1) score -= 25;
    }
  }

  // === 侦察车偏好侧翼路线 ===
  if (unit.type === 'scout') {
    // 侦察车沿上下边缘移动（z接近0或MAP_HEIGHT）
    const edgeDist = Math.min(pos.z, MAP_HEIGHT - 1 - pos.z);
    if (edgeDist <= 2) score += 10; // 沿边缘走
    
    // 侦察车向前推进
    score += (MAP_WIDTH - 1 - pos.x) * 1.5; // 蓝方向左推进
    
    // 如果能发现敌方单位（视野范围内），加分
    // v88.0: Include hero extraVision passive in effective vision range
    const effectiveVision = unit.stats.vision + (unit.isHero && unit.abilities.length > 0
      ? unit.abilities.reduce((sum, a) => sum + (a.effect.extraVision ?? 0), 0) : 0);
    for (const enemy of enemies) {
      const dist = manhattanDist(pos, enemy.position);
      if (dist <= effectiveVision) {
        score += 8; // 能看到敌人
      }
    }
  }

  // === 靠近敌方单位的分数 ===
  // v76.0: Skip attack range scoring for zero-ammo units (can't actually attack)
  const hasAmmo = (unit.stats.ammo ?? 0) > 0;
  for (const enemy of enemies) {
    const dist = manhattanDist(pos, enemy.position);
    // v74.0: Use effectiveAttackRange for hero units
    if (dist <= effectiveAttackRange && hasAmmo) {
      // 在攻击范围内得高分
      score += 30;
      // 对脆弱目标得更高分
      score += (1 - enemy.stats.hp / enemy.stats.maxHp) * 20;
    } else if (dist <= effectiveAttackRange + 2 && hasAmmo) {
      // 接近攻击范围
      score += 10;
    }
  }

  // 坦克和步战车倾向于推进到前线
  if (unit.type === 'tank' || unit.type === 'ifv') {
    // 蓝方向左推进
    score += (MAP_WIDTH - 1 - pos.x) * 0.5;
  }

  // === 步兵优先占领城市/要塞 ===
  if (unit.type === 'infantry') {
    if (cell.terrain === 'city') score += 30;
    if (cell.terrain === 'fortress') score += 35;
    // 步兵在森林中也有加成
    if (cell.terrain === 'forest') score += 10;
  }

  return score;
}

/** 计算集火优先级 - 多个AI单位集中火力攻击同一目标 */
function evaluateFocusFireTarget(target: Unit, aiUnits: Unit[], state: GameState): number {
  // v63.0: Don't score undetected stealthed enemies — would leak their position
  const aiFaction = aiUnits[0]?.faction ?? 'blue';
  if (target.isStealthed && !isUnitDetected(state, target, aiFaction)) return 0;

  let score = 0;
  
  // 已受损的目标优先级更高
  const hpRatio = target.stats.hp / target.stats.maxHp;
  score += (1 - hpRatio) * 60; // 低血量目标大幅加分
  
  // v90.0: Build fresh AI unit lookup from current state to avoid stale pre-move positions.
  // allAiUnits is captured at the start of the AI turn; units that already moved still
  // have their original positions in that array. Using state.units ensures distance
  // calculations reflect the latest positions after prior units have acted.
  const freshAiUnits = state.units.filter(u => u.faction === aiFaction && u.isAlive);
  
  // 如果一个敌人可以被击毁（多个友军能攻击到它）
  // v75.0: Use hero effective attack range for focus fire calculation
  // v89.0: Filter out units with 0 ammo from focus fire calculation
  const attackersInRange = freshAiUnits.filter(u => {
    if (!u.canAttack) return false;
    if (u.stats.ammo !== undefined && u.stats.ammo !== null && u.stats.ammo <= 0) return false;
    const dist = manhattanDist(u.position, target.position);
    let effectiveRange = u.stats.attackRange;
    if (u.isHero && u.abilities && u.abilities.length > 0) {
      const rangePassive = u.abilities.find(a => a.type === 'passive' && a.effect && (a.effect as any).attackRangeBonus);
      if (rangePassive) effectiveRange += (rangePassive.effect as any).attackRangeBonus;
    }
    return dist <= effectiveRange;
  });
  
  if (attackersInRange.length >= 2) {
    score += 30; // 多人可以集火
  }
  
  // 高攻击力敌人优先（如炮兵、坦克）
  score += target.stats.attack * 0.5;
  if (target.type === 'artillery') score += 20; // 脆弱高威胁
  if (target.type === 'mlrs') score += 20; // 火箭炮同样脆弱高威胁
  if (target.type === 'tank') score += 10;
  if (target.type === 'helicopter') score += 15; // 直升机高威胁
  if (target.type === 'supply') score += 15; // 补给车是关键后勤
  
  return score;
}

/** 评估攻击后可能受到的反击（困难模式） */
function evaluateCounterAttackRisk(attacker: Unit, targetPos: Position, state: GameState): number {
  let risk = 0;
  // v57.0: AI only considers detected enemies for counter-attack risk
  const enemies = state.units.filter(u => u.faction !== attacker.faction && u.isAlive && isUnitDetected(state, u, attacker.faction));
  
  for (const enemy of enemies) {
    // v65.0: Skip enemies that can't counter-attack (no ammo or crushed morale)
    if (enemy.stats.ammo !== undefined && enemy.stats.ammo <= 0) continue;
    if (enemy.stats.morale !== undefined && enemy.stats.morale !== null && enemy.stats.morale < MORALE_CRUSH_THRESHOLD) continue;
    const distToAttacker = manhattanDist(targetPos, enemy.position);
    // v66.0→v68.0 fix: Use correct property name matching getAttackablePositions (attackRangeBonus, not extended_range_passive)
    let effectiveRange = enemy.stats.attackRange;
    if (enemy.isHero && enemy.abilities.length > 0) {
      const rangePassive = enemy.abilities.find(a => a.type === 'passive' && (a.effect as any).attackRangeBonus);
      if (rangePassive && (rangePassive.effect as any).attackRangeBonus) effectiveRange += (rangePassive.effect as any).attackRangeBonus;
    }
    if (distToAttacker <= effectiveRange) {
      risk += enemy.stats.attack * 0.3;
      // 低血量时更危险
      if (attacker.stats.hp < attacker.stats.maxHp * 0.3) {
        risk += 20;
      }
    }
  }
  
  return risk;
}

/** AI 执行一个单位行动 - 增强版 */
function aiActUnit(state: GameState, unit: Unit, difficulty: AIDifficulty, allAiUnits: Unit[]): GameState {
  const params = DIFFICULTY_PARAMS[difficulty];
  let currentState = state;
  
  // Easy difficulty: 30% chance to make suboptimal moves
  const makeSuboptimalMove = Math.random() < params.suboptimalMoveChance;
  
  // === Engineer special: clear adjacent enemy minefields first ===
  if (unit.type === 'engineer' && unit.canMove && unit.canAttack) {
    const currentCell = currentState.map.cells[unit.position.z]?.[unit.position.x];
    // Check if engineer is standing on an enemy minefield — clear it
    if (currentCell?.hasMinefield && currentCell.minefieldOwner !== unit.faction) {
      return clearMinefield(currentState, unit);
    }
    // Check adjacent cells for enemy minefields to clear from range
    const mineDirs = [{ x: 0, z: -1 }, { x: 0, z: 1 }, { x: -1, z: 0 }, { x: 1, z: 0 }];
    for (const dir of mineDirs) {
      const adjX = unit.position.x + dir.x;
      const adjZ = unit.position.z + dir.z;
      const adjCell = currentState.map.cells[adjZ]?.[adjX];
      if (adjCell?.hasMinefield && adjCell.minefieldOwner !== unit.faction) {
        return clearMinefield(currentState, unit, { x: adjX, z: adjZ });
      }
    }
  }

  // === Engineer special: consider building fortification ===
  if (unit.type === 'engineer' && unit.canMove && unit.canAttack) {
    const currentCell = currentState.map.cells[unit.position.z]?.[unit.position.x];
    const isAlreadyFortified = currentCell?.fortified;
    
    // Check if engineer should build fortification instead of moving
    let shouldFortify = false;
    
    if (!isAlreadyFortified) {
      // Strategic position check: city, fortress, or near friendly cluster
      const isStrategicTerrain = currentCell?.terrain === 'city' || currentCell?.terrain === 'fortress';
      
      // Check for nearby friendly units (2-3 cells)
      const nearbyFriends = allAiUnits.filter(u => 
        u.id !== unit.id && u.isAlive && 
        manhattanDist(unit.position, u.position) <= 3
      ).length;
      
      // Check for enemies in immediate attack range (v57.0: respect stealth detection)
      const enemiesInRange = currentState.units.filter(u => 
        u.faction !== unit.faction && u.isAlive && isUnitDetected(currentState, u, unit.faction) &&
        manhattanDist(unit.position, u.position) <= unit.stats.attackRange
      ).length;
      
      // Build fortification if:
      // 1. On strategic terrain (city/fortress) and no immediate threats
      // 2. Near friendly cluster (3+) and not under attack
      // 3. Random 20% chance when no better action
      if (isStrategicTerrain && enemiesInRange === 0) {
        shouldFortify = true;
      } else if (nearbyFriends >= 3 && enemiesInRange === 0) {
        shouldFortify = true;
      } else if (enemiesInRange === 0 && Math.random() < 0.2) {
        shouldFortify = true;
      }
    }
    
    if (shouldFortify) {
      return buildFortification(currentState, unit);
    }
  }
  
  // === Stealth-capable units: consider entering stealth ===
  const unitConfig = UNIT_CONFIGS[unit.type];
  if (unitConfig?.canStealth && !unit.isStealthed && unit.stealthCooldown === 0 && unit.canMove && unit.canAttack) {
    const currentCell = currentState.map.cells[unit.position.z]?.[unit.position.x];
    // v52.0: shadow_stealth_passive allows stealth on ANY terrain
    const hasShadowStealth = unit.isHero && unit.abilities.some(a => a.id === 'shadow_stealth_passive');
    const stealthTerrains = ['forest', 'city', 'fortress', 'swamp', 'mountain'];
    const isOnStealthTerrain = hasShadowStealth || (currentCell && stealthTerrains.includes(currentCell.terrain));

    if (isOnStealthTerrain) {
      // v57.0: Consider entering stealth — only count detected enemies
      const nearbyEnemies = currentState.units.filter(u => 
        u.faction !== unit.faction && u.isAlive && isUnitDetected(currentState, u, unit.faction) &&
        manhattanDist(unit.position, u.position) <= 4
      ).length;
      
      const isLowHp = unit.stats.hp < unit.stats.maxHp * 0.4;
      const isScout = unit.type === 'scout';
      
      let shouldStealth = false;
      if (isLowHp && nearbyEnemies > 0) shouldStealth = true;
      if (isScout && nearbyEnemies >= 1 && Math.random() < 0.4) shouldStealth = true;
      if (nearbyEnemies >= 2 && Math.random() < 0.25) shouldStealth = true;
      if (unit.type === 'infantry' && nearbyEnemies >= 1 && currentCell?.terrain === 'forest' && Math.random() < 0.3) shouldStealth = true;
      
      if (shouldStealth) {
        const stealthState = enterStealth(currentState, unit);
        if (stealthState !== currentState) {
          // v51.0: Don't return early — free stealth preserves canMove/canAttack
          // AI hero with ghost_vision_passive can now also move/attack after stealth
          currentState = stealthState;
          const refreshedUnit = currentState.units.find(u => u.id === unit.id);
          if (refreshedUnit) unit = refreshedUnit;
        }
      }
    }
  }

  // v34.0: AI Hero Ability Usage — use active abilities before moving/attacking
  if (unit.isHero && unit.abilities && unit.canAttack && unit.isAlive) {
    const usableAbilities = unit.abilities.filter(a =>
      a.type === 'active' && a.currentCooldown === 0
    );
    if (usableAbilities.length > 0) {
      const freshHeroUnit = currentState.units.find(u => u.id === unit.id);
      if (freshHeroUnit) {
        for (const ability of usableAbilities) {
          const abilityId = ability.id;
          const needsTarget = heroAbilityNeedsTarget(abilityId);

          // Evaluate ability usage based on type
          if (abilityId === 'firestorm_active' || abilityId === 'strafing_run_active' || abilityId === 'guided_barrage_active') {
            // AOE damage abilities: use if 2+ enemies in range
            const radius = ability.effect.aoeRadius || 2;
            const enemiesInRange = currentState.units.filter(u =>
              u.isAlive && u.faction !== unit.faction &&
              isUnitDetected(currentState, u, unit.faction) &&
              Math.abs(u.position.x - unit.position.x) + Math.abs(u.position.z - unit.position.z) <= radius
            );
            if (enemiesInRange.length >= 2) {
              const targetPos = needsTarget ? enemiesInRange[0].position : undefined;
              const resultState = executeHeroAbility(currentState, freshHeroUnit, abilityId, targetPos);
              if (resultState !== currentState) {
                const resultUnit = resultState.units.find(u => u.id === unit.id);
                if (resultUnit) unit = resultUnit;
                currentState = resultState;
                return currentState;
              }
            }
          } else if (abilityId === 'assassinate_active') {
            // Assassinate: use on enemy below 50% HP for double damage
            const target = currentState.units.find(u =>
              u.isAlive && u.faction !== unit.faction &&
              isUnitDetected(currentState, u, unit.faction) &&
              u.stats.hp < u.stats.maxHp * 0.5 &&
              Math.abs(u.position.x - unit.position.x) + Math.abs(u.position.z - unit.position.z) <= (freshHeroUnit.stats.attackRange + 1)
            );
            if (target) {
              const resultState = executeHeroAbility(currentState, freshHeroUnit, abilityId, target.position);
              if (resultState !== currentState) {
                const resultUnit = resultState.units.find(u => u.id === unit.id);
                if (resultUnit) unit = resultUnit;
                currentState = resultState;
                return currentState;
              }
            }
          } else if (abilityId === 'lock_on_active') {
            // Lock on: use on high-armor enemy target
            const target = currentState.units.find(u =>
              u.isAlive && u.faction !== unit.faction &&
              isUnitDetected(currentState, u, unit.faction) &&
              u.stats.armor > 10 &&
              Math.abs(u.position.x - unit.position.x) + Math.abs(u.position.z - unit.position.z) <= (freshHeroUnit.stats.attackRange + 1)
            );
            if (target) {
              const resultState = executeHeroAbility(currentState, freshHeroUnit, abilityId, target.position);
              if (resultState !== currentState) {
                const resultUnit = resultState.units.find(u => u.id === unit.id);
                if (resultUnit) unit = resultUnit;
                currentState = resultState;
                return currentState;
              }
            }
          } else if (abilityId === 'emergency_resupply_active') {
            // Emergency resupply: use if 2+ wounded allies in range
            const radius = ability.effect.aoeRadius || 2;
            const woundedAllies = currentState.units.filter(u =>
              u.isAlive && u.faction === unit.faction && u.id !== unit.id &&
              u.stats.hp < u.stats.maxHp * 0.7 &&
              Math.abs(u.position.x - unit.position.x) + Math.abs(u.position.z - unit.position.z) <= radius
            );
            if (woundedAllies.length >= 2) {
              const resultState = executeHeroAbility(currentState, freshHeroUnit, abilityId);
              if (resultState !== currentState) {
                const resultUnit = resultState.units.find(u => u.id === unit.id);
                if (resultUnit) unit = resultUnit;
                currentState = resultState;
                return currentState;
              }
            }
          } else if (abilityId === 'fortify_active') {
            // Defensive buff: use when HP < 60%
            if (freshHeroUnit.stats.hp < freshHeroUnit.stats.maxHp * 0.6) {
              const resultState = executeHeroAbility(currentState, freshHeroUnit, abilityId);
              if (resultState !== currentState) {
                const resultUnit = resultState.units.find(u => u.id === unit.id);
                if (resultUnit) unit = resultUnit;
                currentState = resultState;
                return currentState;
              }
            }
          } else if (abilityId === 'armor_break_active') {
            // v36.0: armor_break_active is now offensive — target fortified/high-armor enemies
            const enemiesInRange = currentState.units.filter(u =>
              u.isAlive && u.faction !== unit.faction &&
              isUnitDetected(currentState, u, unit.faction) &&
              Math.abs(u.position.x - unit.position.x) + Math.abs(u.position.z - unit.position.z) <= 2
            );
            const fortifiedTarget = enemiesInRange.find(e => {
              const cell = currentState.map.cells[e.position.z]?.[e.position.x];
              return cell?.fortified;
            });
            const target = fortifiedTarget || enemiesInRange.sort((a, b) => b.stats.armor - a.stats.armor)[0];
            if (target) {
              const resultState = executeHeroAbility(currentState, freshHeroUnit, abilityId, target.position);
              if (resultState !== currentState) {
                const resultUnit = resultState.units.find(u => u.id === unit.id);
                if (resultUnit) unit = resultUnit;
                currentState = resultState;
                return currentState;
              }
            }
          } else if (abilityId === 'charge_active' || abilityId === 'flanking_maneuver_active') {
            // v39.0: Damage multiplier buff — only use when unit has NO good attack target this turn
            // The buff lasts 2 turns, so it's a preparation for next turn. Don't waste it if
            // the unit can already kill a target this turn.
            // v57.0: Account for existing tempDamageBuff (e.g., from previous charge)
            const effectiveAttack = unit.stats.attack * (unit.tempDamageBuff || 1);
            // v62.0: Respect stealth detection — only consider detected enemies
            const canAttackTarget = currentState.units.some(u =>
              u.isAlive && u.faction !== unit.faction &&
              isUnitDetected(currentState, u, unit.faction) &&
              Math.abs(u.position.x - unit.position.x) + Math.abs(u.position.z - unit.position.z) <= unit.stats.attackRange &&
              u.stats.hp < (effectiveAttack * 1.2)
            );
            if (!canAttackTarget) {
              const resultState = executeHeroAbility(currentState, freshHeroUnit, abilityId);
              if (resultState !== currentState) {
                const resultUnit = resultState.units.find(u => u.id === unit.id);
                if (resultUnit) unit = resultUnit;
                currentState = resultState;
                // v55.0: Do NOT return early — charge/flanking preserves canMove so the hero
                // can reposition after buffing. Fall through to movement phase.
              }
            }
          } else if (abilityId === 'mass_fortify_active') {
            // Mass fortify: use when 3+ nearby allies are NOT already fortified
            const radius = ability.effect.aoeRadius || 2;
            const nearbyAllies = currentState.units.filter(u => {
              if (!u.isAlive || u.faction !== unit.faction || u.id === unit.id) return false;
              if (Math.abs(u.position.x - unit.position.x) + Math.abs(u.position.z - unit.position.z) > radius) return false;
              // v73.0: Skip allies already on fortified cells (don't waste cooldown)
              const cell = currentState.map.cells[u.position.z]?.[u.position.x];
              return cell && !cell.fortified;
            });
            if (nearbyAllies.length >= 3) {
              const resultState = executeHeroAbility(currentState, freshHeroUnit, abilityId);
              if (resultState !== currentState) {
                const resultUnit = resultState.units.find(u => u.id === unit.id);
                if (resultUnit) unit = resultUnit;
                currentState = resultState;
                return currentState;
              }
            }
          } else if (abilityId === 'mark_target_active') {
            // Mark target: use to REVEAL nearby enemies that might be stealthed
            // v68.0 fix: Use proximity-based targeting regardless of detection status
            // (isUnitDetected only finds already-visible enemies, defeating the reveal purpose)
            const radius = ability.effect.extraVision || 3;
            const nearbyEnemies = currentState.units.filter(u =>
              u.isAlive && u.faction !== unit.faction &&
              Math.abs(u.position.x - unit.position.x) + Math.abs(u.position.z - unit.position.z) <= radius
            );
            // Prefer using when infantry/scout enemies are nearby (likely to be stealthed)
            const stealthSuspects = nearbyEnemies.filter(e => e.type === 'infantry' || e.type === 'scout');
            // Use if enemies nearby — reveals any hidden stealthed ones in range
            if (nearbyEnemies.length >= 1 || stealthSuspects.length >= 1) {
              const resultState = executeHeroAbility(currentState, freshHeroUnit, abilityId);
              if (resultState !== currentState) {
                const resultUnit = resultState.units.find(u => u.id === unit.id);
                if (resultUnit) unit = resultUnit;
                currentState = resultState;
                return currentState;
              }
            }
          }
        }
      }
    }
  }
  
  // 1. 移动阶段
  if (unit.canMove) {
    // v67.0: Evaluate retreat BEFORE normal movement so retreat is considered as a movement option
    const shouldRetreat = unit.stats.hp < unit.stats.maxHp * 0.3 && unit.isAlive;
    const adjacentEnemies = shouldRetreat ? currentState.units.filter(u =>
      u.faction !== unit.faction && u.isAlive && isUnitDetected(currentState, u, unit.faction) &&
      manhattanDist(unit.position, u.position) <= 1
    ) : [];
    
    // Retreat priority: supply > sam > artillery > mlrs > scout > infantry > engineer > ifv > tank
    const retreatPriority: Record<string, number> = {
      supply: 100, sam: 90, artillery: 80, mlrs: 70, scout: 50,
      infantry: 40, engineer: 30, ifv: 20, tank: 10,
    };
    const priority = retreatPriority[unit.type] || 0;
    const shouldForceRetreat = shouldRetreat && adjacentEnemies.length > 0 && priority >= 30 && Math.random() < 0.6;
    
    // v30.0→v68.0 fix: Zero-ammo units retreat toward current supply truck positions (not stale)
    const isZeroAmmo = unit.stats.ammo !== undefined && unit.stats.ammo !== null && unit.stats.ammo <= 0;
    if (isZeroAmmo && !shouldForceRetreat) {
      const currentSupplyTrucks = currentState.units.filter(a =>
        a.isAlive && a.id !== unit.id && a.faction === unit.faction && a.type === 'supply'
      );
      if (currentSupplyTrucks.length > 0) {
        const movable = getMovablePositions(currentState, unit);
        let bestPos = unit.position;
        let bestDist = Infinity;
        for (const pos of movable) {
          for (const truck of currentSupplyTrucks) {
            const d = manhattanDist(pos, truck.position);
            if (d < bestDist) {
              bestDist = d;
              bestPos = pos;
            }
          }
        }
        if (bestPos.x !== unit.position.x || bestPos.z !== unit.position.z) {
          currentState = moveUnit(currentState, unit, bestPos);
          const movedUnit = currentState.units.find(u => u.id === unit.id);
          if (movedUnit) unit = movedUnit;
        }
        // Skip normal movement for zero-ammo units
        // Update freshUnit for subsequent checks
        const updatedUnit = currentState.units.find(u => u.id === unit.id);
        if (updatedUnit) unit = updatedUnit;
        // Skip attack phase since ammo is 0
        const newUnits = currentState.units.map(u =>
          u.id === unit.id ? { ...u, canAttack: false } : u
        );
        currentState = { ...currentState, units: newUnits };
        return currentState;
      }
    }

    // v67.0: If unit should retreat (low HP + adjacent enemies + high-priority type), use retreatUnit
    if (shouldForceRetreat) {
      const retreatResult = retreatUnit(currentState, unit);
      if (retreatResult !== currentState) {
        currentState = retreatResult;
        return currentState;
      }
    }

    const movable = getMovablePositions(currentState, unit);
    
    if (movable.length > 0) {
      // Pre-compute faction unit arrays once — avoids O(n²) filtering per position
      const friendlyUnits = allAiUnits.filter(u => u.id !== unit.id && u.isAlive);
      const enemies = currentState.units.filter(u => u.faction !== unit.faction && u.isAlive && isUnitDetected(currentState, u, unit.faction));
      const precomputed = { friendlyUnits, enemies };

      // 评估每个可移动位置
      let bestPos = unit.position;
      let bestScore = evaluatePosition(unit, unit.position, currentState, allAiUnits, precomputed);
      
      const randomOffset = () => {
        if (makeSuboptimalMove) return (Math.random() - 0.5) * 80;
        return (Math.random() - 0.5) * params.moveRandomness * 50;
      };
      
      for (const pos of movable) {
        let score = evaluatePosition(unit, pos, currentState, allAiUnits, precomputed) + randomOffset();
        
        // Hard difficulty: consider counter-attack risk after moving
        if (params.considerCounterAttack) {
          const risk = evaluateCounterAttackRisk(unit, pos, currentState);
          score -= risk;
        }
        
        // Avoid enemy HE splash zones
        const enemyArtillery = currentState.units.filter(e => 
          e.isAlive && e.faction !== unit.faction && (e.type === 'artillery' || e.type === 'mlrs') && e.canAttack &&
          isUnitDetected(currentState, e, unit.faction)
        );
        for (const art of enemyArtillery) {
          const dist = Math.abs(pos.x - art.position.x) + Math.abs(pos.z - art.position.z);
          // v88.0: Include hero attackRangeBonus in effective artillery range
          const heroRangeBonus = art.isHero && art.abilities.length > 0
            ? art.abilities.reduce((sum, a) => sum + (a.effect.attackRangeBonus ?? 0), 0) : 0;
          const artRange = art.stats.attackRange + heroRangeBonus;
          if (dist <= artRange) {
            // v88.0: Scale penalty by weather attack modifier (reduced damage in bad weather)
            const weatherMod = WEATHER_CONFIGS[currentState.currentWeather]?.attackModifier ?? 1.0;
            score -= Math.round(20 * weatherMod); // Penalize being in artillery range
            // Extra penalty if other friendly units are nearby (cluster splash vulnerability)
            const nearbyFriendlies = allAiUnits.filter(u =>
              u.isAlive && u.id !== unit.id &&
              Math.abs(u.position.x - pos.x) + Math.abs(u.position.z - pos.z) <= 1
            );
            if (nearbyFriendlies.length > 0) {
              score -= nearbyFriendlies.length * 5;
            }
          }
        }
        
        if (score > bestScore) {
          bestScore = score;
          bestPos = pos;
        }
      }
      
      if (bestPos.x !== unit.position.x || bestPos.z !== unit.position.z) {
        currentState = moveUnit(currentState, unit, bestPos);
        const movedUnit = currentState.units.find(u => u.id === unit.id);
        if (movedUnit) unit = movedUnit;
      } else {
        const newUnits = currentState.units.map(u => 
          u.id === unit.id ? { ...u, canMove: false } : u
        );
        currentState = { ...currentState, units: newUnits, selectedUnit: null, movablePositions: [], attackablePositions: [] };
      }
    }
  }

  // 2. 攻击阶段
  // Ammo check: skip units with 0 ammo
  if (unit.canAttack && unit.isAlive && unit.stats.ammo !== undefined && unit.stats.ammo !== null && unit.stats.ammo <= 0) {
    const newUnits = currentState.units.map(u => 
      u.id === unit.id ? { ...u, canAttack: false } : u
    );
    return { ...currentState, units: newUnits };
  }
  // Morale check: panicked units cannot attack
  if (unit.canAttack && unit.isAlive && unit.stats.morale !== undefined && unit.stats.morale !== null && unit.stats.morale < MORALE_CRUSH_THRESHOLD) {
    const newUnits = currentState.units.map(u => 
      u.id === unit.id ? { ...u, canAttack: false } : u
    );
    return { ...currentState, units: newUnits };
  }

  if (unit.canAttack && unit.isAlive) {
    const attackable = getAttackablePositions(currentState, unit);
    
    if (attackable.length > 0) {
      // Easy difficulty: sometimes skip attack
      if (Math.random() < params.skipAttackChance) {
        const newUnits = currentState.units.map(u => 
          u.id === unit.id ? { ...u, canAttack: false } : u
        );
        currentState = { ...currentState, units: newUnits };
      } else {
        // 选择目标 - 集火优先级计算
        let bestTarget = attackable[0];
        let bestPriority = -Infinity;
        
        for (const targetPos of attackable) {
          const target = currentState.units.find(u => 
            u.position.x === targetPos.x && u.position.z === targetPos.z && u.isAlive && u.faction !== unit.faction
          );
          if (!target) continue;
          
          // 综合优先级：低血量 + 高威胁 + 集火加成 + 装甲克制
          let priority = 0;
          
          // v57.0: Weather attack penalty reduces effective damage — deprioritize attacks in bad weather
          if (currentState.currentWeather && currentState.currentWeather !== 'clear') {
            const weatherAtkMod = WEATHER_CONFIGS[currentState.currentWeather]?.attackModifier ?? 1.0;
            if (weatherAtkMod < 1.0) {
              // Reduce priority proportionally to weather penalty (e.g., 0.8x → -20 priority)
              priority -= Math.round((1 - weatherAtkMod) * 60);
            }
          }
          
          // 基础优先级：低血量目标
          priority += (1 - target.stats.hp / target.stats.maxHp) * 40 * params.preferLowHp;
          
          // 高攻击力优先
          priority += target.stats.attack * 0.5;
          
          // 装甲克制：如果自身穿甲高，优先攻击高装甲目标；穿甲低则避开
          const effectiveArmor = Math.max(0, target.stats.armor - unit.stats.armorPenetration);
          const armorReduction = effectiveArmor / (effectiveArmor + 50);
          if (armorReduction < 0.15) {
            // 自身穿甲能有效击穿目标装甲，优先攻击
            priority += 8;
          } else if (armorReduction > 0.3) {
            // 自身穿甲无法有效击穿，降低优先级（除非是HE武器高攻击）
            const unitConfig = UNIT_CONFIGS[unit.type];
            if (unitConfig?.damageType !== 'he') {
              priority -= 10;
            }
          }
          
          // 类型加成
          priority += target.type === 'artillery' ? 15 : 0;
          priority += target.type === 'mlrs' ? 15 : 0;
          priority += target.type === 'tank' ? 10 : 0;
          priority += target.type === 'helicopter' ? 12 : 0;
          priority += target.type === 'supply' ? 12 : 0;
          
          // HE splash bonus: prefer targets with clustered enemies
          if (unit.type === 'artillery' || unit.type === 'mlrs') {
            // v57.0: HE splash bonus — only count detected enemies
            const allEnemies = currentState.units.filter(u => u.faction !== unit.faction && u.isAlive && isUnitDetected(currentState, u, unit.faction));
            const adjacentEnemies = allEnemies.filter(e =>
              e.isAlive && e.id !== target.id &&
              Math.abs(e.position.x - target.position.x) + Math.abs(e.position.z - target.position.z) <= 1
            );
            if (adjacentEnemies.length > 0) {
              priority += adjacentEnemies.length * 15; // Bonus per splash target
            }
          }
          
          // 集火加成：如果该目标已被其他AI单位标记或已被攻击
          priority += evaluateFocusFireTarget(target, allAiUnits, currentState) * 0.3;
          
          // Hard difficulty: consider counter-attack risk
          if (params.considerCounterAttack) {
            const counterRisk = evaluateCounterAttackRisk(unit, targetPos, currentState);
            priority -= counterRisk * 0.2;
          }
          
          // Add randomness for easier difficulties
          priority += (Math.random() - 0.5) * params.targetSelectionRandomness * 50;
          
          if (priority > bestPriority) {
            bestPriority = priority;
            bestTarget = targetPos;
          }
        }
        
        currentState = attackUnit(currentState, unit, bestTarget);
        // v51.0: AI hit_and_run_passive — scout hero can move after attacking
        const afterAttackUnit = currentState.units.find(u => u.id === unit.id);
        if (afterAttackUnit && afterAttackUnit.canMove && afterAttackUnit.isHero &&
            afterAttackUnit.abilities.some(a => a.id === 'hit_and_run_passive')) {
          const movableAfter = getMovablePositions(currentState, afterAttackUnit);
          if (movableAfter.length > 0) {
            // v58.0: Move to the best defensive position — only consider detected enemies
            const enemies = currentState.units.filter(u => u.isAlive && u.faction !== afterAttackUnit.faction && isUnitDetected(currentState, u, afterAttackUnit.faction));
            let bestMovePos = movableAfter[0];
            let bestSafety = 0;
            for (const pos of movableAfter) {
              const minEnemyDist = Math.min(...enemies.map(e =>
                Math.abs(e.position.x - pos.x) + Math.abs(e.position.z - pos.z)
              ), 99);
              if (minEnemyDist > bestSafety) {
                bestSafety = minEnemyDist;
                bestMovePos = pos;
              }
            }
            if (bestMovePos) {
              currentState = moveUnit(currentState, afterAttackUnit, bestMovePos);
            }
          }
        }
      }
    } else {
      const newUnits = currentState.units.map(u => 
        u.id === unit.id ? { ...u, canAttack: false } : u
      );
      currentState = { ...currentState, units: newUnits };
    }
  }
  
  return currentState;
}

/** AI 执行完整回合 - 增强版 */
export function aiExecuteTurn(state: GameState): GameState {
  const difficulty = state.aiDifficulty || 'normal';
  let currentState = { ...state };
  
  // 获取所有AI单位 (use currentFaction instead of hardcoded 'blue' for correctness)
  const aiFaction = currentState.currentFaction;
  const allAiUnits = currentState.units.filter(u => u.faction === aiFaction && u.isAlive);
  
  // 排序：更智能的行动顺序
  const aiUnits = allAiUnits.slice().sort((a, b) => {
    // 新排序优先级：侦察先动 > 直升机 > 步战车 > 坦克 > 工程车 > 步兵 > 防空 > 炮兵 > 火箭炮 > 补给车
    const priority: Record<string, number> = {
      scout: 10, helicopter: 9, ifv: 8, tank: 7, engineer: 6, infantry: 5, sam: 4, artillery: 3, mlrs: 2, supply: 1
    };
    return (priority[b.type] || 0) - (priority[a.type] || 0);
  });
  
  for (const unit of aiUnits) {
    if (currentState.phase === 'gameOver') break;
    
    // v38.0: Skip helicopter MOVEMENT during sandstorm (can't move, but CAN still attack grounded targets)
    const isGroundedHeli = unit.type === 'helicopter' && currentState.currentWeather === 'sandstorm';
    if (isGroundedHeli) {
      // v74.0: Don't skip entirely — still allow attack if enemies in range
      const currentUnitForAttack = currentState.units.find(u => u.id === unit.id);
      if (currentUnitForAttack && currentUnitForAttack.isAlive && currentUnitForAttack.canAttack && (currentUnitForAttack.stats.ammo ?? 0) > 0) {
        const attackPositions = getAttackablePositions(currentState, currentUnitForAttack);
        if (attackPositions.length > 0) {
          currentState = aiActUnit(currentState, currentUnitForAttack, difficulty,
            currentState.units.filter(u => u.faction === aiFaction && u.isAlive));
        }
      }
      continue;
    }
    
    const currentUnit = currentState.units.find(u => u.id === unit.id);
    if (currentUnit && currentUnit.isAlive) {
      currentState = aiActUnit(currentState, currentUnit, difficulty, 
        currentState.units.filter(u => u.faction === aiFaction && u.isAlive));
      if (currentState.phase === 'gameOver') break;
    }
  }
  
  if (currentState.phase === 'gameOver') {
    return currentState;
  }
  
  // === AI Reinforcement Deployment ===
  const aiReinforcements = currentState.reinforcements?.[aiFaction] ?? [];
  if (aiReinforcements.length > 0) {
    // Try to deploy each reinforcement near friendly units in safe positions
    const aiUnits = currentState.units.filter(u => u.faction === aiFaction && u.isAlive);
    const enemyFaction = aiFaction === 'blue' ? 'red' : 'blue';
    for (let i = aiReinforcements.length - 1; i >= 0; i--) {
      const rein = aiReinforcements[i];
      let deployed = false;
      
      // Find safe cells near friendly units (behind front line)
      const frontLineX = aiUnits.reduce((min, u) => Math.min(min, u.position.x), MAP_WIDTH);
      for (const friend of aiUnits) {
        if (deployed) break;
        // Prefer cells behind the front line
        const candidates: Position[] = [];
        for (let dz = -2; dz <= 2; dz++) {
          for (let dx = -2; dx <= 2; dx++) {
            const nx = friend.position.x + dx;
            const nz = friend.position.z + dz;
            if (nx < 0 || nx >= MAP_WIDTH || nz < 0 || nz >= MAP_HEIGHT) continue;
            // Must be behind front line (higher x) or in deployment zone
            if (nx < frontLineX - 1 && nx < Math.floor(MAP_WIDTH * 0.8)) continue;
            const cell = currentState.map.cells[nz]?.[nx];
            if (!cell || cell.unit || cell.hasMinefield) continue;
            if (!TERRAIN_CONFIGS[cell.terrain].stats.isPassable) continue;
            const isVehicle = UNIT_CONFIGS[rein.type]?.isVehicle ?? false;
            const isHelicopter = rein.type === 'helicopter';
            if (!isHelicopter && isVehicle && !TERRAIN_CONFIGS[cell.terrain].stats.isPassableByVehicle) continue;
            if (isHelicopter && cell.terrain === 'water') continue;
            // Check no enemies adjacent (v60.0: respect stealth detection)
            const hasEnemyNearby = currentState.units.some(e =>
              e.faction === enemyFaction && e.isAlive &&
              isUnitDetected(currentState, e, aiFaction) &&
              Math.abs(e.position.x - nx) + Math.abs(e.position.z - nz) <= 2
            );
            if (!hasEnemyNearby) {
              candidates.push({ x: nx, z: nz });
            }
          }
        }
        if (candidates.length > 0) {
          // Sort by distance from front line (prefer further back)
          candidates.sort((a, b) => b.x - a.x);
          const deployPos = candidates[0];
          const newState = deployReinforcement(currentState, rein.type, aiFaction, deployPos);
          if (newState !== currentState) {
            currentState = newState;
            deployed = true;
          }
        }
      }
    }
  }
  
  // v55.0 moved supply healing into endTurn() — each faction heals once at their turn start.
  // v57.0: Removed duplicate processSupplyHealing here (was causing blue to heal 2x/round).
  currentState = endTurn(currentState);
  
  return currentState;
}
