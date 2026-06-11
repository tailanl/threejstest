/**
 * AI Battle Simulator — 完整交战过程模拟 + LLM指挥接口 + 战术风格
 *
 * 用法:
 *   npx tsx test-ai-battle.ts                                   # AI vs AI 自动战斗
 *   npx tsx test-ai-battle.ts --llm                             # LLM 控制红方 (默认 balanced)
 *   npx tsx test-ai-battle.ts --llm --red-style aggressive      # 红方激进风格
 *   npx tsx test-ai-battle.ts --llm --compare-styles            # 同场景对比所有风格
 *   npx tsx test-ai-battle.ts --llm --red-style flanking --blue hard  # 红方迂回 vs 蓝方困难AI
 *   npx tsx test-ai-battle.ts --seed 42 --map procedural
 *
 * 红方风格 (--red-style):
 *   balanced    - 均衡攻守，根据局势灵活决策 (默认)
 *   aggressive  - 激进冲锋，优先攻击，不惜伤亡
 *   defensive   - 防守反击，固守阵地，不冒进
 *   cautious    - 谨慎推进，远程打击，低血量撤退
 *   flanking    - 侧翼迂回，避开正面，包抄夹击
 *   focused     - 集火歼灭，集中火力逐个消灭
 *   hit_and_run - 打了就跑，攻击后撤退，消耗战
 *
 * 蓝方难度 (--blue):
 *   easy | normal | hard
 */

import { generateWorldAtlas } from './src/game/world-atlas/macro-map-generator';
import { DEFAULT_WORLD_ATLAS_CONFIG, DEBUG_WORLD_ATLAS_CONFIG } from './src/game/world-atlas/atlas-config';
import { generateRegionTile } from './src/game/world-atlas/region-tile-generator';
import { getCombatViewportFromOperationCell } from './src/game/world-view/combat-viewport';
import { getOperationViewForChunk } from './src/game/world-view/operation-view';
import { convertCombatViewportToGameMap } from './src/game/world-view/world-to-game-map';
import { createUnit, initGameStateFromMap, getMovablePositions, getAttackablePositions, moveUnit, attackUnit, endTurn } from './src/game/engine';
import { aiExecuteTurn } from './src/game/ai';
import { generateReportsFromBattleLog } from './src/game/reports/report-generator';
import { parseCommandText, createHQOrderFromParsed } from './src/game/command/command-parser';
import { generatePlanFromOrder } from './src/game/ai-command/ai-planner';
import { executeAITurn } from './src/game/ai-command/ai-executor';
import type { WorldAtlasConfig } from './src/game/world-atlas/atlas-config';
import type { RegionTile } from './src/game/world-map/world-map-types';
import type { GameMap, GameState, Unit, UnitType, Position, Faction, MapType, CombatLogEntry, TurnSummary, AIDifficulty } from './src/game/types';
import type { BattleLogEvent, AIReport } from './src/game/reports/report-types';
import type { CommanderState } from './src/game/ai-command/commander-types';
import { UNIT_CONFIGS, TERRAIN_CONFIGS } from './src/game/config';

// ============================================================
// 命令行参数
// ============================================================
const args = process.argv.slice(2);
const USE_LLM = args.includes('--llm');
const SEED = parseInt(args.find(a => a.startsWith('--seed='))?.split('=')[1] ?? '42');
const MAP_TYPE = args.find(a => a.startsWith('--map='))?.split('=')[1] ?? 'procedural';
const RED_STYLE = args.find(a => a.startsWith('--red-style='))?.split('=')[1] ?? 'balanced';
const BLUE_STYLE = args.find(a => a.startsWith('--blue-style='))?.split('=')[1] ?? 'balanced';
const BLUE_DIFFICULTY = args.find(a => a.startsWith('--blue='))?.split('=')[1] ?? 'normal';
const BIG_MODE = args.includes('--big');
const COMPARE_STYLES = args.includes('--compare-styles');

const SEP = '═'.repeat(72);
const MINOR = '─'.repeat(48);

// ============================================================
// 战术风格定义
// ============================================================
interface TacticalStyle {
  id: string;
  name: string;
  description: string;
  /** 注入 LLM prompt 的行为指令 */
  doctrine: string;
  /** 规则AI 的难度调整 (给 aiExecuteTurn 用的) */
  blueDifficulty: AIDifficulty;
}

