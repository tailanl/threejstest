/**
 * Campaign Simulator — 战略地图 + 战术战斗 + 战役报告
 *
 * 架构: WorldAtlas 战略地图 → 按 Sector 分派部队
 *       → 争夺的 Sector 展开战术战斗
 *       → 每场战斗生成情报报告 (仅报告可见内容, 估计值)
 *       → 战役结束生成 AFTER_ACTION 总报告
 *
 * 用法: npx tsx test-campaign.ts --llm
 */

import { generateWorldAtlas } from './src/game/world-atlas/macro-map-generator';
import { generateRegionTile } from './src/game/world-atlas/region-tile-generator';
import { DEBUG_WORLD_ATLAS_CONFIG } from './src/game/world-atlas/atlas-config';
import { getOperationViewForChunk } from './src/game/world-view/operation-view';
import { getCombatViewportFromOperationCell } from './src/game/world-view/combat-viewport';
import { convertCombatViewportToGameMap } from './src/game/world-view/world-to-game-map';
import { generateReportsFromBattleLog } from './src/game/reports/report-generator';
import { createUnit, initGameStateFromMap, getMovablePositions, getAttackablePositions, moveUnit, attackUnit, endTurn } from './src/game/engine';
import { aiExecuteTurn } from './src/game/ai';
import { generateMap } from './src/game/map';
import type { WorldAtlasConfig } from './src/game/world-atlas/atlas-config';
import type { RegionTile } from './src/game/world-map/world-map-types';
import type { StrategicChunk } from './src/game/world-view/strategic-chunks';
import type { GameMap, GameState, Unit, UnitType, Position, Faction, AIDifficulty } from './src/game/types';
import type { BattleLogEvent, AIReport } from './src/game/reports/report-types';
import * as fs from 'fs';

const USE_LLM = process.argv.includes('--llm');
const SEED = parseInt(process.argv.find(a => a.startsWith('--seed='))?.split('=')[1] ?? String(Date.now() % 100000));
const SEP = '═'.repeat(72);

// ============================================================
// 战略地图初始化
// ============================================================
interface StrategicSector {
  chunk: StrategicChunk;
  sectorX: number; sectorY: number;
  name: string;
  isCity: boolean; isRoad: boolean; isRiver: boolean; isBridge: boolean;
  defenseBonus: number; supplyValue: number; vpValue: number;
  redForce?: SectorForce; blueForce?: SectorForce;
  contested: boolean; capturedBy: Faction | null;
}

interface SectorForce {
  id: string; faction: Faction;
  units: Array<{ type: UnitType; count: number; name: string }>;
  mission: string;
  combatPower: number;
}

interface CampaignState {
  atlasConfig: WorldAtlasConfig;
  regionTile: RegionTile;
  sectors: StrategicSector[][];
  sectorWidth: number; sectorHeight: number;
  turn: number;
  totalRedUnits: number; totalBlueUnits: number;
  killedRedUnits: number; killedBlueUnits: number;
  reports: AIReport[];
  battleHistory: BattleRecord[];
}

interface BattleRecord {
  sector: string;
  turn: number;
  redForce: SectorForce; blueForce: SectorForce;
  redAlive: number; blueAlive: number;
  redKills: number; blueKills: number;
  redDamage: number; blueDamage: number;
  winner: Faction | 'draw';
  events: BattleLogEvent[];
  intelReport: AIReport | null;
  bdaReport: AIReport | null;
}

// ============================================================
// 部队定义
// ============================================================
const RED_FORCES: SectorForce[] = [
  {
    id: '红A-装甲先锋', faction: 'red', combatPower: 180,
    mission: '突破正面防线，为后续部队打开通道',
    units: [
      { type: 'tank', count: 3, name: '虎式重坦' },
      { type: 'ifv', count: 2, name: '游骑兵' },
      { type: 'infantry', count: 2, name: '突击步兵' },
      { type: 'scout', count: 1, name: '鹰眼' },
    ],
  },
  {
    id: '红B-合成战斗群', faction: 'red', combatPower: 200,
    mission: '主攻城市方向，占领目标城市',
    units: [
      { type: 'tank', count: 4, name: '虎式重坦' },
      { type: 'ifv', count: 2, name: '游骑兵' },
      { type: 'infantry', count: 3, name: '铁拳步兵' },
      { type: 'artillery', count: 1, name: '雷霆火炮' },
      { type: 'sam', count: 1, name: '天网防空' },
    ],
  },
  {
    id: '红C-侧翼掩护', faction: 'red', combatPower: 140,
    mission: '掩护主攻部队侧翼，阻击敌方增援',
    units: [
      { type: 'tank', count: 2, name: '豹式中坦' },
      { type: 'ifv', count: 2, name: '游骑兵' },
      { type: 'infantry', count: 2, name: '铁拳步兵' },
      { type: 'scout', count: 1, name: '鹰眼' },
    ],
  },
];

