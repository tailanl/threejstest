# Task 5c: Bug Fixes and UI Polish

## Summary
All bug fixes and UI polish tasks completed successfully. ESLint passes with zero errors.

## Bug Fixes

### Bug 1: combatLog unbounded growth
- **engine.ts**: Added `.slice(-200)` limit to all combatLog array mutations:
  - `moveUnit()` - mine combat log entries
  - `attackUnit()` - main combat + splash log entries  
  - `buildFortification()` - fortification build log
  - `clearMinefield()` - minefield clear log
  - `retreatUnit()` - retreat log
  - `endTurn()` - weather change log

- **strategic-engine.ts**: Added `.slice(-100)` limit to all combatLog mutations:
  - `executeStrategicAttack()` - combat resolution log
  - `processReinforcements()` - reinforcement spawn log

### Bug 2: Other unbounded arrays
- **damagePopups**: Already capped at 50 (verified existing code)
- **combatToasts**: Already capped at 20 (verified existing code)
- **turnSummaries**: Added `.slice(-50)` limit in `endTurn()`
- **levelUpNotifications**: Added `.slice(-20)` limit in `grantXP()`
- **damagePopups in grantXP()**: Added `.slice(-50)` limit

## UI Polish

### Polish 1: Unit hover tooltip
- Enhanced the terrain hover tooltip in GameUI.tsx to also show unit information when hovering over a cell with a unit:
  - Unit name, type icon, faction badge
  - Color-coded HP bar (green/yellow/red)
  - Status indicators: "已移动", "已攻击", "Lv.X"
  - Terrain info + fortification status

### Polish 2: Minimap improvement
- Verified existing minimap implementation already covers all requirements:
  - Terrain colors matching actual map
  - Green tinted movement range highlights
  - Red tinted attack range highlights  
  - Pulsing dot for selected unit
  - Thin border around minimap canvas

### Polish 3: Turn number indicator
- Replaced simple `第{turn}回合` Badge with a new `TurnIndicator` component:
  - SVG circular progress ring showing units acted vs total
  - "第 N 回合" with proper spacing
  - Dimmed + spinning animation when AI is thinking
  - Color matches current faction (red/blue)
  - Shows acted unit count in center of ring

### Polish 4: Strategic mode force template type
- Added `templateKey` field to `StrategicForce` interface in strategic-types.ts
- Set `templateKey` in `createForce()` in strategic-engine.ts
- Improved `getForceTemplateType()` in StrategicMap.tsx:
  - Uses `templateKey` if available (reliable)
  - Falls back to name-based matching with improved disambiguation (装甲 vs 机械化)
- FORCE_TYPE_EMOJI mapping already existed and is used correctly

### Polish 5: Animated health bars
- Added `displayedHpMap` to sceneRef for tracking interpolated HP values
- In the animation loop, HP bars now smoothly interpolate toward actual HP:
  - Stores displayed HP separately from actual HP per unit
  - Each frame, interpolates displayed HP toward target
  - Disposes old geometry and creates new BoxGeometry with interpolated width
  - Updates bar color based on displayed HP ratio
  - Completes transition in approximately 0.5 seconds

## Files Modified
1. `src/game/engine.ts` - Combat log limits, turnSummaries limit, damagePopups/levelUpNotifications limits
2. `src/game/strategic-engine.ts` - Combat log limits, templateKey propagation
3. `src/game/strategic-types.ts` - Added templateKey to StrategicForce interface
4. `src/components/game/GameUI.tsx` - TurnIndicator component, enhanced hover tooltip
5. `src/components/game/StrategicMap.tsx` - Improved getForceTemplateType with templateKey support
6. `src/components/game/GameScene.tsx` - Animated HP bars with smooth interpolation
