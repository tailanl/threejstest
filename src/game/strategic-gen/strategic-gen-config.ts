export interface StrategicGenConfig {
  seed: number;
  width: number;
  height: number;
  worldShape: 'continent' | 'peninsula' | 'island' | 'inland' | 'river_basin';
  terrain: {
    seaRatio: number;
    mountainRatio: number;
    forestRatio: number;
    desertRatio: number;
    marshRatio: number;
  };
  rivers: {
    mainRiverCount: number;
    tributaryChance: number;
    minRiverLength: number;
    maxRiverLength: number;
    sourceMinElevation: number;
    sourceMinMoisture: number;
  };
  cities: {
    capitalCount: number;
    majorCityCount: number;
    regionalCityCount: number;
    townCount: number;
    minCapitalDistance: number;
    minMajorDistance: number;
    minRegionalDistance: number;
    minTownDistance: number;
  };
  roads: {
    extraRoadRatio: number;
    allowMountainRoads: boolean;
    bridgeMaxRiverWidth: number;
  };
  features: {
    fortressCount: number;
    airfieldCount: number;
    supplyDepotCount: number;
  };
}

export const DEFAULT_STRATEGIC_GEN_CONFIG: StrategicGenConfig = {
  seed: 20260606,
  width: 64,
  height: 48,
  worldShape: 'peninsula',
  terrain: {
    seaRatio: 0.18,
    mountainRatio: 0.18,
    forestRatio: 0.24,
    desertRatio: 0.05,
    marshRatio: 0.06,
  },
  rivers: {
    mainRiverCount: 5,
    tributaryChance: 0.25,
    minRiverLength: 12,
    maxRiverLength: 90,
    sourceMinElevation: 0.55,
    sourceMinMoisture: 0.40,
  },
  cities: {
    capitalCount: 1,
    majorCityCount: 4,
    regionalCityCount: 8,
    townCount: 20,
    minCapitalDistance: 22,
    minMajorDistance: 10,
    minRegionalDistance: 6,
    minTownDistance: 3,
  },
  roads: {
    extraRoadRatio: 0.25,
    allowMountainRoads: true,
    bridgeMaxRiverWidth: 3,
  },
  features: {
    fortressCount: 6,
    airfieldCount: 3,
    supplyDepotCount: 5,
  },
};