const TACTICAL_STYLES: Record<string, TacticalStyle> = {
  balanced: {
    id: 'balanced',
    name: '⚖️ 均衡',
    description: '灵活决策，根据战场局势在攻守之间切换',
    doctrine: `You are a balanced commander. Your principles:
- Attack when you have advantage (more allies nearby, enemy low HP)
- Defend when outnumbered or outgunned
- Move to cover and key terrain positions
- Prioritize high-value targets (artillery, anti-tank, commanders)
- Keep units in mutual support range (within 2-3 cells of each other)
- Balance aggression with preservation — don't sacrifice units unnecessarily`,
    blueDifficulty: 'normal',
  },
  aggressive: {
    id: 'aggressive',
    name: '🔥 激进',
    description: '不惜代价冲锋，优先消灭敌人，不退缩不退让',
    doctrine: `You are an AGGRESSIVE commander who never retreats. Your doctrine:
- ALWAYS attack if any enemy is in range — never pass up a shot
- Move towards the nearest enemy every turn, closing distance aggressively
- Prioritize finishing off damaged enemies over spreading damage
- Ignore low HP — attack at full strength even if your unit is damaged
- Push tanks forward into enemy lines, use IFVs to support closely
- NEVER hold position unless ALL enemies are destroyed
- Victory or death — accept casualties to achieve breakthrough`,
    blueDifficulty: 'hard',
  },
  defensive: {
    id: 'defensive',
    name: '🛡️ 防守',
    description: '固守阵地，等待敌人进攻，防守反击消耗对方',
    doctrine: `You are a DEFENSIVE commander who holds the line. Your principles:
- Prioritize taking cover in terrain with defense bonus (cities, forest, mountain)
- Only attack when enemy moves into your kill zone or threatens your position
- Maintain formation — units should stay within 2 cells of each other
- When damaged, retreat behind friendlies to heal/recover
- Focus on preserving your units — avoid risky engagements
- Let the enemy come to you and exhaust themselves attacking your fortified positions
- Counter-attack only when enemy is weakened and overextended`,
    blueDifficulty: 'easy',
  },
  cautious: {
    id: 'cautious',
    name: '👁️ 谨慎',
    description: '侦察优先，远程消耗，低血量立即撤退保存实力',
    doctrine: `You are a CAUTIOUS commander who values intelligence and preservation. Your principles:
- Scouts and recon units move first to reveal enemy positions
- Artillery and long-range units attack from maximum safe distance
- Only engage when you clearly outnumber or outgun the enemy
- Retreat any unit below 50% HP to safety immediately
- Avoid moving into unknown areas — let scouts reveal first
- Prefer ranged attacks over melee-range engagements
- Maintain at least 3 cells between your units and unknown areas`,
    blueDifficulty: 'normal',
  },
  flanking: {
    id: 'flanking',
    name: '⚡ 迂回',
    description: '避开正面防线，快速机动绕到侧翼和后方包抄',
    doctrine: `You are a FLANKING commander who outmaneuvers the enemy. Your principles:
- Identify the enemy's strongest defended direction and AVOID it
- Move units around the edges of the map to attack from unexpected angles
- Split your forces — send half to pin the enemy front, half to flank
- Prioritize movement over attacking — position is more important than damage
- When flank is established, attack from multiple directions simultaneously
- Target enemy rear units (artillery, supply, SAM) first
- Use fast units (scouts, IFVs, helicopters) for flanking maneuvers`,
    blueDifficulty: 'normal',
  },
  focused: {
    id: 'focused',
    name: '🎯 集火',
    description: '集中所有火力逐个消灭敌人，不分散伤害',
    doctrine: `You are a FOCUSED commander who eliminates targets one by one. Your principles:
- Identify the weakest or most dangerous enemy and focus ALL available fire on it
- Don't spread damage across multiple targets — finish one before switching
- Prioritize enemy units that are already damaged
- Coordinate attacks: have multiple units attack the same target in one turn
- Eliminate threats systematically: anti-tank first, then artillery, then armor, then infantry
- If no single target can be killed this turn, concentrate on the most dangerous one
- Communicate target priority to all units — everyone fires on the same target`,
    blueDifficulty: 'hard',
  },
  hit_and_run: {
    id: 'hit_and_run',
    name: '🏃 游击',
    description: '快速部队打了就跑，消耗敌人，避免持久正面交火',
    doctrine: `You are a HIT-AND-RUN commander who fights a war of attrition. Your principles:
- Attack from maximum range, then immediately move away from counter-attack range
- Never end your turn adjacent to an enemy who can attack back
- Prioritize speed — move to attack position, shoot, then move to safety in same turn if possible
- Target enemy supply units and artillery to cripple their logistics
- Use terrain for hit-and-fade tactics: pop out, shoot, retreat behind cover
- Avoid fair fights — only engage when you have numerical advantage at point of contact
- Wear down the enemy over time through repeated harassing strikes`,
    blueDifficulty: 'normal',
  },
};

// ============================================================
// 第1部分: 地图生成
// ============================================================
async function generateBattleMap(): Promise<{ gameMap: GameMap; regionTile?: RegionTile; mapName: string }> {
  if (MAP_TYPE === 'world-atlas') {
    console.log(`\n${MINOR}`);
    console.log('  生成 WorldAtlas 拟真地图...');
    console.log(`${MINOR}`);

    const config: WorldAtlasConfig = { ...DEBUG_WORLD_ATLAS_CONFIG, seed: SEED };
    const atlas = generateWorldAtlas(config);
    const region = generateRegionTile(atlas, 0, 0);

    // 找有城市的 chunk 或居中
    const chunks = region.strategicChunks;
    const cityChunk = chunks.flat().find(c => c.features.hasCity);
    const chunk = cityChunk ?? chunks[Math.floor(chunks.length / 2)]?.[Math.floor(chunks[0].length / 2)];

    const opView = getOperationViewForChunk(region, chunk!, 128);
    const cx = opView.worldRect.x + Math.floor(opView.worldRect.width / 2);
    const cy = opView.worldRect.y + Math.floor(opView.worldRect.height / 2);

    const viewport = getCombatViewportFromOperationCell({
      regionTile: region,
      cellPosition: { globalX: cx, globalY: cy },
      width: 16,
      height: 12,
    });

    const gameMap = convertCombatViewportToGameMap(viewport);
    const terrainMix: Record<string, number> = {};
    for (const row of gameMap.cells) for (const c of row) terrainMix[c.terrain] = (terrainMix[c.terrain] ?? 0) + 1;

    console.log(`    地图: ${gameMap.width}x${gameMap.height} (来自 RegionTile → CombatViewport)`);
    console.log(`    地形: ${JSON.stringify(terrainMix)}`);
    console.log(`    Region 城市: ${region.cities.length}, 道路: ${region.roads.length}, 河流: ${region.rivers.length}`);

    return { gameMap, regionTile: region, mapName: `WorldAtlas_${SEED}` };
  }

  // Fallback: 使用 procedural map
  const { generateMap } = await import('./src/game/map');
  const gameMap = generateMap('random');
  console.log(`\n${MINOR}`);
  console.log(`  使用 procedural 地图: ${gameMap.width}x${gameMap.height}`);
  console.log(`${MINOR}`);

  return { gameMap, mapName: 'procedural-random' };
}

