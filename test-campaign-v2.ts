/**
 * Campaign V2 — 战略元素增强: 迂回/包围/增援/补给/多回合战役
 *
 * 战略架构:
 *   - 32×32 战略格子 (来自 WorldAtlas StrategicChunks)
 *   - 每回合可行动: MOVE / ATTACK / FLANK / ENCIRCLE / REINFORCE
 *   - 包围/迂回在战术战斗中获得加成
 *   - 增援按时间/条件触发
 *   - 补给线被切断降低战力
 *
 * 用法: npx tsx test-campaign-v2.ts --llm
 */

import { generateWorldAtlas } from './src/game/world-atlas/macro-map-generator';
import { generateRegionTile } from './src/game/world-atlas/region-tile-generator';
import { DEBUG_WORLD_ATLAS_CONFIG } from './src/game/world-atlas/atlas-config';
import { getOperationViewForChunk } from './src/game/world-view/operation-view';
import { getCombatViewportFromOperationCell } from './src/game/world-view/combat-viewport';
import { convertCombatViewportToGameMap } from './src/game/world-view/world-to-game-map';
import { createUnit, initGameStateFromMap, getMovablePositions, getAttackablePositions, moveUnit, attackUnit, endTurn } from './src/game/engine';
import type { WorldAtlasConfig } from './src/game/world-atlas/atlas-config';
import type { RegionTile } from './src/game/world-map/world-map-types';
import type { StrategicChunk } from './src/game/world-view/strategic-chunks';
import type { GameMap, GameState, Unit, UnitType, Position, Faction } from './src/game/types';
import type { BattleLogEvent, AIReport } from './src/game/reports/report-types';
import * as fs from 'fs';

const USE_LLM = process.argv.includes('--llm');
const SEED = parseInt(process.argv.find(a => a.startsWith('--seed='))?.split('=')[1] ?? String(Date.now() % 100000));
const SEP = '═'.repeat(72);
const MINOR = '─'.repeat(48);

// 加载规范文件
let REPORT_SPEC = '', STRATEGY_SPEC = '';
try { REPORT_SPEC = fs.readFileSync('docs/REPORT_FORMAT_SPEC.md', 'utf-8'); } catch {}
try { STRATEGY_SPEC = fs.readFileSync('docs/STRATEGY_DECISION_SPEC.md', 'utf-8'); } catch {}
if (REPORT_SPEC) console.log('  已加载报告格式规范');
if (STRATEGY_SPEC) console.log('  已加载策略决策规范');

// ============================================================
// 战略层数据类型
// ============================================================
interface StrategicTile {
  x: number; y: number;
  chunk: StrategicChunk;
  terrain: string; defenseBonus: number;
  isCity: boolean; isRoad: boolean; isRiver: boolean; isBridge: boolean;
  supplyValue: number; vpValue: number;
  control: Faction | null;
  fortification: number; // 0-100, fortified bonus
}

interface StrategicForce {
  id: string; name: string; faction: Faction;
  units: Array<{ type: UnitType; count: number; namePrefix: string }>;
  sector: { x: number; y: number };
  morale: number; supply: number; // 0-100
  originalStrength: number; currentStrength: number;
  mission: string;
}

interface StrategicAction {
  type: 'MOVE' | 'ATTACK' | 'FLANK' | 'REINFORCE' | 'HOLD';
  forceId: string;
  targetSector?: { x: number; y: number };
  flankFrom?: { x: number; y: number };
  description: string;
}

interface CampaignState {
  tiles: StrategicTile[][];
  width: number; height: number;
  regionTile: RegionTile;
  redForces: StrategicForce[];
  blueForces: StrategicForce[];
  turn: number;
  redReinforcementPool: number;
  blueReinforcementPool: number;
  actions: StrategicAction[];
  battleHistory: BattleRecord[];
}

interface BattleRecord {
  sector: string; turn: number;
  redForce: string; blueForce: string;
  redStart: number; blueStart: number;
  redAlive: number; blueAlive: number;
  redKills: number; blueKills: number;
  redDamage: number; blueDamage: number;
  winner: Faction | 'draw';
  flankBonus: boolean; encircleBonus: boolean;
  events: BattleLogEvent[];
  intelReport: string; bdaReport: string;
}

// ============================================================
// 部队配置
// ============================================================
const RED_ORDER_OF_BATTLE: Array<Omit<StrategicForce, 'sector' | 'currentStrength'>> = [
  {
    id: '红A-装甲先锋', name: '装甲先锋', faction: 'red',
    units: [{ type: 'tank', count: 3, namePrefix: '虎' }, { type: 'ifv', count: 2, namePrefix: '游' }, { type: 'infantry', count: 2, namePrefix: '步' }, { type: 'scout', count: 1, namePrefix: '鹰' }],
    morale: 100, supply: 100, originalStrength: 8,
    mission: '从正面施压，牵制敌军主力',
  },
  {
    id: '红B-合成战斗群', name: '主攻战斗群', faction: 'red',
    units: [{ type: 'tank', count: 4, namePrefix: '虎' }, { type: 'ifv', count: 2, namePrefix: '游' }, { type: 'infantry', count: 3, namePrefix: '铁' }, { type: 'artillery', count: 1, namePrefix: '雷' }, { type: 'sam', count: 1, namePrefix: '天' }],
    morale: 100, supply: 100, originalStrength: 11,
    mission: '伺机包围城市，切断敌军退路',
  },
  {
    id: '红C-快速纵队', name: '快速纵队', faction: 'red',
    units: [{ type: 'tank', count: 2, namePrefix: '豹' }, { type: 'ifv', count: 2, namePrefix: '游' }, { type: 'infantry', count: 1, namePrefix: '步' }, { type: 'scout', count: 1, namePrefix: '鹰' }],
    morale: 100, supply: 100, originalStrength: 6,
    mission: '迂回侧翼，与主攻部队形成包围',
  },
];

const BLUE_ORDER_OF_BATTLE: Array<Omit<StrategicForce, 'sector' | 'currentStrength'>> = [
  {
    id: '蓝A-城市守备', name: '城市守备队', faction: 'blue',
    units: [{ type: 'tank', count: 2, namePrefix: 'M1' }, { type: 'atgm', count: 3, namePrefix: '标' }, { type: 'infantry', count: 3, namePrefix: '守' }, { type: 'engineer', count: 1, namePrefix: '工' }],
    morale: 100, supply: 100, originalStrength: 9,
    mission: '死守城市核心区',
  },
  {
    id: '蓝B-外围防线', name: '外围防御群', faction: 'blue',
    units: [{ type: 'tank', count: 1, namePrefix: 'M1' }, { type: 'ifv', count: 2, namePrefix: '布' }, { type: 'infantry', count: 2, namePrefix: '守' }, { type: 'atgm', count: 2, namePrefix: '标' }],
    morale: 100, supply: 100, originalStrength: 7,
    mission: '在城外迟滞敌军',
  },
  {
    id: '蓝C-预备队', name: '机动预备队', faction: 'blue',
    units: [{ type: 'tank', count: 1, namePrefix: 'M1' }, { type: 'ifv', count: 2, namePrefix: '布' }, { type: 'infantry', count: 2, namePrefix: '步' }],
    morale: 100, supply: 100, originalStrength: 5,
    mission: '随时增援危急方向',
  },
];

