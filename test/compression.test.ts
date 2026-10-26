import { describe, expect, it } from 'vitest'
import { compressHistory } from '../src/compression.js'
import { ContextItem } from '../src/types.js'

function item(overrides: Partial<ContextItem> = {}): ContextItem {
  return {
    id: 'item',
    content: 'content',
    sourceType: 'chat',
    importance: 0.5,
    ...overrides,
  }
}

describe('compressHistory', () => {
  it('passes through untouched when disabled', () => {
    const items = [item({ id: 'a' }), item({ id: 'b' })]
    const result = compressHistory(items, {
      enabled: false,
      recentKeepCount: 1,
      importancePreserveThreshold: 0.8,
    })
    expect(result.recent).toEqual(items)
    expect(result.preserved).toEqual([])
    expect(result.summary).toBeNull()
    expect(result.dropped).toEqual([])
  })

  it('always keeps the last N items verbatim regardless of importance', () => {
    const items = [
      item({ id: 'old-unimportant', importance: 0.1 }),
      item({ id: 'recent-unimportant', importance: 0.1, content: 'recent' }),
    ]
    const result = compressHistory(items, {
      enabled: true,
      recentKeepCount: 1,
      importancePreserveThreshold: 0.8,
    })
    expect(result.recent.map((i) => i.id)).toEqual(['recent-unimportant'])
  })

  it('preserves predefined critical facts verbatim, not paraphrased', () => {
    const criticalDecision = item({
      id: 'decision',
      content: 'We will use PostgreSQL for the new service.',
      importance: 0.95,
    })
    const noise = item({ id: 'noise', content: 'unrelated chatter', importance: 0.1 })

    const result = compressHistory([criticalDecision, noise], {
      enabled: true,
      recentKeepCount: 0,
      importancePreserveThreshold: 0.8,
    })

    // The exact original object survives untouched — not a reworded/summarized version.
    expect(result.preserved).toContainEqual(criticalDecision)
    expect(result.summary?.content).toContain('We will use PostgreSQL for the new service.')
  })

  it('drops low-importance older items with an explicit, inspectable reason', () => {
    const noise = item({ id: 'noise', importance: 0.1 })
    const result = compressHistory([noise], {
      enabled: true,
      recentKeepCount: 0,
      importancePreserveThreshold: 0.8,
    })
    expect(result.preserved).toEqual([])
    expect(result.dropped).toEqual([{ id: 'noise', reason: 'below_importance_threshold' }])
  })

  it('consolidates repeated facts instead of preserving duplicates twice', () => {
    const a = item({ id: 'a', content: 'same critical fact', importance: 0.9 })
    const b = item({ id: 'b', content: 'same critical fact', importance: 0.9 })
    const result = compressHistory([a, b], {
      enabled: true,
      recentKeepCount: 0,
      importancePreserveThreshold: 0.8,
    })
    expect(result.preserved.map((i) => i.id)).toEqual(['a'])
    expect(result.dropped).toEqual([{ id: 'b', reason: 'duplicate' }])
  })

  it('does not crash and reports nothing dropped when there is no older history to compress', () => {
    const items = [item({ id: 'only-recent' })]
    const result = compressHistory(items, {
      enabled: true,
      recentKeepCount: 10, // larger than the input
      importancePreserveThreshold: 0.8,
    })
    expect(result.recent).toEqual(items)
    expect(result.preserved).toEqual([])
    expect(result.summary).toBeNull()
    expect(result.dropped).toEqual([])
  })

  it('never loses a critical fact silently: preserved always wins over a missing summary', () => {
    // Even in a degenerate case (every older item below threshold), the accounting
    // is explicit: nothing claims to be "compressed" that wasn't actually recorded
    // as either recent, preserved, or dropped-with-reason.
    const items = [
      item({ id: 'a', importance: 0.2 }),
      item({ id: 'b', importance: 0.3 }),
    ]
    const result = compressHistory(items, {
      enabled: true,
      recentKeepCount: 0,
      importancePreserveThreshold: 0.8,
    })
    const accountedFor = [
      ...result.recent.map((i) => i.id),
      ...result.preserved.map((i) => i.id),
      ...result.dropped.map((d) => d.id),
    ]
    expect(accountedFor.sort()).toEqual(['a', 'b'])
  })
})
