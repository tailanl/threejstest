/**
 * 命令解析 - 从自然语言文本解析为 HQOrder
 * 第一版：规则匹配，不接 LLM
 */

import type { HQOrder } from './command-types';
import type { WorldPosition } from '../world-atlas/atlas-types';

const INTENT_KEYWORDS: Record<string, string[]> = {
  recon: ['侦察', '侦查', 'recon', 'scout', '探测', '探查'],
  defend: ['防守', '防御', '固守', 'defend', 'hold', '守卫', '坚守'],
  attack: ['进攻', '攻击', 'attack', 'assault', '突击', '冲锋'],
  capture: ['夺取', '占领', 'capture', '占领', '攻占', '拿下'],
  withdraw: ['撤退', '后撤', 'withdraw', 'retreat', '退却'],
  support: ['支援', '炮兵支援', 'support', '火力支援', '掩护'],
  delay: ['迟滞', '拖延', 'delay', '阻击'],
  screen: ['掩护', '警戒', 'screen', '前哨'],
  hold: ['坚守', '死守', 'hold', '固守', '守住', '死守防线', '顶住'],
  interdict: ['封锁', '切断', 'interdict', '阻断', '拦截', '伏击'],
};

const ROE_KEYWORDS: Record<string, string[]> = {
  hold_fire: ['停火', '不要开火', 'hold fire'],
  avoid_contact: ['避免接触', 'avoid contact', '不交战'],
  engage_if_advantage: ['有优势时交战', 'conditional'],
  engage_freely: ['自由交战', '自由开火', 'engage freely'],
  breakthrough: ['突破', 'breakthrough', '不顾一切'],
};

const RISK_KEYWORDS: Record<string, string[]> = {
  low: ['保守', '谨慎', 'low risk', '小心'],
  high: ['冒险', '激进', 'high risk', '不惜代价'],
};

export interface ParsedCommand {
  intent: HQOrder['intent'];
  rulesOfEngagement: HQOrder['rulesOfEngagement'];
  riskTolerance: HQOrder['riskTolerance'];
  autonomy: HQOrder['autonomy'];
  targetPosition?: WorldPosition;
  targetRadius?: number;
  confidence: number;
}

export function parseCommandText(text: string): ParsedCommand {
  const lower = text.toLowerCase();

  // Parse intent
  let intent: HQOrder['intent'] = 'attack';
  let maxConfidence = 0;
  for (const [key, keywords] of Object.entries(INTENT_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        intent = key as HQOrder['intent'];
        maxConfidence = Math.max(maxConfidence, 0.8);
        break;
      }
    }
  }

  // Parse ROE
  let roe: HQOrder['rulesOfEngagement'] = 'engage_freely';
  for (const [key, keywords] of Object.entries(ROE_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        roe = key as HQOrder['rulesOfEngagement'];
        break;
      }
    }
  }

  // Parse risk
  let risk: HQOrder['riskTolerance'] = 'medium';
  for (const [key, keywords] of Object.entries(RISK_KEYWORDS)) {
    for (const kw of keywords) {
      if (lower.includes(kw)) {
        risk = key as HQOrder['riskTolerance'];
        break;
      }
    }
  }

  return {
    intent,
    rulesOfEngagement: roe,
    riskTolerance: risk,
    autonomy: 'normal',
    confidence: maxConfidence > 0 ? maxConfidence : 0.3,
  };
}

export function createHQOrderFromParsed(
  parsed: ParsedCommand,
  forceIds: string[],
  turn: number,
  text: string
): HQOrder {
  return {
    id: `order_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
    issuedTurn: turn,
    issuer: 'player',
    assignedForceIds: forceIds,
    intent: parsed.intent,
    target: {
      type: 'area',
      worldPosition: parsed.targetPosition,
      radius: parsed.targetRadius ?? 10,
    },
    constraints: {},
    rulesOfEngagement: parsed.rulesOfEngagement,
    riskTolerance: parsed.riskTolerance,
    autonomy: parsed.autonomy,
    text,
  };
}