// ============================================================
// 战略地图初始化
// ============================================================
function initCampaign(): CampaignState {
  const atlasConfig: WorldAtlasConfig = { ...DEBUG_WORLD_ATLAS_CONFIG, seed: SEED };
  const atlas = generateWorldAtlas(atlasConfig);
  const regionTile = generateRegionTile(atlas, 0, 0);
  const chunks = regionTile.strategicChunks;
  const h = chunks.length, w = chunks[0]?.length ?? 0;

  const tiles: StrategicTile[][] = [];
  for (let y = 0; y < h; y++) {
    tiles[y] = [];
    for (let x = 0; x < w; x++) {
      const c = chunks[y][x];
      tiles[y][x] = {
        x, y, chunk: c,  control: null, fortification: 0,
        terrain: c.dominantTerrain,
        defenseBonus: c.strategicValue.defense,
        isCity: c.features.hasCity, isRoad: c.features.hasMainRoad,
        isRiver: c.features.hasRiver, isBridge: c.features.hasBridge,
        supplyValue: c.strategicValue.supply, vpValue: c.strategicValue.victoryPoint,
      };
    }
  }

  // 找到目标城市 (蓝方核心防守区)
  const allCities = tiles.flat().filter(t => t.isCity && t.defenseBonus > 0.2);
  allCities.sort((a, b) => b.vpValue - a.vpValue);
  const city = allCities[0] ?? tiles[Math.floor(h * 0.6)][Math.floor(w * 0.7)];

  // 红方起始位置 (左半侧，三个不同出发点)
  const rA = tiles[Math.floor(h * 0.25)][Math.floor(w * 0.15)];
  const rB = tiles[Math.floor(h * 0.50)][Math.floor(w * 0.12)];
  const rC = tiles[Math.floor(h * 0.70)][Math.floor(w * 0.18)];

  // 蓝方部署
  const bB = tiles[Math.floor(h * 0.35)][Math.floor(w * 0.55)]; // 外围防线
  const bC = tiles[Math.floor(h * 0.55)][Math.floor(w * 0.45)]; // 预备队位置

  // 设置控制权
  city.control = 'blue'; city.fortification = 60;
  bB.control = 'blue'; bB.fortification = 30;
  bC.control = 'blue';
  rA.control = 'red'; rB.control = 'red'; rC.control = 'red';

  const redForces: StrategicForce[] = [
    { ...RED_ORDER_OF_BATTLE[0], sector: { x: rA.x, y: rA.y }, currentStrength: RED_ORDER_OF_BATTLE[0].originalStrength },
    { ...RED_ORDER_OF_BATTLE[1], sector: { x: rB.x, y: rB.y }, currentStrength: RED_ORDER_OF_BATTLE[1].originalStrength },
    { ...RED_ORDER_OF_BATTLE[2], sector: { x: rC.x, y: rC.y }, currentStrength: RED_ORDER_OF_BATTLE[2].originalStrength },
  ];

  const blueForces: StrategicForce[] = [
    { ...BLUE_ORDER_OF_BATTLE[0], sector: { x: city.x, y: city.y }, currentStrength: BLUE_ORDER_OF_BATTLE[0].originalStrength },
    { ...BLUE_ORDER_OF_BATTLE[1], sector: { x: bB.x, y: bB.y }, currentStrength: BLUE_ORDER_OF_BATTLE[1].originalStrength },
    { ...BLUE_ORDER_OF_BATTLE[2], sector: { x: bC.x, y: bC.y }, currentStrength: BLUE_ORDER_OF_BATTLE[2].originalStrength },
  ];

  console.log(`  城市位置: (${city.x},${city.y}) [${city.terrain}] VP=${city.vpValue.toFixed(2)}`);
  console.log(`  红方出发: A(${rA.x},${rA.y}) B(${rB.x},${rB.y}) C(${rC.x},${rC.y})`);
  console.log(`  蓝方部署: 城市(${city.x},${city.y}) 外围(${bB.x},${bB.y}) 预备(${bC.x},${bC.y})`);

  return {
    tiles, width: w, height: h, regionTile,
    redForces, blueForces, turn: 0,
    redReinforcementPool: 6, blueReinforcementPool: 8,
    actions: [], battleHistory: [],
  };
}

// ============================================================
// 移动/包围检测
// ============================================================
function dist(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
}

function isEncirclement(campaign: CampaignState, targetSector: { x: number; y: number }, attackerFaction: Faction): boolean {
  const dirs = [[-1,0],[1,0],[0,-1],[0,1]];
  let surrounded = 0;
  for (const [dx, dy] of dirs) {
    const nx = targetSector.x + dx, ny = targetSector.y + dy;
    if (nx >= 0 && nx < campaign.width && ny >= 0 && ny < campaign.height) {
      if (campaign.tiles[ny][nx].control === attackerFaction) surrounded++;
    }
  }
  return surrounded >= 3; // 被3个方向包围
}

function isFlank(campaign: CampaignState, attacker: StrategicForce, defender: StrategicForce): boolean {
  // 迂回: 攻击方从侧面(非最短路径)接近
  const directDist = dist(attacker.sector, defender.sector);
  const altPaths = campaign.redForces.filter(f =>
    f.id !== attacker.id && dist(f.sector, defender.sector) <= 3
  );
  return altPaths.length >= 1 && directDist >= 4;
}

// ============================================================
// 战略回合执行
// ============================================================
async function executeStrategicTurn(campaign: CampaignState): Promise<CampaignState> {
  campaign.turn++;
  console.log(`\n${MINOR}`);
  console.log(`  第 ${campaign.turn} 回合 — 战略阶段`);
  console.log(`${MINOR}`);

  const actions: StrategicAction[] = [];

  // 蓝方战略决策: 机动预备队增援危险方向
  const blueReserve = campaign.blueForces.find(f => f.id === '蓝C-预备队')!;
  const blueCity = campaign.blueForces.find(f => f.id === '蓝A-城市守备')!;
  const blueOuter = campaign.blueForces.find(f => f.id === '蓝B-外围防线')!;

  // 红方战略: 逐步推进
  const redA = campaign.redForces.find(f => f.id === '红A-装甲先锋')!;
  const redB = campaign.redForces.find(f => f.id === '红B-合成战斗群')!;
  const redC = campaign.redForces.find(f => f.id === '红C-快速纵队')!;

  // === 回合1: 红方推进, 建立接触 ===
  if (campaign.turn === 1) {
    // 红A 向 蓝B 推进
    actions.push({ type: 'MOVE', forceId: redA.id, targetSector: blueOuter.sector, description: `${redA.name} 向蓝方外围防线推进` });
    // 红B 向城市方向机动
    const midSector = campaign.tiles[Math.floor((redB.sector.y + blueCity.sector.y) / 2)][Math.floor((redB.sector.x + blueCity.sector.x) / 2)];
    actions.push({ type: 'MOVE', forceId: redB.id, targetSector: { x: midSector.x, y: midSector.y }, description: `${redB.name} 向城市方向机动` });
    // 红C 开始迂回
    const flankSector = campaign.tiles[blueOuter.sector.y + 2]?.[Math.max(0, blueOuter.sector.x - 3)];
    if (flankSector) actions.push({ type: 'FLANK', forceId: redC.id, targetSector: { x: flankSector.x, y: flankSector.y }, description: `${redC.name} 开始侧翼迂回` });
  }

  // === 回合2: 发起进攻 ===
  if (campaign.turn === 2) {
    const encircleCheck = isEncirclement(campaign, blueOuter.sector, 'red');
    actions.push({
      type: 'ATTACK', forceId: redA.id, targetSector: blueOuter.sector,
      description: `${redA.name} 对蓝方外围防线发动${encircleCheck ? '【包围】' : ''}进攻`,
    });
    if (redC.sector !== null) {
      const flankCheck = isFlank(campaign, redC, blueOuter);
      actions.push({
        type: 'ATTACK', forceId: redC.id, targetSector: blueOuter.sector,
        description: `${redC.name} 从侧翼${flankCheck ? '【迂回】' : ''}攻击蓝方外围防线`,
      });
    }
  }

  // === 回合3: 城市攻坚 ===
  if (campaign.turn === 3) {
    const blueOuterAlive = campaign.battleHistory.filter(b => b.turn === 2 && b.winner !== 'red').length === 0;
    if (blueOuterAlive || campaign.turn >= 3) {
      const cityEncircle = isEncirclement(campaign, blueCity.sector, 'red');
      actions.push({
        type: 'ATTACK', forceId: redB.id, targetSector: blueCity.sector,
        description: `${redB.name} 向城市发动${cityEncircle ? '【包围强攻】' : '正面进攻'}`,
      });
    }
    // 蓝方预备队增援
    if (blueReserve.currentStrength > 0) {
      actions.push({ type: 'MOVE', forceId: blueReserve.id, targetSector: blueCity.sector, description: `${blueReserve.name} 紧急驰援城市` });
    }
  }

  // === 回合4+: 持续进攻/增援 ===
  if (campaign.turn >= 4) {
    // 蓝方增援到达
    if (campaign.blueReinforcementPool > 0) {
      const reinfCount = Math.min(3, campaign.blueReinforcementPool);
      campaign.blueReinforcementPool -= reinfCount;
      blueCity.currentStrength = Math.min(blueCity.originalStrength, blueCity.currentStrength + reinfCount);
      actions.push({ type: 'REINFORCE', forceId: blueCity.id, description: `蓝方增援 ${reinfCount} 单位到达城市 (剩余池:${campaign.blueReinforcementPool})` });
    }
    // 红方继续进攻
    if (campaign.redReinforcementPool > 0 && campaign.turn % 2 === 0) {
      const rrf = Math.min(2, campaign.redReinforcementPool);
      campaign.redReinforcementPool -= rrf;
      redB.currentStrength = Math.min(redB.originalStrength, redB.currentStrength + rrf);
      actions.push({ type: 'REINFORCE', forceId: redB.id, description: `红方增援 ${rrf} 单位补充主攻部队 (剩余池:${campaign.redReinforcementPool})` });
    }
    actions.push({ type: 'ATTACK', forceId: redB.id, targetSector: blueCity.sector, description: `${redB.name} 持续进攻城市` });
  }

  campaign.actions = actions;

  for (const a of actions) {
    console.log(`    [${a.type}] ${a.description}`);
  }

  return campaign;
}

