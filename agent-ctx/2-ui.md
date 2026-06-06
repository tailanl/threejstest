# Task 2-ui: Quick Skip Buttons and Deployment Phase UI

## Summary
Added quick skip button label updates in StrategicMap, tactical deployment phase UI in GameUI, deployment zone visual overlay in GameScene, deployment click handling in game-store, and a framer-motion import bug fix in page.tsx.

## Changes Made

### src/components/game/StrategicMap.tsx
- Updated quick skip button labels from "自动回合"/"快速结算" to "⏩ 自动"/"⚡ 快速"

### src/components/game/GameUI.tsx
- Added deployment phase state variables (isDeployment, deployment, selectedDeploymentType, redBudget, redDeployedUnits)
- Added deployment banner (green gradient, animated with AnimatePresence)
- Added deployment left panel with budget tracker, unit type palette (10 types with costs), deployed units list (with remove buttons), and confirm/auto-deploy action buttons
- Added imports: UnitType, TACTICAL_UNIT_COSTS, TACTICAL_DEPLOYMENT_BUDGET, Check, Wand2, Trash2, Star, Plus

### src/components/game/GameScene.tsx
- Added green overlay planes for deployment zone (x:0-3) - 5% opacity for occupied, 20% for empty
- Added green border line at x=3 boundary
- Added `phase` to map render useEffect dependency array

### src/store/game-store.ts
- Added `selectedDeploymentType: UnitType | null` state
- Added `setSelectedDeploymentType(type)` action
- Added `onAutoDeployRed()` action - auto-deploys balanced red force
- Added deployment phase handling in `onCellClick` - deploy selected type or remove deployed unit
- Added imports: UNIT_CONFIGS, TERRAIN_CONFIGS from config

### src/app/page.tsx
- Added `import { motion } from 'framer-motion'` (fixing pre-existing lint error)

## Verification
- ESLint passes with zero errors and zero warnings
- Dev server running without compilation errors
