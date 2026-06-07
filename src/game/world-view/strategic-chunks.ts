/**
 * StrategicChunk - 每32×32 WorldCell 汇总成1个StrategicChunk
 */

import type { WorldTerrainType, WorldFeatureType } from '../world-map/world-cell-types';
import type { WorldPosition } from '../world-atlas/atlas-types';
import type { RegionTile } from '../world-map/world-map-types';

export interface StrategicChunk {
  id: string;

  regionX: number;
  regionY: number;

  chunkX: number;
  chunkY: number;

  worldRect: {
    x: number;
    y: number;
    width: number;
    height: number;
  };

  dominantTerrain: WorldTerrainType;
  terrainMix: Record<WorldTerrainType, number>;

  features: {
    hasCity: boolean;
    hasCapital: boolean;
    hasRiver: boolean;
    hasMainRoad: boolean;
    hasBridge: boolean;
    hasFortress: boolean;
    hasAirfield: boolean;
    hasSupplyDepot: boolean;
    hasEconomicTarget: boolean;
  };

  cityIds: string[];

  strategicValue: {
    supply: number;
    defense: number;
    movement: number;
    chokepoint: number;
    victoryPoint: number;
    economic: number;
    political: number;
  };

  control: 'red' | 'blue' | 'neutral' | 'contested';
  knownByPlayer: boolean;
}

export function buildStrategicChunks(
  regionTile: RegionTile,
  chunkSize: number = 32
): StrategicChunk[][] {
  const { cells, cities, regionX, regionY, worldOrigin } = regionTile;

  const rows = cells.length;
  const cols = rows > 0 ? cells[0].length : 0;
  const chunksX = Math.ceil(cols / chunkSize);
  const chunksY = Math.ceil(rows / chunkSize);

  const result: StrategicChunk[][] = [];

  for (let cy = 0; cy < chunksY; cy++) {
    const chunkRow: StrategicChunk[] = [];
    for (let cx = 0; cx < chunksX; cx++) {
      const startCol = cx * chunkSize;
      const startRow = cy * chunkSize;
      const endCol = Math.min(startCol + chunkSize, cols);
      const endRow = Math.min(startRow + chunkSize, rows);

      // Collect cells in this chunk
      const chunkCells: typeof cells[0][0][] = [];
      for (let r = startRow; r < endRow; r++) {
        for (let c = startCol; c < endCol; c++) {
          if (cells[r]?.[c]) {
            chunkCells.push(cells[r][c]);
          }
        }
      }

      const worldRect = {
        x: worldOrigin.globalX + startCol,
        y: worldOrigin.globalY + startRow,
        width: endCol - startCol,
        height: endRow - startRow,
      };

      // Compute terrainMix
      const terrainCounts: Record<string, number> = {};
      for (const cell of chunkCells) {
        terrainCounts[cell.baseTerrain] = (terrainCounts[cell.baseTerrain] ?? 0) + 1;
      }

      // Find dominant terrain
      let dominantTerrain: WorldTerrainType = 'plains';
      let maxCount = 0;
      for (const [terrain, count] of Object.entries(terrainCounts)) {
        if (count > maxCount) {
          maxCount = count;
          dominantTerrain = terrain as WorldTerrainType;
        }
      }

      // Normalize terrainMix to ratios
      const totalCells = chunkCells.length || 1;
      const terrainMix: Record<WorldTerrainType, number> = {} as Record<WorldTerrainType, number>;
      for (const [terrain, count] of Object.entries(terrainCounts)) {
        terrainMix[terrain as WorldTerrainType] = count / totalCells;
      }

      // Compute features from cell features
      const features: StrategicChunk['features'] = {
        hasCity: false,
        hasCapital: false,
        hasRiver: false,
        hasMainRoad: false,
        hasBridge: false,
        hasFortress: false,
        hasAirfield: false,
        hasSupplyDepot: false,
        hasEconomicTarget: false,
      };

      for (const cell of chunkCells) {
        for (const f of cell.features) {
          if (f === 'city_center' || f === 'urban_block' || f === 'suburb') features.hasCity = true;
          if (f === 'river' || f === 'stream') features.hasRiver = true;
          if (f === 'main_road') features.hasMainRoad = true;
          if (f === 'bridge') features.hasBridge = true;
          if (f === 'fortress') features.hasFortress = true;
          if (f === 'airfield' || f === 'airport') features.hasAirfield = true;
          if (f === 'supply_depot') features.hasSupplyDepot = true;
          if (f === 'industrial' || f === 'power_plant' || f === 'factory') features.hasEconomicTarget = true;
        }
      }

      // Compute cityIds - any city whose bounds intersect with the chunk's worldRect
      const cityIds: string[] = [];
      for (const city of cities) {
        if (
          city.bounds.minX < worldRect.x + worldRect.width &&
          city.bounds.maxX >= worldRect.x &&
          city.bounds.minY < worldRect.y + worldRect.height &&
          city.bounds.maxY >= worldRect.y
        ) {
          cityIds.push(city.id);
          if (city.rank === 'capital') features.hasCapital = true;
        }
      }

      // Compute strategicValue from terrain + features
      const strategicValue: StrategicChunk['strategicValue'] = {
        supply: features.hasSupplyDepot ? 80 : features.hasCity ? 40 : 10,
        defense: features.hasFortress
          ? 80
          : dominantTerrain === 'mountain'
            ? 60
            : dominantTerrain === 'highland'
              ? 50
              : dominantTerrain === 'city'
                ? 50
                : 20,
        movement: features.hasMainRoad
          ? 80
          : dominantTerrain === 'plains'
            ? 60
            : dominantTerrain === 'water'
              ? 0
              : 30,
        chokepoint: features.hasBridge ? 90 : features.hasRiver ? 40 : 10,
        victoryPoint: features.hasCapital ? 100 : features.hasCity ? 50 : 5,
        economic: features.hasEconomicTarget ? 80 : features.hasCity ? 50 : 10,
        political: features.hasCapital ? 100 : features.hasCity ? 40 : 5,
      };

      // Determine control from cell owners
      let redCount = 0;
      let blueCount = 0;
      for (const cell of chunkCells) {
        if (cell.owner === 'red') redCount++;
        else if (cell.owner === 'blue') blueCount++;
      }
      const control: StrategicChunk['control'] =
        redCount > blueCount * 2
          ? 'red'
          : blueCount > redCount * 2
            ? 'blue'
            : redCount > 0 && blueCount > 0
              ? 'contested'
              : 'neutral';

      chunkRow.push({
        id: `chunk_${regionX}_${regionY}_${cx}_${cy}`,
        regionX,
        regionY,
        chunkX: cx,
        chunkY: cy,
        worldRect,
        dominantTerrain,
        terrainMix,
        features,
        cityIds,
        strategicValue,
        control,
        knownByPlayer: false,
      });
    }
    result.push(chunkRow);
  }

  return result;
}
