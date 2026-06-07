/**
 * 补给系统
 */

export interface LogisticsState {
  ammo: Record<string, number>;
  fuel: number;
  maxFuel: number;
  needsAmmo: boolean;
  needsFuel: boolean;
  needsRepair: boolean;
}

export interface SupplyRoute {
  from: { x: number; y: number };
  to: { x: number; y: number };
  status: 'active' | 'disrupted' | 'cut';
  throughput: number;
}

export function consumeAmmo(ammo: Record<string, number>, type: string, amount: number): Record<string, number> {
  const current = ammo[type] ?? 0;
  return { ...ammo, [type]: Math.max(0, current - amount) };
}

export function consumeFuel(current: number, max: number, distance: number, unitType: string): number {
  const consumptionRate = getFuelConsumptionRate(unitType);
  return Math.max(0, current - distance * consumptionRate);
}

function getFuelConsumptionRate(unitType: string): number {
  switch (unitType) {
    case 'tank': return 3;
    case 'ifv': return 2;
    case 'artillery': return 2;
    case 'mlrs': return 2.5;
    case 'supply': return 1.5;
    case 'helicopter': return 5;
    default: return 1;
  }
}

export function canResupply(logistics: LogisticsState, route: SupplyRoute | undefined): boolean {
  if (!route || route.status === 'cut') return false;
  return route.throughput > 0;
}

export function executeResupply(
  logistics: LogisticsState,
  ammoResupply: Partial<Record<string, number>>,
  fuelAmount: number
): LogisticsState {
  const newAmmo = { ...logistics.ammo };
  for (const [type, amount] of Object.entries(ammoResupply)) {
    if (amount) newAmmo[type] = (newAmmo[type] ?? 0) + amount;
  }

  return {
    ...logistics,
    ammo: newAmmo,
    fuel: Math.min(logistics.maxFuel, logistics.fuel + fuelAmount),
    needsAmmo: false,
    needsFuel: logistics.fuel + fuelAmount < logistics.maxFuel * 0.3,
    needsRepair: logistics.needsRepair,
  };
}

export function getLowSupplyStatus(logistics: LogisticsState): {
  ammoState: 'good' | 'limited' | 'critical';
  fuelState: 'good' | 'limited' | 'critical';
} {
  const totalAmmo = Object.values(logistics.ammo).reduce((a, b) => a + b, 0);
  const ammoRatio = totalAmmo > 0 ? 1 : 0;

  const fuelRatio = logistics.maxFuel > 0 ? logistics.fuel / logistics.maxFuel : 0;

  return {
    ammoState: ammoRatio > 0.5 ? 'good' : ammoRatio > 0.2 ? 'limited' : 'critical',
    fuelState: fuelRatio > 0.5 ? 'good' : fuelRatio > 0.2 ? 'limited' : 'critical',
  };
}
