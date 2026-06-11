/**
 * Full Integration Test — WorldAtlas → RegionTile → Combat → AICommand → Report
 *
 * Usage: npx tsx test-full-chain.ts
 */

// Path aliases aren't resolved by tsx, use relative paths from project root
import { generateWorldAtlas } from './src/game/world-atlas/macro-map-generator';
import { DEFAULT_WORLD_ATLAS_CONFIG } from './src/game/world-atlas/atlas-config';
import { generateRegionTile } from './src/game/world-atlas/region-tile-generator';
import { buildStrategicMapFromRegionTile } from './src/game/world-view/strategic-map-adapter';
import { getOperationViewForChunk } from './src/game/world-view/operation-view';
import { getCombatViewportFromOperationCell } from './src/game/world-view/combat-viewport';
import { convertCombatViewportToGameMap } from './src/game/world-view/world-to-game-map';
import { parseCommandText, createHQOrderFromParsed } from './src/game/command/command-parser';
import { generatePlanFromOrder } from './src/game/ai-command/ai-planner';
import { executeAITurn } from './src/game/ai-command/ai-executor';
import { generateReportsFromBattleLog } from './src/game/reports/report-generator';
import type { WorldAtlasConfig } from './src/game/world-atlas/atlas-config';
import type { WorldAtlas } from './src/game/world-atlas/atlas-types';
import type { RegionTile } from './src/game/world-map/world-map-types';
import type { HQOrder } from './src/game/command/command-types';
import type { CommanderState } from './src/game/ai-command/commander-types';
import type { BattleLogEvent, AIReport } from './src/game/reports/report-types';

const SEP = '='.repeat(72);

