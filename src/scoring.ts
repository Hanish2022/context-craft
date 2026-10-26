import { ContextItem, ScoringWeights } from './types.js'

const RECENCY_HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000 // 7 days

/** 1.0 for "now", decaying toward 0 as age grows. 0.5 (neutral) when no timestamp. */
function recencyScore(timestamp: number | undefined, now: number): number {
  if (timestamp === undefined) return 0.5
  const age = Math.max(0, now - timestamp)
  return Math.pow(0.5, age / RECENCY_HALF_LIFE_MS)
}

/** item.tokenEstimate as a fraction of the budget, clamped to [0, 1]. */
function tokenCostScore(tokenEstimate: number, inputBudget: number): number {
  if (inputBudget <= 0) return 1
  return Math.min(1, tokenEstimate / inputBudget)
}

export function scoreItem(
  item: ContextItem,
  weights: ScoringWeights,
  inputBudget: number,
  now: number
): number {
  const relevance = item.relevanceScore ?? 0.5
  const recency = recencyScore(item.timestamp, now)
  const tokenCost = tokenCostScore(item.tokenEstimate ?? 0, inputBudget)

  return (
    weights.relevance * relevance +
    weights.importance * item.importance +
    weights.recency * recency -
    weights.tokenCost * tokenCost
  )
}