// ============================================================
// 第2部分: 编队配置
// ============================================================
interface ForceComposition {
  name: string;
  description: string;
  units: Array<{ type: UnitType; count: number; namePrefix: string }>;
}

const FORCE_COMPOSITIONS: Record<string, ForceComposition> = {
  'armored_assault': {
    name: '装甲突击群',
    description: '以重型坦克为核心，配合步战车推进。正面突击能力强，但缺乏步兵和支援。',
    units: [
      { type: 'tank', count: 4, namePrefix: '虎式' },
      { type: 'tank', count: 2, namePrefix: '豹式' },
      { type: 'ifv', count: 3, namePrefix: '游骑兵' },
      { type: 'scout', count: 1, namePrefix: '鹰眼' },
    ],
  },
  'infantry_defense': {
    name: '步兵防御群',
    description: '以步兵为核心，配合反坦克导弹和工程兵。擅长城市和复杂地形防守。',
    units: [
      { type: 'infantry', count: 6, namePrefix: '铁拳' },
      { type: 'atgm', count: 3, namePrefix: '标枪' },
      { type: 'engineer', count: 2, namePrefix: '工兵' },
      { type: 'sam', count: 1, namePrefix: '天网' },
    ],
  },
  'artillery_support': {
    name: '炮兵支援群',
    description: '以远程火炮和火箭炮为核心。远距离火力压制，但近战脆弱。',
    units: [
      { type: 'artillery', count: 3, namePrefix: '雷霆' },
      { type: 'mlrs', count: 2, namePrefix: '风暴' },
      { type: 'supply', count: 2, namePrefix: '补给' },
      { type: 'infantry', count: 2, namePrefix: '护卫' },
    ],
  },
  'combined_arms': {
    name: '合成战斗群',
    description: '均衡编成：坦克、步兵、炮兵、侦察、防空齐全。适应各种战场。',
    units: [
      { type: 'tank', count: 2, namePrefix: '虎式' },
      { type: 'ifv', count: 2, namePrefix: '游骑兵' },
      { type: 'infantry', count: 3, namePrefix: '铁拳' },
      { type: 'artillery', count: 1, namePrefix: '雷霆' },
      { type: 'scout', count: 1, namePrefix: '鹰眼' },
      { type: 'sam', count: 1, namePrefix: '天网' },
    ],
  },
  'recon_strike': {
    name: '侦察打击群',
    description: '高机动单位为主：侦察车、直升机、无人机。快速侦察，精确打击。',
    units: [
      { type: 'scout', count: 3, namePrefix: '鹰眼' },
      { type: 'helicopter', count: 2, namePrefix: '阿帕奇' },
      { type: 'uav', count: 2, namePrefix: '渡鸦' },
      { type: 'ifv', count: 2, namePrefix: '游骑兵' },
    ],
  },
};

interface Scenario {
  redForce: string;
  blueForce: string;
  description: string;
  mapHint?: string;
}

const SCENARIOS: Scenario[] = [
  { redForce: 'armored_assault', blueForce: 'infantry_defense', description: '装甲突击 vs 步兵防守 — 矛与盾的对决' },
  { redForce: 'combined_arms', blueForce: 'combined_arms', description: '合成战斗群正面对决 — 势均力敌的较量' },
  { redForce: 'armored_assault', blueForce: 'artillery_support', description: '装甲突击 vs 炮兵支援 — 近距离突击 vs 远程火力' },
  { redForce: 'recon_strike', blueForce: 'combined_arms', description: '侦察打击 vs 合成战斗群 — 轻装高机动 vs 重装全面' },
];

// ============================================================
// 大规模战斗配置 (--big)
// ============================================================
const BIG_RED_FORCE: ForceComposition = {
  name: '装甲机械化旅',
  description: '4坦克 + 3步战 + 3步兵 + 1炮兵 + 1防空 + 1侦察 = 13单位',
  units: [
    { type: 'tank', count: 3, namePrefix: '虎式重坦' },
    { type: 'tank', count: 1, namePrefix: '豹式中坦' },
    { type: 'ifv', count: 3, namePrefix: '游骑兵' },
    { type: 'infantry', count: 3, namePrefix: '铁拳步兵' },
    { type: 'artillery', count: 1, namePrefix: '雷霆火炮' },
    { type: 'sam', count: 1, namePrefix: '天网防空' },
    { type: 'scout', count: 1, namePrefix: '鹰眼侦察' },
  ],
};

const BIG_BLUE_FORCE: ForceComposition = {
  name: '联合防御旅',
  description: '2坦克 + 3ATGM + 3步兵 + 2炮兵 + 2工兵 + 1防空 + 1火箭炮 = 14单位',
  units: [
    { type: 'tank', count: 2, namePrefix: 'M1重坦' },
    { type: 'atgm', count: 3, namePrefix: '标枪导弹' },
    { type: 'infantry', count: 3, namePrefix: '步兵班' },
    { type: 'artillery', count: 2, namePrefix: 'M109火炮' },
    { type: 'engineer', count: 2, namePrefix: '工兵' },
    { type: 'sam', count: 1, namePrefix: '爱国者' },
    { type: 'mlrs', count: 1, namePrefix: '海马斯' },
  ],
};