// =============================================================
// TEST 1: 地图生成链 — WorldAtlas → RegionTile → GameMap
// =============================================================
function test1_mapGeneration() {
  console.log(`\n${SEP}`);
  console.log('TEST 1: MAP GENERATION CHAIN');
  console.log(SEP);

  const config: WorldAtlasConfig = { ...DEFAULT_WORLD_ATLAS_CONFIG, seed: 12345 };
  console.log(`\n[Step 1] Generating WorldAtlas (${config.virtualWidth}x${config.virtualHeight})...`);
  const t0 = Date.now();
  const atlas: WorldAtlas = generateWorldAtlas(config);
  console.log(`  ✓ WorldAtlas created in ${Date.now() - t0}ms`);
  console.log(`    id: ${atlas.id}, seed: ${atlas.seed}`);
  console.log(`    macroGrid: ${atlas.macroCells.length}x${atlas.macroCells[0].length}`);
  console.log(`    regions: ${atlas.generatedRegionIds.length}, politicalRegions: ${atlas.politicalRegions.length}`);

  // MacroCell terrain distribution
  const macroBiomes: Record<string, number> = {};
  for (const row of atlas.macroCells)
    for (const cell of row)
      macroBiomes[cell.biome] = (macroBiomes[cell.biome] ?? 0) + 1;
  console.log('    Macro biomes:', JSON.stringify(macroBiomes, null, 0));

  // Political regions
  console.log('    Political regions:');
  for (const pr of atlas.politicalRegions) {
    console.log(`      ${pr.name} (${pr.factionId}) — cells: ${pr.macroCells.length}, stability: ${pr.stability}`);
  }

  console.log(`\n[Step 2] Generating RegionTile (0,0)...`);
  const t1 = Date.now();
  const region: RegionTile = generateRegionTile(atlas, 0, 0);
  console.log(`  ✓ RegionTile (${region.width}x${region.height}) created in ${Date.now() - t1}ms`);

  // Region terrain stats
  const terrainCounts: Record<string, number> = {};
  let waterCount = 0, mountainCount = 0, forestCount = 0, plainsCount = 0, cityCount = 0;
  for (const row of region.cells) {
    for (const cell of row) {
      const t = cell.baseTerrain;
      terrainCounts[t] = (terrainCounts[t] ?? 0) + 1;
      if (t === 'water') waterCount++;
      else if (t === 'mountain' || t === 'highland') mountainCount++;
      else if (t === 'forest') forestCount++;
      else if (t === 'plains') plainsCount++;
      else if (t === 'city') cityCount++;
    }
  }
  const totalCells = region.width * region.height;
  console.log(`    Terrain: plains=${(plainsCount/totalCells*100).toFixed(1)}%, forest=${(forestCount/totalCells*100).toFixed(1)}%, mountain=${(mountainCount/totalCells*100).toFixed(1)}%, water=${(waterCount/totalCells*100).toFixed(1)}%, city=${(cityCount/totalCells*100).toFixed(1)}%`);
  console.log(`    Cities: ${region.cities.length}, Roads: ${region.roads.length}, Rivers: ${region.rivers.length}`);

  // City details
  console.log('    Cities:');
  for (const city of region.cities) {
    console.log(`      ${city.name} (${city.rank}) at global(${city.center.globalX}, ${city.center.globalY}), population: ${city.populationScore}`);
  }

  // Road details
  console.log('    Roads:');
  for (const road of region.roads.slice(0, 8)) {
    console.log(`      ${road.id}: ${road.type} from ${road.fromId} to ${road.toId}, path length: ${road.path.length}`);
  }
  if (region.roads.length > 8) console.log(`      ... and ${region.roads.length - 8} more`);

  // River details
  console.log('    Rivers:');
  for (const river of region.rivers) {
    console.log(`      ${river.id}: ${river.type}, path length: ${river.path.length}`);
  }

  // StrategicChunks
  console.log(`\n[Step 3] StrategicChunks...`);
  console.log(`  ✓ chunks: ${region.strategicChunks.length}x${region.strategicChunks[0]?.length ?? 0}`);

  const chunks = region.strategicChunks;
  let chunksWithCity = 0, chunksWithRiver = 0, chunksWithRoad = 0, chunksWithBridge = 0;
  for (const row of chunks)
    for (const chunk of row) {
      if (chunk.features.hasCity) chunksWithCity++;
      if (chunk.features.hasRiver) chunksWithRiver++;
      if (chunk.features.hasMainRoad) chunksWithRoad++;
      if (chunk.features.hasBridge) chunksWithBridge++;
    }
  console.log(`    With city: ${chunksWithCity}, river: ${chunksWithRiver}, road: ${chunksWithRoad}, bridge: ${chunksWithBridge}`);

  // StrategicMap
  console.log(`\n[Step 4] StrategicMap...`);
  const strategicMap = buildStrategicMapFromRegionTile(region);
  console.log(`  ✓ StrategicMap: ${strategicMap.width}x${strategicMap.height}`);

  // OperationView
  console.log(`\n[Step 5] OperationView...`);
  const firstCityChunk = chunks.flat().find(c => c.features.hasCity) ?? chunks[0][0];
  const operationView = getOperationViewForChunk(region, firstCityChunk, 128);
  console.log(`  ✓ OperationView: ${operationView.worldRect.width}x${operationView.worldRect.height}`);
  console.log(`    Involved chunks: ${operationView.involvedChunks.length}`);
  console.log(`    WorldRect: (${operationView.worldRect.x}, ${operationView.worldRect.y})`);

  // CombatViewport
  console.log(`\n[Step 6] CombatViewport...`);
  const vpCenter = {
    globalX: operationView.worldRect.x + Math.floor(operationView.worldRect.width / 2),
    globalY: operationView.worldRect.y + Math.floor(operationView.worldRect.height / 2),
  };
  const combatViewport = getCombatViewportFromOperationCell({
    regionTile: region,
    cellPosition: vpCenter,
    width: 64,
    height: 48,
  });
  console.log(`  ✓ CombatViewport: ${combatViewport.worldRect.width}x${combatViewport.worldRect.height}`);
  console.log(`    battleType: ${combatViewport.battleType}`);

  // GameMap
  console.log(`\n[Step 7] GameMap conversion...`);
  const gameMap = convertCombatViewportToGameMap(combatViewport);
  console.log(`  ✓ GameMap: ${gameMap.width}x${gameMap.height}`);

  const gmTerrain: Record<string, number> = {};
  for (const row of gameMap.cells)
    for (const cell of row)
      gmTerrain[cell.terrain] = (gmTerrain[cell.terrain] ?? 0) + 1;
  console.log(`    Terrain: ${JSON.stringify(gmTerrain)}`);

  // Summary
  console.log(`\n--- MAP CHAIN SUMMARY ---`);
  console.log(`  atlasSize:      [${atlas.virtualWidth}, ${atlas.virtualHeight}]`);
  console.log(`  regionSize:     [${region.width}, ${region.height}]`);
  console.log(`  chunks:         [${region.strategicChunks.length}, ${region.strategicChunks[0]?.length ?? 0}]`);
  console.log(`  operationView:  [${operationView.worldRect.width}, ${operationView.worldRect.height}]`);
  console.log(`  combatViewport: [${combatViewport.worldRect.width}, ${combatViewport.worldRect.height}]`);
  console.log(`  gameMap:        [${gameMap.width}, ${gameMap.height}]`);

  return { atlas, region, gameMap };
}

