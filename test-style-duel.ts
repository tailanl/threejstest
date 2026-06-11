/**
 * Style & Mission Duel — 风格 + 任务 双维度对决
 *
 * 用法:
 *   npx tsx test-style-duel.ts --llm
 *   npx tsx test-style-duel.ts --llm --map urban-warfare
 *   npx tsx test-style-duel.ts --llm --red-mission breakthrough --blue-mission delay
 */

import { generateMap } from './src/game/map';
import { createUnit, initGameStateFromMap, getMovablePositions, getAttackablePositions, moveUnit, attackUnit, endTurn } from './src/game/engine';
import { aiExecuteTurn } from './src/game/ai';
import type { GameMap, GameState, Unit, UnitType, Position, Faction, MapType } from './src/game/types';

const USE_LLM = process.argv.includes('--llm');
function getArg(name: string, def: string): string {
  const eq = process.argv.find(a => a.startsWith(`${name}=`))?.split('=')[1];
  if (eq) return eq;
  const idx = process.argv.indexOf(name);
  if (idx >= 0 && idx + 1 < process.argv.length && !process.argv[idx + 1].startsWith('--'))
    return process.argv[idx + 1];
  return def;
}
const MAP_TYPE = getArg('--map', 'random') as MapType;
const RED_MISSION = getArg('--red-mission', 'breakthrough');
const BLUE_MISSION = getArg('--blue-mission', 'delay');
const RED_STYLE = getArg('--red-style', 'aggressive');
const BLUE_STYLE = getArg('--blue-style', 'defensive');

const SEP = '═'.repeat(72);

// ============================================================
interface TacticalStyle { id: string; name: string; doctrine: string; }
interface Mission {
  id: string; name: string; objective: string; winCondition: string;
  score: (s: GameState, f: Faction, t: number) => number;
  checkWin: (s: GameState, f: Faction, init: number) => boolean;
}

const STYLES: Record<string, TacticalStyle> = {
  aggressive: { id: 'aggressive', name: '🔥激进', doctrine: 'ALWAYS attack if enemy in range. Move towards nearest enemy every turn. Prioritize finishing damaged enemies. Ignore low self HP. NEVER hold.' },
  defensive: { id: 'defensive', name: '🛡️防守', doctrine: 'Hold formation, stay within 2 cells of allies. Move to cover. Only attack when enemy enters kill zone. Retreat damaged units behind friendlies.' },
  flanking: { id: 'flanking', name: '⚡迂回', doctrine: 'Avoid enemy strongest direction. Move around edges. Split forces — pin front, flank sides. Fast units for flanking. Attack rear units first.' },
  focused: { id: 'focused', name: '🎯集火', doctrine: 'All units target the same weakest enemy until destroyed. Don\'t spread damage. Eliminate: anti-tank, artillery, armor, infantry.' },
  hit_and_run: { id: 'hit_and_run', name: '🏃游击', doctrine: 'Attack from max range, then move to safety. Never end turn adjacent to enemy. Use terrain for cover. Avoid fair fights.' },
  cautious: { id: 'cautious', name: '👁️谨慎', doctrine: 'Scouts first. Artillery from max distance. Retreat below 50% HP immediately. Only engage when outnumbering. Keep 3 cells from unknown.' },
  balanced: { id: 'balanced', name: '⚖️均衡', doctrine: 'Attack when advantage. Defend when outnumbered. Move to cover. Prioritize high-value targets. Mutual support range 2-3 cells.' },
};

