/**
 * LLM Command Adapter - Converts natural language to HQOrder via external LLM
 *
 * This is a RESERVE INTERFACE. Default operation is rule_based (no external API).
 * Only activates when AIProviderConfig.kind !== 'rule_based' && kind !== 'none'.
 *
 * SECURITY RULE: LLM output must pass through validateLLMCommand before use.
 * LLM must NOT directly modify Unit[], GameMap, or Store.
 */

import type { AIProviderConfig } from './ai-provider-types';

export interface LLMCommandResult {
  intent: string;
  targetDescription: string;
  rulesOfEngagement: string;
  riskTolerance: string;
  echelon: string;
  explanation: string;
  rawResponse: string;
}

export interface LLMCommandRequest {
  userInput: string;
  context?: string;
  config: AIProviderConfig;
}

/**
 * Convert natural language to structured command via LLM.
 * Returns null if provider is rule_based or none (fallback to rule parser).
 */
export async function llmParseCommand(
  _request: LLMCommandRequest,
): Promise<LLMCommandResult | null> {
  const { config } = _request;

  // Default: no external LLM — let rule_based parser handle it
  if (config.kind === 'rule_based' || config.kind === 'none') {
    return null;
  }

  // Reserved for future openai / local_llm implementations
  throw new Error(
    `LLM adapter not yet implemented for provider: ${config.kind}`,
  );
}
