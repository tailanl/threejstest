# Task 5: Engineer Fortification & Gameplay Enhancement

## Summary

Implemented the Engineer fortification-building ability and related gameplay enhancements for the 铁甲战棋 (Iron Armor Chess) turn-based strategy game.

## Changes Made

### Feature 1: Engineer Builds Fortification (HIGHEST PRIORITY - COMPLETED)

#### `src/game/types.ts`
- Added `fortified: boolean` field to `MapCell` interface (default false)
- Added `fortifiedByTurn?: number` optional field to track when fortification was built
- Added `buildFortify?: boolean` to `UnitTypeConfig` interface

#### `src/game/config.ts`
- Added `FORTIFY_DEFENSE_BONUS = 20` constant
- Added `FORTIFY_DURATION = 5` constant (turns before decay)
- Added `buildFortify: true` to engineer config

#### `src/game/map.ts`
- Added `fortified: false` field to all MapCell creation points

#### `src/game/engine.ts`
- Added `buildFortification(state, unit)` function:
  - Sets `cell.fortified = true` on the unit's current cell
  - Sets `cell.fortifiedByTurn = state.turn`
  - Marks the unit as `canMove = false, canAttack = false` (consumes full turn)
  - Adds a combat log entry
- Modified `calculateDamage` to check if defender's cell is fortified and add FORTIFY_DEFENSE_BONUS
- Added fortification decay logic integrated into `endTurn()`: when `nextTurn - cell.fortifiedByTurn >= FORTIFY_DURATION`, removes fortification

#### `src/store/game-store.ts`
- Added `onBuildFortify()` action that calls `buildFortification()` from engine
- Validates unit is engineer, can act, and player is red faction
- Imported `buildFortification` from engine

#### `src/components/game/GameScene.tsx`
- Fortification visual markers:
  - Sandbag-like objects (brown boxes) around cell edges
  - Small orange flag/barricade in corner
  - Amber-tinted plane overlay on fortified cells
- Engineer build indicator when selected and can act:
  - Pulsing orange hexagonal ring around engineer's cell
  - Crossed tools construction icon on the cell
- Minimap enhancement: fortified cells shown with amber highlight and cross icon

#### `src/components/game/GameUI.tsx`
- Added "🧱 修建工事" button in top bar when engineer is selected and can act
- Shows fortified status "🧱 工事 +20防" in terrain info panel
- Shows fortification indicator "🧱" next to unit on fortified cell
- Added keyboard shortcut 'F' for building fortification
- Added shortcut entry in keyboard shortcuts help overlay

#### `src/game/ai.ts`
- Engineer AI fortification decision logic:
  - If on strategic terrain (city/fortress) and no enemies in immediate attack range → build fortification
  - If near friendly cluster (3+) and not under attack → build fortification
  - Random 20% chance when no enemies in range and no better action
  - Imported `buildFortification` from engine

### Feature 2: Terrain Info Tooltip Enhancement (COMPLETED)
- TerrainInfoPanel now shows fortification status "🧱 工事 +20防"
- Unit info on fortified cells shows 🧱 indicator

### Feature 3: Mini-map Enhancement (COMPLETED)
- Fortified cells shown with amber highlight and cross icon on minimap

## Lint Status
- All lint checks pass with no errors
- Pre-existing TypeScript errors (OrthographicCamera, Fortress icon, animationKey) are from previous tasks, not introduced by this task
