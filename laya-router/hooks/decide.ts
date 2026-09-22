// The typed questions laya answers, and how its answers become decisions.
// Pure: no `$`, so the tests exercise it directly.

export type Tier = 'haiku' | 'sonnet' | 'opus'

type Answer = { score?: number; noul?: number }
export type Answers = Record<string, Answer> | null

// Probed on aac6fef/laya-mlx: trivial asks score ~0.7-0.9, typical ~1.0, hard >1.4.
export const ROUTE_QUESTIONS = {
  effort: {
    type: 'score',
    instructions: 'How much reasoning does this coding request need?',
    criteria: ['trivial one-step edit or command', 'ordinary feature or bug fix', 'deep design or hard debugging'],
  },
}

export const COMPACT_QUESTIONS = {
  breakpoint: {
    type: 'noul',
    instructions:
      "Is the assistant's work on the current task finished, so the earlier conversation can be summarized without losing anything the next request needs?",
  },
}

// laya-mlx's context is 512 tokens; keep the tail, where the current ask is.
export const clip = (s: string, n = 1500) => (s.length > n ? s.slice(-n) : s)

// Expected rubric level (0-2) -> tier. No answer (server down) -> null: keep the session's model.
export function pickTier(answers: Answers, haikuBelow: number, opusAbove: number): Tier | null {
  const score = answers?.effort?.score
  if (score === undefined) return null
  return score < haikuBelow ? 'haiku' : score > opusAbove ? 'opus' : 'sonnet'
}

export function shouldCompact(answers: Answers, minProb: number): boolean {
  return (answers?.breakpoint?.noul ?? 0) >= minProb
}

export function compactState(
  messages: readonly { role: string; text: string }[],
  percent: number,
): string {
  const recent = messages
    .filter((m) => m.text.trim())
    .slice(-4)
    .map((m) => `${m.role}: ${clip(m.text, 400)}`)
  return `Context window ${percent}% full.\n${recent.join('\n')}`
}