const STYLE_DUELS: Array<{ redStyle: string; blueStyle: string; name: string }> = [
  { redStyle: 'aggressive', blueStyle: 'defensive', name: '🔥激进 vs 🛡️防守 — 矛与盾' },
  { redStyle: 'flanking', blueStyle: 'focused', name: '⚡迂回 vs 🎯集火 — 机动 vs 集中' },
  { redStyle: 'hit_and_run', blueStyle: 'cautious', name: '🏃游击 vs 👁️谨慎 — 消耗战' },
  { redStyle: 'balanced', blueStyle: 'balanced', name: '⚖️均衡 vs ⚖️均衡 — 基线对照' },
];

// ============================================================
// 第3部分: 部署单位
// ============================================================
function deployForce(
  state: GameState,
  faction: Faction,
  composition: ForceComposition,
  startX: number,
  endX: number,
  startZ: number,
  endZ: number,
): { state: GameState; units: Unit[] } {
  let currentState = state;
  const deployedUnits: Unit[] = [];
  const deployableCells: Position[] = [];

  // 收集可用部署格
  for (let z = startZ; z <= endZ; z++) {
    for (let x = startX; x <= endX; x++) {
      const cell = currentState.map.cells[z]?.[x];
      if (cell && cell.terrain !== 'water' && !cell.unit) {
        deployableCells.push({ x, z });
      }
    }
  }

  // 随机打乱
  for (let i = deployableCells.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [deployableCells[i], deployableCells[j]] = [deployableCells[j], deployableCells[i]];
  }

  let deployIdx = 0;
  let unitCounter = 0;

  for (const comp of composition.units) {
    for (let i = 0; i < comp.count; i++) {
      if (deployIdx >= deployableCells.length) break;
      const pos = deployableCells[deployIdx++];
      const unit = createUnit(comp.type, faction, pos);
      unit.name = `${comp.namePrefix}-${++unitCounter}`;

      // 放到地图上
      const cell = currentState.map.cells[pos.z]?.[pos.x];
      if (cell) cell.unit = unit;

      // 更新 state
      currentState = {
        ...currentState,
        units: [...currentState.units, unit],
      };

      deployedUnits.push(unit);
    }
  }

  return { state: currentState, units: deployedUnits };
}

// ============================================================
// 第4部分: LLM 命令接口
// ============================================================
interface LLMCommandResult {
  unitId?: string;
  action: 'move' | 'attack' | 'hold' | 'retreat';
  targetX?: number;
  targetZ?: number;
  reasoning: string;
}

async function queryLLMForCommand(
  battleState: string,
  unit: Unit,
  possibleActions: string,
  style: TacticalStyle,
): Promise<LLMCommandResult> {
  const apiKey = process.env.OPENAI_API_KEY || process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    console.warn('    [LLM] No API key set, fallback to AI');
    return { action: 'hold', reasoning: 'LLM unavailable' };
  }

  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.deepseek.com';
  const model = process.env.LLM_MODEL || 'deepseek-chat';

  const prompt = `You are commanding a military unit in a turn-based tactical wargame on a 16x12 grid. Follow your tactical doctrine strictly.

=== YOUR DOCTRINE (${style.name}) ===
${style.doctrine}

=== BATTLE STATE ===
${battleState}

=== CURRENT UNIT ===
${unit.name} (${unit.type}), Faction: ${unit.faction}
Position: (${unit.position.x}, ${unit.position.z})
HP: ${unit.stats.hp}/${unit.stats.maxHp}  Attack: ${unit.stats.attack}  Defense: ${unit.stats.defense}
Armor: ${unit.stats.armor}  Penetration: ${unit.stats.armorPenetration}
Range: ${unit.stats.attackRange}  Move: ${unit.stats.moveRange}
Ammo: ${unit.stats.ammo ?? 'unlimited'}

=== POSSIBLE ACTIONS ===
${possibleActions}

Respond ONLY with VALID JSON, no markdown, no extra text:
{"action":"move","targetX":5,"targetZ":3,"reasoning":"your tactical reason"}
{"action":"attack","targetX":10,"targetZ":3,"reasoning":"your tactical reason"}
{"action":"hold","reasoning":"why you pass this turn"}`;

  try {
    const response = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: `You are a tactical battle AI following the ${style.name} doctrine. Respond ONLY with valid JSON: {"action":"move"|"attack"|"hold", "targetX":number, "targetZ":number, "reasoning":"string"}` },
          { role: 'user', content: prompt },
        ],
        temperature: 0.5,
        max_tokens: 250,
        response_format: { type: 'json_object' },
      }),
    });

    const data = await response.json();
    if (!data.choices?.[0]?.message?.content) {
      console.warn(`    [LLM] Empty response: ${JSON.stringify(data).slice(0, 200)}`);
      return { action: 'hold', reasoning: 'LLM empty response' };
    }

    const text = data.choices[0].message.content;
    // Extract JSON from response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const result = JSON.parse(jsonMatch[0]);
      return {
        unitId: result.unitId,
        action: ['move', 'attack', 'hold', 'retreat'].includes(result.action) ? result.action : 'hold',
        targetX: typeof result.targetX === 'number' ? result.targetX : undefined,
        targetZ: typeof result.targetZ === 'number' ? result.targetZ : undefined,
        reasoning: typeof result.reasoning === 'string' ? result.reasoning : 'LLM decision',
      };
    }
    console.warn(`    [LLM] No JSON in response: ${text.slice(0, 150)}`);
  } catch (err: any) {
    console.warn(`    [LLM] Error: ${err.message}`);
  }

  return { action: 'hold', reasoning: 'LLM parse error — fallback' };
}

