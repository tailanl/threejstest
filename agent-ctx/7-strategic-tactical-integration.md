# Task 7: Strategic-Tactical Integration

## Summary
Implemented the strategic-tactical battle integration that allows players to resolve combat encounters in strategic mode either through tactical battles or auto-resolution.

## Files Created
- `/home/z/my-project/src/game/tactical-integration.ts` - Bridge module between strategic and tactical modes

## Files Modified
- `/home/z/my-project/src/store/strategic-store.ts` - Added battle choice dialog state, actions (onShowBattleChoice, onDismissBattleChoice, onAutoResolve, onEnterTacticalBattle, onReturnToStrategic)
- `/home/z/my-project/src/store/game-store.ts` - Added isStrategicTacticalBattle flag, initStrategicTacticalBattle and returnToStrategic actions
- `/home/z/my-project/src/components/game/StrategicMap.tsx` - Added BattleChoiceDialog component with tactical battle / auto-resolve options
- `/home/z/my-project/src/components/game/GameUI.tsx` - Added "返回战略模式" button in GameOverOverlay when launched from strategic mode

## Integration Flow
1. Player selects their force and clicks an adjacent enemy force in strategic mode
2. Battle choice dialog appears with force comparison and two options
3. "⚔️ 战术战斗" launches a tactical battle with units from both strategic forces
4. "📊 自动结算" uses existing auto-resolve logic
5. After tactical battle ends, player can click "返回战略模式" to apply results back to strategic mode

## Key Design Decisions
- Used `require()` with eslint-disable for dynamic imports to avoid circular dependency between strategic-store and game-store
- Battle config is preserved in strategic store so results can be applied on return
- Tactical map type is derived from the strategic sector's terrain type
- Units are deployed: attacker (red) on left columns (x:0-3), defender (blue) on right columns (x:12-15)
- AI combats in strategic mode always auto-resolve (no dialog shown for AI)
