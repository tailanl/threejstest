# Task 5b: Weather 3D Visual Particle Effects

## Summary
Added weather-related 3D visual particle effects to the turn-based strategy game's Three.js scene. The game's weather system (sunny, rainy, foggy, snowy, sandstorm) previously only had a text UI indicator — now each weather type has appropriate visual effects.

## Changes Made

### File: `src/components/game/GameScene.tsx`

#### 1. Imports
- Added `WeatherType` to the import from `@/game/types`

#### 2. Scene Ref Type (lines ~373-380)
Added weather-related fields to the `sceneRef` type:
- `weatherGroup: THREE.Group` — container for all weather 3D objects
- `weatherPoints: THREE.Points | null` — particle system for rain/snow/sandstorm
- `weatherFogPlane: THREE.Mesh | null` — fog weather ground overlay
- `weatherSandFogPlane: THREE.Mesh | null` — sandstorm visibility reduction overlay
- `weatherParticlePositions: Float32Array | null` — typed array for particle positions
- `weatherParticleVelocities: Float32Array | null` — typed array for particle speeds
- `weatherParticleOffsets: Float32Array | null` — per-particle phase offsets (snow drift, sandstorm jitter)
- `weatherParticleYVelocities: Float32Array | null` — reserved for multi-axis velocity

#### 3. Scene Initialization (lines ~1272-1276)
- Created `weatherGroup` with `renderOrder = 1` to control rendering order
- Added to the Three.js scene
- Registered in `sceneRef.current`

#### 4. Store Subscription (line ~395)
- Added `const currentWeather = useGameStore(s => s.currentWeather)` to watch weather changes

#### 5. Weather useEffect (lines ~3760-3946)
New `useEffect` that watches `currentWeather` and creates/disposes weather effects:

**Rain (🌧️):**
- 500 particles using `THREE.Points` + `BufferGeometry`
- Light blue color (0xaaccff), size 0.04, 60% opacity
- Fall speed: 8-12 units/sec with wind drift (-0.8 x/sec)
- Particles reset to top (y=6-10) when reaching ground

**Snow (❄️):**
- 300 particles using `THREE.Points` + `BufferGeometry`
- White color, size 0.07, 85% opacity
- Fall speed: 1-2.5 units/sec (much slower than rain)
- Sinusoidal x-drift using per-particle phase offsets
- Particles reset to top when reaching ground

**Fog (🌫️):**
- NOT particles — uses a semi-transparent `PlaneGeometry` at ground level
- Gray color, DoubleSide rendering
- Opacity pulses between 0.15-0.35 via animation loop

**Sandstorm (💨):**
- 400 particles using `THREE.Points` + `BufferGeometry`
- Sandy/yellow color (0xd4a843), size 0.06, 70% opacity
- Fast horizontal movement: 4-10 units/sec in x direction
- Erratic y-movement via sinusoidal jitter with per-particle phase offsets
- Additional fog overlay plane (sandy color) for reduced visibility effect

**Clear (☀️):**
- No effects (cleanup only)

#### 6. Animation Loop Updates (lines ~2711-2784)
Added weather particle position updates inside the existing `animate()` loop:
- Rain: moves y down by velocity*dt, x by wind*dt, resets to top when y<0
- Snow: moves y down by velocity*dt, adds sinusoidal x drift, resets to top when y<0
- Sandstorm: moves x by velocity*dt, adds erratic y jitter, resets to left edge when x>12
- Fog: pulses opacity using `sin(elapsed * 0.5)` for smooth oscillation
- Sandstorm fog: pulses opacity using `sin(elapsed * 0.8)`
- All updates use direct typed array manipulation with `needsUpdate = true`

#### 7. Cleanup (lines ~2818-2832)
Added disposal of weather resources in the main useEffect cleanup:
- Disposes geometry and material for weather points
- Disposes geometry and material for fog planes
- Runs before renderer disposal

## Performance Considerations
- Uses `Float32Array` for all particle data (no object creation per frame)
- Direct typed array manipulation in animation loop
- `depthWrite: false` on all transparent materials to avoid z-fighting
- `frustumCulled = false` on weather objects since they span the full map
- Particle counts: Rain 500, Snow 300, Sandstorm 400 (all within 300-500 range)
- No shadow casting on weather particles

## Testing
- ESLint passes with zero errors
- Dev server returns HTTP 200 (app running)
