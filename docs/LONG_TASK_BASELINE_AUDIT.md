# LONG_TASK_BASELINE_AUDIT.md
## Phase 0 Baseline Report — Generated 2026-06-08

### 1. Current TypeScript Errors (npx tsc --noEmit)

| # | File | Error | Pre-existing? |
|---|------|-------|:---:|
| 1 | examples/websocket/frontend.tsx:4 | Cannot find module 'socket.io-client' | Yes |
| 2 | examples/websocket/server.ts:2 | Cannot find module 'socket.io' | Yes |
| 3 | scripts/generate-ai-icons.ts:103 | Cannot assign to 'prompt' (const) | Yes |
| 4 | scripts/generate-nato-symbols.ts:103 | imageSmoothingQuality not exist | Yes |
| 5 | scripts/generate-nato-symbols.ts:323 | number → boolean argument | Yes |
| 6-15 | procedural-map.ts (10 errors) | TemplateType null, detailedRegions, detailGridSize | Yes |

**Total: 20 errors (5 in non-src, 15 in legacy procedural-map.ts)**
**Main-link src code (excluding procedural-map.ts): 0 errors**

### 2. Root world-map-* File List

| File | Lines | Already @deprecated? |
|------|:-----:|:---:|
| world-map-chunks.ts | 181 | No |
| world-map-cities.ts | 360 | No |
| world-map-config.ts | 117 | No |
| world-map-features.ts | 319 | No |
| world-map-generator.ts | 172 | No |
| world-map-hydrology.ts | 193 | No |
| world-map-roads.ts | 360 | No |
| world-map-strategic-adapter.ts | 140 | No |
| world-map-terrain.ts | 421 | No |
| world-map-types.ts | 175 | Yes (line 1) |
| world-map-view.ts | 72 | No |
| combat-viewport.ts | 47 | No |
| world-to-game-map.ts | 115 | No |

### 3. Root world-map-* External Importers

| File | Imports |
|------|---------|
| components/game/WorldMapCanvas.tsx | WorldMap, WorldCell, WorldTerrainType, WorldFeatureType |
| components/game/StrategicChunkView.tsx | WorldMap, StrategicChunk, WorldTerrainType |
| app/map-preview/page.tsx | WorldMap, generateWorldMap, DEFAULT_WORLD_MAP_CONFIG, buildStrategicMapFromWorldMap, getOperationView, getCombatViewport, convertCombatViewportToGameMap |

**Main link (strategic-store, region-tile-generator, strategic-chunks, etc.): 0 root imports — already clean**

### 4. region-tile-generator.ts Status

- Lines: 117
- TileRNG: NOT PRESENT (imports RegionRNG from region-random.ts)
- TileNoise: NOT PRESENT (imports RegionNoise from region-random.ts)
- generateRegionCities: NOT DEFINED internally (imported from world-map/world-map-cities)
- generateRegionRivers: NOT DEFINED internally (imported from world-map/world-map-rivers)
- generateRegionRoads: NOT DEFINED internally (imported from world-map/world-map-roads)
- buildRegionStrategicChunks: NOT PRESENT (uses buildStrategicChunks from world-view)
- **Verdict: Already a pure orchestrator**

### 5. buildStrategicChunks

- Called at region-tile-generator.ts:104
- Imported from ../world-view/strategic-chunks
- RegionTile.strategicChunks populated after generation

### 6. game-store enterTacticalFromCombatViewport

- EXISTS at game-store.ts:1944
- Reads tacticalMapFromWorld from strategic store
- Calls initTacticalBattleFromMap with source: 'world-combat-viewport'

### 7. game-store initTacticalBattleFromMap

- EXISTS at game-store.ts:1895
- Accepts { map, source, sourceWorldRect }
- Sets isStrategicTacticalBattle: true when source === 'world-combat-viewport'

### 8. strategic-store enterTacticalFromCombatViewport

- EXISTS at strategic-store.ts:613
- Gets selectedCombatViewport and tacticalMapFromWorld
- Calls useGameStore.getState().initTacticalBattleFromMap()

### 9. StrategicMap.tsx tactical button

- EXISTS at line 1777
- Calls enterTacticalFromCombatViewport from useStrategicStore
- Button shows "进入战术战斗"

### 10. Command → Report chain

- CommandInputPanel → submitHQCommand (strategic-store:635)
- submitHQCommand → generatePlanFromOrder → executeAITurn → BattleLogEvent
- BattleLogEvent → generateReportsFromBattleLog → AIReport
- AIReportPanel displays reports
- **Verdict: Chain connected**

### 11. Force Delegation

- delegation.ts: delegateForceToAI() / recallForceFromAI() exist
- ForceDelegationPanel exists at components/game/
- strategic-store: delegateForceToAICommand / recallForceFromAICommand

### 12. Unit.modern = ModernCombatStats

- types.ts:108: `modern?: ModernCombatStats`
- Imported from ./combat-modern/modern-unit-types
- **Verdict: Done**

### 13. LLM Adapter

- No `src/game/ai-command/llm/` directory exists
- **Verdict: NOT DONE — needs Phase 10**

### 14. debugWorldAtlasChain

- File exists at world-atlas/debug-world-chain.ts (61 lines)
- Imports and calls seem correct
- **Verdict: Done but needs Phase 11 verification**

### Summary

| Phase | Status |
|-------|:------:|
| 0 | ✅ Documented |
| 1 | 🟡 Root files need @deprecated marks |
| 2 | ✅ Already orchestrator |
| 3 | ✅ Already calls buildStrategicChunks |
| 4 | ✅ Already uses worldOrigin + local |
| 5 | ✅ Already implemented |
| 6 | ✅ Already implemented |
| 7 | ✅ Already connected |
| 8 | ✅ Already implemented |
| 9 | ✅ Already using ModernCombatStats |
| 10 | ❌ LLM adapter not created |
| 11 | 🟡 Needs verification run |
| 12 | 🟡 tsc errors in procedural-map.ts |
