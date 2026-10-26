// Usage: tsx compress.ts <input.json>
// input.json shape: { items: ContextItem[], enabled: boolean, recentKeepCount: number,
//                      importancePreserveThreshold: number }
import { readFileSync } from 'node:fs'
import { compressHistory } from '../../../../src/compression.js'

const inputPath = process.argv[2]
if (!inputPath) {
  console.error('Usage: tsx compress.ts <input.json>')
  process.exit(1)
}

const input = JSON.parse(readFileSync(inputPath, 'utf-8'))
const result = compressHistory(input.items, {
  enabled: input.enabled,
  recentKeepCount: input.recentKeepCount,
  importancePreserveThreshold: input.importancePreserveThreshold,
})

console.log(JSON.stringify(result, null, 2))
