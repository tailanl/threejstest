/**
 * RegionTile 生成器 - 编排函数
 * 从 MacroMap 生成 1024×1024 高精度区域
 * 使用 globalX/globalY 采样噪声，保证相邻 region 连续
 */

import type { WorldAtlas } from './atlas-types';
import type { RegionTile, RegionGenerationContext } from '../world-map/world-map-types';
import { RegionRNG, RegionNoise } from './region-random';
import { generateRegionBaseCells, applyMacroTerrainConstraints, computeRegionCellStats } from '../world-map/world-map-terrain';
import { generateRegionRivers } from '../world-map/world-map-rivers';
import { generateRegionCities } from '../world-map/world-map-cities';
import { generateRegionRoads } from '../world-map/world-map-roads';
import { placeRegionBridges, placeRegionFeatures } from '../world-map/world-map-features';
import { validateRegionTile } from '../world-map/world-map-validation';
import { buildStrategicChunks } from '../world-view/strategic-chunks';
import { regionKey } from './coordinates';

function createRegionGenerationContext(
  atlas: WorldAtlas,
  regionX: number,
  regionY: number,
): RegionGenerationContext {
  const regionSize = atlas.regionSize;
  const padding = 16;
  const rng = new RegionRNG(atlas.seed + regionX * 7919 + regionY * 104729);
  const noise = new RegionNoise(atlas.seed);

  return {
    atlas,
    regionX,
    regionY,
    regionSize,
    padding,
    worldOrigin: { globalX: regionX * regionSize, globalY: regionY * regionSize },
    rng,
    noise,
    paddedCells: [],
    cells: [],
    cities: [],
    roads: [],
    rivers: [],
  };
}

function buildRegionTile(ctx: RegionGenerationContext): RegionTile {
  const { atlas, regionX, regionY, regionSize, cells, cities, roads, rivers, worldOrigin } = ctx;

  const tile: RegionTile = {
    id: regionKey(regionX, regionY),
    atlasId: atlas.id,
    regionX, regionY,
    worldOrigin,
    width: regionSize,
    height: regionSize,
    cells,
    strategicChunks: [], // Will be set after buildStrategicChunks
    cities,
    roads,
    rivers,
    politicalRegionIds: atlas.politicalRegions.filter(pr => {
      const rect = atlas.regionIndex[regionKey(regionX, regionY)]?.macroRect;
      if (!rect) return false;
      return pr.macroCells.some(mc => mc.x >= rect.x && mc.x < rect.x + rect.width && mc.y >= rect.y && mc.y < rect.y + rect.height);
    }).map(pr => pr.id),
    economicZoneIds: atlas.economicZones.filter(ez => {
      const cx = regionX * regionSize + regionSize / 2;
      const cy = regionY * regionSize + regionSize / 2;
      const dx = ez.center.globalX - cx;
      const dy = ez.center.globalY - cy;
      return Math.sqrt(dx * dx + dy * dy) < ez.radius + regionSize;
    }).map(ez => ez.id),
    humanGeographyZoneIds: atlas.humanGeographyZones.filter(hg => {
      const cx = regionX * regionSize + regionSize / 2;
      const cy = regionY * regionSize + regionSize / 2;
      const dx = hg.center.globalX - cx;
      const dy = hg.center.globalY - cy;
      return Math.sqrt(dx * dx + dy * dy) < hg.radius + regionSize;
    }).map(hg => hg.id),
  };

  return tile;
}

export function generateRegionTile(atlas: WorldAtlas, regionX: number, regionY: number): RegionTile {
  console.time(`[RegionTile] Generate (${regionX},${regionY})`);

  // Create context
  const ctx = createRegionGenerationContext(atlas, regionX, regionY);

  // Pipeline
  generateRegionBaseCells(ctx);
  applyMacroTerrainConstraints(ctx);
  generateRegionRivers(ctx);
  generateRegionCities(ctx);
  generateRegionRoads(ctx);
  placeRegionBridges(ctx);
  placeRegionFeatures(ctx);
  computeRegionCellStats(ctx);
  validateRegionTile(ctx);

  // Build tile
  const tile = buildRegionTile(ctx);
  tile.strategicChunks = buildStrategicChunks(tile, atlas.strategicChunkSize ?? 32);

  console.timeEnd(`[RegionTile] Generate (${regionX},${regionY})`);
  console.log('[RegionTile] debug', {
    width: tile.width,
    height: tile.height,
    chunkRows: tile.strategicChunks.length,
    chunkCols: tile.strategicChunks[0]?.length ?? 0,
    cities: ctx.cities.length,
    roads: ctx.roads.length,
    rivers: ctx.rivers.length,
  });
  return tile;
}
