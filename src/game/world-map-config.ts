/** @deprecated Use directory equivalents under src/game/world-map/ and src/game/world-view/ instead */
/**
 * WorldMap 生成配置
 */

export interface WorldMapGenConfig {
  seed: number;

  width: number;
  height: number;

  chunkSize: number;

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
    minMainRiverLength: number;
    maxMainRiverLength: number;
  };

  cities: {
    capitalCount: number;
    majorCityCount: number;
    regionalCityCount: number;
    townCount: number;

    capitalRadius: [number, number];
    majorRadius: [number, number];
    regionalRadius: [number, number];
    townRadius: [number, number];

    minCapitalDistance: number;
    minMajorDistance: number;
    minRegionalDistance: number;
    minTownDistance: number;
  };

  roads: {
    connectCapitalToMajors: boolean;
    connectMajorMST: boolean;
    connectRegionalToMajor: boolean;
    connectTownToRegional: boolean;
    extraRoadRatio: number;
  };

  features: {
    fortressCount: number;
    airfieldCount: number;
    supplyDepotCount: number;
  };
}

export const DEFAULT_WORLD_MAP_CONFIG: WorldMapGenConfig = {
  seed: 20260606,

  width: 1024,
  height: 1024,

  chunkSize: 32,

  terrain: {
    seaRatio: 0.12,
    desertMaxRatio: 0.04,
    forestTargetRatio: 0.25,
    mountainTargetRatio: 0.18,
    waterTargetRatio: 0.12,
  },

  rivers: {
    mainRiverCount: 8,
    tributaryCount: 20,
    minMainRiverLength: 160,
    maxMainRiverLength: 900,
  },

  cities: {
    capitalCount: 1,
    majorCityCount: 6,
    regionalCityCount: 18,
    townCount: 60,

    capitalRadius: [40, 70],
    majorRadius: [25, 45],
    regionalRadius: [12, 25],
    townRadius: [5, 12],

    minCapitalDistance: 180,
    minMajorDistance: 110,
    minRegionalDistance: 55,
    minTownDistance: 24,
  },

  roads: {
    connectCapitalToMajors: true,
    connectMajorMST: true,
    connectRegionalToMajor: true,
    connectTownToRegional: true,
    extraRoadRatio: 0.25,
  },

  features: {
    fortressCount: 20,
    airfieldCount: 12,
    supplyDepotCount: 24,
  },
};

export const DEBUG_WORLD_MAP_CONFIG: WorldMapGenConfig = {
  ...DEFAULT_WORLD_MAP_CONFIG,
  width: 512,
  height: 512,
  chunkSize: 32,
  cities: {
    ...DEFAULT_WORLD_MAP_CONFIG.cities,
    capitalCount: 1,
    majorCityCount: 3,
    regionalCityCount: 8,
    townCount: 25,
  },
  rivers: {
    ...DEFAULT_WORLD_MAP_CONFIG.rivers,
    mainRiverCount: 4,
    tributaryCount: 10,
  },
  features: {
    fortressCount: 8,
    airfieldCount: 5,
    supplyDepotCount: 10,
  },
};
