const MODEL = 'gemini-2.5-flash'
const ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`

export interface GenerateResult {
  text: string
  usage: { promptTokens: number; outputTokens: number; totalTokens: number } | null
  latencyMs: number
}

export async function generateAnswer(prompt: string): Promise<GenerateResult> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    throw new Error('GEMINI_API_KEY is not set. Load it with process.loadEnvFile(".env") before calling this.')
  }

  const start = Date.now()
  const response = await fetch(`${ENDPOINT}?key=${apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { thinkingConfig: { thinkingBudget: 0 } },
    }),
  })
  const latencyMs = Date.now() - start

  if (!response.ok) {
    const body = await response.text()
    throw new Error(`Gemini API error ${response.status}: ${body}`)
  }

  const data = await response.json()
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  const usage = data.usageMetadata
    ? {
        promptTokens: data.usageMetadata.promptTokenCount ?? 0,
        outputTokens: data.usageMetadata.candidatesTokenCount ?? 0,
        totalTokens: data.usageMetadata.totalTokenCount ?? 0,
      }
    : null

  return { text, usage, latencyMs }
}
