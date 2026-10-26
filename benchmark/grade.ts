export interface GradeResult {
  factsTotal: number
  factsPresent: number
  rate: number
  missingFactIds: string[]
}

export function gradeAnswer(
  answerText: string,
  requiredFactIds: string[],
  graderKeywords: Record<string, string[]>
): GradeResult {
  const lower = answerText.toLowerCase()
  const missingFactIds: string[] = []

  for (const factId of requiredFactIds) {
    const keywords = graderKeywords[factId] ?? []
    const present = keywords.some((kw) => lower.includes(kw.toLowerCase()))
    if (!present) missingFactIds.push(factId)
  }

  const factsTotal = requiredFactIds.length
  const factsPresent = factsTotal - missingFactIds.length
  return {
    factsTotal,
    factsPresent,
    rate: factsTotal === 0 ? 1 : factsPresent / factsTotal,
    missingFactIds,
  }
}
