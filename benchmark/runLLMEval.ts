process.loadEnvFile(new URL('../.env', import.meta.url))

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, join } from 'node:path'
import { assembleContext } from '../src/budget.js'
import { estimateTokens } from '../src/tokenizer.js'
import { ContextItem } from '../src/types.js'
import { naiveTruncate } from './baseline.js'
import { generateAnswer } from './geminiClient.js'
import { gradeAnswer } from './grade.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const DELAY_BETWEEN_CALLS_MS = 13000 // actual observed free-tier limit is 5 req/min for gemini-2.5-flash

interface DatasetRow {
  id: string
  query: string
  inputBudget: number
  reservedTokens: number
  requiredFactIds: string[]
  contextPool: ContextItem[]
}

interface LLMEvalResult {
  id: string
  strategy: 'naive' | 'engine'
  feasible: boolean
  contextTokens: number
  promptTokensActual: number | null
  outputTokensActual: number | null
  totalTokensActual: number | null
  latencyMs: number
  answerText: string
  factsTotal: number
  factsPresent: number
  correctnessRate: number
  missingFactIds: string[]
  error?: string
}

function isFeasible(row: DatasetRow, availableTokens: number): boolean {
  const requiredTokens = row.contextPool
    .filter((item) => row.requiredFactIds.includes(item.id))
    .reduce((sum, item) => sum + estimateTokens(item.content), 0)
  return requiredTokens <= availableTokens
}

function buildPrompt(query: string, items: ContextItem[]): string {
  const context = items.map((item) => `- ${item.content}`).join('\n')
  return [
    'You are a helpful assistant. Answer the question using ONLY the information in the context below.',
    'If the context does not contain the answer, say "I don\'t know based on the given context."',
    '',
    'Context:',
    context || '(no context provided)',
    '',
    `Question: ${query}`,
    '',
    'Answer concisely in 1-2 sentences.',
  ].join('\n')
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

async function run() {
  const dataset: DatasetRow[] = JSON.parse(readFileSync(join(__dirname, 'dataset.json'), 'utf-8'))
  const graderKeywords: Record<string, string[]> = JSON.parse(
    readFileSync(join(__dirname, 'graderKeywords.json'), 'utf-8')
  )

  const results: LLMEvalResult[] = []
  let callCount = 0

  for (const row of dataset) {
    const availableTokens = row.inputBudget - row.reservedTokens
    const feasible = isFeasible(row, availableTokens)

    const naiveSelectedIds = naiveTruncate(row.contextPool, availableTokens).selectedIds
    const naiveItems = row.contextPool.filter((i) => naiveSelectedIds.includes(i.id))

    const engineSelectedIds = assembleContext(row.contextPool, {
      inputBudget: row.inputBudget,
      reservedTokens: row.reservedTokens,
    }).selected.map((i) => i.id)
    const engineItems = row.contextPool.filter((i) => engineSelectedIds.includes(i.id))

    for (const [strategy, items] of [
      ['naive', naiveItems],
      ['engine', engineItems],
    ] as const) {
      if (callCount > 0) await sleep(DELAY_BETWEEN_CALLS_MS)
      callCount++

      const prompt = buildPrompt(row.query, items)
      const contextTokens = items.reduce((s, i) => s + estimateTokens(i.content), 0)

      console.log(`[${callCount}] ${row.id} / ${strategy} ...`)

      try {
        const { text, usage, latencyMs } = await generateAnswer(prompt)
        const grade = gradeAnswer(text, row.requiredFactIds, graderKeywords)
        results.push({
          id: row.id,
          strategy,
          feasible,
          contextTokens,
          promptTokensActual: usage?.promptTokens ?? null,
          outputTokensActual: usage?.outputTokens ?? null,
          totalTokensActual: usage?.totalTokens ?? null,
          latencyMs,
          answerText: text,
          factsTotal: grade.factsTotal,
          factsPresent: grade.factsPresent,
          correctnessRate: grade.rate,
          missingFactIds: grade.missingFactIds,
        })
      } catch (err) {
        results.push({
          id: row.id,
          strategy,
          feasible,
          contextTokens,
          promptTokensActual: null,
          outputTokensActual: null,
          totalTokensActual: null,
          latencyMs: 0,
          answerText: '',
          factsTotal: row.requiredFactIds.length,
          factsPresent: 0,
          correctnessRate: 0,
          missingFactIds: row.requiredFactIds,
          error: err instanceof Error ? err.message : String(err),
        })
        console.error(`  error: ${err instanceof Error ? err.message : err}`)
      }
    }
  }

  const resultsDir = join(__dirname, 'results')
  mkdirSync(resultsDir, { recursive: true })
  const outPath = join(resultsDir, `llm-eval-${new Date().toISOString().replace(/[:.]/g, '-')}.json`)
  writeFileSync(outPath, JSON.stringify(results, null, 2))
  console.log(`\nWrote ${results.length} result rows to ${outPath}`)
}

run()
