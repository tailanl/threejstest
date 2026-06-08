/**
 * One-call smoke test for the WorldAtlas -> tactical map chain.
 */

import type { WorldAtlasConfig } from './atlas-config';
import { DEFAULT_WORLD_ATLAS_CONFIG } from './atlas-config';
import { generateWorldAtlas } from './macro-map-generator';
import { generateRegionTile } from './region-tile-generator';
import { buildStrategicMapFromRegionTile } from '../world-view/strategic-map-adapter';
import { getOperationViewForChunk } from '../world-view/operation-view';
import { getCombatViewportFromOperationCell } from '../world-view/combat-viewport';
import { convertCombatViewportToGameMap } from '../world-view/world-to-game-map';

export interface DebugWorldAtlasChainSummary {
  atlas: [number, number];
  regionTile: [number, number];
  strategicMap: [number, number];
  strategicChunks: [number, number];
  operationView: [number, number];
  combatViewport: [number, number];
  gameMap: [number, number];
}

export function debugWorldAtlasChain(
  config: WorldAtlasConfig = DEFAULT_WORLD_ATLAS_CONFIG,
): DebugWorldAtlasChainSummary {
  const atlas = generateWorldAtlas({ ...config });
  const regionTile = generateRegionTile(atlas, 0, 0);
  const strategicMap = buildStrategicMapFromRegionTile(regionTile);

  const chunk = regionTile.strategicChunks[0]?.[0];
  if (!chunk) {
    throw new Error('debugWorldAtlasChain: generated region has no strategic chunks');
  }

  const operationView = getOperationViewForChunk(regionTile, chunk, 128);
  const combatCenter = {
    globalX: operationView.worldRect.x + Math.floor(operationView.worldRect.width / 2),
    globalY: operationView.worldRect.y + Math.floor(operationView.worldRect.height / 2),
  };
  const combatViewport = getCombatViewportFromOperationCell({
    regionTile,
    cellPosition: combatCenter,
    width: 64,
    height: 48,
  });
  const gameMap = convertCombatViewportToGameMap(combatViewport);

  const summary: DebugWorldAtlasChainSummary = {
    atlas: [atlas.virtualWidth, atlas.virtualHeight],
    regionTile: [regionTile.width, regionTile.height],
    strategicMap: [strategicMap.width, strategicMap.height],
    strategicChunks: [regionTile.strategicChunks[0]?.length ?? 0, regionTile.strategicChunks.length],
    operationView: [operationView.worldRect.width, operationView.worldRect.height],
    combatViewport: [combatViewport.worldRect.width, combatViewport.worldRect.height],
    gameMap: [gameMap.width, gameMap.height],
  };

  console.log('[WorldChain] debug', summary);
  return summary;
}
