import { ContextItem } from './types.js'

export type DropReason = 'below_importance_threshold' | 'duplicate'

export interface CompressionConfig {
  enabled: boolean
  /** The last N items (assumed chronological, oldest first) are always kept verbatim, uncompressed. */
  recentKeepCount: number
  /** Older items at or above this importance are preserved verbatim; below are dropped. */
  importancePreserveThreshold: number
}

export interface DroppedItem {
  id: string
  reason: DropReason
}

export interface CompressionResult {
  /** The most recent items, untouched. */
  recent: ContextItem[]
  /** Original, unmodified older items that were important enough to keep. The safe fallback. */
  preserved: ContextItem[]
  /** A single compact bundle of `preserved` content, for convenience. Null if there's nothing to bundle. */
  summary: ContextItem | null
  dropped: DroppedItem[]
}

function buildSummaryItem(preserved: ContextItem[]): ContextItem | null {
  if (preserved.length === 0) return null
  try {
    const content = preserved.map((item) => `- ${item.content}`).join('\n')
    return {
      id: `summary-of-${preserved.map((p) => p.id).join('+')}`,
      content,
      sourceType: 'compressed-summary',
      importance: Math.max(...preserved.map((p) => p.importance)),
      relevanceScore: Math.max(...preserved.map((p) => p.relevanceScore ?? 0)),
    }
  } catch {
    // If summary assembly ever fails, the caller still has `preserved` verbatim —
    // nothing is lost, we just skip the compact bundle.
    return null
  }
}

export function compressHistory(
  items: ContextItem[],
  config: CompressionConfig
): CompressionResult {
  if (!config.enabled) {
    return { recent: items, preserved: [], summary: null, dropped: [] }
  }

  const splitIndex = Math.max(0, items.length - config.recentKeepCount)
  const recent = items.slice(splitIndex)
  const older = items.slice(0, splitIndex)

  const dropped: DroppedItem[] = []
  const seenContent = new Set<string>()
  const preserved: ContextItem[] = []

  for (const item of older) {
    if (seenContent.has(item.content)) {
      dropped.push({ id: item.id, reason: 'duplicate' })
      continue
    }
    seenContent.add(item.content)

    if (item.importance >= config.importancePreserveThreshold) {
      preserved.push(item)
    } else {
      dropped.push({ id: item.id, reason: 'below_importance_threshold' })
    }
  }

  return { recent, preserved, summary: buildSummaryItem(preserved), dropped }
}
