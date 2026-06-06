# Task 2-a: 添加预设地图场景

## Agent: main
## Status: ✅ Completed

## Summary
Added 4 preset map scenarios to the Three.js war chess game, along with a map selector UI on the start screen and deployment adaptation logic.

## Changes Made

### 1. `/src/game/types.ts`
- Added `MapType` type: `'random' | 'mountain-pass' | 'river-valley' | 'urban-warfare' | 'desert-storm'`

### 2. `/src/game/map.ts`
- Added `createEmptyMap()` helper for preset maps
- Added `generateMountainPass()`: Central mountain ridge (z:4-7) with 2 passes (z=4/x=3-4 and z=7/x=11-12), forests on both sides, roads to passes
- Added `generateRiverValley()`: Horizontal river (z:5-6), 3 bridges (x=2,7,12), dense forests on banks, bridgehead cities
- Added `generateUrbanWarfare()`: Dense city cluster in center (x:5-10, z:3-8), fortress cores, cross+radial roads, open flanks
- Added `generateDesertStorm()`: Desert terrain, central fortress+walls, 8 oasis spots (forest), sand dunes (mountains), roads
- Updated `generateMap(mapType)` to accept map type parameter and dispatch to appropriate generator

### 3. `/src/game/config.ts`
- Added `MapTypeOption` interface and `MAP_TYPE_OPTIONS` array with name/description/colors for UI
- Added `isDeployableCell()`: checks if a cell is passable for a unit type (considering vehicle restrictions)
- Added `findNearestDeployable()`: BFS search for nearest valid deployment position
- Added `adaptDeployment()`: ensures all deployment positions are on valid terrain for each preset map

### 4. `/src/game/engine.ts`
- Updated `initGameState()` to accept `mapType` parameter
- Uses `adaptDeployment()` to adjust RED/BLUE deployment positions for the map

### 5. `/src/store/game-store.ts`
- Added `mapType: MapType` to store interface and initial state
- Updated `init()` to accept `mapType` parameter

### 6. `/src/app/page.tsx`
- Added `selectedMapType` state
- Added map selector card with 5 options, each with color preview indicator and description
- Updated start button badge to show map+difficulty combo
- Updated game-over restart to use selected map type

## Verification
- `bun run lint` passes with no errors
- Dev server running normally