// ============================================================
// 战术战斗 (含包围/迂回加成)
// ============================================================
async function runBattle(
  regionTile: RegionTile,
  campaign: CampaignState,
  attackForces: StrategicForce[],
  defendForce: StrategicForce,
  hasFlank: boolean,
  hasEncircle: boolean,
): Promise<BattleRecord> {
  const chunk = campaign.tiles[defendForce.sector.y][defendForce.sector.x].chunk;
  const opView = getOperationViewForChunk(regionTile, chunk, 128);
  const cx = opView.worldRect.x + Math.floor(opView.worldRect.width / 2);
  const cy = opView.worldRect.y + Math.floor(opView.worldRect.height / 2);
  const viewport = getCombatViewportFromOperationCell({ regionTile, cellPosition: { globalX: cx, globalY: cy }, width: 16, height: 12 });
  let gameMap = convertCombatViewportToGameMap(viewport);

  let state = initGameStateFromMap(gameMap, 'normal');
  state = { ...state, units: [], map: { ...state.map, cells: state.map.cells.map(r => r.map(c => ({ ...c, unit: null }))) } };

  // 合并所有攻击方部队
  let totalRed = 0, totalBlue = 0;
  let idCounter = 0;

  for (const force of attackForces) {
    for (const u of force.units) {
      for (let i = 0; i < Math.min(u.count, force.currentStrength); i++) {
        let pos: Position; let tries = 0;
        do { pos = { x: 4 + Math.floor(Math.random() * 3), z: 2 + Math.floor(Math.random() * 9) }; tries++; }
        while (tries < 20 && (state.map.cells[pos.z]?.[pos.x]?.terrain === 'water' || state.map.cells[pos.z]?.[pos.x]?.unit));
        const unit = createUnit(u.type, 'red', pos);
        unit.name = `${u.namePrefix}-${++idCounter}`;
        // 包围加成: +15% attack
        if (hasEncircle) { unit.stats.attack = Math.round(unit.stats.attack * 1.15); unit.stats.armorPenetration = Math.round(unit.stats.armorPenetration * 1.10); }
        // 迂回加成: +20% move
        if (hasFlank) { unit.stats.moveRange += 1; }
        state.units.push(unit);
        const c = state.map.cells[pos.z]?.[pos.x]; if (c) c.unit = unit;
        totalRed++;
      }
    }
  }

  // 防守方部署
  for (const u of defendForce.units) {
    for (let i = 0; i < Math.min(u.count, defendForce.currentStrength); i++) {
      let pos: Position; let tries = 0;
      do { pos = { x: 9 + Math.floor(Math.random() * 2), z: 2 + Math.floor(Math.random() * 9) }; tries++; }
      while (tries < 20 && (state.map.cells[pos.z]?.[pos.x]?.terrain === 'water' || state.map.cells[pos.z]?.[pos.x]?.unit));
      const unit = createUnit(u.type, 'blue', pos);
      unit.name = `${u.namePrefix}-${++idCounter}`;
      // 城市防守加成: terrain defense from the sector
      const tileDef = campaign.tiles[defendForce.sector.y][defendForce.sector.x].fortification / 20;
      unit.stats.defense = Math.round(unit.stats.defense * (1 + tileDef * 0.1));
      state.units.push(unit);
      const c = state.map.cells[pos.z]?.[pos.x]; if (c) c.unit = unit;
      totalBlue++;
    }
  }

  const events: BattleLogEvent[] = [];
  const isAttacker = attackForces.find(f => f.faction === 'red')!;
  const redMission = attackForces.map(f => f.mission).join('; ');
  const blueMission = defendForce.mission;

  for (let turn = 0; turn < 8; turn++) {
    const ra = state.units.filter(u => u.faction === 'red' && u.isAlive).length;
    const ba = state.units.filter(u => u.faction === 'blue' && u.isAlive).length;
    if (ra === 0 || ba === 0) break;

    const faction = state.currentFaction;
    const mission = faction === 'red' ? redMission : blueMission;
    const style = faction === 'red'
      ? `${STRATEGY_SPEC ? '决策优先: 1.任务目标>2.地形>3.态势>4.战术 ' : ''}Aggressive doctrine. ${hasEncircle ? 'Enemy ENCIRCLED — attack from all sides! ' : ''}${hasFlank ? 'FLANKING active — strike from unexpected angles! ' : ''}Mission: ${mission}`
      : `${STRATEGY_SPEC ? '决策优先: 1.任务目标>2.地形>3.态势>4.战术 ' : ''}Defensive doctrine. Hold position, use cover. Counter-attack only from advantage. Mission: ${mission}`;

    if (USE_LLM) {
      for (const unit of state.units.filter(u => u.faction === faction && u.isAlive && (u.canMove || u.canAttack))) {
        const mv = getMovablePositions(state, unit), at = getAttackablePositions(state, unit);
        if (mv.length === 0 && at.length === 0) continue;
        const cmd = await llmCmd(unit, mv, at, state, mission, style);
        if (cmd.a === 'move' && cmd.tx != null) { const tp = { x: cmd.tx, z: cmd.tz }; if (mv.some(p => p.x === tp.x && p.z === tp.z)) state = moveUnit(state, unit, tp); }
        else if (cmd.a === 'attack' && cmd.tx != null) { const tp = { x: cmd.tx, z: cmd.tz }; if (at.some(p => p.x === tp.x && p.z === tp.z)) state = attackUnit(state, unit, tp); }
      }
    } else {
      const { aiExecuteTurn } = await import('./src/game/ai');
      state = aiExecuteTurn(state); continue;
    }
    state = endTurn(state);
  }

  for (const log of state.combatLog) {
    events.push({ id: `e_${log.turn}_${log.attacker}`, turn: log.turn, time: Date.now(), type: log.eventType === 'destroy' ? 'unit_damaged' : 'shot_fired', actorUnitId: log.attackerUnitId, targetUnitId: log.defenderUnitId, confirmedByPlayer: true, visibilityConfidence: 'confirmed', message: `${log.attacker}→${log.defender}:${log.damage}dmg${log.eventType === 'destroy' ? ' DESTROYED' : ''}` });
  }

  const redA = state.units.filter(u => u.faction === 'red' && u.isAlive).length;
  const blueA = state.units.filter(u => u.faction === 'blue' && u.isAlive).length;
  const w: Faction | 'draw' = redA === 0 ? 'blue' : blueA === 0 ? 'red' : 'draw';

  // 更新兵力
  for (const f of attackForces) f.currentStrength = Math.max(0, f.currentStrength - (totalRed - redA));
  defendForce.currentStrength = Math.max(0, defendForce.currentStrength - (totalBlue - blueA));

  const intelReport = `情报: 发现 ${totalBlue} 敌方单位。估计敌损失 ${totalBlue - blueA} 单位 (置信度: ${blueA === totalBlue ? '低' : '中'})。`;
  const bdaReport = `BDA: 己方确认损失 ${totalRed - redA} 单位。估计敌方损失 ${totalBlue - blueA} 单位。${hasEncircle ? '包围态势: 敌方防御力下降。' : ''}${hasFlank ? '迂回成功: 攻击获得侧翼加成。' : ''}`;

  console.log(`    → ${w === 'red' ? '🔴突破!' : w === 'blue' ? '🔵守住了' : '⚪僵持'} | 红${redA}/${totalRed}活 ${state.battleStats.red.kills}杀 ${state.battleStats.red.damageDealt}伤 | 蓝${blueA}/${totalBlue}活 ${state.battleStats.blue.kills}杀 ${state.battleStats.blue.damageDealt}伤${hasEncircle ? ' [包围]' : ''}${hasFlank ? ' [迂回]' : ''}`);

  return {
    sector: `(${defendForce.sector.x},${defendForce.sector.y})`, turn: state.turn,
    redForce: attackForces.map(f => f.name).join('+'), blueForce: defendForce.name,
    redStart: totalRed, blueStart: totalBlue,
    redAlive: redA, blueAlive: blueA,
    redKills: state.battleStats.red.kills, blueKills: state.battleStats.blue.kills,
    redDamage: state.battleStats.red.damageDealt, blueDamage: state.battleStats.blue.damageDealt,
    winner: w,
    flankBonus: hasFlank, encircleBonus: hasEncircle,
    events, intelReport, bdaReport,
  };
}