const BLUE_FORCES: SectorForce[] = [
  {
    id: '蓝A-城市守备队', faction: 'blue', combatPower: 160,
    mission: '死守城市，等待增援',
    units: [
      { type: 'tank', count: 2, name: 'M1重坦' },
      { type: 'atgm', count: 3, name: '标枪导弹' },
      { type: 'infantry', count: 3, name: '守备步兵' },
      { type: 'engineer', count: 1, name: '工兵连' },
      { type: 'sam', count: 1, name: '爱国者' },
    ],
  },
  {
    id: '蓝B-外围防御群', faction: 'blue', combatPower: 120,
    mission: '在外围迟滞敌军，为主力争取时间',
    units: [
      { type: 'tank', count: 1, name: 'M1重坦' },
      { type: 'ifv', count: 2, name: '布雷德利' },
      { type: 'infantry', count: 2, name: '守备步兵' },
      { type: 'atgm', count: 2, name: '标枪导弹' },
    ],
  },
];

// ============================================================
// LLM 任务指令
// ============================================================
async function llmCommand(unit: Unit, mv: Position[], at: Position[], state: GameState, mission: string, style: string): Promise<{ a: string; tx: number; tz: number; r: string }> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return { a: 'hold', tx: 0, tz: 0, r: 'no key' };

  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.deepseek.com';
  const model = process.env.LLM_MODEL || 'deepseek-chat';

  const summary = [`Turn ${state.turn}, ${state.currentFaction}`];
  for (const f of ['red', 'blue'] as Faction[]) {
    const us = state.units.filter(u => u.faction === f && u.isAlive);
    summary.push(`${f}: ` + us.map(u => `${u.name}(${u.position.x},${u.position.z}) HP${u.stats.hp}`).join(' | '));
  }

  const prompt = `STYLE: ${style}\nMISSION: ${mission}\n\nSTATE:\n${summary.join('\n')}\n\nUNIT: ${unit.name}(${unit.type}) HP${unit.stats.hp}/${unit.stats.maxHp} Atk${unit.stats.attack} Def${unit.stats.defense} Range${unit.stats.attackRange} Move${unit.stats.moveRange} Pos(${unit.position.x},${unit.position.z})\n\nMOVE: ${mv.slice(0, 4).map(p => `(${p.x},${p.z})`).join(' ')}\nATTACK: ${at.slice(0, 4).map(p => `(${p.x},${p.z})`).join(' ')}\n\nJSON: {"action":"move","targetX":5,"targetZ":3,"reasoning":"w"}`;

  const r = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: 'Tactical AI. JSON only.' }, { role: 'user', content: prompt }], temperature: 0.5, max_tokens: 200, response_format: { type: 'json_object' } }),
  });
  const d = await r.json(); const t = d.choices?.[0]?.message?.content ?? '{}';
  try { const m = t.match(/\{[\s\S]*\}/); if (m) { const j = JSON.parse(m[0]); return { a: j.action || 'hold', tx: j.targetX, tz: j.targetZ, r: j.reasoning || '' }; } } catch {}
  return { a: 'hold', tx: 0, tz: 0, r: 'parse error' };
}