// ============================================================
// 第5部分: 战斗日志渲染
// ============================================================
function renderBattleState(state: GameState): string {
  const lines: string[] = [];
  lines.push(`Turn ${state.turn}, ${state.currentFaction}'s turn`);
  lines.push(`Weather: ${state.currentWeather}`);

  const redUnits = state.units.filter(u => u.faction === 'red' && u.isAlive);
  const blueUnits = state.units.filter(u => u.faction === 'blue' && u.isAlive);

  lines.push(`\nRed (${redUnits.length} alive):`);
  for (const u of redUnits) {
    const ammoInfo = u.stats.ammo !== undefined ? `, ammo:${u.stats.ammo}/${u.stats.maxAmmo}` : '';
    lines.push(`  ${u.name} at (${u.position.x},${u.position.z}) HP:${u.stats.hp}/${u.stats.maxHp}${ammoInfo}`);
  }

  lines.push(`\nBlue (${blueUnits.length} alive):`);
  for (const u of blueUnits) {
    const ammoInfo = u.stats.ammo !== undefined ? `, ammo:${u.stats.ammo}/${u.stats.maxAmmo}` : '';
    lines.push(`  ${u.name} at (${u.position.x},${u.position.z}) HP:${u.stats.hp}/${u.stats.maxHp}${ammoInfo}`);
  }

  return lines.join('\n');
}

// ============================================================
// 第6部分: 主战斗循环
// ============================================================
async function runBattle(
  state: GameState,
  scenario: Scenario,
  useLLM: boolean,
  redStyle: TacticalStyle,
  blueStyle: TacticalStyle,
): Promise<{ state: GameState; battleLogEvents: BattleLogEvent[] }> {
  console.log(`\n${MINOR}`);
  console.log(`  🔴红方: ${redStyle.name} | 🔵蓝方: ${blueStyle.name}`);
  console.log(`${MINOR}`);

  const MAX_TURNS = 30;
  let currentState = state;
  const allBattleLogEvents: BattleLogEvent[] = [];

  for (let round = 0; round < MAX_TURNS; round++) {
    const redAlive = currentState.units.filter(u => u.faction === 'red' && u.isAlive).length;
    const blueAlive = currentState.units.filter(u => u.faction === 'blue' && u.isAlive).length;
    if (redAlive === 0 || blueAlive === 0) break;

    const actingFaction = currentState.currentFaction;
    const isRed = actingFaction === 'red';
    const style = isRed ? redStyle : blueStyle;
    const emoji = isRed ? '🔴' : '🔵';
    const label = isRed ? 'Red' : 'Blue';

    if (useLLM) {
      console.log(`\n  [Turn ${currentState.turn}] ${emoji} ${label} LLM 回合 [${style.name}] (${redAlive} vs ${blueAlive})...`);
      const battleSummary = renderBattleState(currentState);

      for (const unit of currentState.units.filter(u => u.faction === actingFaction && u.isAlive && (u.canMove || u.canAttack))) {
        const movable = getMovablePositions(currentState, unit);
        const attackable = getAttackablePositions(currentState, unit);
        if (movable.length === 0 && attackable.length === 0) continue;

        const actionDesc = [
          movable.length > 0 ? `Move to: ${movable.slice(0, 5).map(p => `(${p.x},${p.z})`).join(' ')}${movable.length > 5 ? ` +${movable.length - 5} more` : ''}` : 'Cannot move',
          attackable.length > 0 ? `Attack: ${attackable.slice(0, 5).map(p => `(${p.x},${p.z})`).join(' ')}${attackable.length > 5 ? ` +${attackable.length - 5} more` : ''}` : 'No targets in range',
        ].join('\n');

        const cmd = await queryLLMForCommand(battleSummary, unit, actionDesc, style);
        console.log(`    ${unit.name} (${unit.stats.hp}HP): ${cmd.action}${cmd.action !== 'hold' ? ` → (${cmd.targetX},${cmd.targetZ})` : ''} — ${cmd.reasoning}`);

        if (cmd.action === 'move' && cmd.targetX !== undefined && cmd.targetZ !== undefined) {
          const targetPos = { x: cmd.targetX, z: cmd.targetZ };
          if (movable.some(p => p.x === targetPos.x && p.z === targetPos.z)) {
            currentState = moveUnit(currentState, unit, targetPos);
          }
        } else if (cmd.action === 'attack' && cmd.targetX !== undefined && cmd.targetZ !== undefined) {
          const targetPos = { x: cmd.targetX, z: cmd.targetZ };
          if (attackable.some(p => p.x === targetPos.x && p.z === targetPos.z)) {
            currentState = attackUnit(currentState, unit, targetPos);
            const targetCell = currentState.map.cells[targetPos.z]?.[targetPos.x];
            if (targetCell?.unit) {
              allBattleLogEvents.push({
                id: `evt_${Date.now()}_${unit.id}`,
                turn: currentState.turn, time: Date.now(),
                type: 'shot_fired', actorUnitId: unit.id, targetUnitId: targetCell.unit.id,
                confirmedByPlayer: true, visibilityConfidence: 'confirmed',
                message: `[LLM/${style.id}] ${unit.name} attacks ${targetCell.unit.name}`,
              });
            }
          }
        }
      }
    } else {
      console.log(`\n  [Turn ${currentState.turn}] ${emoji} ${label} AI 回合 (${redAlive} vs ${blueAlive})...`);
      currentState = aiExecuteTurn(currentState);
      for (const log of currentState.combatLog.filter(l => l.turn === currentState.turn)) {
        allBattleLogEvents.push({
          id: `evt_${Date.now()}_${log.attacker}`,
          turn: log.turn, time: Date.now(),
          type: log.eventType === 'destroy' ? 'unit_damaged' : 'shot_fired',
          actorUnitId: log.attackerUnitId, targetUnitId: log.defenderUnitId,
          confirmedByPlayer: true, visibilityConfidence: 'confirmed',
          message: `[AI] ${log.attacker} → ${log.defender} (${log.damage}dmg${log.eventType === 'destroy' ? ', DESTROYED' : ''})`,
        });
      }
      continue; // aiExecuteTurn already calls endTurn()
    }

    // Record events for LLM turns
    for (const log of currentState.combatLog.filter(l => l.turn === currentState.turn)) {
      allBattleLogEvents.push({
        id: `evt_${Date.now()}_${log.attacker}`,
        turn: log.turn, time: Date.now(),
        type: log.eventType === 'destroy' ? 'unit_damaged' : 'shot_fired',
        actorUnitId: log.attackerUnitId, targetUnitId: log.defenderUnitId,
        confirmedByPlayer: true, visibilityConfidence: 'confirmed',
        message: `[${label}] ${log.attacker} → ${log.defender} (${log.damage}dmg${log.eventType === 'destroy' ? ', DESTROYED' : ''})`,
      });
    }

    currentState = endTurn(currentState);
  }

  return { state: currentState, battleLogEvents: allBattleLogEvents };
}

