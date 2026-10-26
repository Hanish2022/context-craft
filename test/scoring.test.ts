import { describe, expect, it } from 'vitest'
import { scoreItem } from '../src/scoring.js'
import { ContextItem, DEFAULT_WEIGHTS } from '../src/types.js'

function item(overrides: Partial<ContextItem> = {}): ContextItem {
  return {
    id: 'a',
    content: 'some content',
    sourceType: 'test',
    importance: 0.5,
    ...overrides,
  }
}

describe('scoreItem', () => {
  it('is deterministic given the same inputs and config', () => {
    const now = 1_700_000_000_000
    const a = scoreItem(item(), DEFAULT_WEIGHTS, 1000, now)
    const b = scoreItem(item(), DEFAULT_WEIGHTS, 1000, now)
    expect(a).toBe(b)
  })

  it('ranks higher importance above lower importance, all else equal', () => {
    const now = Date.now()
    const low = scoreItem(item({ importance: 0.1 }), DEFAULT_WEIGHTS, 1000, now)
    const high = scoreItem(item({ importance: 0.9 }), DEFAULT_WEIGHTS, 1000, now)
    expect(high).toBeGreaterThan(low)
  })

  it('ranks higher relevance above lower relevance, all else equal', () => {
    const now = Date.now()
    const low = scoreItem(item({ relevanceScore: 0.1 }), DEFAULT_WEIGHTS, 1000, now)
    const high = scoreItem(item({ relevanceScore: 0.9 }), DEFAULT_WEIGHTS, 1000, now)
    expect(high).toBeGreaterThan(low)
  })

  it('penalizes higher token cost, all else equal', () => {
    const now = Date.now()
    const cheap = scoreItem(item({ tokenEstimate: 10 }), DEFAULT_WEIGHTS, 1000, now)
    const expensive = scoreItem(item({ tokenEstimate: 900 }), DEFAULT_WEIGHTS, 1000, now)
    expect(cheap).toBeGreaterThan(expensive)
  })

  it('respects custom weights', () => {
    const now = Date.now()
    const weights = { relevance: 0, importance: 1, recency: 0, tokenCost: 0 }
    const a = scoreItem(item({ importance: 0.2, relevanceScore: 0.9 }), weights, 1000, now)
    const b = scoreItem(item({ importance: 0.8, relevanceScore: 0.1 }), weights, 1000, now)
    expect(b).toBeGreaterThan(a)
  })
})
