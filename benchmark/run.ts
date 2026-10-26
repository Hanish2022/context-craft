import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { assembleContext } from '../src/budget.js'
import { estimateTokens } from '../src/tokenizer.js'
import { ContextItem } from '../src/types.js'
import { naiveTruncate } from './baseline.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const SHUFFLE_TRIALS = 50

interface DatasetRow {
  id: string
  query: string
  inputBudget: number
  reservedTokens: number
  requiredFactIds: string[]
  contextPool: ContextItem[]
}

interface RowResult {
  id: string
  strategy: 'naive' | 'engine'
  feasible: boolean
  tokensUsed: number
  availableTokens: number
  requiredFactsTotal: number
  requiredFactsRetained: number
  retentionRate: number
  /** Across SHUFFLE_TRIALS random orderings of the same context pool. */
  retentionRateAcrossShuffles: { min: number; max: number }
}

function retention(selectedIds: string[], requiredFactIds: string[]) {
  const retained = requiredFactIds.filter((id) => selectedIds.includes(id)).length
  return { retained, rate: requiredFactIds.length === 0 ? 1 : retained / requiredFactIds.length }
}

function shuffled<T>(arr: T[]): T[] {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

/** Required facts can't all possibly fit, regardless of strategy or ordering. */
function isFeasible(row: DatasetRow, availableTokens: number): boolean {
  const requiredTokens = row.contextPool
    .filter((item) => row.requiredFactIds.includes(item.id))
    .reduce((sum, item) => sum + estimateTokens(item.content), 0)
  return requiredTokens <= availableTokens
}

function shuffleRange(
  row: DatasetRow,
  availableTokens: number,
  strategy: (pool: ContextItem[]) => string[]
): { min: number; max: number } {
  let min = Infinity
  let max = -Infinity
  for (let i = 0; i < SHUFFLE_TRIALS; i++) {
    const selectedIds = strategy(shuffled(row.contextPool))
    const rate = retention(selectedIds, row.requiredFactIds).rate
    min = Math.min(min, rate)
    max = Math.max(max, rate)
  }
  return { min, max }
}

function run(): RowResult[] {
  const dataset: DatasetRow[] = JSON.parse(
    readFileSync(join(__dirname, 'dataset.json'), 'utf-8')
  )

  const results: RowResult[] = []

  for (const row of dataset) {
    const availableTokens = row.inputBudget - row.reservedTokens
    const feasible = isFeasible(row, availableTokens)

    const naive = naiveTruncate(row.contextPool, availableTokens)
    const naiveRetention = retention(naive.selectedIds, row.requiredFactIds)
    const naiveShuffleRange = shuffleRange(row, availableTokens, (pool) =>
      naiveTruncate(pool, availableTokens).selectedIds
    )
    results.push({
      id: row.id,
      strategy: 'naive',
      feasible,
      tokensUsed: naive.tokensUsed,
      availableTokens,
      requiredFactsTotal: row.requiredFactIds.length,
      requiredFactsRetained: naiveRetention.retained,
      retentionRate: naiveRetention.rate,
      retentionRateAcrossShuffles: naiveShuffleRange,
    })

    const engine = assembleContext(row.contextPool, {
      inputBudget: row.inputBudget,
      reservedTokens: row.reservedTokens,
    })
    const engineSelectedIds = engine.selected.map((item) => item.id)
    const engineRetention = retention(engineSelectedIds, row.requiredFactIds)
    const engineShuffleRange = shuffleRange(row, availableTokens, (pool) =>
      assembleContext(pool, {
        inputBudget: row.inputBudget,
        reservedTokens: row.reservedTokens,
      }).selected.map((item) => item.id)
    )
    results.push({
      id: row.id,
      strategy: 'engine',
      feasible,
      tokensUsed: engine.estimatedTokens,
      availableTokens,
      requiredFactsTotal: row.requiredFactIds.length,
      requiredFactsRetained: engineRetention.retained,
      retentionRate: engineRetention.rate,
      retentionRateAcrossShuffles: engineShuffleRange,
    })
  }

  return results
}

const results = run()
const resultsDir = join(__dirname, 'results')
mkdirSync(resultsDir, { recursive: true })
const outPath = join(resultsDir, `${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
writeFileSync(outPath, JSON.stringify(results, null, 2))
console.log(`Wrote ${results.length} result rows to ${outPath}`)
