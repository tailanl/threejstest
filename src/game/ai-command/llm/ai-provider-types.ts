/**
 * LLM AI Provider Types
 *
 * Defines the provider configuration abstraction layer.
 * Default: rule_based (no external API required).
 *
 * SECURITY RULE: External LLMs must NOT directly modify Unit[], GameMap, or Store state.
 * All LLM output must pass through validators before being converted to formal types (HQOrder, AIPlan).
 */

// ─── Provider Configuration ──────────────────────────────────

export type AIProviderKind =
  | 'none'
  | 'rule_based'
  | 'openai'
  | 'local_llm';

export interface AIProviderConfig {
  kind: AIProviderKind;
  model?: string;
  endpoint?: string;
  apiKeyEnvName?: string;
  temperature?: number;
  maxTokens?: number;
}

export const DEFAULT_AI_PROVIDER_CONFIG: AIProviderConfig = {
  kind: 'rule_based',
};

// ─── Command Context (what LLM can see) ──────────────────────

export interface ForceSummary {
  forceId: string;
  faction: string;
  position: { globalX: number; globalY: number };
  strength: number;
  unitCount: number;
  supplyState: 'full' | 'adequate' | 'low' | 'critical';
  orderStatus: 'idle' | 'executing' | 'awaiting_orders';
}

export interface EnemyEstimate {
  estimatedPosition: { globalX: number; globalY: number };
  estimatedStrength: 'unknown' | 'light' | 'medium' | 'heavy';
  lastSeenTurn: number;
  confidence: 'low' | 'medium' | 'high';
}

export interface LLMCommandContext {
  order: {
    intent: string;
    targetDescription: string;
    rulesOfEngagement: string;
    riskTolerance: string;
    echelon: string;
    constraints: Record<string, unknown>;
    missionType: string;
  };

  operationSummary: {
    terrainSummary: string;
    keyRoads: string[];
    keyBridges: string[];
    keyCities: string[];
    supplyState: string;
  };

  friendlySummary: ForceSummary[];
  enemySummary: EnemyEstimate[];
  recentReports: Array<{
    type: string;
    summary: string;
  }>;
  constraints: Record<string, unknown>;
  knownOnly: true;
}

// ─── LLM Plan Output (must be validated) ─────────────────────

export interface LLMPlanSuggestion {
  summary: string;

  phases: Array<{
    intent: 'recon' | 'move' | 'attack' | 'defend' | 'support' | 'withdraw';
    targetDescription: string;
    risk: 'low' | 'medium' | 'high';
  }>;

  recommendations: string[];
  requiresApproval: boolean;
}
