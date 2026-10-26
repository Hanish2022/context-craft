import { estimateTokens } from '../src/tokenizer.js'
import { ContextItem } from '../src/types.js'

export interface NaiveResult {
  selectedIds: string[]
  tokensUsed: number
}

/** Concatenates items in the given order, stopping once the budget is hit. */
export function naiveTruncate(items: ContextItem[], availableTokens: number): NaiveResult {
  const selectedIds: string[] = []
  let used = 0

  for (const item of items) {
    const tokens = item.tokenEstimate ?? estimateTokens(item.content)
    if (used + tokens > availableTokens) break
    selectedIds.push(item.id)
    used += tokens
  }

  return { selectedIds, tokensUsed: used }
}