// ============================================================
// 地图生成
// ============================================================
function generateStrategicMap(): CampaignState {
  const atlasConfig: WorldAtlasConfig = { ...DEBUG_WORLD_ATLAS_CONFIG, seed: SEED };
  const atlas = generateWorldAtlas(atlasConfig);
  const regionTile = generateRegionTile(atlas, 0, 0);

  const chunks = regionTile.strategicChunks;
  const chunkRows = chunks.length;
  const chunkCols = chunks[0]?.length ?? 0;

  const sectors: StrategicSector[][] = [];
  for (let y = 0; y < chunkRows; y++) {
    sectors[y] = [];
    for (let x = 0; x < chunkCols; x++) {
      const chunk = chunks[y]?.[x];
      sectors[y][x] = {
        chunk: chunk!,
        sectorX: x, sectorY: y,
        name: `(${x},${y})`,
        isCity: chunk?.features.hasCity ?? false,
        isRoad: chunk?.features.hasMainRoad ?? false,
        isRiver: chunk?.features.hasRiver ?? false,
        isBridge: chunk?.features.hasBridge ?? false,
        defenseBonus: chunk?.strategicValue.defense ?? 0,
        supplyValue: chunk?.strategicValue.supply ?? 0,
        vpValue: chunk?.strategicValue.victoryPoint ?? 0,
        contested: false,
        capturedBy: null,
      };
    }
  }

  // 找出城市 sector
  const cityChunks: StrategicSector[] = [];
  for (const row of sectors) for (const s of row) if (s.isCity && s.defenseBonus > 0.3) cityChunks.push(s);
  cityChunks.sort((a, b) => b.vpValue - a.vpValue);

  // 红方部署在左侧 (x=0~5), 蓝方部署在右侧 (x=27~31)
  // 红A 部署在 (3, 8) 附近 — 正面突破
  // 红B 部署在 (3, 15) 附近 — 主攻城市方向
  // 红C 部署在 (3, 24) 附近 — 侧翼掩护
  assignForce(sectors, RED_FORCES[0], 3, Math.floor(chunkRows * 0.25));
  assignForce(sectors, RED_FORCES[1], 3, Math.floor(chunkRows * 0.48));
  assignForce(sectors, RED_FORCES[2], 3, Math.floor(chunkRows * 0.75));

  // 查找城市 sector 用于蓝方部署
  const mainCity = cityChunks[0] ?? sectors[Math.floor(chunkRows / 2)][Math.floor(chunkCols * 0.8)];
  const outerChunk = sectors[Math.floor(chunkRows * 0.3)][Math.floor(chunkCols * 0.65)] ?? sectors[0][0];

  mainCity.blueForce = BLUE_FORCES[0];
  mainCity.name = `🏙️${mainCity.name}`;
  outerChunk.blueForce = BLUE_FORCES[1];

  return {
    atlasConfig, regionTile,
    sectors, sectorWidth: chunkCols, sectorHeight: chunkRows,
    turn: 0, totalRedUnits: 27, totalBlueUnits: 17,
    killedRedUnits: 0, killedBlueUnits: 0,
    reports: [], battleHistory: [],
  };
}

function assignForce(sectors: StrategicSector[][], force: SectorForce, x: number, y: number) {
  if (y < sectors.length && x < sectors[0].length) {
    const s = sectors[y][x];
    s.redForce = force;
    s.name = force.id;
  }
}