// ============================================================
// 第7部分: 战况总结
// ============================================================
function printBattleResult(state: GameState, scenario: Scenario, events: BattleLogEvent[]) {
  const alive = (f: Faction) => state.units.filter(u => u.faction === f && u.isAlive).length;
  const redAlive = alive('red');
  const blueAlive = alive('blue');
  const redKills = state.battleStats.red.kills;
  const blueKills = state.battleStats.blue.kills;
  const redDamage = state.battleStats.red.damageDealt;
  const blueDamage = state.battleStats.blue.damageDealt;

  let winner: string;
  if (redAlive === 0 && blueAlive === 0) winner = '双亡 — 惨烈的消耗战';
  else if (redAlive === 0) winner = '蓝方胜利';
  else if (blueAlive === 0) winner = '红方胜利';
  else winner = '未分胜负';

  console.log(`\n${SEP}`);
  console.log(`  战斗结果: ${scenario.description}`);
  console.log(`${SEP}`);
  console.log(`  回合: ${state.turn}`);
  console.log(`  结果: ${winner}`);
  console.log(`  红方: ${redAlive} 存活, ${redKills} 击杀, ${redDamage} 总伤害`);
  console.log(`  蓝方: ${blueAlive} 存活, ${blueKills} 击杀, ${blueDamage} 总伤害`);

  console.log(`\n  幸存单位:`);
  for (const u of state.units.filter(u => u.isAlive)) {
    const xpStr = u.level > 1 ? ` Lv${u.level}` : '';
    console.log(`    [${u.faction}] ${u.name} (${u.type})${xpStr} HP:${u.stats.hp}/${u.stats.maxHp} Kills:${u.killCount}`);
  }

  // 战斗事件统计
  if (events.length > 0) {
    const eventTypes: Record<string, number> = {};
    for (const e of events) eventTypes[e.type] = (eventTypes[e.type] ?? 0) + 1;
    console.log(`\n  战斗事件: ${events.length} total — ${JSON.stringify(eventTypes)}`);
  }

  return { winner, redAlive, blueAlive, redKills, blueKills, redDamage, blueDamage };
}

