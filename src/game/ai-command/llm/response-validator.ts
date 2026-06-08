/**
 * LLM Response Validator
 *
 * All external LLM output must be validated before use.
 * This prevents:
 * - Direct modification of game state by LLM
 * - Malformed or hallucinated data
 * - Invalid intent / task values
 */

import type { LLMPlanSuggestion } from './ai-provider-types';
import type { LLMCommandResult } from './llm-command-adapter';

const VALID_INTENTS = [
  'attack', 'defend', 'recon', 'withdraw', 'support', 'capture', 'hold',
] as const;

const VALID_RISK_LEVELS = ['low', 'medium', 'high'] as const;

const VALID_PHASE_INTENTS = [
  'recon', 'move', 'attack', 'defend', 'support', 'withdraw',
] as const;

/**
 * Validate LLM-generated plan suggestion.
 * Returns validated suggestion or throws on invalid data.
 */
export function validateLLMPlanSuggestion(
  suggestion: unknown,
): LLMPlanSuggestion {
  if (!suggestion || typeof suggestion !== 'object') {
    throw new Error('validateLLMPlanSuggestion: expected object');
  }

  const s = suggestion as Record<string, unknown>;

  if (typeof s.summary !== 'string') {
    throw new Error('validateLLMPlanSuggestion: missing summary');
  }

  if (!Array.isArray(s.phases)) {
    throw new Error('validateLLMPlanSuggestion: missing phases array');
  }

  for (let i = 0; i < s.phases.length; i++) {
    const phase = s.phases[i] as Record<string, unknown>;
    if (!VALID_PHASE_INTENTS.includes(phase.intent as typeof VALID_PHASE_INTENTS[number])) {
      throw new Error(
        `validateLLMPlanSuggestion: invalid phase intent "${phase.intent}" at index ${i}`,
      );
    }
    if (!VALID_RISK_LEVELS.includes(phase.risk as typeof VALID_RISK_LEVELS[number])) {
      throw new Error(
        `validateLLMPlanSuggestion: invalid phase risk "${phase.risk}" at index ${i}`,
      );
    }
  }

  if (!Array.isArray(s.recommendations)) {
    throw new Error('validateLLMPlanSuggestion: missing recommendations array');
  }

  return {
    summary: s.summary as string,
    phases: s.phases as LLMPlanSuggestion['phases'],
    recommendations: s.recommendations as string[],
    requiresApproval: Boolean(s.requiresApproval),
  };
}

/**
 * Validate LLM-generated command result.
 * Returns validated result or throws on invalid data.
 */
export function validateLLMCommand(
  result: unknown,
): LLMCommandResult {
  if (!result || typeof result !== 'object') {
    throw new Error('validateLLMCommand: expected object');
  }

  const r = result as Record<string, unknown>;

  if (typeof r.intent !== 'string' || !VALID_INTENTS.includes(r.intent as typeof VALID_INTENTS[number])) {
    throw new Error(`validateLLMCommand: invalid intent "${r.intent}"`);
  }

  if (typeof r.targetDescription !== 'string' || r.targetDescription.length === 0) {
    throw new Error('validateLLMCommand: missing targetDescription');
  }

  if (typeof r.explanation !== 'string') {
    throw new Error('validateLLMCommand: missing explanation');
  }

  return {
    intent: r.intent as string,
    targetDescription: r.targetDescription as string,
    rulesOfEngagement: (r.rulesOfEngagement as string) ?? 'free',
    riskTolerance: (r.riskTolerance as string) ?? 'medium',
    echelon: (r.echelon as string) ?? 'company',
    explanation: r.explanation as string,
    rawResponse: (r.rawResponse as string) ?? '',
  };
}