const MISSIONS: Record<string, Mission> = {
  breakthrough: { id: 'breakthrough', name: '🚀突破防线',
    objective: 'BREAKTHROUGH: Push units past x=11 as fast as possible. Speed > kills. Sacrifice units for breach. Every unit past x=11 is victory.',
    winCondition: '≥1 unit past x=11',
    score: (s, f) => { const c = s.units.filter(u => u.faction === f && u.isAlive && u.position.x >= 11).length; const mx = Math.max(0, ...s.units.filter(u => u.faction === f && u.isAlive).map(u => u.position.x)); return Math.min(100, c * 40 + Math.max(0, mx - 6) * 15); },
    checkWin: (s, f) => s.units.filter(u => u.faction === f && u.isAlive && u.position.x >= 11).length >= 1,
  },
  annihilate: { id: 'annihilate', name: '💀歼灭敌军',
    objective: 'ANNIHILATE: Destroy ALL enemy units. Focus fire. Don\'t let damaged enemies escape. Pursue and destroy.',
    winCondition: 'All enemies dead',
    score: (s, f) => Math.min(100, Math.round(s.battleStats[f].kills / 8 * 100)),
    checkWin: (s, f) => { const o = f === 'red' ? 'blue' : 'red'; return s.units.filter(u => u.faction === o && u.isAlive).length === 0; },
  },
  capture_city: { id: 'capture_city', name: '🏙️占领要地',
    objective: 'CAPTURE: Capture city at (8,5). Move units to occupy it. First priority: reach and control (8,5).',
    winCondition: 'Unit on (8,5)',
    score: (s, f) => { if (s.units.some(u => u.faction === f && u.isAlive && u.position.x === 8 && u.position.z === 5)) return 100; const d = Math.min(...s.units.filter(u => u.faction === f && u.isAlive).map(u => Math.abs(u.position.x - 8) + Math.abs(u.position.z - 5)), 20); return Math.max(0, 100 - d * 10); },
    checkWin: (s, f) => s.units.some(u => u.faction === f && u.isAlive && u.position.x === 8 && u.position.z === 5),
  },
  delay: { id: 'delay', name: '⏰拖延时间',
    objective: 'DELAY: Stall enemy for 10 turns. Survival > kills. Hold positions. Block chokepoints. Pull back slowly — don\'t get surrounded.',
    winCondition: 'No Red past x=11 for 10 turns',
    score: (s, _f, t) => { const c = s.units.filter(u => u.faction === 'red' && u.isAlive && u.position.x >= 11).length; return Math.round((Math.min(100, t * 10) + (c === 0 ? 100 : Math.max(0, 100 - c * 30))) / 2); },
    checkWin: () => true,
  },
  preserve: { id: 'preserve', name: '🛟保存实力',
    objective: 'PRESERVE: Keep units ALIVE. Survival is the ONLY measure. Retreat damaged units immediately. Disengage when pressed.',
    winCondition: '≥4 units alive',
    score: (s, f) => Math.round(s.units.filter(u => u.faction === f && u.isAlive).length / 8 * 100),
    checkWin: (s, f) => s.units.filter(u => u.faction === f && u.isAlive).length >= 4,
  },
  ambush: { id: 'ambush', name: '🎭伏击歼敌',
    objective: 'AMBUSH: Kill ≥3 enemies while losing ≤1. Lure into kill zones. Spring traps from cover. Preserve own units.',
    winCondition: '≥3 kills, ≤1 loss',
    score: (s, f) => { const k = s.battleStats[f].kills; const l = s.units.filter(u => u.faction === f && !u.isAlive).length; return Math.max(0, Math.min(60, k * 20) + 40 - Math.max(0, l * 30)); },
    checkWin: (s, f, init) => { const l = init - s.units.filter(u => u.faction === f && u.isAlive).length; return s.battleStats[f].kills >= 3 && l <= 1; },
  },
};

const RED_UNITS: Array<{ type: UnitType; name: string; pos: Position }> = [
  { type: 'tank', name: '虎-1', pos: { x: 4, z: 3 } }, { type: 'tank', name: '虎-2', pos: { x: 4, z: 8 } },
  { type: 'tank', name: '虎-3', pos: { x: 5, z: 5 } }, { type: 'ifv', name: '游-1', pos: { x: 3, z: 4 } },
  { type: 'ifv', name: '游-2', pos: { x: 3, z: 7 } }, { type: 'infantry', name: '铁-1', pos: { x: 5, z: 2 } },
  { type: 'infantry', name: '铁-2', pos: { x: 5, z: 9 } }, { type: 'scout', name: '鹰眼', pos: { x: 6, z: 5 } },
];