// ============================================================
// 战术战斗
// ============================================================
async function runTacticalBattle(
  regionTile: RegionTile,
  sector: StrategicSector,
  redForce: SectorForce,
  blueForce: SectorForce,
): Promise<BattleRecord> {
  // 从 StrategicChunk 生成战术地图
  const chunk = sector.chunk;
  const opView = getOperationViewForChunk(regionTile, chunk, 128);
  const cx = opView.worldRect.x + Math.floor(opView.worldRect.width / 2);
  const cy = opView.worldRect.y + Math.floor(opView.worldRect.height / 2);

  const viewport = getCombatViewportFromOperationCell({
    regionTile,
    cellPosition: { globalX: cx, globalY: cy },
    width: 16, height: 12,
  });

  let gameMap = convertCombatViewportToGameMap(viewport);

  // 初始化战术状态
  let state = initGameStateFromMap(gameMap, 'normal');
  state = { ...state, units: [], map: { ...state.map, cells: state.map.cells.map(row => row.map(c => ({ ...c, unit: null }))) } };

  // 部署红方 — 靠近中心线
  let idCounter = 0;
  for (const u of redForce.units) {
    for (let i = 0; i < u.count; i++) {
      let pos: Position;
      let tries = 0;
      do {
        pos = { x: 5 + Math.floor(Math.random() * 3), z: 1 + Math.floor(Math.random() * 10) };
        tries++;
      } while (tries < 20 && (state.map.cells[pos.z]?.[pos.x]?.terrain === 'water' || state.map.cells[pos.z]?.[pos.x]?.unit));
      const unit = createUnit(u.type, 'red', pos);
      unit.name = `${u.name}-${++idCounter}`;
      state.units.push(unit);
      const c = state.map.cells[pos.z]?.[pos.x]; if (c) c.unit = unit;
    }
  }

  // 部署蓝方 — 紧贴中心线
  for (const u of blueForce.units) {
    for (let i = 0; i < u.count; i++) {
      let pos: Position;
      let tries = 0;
      do {
        pos = { x: 8 + Math.floor(Math.random() * 3), z: 1 + Math.floor(Math.random() * 10) };
        tries++;
      } while (tries < 20 && (state.map.cells[pos.z]?.[pos.x]?.terrain === 'water' || state.map.cells[pos.z]?.[pos.x]?.unit));
      const unit = createUnit(u.type, 'blue', pos);
      unit.name = `${u.name}-${++idCounter}`;
      state.units.push(unit);
      const c = state.map.cells[pos.z]?.[pos.x]; if (c) c.unit = unit;
    }
  }

  const redStyle = 'Aggressive: push forward, prioritize breakthroughs, accept casualties to achieve objective.';
  const blueStyle = 'Defensive: hold positions, use cover, counter-attack only when enemy overextends.';

  const battleEvents: BattleLogEvent[] = [];

  for (let turn = 0; turn < 8; turn++) {
    const ra = state.units.filter(u => u.faction === 'red' && u.isAlive).length;
    const ba = state.units.filter(u => u.faction === 'blue' && u.isAlive).length;
    if (ra === 0 || ba === 0) break;

    const faction = state.currentFaction;
    const mission = faction === 'red' ? redForce.mission : blueForce.mission;
    const style = faction === 'red' ? redStyle : blueStyle;

    if (USE_LLM) {
      for (const unit of state.units.filter(u => u.faction === faction && u.isAlive && (u.canMove || u.canAttack))) {
        const mv = getMovablePositions(state, unit);
        const at = getAttackablePositions(state, unit);
        if (mv.length === 0 && at.length === 0) continue;

        const cmd = await llmCommand(unit, mv, at, state, mission, style);
        if (cmd.a === 'move' && cmd.tx >= 0) { const tp = { x: cmd.tx, z: cmd.tz }; if (mv.some(p => p.x === tp.x && p.z === tp.z)) state = moveUnit(state, unit, tp); }
        else if (cmd.a === 'attack' && cmd.tx >= 0) { const tp = { x: cmd.tx, z: cmd.tz }; if (at.some(p => p.x === tp.x && p.z === tp.z)) state = attackUnit(state, unit, tp); }
      }
    } else {
      state = aiExecuteTurn(state);
      continue;
    }
    state = endTurn(state);
  }

  // 记录战斗事件
  for (const log of state.combatLog) {
    battleEvents.push({
      id: `evt_${log.turn}_${log.attacker}`,
      turn: log.turn, time: Date.now(),
      type: log.eventType === 'destroy' ? 'unit_damaged' : 'shot_fired',
      actorUnitId: log.attackerUnitId, targetUnitId: log.defenderUnitId,
      confirmedByPlayer: true, visibilityConfidence: 'confirmed',
      message: `${log.attacker}→${log.defender}: ${log.damage} dmg${log.eventType === 'destroy' ? ' DESTROYED' : ''}`,
    });
  }

  const redA = state.units.filter(u => u.faction === 'red' && u.isAlive).length;
  const blueA = state.units.filter(u => u.faction === 'blue' && u.isAlive).length;
  const redStartCount = redForce.units.reduce((s, u) => s + u.count, 0);
  const blueStartCount = blueForce.units.reduce((s, u) => s + u.count, 0);

  // 生成情报报告
  const redSpotted = blueA < blueStartCount ? `估计敌方损失 ${blueStartCount - blueA} 单位` : '未确认敌方伤亡';
  const intelReport: AIReport | null = battleEvents.length > 0 ? {
    id: `intel_${sector.name}_${Date.now()}`,
    turn: state.turn, timestamp: Date.now(),
    type: 'INTREP', fromCommanderId: redForce.id,
    relatedOrderIds: [], relatedForceIds: [redForce.id, blueForce.id],
    title: `情报报告 — ${sector.name}`,
    summary: `战场侦察: 发现 ${blueStartCount} 敌方单位在 ${sector.name} 区域。${redSpotted}。`,
    facts: [`${redForce.id} 与 ${blueForce.id} 在 ${sector.name} 交战`],
    estimates: [`敌方兵力约 ${blueA}~${blueStartCount} 单位`, redSpotted],
    losses: {
      friendlyConfirmed: { tanksDestroyed: 0, ifvsDestroyed: 0, infantryKilled: 0, artilleryDestroyed: 0, otherDestroyed: redStartCount - redA, total: redStartCount - redA },
      enemyConfirmed: { tanksDestroyed: 0, ifvsDestroyed: 0, infantryKilled: 0, artilleryDestroyed: 0, otherDestroyed: 0, total: 0 },
      enemyEstimated: { tanksDestroyed: 0, ifvsDestroyed: 0, infantryKilled: 0, artilleryDestroyed: 0, otherDestroyed: blueStartCount - blueA, total: blueStartCount - blueA },
    },
    supply: { ammoState: 'good', fuelState: 'good', repairState: 'good' },
    recommendations: [{ text: redA > blueA ? '趁胜追击' : '请求增援', urgency: redA > blueA ? 'high' : 'critical' }],
    confidence: 'low', rawLogIds: battleEvents.map(e => e.id),
  } : null;

  const winner: Faction | 'draw' = redA === 0 ? 'blue' : blueA === 0 ? 'red' : 'draw';

  // 生成BDA报告（估计敌方伤亡，确认己方）
  const bdaReport: AIReport = {
    id: `bda_${sector.name}_${Date.now()}`,
    turn: state.turn, timestamp: Date.now(),
    type: 'BDA', fromCommanderId: redForce.id,
    relatedOrderIds: [], relatedForceIds: [redForce.id],
    title: `战损评估 — ${sector.name}`,
    summary: `红方确认损失 ${redStartCount - redA} 单位。估计蓝方损失 ${blueStartCount - blueA} 单位${winner === 'red' ? '（可能更高，因蓝方撤退混乱）' : ''}。`,
    facts: [
      `己方确认损失: ${redStartCount - redA} 单位`,
      `己方损伤: ${state.battleStats.red.damageDealt + state.battleStats.blue.damageDealt} 总伤害`,
    ],
    estimates: [
      `估计敌方损失: ${blueStartCount - blueA} 单位（置信度: ${blueA === blueStartCount ? '低' : '中'}）`,
      `估计敌方残余兵力: ${blueA} 单位`,
      `${
        blueA <= Math.ceil(blueStartCount * 0.5) ? '敌部队战斗力严重削弱，建议立即推进' :
        blueA <= Math.ceil(blueStartCount * 0.75) ? '敌部队仍保持战斗力，需继续打击' :
        '敌部队基本完整，当前进攻未取得突破'
      }`,
    ],
    losses: {
      friendlyConfirmed: { tanksDestroyed: 0, ifvsDestroyed: 0, infantryKilled: 0, artilleryDestroyed: 0, otherDestroyed: redStartCount - redA, total: redStartCount - redA },
      enemyConfirmed: { tanksDestroyed: 0, ifvsDestroyed: 0, infantryKilled: 0, artilleryDestroyed: 0, otherDestroyed: 0, total: 0 },
      enemyEstimated: { tanksDestroyed: 0, ifvsDestroyed: 0, infantryKilled: 0, artilleryDestroyed: 0, otherDestroyed: blueStartCount - blueA, total: blueStartCount - blueA },
    },
    supply: { ammoState: 'good', fuelState: 'good', repairState: 'good' },
    recommendations: [
      { text: winner === 'red' ? '继续向城市推进' : '重新整编，调整进攻方案', urgency: winner === 'red' ? 'high' : 'medium' },
    ],
    confidence: blueA === blueStartCount ? 'low' : 'medium',
    rawLogIds: battleEvents.map(e => e.id),
  };

  return {
    sector: sector.name, turn: state.turn,
    redForce, blueForce,
    redAlive: redA, blueAlive: blueA,
    redKills: state.battleStats.red.kills, blueKills: state.battleStats.blue.kills,
    redDamage: state.battleStats.red.damageDealt, blueDamage: state.battleStats.blue.damageDealt,
    winner,
    events: battleEvents,
    intelReport,
    bdaReport,
  };
}

