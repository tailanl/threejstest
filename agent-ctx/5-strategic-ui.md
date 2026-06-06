# Task 5 - Strategic Mode UI and Mode Switching

## Summary
Implemented the Strategic Mode UI component and mode switching between tactical and strategic modes.

## Files Created
- `src/store/strategic-store.ts` - Zustand store for strategic game state
- `src/components/game/StrategicMap.tsx` - 2D strategic map component

## Files Modified
- `src/app/page.tsx` - Added mode selection, mode switch, strategic landing page
- `worklog.md` - Appended Task 5 entry

## Architecture
- Strategic mode uses a 2D HTML/CSS grid (not Three.js) for performance
- Mode state tracked in `useStrategicStore` gameMode field
- Dynamic import of StrategicMap (SSR disabled like GameScene)
- Strategic store wraps all engine functions from strategic-engine.ts

## Key Decisions
- Minimap dots generated deterministically from sector.tacticalMapSeed
- Dark theme consistency maintained across both modes
- Turn transition animation reused from tactical mode pattern
- Mode switch button floats at top center during gameplay
