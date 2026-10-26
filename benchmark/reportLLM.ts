import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'

const __dirname = dirname(fileURLToPath(import.meta.url))

interface LLMEvalResult {
  id: string
  strategy: 'naive' | 'engine'
  feasible: boolean
  contextTokens: number
  promptTokensActual: number | null
  outputTokensActual: number | null
  totalTokensActual: number | null
  latencyMs: number
  correctnessRate: number
  error?: string
}

const resultsDir = join(__dirname, 'results')
const files = readdirSync(resultsDir).filter((f) => f.startsWith('llm-eval-')).sort()
if (files.length === 0) {
  console.error('No LLM eval results found. Run `npm run bench:llm` first.')
  process.exit(1)
}

const latest = files[files.length - 1]
const results: LLMEvalResult[] = JSON.parse(readFileSync(join(resultsDir, latest), 'utf-8'))

function avg(nums: number[]) {
  return nums.length === 0 ? 0 : nums.reduce((s, n) => s + n, 0) / nums.length
}

function printTable(rows: LLMEvalResult[]) {
  console.log(
    'strategy | valid calls | avg prompt tokens (valid only) | avg latency ms (valid only) | avg correctness % (of valid calls)'
  )
  console.log(
    '---------|-------------|----------------------------------|-------------------------------|---------------------------------------'
  )
  for (const strategy of ['naive', 'engine'] as const) {
    const rows2 = rows.filter((r) => r.strategy === strategy)
    const ok = rows2.filter((r) => !r.error)
    const validCalls = `${ok.length}/${rows2.length}`
    if (ok.length === 0) {
      console.log(`${strategy.padEnd(8)} | ${validCalls.padEnd(11)} | no valid calls -- cannot report a rate`)
      continue
    }
    const promptTokens = avg(ok.map((r) => r.promptTokensActual ?? 0))
    const latency = avg(ok.map((r) => r.latencyMs))
    const correctness = avg(ok.map((r) => r.correctnessRate)) * 100
    console.log(
      `${strategy.padEnd(8)} | ${validCalls.padEnd(11)} | ${promptTokens.toFixed(1).padEnd(32)} | ${latency.toFixed(0).padEnd(29)} | ${correctness.toFixed(1)}`
    )
  }
}

console.log(`LLM evaluation report (${latest})\n`)

const feasibleIds = new Set(results.filter((r) => r.feasible).map((r) => r.id))
const feasibleRows = results.filter((r) => feasibleIds.has(r.id))
const infeasibleRows = results.filter((r) => !feasibleIds.has(r.id))

console.log(`== Feasible scenarios (${feasibleIds.size} rows) ==\n`)
printTable(feasibleRows)

if (infeasibleRows.length > 0) {
  const infeasibleIds = new Set(infeasibleRows.map((r) => r.id))
  console.log(`\n== Infeasible scenarios (${infeasibleIds.size} rows, reported separately) ==\n`)
  printTable(infeasibleRows)
}

const anyErrors = results.filter((r) => r.error)
if (anyErrors.length > 0) {
  console.log('\nRows with errors:')
  for (const r of anyErrors) {
    console.log(`  ${r.id}/${r.strategy}: ${r.error}`)
  }
}
