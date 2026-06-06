# Task 6: GameScene.tsx Visual Enhancements

## Summary
Enhanced the GameScene.tsx component with 7 visual improvements for the Three.js war chess game.

## Changes Made

### 1. Water Animation
- Added time-based wave undulation using dual sin functions in the animation loop
- `wave = sin(elapsed * 1.5 + x * 0.8 + z * 0.6) * 0.02` and `wave2 = sin(elapsed * 2.2 + x * 1.2 - z * 0.4) * 0.01`
- Water meshes are tracked in `waterMeshes[]` array with `baseY` and `cellPos` stored in userData
- Material opacity also oscillates for shimmer effect: `0.7 + sin(elapsed * 2.0 + ...) * 0.1`

### 2. Attack Flash Animation
- When `attackablePositions` change from empty to non-empty, flash overlays are spawned on target cells
- Flash meshes use pulsing `sin(age * 15)` opacity that decays over 0.6 seconds
- Flashes are tracked in `attackFlashes[]` array and auto-cleaned after expiry

### 3. Unit Hover Tooltip
- Raycasting against unit group children in the animation loop detects hovered units
- 3D position projected to 2D screen coordinates via `Vector3.project(camera)`
- CSS tooltip rendered as an absolute-positioned div with unit name from `UNIT_CONFIGS`
- React state `hoveredUnitInfo` bridges the Three.js loop with the React DOM

### 4. Minimap
- Implemented as a 2D canvas overlay (bottom-right corner) for simplicity and performance
- Draws terrain colors, unit dots (red/blue), fog of war overlay, and selected unit indicator
- Uses `useCallback`-based `drawMinimap` function that reactively updates from game state
- 320x240 internal resolution with `imageRendering: pixelated` for crisp rendering

### 5. Particle Effects
- Created `ParticleManager` class with `spawnExplosion()`, `spawnSmoke()`, and `spawnMuzzleFlash()` methods
- **Explosion**: Orange-red sphere particles with gravity, 20 count, 0.6-1.2s lifetime
- **Smoke**: Dark sphere particles rising slowly, 12 count, 0.8-1.6s lifetime  
- **Muzzle flash**: Bright yellow particles in attack direction, 8 count, 0.1-0.25s lifetime
- Destroyed units detected via `prevUnitAliveMap` comparison - spawns explosion+smoke at death position
- Muzzle flash spawned when `attackablePositions` transitions from non-empty to empty (attack executed)

### 6. Better Grid Lines
- Replaced `THREE.GridHelper` with custom `THREE.LineSegments` using precise cell boundaries
- Lines drawn at exact cell edges using `MAP_OFFSET_X/Z` and `CELL_TOTAL` calculations
- Subtle appearance: color `0x455a64`, opacity `0.35`
- Lines placed at y=0.005 to avoid z-fighting with terrain

### 7. Fog of War
- `computeVisibleCells()` calculates all cells within vision range of player's alive units
- Uses Euclidean distance check: `sqrt(dx² + dz²) <= vision`
- Non-visible cells get a dark overlay mesh (`0x0a0f18`, opacity 0.7) positioned above terrain
- Fog meshes stored in dedicated `fogGroup` and fully regenerated on unit/faction changes
- Minimap also reflects fog of war state

## Technical Details
- Added `THREE.Clock` for accurate delta time and elapsed time tracking
- Added `ParticleManager` class for lifecycle management of particle effects
- Extended `sceneRef` type with new fields: `fogGroup`, `gridGroup`, `waterMeshes`, `clock`, `particleManager`, `attackFlashes`, `lastAttackablePositions`, `prevUnitAliveMap`, `minimapCanvasRef`
- All new Three.js objects properly disposed in cleanup
- Lint passes with 0 errors and 0 warnings
