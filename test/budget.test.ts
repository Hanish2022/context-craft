import { describe, expect, it } from 'vitest'
import { assembleContext } from '../src/budget.js'
import { ContextItem } from '../src/types.js'

function item(overrides: Partial<ContextItem> = {}): ContextItem {
  return {
    id: 'item',
    content: 'content',
    sourceType: 'test',
    importance: 0.5,
    ...overrides,
  }
}

describe('assembleContext', () => {
  it('returns empty selection for empty input', () => {
    const result = assembleContext([], { inputBudget: 1000, reservedTokens: 100 })
    expect(result.selected).toEqual([])
    expect(result.excluded).toEqual([])
    expect(result.estimatedTokens).toBe(0)
  })

  it('excludes a single item that is larger than the entire budget', () => {
    const huge = item({ id: 'huge', content: 'word '.repeat(5000), tokenEstimate: 5000 })
    const result = assembleContext([huge], { inputBudget: 1000, reservedTokens: 100 })
    expect(result.selected).toEqual([])
    expect(result.excluded).toEqual([{ id: 'huge', reason: 'over_budget' }])
  })

  it('excludes exact-content duplicates, keeping only the first', () => {
    const a = item({ id: 'a', content: 'same text', tokenEstimate: 5 })
    const b = item({ id: 'b', content: 'same text', tokenEstimate: 5 })
    const result = assembleContext([a, b], { inputBudget: 1000, reservedTokens: 0 })
    expect(result.selected.map((i) => i.id)).toEqual(['a'])
    expect(result.excluded).toEqual([{ id: 'b', reason: 'duplicate' }])
  })

  it('selects nothing when the budget is fully consumed by reserved tokens', () => {
    const a = item({ id: 'a', tokenEstimate: 10 })
    const result = assembleContext([a], { inputBudget: 100, reservedTokens: 100 })
    expect(result.selected).toEqual([])
    expect(result.availableTokens).toBe(0)
    expect(result.excluded).toEqual([{ id: 'a', reason: 'over_budget' }])
  })

  it('does not exceed the available token budget', () => {
    const items = Array.from({ length: 20 }, (_, i) =>
      item({ id: `i${i}`, content: `content ${i}`, tokenEstimate: 50, relevanceScore: Math.random() })
    )
    const result = assembleContext(items, { inputBudget: 300, reservedTokens: 0 })
    expect(result.estimatedTokens).toBeLessThanOrEqual(300)
  })

  it('retains a high-importance item over a newer, less relevant one when both cannot fit', () => {
    const critical = item({
      id: 'critical',
      content: 'the critical decision',
      importance: 0.95,
      relevanceScore: 0.3,
      timestamp: 0, // old
      tokenEstimate: 60,
    })
    const newButLowValue = item({
      id: 'newer',
      content: 'a recent but unimportant aside',
      importance: 0.1,
      relevanceScore: 0.3,
      timestamp: Date.now(), // brand new
      tokenEstimate: 60,
    })

    // Budget only fits one of the two.
    const result = assembleContext([newButLowValue, critical], {
      inputBudget: 60,
      reservedTokens: 0,
      now: Date.now(),
    })

    expect(result.selected.map((i) => i.id)).toEqual(['critical'])
  })
})
