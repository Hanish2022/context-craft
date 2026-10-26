import { estimateTokens } from './tokenizer.js'
import { scoreItem } from './scoring.js'
import {
  BudgetConfig,
  ContextAssemblyResult,
  ContextItem,
  DEFAULT_WEIGHTS,
  ExcludedItem,
} from './types.js'

const DEFAULT_IMPORTANCE_PIN_THRESHOLD = 0.8

export function assembleContext(
  items: ContextItem[],
  config: BudgetConfig
): ContextAssemblyResult {
  const now = config.now ?? Date.now()
  const weights = config.weights ?? DEFAULT_WEIGHTS
  const pinThreshold = config.importancePinThreshold ?? DEFAULT_IMPORTANCE_PIN_THRESHOLD
  const availableTokens = Math.max(0, config.inputBudget - config.reservedTokens)

  const excluded: ExcludedItem[] = []

  // Fill in missing token estimates.
  const withTokens = items.map((item) => ({
    ...item,
    tokenEstimate: item.tokenEstimate ?? estimateTokens(item.content),
  }))

  // Drop exact-content duplicates, keeping the first occurrence.
  const seenContent = new Set<string>()
  const deduped: ContextItem[] = []
  for (const item of withTokens) {
    if (seenContent.has(item.content)) {
      excluded.push({ id: item.id, reason: 'duplicate' })
      continue
    }
    seenContent.add(item.content)
    deduped.push(item)
  }

  const scored = deduped.map((item) => ({
    item,
    score: scoreItem(item, weights, availableTokens, now),
  }))

  const pinned = scored
    .filter((s) => s.item.importance >= pinThreshold)
    .sort((a, b) => b.score - a.score)
  const rest = scored
    .filter((s) => s.item.importance < pinThreshold)
    .sort((a, b) => b.score - a.score)

  const selected: ContextItem[] = []
  let used = 0

  for (const { item } of [...pinned, ...rest]) {
    const tokens = item.tokenEstimate ?? 0
    if (used + tokens > availableTokens) {
      excluded.push({ id: item.id, reason: 'over_budget' })
      continue
    }
    selected.push(item)
    used += tokens
  }

  return {
    selected,
    excluded,
    estimatedTokens: used,
    availableTokens,
  }
}
