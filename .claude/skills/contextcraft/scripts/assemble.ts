// Usage: tsx assemble.ts <input.json>
// input.json shape: { items: ContextItem[], inputBudget: number, reservedTokens: number,
//                      importancePinThreshold?: number, weights?: ScoringWeights }
import { readFileSync } from 'node:fs'
import { assembleContext } from '../../../../src/budget.js'

const inputPath = process.argv[2]
if (!inputPath) {
  console.error('Usage: tsx assemble.ts <input.json>')
  process.exit(1)
}

const input = JSON.parse(readFileSync(inputPath, 'utf-8'))
const result = assembleContext(input.items, {
  inputBudget: input.inputBudget,
  reservedTokens: input.reservedTokens,
  importancePinThreshold: input.importancePinThreshold,
  weights: input.weights,
})

console.log(JSON.stringify(result, null, 2))