// ============================================================
// LLM
// ============================================================
async function llmCmd(unit: Unit, mv: Position[], at: Position[], state: GameState, mission: string, style: string) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { a: 'hold', tx: 0, tz: 0, r: 'no key' };
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.deepseek.com';
  const model = process.env.LLM_MODEL || 'deepseek-chat';

  const summary = [`Turn ${state.turn}`];
  for (const f of ['red', 'blue'] as Faction[])
    summary.push(`${f}: ` + state.units.filter(u => u.faction === f && u.isAlive).map(u => `${u.name}(${u.position.x},${u.position.z}) HP${u.stats.hp}`).join(' | '));

  const prompt = `${STRATEGY_SPEC ? '决策规范: ' + STRATEGY_SPEC.slice(0, 1500) + '\n\n' : ''}STYLE: ${style}\n\nSTATE:\n${summary.join('\n')}\n\nUNIT: ${unit.name}(${unit.type}) HP${unit.stats.hp}/${unit.stats.maxHp} Atk${unit.stats.attack} Def${unit.stats.defense} Range${unit.stats.attackRange} Move${unit.stats.moveRange} Pos(${unit.position.x},${unit.position.z})\n\nMOVE: ${mv.slice(0, 4).map(p => `(${p.x},${p.z})`).join(' ')}\nATTACK: ${at.slice(0, 4).map(p => `(${p.x},${p.z})`).join(' ')}\n\nJSON: {"action":"move","targetX":5,"targetZ":3,"reasoning":"w"}`;

  const r = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: `${STRATEGY_SPEC ? '决策优先级: 1.任务目标 2.地形 3.敌我态势 4.战术选择。' : ''}JSON only.` }, { role: 'user', content: prompt }], temperature: 0.5, max_tokens: 200, response_format: { type: 'json_object' } }),
  });
  const d = await r.json(); const t = d.choices?.[0]?.message?.content ?? '{}';
  try { const m = t.match(/\{[\s\S]*\}/); if (m) { const j = JSON.parse(m[0]); return { a: j.action || 'hold', tx: j.targetX, tz: j.targetZ, r: j.reasoning || '' }; } } catch {}
  return { a: 'hold', tx: 0, tz: 0, r: 'parse error' };
}

// ============================================================
// 三方报告系统
// ============================================================

