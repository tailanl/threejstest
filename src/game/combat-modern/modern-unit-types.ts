/**
 * 现代战斗系统 - 扩展 Unit 的可选字段
 */

import type { UnitType } from '../types';

export interface SensorProfile {
  visualRange: number;
  thermalRange: number;
  radarRange: number;
  acousticRange: number;
  detectionModifiers: Partial<Record<UnitType, number>>;
}

export interface ArmorProfile {
  front: number;
  side: number;
  rear: number;
  top: number;
}

export interface WeaponProfile {
  name: string;
  type: 'kinetic' | 'he' | 'atgm' | 'sam' | 'artillery' | 'mortar' | 'small_arms';
  range: number;
  penetration: number;
  damage: number;
  rof: number;
  ammoType: string;
  maxAmmo: number;
}

export interface ModernCombatStats {
  morale: number;
  suppression: number;
  cohesion: number;

  fuel: number;
  maxFuel: number;

  ammo: Record<string, number>;

  sensorProfile: SensorProfile;
  armorProfile: ArmorProfile;
  weaponProfiles: WeaponProfile[];

  logisticsState: {
    needsAmmo: boolean;
    needsFuel: boolean;
    needsRepair: boolean;
  };
}

// Default profiles by unit type
export const DEFAULT_SENSOR_PROFILES: Record<string, Partial<SensorProfile>> = {
  tank: { visualRange: 8, thermalRange: 10, radarRange: 0, acousticRange: 4 },
  ifv: { visualRange: 7, thermalRange: 8, radarRange: 0, acousticRange: 3 },
  scout: { visualRange: 12, thermalRange: 14, radarRange: 6, acousticRange: 5 },
  infantry: { visualRange: 5, thermalRange: 3, radarRange: 0, acousticRange: 3 },
  uav: { visualRange: 15, thermalRange: 18, radarRange: 10, acousticRange: 0 },
  helicopter: { visualRange: 10, thermalRange: 12, radarRange: 8, acousticRange: 6 },
  sam: { visualRange: 6, thermalRange: 4, radarRange: 20, acousticRange: 3 },
  artillery: { visualRange: 5, thermalRange: 3, radarRange: 0, acousticRange: 2 },
  mlrs: { visualRange: 5, thermalRange: 3, radarRange: 0, acousticRange: 2 },
  ew: { visualRange: 4, thermalRange: 2, radarRange: 25, acousticRange: 2 },
};

export const DEFAULT_ARMOR_PROFILES: Record<string, Partial<ArmorProfile>> = {
  tank: { front: 25, side: 15, rear: 8, top: 5 },
  ifv: { front: 10, side: 6, rear: 4, top: 3 },
  infantry: { front: 1, side: 1, rear: 1, top: 1 },
  supply: { front: 2, side: 1, rear: 1, top: 1 },
};

export const DEFAULT_WEAPON_PROFILES: Record<string, WeaponProfile[]> = {
  tank: [
    { name: '125mm', type: 'kinetic', range: 12, penetration: 22, damage: 30, rof: 0.2, ammoType: 'ap', maxAmmo: 40 },
    { name: 'coax', type: 'small_arms', range: 6, penetration: 1, damage: 3, rof: 1, ammoType: 'small', maxAmmo: 2000 },
  ],
  ifv: [
    { name: '30mm', type: 'he', range: 8, penetration: 5, damage: 12, rof: 0.5, ammoType: 'he', maxAmmo: 300 },
    { name: 'atgm', type: 'atgm', range: 10, penetration: 18, damage: 25, rof: 0.05, ammoType: 'atgm', maxAmmo: 4 },
  ],
  artillery: [
    { name: '155mm', type: 'artillery', range: 30, penetration: 0, damage: 35, rof: 0.1, ammoType: 'he', maxAmmo: 60 },
  ],
  sam: [
    { name: 'sam', type: 'sam', range: 25, penetration: 0, damage: 40, rof: 0.08, ammoType: 'sam', maxAmmo: 8 },
  ],
};
