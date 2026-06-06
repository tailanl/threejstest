# Task 4: Tactical Mode Improvements - Work Record

## Agent: Tactical Mode Improvements Agent
## Date: 2025-05-16

### Summary of Changes

All 6 requested improvements have been implemented:

#### 1. Damage Popup Numbers ✅
- Added `DamagePopup` type in `types.ts` with `type: 'damage' | 'heal' | 'counter'`
- Red numbers for damage taken (e.g., "-25")
- Green numbers for healing from supply truck (e.g., "+10 治疗")
- Yellow numbers for counterattack damage (e.g., "-15 反击")
- Numbers float upward and fade out over 1.5 seconds
- Uses percentage-based positioning from 3D-to-2D projection
- Popups are stored in game state (`damagePopups` array) for React rendering

#### 2. Better Unit Selection Glow ✅
- Pulsing glow ring effect already existed, enhanced with time-based animation
- Attack range indicator already existed with red ring
- Added supply truck healing radius indicator with green cross markers
- Units are dimmed based on action status (acted = 55%, moved/attacked = 75%, full = 100%)

#### 3. Attack Range Preview ✅
- Enhanced damage estimate tooltip with counterattack damage range
- Shows "⚔️ 预计伤害: X ~ Y" for attack
- Shows "⚡ 反击伤害: X ~ Y" for counterattack (if enemy can counter)
- Counterattack calculated at 60% power matching engine logic

#### 4. Supply Truck Heals Nearby Units ✅
- Added `healAmount: 10` and `healRange: 1` to supply truck config in `config.ts`
- Added `processSupplyHealing(state)` function in `engine.ts`
- Called at start of each turn (both player and AI turns) in `game-store.ts`
- Heals adjacent friendly units (Manhattan distance ≤ 1, excluding self)
- Only heals units below max HP
- Green "+10 治疗" popup appears for each heal
- Supply truck healing radius indicator shows green cross markers when selected

#### 5. Unit Status Indicators ✅
- **Low HP (<30%)**: Red flashing emissive effect using sin wave animation
- **Has moved this turn**: Slightly dimmed to 75% opacity
- **Has attacked this turn**: Slightly dimmed to 75% opacity
- **Fully acted**: More dimmed to 55% opacity
- Applied via mesh.traverse() modifying material opacity and emissive properties

#### 6. Combat Result Toast ✅
- Added `CombatToast` type in `types.ts`
- `CombatResultToast` component in `GameUI.tsx`
- Shows attacker → defender with faction colors
- Shows damage dealt and defender remaining HP
- Shows counterattack damage if applicable
- Kill indicators (💀) for destroyed units
- Auto-dismiss after 4 seconds
- Stacked display (up to 3 toasts) on the right side
- Slide-in animation with framer-motion

### Files Modified
1. `/home/z/my-project/src/game/types.ts` - Added DamagePopup, CombatToast types; Updated GameState, UnitTypeConfig
2. `/home/z/my-project/src/game/config.ts` - Added healAmount/healRange to supply truck config
3. `/home/z/my-project/src/game/engine.ts` - Added processSupplyHealing(), popupIdCounter, damagePopups/combatToasts in attackUnit() and initGameState()
4. `/home/z/my-project/src/store/game-store.ts` - Added addDamagePopups, removeDamagePopup, removeCombatToast, getSupplyHealPositions actions; Integrated supply healing in onEndTurn()
5. `/home/z/my-project/src/components/game/GameScene.tsx` - New damage/heal popup rendering, unit status indicators (dimming, low HP flash), supply healing radius, counterattack preview, removed old floatingDamages state
6. `/home/z/my-project/src/components/game/GameUI.tsx` - Added CombatResultToast component, combat toasts display

### Backward Compatibility
- All changes are additive - no existing features were removed or modified in a breaking way
- The old `floatingDamages` state in GameScene was replaced with the store-based `damagePopups` system
- Combat log system remains unchanged
- AI system remains unchanged
