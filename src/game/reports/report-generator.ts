/**
 * ReportGenerator - 从 BattleLogEvent[] 生成 AIReport[]
 */

import type { BattleLogEvent, AIReport, UnitLossSummary } from './report-types';
import type { HQOrder } from '../command/command-types';

export function generateReportsFromBattleLog(params: {
  events: BattleLogEvent[];
  turn: number;
  commanderId: string;
  relatedOrderIds?: string[];
  relatedForceIds?: string[];
}): AIReport[] {
  const { events, turn, commanderId, relatedOrderIds = [], relatedForceIds = [] } = params;
  const reports: AIReport[] = [];

  // Group events by type
  const byType = new Map<string, BattleLogEvent[]>();
  for (const e of events) {
    const arr = byType.get(e.type) ?? [];
    arr.push(e);
    byType.set(e.type, arr);
  }

  // SITREP from objective_captured
  const objectiveEvents = byType.get('objective_captured') ?? [];
  if (objectiveEvents.length > 0) {
    const facts = objectiveEvents.filter(e => e.confirmedByPlayer || e.visibilityConfidence === 'confirmed').map(e => e.message);
    const estimates = objectiveEvents.filter(e => e.visibilityConfidence === 'estimated').map(e => e.message);
    reports.push({
      id: `sitrep_${turn}_${Date.now()}`,
      turn, timestamp: Date.now(),
      type: 'SITREP', fromCommanderId: commanderId,
      relatedOrderIds, relatedForceIds,
      title: 'Situation Report',
      summary: `${objectiveEvents.length} objective event(s) this turn`,
      facts, estimates: estimates,
      losses: { friendlyConfirmed: emptyLosses(), enemyConfirmed: emptyLosses(), enemyEstimated: emptyLosses() },
      supply: { ammoState: 'good', fuelState: 'good', repairState: 'good' },
      recommendations: [],
      confidence: facts.length > estimates.length ? 'high' : 'medium',
      rawLogIds: objectiveEvents.map(e => e.id),
    });
  }

  // INTREP from unit_spotted
  const spottedEvents = byType.get('unit_spotted') ?? [];
  if (spottedEvents.length > 0) {
    const facts = spottedEvents.filter(e => e.visibilityConfidence === 'confirmed').map(e => e.message);
    const estimates = spottedEvents.filter(e => e.visibilityConfidence === 'estimated').map(e => e.message);
    reports.push({
      id: `intrep_${turn}_${Date.now()}`,
      turn, timestamp: Date.now(),
      type: 'INTREP', fromCommanderId: commanderId,
      relatedOrderIds, relatedForceIds,
      title: 'Intelligence Report',
      summary: `${spottedEvents.length} unit(s) spotted`,
      facts, estimates,
      losses: { friendlyConfirmed: emptyLosses(), enemyConfirmed: emptyLosses(), enemyEstimated: emptyLosses() },
      supply: { ammoState: 'good', fuelState: 'good', repairState: 'good' },
      recommendations: [{ text: 'Adjust positions based on intel', urgency: 'medium' }],
      confidence: facts.length > 0 ? 'high' : 'medium',
      rawLogIds: spottedEvents.map(e => e.id),
    });
  }

  // BDA from unit_lost / unit_damaged
  const damageEvents = [...(byType.get('unit_lost') ?? []), ...(byType.get('unit_damaged') ?? [])];
  if (damageEvents.length > 0) {
    const facts = damageEvents.filter(e => e.visibilityConfidence === 'confirmed').map(e => e.message);
    const estimates = damageEvents.filter(e => e.visibilityConfidence === 'estimated').map(e => e.message);
    const friendlyLosses = countLosses(damageEvents.filter(e => e.message.includes('friendly')));
    const enemyLosses = countLosses(damageEvents.filter(e => e.message.includes('enemy')));
    reports.push({
      id: `bda_${turn}_${Date.now()}`,
      turn, timestamp: Date.now(),
      type: 'BDA', fromCommanderId: commanderId,
      relatedOrderIds, relatedForceIds,
      title: 'Battle Damage Assessment',
      summary: `${damageEvents.length} damage event(s)`,
      facts, estimates,
      losses: { friendlyConfirmed: friendlyLosses, enemyConfirmed: enemyLosses, enemyEstimated: emptyLosses() },
      supply: { ammoState: 'good', fuelState: 'good', repairState: 'good' },
      recommendations: [{ text: 'Assess need for reinforcement', urgency: damageEvents.length > 3 ? 'high' : 'medium' }],
      confidence: 'medium',
      rawLogIds: damageEvents.map(e => e.id),
    });
  }

  // LOGREP from supply events
  const supplyEvents = [...(byType.get('supply_used') ?? []), ...(byType.get('resupply_completed') ?? [])];
  if (supplyEvents.length > 0) {
    const ammoCritical = supplyEvents.filter(e => e.message.includes('ammo') && e.message.includes('critical')).length > 0;
    const fuelCritical = supplyEvents.filter(e => e.message.includes('fuel') && e.message.includes('critical')).length > 0;
    reports.push({
      id: `logrep_${turn}_${Date.now()}`,
      turn, timestamp: Date.now(),
      type: 'LOGREP', fromCommanderId: commanderId,
      relatedOrderIds, relatedForceIds,
      title: 'Logistics Report',
      summary: `${supplyEvents.length} supply event(s)`,
      facts: supplyEvents.filter(e => e.confirmedByPlayer).map(e => e.message),
      estimates: [],
      losses: { friendlyConfirmed: emptyLosses(), enemyConfirmed: emptyLosses(), enemyEstimated: emptyLosses() },
      supply: {
        ammoState: ammoCritical ? 'critical' : 'good',
        fuelState: fuelCritical ? 'critical' : 'good',
        repairState: 'good',
      },
      recommendations: ammoCritical ? [{ text: 'Request ammo resupply immediately', urgency: 'critical' }] : [],
      confidence: 'high',
      rawLogIds: supplyEvents.map(e => e.id),
    });
  }

  // WARNING from order_failed
  const failedEvents = byType.get('order_failed') ?? [];
  if (failedEvents.length > 0) {
    reports.push({
      id: `warn_${turn}_${Date.now()}`,
      turn, timestamp: Date.now(),
      type: 'WARNING', fromCommanderId: commanderId,
      relatedOrderIds, relatedForceIds,
      title: 'Order Failure Warning',
      summary: `${failedEvents.length} order(s) failed`,
      facts: failedEvents.map(e => e.message),
      estimates: [],
      losses: { friendlyConfirmed: emptyLosses(), enemyConfirmed: emptyLosses(), enemyEstimated: emptyLosses() },
      supply: { ammoState: 'good', fuelState: 'good', repairState: 'good' },
      recommendations: [{ text: 'Review and reissue orders', urgency: 'high' }],
      confidence: 'high',
      rawLogIds: failedEvents.map(e => e.id),
    });
  }

  // ORDER_CONFIRMATION from order_received / order_completed
  const orderEvents = [...(byType.get('order_received') ?? []), ...(byType.get('order_completed') ?? [])];
  if (orderEvents.length > 0) {
    reports.push({
      id: `orderconf_${turn}_${Date.now()}`,
      turn, timestamp: Date.now(),
      type: 'ORDER_CONFIRMATION', fromCommanderId: commanderId,
      relatedOrderIds, relatedForceIds,
      title: 'Order Status Update',
      summary: `${orderEvents.length} order event(s)`,
      facts: orderEvents.filter(e => e.confirmedByPlayer).map(e => e.message),
      estimates: [],
      losses: { friendlyConfirmed: emptyLosses(), enemyConfirmed: emptyLosses(), enemyEstimated: emptyLosses() },
      supply: { ammoState: 'good', fuelState: 'good', repairState: 'good' },
      recommendations: [],
      confidence: 'high',
      rawLogIds: orderEvents.map(e => e.id),
    });
  }

  return reports;
}

function emptyLosses(): UnitLossSummary {
  return { tanksDestroyed: 0, ifvsDestroyed: 0, infantryKilled: 0, artilleryDestroyed: 0, otherDestroyed: 0, total: 0 };
}

function countLosses(events: BattleLogEvent[]): UnitLossSummary {
  const losses = emptyLosses();
  for (const e of events) {
    const msg = e.message.toLowerCase();
    if (msg.includes('tank')) losses.tanksDestroyed++;
    else if (msg.includes('ifv') || msg.includes('infantry fighting')) losses.ifvsDestroyed++;
    else if (msg.includes('infantry')) losses.infantryKilled++;
    else if (msg.includes('artillery')) losses.artilleryDestroyed++;
    else losses.otherDestroyed++;
    losses.total++;
  }
  return losses;
}
