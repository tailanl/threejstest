/**
 * 地形生成 - 从噪声和宏观数据生成区域基础格子
 * 包含地形分类、坡度计算、属性辅助函数
 */

import type { WorldAtlas, MacroCell } from '../world-atlas/atlas-types';
import type { RegionGenerationContext } from './world-map-types';
import type { WorldCell, WorldTerrainType } from './world-cell-types';
import { RegionRNG, RegionNoise } from '../world-atlas/region-random';
import { regionKey } from '../world-atlas/coordinates';

// ─── Terrain helper functions ───

export function getMovementCost(t: WorldTerrainType): number {
  const map: Record<WorldTerrainType, number> = { plains: 1, forest: 2, mountain: 3, water: 99, desert: 1.5, marshland: 3, highland: 2, city: 1 };
  return map[t] ?? 1;
}

export function getDefenseBonus(t: WorldTerrainType): number {
  const map: Record<WorldTerrainType, number> = { plains: 0, forest: 15, mountain: 25, water: 0, desert: -5, marshland: -10, highland: 10, city: 20 };
  return map[t] ?? 0;
}

export function getConcealment(t: WorldTerrainType): number {
  const map: Record<WorldTerrainType, number> = { plains: 0, forest: 40, mountain: 20, water: 0, desert: 0, marshland: 15, highland: 10, city: 35 };
  return map[t] ?? 0;
}

export function getCover(t: WorldTerrainType): number {
  const map: Record<WorldTerrainType, number> = { plains: 0, forest: 30, mountain: 25, water: 0, desert: 5, marshland: 10, highland: 20, city: 40 };
  return map[t] ?? 0;
}

export function getVisionBlock(t: WorldTerrainType): number {
  const map: Record<WorldTerrainType, number> = { plains: 0, forest: 0.5, mountain: 0.7, water: 0, desert: 0, marshland: 0.1, highland: 0.3, city: 0.4 };
  return map[t] ?? 0;
}

// ─── Terrain classification ───

function classifyTerrain(elevation: number, moisture: number, temperature: number): WorldTerrainType {
  if (elevation < 0.15) return 'water';
  if (elevation > 0.75) return 'mountain';
  if (elevation > 0.6 && moisture < 0.3) return 'highland';
  if (moisture > 0.6 && temperature > 0.4) return 'forest';
  if (moisture < 0.22 && temperature > 0.6) return 'desert';
  if (moisture > 0.7 && elevation < 0.3) return 'marshland';
  return 'plains';
}

// ─── Slope computation from neighbors ───

function computeSlopeFromNeighbors(paddedCells: WorldCell[][], paddedSize: number, padding: number): void {
  for (let py = 1; py < paddedSize - 1; py++) {
    for (let px = 1; px < paddedSize - 1; px++) {
      const cell = paddedCells[py]?.[px];
      if (!cell) continue;

      const e = cell.elevation;
      const n  = paddedCells[py - 1]?.[px]?.elevation ?? e;
      const s  = paddedCells[py + 1]?.[px]?.elevation ?? e;
      const w  = paddedCells[py]?.[px - 1]?.elevation ?? e;
      const ne = paddedCells[py - 1]?.[px + 1]?.elevation ?? e;

      // 最大高度差作为坡度
      const maxDiff = Math.max(
        Math.abs(e - n),
        Math.abs(e - s),
        Math.abs(e - w),
        Math.abs(e - ne),
      );
      cell.slope = Math.min(1, maxDiff);
    }
  }
}

// ─── Desert ratio limiter ───

const MAX_DESERT_RATIO = 0.04;

function limitDesertRatio(cells: WorldCell[][], regionSize: number): void {
  let desertCount = 0;
  const total = regionSize * regionSize;
  for (let y = 0; y < regionSize; y++) {
    for (let x = 0; x < regionSize; x++) {
      if (cells[y]?.[x]?.baseTerrain === 'desert') desertCount++;
    }
  }
  if (desertCount / total <= MAX_DESERT_RATIO) return;

  // Convert excess desert cells back to plains
  const targetDesert = Math.floor(total * MAX_DESERT_RATIO);
  let removed = 0;
  for (let y = 0; y < regionSize && removed < desertCount - targetDesert; y++) {
    for (let x = 0; x < regionSize && removed < desertCount - targetDesert; x++) {
      const cell = cells[y]?.[x];
      if (cell && cell.baseTerrain === 'desert') {
        cell.baseTerrain = 'plains';
        cell.movementCost = getMovementCost('plains');
        cell.defenseBonus = getDefenseBonus('plains');
        cell.concealment = getConcealment('plains');
        cell.cover = getCover('plains');
        cell.visionBlock = getVisionBlock('plains');
        removed++;
      }
    }
  }
}