// ============================================================
// 第8部分: 报告生成
// ============================================================
function generateBattleReports(state: GameState, events: BattleLogEvent[], scenario: Scenario): AIReport[] {
  const commanderId = `commander_${scenario.redForce}_vs_${scenario.blueForce}`;

  return generateReportsFromBattleLog({
    events,
    turn: state.turn,
    commanderId,
    relatedForceIds: state.units.map(u => u.id),
  });
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  console.log(SEP);
  console.log('  AI BATTLE SIMULATOR');
  console.log(`  LLM Enabled: ${USE_LLM} | Seed: ${SEED} | Map: ${MAP_TYPE}`);
  console.log(SEP);

  const redStyle = TACTICAL_STYLES[RED_STYLE];
  const blueStyle = TACTICAL_STYLES[BLUE_STYLE];
  if (!redStyle) {
    console.error(`Unknown red style: ${RED_STYLE}. Available: ${Object.keys(TACTICAL_STYLES).join(', ')}`);
    process.exit(1);
  }
  if (!blueStyle) {
    console.error(`Unknown blue style: ${BLUE_STYLE}. Available: ${Object.keys(TACTICAL_STYLES).join(', ')}`);
    process.exit(1);
  }

  // 1. 生成地图
  console.log('\n[阶段1] 生成战场地图...');
  const { gameMap, regionTile, mapName } = await generateBattleMap();
  console.log(`  地图: ${mapName}, 尺寸: ${gameMap.width}x${gameMap.height}`);
  console.log(`  🔴红方: ${redStyle.name} (${RED_STYLE}) | 🔵蓝方: ${blueStyle.name} (${BLUE_STYLE})`);

  // ============================================================
  // --big 模式: 大规模 13v14 战斗, 风格对决
  // ============================================================
  if (BIG_MODE) {
    console.log(`\n${SEP}`);
    console.log('  大规模战斗模式 — 13 vs 14 单位');
    console.log(`${SEP}`);
    console.log(`  红方: ${BIG_RED_FORCE.name} (${BIG_RED_FORCE.units.reduce((s, u) => s + u.count, 0)} 单位)`);
    console.log(`  蓝方: ${BIG_BLUE_FORCE.name} (${BIG_BLUE_FORCE.units.reduce((s, u) => s + u.count, 0)} 单位)`);
    for (const u of BIG_RED_FORCE.units) console.log(`    🔴 ${u.namePrefix} x${u.count} (${u.type})`);
    for (const u of BIG_BLUE_FORCE.units) console.log(`    🔵 ${u.namePrefix} x${u.count} (${u.type})`);

    const duelResults: Array<{
      duel: typeof STYLE_DUELS[0];
      redStyle: TacticalStyle; blueStyle: TacticalStyle;
      redAlive: number; blueAlive: number;
      redKills: number; blueKills: number;
      redDamage: number; blueDamage: number;
      winner: string; turns: number;
    }> = [];

    for (let di = 0; di < STYLE_DUELS.length; di++) {
      const duel = STYLE_DUELS[di];
      const rs = TACTICAL_STYLES[duel.redStyle];
      const bs = TACTICAL_STYLES[duel.blueStyle];

      console.log(`\n\n=== 对决 ${di + 1}/${STYLE_DUELS.length}: ${duel.name} ===`);

      let state = initGameStateFromMap(gameMap, 'normal');
      state = {
        ...state,
        units: [],
        map: { ...state.map, cells: state.map.cells.map(row => row.map(cell => ({ ...cell, unit: null }))) },
      };

      const redResult = deployForce(state, 'red', BIG_RED_FORCE, 0, Math.floor(gameMap.width * 0.35), 0, gameMap.height - 1);
      state = redResult.state;
      const blueResult = deployForce(state, 'blue', BIG_BLUE_FORCE, Math.floor(gameMap.width * 0.65), gameMap.width - 1, 0, gameMap.height - 1);
      state = blueResult.state;

      const { state: finalState } = await runBattle(state, { redForce: '', blueForce: '', description: duel.name }, USE_LLM, rs, bs);

      const redAlive = finalState.units.filter(u => u.faction === 'red' && u.isAlive).length;
      const blueAlive = finalState.units.filter(u => u.faction === 'blue' && u.isAlive).length;
      const winner = redAlive === 0 ? '🔵蓝方胜' : blueAlive === 0 ? '🔴红方胜' : '⚪未分';

      duelResults.push({
        duel,
        redStyle: rs, blueStyle: bs,
        redAlive, blueAlive,
        redKills: finalState.battleStats.red.kills,
        blueKills: finalState.battleStats.blue.kills,
        redDamage: finalState.battleStats.red.damageDealt,
        blueDamage: finalState.battleStats.blue.damageDealt,
        winner, turns: finalState.turn,
      });

      console.log(`\n  → ${winner} | 红 ${redAlive}活 ${finalState.battleStats.red.kills}杀 | 蓝 ${blueAlive}活 ${finalState.battleStats.blue.kills}杀 | 回合 ${finalState.turn}`);
    }

    // 对决结果表
    console.log(`\n\n${SEP}`);
    console.log('  风格对决结果');
    console.log(SEP);
    console.log(`  ${'对决'.padEnd(30)} ${'结果'.padEnd(12)} ${'红活'.padEnd(6)} ${'蓝活'.padEnd(6)} ${'红杀'.padEnd(6)} ${'蓝杀'.padEnd(6)} ${'红伤'.padEnd(8)} ${'回合'}`);
    console.log(`  ${'─'.repeat(86)}`);
    for (const r of duelResults) {
      console.log(`  ${r.duel.name.padEnd(30)} ${r.winner.padEnd(12)} ${String(r.redAlive).padEnd(6)} ${String(r.blueAlive).padEnd(6)} ${String(r.redKills).padEnd(6)} ${String(r.blueKills).padEnd(6)} ${String(r.redDamage).padEnd(8)} ${r.turns}`);
    }

    // 排名
    duelResults.sort((a, b) => (b.redKills - b.blueKills) - (a.redKills - a.blueKills));
    console.log(`\n  红方风格排名 (按净击杀):`);
    for (let i = 0; i < duelResults.length; i++) {
      const r = duelResults[i];
      const net = r.redKills - r.blueKills;
      console.log(`    ${i + 1}. ${r.redStyle.name} vs ${r.blueStyle.name} — 净击杀 ${net > 0 ? '+' : ''}${net} (红${r.redKills}杀:蓝${r.blueKills}杀)`);
    }

    console.log(`\n${SEP}`);
    console.log('  完成！');
    console.log(SEP);
    return;
  }

  // ============================================================
  // --compare-styles 模式: 同一场景对比所有风格
  // ============================================================
  if (COMPARE_STYLES) {
    const scenario = SCENARIOS[0]; // 用第一个场景做对比
    const redComp = FORCE_COMPOSITIONS[scenario.redForce];
    const blueComp = FORCE_COMPOSITIONS[scenario.blueForce];

    console.log(`\n${SEP}`);
    console.log(`  风格对比模式: ${scenario.description}`);
    console.log(`  红方: ${redComp.name} | 蓝方: ${blueComp.name} [hard]`);
    console.log(SEP);

    const styleResults: Array<{ style: TacticalStyle; redAlive: number; blueAlive: number; redKills: number; blueKills: number; redDamage: number; blueDamage: number; winner: string }> = [];

    for (const [styleKey, testStyle] of Object.entries(TACTICAL_STYLES)) {
      console.log(`\n  === ${testStyle.name} ===`);

      let state = initGameStateFromMap(gameMap, 'hard');
      state = {
        ...state,
        units: [],
        map: { ...state.map, cells: state.map.cells.map(row => row.map(cell => ({ ...cell, unit: null }))) },
      };

      const redResult = deployForce(state, 'red', redComp, 0, Math.floor(gameMap.width * 0.4), 0, gameMap.height - 1);
      state = redResult.state;
      const blueResult = deployForce(state, 'blue', blueComp, Math.floor(gameMap.width * 0.6), gameMap.width - 1, 0, gameMap.height - 1);
      state = blueResult.state;

      const { state: finalState, battleLogEvents } = await runBattle(state, scenario, USE_LLM, testStyle, blueStyle);

      const redAlive = finalState.units.filter(u => u.faction === 'red' && u.isAlive).length;
      const blueAlive = finalState.units.filter(u => u.faction === 'blue' && u.isAlive).length;
      const winner = redAlive === 0 ? '蓝方胜' : blueAlive === 0 ? '红方胜' : '未分';

      styleResults.push({
        style: testStyle,
        redAlive, blueAlive,
        redKills: finalState.battleStats.red.kills,
        blueKills: finalState.battleStats.blue.kills,
        redDamage: finalState.battleStats.red.damageDealt,
        blueDamage: finalState.battleStats.blue.damageDealt,
        winner,
      });

      console.log(`    结果: ${winner} | 红 ${redAlive}活 ${finalState.battleStats.red.kills}杀 | 蓝 ${blueAlive}活 ${finalState.battleStats.blue.kills}杀`);
    }

    // 风格对比表
    console.log(`\n${SEP}`);
    console.log('  风格对比结果');
    console.log(SEP);
    console.log(`  ${'风格'.padEnd(16)} ${'结果'.padEnd(10)} ${'红存活'.padEnd(8)} ${'蓝存活'.padEnd(8)} ${'红击杀'.padEnd(8)} ${'蓝击杀'.padEnd(8)} ${'红伤害'.padEnd(8)}`);
    console.log(`  ${'─'.repeat(80)}`);
    for (const r of styleResults) {
      console.log(`  ${r.style.name.padEnd(16)} ${r.winner.padEnd(10)} ${String(r.redAlive).padEnd(8)} ${String(r.blueAlive).padEnd(8)} ${String(r.redKills).padEnd(8)} ${String(r.blueKills).padEnd(8)} ${String(r.redDamage).padEnd(8)}`);
    }

    // 排名
    styleResults.sort((a, b) => (b.redKills - b.blueKills) - (a.redKills - a.blueKills));
    console.log(`\n  风格排名 (按净击杀):`);
    for (let i = 0; i < styleResults.length; i++) {
      const r = styleResults[i];
      const net = r.redKills - r.blueKills;
      console.log(`    ${i + 1}. ${r.style.name} — 净击杀 ${net > 0 ? '+' : ''}${net}`);
    }

    console.log(`\n${SEP}`);
    console.log('  完成！');
    console.log(SEP);
    return;
  }

  // ============================================================
  // 正常模式: 所有场景用选定风格
  // ============================================================
  const results: Array<{
    scenario: Scenario;
    winner: string;
    redAlive: number; blueAlive: number;
    redKills: number; blueKills: number;
    redDamage: number; blueDamage: number;
    reports: AIReport[];
  }> = [];

  for (let si = 0; si < SCENARIOS.length; si++) {
    const scenario = SCENARIOS[si];
    const redComp = FORCE_COMPOSITIONS[scenario.redForce];
    const blueComp = FORCE_COMPOSITIONS[scenario.blueForce];

    console.log(`\n\n${SEP}`);
    console.log(`  场景 ${si + 1}/${SCENARIOS.length}: ${scenario.description}`);
    console.log(`  红方: ${redComp.name} [${redStyle.name}] | 蓝方: ${blueComp.name} [${blueStyle.name}]`);
    console.log(SEP);

    console.log(`\n  红方编成:`);
    for (const u of redComp.units) console.log(`    ${u.namePrefix} x${u.count} (${u.type})`);
    console.log(`  蓝方编成:`);
    for (const u of blueComp.units) console.log(`    ${u.namePrefix} x${u.count} (${u.type})`);

    let state = initGameStateFromMap(gameMap, 'normal');
    state = {
      ...state,
      units: [],
      map: { ...state.map, cells: state.map.cells.map(row => row.map(cell => ({ ...cell, unit: null }))) },
    };

    const redResult = deployForce(state, 'red', redComp, 0, Math.floor(gameMap.width * 0.4), 0, gameMap.height - 1);
    state = redResult.state;
    console.log(`\n  部署红方: ${redResult.units.length} 单位`);

    const blueResult = deployForce(state, 'blue', blueComp, Math.floor(gameMap.width * 0.6), gameMap.width - 1, 0, gameMap.height - 1);
    state = blueResult.state;
    console.log(`  部署蓝方: ${blueResult.units.length} 单位`);

    const { state: finalState, battleLogEvents } = await runBattle(state, scenario, USE_LLM, redStyle, blueStyle);

    const result = printBattleResult(finalState, scenario, battleLogEvents);

    const reports = generateBattleReports(finalState, battleLogEvents, scenario);
    if (reports.length > 0) {
      console.log(`\n  AI 报告 (${reports.length}):`);
      for (const report of reports) {
        console.log(`    [${report.type}] ${report.title}: ${report.summary}`);
      }
    }

    results.push({ ...result, scenario, reports });
  }

  // 最终汇总
  console.log(`\n\n${SEP}`);
  console.log('  最终汇总');
  console.log(SEP);
  console.log(`  地图: ${mapName} (${gameMap.width}x${gameMap.height})`);
  console.log(`  🔴红方: ${redStyle.name} (${RED_STYLE}) | 🔵蓝方: ${blueStyle.name} (${BLUE_STYLE})`);

  for (const r of results) {
    console.log(`\n  ${r.scenario.description}`);
    console.log(`    结果: ${r.winner}`);
    console.log(`    红方: ${r.redAlive}活 ${r.redKills}杀 ${r.redDamage}伤 | 蓝方: ${r.blueAlive}活 ${r.blueKills}杀 ${r.blueDamage}伤`);
    console.log(`    报告: ${r.reports.length} (${r.reports.map(rp => rp.type).join(', ')})`);
  }

  console.log(`\n${SEP}`);
  console.log('  完成！');
  console.log(SEP);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
