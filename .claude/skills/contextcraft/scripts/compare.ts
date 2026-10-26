// Usage: tsx compare.ts <dataset.json> [output.json]
//
// dataset.json shape: an array of rows, each:
//   { id, query, inputBudget, reservedTokens, requiredFactIds: string[], contextPool: ContextItem[] }
//
// For each row this runs naive truncation (concatenate contextPool in the given
// order, stop at the budget) against the engine's assembleContext, under 50 random
// shuffles of contextPool each, and reports how often each strategy's selection
// contains every item listed in requiredFactIds. This never calls an LLM -- it is
// a mechanical check of what gets selected, not of what a model would answer.
import { readFileSync, writeFileSync } from 'node:fs'
import { assembleContext } from '../../../../src/budget.js'
import { estimateTokens } from '../../../../src/tokenizer.js'
import { naiveTruncate } from '../../../../benchmark/baseline.js'

const SHUFFLE_TRIALS = 50

const datasetPath = process.argv[2]
const outputPath = process.argv[3]
if (!datasetPath) {
  console.error('Usage: tsx compare.ts <dataset.json> [output.json]')
  process.exit(1)
}

function retention(selectedIds, requiredFactIds) {
  const retained = requiredFactIds.filter((id) => selectedIds.includes(id)).length
  return requiredFactIds.length === 0 ? 1 : retained / requiredFactIds.length
}

function shuffled(arr) {
  const copy = [...arr]
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[copy[i], copy[j]] = [copy[j], copy[i]]
  }
  return copy
}

function isFeasible(row, availableTokens) {
  const requiredTokens = row.contextPool
    .filter((item) => row.requiredFactIds.includes(item.id))
    .reduce((sum, item) => sum + estimateTokens(item.content), 0)
  return requiredTokens <= availableTokens
}

const dataset = JSON.parse(readFileSync(datasetPath, 'utf-8'))
const results = []

for (const row of dataset) {
  const availableTokens = row.inputBudget - row.reservedTokens
  const feasible = isFeasible(row, availableTokens)

  for (const strategy of ['naive', 'engine']) {
    const selectFn = (pool) =>
      strategy === 'naive'
        ? naiveTruncate(pool, availableTokens).selectedIds
        : assembleContext(pool, { inputBudget: row.inputBudget, reservedTokens: row.reservedTokens }).selected.map(
            (i) => i.id
          )

    const baseRate = retention(selectFn(row.contextPool), row.requiredFactIds)

    let min = Infinity
    let max = -Infinity
    for (let i = 0; i < SHUFFLE_TRIALS; i++) {
      const rate = retention(selectFn(shuffled(row.contextPool)), row.requiredFactIds)
      min = Math.min(min, rate)
      max = Math.max(max, rate)
    }

    results.push({ id: row.id, strategy, feasible, retentionRate: baseRate, shuffleMin: min, shuffleMax: max })
  }
}

function aggregate(rows) {
  const avgRetention = rows.reduce((s, r) => s + r.retentionRate, 0) / rows.length
  const min = Math.min(...rows.map((r) => r.shuffleMin))
  const max = Math.max(...rows.map((r) => r.shuffleMax))
  const perfect = rows.filter((r) => r.retentionRate === 1).length
  return { avgRetention, min, max, perfect, total: rows.length }
}

function printTable(rows) {
  console.log('strategy | fact retention % | rows w/ all facts | retention range across 50 shuffles')
  console.log('---------|-------------------|--------------------|--------------------------------------')
  for (const strategy of ['naive', 'engine']) {
    const a = aggregate(rows.filter((r) => r.strategy === strategy))
    const range = `${(a.min * 100).toFixed(0)}% - ${(a.max * 100).toFixed(0)}%`
    console.log(
      `${strategy.padEnd(8)} | ${(a.avgRetention * 100).toFixed(1).padEnd(17)} | ${`${a.perfect}/${a.total}`.padEnd(18)} | ${range}`
    )
  }
}

const feasibleIds = new Set(results.filter((r) => r.feasible).map((r) => r.id))
const feasibleRows = results.filter((r) => feasibleIds.has(r.id))
const infeasibleRows = results.filter((r) => !feasibleIds.has(r.id))

console.log(`\n== Feasible scenarios (${feasibleIds.size} rows -- all required facts could theoretically fit) ==\n`)
printTable(feasibleRows)

if (infeasibleRows.length > 0) {
  const infeasibleIds = new Set(infeasibleRows.map((r) => r.id))
  console.log(
    `\n== Infeasible scenarios (${infeasibleIds.size} rows -- required facts exceed the budget even in the best case) ==\n`
  )
  printTable(infeasibleRows)
}

console.log(
  "\nShuffle range: retention across 50 random orderings of each row's contextPool. " +
    "A wide naive range and a tight engine range means the engine's advantage isn't an artifact of item order."
)

if (outputPath) {
  writeFileSync(outputPath, JSON.stringify(results, null, 2))
  console.log(`\nWrote raw results to ${outputPath}`)
}