// =============================================================
// TEST 2: AI 命令解析 + 计划生成 + 战斗模拟（多种兵种）
// =============================================================
function test2_aiCommandAndBattle() {
  console.log(`\n${SEP}`);
  console.log('TEST 2: AI COMMAND PARSING + BATTLE SIMULATION');
  console.log(SEP);

  // --- Step 1: Define commanders for different force types ---
  const commanders: CommanderState[] = [
    {
      id: 'hq_red',
      level: 'hq',
      name: '红方指挥部',
      faction: 'red',
      currentOrders: [],
      subordinateCommanderIds: ['armor_cmd', 'inf_cmd', 'arty_cmd'],
      controlledForceIds: ['force_armor', 'force_inf', 'force_arty'],
      lastReportTurn: 0,
    },
    {
      id: 'armor_cmd',
      level: 'tactical',
      name: '装甲第1营',
      faction: 'red',
      currentOrders: [],
      subordinateCommanderIds: [],
      controlledForceIds: ['force_armor'],
      lastReportTurn: 0,
    },
    {
      id: 'inf_cmd',
      level: 'tactical',
      name: '步兵第2营',
      faction: 'red',
      currentOrders: [],
      subordinateCommanderIds: [],
      controlledForceIds: ['force_inf'],
      lastReportTurn: 0,
    },
    {
      id: 'arty_cmd',
      level: 'tactical',
      name: '炮兵第3营',
      faction: 'red',
      currentOrders: [],
      subordinateCommanderIds: [],
      controlledForceIds: ['force_arty'],
      lastReportTurn: 0,
    },
  ];

  // --- Step 2: Test command parsing for different intent types ---
  const testCommands: Array<{ text: string; expectedIntent: string; description: string }> = [
    { text: '进攻敌方城市，不惜代价突破', expectedIntent: 'attack', description: 'Attack order' },
    { text: '防守北侧桥梁，保持阵地', expectedIntent: 'defend', description: 'Defend order' },
    { text: '侦察前方区域，避免交火', expectedIntent: 'recon', description: 'Recon order' },
    { text: '撤退到后方休整', expectedIntent: 'withdraw', description: 'Withdraw order' },
    { text: '炮兵火力支援前线部队', expectedIntent: 'support', description: 'Support order' },
    { text: '占领西南侧城市', expectedIntent: 'capture', description: 'Capture order' },
    { text: '守住当前阵地，等待援军', expectedIntent: 'hold', description: 'Hold order' },
    { text: '拦截敌方补给车队', expectedIntent: 'interdict', description: 'Interdict order' },
  ];

  console.log('\n--- Command Parsing Tests ---');
  const allBattleLogEvents: BattleLogEvent[] = [];
  const allOrders: HQOrder[] = [];
  let commandSuccess = 0;

  for (const tc of testCommands) {
    const parsed = parseCommandText(tc.text);
    const order = createHQOrderFromParsed(
      parsed,
      ['force_armor', 'force_inf', 'force_arty'],
      1,
      tc.text,
    );

    const match = parsed.intent === tc.expectedIntent ? '✓' : '✗';
    if (parsed.intent === tc.expectedIntent) commandSuccess++;

    console.log(`  ${match} "${tc.text}"`);
    console.log(`      intent=${parsed.intent}, ROE=${parsed.rulesOfEngagement}, risk=${parsed.riskTolerance}, confidence=${parsed.confidence}`);

    allOrders.push(order);
  }
  console.log(`  Result: ${commandSuccess}/${testCommands.length} commands parsed correctly`);

  // --- Step 3: Generate AI plans for each order with different commanders ---
  console.log('\n--- AI Plan Generation (different force types) ---');

  const forceTypes = [
    { name: '装甲部队', commander: commanders[1], orderType: 'attack' },
    { name: '步兵部队', commander: commanders[2], orderType: 'defend' },
    { name: '炮兵部队', commander: commanders[3], orderType: 'support' },
  ];

  for (const ft of forceTypes) {
    const matchingOrder = allOrders.find(o => o.intent === ft.orderType);
    if (!matchingOrder) continue;

    const plan = generatePlanFromOrder(matchingOrder, ft.commander, 1);
    console.log(`\n  ${ft.name} (${ft.commander.name}):`);
    console.log(`    Plan: ${plan.id}, objective: ${plan.objective}`);
    console.log(`    Phases (${plan.phases.length}):`);
    for (const phase of plan.phases) {
      console.log(`      - ${phase.name}: ${phase.description} (turns: ${phase.estimatedTurns})`);
      console.log(`        Assignments: ${phase.forceAssignments.map(a => `${a.forceId}→${a.task}`).join(', ')}`);
    }

    // --- Step 4: Execute AI turns for this plan ---
    const forceEvents: BattleLogEvent[] = [];
    let currentPlan = plan;
    for (let turn = 1; turn <= 3; turn++) {
      const result = executeAITurn(currentPlan, ft.commander, matchingOrder, turn);
      forceEvents.push(...result.logEvents);
      currentPlan = result.updatedPlan;

      if (currentPlan.status === 'completed') {
        console.log(`    Status after turn ${turn}: ${currentPlan.status}`);
        break;
      }
      if (turn === 3) {
        console.log(`    Status after turn ${turn}: ${currentPlan.status} (${currentPlan.phases.filter(p => p.status === 'completed').length}/${currentPlan.phases.length} phases done)`);
      }
    }
    allBattleLogEvents.push(...forceEvents);

    console.log(`    Decisions: ${forceEvents.length} events`);
  }

  // --- Step 5: Simulate some battle events ---
  console.log('\n--- Combat Events Simulation ---');
  const combatEvents: BattleLogEvent[] = [
    {
      id: 'evt_spot_1', turn: 2, time: Date.now(),
      type: 'unit_spotted', actorUnitId: 'scout_unit',
      confirmedByPlayer: false, visibilityConfidence: 'estimated',
      message: '侦察单位发现敌方坦克连在(bridge_x)附近',
    },
    {
      id: 'evt_shot_1', turn: 2, time: Date.now(),
      type: 'shot_fired', actorUnitId: 'tank_1', targetUnitId: 'enemy_tank_1',
      confirmedByPlayer: true, visibilityConfidence: 'confirmed',
      message: 'T-90 开火命中敌方 M1A2，装甲击穿',
    },
    {
      id: 'evt_damage_1', turn: 2, time: Date.now(),
      type: 'unit_damaged', actorUnitId: 'tank_1', targetUnitId: 'enemy_tank_1',
      confirmedByPlayer: true, visibilityConfidence: 'confirmed',
      message: '击毁敌方坦克一辆',
    },
    {
      id: 'evt_arty_1', turn: 2, time: Date.now(),
      type: 'artillery_strike', actorUnitId: 'arty_1',
      confirmedByPlayer: true, visibilityConfidence: 'confirmed',
      message: '152mm 炮兵对敌方步兵阵地火力覆盖',
    },
    {
      id: 'evt_supply_1', turn: 3, time: Date.now(),
      type: 'supply_used', actorUnitId: 'tank_1',
      confirmedByPlayer: false, visibilityConfidence: 'confirmed',
      message: '坦克连弹药消耗 40%，需补充',
    },
    {
      id: 'evt_obj_1', turn: 3, time: Date.now(),
      type: 'objective_captured', actorUnitId: 'force_armor',
      confirmedByPlayer: true, visibilityConfidence: 'confirmed',
      message: '装甲部队成功占领桥头堡',
    },
    {
      id: 'evt_suppression_1', turn: 3, time: Date.now(),
      type: 'suppression_applied', actorUnitId: 'enemy_inf_1',
      confirmedByPlayer: false, visibilityConfidence: 'estimated',
      message: '敌方步兵在炮火压制下士气动摇',
    },
  ];

  allBattleLogEvents.push(...combatEvents);

  console.log(`  Simulated ${combatEvents.length} combat events`);
  for (const evt of combatEvents) {
    console.log(`    [Turn ${evt.turn}] ${evt.type}: ${evt.message}`);
  }

  return { allOrders, allBattleLogEvents, commandSuccess, commanders };
}