const BLUE_UNITS: Array<{ type: UnitType; name: string; pos: Position }> = [
  { type: 'tank', name: 'M1-1', pos: { x: 11, z: 3 } }, { type: 'tank', name: 'M1-2', pos: { x: 11, z: 8 } },
  { type: 'atgm', name: '标-1', pos: { x: 10, z: 2 } }, { type: 'atgm', name: '标-2', pos: { x: 10, z: 9 } },
  { type: 'infantry', name: '步-1', pos: { x: 12, z: 4 } }, { type: 'infantry', name: '步-2', pos: { x: 12, z: 7 } },
  { type: 'artillery', name: 'M109', pos: { x: 11, z: 5 } }, { type: 'sam', name: '防空', pos: { x: 13, z: 5 } },
];

// ============================================================
// LLM
// ============================================================
async function llmCmd(summary: string, unit: Unit, actions: string, style: TacticalStyle, mission: Mission) {
  const apiKey = process.env.OPENAI_API_KEY;
  const baseUrl = process.env.OPENAI_BASE_URL || 'https://api.deepseek.com';
  const model = process.env.LLM_MODEL || 'deepseek-chat';
  if (!apiKey) return { a: 'hold', tx: 0, tz: 0, r: 'no key' };

  const prompt = `STYLE: ${style.doctrine}\nMISSION: ${mission.objective}\n\nSTATE:\n${summary}\n\nUNIT: ${unit.name}(${unit.type}) HP:${unit.stats.hp}/${unit.stats.maxHp} Atk:${unit.stats.attack} Def:${unit.stats.defense} Pos:(${unit.position.x},${unit.position.z}) Range:${unit.stats.attackRange} Move:${unit.stats.moveRange}\n\nACTIONS:\n${actions}\n\nJSON: {"action":"move","targetX":5,"targetZ":3,"reasoning":"w"}`;

  const r = await fetch(`${baseUrl}/v1/chat/completions`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${apiKey}` },
    body: JSON.stringify({ model, messages: [{ role: 'system', content: 'Tactical AI. JSON only.' }, { role: 'user', content: prompt }], temperature: 0.5, max_tokens: 200, response_format: { type: 'json_object' } }),
  });
  const d = await r.json();
  const t = d.choices?.[0]?.message?.content ?? '{}';
  try { const m = t.match(/\{[\s\S]*\}/); if (m) { const j = JSON.parse(m[0]); return { a: j.action || 'hold', tx: j.targetX, tz: j.targetZ, r: j.reasoning || '' }; } } catch {}
  return { a: 'hold', tx: 0, tz: 0, r: 'parse error' };
}

// ============================================================
function renderState(state: GameState): string {
  const l: string[] = [`Turn ${state.turn}, ${state.currentFaction}`];
  for (const f of ['red', 'blue'] as Faction[])
    l.push(`${f}: ` + state.units.filter(u => u.faction === f && u.isAlive).map(u => `${u.name}(${u.position.x},${u.position.z}) HP${u.stats.hp}`).join(' | '));
  return l.join('\n');
}

function deploy(state: GameState, units: typeof RED_UNITS, faction: Faction): GameState {
  let s = { ...state, units: [...state.units] };
  for (const u of units) {
    const unit = createUnit(u.type, faction, u.pos); unit.name = u.name;
    s.units.push(unit);
    const c = s.map.cells[u.pos.z]?.[u.pos.x]; if (c) c.unit = unit;
  }
  return s;
}

// ============================================================
async function runDuel(
  map: GameMap,
  rs: TacticalStyle, bs: TacticalStyle,
  rm: Mission, bm: Mission,
): Promise<{ rK: number; bK: number; rD: number; bD: number; rA: number; bA: number; t: number; w: string; rS: number; bS: number }> {
  let s = initGameStateFromMap(map, 'normal');
  s = { ...s, units: [], map: { ...s.map, cells: s.map.cells.map(r => r.map(c => ({ ...c, unit: null }))) } };
  s = deploy(s, RED_UNITS, 'red');
  s = deploy(s, BLUE_UNITS, 'blue');

  for (let r = 0; r < 10; r++) {
    const ra = s.units.filter(u => u.faction === 'red' && u.isAlive).length;
    const ba = s.units.filter(u => u.faction === 'blue' && u.isAlive).length;
    if (ra === 0 || ba === 0) break;
    const f = s.currentFaction;
    const style = f === 'red' ? rs : bs;
    const mission = f === 'red' ? rm : bm;
    if (USE_LLM) {
      const summary = renderState(s);
      for (const u of s.units.filter(u => u.faction === f && u.isAlive && (u.canMove || u.canAttack))) {
        const mv = getMovablePositions(s, u), at = getAttackablePositions(s, u);
        if (mv.length === 0 && at.length === 0) continue;
        const act = [mv.length > 0 ? `Move: ${mv.slice(0, 4).map(p => `(${p.x},${p.z})`).join(' ')}` : '', at.length > 0 ? `Attack: ${at.slice(0, 4).map(p => `(${p.x},${p.z})`).join(' ')}` : ''].filter(Boolean).join('\n');
        const cmd = await llmCmd(summary, u, act, style, mission);
        if (cmd.a === 'move' && cmd.tx != null && cmd.tz != null) { const tp = { x: cmd.tx, z: cmd.tz }; if (mv.some(p => p.x === tp.x && p.z === tp.z)) s = moveUnit(s, u, tp); }
        else if (cmd.a === 'attack' && cmd.tx != null && cmd.tz != null) { const tp = { x: cmd.tx, z: cmd.tz }; if (at.some(p => p.x === tp.x && p.z === tp.z)) s = attackUnit(s, u, tp); }
      }
    } else { s = aiExecuteTurn(s); continue; }
    s = endTurn(s);
  }
  const rS = rm.score(s, 'red', s.turn), bS = bm.score(s, 'blue', s.turn);
  const rw = rm.checkWin(s, 'red', 8), bw = bm.checkWin(s, 'blue', 8);
  const ra = s.units.filter(u => u.faction === 'red' && u.isAlive).length;
  const ba = s.units.filter(u => u.faction === 'blue' && u.isAlive).length;
  const w = ra === 0 ? '🔵歼' : ba === 0 ? '🔴歼' : rw && !bw ? '🔴✓' : bw && !rw ? '🔵✓' : rS > bS ? '🔴≈' : bS > rS ? '🔵≈' : '⚪=';
  console.log(`  ${w} | 🔴${ra}活${s.battleStats.red.kills}杀[${rS}%] | 🔵${ba}活${s.battleStats.blue.kills}杀[${bS}%] | ${s.turn}t`);
  return { rK: s.battleStats.red.kills, bK: s.battleStats.blue.kills, rD: s.battleStats.red.damageDealt, bD: s.battleStats.blue.damageDealt, rA: ra, bA: ba, t: s.turn, w, rS, bS };
}

// ============================================================
// MAIN
// ============================================================
async function main() {
  const rs = STYLES[RED_STYLE], bs = STYLES[BLUE_STYLE];
  const rm = MISSIONS[RED_MISSION], bm = MISSIONS[BLUE_MISSION];
  const map = generateMap(MAP_TYPE);

  const terrain: Record<string, number> = {};
  for (const row of map.cells) for (const c of row) terrain[c.terrain] = (terrain[c.terrain] ?? 0) + 1;

  console.log(SEP);
  console.log(`  风格 + 任务 对决`);
  console.log(`  地图: ${MAP_TYPE} ${map.width}x${map.height} — ${JSON.stringify(terrain)}`);
  console.log(`  🔴红方: ${rs.name} | 任务: ${rm.name} — ${rm.winCondition}`);
  console.log(`  🔵蓝方: ${bs.name} | 任务: ${bm.name} — ${bm.winCondition}`);
  console.log(SEP);

  const result = await runDuel(map, rs, bs, rm, bm);

  console.log(`\n  结果: ${result.w}`);
  console.log(`  🔴红方: ${result.rA}活 ${result.rK}杀 ${result.rD}伤 | 任务[${rm.name}]: ${result.rS}%`);
  console.log(`  🔵蓝方: ${result.bA}活 ${result.bK}杀 ${result.bD}伤 | 任务[${bm.name}]: ${result.bS}%`);

  if (result.rS >= 70 && result.bS >= 70) console.log(`  🤝 双方都完成了任务!`);
  else if (result.rS >= 70) console.log(`  🔴 红方任务完成! (${result.rS}%)`);
  else if (result.bS >= 70) console.log(`  🔵 蓝方任务完成! (${result.bS}%)`);
  else console.log(`  ⚪ 双方均未完成任务`);

  console.log(`\n${SEP}\n  完成!\n${SEP}`);
}

main().catch(e => { console.error(e); process.exit(1); });
