# Task 2-engine: Strategic Engine Updates

## Summary
Updated strategic and tactical game engines with Quick Skip/Auto-resolve, Deployment Phase for strategic mode, and Tactical Deployment Phase for tactical mode.

## Changes Made

### 1. Strategic Types (`src/game/strategic-types.ts`)
- Added `StrategicPhase` type with `'deployment'` phase
- Added `StrategicDeploymentInfo` interface (budget, deployment zones)
- Added `cost` field to `ForceTemplate`
- Added `ForceTemplateWithCost` interface
- Added `deployment?` field to `StrategicGameState`

### 2. Strategic Engine (`src/game/strategic-engine.ts`)
- Added costs to all 7 templates: armor(25), mech_inf(20), artillery(18), recon(15), air_defense(14), engineer(16), combined(22)
- `autoPlayStrategicTurn(state, faction)` - AI plays red's turn
- `quickResolveAll(state)` - Instant combat resolution for red
- `initStrategicDeployment(difficulty)` - Creates deployment phase state
- `deployForce(state, templateKey, faction, position)` - Place force during deployment
- `removeDeployedForce(state, forceId)` - Remove force, refund budget
- `confirmDeployment(state)` - Start game, auto-deploy blue if needed
- `getDeploymentBudget(state, faction)` - Budget helper
- `autoDeployBlueForces(state)` - AI deploys blue during deployment

### 3. Tactical Types (`src/game/types.ts`)
- Added `'deployment'` to `GamePhase`
- Added `TacticalDeploymentInfo` interface
- Added `TACTICAL_UNIT_COSTS` constant (10 unit costs)
- Added `TACTICAL_DEPLOYMENT_BUDGET = 150`
- Added `deployment?` field to `GameState`

### 4. Tactical Engine (`src/game/engine.ts`)
- `initDeploymentState(difficulty, mapType)` - Creates deployment phase
- `deployUnit(state, unitType, faction, position)` - Place unit during deployment
- `removeDeployedUnit(state, unitId)` - Remove unit, refund budget
- `confirmTacticalDeployment(state)` - Start game, auto-deploy blue if needed
- `getTacticalDeploymentBudget(state, faction)` - Budget helper
- `autoDeployBlueTactical(state)` - AI deploys blue units

### 5. Stores Updated
- `strategic-store.ts`: Added 6 new actions
- `game-store.ts`: Added 5 new actions

## Verification
- ESLint passes with zero errors
- Dev server running without compilation errors
