# Task 2-b: 键盘快捷键和视觉打磨

## Agent: main
## Status: ✅ Completed

## Summary
Added comprehensive keyboard shortcuts system, visual polish features (movement path preview, attack range indicator, damage estimate, turn transition animation), and enhanced minimap to the Three.js war chess game.

## Changes Made

### 1. `/src/store/game-store.ts` - Store Extensions
- Added `cycleUnit()` action - Tab cycles through available red units (alive, can still act)
- Added `selectUnitByType(type)` action - Quick select unit by type (1-5 keys)
- Added `turnTransition` state - `{ faction, turn } | null` for turn transition overlay
- Added `showShortcuts` state and `setShowShortcuts()` toggle for help overlay
- Modified `onEndTurn()` to trigger turn transition animation on faction change

### 2. `/src/components/game/GameUI.tsx` - Complete Rewrite
- **Keyboard Shortcuts System**: Global `keydown` listener with:
  - `Escape` → Deselect unit (or close help overlay)
  - `Space` → End turn
  - `S` → Skip current unit
  - `Z` → Undo move (attack phase only)
  - `Tab` → Cycle through available red units
  - `1-5` → Quick select by unit type (tank/ifv/artillery/scout/infantry)
  - `M` → Move mode, `A` → Attack mode, `W` → Wait/skip
  - `?` or `H` → Toggle shortcuts help overlay
- **ShortcutsHelpOverlay** component: Floating panel with all shortcuts in grid layout, semi-transparent dark background, dismissable by Esc or clicking outside
- **TurnTransition** component: framer-motion animated overlay showing "红方回合/蓝方回合" with fade-in/fade-out and scale effects, ~1.5s duration
- Added keyboard shortcut hints (`kbd` elements) to Unit Action Menu buttons
- Added `Keyboard` icon button in top bar to toggle shortcuts help
- Updated tooltip content to mention keyboard shortcuts

### 3. `/src/components/game/GameScene.tsx` - Visual Polish
- **Movement Path Preview**: 
  - Added `findBFSPath()` function for BFS shortest path computation
  - When unit selected in move phase and hovering movable cell: shows glowing green dots along BFS path + dashed line
  - Dots pulse with `sin()` animation for visual appeal
  - Auto-clears when not in move phase
- **Attack Range Indicator**:
  - Added `estimateDamage()` function for damage range calculation
  - When in attack phase: translucent red ring around selected unit showing attack range
  - Inner ring shows minimum range
  - Rings pulse with subtle opacity animation
  - `damageEstimate` tooltip: shows "⚔️ 伤害: min ~ max" when hovering over attackable enemy
- **Enhanced Minimap**:
  - Pulsing yellow indicator for selected unit (animated with sin wave)
  - Movable/attackable ranges shown on minimap
  - Semi-transparent border frame overlay
  - Turn number label (T1, T2, etc.) in top-left
  - Faction indicator with colored dot in top-right
  - Larger canvas (336×264) for better detail
- Added `pathGroup` and `rangeGroup` to Three.js scene for path preview and range indicator
- Added `turn` and `phase` state subscriptions from store

### 4. New Utility Functions
- `findBFSPath()`: BFS shortest path from start to end within movable positions, considering terrain passability
- `estimateDamage()`: Calculates min/max damage range based on attacker/defender stats and terrain bonuses

## Verification
- ✅ `bun run lint` passes with no errors
- ✅ Dev server compiling successfully (✓ Compiled in 147ms)
- ✅ No runtime errors in dev log
