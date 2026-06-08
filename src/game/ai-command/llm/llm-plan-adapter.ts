/**
 * LLM Plan Adapter - Generates AIPlan suggestions from external LLM
 *
 * This is a RESERVE INTERFACE. Default operation is rule_based (no external API).
 * Only activates when AIProviderConfig.kind !== 'rule_based' && kind !== 'none'.
 *
 * SECURITY RULE: LLM output must pass through validateLLMPlanSuggestion.
 * The full 1024x1024 RegionTile must NOT be sent to the LLM — only summaries.
 * LLM must NOT directly modify Unit[], GameMap, or Store.
 */

import type { AIProviderConfig, LLMCommandContext, LLMPlanSuggestion } from './ai-provider-types';

export interface LLMPlanRequest {
  context: LLMCommandContext;
  config: AIProviderConfig;
}

/**
 * Get a plan suggestion from external LLM.
 * Returns null if provider is rule_based or none (fallback to rule generator).
 */
export async function llmGeneratePlan(
  _request: LLMPlanRequest,
): Promise<LLMPlanSuggestion | null> {
  const { config } = _request;

  if (config.kind === 'rule_based' || config.kind === 'none') {
    return null;
  }

  throw new Error(
    `LLM plan adapter not yet implemented for provider: ${config.kind}`,
  );
}