// ============================================================
// 战役报告生成
// ============================================================
function generateCampaignReport(campaign: CampaignState): string {
  const lines: string[] = [];
  lines.push(SEP);
  lines.push('  战役 AFTER-ACTION 报告');
  lines.push(SEP);
  lines.push(`  时间: ${new Date().toISOString()}`);
  lines.push(`  地图: ${campaign.atlasConfig.virtualWidth}x${campaign.atlasConfig.virtualHeight} WorldAtlas`);
  lines.push(`  战略格子: ${campaign.sectorWidth}x${campaign.sectorHeight}`);
  lines.push(`  总战斗场次: ${campaign.battleHistory.length}`);
  lines.push('');

  // 红方部队状态
  let redTotalAlive = 0, redTotalKills = 0, redTotalDamage = 0;
  for (const b of campaign.battleHistory) {
    redTotalAlive += b.redAlive;
    redTotalKills += b.redKills;
    redTotalDamage += b.redDamage;
  }
  lines.push(`  🔴 红方 (进攻方): 总杀伤 ${redTotalKills}, 总伤害 ${redTotalDamage}`);
  lines.push(`     部队:`);
  for (const f of RED_FORCES) {
    const battles = campaign.battleHistory.filter(b => b.redForce.id === f.id);
    const kills = battles.reduce((s, b) => s + b.redKills, 0);
    const last = battles[battles.length - 1];
    lines.push(`       ${f.id}: ${battles.length}战 ${kills}杀 ${last ? last.redAlive + '活' : '未接敌'}`);
  }

  let blueTotalKills = 0, blueTotalDamage = 0;
  for (const b of campaign.battleHistory) {
    blueTotalKills += b.blueKills;
    blueTotalDamage += b.blueDamage;
  }
  lines.push(`\n  🔵 蓝方 (防守方): 总杀伤 ${blueTotalKills}, 总伤害 ${blueTotalDamage}`);

  // 战斗过程
  lines.push(`\n  ─── 战斗过程 ───`);
  for (let i = 0; i < campaign.battleHistory.length; i++) {
    const b = campaign.battleHistory[i];
    const w = b.winner === 'red' ? '🔴红方胜' : b.winner === 'blue' ? '🔵蓝方胜' : '⚪平局';
    lines.push(`\n  战斗 ${i + 1}: ${b.sector}`);
    lines.push(`    对阵: ${b.redForce.id} vs ${b.blueForce.id}`);
    lines.push(`    结果: ${w}`);
    lines.push(`    红方: ${b.redAlive}活 ${b.redKills}杀 ${b.redDamage}伤`);
    lines.push(`    蓝方: ${b.blueAlive}活 ${b.blueKills}杀 ${b.blueDamage}伤`);
    if (b.intelReport) {
      lines.push(`    情报: ${b.intelReport.summary}`);
      lines.push(`    估算: ${b.intelReport.estimates.join(' | ')}`);
    }
    if (b.bdaReport) {
      lines.push(`    BDA: ${b.bdaReport.summary}`);
    }
    lines.push(`    事件数: ${b.events.length}`);
  }

  // 战役判定
  lines.push(`\n  ─── 战役判定 ───`);
  const totalRedK = campaign.battleHistory.reduce((s, b) => s + b.redKills, 0);
  const totalBlueK = campaign.battleHistory.reduce((s, b) => s + b.blueKills, 0);
  if (totalRedK > totalBlueK * 1.5) lines.push('  判定: 🔴 红方决定性胜利 — 突破防线, 威胁城市');
  else if (totalRedK > totalBlueK) lines.push('  判定: 🔴 红方战术优势 — 取得战场主动权');
  else if (totalBlueK > totalRedK * 1.5) lines.push('  判定: 🔵 蓝方成功防御 — 击退敌军进攻');
  else if (totalBlueK > totalRedK) lines.push('  判定: 🔵 蓝方勉强守住 — 但伤亡惨重');
  else lines.push('  判定: ⚪ 消耗战 — 双方均未达成目标');
  lines.push('');

  return lines.join('\n');
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  console.log(SEP);
  console.log('  战役模拟器 — 城市攻防战');
  console.log(`  Seed: ${SEED} | LLM: ${USE_LLM}`);
  console.log(SEP);

  // 1. 生成战略地图
  console.log('\n[阶段1] 生成战略地图...');
  const campaign = generateStrategicMap();
  console.log(`  战略地图: ${campaign.sectorWidth}x${campaign.sectorHeight} 格`);
  console.log(`  RegionTile: ${campaign.regionTile.width}x${campaign.regionTile.height}`);

  // 显示地图摘要
  const citySectors = campaign.sectors.flat().filter(s => s.isCity);
  const redSectors = campaign.sectors.flat().filter(s => s.redForce);
  const blueSectors = campaign.sectors.flat().filter(s => s.blueForce);
  console.log(`  城市: ${citySectors.length} | 红方部署: ${redSectors.length} | 蓝方部署: ${blueSectors.length}`);
  for (const s of redSectors) console.log(`    🔴 ${s.name}: ${s.redForce!.units.length}种 ${s.redForce!.units.reduce((a, u) => a + u.count, 0)}单位`);
  for (const s of blueSectors) console.log(`    🔵 ${s.name}: ${s.blueForce!.units.length}种 ${s.blueForce!.units.reduce((a, u) => a + u.count, 0)}单位`);

  // 2. 执行战役 — 红方各部队进攻，每场打1次
  console.log(`\n[阶段2] 执行战役...`);
  const battles: BattleRecord[] = [];

  const outerSector = campaign.sectors.flat().find(s => s.blueForce?.id === BLUE_FORCES[1].id);
  const mainCitySector = campaign.sectors.flat().find(s => s.blueForce?.id === BLUE_FORCES[0].id);

  // 战斗1: 红A vs 蓝B (外围防线)
  if (outerSector) {
    const redA = campaign.sectors.flat().find(s => s.redForce?.id === RED_FORCES[0].id)!;
    console.log(`\n  [战斗1] 红A-装甲先锋 进攻 蓝B-外围防线...`);
    const b1 = await runTacticalBattle(campaign.regionTile, redA, RED_FORCES[0], BLUE_FORCES[1]);
    battles.push(b1);
    const w1 = b1.winner === 'red' ? '🔴突破!' : b1.winner === 'blue' ? '🔵守住了' : '⚪僵持';
    console.log(`    → ${w1} | 红${b1.redAlive}活${b1.redKills}杀 | 蓝${b1.blueAlive}活${b1.blueKills}杀`);
  }

  // 战斗2: 红B vs 蓝A (城市攻坚)
  if (mainCitySector) {
    const redB = campaign.sectors.flat().find(s => s.redForce?.id === RED_FORCES[1].id)!;
    console.log(`\n  [战斗2] 红B-合成战斗群 进攻 蓝A-城市守备队...`);
    const b2 = await runTacticalBattle(campaign.regionTile, redB, RED_FORCES[1], BLUE_FORCES[0]);
    battles.push(b2);
    const w2 = b2.winner === 'red' ? '🔴占领!' : b2.winner === 'blue' ? '🔵守住了' : '⚪僵持';
    console.log(`    → ${w2} | 红${b2.redAlive}活${b2.redKills}杀 | 蓝${b2.blueAlive}活${b2.blueKills}杀`);
  }

  // 战斗3: 红C vs 蓝B 残余 (侧翼扫荡) — 仅当外侧已被突破
  if (battles[0]?.winner === 'red' && outerSector) {
    const redC = campaign.sectors.flat().find(s => s.redForce?.id === RED_FORCES[2].id)!;
    console.log(`\n  [战斗3] 红C-侧翼掩护 扫荡 蓝B-外围残余...`);
    const b3 = await runTacticalBattle(campaign.regionTile, redC, RED_FORCES[2], BLUE_FORCES[1]);
    battles.push(b3);
    console.log(`    → ${b3.winner === 'red' ? '🔴扫荡完成' : '⚪僵持'} | 红${b3.redAlive}活${b3.redKills}杀 | 蓝${b3.blueAlive}活${b3.blueKills}杀`);
  }

  campaign.battleHistory = battles;

  // 3. 生成报告
  console.log(`\n[阶段3] 生成战役报告...`);
  const report = generateCampaignReport(campaign);
  console.log(report);

  // 保存报告
  const reportFile = `docs/campaign-report-${SEED}.txt`;
  if (!fs.existsSync('docs')) fs.mkdirSync('docs');
  fs.writeFileSync(reportFile, report, 'utf-8');
  console.log(`  报告已保存: ${reportFile}`);

  console.log(`\n${SEP}\n  战役结束!\n${SEP}`);
}

main().catch(e => { console.error(e); process.exit(1); });