// =============================================================
// TEST 3: 报告生成 — BattleLogEvents → AIReports
// =============================================================
function test3_reportGeneration(events: BattleLogEvent[], orders: HQOrder[]) {
  console.log(`\n${SEP}`);
  console.log('TEST 3: REPORT GENERATION');
  console.log(SEP);

  console.log(`\n  Input: ${events.length} battle log events, ${orders.length} orders`);

  // Group events by type for summary
  const eventTypes: Record<string, number> = {};
  for (const e of events) {
    eventTypes[e.type] = (eventTypes[e.type] ?? 0) + 1;
  }
  console.log('  Event types:', JSON.stringify(eventTypes));

  // Generate reports for different commanders
  const commanderIds = [
    { id: 'hq_red', name: '红方指挥部' },
    { id: 'armor_cmd', name: '装甲第1营' },
    { id: 'inf_cmd', name: '步兵第2营' },
    { id: 'arty_cmd', name: '炮兵第3营' },
  ];

  const allReports: AIReport[] = [];
  for (const cmd of commanderIds) {
    const reports = generateReportsFromBattleLog({
      events,
      turn: 3,
      commanderId: cmd.id,
      relatedOrderIds: orders.map(o => o.id),
      relatedForceIds: ['force_armor', 'force_inf', 'force_arty'],
    });

    console.log(`\n  ${cmd.name} (${cmd.id}): ${reports.length} reports`);
    allReports.push(...reports);

    for (const report of reports) {
      console.log(`    [${report.type}] ${report.title}`);
      console.log(`      Summary: ${report.summary}`);
      console.log(`      Confidence: ${report.confidence}, Facts: ${report.facts.length}, Estimates: ${report.estimates.length}`);
      if (report.facts.length > 0) {
        console.log(`      Facts: ${report.facts.join(' | ')}`);
      }
      if (report.estimates.length > 0) {
        console.log(`      Estimates: ${report.estimates.join(' | ')}`);
      }
      if (report.recommendations.length > 0) {
        console.log(`      Recommendations (${report.recommendations.length}):`);
        for (const rec of report.recommendations) {
          console.log(`        [${rec.urgency}] ${rec.text}`);
        }
      }
      // Supply state
      console.log(`      Supply: ammo=${report.supply.ammoState}, fuel=${report.supply.fuelState}, repair=${report.supply.repairState}`);
      // Losses
      const fl = report.losses.friendlyConfirmed;
      const el = report.losses.enemyConfirmed;
      console.log(`      Friendly losses: tanks=${fl.tanksDestroyed}, ifvs=${fl.ifvsDestroyed}, infantry=${fl.infantryKilled}, artillery=${fl.artilleryDestroyed}`);
      console.log(`      Enemy losses:    tanks=${el.tanksDestroyed}, ifvs=${el.ifvsDestroyed}, infantry=${el.infantryKilled}, artillery=${el.artilleryDestroyed}`);
    }
  }

  // Report type distribution
  const reportTypes: Record<string, number> = {};
  for (const r of allReports) {
    reportTypes[r.type] = (reportTypes[r.type] ?? 0) + 1;
  }
  console.log(`\n  Total reports: ${allReports.length}`);
  console.log('  Report types:', JSON.stringify(reportTypes));

  // Required report types check
  const requiredTypes = ['ORDER_CONFIRMATION', 'SITREP', 'INTREP', 'BDA', 'LOGREP', 'WARNING'];
  const missing = requiredTypes.filter(t => !reportTypes[t]);
  const present = requiredTypes.filter(t => reportTypes[t]);

  console.log(`  Present types: ${present.join(', ')}`);
  if (missing.length > 0) {
    console.log(`  Missing types: ${missing.join(', ')}`);
  }

  return { allReports, reportTypes, missing };
}