// ─── Main terrain generation ───

export function generateRegionBaseCells(ctx: RegionGenerationContext): void {
  const { atlas, regionX, regionY, regionSize, padding, worldOrigin, rng } = ctx;
  const paddedSize = regionSize + padding * 2;

  // Noise using GLOBAL coordinates
  const noise1 = new RegionNoise(atlas.seed);
  const noise2 = new RegionNoise(atlas.seed + 1000);
  const noise3 = new RegionNoise(atlas.seed + 2000);
  const moistureNoise = new RegionNoise(atlas.seed + 3000);

  const paddedCells: WorldCell[][] = [];

  for (let ly = -padding; ly < regionSize + padding; ly++) {
    const row: WorldCell[] = [];
    for (let lx = -padding; lx < regionSize + padding; lx++) {
      const gx = worldOrigin.globalX + lx;
      const gy = worldOrigin.globalY + ly;

      // Sample noise with GLOBAL coordinates
      const nx = gx / atlas.virtualWidth;
      const ny = gy / atlas.virtualHeight;

      const continental = noise1.fbm(nx * 3, ny * 3, 4, 0.5, 2.0, 1.0);
      const mountain = noise2.fbm(nx * 5, ny * 5, 5, 0.45, 2.1, 1.0);
      const local = noise3.fbm(nx * 10, ny * 10, 3, 0.5, 2.0, 1.0);

      const edgeDistX = Math.min(gx, atlas.virtualWidth - gx) / (atlas.virtualWidth * 0.15);
      const edgeDistY = Math.min(gy, atlas.virtualHeight - gy) / (atlas.virtualHeight * 0.15);
      const edgeMask = Math.min(1, Math.min(edgeDistX, edgeDistY));

      let elevation = continental * 0.55 + mountain * 0.30 + local * 0.15;
      elevation *= edgeMask;
      elevation = Math.max(0, Math.min(1, elevation));

      // Blend with macro data if available
      const mx = Math.floor(gx / (atlas.virtualWidth / atlas.macroWidth));
      const my = Math.floor(gy / (atlas.virtualHeight / atlas.macroHeight));
      const macroCell = atlas.macroCells[my]?.[mx];
      if (macroCell) {
        if (macroCell.biome === 'ocean') elevation = Math.min(elevation, 0.12);
        if (macroCell.biome === 'mountain') elevation = Math.max(elevation, 0.65);
      }

      const moisture = moistureNoise.fbm(nx * 4, ny * 4, 4, 0.5, 2.0, 1.0);
      const temperature = 0.3 + (1 - Math.abs(ny - 0.5) * 2) * 0.5 - elevation * 0.3;

      // Classify terrain
      const baseTerrain = classifyTerrain(elevation, moisture, temperature);

      // Economic/political from atlas
      let economicValue = 0.1;
      let populationDensity = 0.1;
      let owner: string | undefined;

      for (const ez of atlas.economicZones) {
        const dx = gx - ez.center.globalX;
        const dy = gy - ez.center.globalY;
        if (dx * dx + dy * dy < ez.radius * ez.radius) {
          economicValue = Math.max(economicValue, ez.outputValue);
        }
      }
      for (const hg of atlas.humanGeographyZones) {
        const dx = gx - hg.center.globalX;
        const dy = gy - hg.center.globalY;
        if (dx * dx + dy * dy < hg.radius * hg.radius) {
          populationDensity = Math.max(populationDensity, hg.populationDensity);
        }
      }
      for (const pr of atlas.politicalRegions) {
        for (const mc of pr.macroCells) {
          if (mx === mc.x && my === mc.y) {
            owner = pr.factionId;
            break;
          }
        }
      }

      row.push({
        globalX: gx, globalY: gy,
        regionX, regionY,
        localX: ((lx % regionSize) + regionSize) % regionSize,
        localY: ((ly % regionSize) + regionSize) % regionSize,
        baseTerrain,
        features: [],
        elevation, slope: 0, // Will be computed from neighbors later
        moisture: Math.max(0, Math.min(1, moisture)),
        temperature: Math.max(0, Math.min(1, temperature)),
        populationDensity,
        economicValue,
        infrastructureValue: economicValue * 0.5,
        movementCost: getMovementCost(baseTerrain),
        defenseBonus: getDefenseBonus(baseTerrain),
        concealment: getConcealment(baseTerrain),
        cover: getCover(baseTerrain),
        visionBlock: getVisionBlock(baseTerrain),
        owner: owner as any,
      });
    }
    paddedCells.push(row);
  }

  // Compute slope from neighbors (on padded grid so border cells have valid neighbors)
  computeSlopeFromNeighbors(paddedCells, paddedSize, padding);

  // Crop to regionSize (remove padding)
  const cells: WorldCell[][] = [];
  for (let y = padding; y < paddedSize - padding; y++) {
    const row: WorldCell[] = [];
    for (let x = padding; x < paddedSize - padding; x++) {
      row.push(paddedCells[y]?.[x] ?? paddedCells[padding]?.[padding]);
    }
    cells.push(row);
  }

  // Limit desert ratio to 4%
  limitDesertRatio(cells, regionSize);

  ctx.paddedCells = paddedCells;
  ctx.cells = cells;
}

