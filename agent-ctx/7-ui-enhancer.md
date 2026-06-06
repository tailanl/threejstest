# Task 7: UI Enhancement for War Chess Game

## Summary
Enhanced the GameUI.tsx component and added multiple game features as requested.

## Changes Made

### 1. Better Combat Log
- Enhanced `CombatLogEntry` type with `counterDamage`, `counterAttackerRemainingHp`, `wasCounterKill`, and `eventType` fields
- Created `CombatLogItem` component that displays attack info, counter-attack damage (in yellow), and kill indicators
- Destroyed units are highlighted with red background
- Combat log shows last 8 entries (up from 5)
- Added log count badge

### 2. Unit Action Menu
- Created `UnitActionMenu` component with Move/Attack/Wait/Undo/Cancel options
- Shows when a unit is selected and can both move and attack
- Positioned near center of screen for easy access
- Undo option only available after moving (in attack phase)

### 3. Turn Summary
- Added `TurnSummary` type tracking units destroyed, damage dealt, damage received
- Created `TurnSummaryOverlay` component that auto-appears at start of each player turn
- Shows summary of previous turn's AI actions
- Auto-dismisses after 4 seconds or manual close

### 4. Sound Effects Indicator (Screen Shake)
- Added CSS shake animation that triggers on attack
- `shakeActive` flag in game state, auto-cleared after 400ms
- Visual "攻击!" badge appears in top bar during shake
- Shake animation uses CSS transforms for smooth effect

### 5. Better Terrain Info
- Created `TerrainInfoPanel` component that shows terrain details when hovering over cells
- Displays movement cost, defense bonus, attack bonus
- Shows passability info (impassable, vehicle restrictions)
- If a unit occupies the cell, shows unit name and HP
- Appears in left panel below selected unit info

### 6. Unit Comparison
- Created `UnitComparisonPanel` component
- Shows when hovering over an enemy unit while having a unit selected
- Side-by-side stat comparison with color-coded advantages
- Arrows indicate which unit has the advantage for each stat
- Red border for enemy comparisons

### 7. Undo Last Move
- Added `previousState` to GameState that stores state before movement
- `onUndoMove` action restores previous state (only available in attack phase, before attacking)
- Undo button in top bar and action menu
- Previous state is cleared after attacking or ending turn

### 8. AI Difficulty Selection
- Added `AIDifficulty` type with 'easy', 'normal', 'hard' options
- Added difficulty selector on start screen with descriptions
- Difficulty affects AI behavior through `DIFFICULTY_PARAMS`:
  - Easy: High randomness, skips attacks 30%, low HP targeting preference
  - Normal: Low randomness, normal targeting
  - Hard: No randomness, optimal targeting, never skips attacks
- Difficulty selection shown on start button
- Persists to game restart

### Files Modified
- `src/game/types.ts` - Added new types and GameState fields
- `src/game/engine.ts` - Added counter-attack log info, undo support, turn summary computation
- `src/game/ai.ts` - Added difficulty parameter affecting AI behavior
- `src/store/game-store.ts` - Added new actions and state management
- `src/components/game/GameUI.tsx` - Complete rewrite with all 8 features
- `src/app/page.tsx` - Added difficulty selector

### Lint Status
All lint errors resolved. Code compiles cleanly.