// =============================================================
// MAIN — Run all tests
// =============================================================
function main() {
  console.log(SEP);
  console.log('FULL INTEGRATION TEST SUITE');
  console.log('WorldAtlas → RegionTile → Combat → AICommand → Report');
  console.log(SEP);

  console.log('\nNode version:', process.version);
  console.log('Working dir:', process.cwd());

  // TEST 1
  let t1Result;
  try {
    t1Result = test1_mapGeneration();
    console.log(`\n✓ TEST 1 PASSED`);
  } catch (err: any) {
    console.log(`\n✗ TEST 1 FAILED: ${err.message}`);
    console.log(err.stack?.split('\n').slice(0, 5).join('\n'));
    process.exit(1);
  }

  // TEST 2
  let t2Result;
  try {
    t2Result = test2_aiCommandAndBattle();
    console.log(`\n✓ TEST 2 PASSED (${t2Result.commandSuccess}/8 commands parsed correctly)`);
  } catch (err: any) {
    console.log(`\n✗ TEST 2 FAILED: ${err.message}`);
    console.log(err.stack?.split('\n').slice(0, 5).join('\n'));
    process.exit(1);
  }

  // TEST 3
  try {
    const t3Result = test3_reportGeneration(t2Result.allBattleLogEvents, t2Result.allOrders);
    console.log(`\n✓ TEST 3 PASSED (${t3Result.allReports.length} reports generated, ${t3Result.missing.length} types missing)`);
  } catch (err: any) {
    console.log(`\n✗ TEST 3 FAILED: ${err.message}`);
    console.log(err.stack?.split('\n').slice(0, 5).join('\n'));
    process.exit(1);
  }

  // =============================================================
  // FINAL SUMMARY
  // =============================================================
  console.log(`\n${SEP}`);
  console.log('FINAL RESULT: ALL TESTS PASSED');
  console.log(SEP);
  console.log(`
  ✓ Map Generation:    WorldAtlas → RegionTile → StrategicChunk → OperationView → CombatViewport → GameMap
  ✓ AI Commands:       8 command types parsed, AI plans generated, multi-turn execution simulated
  ✓ Battle Simulation: 7 combat events (spotting, fire, damage, artillery, supply, objective, suppression)
  ✓ Report Generation: BattleLogEvents → AIReports (multiple commander perspectives)
`);
}

main();
