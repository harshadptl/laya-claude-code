import type { EngineInterface, Register } from 'claude-code'
import { SERVER_PY } from './server.ts'
import {
  type Answers,
  clip,
  COMPACT_QUESTIONS,
  compactState,
  pickTier,
  ROUTE_QUESTIONS,
  shouldCompact,
  type Tier,
} from './decide.ts'

type Options = {
  layaModel: string
  routing: boolean
  haikuBelow: number
  opusAbove: number
  haikuModel: string
  sonnetModel: string
  opusModel: string
  haikuMaxTokens: number
  compaction: boolean
  compactMinPercent: number
  compactMinProb: number
}

let sock = ''
let spawned = false

async function ask($: EngineInterface, o: Options, state: string, questions: object): Promise<Answers> {
  try {
    const r = await $.http.fetch('http://laya/predict', {
      method: 'POST',
      socketPath: sock,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state, questions }),
    })
    if (r.ok) return JSON.parse(r.text).answers
    $.ui.log(`laya-router: ${r.status} ${r.text}`, { to: 'debug' })
  } catch {
    // Server down (not started yet, or its session ended): start ours; skip this decision.
    void ensureServer($, o)
  }
  return null
}

// Resolves true once a server answers on the socket: an existing one, or ours after its "ready" line.
async function ensureServer($: EngineInterface, o: Options): Promise<boolean> {
  if (spawned) return false
  sock ||= `/tmp/laya-router-${(await $.env.get('USER')) ?? 'user'}.sock`
  try {
    if ((await $.http.fetch('http://laya/health', { socketPath: sock })).ok) return true
  } catch {}
  spawned = true
  return new Promise<boolean>((resolve) => {
    void (async () => {
      try {
        const argv = ['uv', 'run', '--quiet', '--python', '3.12', '--with', 'laya-mlx', 'python', '-c', SERVER_PY, sock, o.layaModel]
        for await (const { text } of $.process.spawn({ argv })) {
          if (text.includes('laya-router: ready')) resolve(true)
          $.ui.log(`laya-router: ${text.trim()}`, { to: 'debug' })
        }
      } catch (err) {
        $.ui.log(`laya-router: server failed to start: ${err}`)
      } finally {
        spawned = false
        resolve(false)
      }
    })()
  })
}

export const register: Register = (on, options) => {
  const o = options as unknown as Options
  const models: Record<Tier, string> = { haiku: o.haikuModel, sonnet: o.sonnetModel, opus: o.opusModel }
  const routes = new Map<string, string>() // turnId -> model laya picked

  on('session.start', async ($, e, next) => {
    const started = await next(e)
    await ensureServer($, o)
    return started
  })

  // Routing: classify the prompt once per turn, before its first model request.
  on('turn.start', async ($, e, next) => {
    if (o.routing && e.text.trim()) {
      let tier = pickTier(await ask($, o, clip(e.text), ROUTE_QUESTIONS), o.haikuBelow, o.opusAbove)
      if (tier === 'haiku' && ((await $.session.usage()).context.tokens ?? 0) > o.haikuMaxTokens) tier = null
      if (tier) routes.set(e.turnId, models[tier])
      $.ui.status(tier ? `laya → ${tier}` : 'laya → session model')
    }
    return next(e)
  })

  // Main loop only: a subagent keeps the model its definition asked for.
  on('turn.step', async function* ($, e, next) {
    const model = e.agentId === undefined ? routes.get(e.turnId) : undefined
    return yield* next(model && model !== e.model ? { ...e, model } : e)
  })

  // Compaction: once the window is filling, compact early at a natural breakpoint
  // instead of waiting for auto-compact to cut in mid-task.
  on('turn.complete', async ($, e, next) => {
    const done = await next(e)
    routes.delete(e.turnId)
    if (!o.compaction || e.agentId !== undefined || e.isAborted) return done
    const percent = (await $.session.usage()).context.percent ?? 0
    if (percent < o.compactMinPercent) return done
    const answers = await ask($, o, compactState(await $.session.messages(), percent), COMPACT_QUESTIONS)
    $.ui.log(`laya-router: breakpoint p=${answers?.breakpoint?.noul ?? '?'} at ${percent}%`, { to: 'debug' })
    if (shouldCompact(answers, o.compactMinProb)) {
      // compact() rejects while a turn runs; the turn is still closing here.
      $.clock.after(1000, () => {
        $.ui.toast(`laya: breakpoint at ${percent}% context, compacting`)
        $.session
          .compact({ instructions: 'Keep the current task state, files changed, open issues and user preferences.' })
          .catch((err) => $.ui.log(`laya-router: compact failed: ${err}`, { to: 'debug' }))
      })
    }
    return done
  })
}
