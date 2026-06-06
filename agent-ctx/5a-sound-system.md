# Task 5a: Complete Procedural Sound System

## Summary
Implemented a complete procedural audio system using Web Audio API with 20+ sound effects, all generated programmatically without external audio files.

## Files Modified

### `/home/z/my-project/src/game/audio.ts` — Complete Rewrite
- **Core Infrastructure**: AudioContext singleton with lazy init, MasterGainNode for global volume, mute control
- **Volume/Mute API**: `setMuted()`, `getMuted()`, `toggleMute()`, `setVolume()`, `getVolume()` (plus legacy `setMutedState()`)
- **Helper Functions**: `createOscillator()` (ADSR envelope), `createNoiseBuffer()`, `playNoise()` (bandpass filtered), `playTone()` (simplified oscillator)
- **20 Required Sound Effects**:
  1. `playClickSound()` — 50ms, 800Hz sine click
  2. `playSelectSound()` — ascending two-tone (400→600Hz)
  3. `playMoveSound()` — filtered noise whoosh (200ms)
  4. `playAttackSound()` — low-frequency boom (300ms)
  5. `playHitSound()` — metallic ping (1200Hz + noise, 150ms)
  6. `playKillSound()` — dramatic descending tone (500ms)
  7. `playTurnStartSound()` — triumphant ascending chord (A-C#-E)
  8. `playTurnEndSound()` — soft descending tone (200ms)
  9. `playFortifySound()` — construction noise (400ms)
  10. `playCaptureSound()` — victory fanfare triad (400ms)
  11. `playHealSound()` — gentle rising tone (500→700Hz, 300ms)
  12. `playMineExplosionSound()` — sharp crack + rumble (300ms)
  13. `playStealthSound()` — mysterious whisper with lowpass filter (300ms)
  14. `playRetreatSound()` — descending tone (200ms)
  15. `playGameOverSound(isVictory?)` — dramatic minor chord / delegates to victory (800ms)
  16. `playVictorySound()` — major chord fanfare (600ms)
  17. `playWeatherChangeSound()` — ambient whoosh with sweeping filter (500ms)
  18. `playSaveSound()` — confirmation beep (150ms)
  19. `playErrorSound()` — low buzzer (200ms)
  20. `playDeploySound()` — placement thunk (200ms)
- **Retained extras**: `playLevelUpSound()`, `playCancelSound()`, `playSplashSound()`, `playStealthEnterSound()`, `playStealthExitSound()`, `playCounterAttackSound()`

### `/home/z/my-project/src/store/game-store.ts` — Audio Integration
- Updated import to include all new sound functions
- **Sound mapping changes**:
  - `onEndTurn`: `playTurnStartSound()` → `playTurnEndSound()`
  - `onBuildFortify`: `playClickSound()` → `playFortifySound()`
  - `onClearMinefield`: `playClickSound()` → `playMineExplosionSound()`
  - `onEnterStealth`: `playSelectSound()` → `playStealthSound()`
  - `onRetreatUnit`: `playCancelSound()` → `playRetreatSound()`
- **New sound additions**:
  - `onDeployUnit`: Added `playDeploySound()`
  - `saveGame`: Added `playSaveSound()`
  - AI turn end → red transition: Added `playTurnStartSound()`
  - Game over (victory): Added `playVictorySound()`
  - Game over (defeat/turn limit): Added `playGameOverSound(false)`

### `/home/z/my-project/src/store/strategic-store.ts` — Audio Integration
- Added import for 11 audio functions
- **Sound additions**:
  - `onSectorClick` select/deselect: `playSelectSound()` / `playCancelSound()`
  - `onSectorClick` move: `playMoveSound()`
  - `onSectorClick` attack: `playAttackSound()`
  - `onEndTurn`: Added `playTurnEndSound()`
  - AI turn end → red transition: Added `playTurnStartSound()`
  - Game over after AI: Added `playVictorySound()` / `playGameOverSound()`
  - `onDeployForce`: Added `playDeploySound()`
  - `onRemoveDeployedForce`: Added `playCancelSound()`
  - `saveGame` success: Added `playSaveSound()`
  - `saveGame` error: Added `playErrorSound()`

## Verification
- All 3 files pass ESLint with zero errors/warnings
- Dev server responds normally on port 3000
