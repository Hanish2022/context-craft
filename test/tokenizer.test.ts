import { describe, expect, it } from 'vitest'
import { estimateTokens } from '../src/tokenizer.js'

describe('estimateTokens', () => {
  it('returns 0 for empty string', () => {
    expect(estimateTokens('')).toBe(0)
  })

  it('returns a positive count for non-empty text', () => {
    expect(estimateTokens('hello world')).toBeGreaterThan(0)
  })

  it('is deterministic for the same input', () => {
    const text = 'the quick brown fox jumps over the lazy dog'
    expect(estimateTokens(text)).toBe(estimateTokens(text))
  })

  it('counts more tokens for longer text', () => {
    const short = estimateTokens('hello')
    const long = estimateTokens('hello '.repeat(50))
    expect(long).toBeGreaterThan(short)
  })

  it('matches known cl100k_base token counts', () => {
    // Reference counts from OpenAI's cl100k_base tokenizer (the encoding js-tiktoken uses here).
    expect(estimateTokens('hello world')).toBe(2)
    expect(estimateTokens('The quick brown fox jumps over the lazy dog.')).toBe(10)
  })
})
