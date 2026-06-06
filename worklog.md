---
Task ID: 72
Agent: main-agent
Task: v92.0 — Visual Effects (Water Waves, Lightning, Death Tilt), Material Pooling, Ammo/Morale HUD, Kill Streak Banner, Timer Warning

Work Log:
- Read worklog.md, confirmed project at v91.0 (stable build)
- Build ✅, 0 TS errors, production build passes
- agent-browser QA: skipped (known network namespace limitation)
- Deep code review via two parallel subagents: 25+ new issues found (0 CRITICAL, 1 HIGH, 8 MEDIUM, 8 LOW)
- Fixed 1 HIGH + 3 MEDIUM + 3 LOW bugs + 7 new features
- All changes verified: 0 TS errors, production build passes

- Fixed HIGH bugs:
  1. Rain splash material allocation storm (GameScene.tsx:6227-6244)
     Up to 3 new MeshBasicMaterial instances were allocated per frame during rain
     (~180 allocations/sec at 60fps). Materials live only 300ms each.
     Fix: Created pool of 6 reusable MeshBasicMaterial instances in sceneRef.
     Splash spawning cycles through pool (modulo index). Materials disposed once on unmount.

- Fixed MEDIUM bugs:
  2. init() missing showDefenseOverlay: false (game-store.ts:533)
     Other init variants (heroSelection, deployment, mission) all reset this flag,
     but the main init() did not. Defense overlay persisted across new games.
     Fix: Added showDefenseOverlay: false to init() set() call.

  3. getSaveSlots() null type safety (game-store.ts:1839)
     Empty slots pushed `null as unknown as SaveSlotInfo` — type-unsafe cast.
     Any consumer accessing properties without null-check would crash.
     Fix: Replaced with proper empty sentinel object matching SaveSlotInfo interface.

  4. captureProgressArcs O(n) per capture point per frame (GameScene.tsx:6535)
     Used .find() for each capture point every frame.
     Fix: Added Map<string, ArcEntry> alongside array for O(1) lookup by cpId.

- Fixed LOW bugs:
  5. Unused oldState parameter in playAttackResultSounds (game-store.ts:299)
     Fix: Removed parameter and updated 3 call sites.

  6. EyeIcon duplicate import alias (GameUI.tsx:24)
     `Eye as EyeIcon` was imported but never used; `Eye` already imported.
     Fix: Removed the alias.

  7. let → const for endTurn result (game-store.ts:801)
     Fix: Changed `let newState` to `const newState`.

- New Features:
  8. Water Shader Animation (GameScene.tsx)
      Enhanced existing water wave displacement with dual-wave system:
      - Primary wave: sin(elapsed * 1.5 + x * 0.5 + z * 0.3) * 0.03
      - Secondary wave: sin(elapsed * 2.2 + x * 0.8 - z * 0.4) * 0.01
      Uses world position instead of grid position for spatial coherence.
      Shimmer opacity also uses world position.

  9. Lightning Flashes During Storms (GameScene.tsx)
      Random lightning during rain/sandstorm weather:
      - Triggers every 5-15 seconds (random interval)
      - Spikes ambient light intensity to 3.0 for 100ms
      - Resets to 0.6 over 200ms
      - Frame-independent timing via Date.now() timestamps in sceneRef
      - Only active during rain or sandstorm weather

  10. Ammo Indicator in Selected Unit Panel (GameUI.tsx)
      Added compact "🔫 X/Y" ammo display next to attack stats.
      Red + bold when ammo = 0, with "弹药耗尽 — 无法攻击" tooltip.
      Only shows for units with ammo defined.

  11. Morale Bar Verification (GameUI.tsx)
      Verified existing morale bar is properly implemented with color coding
      (green >70, yellow >30, red ≤30). Added v92.0 comment.

  12. Turn Timer Warning Pulse (GameUI.tsx)
      Enhanced turn timer visual warning:
      - Added animate-pulse + ring-2 ring-red-500/50 when ≤25% time remaining
      - Previously only triggered at ≤10%
      - Makes low-time situations more visually urgent

  13. Kill Streak Banner (GameUI.tsx + engine.ts)
      Center-screen banner for multi-kill streaks (3+ kills in one turn):
      - Uses framer-motion AnimatePresence for enter/exit animation
      - Gold-bordered banner with streak label from getKillStreakLabel()
      - Shows attacker name, kill count, and streak icon (三杀/四杀/无双)
      - Auto-dismisses after 2s with scale+fade exit animation

  14. Death Animation Enhancement — Unit Tilt (GameScene.tsx)
      Two-phase death animation replacing simple fade+sink:
      - Phase 1 (0-300ms): Unit tilts 45° on Z-axis + 22.5° on X-axis
      - Phase 2 (300-800ms): Maintains tilt while fading, sinking, scaling down
      Makes unit destruction feel more dramatic and physical

- Files modified:
  - GameScene.tsx: rain material pool, water waves, lightning, death tilt, captureArcs Map
  - GameUI.tsx: ammo indicator, timer pulse, kill streak banner, EyeIcon cleanup
  - game-store.ts: init showDefenseOverlay, getSaveSlots sentinel, oldState cleanup, const fix
  - engine.ts: kill streak label integration
  - types.ts: SAVE_VERSION 92.0
  - package.json: version 92.0.0

Stage Summary:
- HIGH: Rain splash material pool eliminates ~180 allocations/sec during rain
- MEDIUM: init() now properly resets all overlay states
- MEDIUM: getSaveSlots type-safe (no more null cast)
- MEDIUM: captureProgressArcs O(1) via Map lookup
- NEW: Dual-wave water animation with world-position coherence
- NEW: Random lightning flashes during storms (ambient light spike)
- NEW: Ammo indicator in selected unit panel
- NEW: Turn timer pulse warning at ≤25% remaining
- NEW: Kill streak center-screen banner (3+ kills)
- NEW: Death animation with tilt phase for dramatic effect
- Remaining MEDIUM: BattleStatsDashboard full units subscription, turnTransition setTimeout race
- Remaining LOW: GameScene.tsx file size (9300+ lines), tracer geometry pooling, CasualtyEntry interface location
- Remaining: fog-of-war visual edge, AI multi-turn planning, overwatch/reaction fire,
  combat replay scrubber, bloom post-processing, color grading, grass sway
