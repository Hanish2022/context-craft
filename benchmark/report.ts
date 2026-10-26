import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

interface RowResult {
  id: string
  strategy: 'naive' | 'engine'
  feasible: boolean
  tokensUsed: number
  availableTokens: number
  requiredFactsTotal: number
  requiredFactsRetained: number
  retentionRate: number
  retentionRateAcrossShuffles: { min: number; max: number }
}

const resultsDir = join(__dirname, 'results')
const files = readdirSync(resultsDir)
  .filter((f) => f.endsWith('.json') && !f.startsWith('llm-eval-'))
  .sort()
if (files.length === 0) {
  console.error('No results found. Run `npm run bench` first.')
  process.exit(1)
}

const latest = files[files.length - 1]
const results: RowResult[] = JSON.parse(readFileSync(join(resultsDir, latest), 'utf-8'))

function aggregate(rows: RowResult[]) {
  const avgTokens = rows.reduce((s, r) => s + r.tokensUsed, 0) / rows.length
  const totalRequired = rows.reduce((s, r) => s + r.requiredFactsTotal, 0)
  const totalRetained = rows.reduce((s, r) => s + r.requiredFactsRetained, 0)
  const perfectRows = rows.filter((r) => r.retentionRate === 1).length
  const shuffleMin = Math.min(...rows.map((r) => r.retentionRateAcrossShuffles.min))
  const shuffleMax = Math.max(...rows.map((r) => r.retentionRateAcrossShuffles.max))
  return {
    avgTokens: Math.round(avgTokens * 10) / 10,
    retentionRate: totalRequired === 0 ? 1 : totalRetained / totalRequired,
    perfectRows,
    totalRows: rows.length,
    shuffleMin,
    shuffleMax,
  }
}

function printTable(rows: RowResult[]) {
  console.log('strategy | avg tokens used | fact retention % | rows w/ all facts | retention range across 50 shuffles')
  console.log('---------|------------------|-------------------|--------------------|--------------------------------------')
  for (const strategy of ['naive', 'engine'] as const) {
    const a = aggregate(rows.filter((r) => r.strategy === strategy))
    const range = `${(a.shuffleMin * 100).toFixed(0)}% - ${(a.shuffleMax * 100).toFixed(0)}%`
    console.log(
      `${strategy.padEnd(8)} | ${String(a.avgTokens).padEnd(16)} | ${(a.retentionRate * 100).toFixed(1).padEnd(17)} | ${`${a.perfectRows}/${a.totalRows}`.padEnd(18)} | ${range}`
    )
  }
}

const feasibleIds = new Set(results.filter((r) => r.feasible).map((r) => r.id))
const feasibleRows = results.filter((r) => feasibleIds.has(r.id))
const infeasibleRows = results.filter((r) => !feasibleIds.has(r.id))

console.log(`Benchmark report (${latest})\n`)

console.log(`== Feasible scenarios (${feasibleIds.size} rows — all required facts could theoretically fit) ==\n`)
printTable(feasibleRows)

if (infeasibleRows.length > 0) {
  const infeasibleIds = new Set(infeasibleRows.map((r) => r.id))
  console.log(
    `\n== Infeasible scenarios (${infeasibleIds.size} rows — required facts exceed the budget even in the best case; reported separately, not counted above) ==\n`
  )
  printTable(infeasibleRows)
}

console.log(
  '\nShuffle range shows retention across 50 random orderings of each scenario\'s context pool. ' +
    'Naive truncation is order-dependent (its range should be wide); the engine\'s selection is score-based, ' +
    'not position-based, so its range should stay tight regardless of input order.'
)
