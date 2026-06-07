/**
 * WorldAtlas 配置
 */

export interface WorldAtlasConfig {
  seed: number;

  virtualWidth: number;
  virtualHeight: number;

  macroWidth: number;
  macroHeight: number;

  regionSize: number;
  regionGridWidth: number;
  regionGridHeight: number;

  strategicChunkSize: number;

  terrain: {
    seaRatio: number;
    desertMaxRatio: number;
    forestTargetRatio: number;
    mountainTargetRatio: number;
    waterTargetRatio: number;
  };

  rivers: {
    mainRiverCount: number;
    tributaryCount: number;
  };

  settlements: {
    capitalCount: number;
    majorCityCount: number;
    regionalCityCount: number;
    townCount: number;

    capitalRadius: [number, number];
    majorRadius: [number, number];
    regionalRadius: [number, number];
    townRadius: [number, number];
  };

  roads: {
    extraRoadRatio: number;
    generateRail: boolean;
  };

  politics: {
    politicalRegionCount: number;
    contestedBorderRatio: number;
  };

  economy: {
    industrialZoneCount: number;
    portZoneCount: number;
    logisticsHubCount: number;
    energyZoneCount: number;
  };
}

export const DEFAULT_WORLD_ATLAS_CONFIG: WorldAtlasConfig = {
  seed: 20260606,

  virtualWidth: 8192,
  virtualHeight: 8192,

  macroWidth: 256,
  macroHeight: 256,

  regionSize: 1024,
  regionGridWidth: 8,
  regionGridHeight: 8,

  strategicChunkSize: 32,

  terrain: {
    seaRatio: 0.12,
    desertMaxRatio: 0.04,
    forestTargetRatio: 0.25,
    mountainTargetRatio: 0.18,
    waterTargetRatio: 0.12,
  },

  rivers: {
    mainRiverCount: 12,
    tributaryCount: 36,
  },

  settlements: {
    capitalCount: 2,
    majorCityCount: 12,
    regionalCityCount: 36,
    townCount: 120,

    capitalRadius: [40, 70],
    majorRadius: [25, 45],
    regionalRadius: [12, 25],
    townRadius: [5, 12],
  },

  roads: {
    extraRoadRatio: 0.25,
    generateRail: false,
  },

  politics: {
    politicalRegionCount: 6,
    contestedBorderRatio: 0.18,
  },

  economy: {
    industrialZoneCount: 10,
    portZoneCount: 6,
    logisticsHubCount: 14,
    energyZoneCount: 8,
  },
};

export const DEBUG_WORLD_ATLAS_CONFIG: WorldAtlasConfig = {
  ...DEFAULT_WORLD_ATLAS_CONFIG,
  virtualWidth: 2048,
  virtualHeight: 2048,
  macroWidth: 64,
  macroHeight: 64,
  regionGridWidth: 2,
  regionGridHeight: 2,
  settlements: {
    ...DEFAULT_WORLD_ATLAS_CONFIG.settlements,
    capitalCount: 1,
    majorCityCount: 3,
    regionalCityCount: 8,
    townCount: 25,
  },
  rivers: {
    mainRiverCount: 3,
    tributaryCount: 8,
  },
  politics: {
    politicalRegionCount: 2,
    contestedBorderRatio: 0.2,
  },
  economy: {
    industrialZoneCount: 3,
    portZoneCount: 2,
    logisticsHubCount: 4,
    energyZoneCount: 2,
  },
};
