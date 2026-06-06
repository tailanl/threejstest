# Task Report: Save/Load, Mute Toggle, Mini-map Enhancements

## Summary
All 3 features implemented successfully. ESLint passes with zero errors. Dev server running without compilation errors.

---

## Feature 1: Multi-Slot Save/Load System (localStorage)

### game-store.ts Changes:
- **Exported `SaveSlotInfo` interface**: `{ slot, timestamp, turn, faction, redAlive, blueAlive }`
- **New store actions**:
  - `saveGame(slot: number)` — saves to `tactical-save-{slot}` key with metadata in `tactical-save-{slot}-info`
  - `loadGame(slot: number)` — restores state from localStorage, preserves `isMuted` state
  - `deleteSave(slot: number)` — removes save data and metadata
  - `getSaveSlots()` — returns array of `SaveSlotInfo | null` for 3 slots
  - `onAutoSave()` — still auto-saves to `iron_tactics_autosave` before each turn end
- **Exported helper functions**: `saveGameToSlot()`, `loadGameFromSlot()`, `deleteSaveSlot()`, `getSaveSlotInfos()`
- Save includes all game state: map, units, turn, phase, combatLog, capturePoints, deployment data, etc.
- Save blocked during: gameOver, deployment, AI turn, animation

### GameUI.tsx Changes:
- **Save/Load panel button**: Replaces old single-slot save/load buttons with a single 💾 "存档" button
- **Panel overlay** (z-54): Centered modal with 3 save slots, each showing:
  - Slot number badge, turn number, faction, red/blue unit counts, timestamp
  - Empty slots display "--- 空 ---"
  - "保存" (green), "读取" (blue), "删除" (red ghost) buttons per slot
  - Save disabled during AI turn, animation, deployment, game over
  - Read disabled when slot is empty
- **Confirmation toast**: Appears after save/load/delete with appropriate emoji and message (auto-dismiss 2s)
- **Keyboard shortcut**: `P` toggles the save panel
- All text in Chinese, matching existing UI language

---

## Feature 2: Sound Effects Toggle (Mute)

### game-store.ts Changes:
- **`isMuted: boolean`** state field (default: `false`)
- **`toggleMute()`** action — flips `isMuted` state

### audio.ts Changes:
- **`checkMuted()`** function — lazy-checks `useGameStore.getState().isMuted` via `require()` to avoid circular imports
- Both `playTone()` and `playNoise()` call `checkMuted()` at start and return early if muted
- Existing `soundEnabled` variable still functional as secondary mute layer

### GameUI.tsx Changes:
- **Mute button** in top bar: Shows 🔊 (Volume2) or 🔇 (VolumeX) based on `isMuted` state
- Button calls `useGameStore.getState().toggleMute()` directly
- **Keyboard shortcut**: `Q` toggles mute
- **SHORTCUTS array** updated with `P` (存档/读档面板) and `Q` (音效开关) entries in "其他" category
- Removed old `getSoundEnabled`/`setSoundEnabled` import from audio.ts (now uses store directly)

---

## Feature 3: Mini-map Enhancements

### GameScene.tsx Changes:

**Size Increase:**
- Display size: 210×165 → **240×180** pixels
- Canvas resolution: 336×264 → **384×288** pixels (maintains 1.6x pixel ratio)

**Pulsing Border:**
- CSS `@keyframes minimap-pulse` animation
- Border color oscillates: `rgba(255,255,255,0.3)` ↔ `rgba(255,255,255,0.5)`
- Box-shadow oscillates: `0 0 8px` ↔ `0 0 16px` with white glow
- 2-second ease-in-out infinite cycle
- Applied via absolute-positioned div overlay with `pointer-events-none`

**Capture Point Colored Dots:**
- Red-owned: Red dot (#ef4444) with red glow ring
- Blue-owned: Blue dot (#3b82f6) with blue glow ring  
- Neutral: **Green dot (#4ade80)** with green glow ring
- Each dot has 3 layers: outer glow ring, solid colored circle, bright white center
- Replaces old flag-symbol drawing (cleaner, more visible)

---

## Files Modified

| File | Changes |
|------|---------|
| `src/store/game-store.ts` | SaveSlotInfo interface, saveGame/loadGame/deleteSave/getSaveSlots actions, isMuted/toggleMute, exported helpers |
| `src/game/audio.ts` | checkMuted() function, muted guard in playTone/playNoise |
| `src/components/game/GameUI.tsx` | Save/Load panel overlay, mute toggle via store, keyboard shortcuts P/Q, save toast |
| `src/components/game/GameScene.tsx` | Larger minimap (240×180), pulsing border CSS, colored capture point dots |

## Verification
- ✅ ESLint: zero errors, zero warnings
- ✅ Dev server: no compilation errors
- ✅ All existing functionality preserved (no breaking changes)