/** 添加估计误差: ±20% 随机偏移 */
function estimate(value: number, seed: number): number {
  const rng = ((seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  const offset = Math.round(value * (rng * 0.4 - 0.2)); // ±20%
  return Math.max(0, value + offset);
}

/** 生成红方视角报告 */
function generateRedReport(campaign: CampaignState): string {
  const L = (s: string) => s; const SEP_LOCAL = '━'.repeat(60);
  const lines: string[] = [];
  lines.push(SEP_LOCAL);
  lines.push('  🔴 红方司令部 — 战役情报综合报告');
  lines.push(`  [密级: 绝密] [仅限红方指挥系统]`);
  lines.push(SEP_LOCAL);
  lines.push('');
  lines.push(`  战役编号: OP-CITY-${SEED}`);
  lines.push(`  报告生成: 第${campaign.turn}回合结束后`);
  lines.push(`  战略地图: ${campaign.width}×${campaign.height} 格子`);

  // 兵力状态 (己方确认)
  lines.push('\n  ─── 己方兵力状态 (确认) ───');
  for (const f of campaign.redForces) {
    const b = campaign.battleHistory.filter(x => x.redForce.includes(f.name));
    const status = f.currentStrength <= f.originalStrength * 0.3 ? '⚠️严重损失' :
                   f.currentStrength <= f.originalStrength * 0.6 ? '⚡中度损失' : '✅基本完整';
    lines.push(`    ${f.id}: ${status}`);
    lines.push(`      兵力: ${f.currentStrength}/${f.originalStrength} | 补给: ${f.supply}% | 士气: ${f.morale}%`);
    if (b.length > 0) {
      const kills = b.reduce((s, x) => s + x.redKills, 0);
      const losses = f.originalStrength - f.currentStrength;
      lines.push(`      确认杀伤: ${kills} | 自身损失: ${losses}`);
    }
  }
  const redLosses = campaign.redForces.reduce((s, f) => s + (f.originalStrength - f.currentStrength), 0);
  const redKills = campaign.battleHistory.reduce((s, b) => s + b.redKills, 0);

  // 敌方估计
  lines.push('\n  ─── 蓝方兵力估计 (根据战场观察) ───');
  for (const f of campaign.blueForces) {
    const b = campaign.battleHistory.filter(x => x.blueForce === f.name);
    if (b.length === 0) {
      const estStr = estimate(f.originalStrength, SEED + f.id.charCodeAt(1));
      lines.push(`    ${f.id}: 估计 ${estStr}~${f.originalStrength} 单位 (未直接接敌)`);
    } else {
      const observed = b.reduce((min, x) => Math.min(min, x.blueAlive), 999);
      const estKills = b.reduce((s, x) => s + x.blueKills, 0);
      lines.push(`    ${f.id}: 估计残余 ${estimate(observed, SEED + f.id.length)}~${Math.min(observed + 2, f.originalStrength)} 单位`);
      lines.push(`      估计杀伤: ${estimate(estKills, SEED + b.length)} (±20%误差)`);
    }
  }

  // 战斗过程 (红方视角)
  lines.push('\n  ─── 战斗过程 ───');
  for (let i = 0; i < campaign.battleHistory.length; i++) {
    const b = campaign.battleHistory[i];
    const w = b.winner === 'red' ? '突破成功' : b.winner === 'blue' ? '进攻受阻' : '持续交火';
    const bonus = [b.encircleBonus && '包围态势', b.flankBonus && '侧翼迂回'].filter(Boolean);
    lines.push(`\n  第${i + 1}战: ${b.redForce} → ${b.blueForce}`);
    lines.push(`    态势: ${w}${bonus.length > 0 ? ' [' + bonus.join('+') + ']' : ''}`);
    lines.push(`    己方: ${b.redAlive}/${b.redStart} 单位生存 | 确认杀伤 ${b.redKills} | 输出伤害 ${b.redDamage}`);
    lines.push(`    敌方估计: 残余约 ${estimate(b.blueAlive, SEED + i)}~${Math.min(b.blueAlive + 2, b.blueStart)} 单位 (原${b.blueStart})`);
  }

  // 战役判定 (红方视角)
  lines.push('\n  ─── 红方战役评估 ───');
  const cityHold = campaign.blueForces.find(f => f.id === '蓝A-城市守备')!;
  const cityEstAlive = campaign.battleHistory.filter(b => b.blueForce === cityHold.name).reduce((min, b) => Math.min(min, b.blueAlive), 999);
  if (cityEstAlive <= cityHold.originalStrength * 0.3) {
    lines.push('  ✅ 城市防线已崩溃 — 建议立即发起总攻占领');
  } else if (redKills > redLosses * 1.5) {
    lines.push('  📈 交换比有利 (己方1:敌' + (redKills / Math.max(1, redLosses)).toFixed(1) + ')，继续进攻');
  } else if (campaign.battleHistory.some(b => b.encircleBonus)) {
    lines.push('  ⚡ 包围态势形成中 — 建议投入预备队扩大战果');
  } else {
    lines.push('  ⚠️ 进攻进展缓慢 — 建议调整战术或请求炮兵支援');
  }

  // 总结
  lines.push(`\n  红方确认损失: ${redLosses} 单位 | 确认杀伤: ${redKills} 单位`);
  const encircleCount = campaign.battleHistory.filter(b => b.encircleBonus || b.flankBonus).length;
  if (encircleCount > 0) lines.push(`  迂回/包围战术执行: ${encircleCount} 次`);

  lines.push('');
  return lines.join('\n');
}

/** 生成蓝方视角报告 */
function generateBlueReport(campaign: CampaignState): string {
  const SEP_LOCAL = '━'.repeat(60);
  const lines: string[] = [];
  lines.push(SEP_LOCAL);
  lines.push('  🔵 蓝方城防司令部 — 防御态势报告');
  lines.push(`  [密级: 机密] [仅限蓝方守备系统]`);
  lines.push(SEP_LOCAL);
  lines.push('');
  lines.push(`  防御编号: DEF-CITY-${SEED}`);
  lines.push(`  报告生成: 第${campaign.turn}回合结束后`);

  // 己方兵力 (确认)
  lines.push('\n  ─── 己方守备兵力 (确认) ───');
  for (const f of campaign.blueForces) {
    const b = campaign.battleHistory.filter(x => x.blueForce === f.name);
    const status = f.currentStrength <= f.originalStrength * 0.3 ? '🔴危急!' :
                   f.currentStrength <= f.originalStrength * 0.5 ? '🟡严重' : '🟢正常';
    lines.push(`    ${f.id}: ${status}`);
    lines.push(`      兵力: ${f.currentStrength}/${f.originalStrength} | 补给: ${f.supply}% | 士气: ${f.morale}%`);
    if (b.length > 0) {
      const kills = b.reduce((s, x) => s + x.blueKills, 0);
      lines.push(`      确认杀伤: ${kills} | 自身损失: ${f.originalStrength - f.currentStrength}`);
    }
  }
  const blueLosses = campaign.blueForces.reduce((s, f) => s + (f.originalStrength - f.currentStrength), 0);
  const blueKills = campaign.battleHistory.reduce((s, b) => s + b.blueKills, 0);

  // 敌方估计
  lines.push('\n  ─── 红方进攻兵力估计 ───');
  for (const f of campaign.redForces) {
    const b = campaign.battleHistory.filter(x => x.redForce.includes(f.name));
    if (b.length === 0) {
      const estStr = estimate(f.originalStrength, SEED + f.id.length + 50);
      lines.push(`    ${f.id}: 估计 ${estStr}~${f.originalStrength + 2} 单位 (未直接接敌)`);
    } else {
      const observedMax = b.reduce((max, x) => Math.max(max, x.redStart), 0);
      const observedAlive = b.reduce((max, x) => Math.max(max, x.redAlive), 0);
      const estKills = b.reduce((s, x) => s + x.blueKills, 0);
      // 防守方倾向于高估敌方兵力
      lines.push(`    ${f.id}: 估计 ${estimate(observedAlive + 1, SEED - f.id.length)}~${observedMax + 2} 单位 (原观测${observedMax})`);
      lines.push(`      估计击毁: ${estimate(estKills, SEED + 77 + b.length)} (±20%误差, 可能高估)`);
    }
  }

  // 战斗过程 (蓝方视角)
  lines.push('\n  ─── 防御战斗记录 ───');
  for (let i = 0; i < campaign.battleHistory.length; i++) {
    const b = campaign.battleHistory[i];
    const w = b.winner === 'blue' ? '成功击退' : b.winner === 'red' ? '⚠️防线被突破' : '坚守阵地';
    const threat = b.redKills >= 3 ? '⚠️敌攻势猛烈' : b.blueKills >= b.redKills ? '✅交换比有利' : '继续坚守';
    lines.push(`\n  第${i + 1}战: 抗击 ${b.redForce}`);
    lines.push(`    战况: ${w} | ${threat}`);
    lines.push(`    己方: ${b.blueAlive}/${b.blueStart} 单位坚守 | 确认击毁 ${b.blueKills} | 遭受伤害 ${b.blueDamage}`);
    lines.push(`    敌情估计: 敌投入约 ${b.redStart} 单位, 估计敌残余 ${estimate(b.redAlive, SEED - i)}~${Math.min(b.redAlive + 3, b.redStart)}`);
  }

  // 蓝方战役评估
  lines.push('\n  ─── 蓝方防御评估 ───');
  const cityForce = campaign.blueForces.find(f => f.id === '蓝A-城市守备')!;
  if (cityForce.currentStrength <= cityForce.originalStrength * 0.3) {
    lines.push('  🔴 城市防线濒临崩溃 — 请求最高指挥部立即增援!');
  } else if (blueKills >= blueLosses) {
    lines.push('  🟢 防御态势稳定 — 交换比对我方有利');
  } else {
    lines.push('  🟡 防御承压 — 建议缩短防线, 集中兵力');
  }

  lines.push(`\n  蓝方确认损失: ${blueLosses} 单位 | 确认击毁: ${blueKills} 单位`);
  lines.push(`  增援剩余: ${campaign.blueReinforcementPool} 单位可调用`);

  lines.push('');
  return lines.join('\n');
}

/** 生成真实过程报告 (上帝视角, 精确数据) */
function generateGroundTruth(campaign: CampaignState): string {
  const SEP_LOCAL = '━'.repeat(60);
  const lines: string[] = [];
  lines.push(SEP_LOCAL);
  lines.push('  📋 真实战斗过程 (上帝视角 — 无迷雾, 精确数据)');
  lines.push(`  [仅供战后分析使用]`);
  lines.push(SEP_LOCAL);
  lines.push('');
  lines.push(`  战役编号: OP-CITY-${SEED}`);
  lines.push(`  总回合: ${campaign.turn} | 战斗场次: ${campaign.battleHistory.length}`);
  lines.push('');

  // 精确兵力
  lines.push('  ─── 部队精确兵力 ───');
  lines.push('  🔴 红方 (进攻方):');
  for (const f of campaign.redForces) {
    const b = campaign.battleHistory.filter(x => x.redForce.includes(f.name));
    lines.push(`      ${f.id}: ${f.currentStrength}/${f.originalStrength} | 杀伤: ${b.reduce((s, x) => s + x.redKills, 0)} | 补给:${f.supply}%`);
  }
  lines.push('  🔵 蓝方 (防守方):');
  for (const f of campaign.blueForces) {
    const b = campaign.battleHistory.filter(x => x.blueForce === f.name);
    lines.push(`      ${f.id}: ${f.currentStrength}/${f.originalStrength} | 杀伤: ${b.reduce((s, x) => s + x.blueKills, 0)} | 补给:${f.supply}%`);
  }

  // 战略行动
  lines.push('\n  ─── 精确战略行动序列 ───');
  for (const a of campaign.actions) {
    const t = a.type === 'ATTACK' ? '进攻' : a.type === 'FLANK' ? '迂回攻击' : a.type === 'MOVE' ? '机动' : a.type === 'REINFORCE' ? '增援到达' : '待命';
    lines.push(`    [${a.type}] ${a.description}`);
  }

  // 精确战斗数据
  const totalRedK = campaign.battleHistory.reduce((s, b) => s + b.redKills, 0);
  const totalBlueK = campaign.battleHistory.reduce((s, b) => s + b.blueKills, 0);
  const totalRedD = campaign.battleHistory.reduce((s, b) => s + b.redDamage, 0);
  const totalBlueD = campaign.battleHistory.reduce((s, b) => s + b.blueDamage, 0);

  lines.push('\n  ─── 精确战斗数据 ───');
  for (let i = 0; i < campaign.battleHistory.length; i++) {
    const b = campaign.battleHistory[i];
    const bonus = [b.encircleBonus && '包围', b.flankBonus && '迂回'].filter(Boolean).join('+') || '无';
    lines.push(`\n  战斗${i + 1}: ${b.redForce} vs ${b.blueForce}`);
    lines.push(`    地形加成: ${bonus}`);
    lines.push(`    红方: ${b.redAlive}/${b.redStart} 生存 | ${b.redKills} 击杀 | ${b.redDamage} 伤害 | ${(b.redKills / Math.max(1, (b.redStart - b.redAlive))).toFixed(2)} 交换比`);
    lines.push(`    蓝方: ${b.blueAlive}/${b.blueStart} 生存 | ${b.blueKills} 击杀 | ${b.blueDamage} 伤害 | ${(b.blueKills / Math.max(1, (b.blueStart - b.blueAlive))).toFixed(2)} 交换比`);
    lines.push(`    结果: ${b.winner === 'red' ? '红方突破' : b.winner === 'blue' ? '蓝方守住' : '僵持'}`);
    lines.push(`    事件: ${b.events.length} (平均${(b.events.length / Math.max(1, b.turn)).toFixed(1)}/回合)`);
  }

  // 精确总数据
  lines.push('\n  ─── 精确战役总计 ───');
  const redLossesExact = campaign.redForces.reduce((s, f) => s + (f.originalStrength - f.currentStrength), 0);
  const blueLossesExact = campaign.blueForces.reduce((s, f) => s + (f.originalStrength - f.currentStrength), 0);

  lines.push(`  红方总杀伤: ${totalRedK} | 红方总损失: ${redLossesExact} | 交换比: 1:${redLossesExact > 0 ? (totalRedK / redLossesExact).toFixed(2) : '∞'}`);
  lines.push(`  蓝方总杀伤: ${totalBlueK} | 蓝方总损失: ${blueLossesExact} | 交换比: 1:${blueLossesExact > 0 ? (totalBlueK / blueLossesExact).toFixed(2) : '∞'}`);
  lines.push(`  红方总伤害: ${totalRedD} | 蓝方总伤害: ${totalBlueD}`);
  lines.push(`  红蓝伤害比: 1:${totalRedD > 0 ? (totalBlueD / totalRedD).toFixed(2) : '∞'}`);

  // 真相判定
  lines.push('\n  ─── 真实战役判定 ───');
  if (redLossesExact === 0 && blueLossesExact === 0) lines.push('  无实际交战发生');
  else if (totalRedK > totalBlueK * 2 && redLossesExact < blueLossesExact) lines.push('  ✅ 红方决定性胜利 (杀伤优势 + 损失更少)');
  else if (totalRedK > totalBlueK * 1.5) lines.push('  📈 红方战术胜利 (杀伤优势显著)');
  else if (totalBlueK > totalRedK * 1.5) lines.push('  🛡️ 蓝方成功防御 (杀伤优势)');
  else if (Math.abs(totalRedK - totalBlueK) <= 2) lines.push('  ⚪ 势均力敌的消耗战');
  else lines.push('  ⚪ 僵持');

  lines.push('');
  return lines.join('\n');
}

// ============================================================
// LLM 报告生成 (代替程序模板)
// ============================================================

/** 构建给 LLM 使用的战役数据 */
function buildBattleSummary(campaign: CampaignState, perspective: 'red' | 'blue' | 'truth'): string {
  const parts: string[] = [];

  if (perspective === 'red') {
    parts.push('你是一名红军情报参谋。请根据以下战场数据，撰写一份标准军事格式的情报综合报告(SITREP)。');
    parts.push('你只能看到己方确认的数据。敌方数据是估计值（可能不准确）。');
    parts.push('报告应包含：当前态势、己方兵力、敌情估计、战斗经过、结论与建议。');
    parts.push('');
    parts.push(`战役编号: OP-CITY-${SEED} | 总回合: ${campaign.turn} | 战斗: ${campaign.battleHistory.length}场`);
    parts.push('');
    parts.push('=== 己方兵力 (确认) ===');
    for (const f of campaign.redForces) {
      const b = campaign.battleHistory.filter(x => x.redForce.includes(f.name));
      const kills = b.reduce((s, x) => s + x.redKills, 0);
      const losses = f.originalStrength - f.currentStrength;
      const status = losses === 0 ? '完整' : losses <= f.originalStrength * 0.3 ? '轻微损失' : losses <= f.originalStrength * 0.6 ? '中度损失' : '严重损失';
      parts.push(`${f.id}(${f.mission}): 兵力${f.currentStrength}/${f.originalStrength}, ${status}, 确认杀伤${kills}, 自身损失${losses}, 补给${f.supply}%`);
    }
    const redKills = campaign.battleHistory.reduce((s, b) => s + b.redKills, 0);
    const redLosses = campaign.redForces.reduce((s, f) => s + (f.originalStrength - f.currentStrength), 0);
    parts.push(`\n=== 敌情估计 (根据战场观察) ===`);
    for (const f of campaign.blueForces) {
      const b = campaign.battleHistory.filter(x => x.blueForce === f.name);
      if (b.length === 0) {
        parts.push(`${f.id}: 估计 ${f.originalStrength} 单位 (未直接接敌, 置信度:低)`);
      } else {
        const observed = b.reduce((min, x) => Math.min(min, x.blueAlive), 999);
        const estKills = b.reduce((s, x) => s + x.blueKills, 0);
        parts.push(`${f.id}: 估计残余 ${estimate(observed, SEED + f.id.length)}~${Math.min(observed + 2, f.originalStrength)} 单位, 估计我方击毁 ${estimate(estKills, SEED + b.length)} (置信度:${observed <= f.originalStrength * 0.5 ? '中' : '低'})`);
      }
    }
    parts.push(`\n=== 战斗经过 ===`);
    for (let i = 0; i < campaign.battleHistory.length; i++) {
      const b = campaign.battleHistory[i];
      const bonus = [b.encircleBonus && '包围', b.flankBonus && '侧翼迂回'].filter(Boolean).join('+') || '无';
      parts.push(`第${i+1}战: ${b.redForce}→${b.blueForce} | 己方${b.redAlive}/${b.redStart}活 ${b.redKills}杀 ${b.redDamage}伤 | 敌残余估计${estimate(b.blueAlive, SEED+i)}~${Math.min(b.blueAlive+2,b.blueStart)} | 战术加成:${bonus} | 事件:${b.events.length}`);
    }
    parts.push(`\n=== 补充信息 ===`);
    parts.push(`红方增援剩余: ${campaign.redReinforcementPool} 单位`);
    const cityF = campaign.blueForces.find(f => f.id === '蓝A-城市守备')!;
    parts.push(`城市守敌估计残余: ${cityF.currentStrength}/${cityF.originalStrength}`);
    const encB = campaign.battleHistory.filter(b => b.encircleBonus || b.flankBonus).length;
    if (encB > 0) parts.push(`迂回/包围战术执行 ${encB} 次`);
    parts.push('\n请以红军情报参谋身份撰写完整报告。格式: 标题、态势概述、兵力、敌情、战斗经过、结论与建议。使用军事专业术语。');
  }

  else if (perspective === 'blue') {
    parts.push('你是一名蓝军城防指挥部情报官。请根据以下防御战斗数据，撰写一份标准军事格式的防御态势报告。');
    parts.push('你只能看到己方确认的数据。敌方数据是观测估计值（可能高估）。');
    parts.push('报告应包含：当前防御态势、己方守备兵力、敌进攻兵力估计、各次防御战斗经过、结论与增援请求。');
    parts.push('');
    parts.push(`防御编号: DEF-CITY-${SEED} | 总回合: ${campaign.turn} | 抗击: ${campaign.battleHistory.length}波`);
    parts.push('');
    parts.push('=== 己方守备兵力 (确认) ===');
    for (const f of campaign.blueForces) {
      const b = campaign.battleHistory.filter(x => x.blueForce === f.name);
      const kills = b.reduce((s, x) => s + x.blueKills, 0);
      const losses = f.originalStrength - f.currentStrength;
      const status = f.currentStrength <= f.originalStrength * 0.3 ? '危急' : f.currentStrength <= f.originalStrength * 0.5 ? '严重' : '正常';
      parts.push(`${f.id}(${f.mission}): 兵力${f.currentStrength}/${f.originalStrength}, ${status}, 确认击毁${kills}, 损失${losses}, 补给${f.supply}%`);
    }
    const blueKills = campaign.battleHistory.reduce((s, b) => s + b.blueKills, 0);
    const blueLosses = campaign.blueForces.reduce((s, f) => s + (f.originalStrength - f.currentStrength), 0);
    parts.push(`\n=== 敌进攻兵力估计 (战场观测) ===`);
    for (const f of campaign.redForces) {
      const b = campaign.battleHistory.filter(x => x.redForce.includes(f.name));
      if (b.length === 0) {
        parts.push(`${f.id}: 估计 ${f.originalStrength}~${f.originalStrength + 2} 单位 (未直接接敌)`);
      } else {
        const observedMax = b.reduce((max, x) => Math.max(max, x.redStart), 0);
        parts.push(`${f.id}: 估计 ${estimate(observedMax, SEED - f.id.length)}~${observedMax + 3} 单位 (观测最多 ${observedMax}), 估计已击毁 ${estimate(blueKills, SEED + 77)}`);
      }
    }
    parts.push(`\n=== 防御战斗经过 ===`);
    for (let i = 0; i < campaign.battleHistory.length; i++) {
      const b = campaign.battleHistory[i];
      parts.push(`第${i+1}波抗击: ${b.blueForce} vs ${b.redForce} | 己方${b.blueAlive}/${b.blueStart}坚守 ${b.blueKills}击毁 ${b.blueDamage}受创 | 敌投入约${b.redStart}, 残余估计${estimate(b.redAlive, SEED-i)}~${Math.min(b.redAlive+3,b.redStart)} | 事件${b.events.length}`);
    }
    parts.push(`\n=== 补充 ===`);
    const cityForce = campaign.blueForces.find(f => f.id === '蓝A-城市守备')!;
    parts.push(`蓝方增援剩余池: ${campaign.blueReinforcementPool} 单位`);
    parts.push(`城市守备残存: ${cityForce.currentStrength}/${cityForce.originalStrength}`);
    parts.push('\n请以蓝军情报官身份撰写完整防御态势报告。格式: 标题、总体态势、守备兵力、敌情评估、各次抗击详情、增援请求与建议。');
  }

  else { // truth
    parts.push('你是一名中立的军事分析员。请根据以下精确的战役数据（无迷雾），撰写一份客观的战役后分析报告(AFTER-ACTION REVIEW)。');
    if (REPORT_SPEC) parts.push(`报告格式请严格遵循:\n${REPORT_SPEC}`);
    parts.push('所有数据均为精确值，无估计误差。报告应包含：战役概述、双方兵力、战斗序列、各次战斗详情、数据统计、胜负判定、战术分析。');
    parts.push('');
    parts.push(`战役编号: OP-CITY-${SEED} | 总回合: ${campaign.turn} | 战斗: ${campaign.battleHistory.length}场`);
    parts.push('');
    parts.push('=== 红方精确兵力 ===');
    for (const f of campaign.redForces) {
      const b = campaign.battleHistory.filter(x => x.redForce.includes(f.name));
      parts.push(`${f.id}: ${f.currentStrength}/${f.originalStrength} | 杀伤: ${b.reduce((s, x) => s + x.redKills, 0)} | 损失: ${f.originalStrength - f.currentStrength} | 补给:${f.supply}% | 使命: ${f.mission}`);
    }
    parts.push('\n=== 蓝方精确兵力 ===');
    for (const f of campaign.blueForces) {
      const b = campaign.battleHistory.filter(x => x.blueForce === f.name);
      parts.push(`${f.id}: ${f.currentStrength}/${f.originalStrength} | 杀伤: ${b.reduce((s, x) => s + x.blueKills, 0)} | 损失: ${f.originalStrength - f.currentStrength} | 补给:${f.supply}% | 使命: ${f.mission}`);
    }
    parts.push('\n=== 精确战斗数据 ===');
    for (let i = 0; i < campaign.battleHistory.length; i++) {
      const b = campaign.battleHistory[i];
      const bonus = [b.encircleBonus && '包围', b.flankBonus && '迂回'].filter(Boolean).join('+') || '无';
      const rRatio = (b.redKills / Math.max(1, b.redStart - b.redAlive)).toFixed(2);
      const bRatio = (b.blueKills / Math.max(1, b.blueStart - b.blueAlive)).toFixed(2);
      parts.push(`战斗${i+1}: ${b.redForce} vs ${b.blueForce} | 红${b.redAlive}/${b.redStart}杀${b.redKills}伤${b.redDamage}(交换比${rRatio}) | 蓝${b.blueAlive}/${b.blueStart}杀${b.blueKills}伤${b.blueDamage}(交换比${bRatio}) | 加成:${bonus} | 事件:${b.events.length} | 结果:${b.winner}`);
    }
    const totalRK = campaign.battleHistory.reduce((s, b) => s + b.redKills, 0);
    const totalBK = campaign.battleHistory.reduce((s, b) => s + b.blueKills, 0);
    const totalRL = campaign.redForces.reduce((s, f) => s + (f.originalStrength - f.currentStrength), 0);
    const totalBL = campaign.blueForces.reduce((s, f) => s + (f.originalStrength - f.currentStrength), 0);
    parts.push(`\n总数据: 红杀伤${totalRK} 红损失${totalRL} 交换比1:${totalRL>0?(totalRK/totalRL).toFixed(2):'∞'} | 蓝杀伤${totalBK} 蓝损失${totalBL} 交换比1:${totalBL>0?(totalBK/totalBL).toFixed(2):'∞'}`);
    parts.push(`红增援剩余${campaign.redReinforcementPool} | 蓝增援剩余${campaign.blueReinforcementPool}`);
    const encB = campaign.battleHistory.filter(b => b.encircleBonus || b.flankBonus).length;
    if (encB > 0) parts.push(`迂回/包围战术: ${encB}次`);
    parts.push('\n请以中立军事分析员身份撰写完整战役分析报告。包含: 标题、战役概述、兵力对比、逐次战斗分析、关键数据、战术评估(包围/迂回效果)、胜负判定、经验教训。');
  }

  return parts.join('\n');
}

/** 调用 LLM 生成报告 */
async function generateLLMReport(campaign: CampaignState, perspective: 'red' | 'blue' | 'truth'): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return `[LLM不可用] 请设置 OPENAI_API_KEY`;

  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.deepseek.com';
  const model = process.env.LLM_MODEL || 'deepseek-chat';
  const summary = buildBattleSummary(campaign, perspective);

  const resp = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: perspective === 'red'
          ? `你是一名红军情报参谋。${REPORT_SPEC ? '严格按以下格式规范撰写报告:\n\n' + REPORT_SPEC : '用军事格式撰写报告, 包含: 态势概述、己方兵力、敌情估计、战斗经过、结论与建议。'}`
          : perspective === 'blue'
          ? `你是一名蓝军城防情报官。${REPORT_SPEC ? '严格按以下格式规范撰写报告:\n\n' + REPORT_SPEC : '用军事格式撰写防御报告, 包含: 防御态势、守备兵力、敌情估计、抗击经过、增援请求。'}`
          : `你是一名中立军事分析员。${REPORT_SPEC ? '严格按以下格式规范撰写报告:\n\n' + REPORT_SPEC : '撰写客观战役后分析, 包含: 战役概述、兵力对比、逐次战斗分析、关键数据、胜负判定。'}`,
        },
        { role: 'user', content: summary },
      ],
      temperature: 0.7, max_tokens: 1200,
    }),
  });
  const data = await resp.json();
  return data.choices?.[0]?.message?.content ?? '[LLM返回空]';
}
async function main() {
  console.log(SEP);
  console.log('  战役 V2 — 战略元素增强');
  console.log(`  Seed: ${SEED} | LLM: ${USE_LLM}`);
  console.log(SEP);

  // 1. 战略初始化
  console.log('\n[阶段1] 初始化战略地图...');
  const campaign = initCampaign();
  console.log(`  红方: ${campaign.redForces.length} 支部队 | 蓝方: ${campaign.blueForces.length} 支部队`);
  console.log(`  增援池: 红${campaign.redReinforcementPool} 蓝${campaign.blueReinforcementPool}`);

  // 2. 多回合战役
  const MAX_TURNS = 5;
  for (let t = 0; t < MAX_TURNS; t++) {
    if (campaign.blueForces.every(f => f.id === '蓝C-预备队' ? true : f.currentStrength <= 0)) {
      console.log('\n  🏙️ 蓝方主力被歼，城市陷落!');
      break;
    }
    if (campaign.redForces.every(f => f.currentStrength <= 0)) {
      console.log('\n  🛡️ 红方进攻被完全击退!');
      break;
    }

    await executeStrategicTurn(campaign);

    // 找出本回合的 ATTACK 行动并执行战术战斗
    const attackActions = campaign.actions.filter(a => a.type === 'ATTACK' || a.type === 'FLANK');
    for (const action of attackActions) {
      const targetForce = campaign.blueForces.find(f => f.sector.x === action.targetSector!.x && f.sector.y === action.targetSector!.y);
      if (!targetForce || targetForce.currentStrength <= 0) continue;

      const attackers = campaign.redForces.filter(f => {
        if (action.forceId === f.id) return true;
        // 检查是否有其他红方部队在同一回合攻击同一目标
        const otherActions = campaign.actions.filter(a => a.type === 'ATTACK' && a.targetSector!.x === action.targetSector!.x && a.targetSector!.y === action.targetSector!.y);
        return otherActions.some(a => a.forceId === f.id);
      });

      if (attackers.length === 0) continue;

      const hasFlank = campaign.actions.some(a => a.type === 'FLANK' && a.targetSector!.x === targetForce.sector.x && a.targetSector!.y === targetForce.sector.y);
      const hasEncircle = isEncirclement(campaign, targetForce.sector, 'red');

      const battle = await runBattle(campaign.regionTile, campaign, attackers, targetForce, hasFlank, hasEncircle);
      campaign.battleHistory.push(battle);

      if (battle.winner === 'red') {
        const tile = campaign.tiles[targetForce.sector.y][targetForce.sector.x];
        tile.control = 'red';
        tile.fortification = Math.max(0, tile.fortification - 20);
      }
    }
  }

  // 3. 生成三方报告 (LLM 或程序模板)
  console.log(`\n[阶段3] 生成三方报告${USE_LLM ? ' (LLM撰写)...' : ' (程序模板)...'}\n`);

  let redReport: string, blueReport: string, truthReport: string;

  if (USE_LLM) {
    console.log('  正在调用 DeepSeek 撰写报告...');
    redReport = await generateLLMReport(campaign, 'red');
    console.log('  ✅ 红方报告生成完成');
    blueReport = await generateLLMReport(campaign, 'blue');
    console.log('  ✅ 蓝方报告生成完成');
    truthReport = await generateLLMReport(campaign, 'truth');
    console.log('  ✅ 真实分析报告生成完成\n');
  } else {
    redReport = generateRedReport(campaign);
    blueReport = generateBlueReport(campaign);
    truthReport = generateGroundTruth(campaign);
  }

  console.log(redReport);
  console.log(blueReport);
  console.log(truthReport);

  // 对比摘要
  const totalRedK = campaign.battleHistory.reduce((s, b) => s + b.redKills, 0);
  const totalBlueK = campaign.battleHistory.reduce((s, b) => s + b.blueKills, 0);
  console.log(`\n  ─── 三方数据对比 ───`);
  console.log(`  ${'指标'.padEnd(20)} ${'🔴红方报告'.padEnd(18)} ${'🔵蓝方报告'.padEnd(18)} ${'📋真实数据'}`);
  console.log(`  ${'─'.repeat(70)}`);
  console.log(`  ${'红方杀伤'.padEnd(20)} ${String(estimate(totalRedK, SEED)).padEnd(18)} ${String(estimate(totalRedK, SEED + 50)).padEnd(18)} ${totalRedK}`);
  console.log(`  ${'蓝方杀伤'.padEnd(20)} ${String(estimate(totalBlueK, SEED + 2)).padEnd(18)} ${String(estimate(totalBlueK, SEED + 77)).padEnd(18)} ${totalBlueK}`);

  // 保存
  const dir = 'docs/campaign';
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(`${dir}/report-v2-${SEED}-RED.txt`, redReport, 'utf-8');
  fs.writeFileSync(`${dir}/report-v2-${SEED}-BLUE.txt`, blueReport, 'utf-8');
  fs.writeFileSync(`${dir}/report-v2-${SEED}-TRUTH.txt`, truthReport, 'utf-8');
  console.log(`\n  报告已保存: docs/campaign/report-v2-${SEED}-{RED,BLUE,TRUTH}.txt`);

  console.log(`\n${SEP}\n  战役结束!\n${SEP}`);
}

main().catch(e => { console.error(e); process.exit(1); });
