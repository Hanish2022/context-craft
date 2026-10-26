export interface ContextItem {
  id: string
  content: string
  sourceType: string
  importance: number // 0-1, explicit
  relevanceScore?: number // 0-1, caller-supplied
  timestamp?: number // epoch ms
  tokenEstimate?: number // computed if absent
}

export interface ScoringWeights {
  relevance: number
  importance: number
  recency: number
  tokenCost: number
}

export const DEFAULT_WEIGHTS: ScoringWeights = {
  relevance: 0.4,
  importance: 0.4,
  recency: 0.1,
  tokenCost: 0.1,
}

export interface BudgetConfig {
  /** Total tokens available for the final prompt. */
  inputBudget: number
  /** Tokens reserved for instructions, the query, and the model response. */
  reservedTokens: number
  /** Items at or above this importance are pinned before the greedy pass. */
  importancePinThreshold?: number
  weights?: ScoringWeights
  /** Reference time for recency scoring; defaults to Date.now(). */
  now?: number
}

export type ExclusionReason = 'duplicate' | 'over_budget'

export interface ExcludedItem {
  id: string
  reason: ExclusionReason
}

export interface ContextAssemblyResult {
  selected: ContextItem[]
  excluded: ExcludedItem[]
  estimatedTokens: number
  availableTokens: number
}
