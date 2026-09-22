import { expect, test } from 'claude-code/testing'
import { compactState, pickTier, shouldCompact } from './decide.ts'

const effort = (score: number) => ({ effort: { score } })

test('effort score maps to tiers at the configured cutoffs', async () => {
  expect(pickTier(effort(0.71), 0.9, 1.25)).toBe('haiku') // a typo fix, as laya scored it
  expect(pickTier(effort(0.97), 0.9, 1.25)).toBe('sonnet') // add a flag + test
  expect(pickTier(effort(1.54), 0.9, 1.25)).toBe('opus') // distributed design
})

test('no decision when laya is unreachable', async () => {
  // null keeps the session's model: a dead server must never silently downgrade.
  expect(pickTier(null, 0.9, 1.25)).toBe(null)
  expect(pickTier({}, 0.9, 1.25)).toBe(null)
})

test('compacts only above the breakpoint confidence', async () => {
  expect(shouldCompact({ breakpoint: { noul: 0.7 } }, 0.6)).toBe(true)
  // Mid-task compaction loses working detail: below threshold, keep going.
  expect(shouldCompact({ breakpoint: { noul: 0.5 } }, 0.6)).toBe(false)
  expect(shouldCompact(null, 0.6)).toBe(false)
})

test('compaction state carries the fill and the latest exchange, not tool noise', async () => {
  const s = compactState(
    [
      { role: 'user', text: 'old' },
      { role: 'assistant', text: '' },
      { role: 'user', text: 'fix the bug' },
      { role: 'assistant', text: 'done' },
    ],
    72,
  )
  expect(s).toBe('Context window 72% full.\nuser: old\nuser: fix the bug\nassistant: done')
})