// ─── Macro terrain constraints ───

export function applyMacroTerrainConstraints(ctx: RegionGenerationContext): void {
  const { atlas, regionX, regionY, regionSize, cells } = ctx;
  const macroRect = atlas.regionIndex[regionKey(regionX, regionY)]?.macroRect;
  if (!macroRect) return;

  // Apply macro-level biome overrides for cells near macro boundaries
  for (let y = 0; y < regionSize; y++) {
    for (let x = 0; x < regionSize; x++) {
      const cell = cells[y]?.[x];
      if (!cell) continue;

      const gx = cell.globalX;
      const gy = cell.globalY;
      const mx = Math.floor(gx / (atlas.virtualWidth / atlas.macroWidth));
      const my = Math.floor(gy / (atlas.virtualHeight / atlas.macroHeight));
      const macroCell = atlas.macroCells[my]?.[mx];
      if (!macroCell) continue;

      // Enforce ocean boundary
      if (macroCell.biome === 'ocean' && cell.elevation >= 0.15) {
        cell.elevation = 0.1;
        cell.baseTerrain = 'water';
        cell.movementCost = getMovementCost('water');
        cell.defenseBonus = getDefenseBonus('water');
        cell.concealment = getConcealment('water');
        cell.cover = getCover('water');
        cell.visionBlock = getVisionBlock('water');
      }

      // Enforce mountain range
      if (macroCell.hasMountainRange && cell.elevation < 0.55) {
        cell.elevation = 0.6 + cell.elevation * 0.3;
        if (cell.elevation > 0.75) {
          cell.baseTerrain = 'mountain';
          cell.movementCost = getMovementCost('mountain');
          cell.defenseBonus = getDefenseBonus('mountain');
          cell.concealment = getConcealment('mountain');
          cell.cover = getCover('mountain');
          cell.visionBlock = getVisionBlock('mountain');
        }
      }
    }
  }
}

// ─── Region cell stats ───

export function computeRegionCellStats(ctx: RegionGenerationContext): void {
  const { cells, regionSize } = ctx;
  // Recompute slope from neighbors on the final cells grid
  for (let y = 0; y < regionSize; y++) {
    for (let x = 0; x < regionSize; x++) {
      const cell = cells[y]?.[x];
      if (!cell) continue;

      const e = cell.elevation;
      const n  = cells[y - 1]?.[x]?.elevation ?? e;
      const s  = cells[y + 1]?.[x]?.elevation ?? e;
      const w  = cells[y]?.[x - 1]?.elevation ?? e;
      const ne = cells[y - 1]?.[x + 1]?.elevation ?? e;

      const maxDiff = Math.max(
        Math.abs(e - n),
        Math.abs(e - s),
        Math.abs(e - w),
        Math.abs(e - ne),
      );
      cell.slope = Math.min(1, maxDiff);
    }
  }
}
