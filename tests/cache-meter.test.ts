import { expect, mock, test } from 'claude-code/testing'
import type { Engine, MockClock } from 'claude-code/testing'
import type { On, SessionRateLimit, TurnUsage } from 'claude-code'

const SURFACES = ['terminal', 'desktop'] as const
const MINUTE = 60_000

const BAND_PROPS = {
  hasSurvey: false,
  isWorking: false,
  maxRows: 10,
  bodyColumns: 160,
  scroll: { offset: 0, bodyRows: 9 },
  view: {},
}

const SUBSCRIPTION: SessionRateLimit[] = [{ kind: 'five_hour', percentUsed: 12 }]

function usage(read: number, written: number, fresh: number): TurnUsage {
  return {
    cache_read_input_tokens: read,
    cache_creation_input_tokens: written,
    input_tokens: fresh,
    output_tokens: 500,
    model: 'claude-opus-5-5',
  }
}

type World = { clock: MockClock; next: { usage: TurnUsage | null } }

/** The engine beneath the plugin: a clock, model steps with set usage, and the plain events. */
function world(on: On): World {
  const clock = mock.clock(on, { now: 1_000_000_000 })
  const next: World['next'] = { usage: usage(0, 0, 0) }
  on('turn.step', async function* (_$, e) {
    return {
      turnId: e.turnId,
      index: e.index,
      answer: '',
      toolUses: [],
      stopReason: 'end_turn' as const,
      usage: next.usage,
    }
  })
  on('session.start', (_$, e) => ({ cwd: e.cwd }))
  on('session.measure', (_$, e) => ({ changed: e.changed }))
  on('turn.start', (_$, e) => ({ turnId: e.turnId }))
  on('session.end', (_$, e) => ({ sessionId: e.sessionId }))
  on('session.compact', () => ({
    messages: [{ role: 'user' as const, text: 'Zusammenfassung', toolUses: [] }],
    tokensBefore: 120_000,
    tokensAfter: 43_000,
  }))
  // What the engine draws in the band when no plugin does: nothing.
  on('ui.render', { component: 'AbovePrompt' }, ($, e) => {
    const { Box } = $.ui.resolve(e)
    return Box({})
  })
  return { clock, next }
}

async function start($: Engine) {
  await $.session.start({ cwd: '/', surface: null, isInteractive: true })
}

async function step($: Engine, w: World, u: TurnUsage | null, agentId?: string) {
  w.next.usage = u
  const stream = $.turn.step({ turnId: 't', index: 0, model: 'claude-opus-5-5', messageCount: 3, agentId })
  for await (const _ of stream) {
    // drain
  }
}

async function measure($: Engine, tokens: number, rateLimits: SessionRateLimit[] = SUBSCRIPTION) {
  const window = 200_000
  await $.session.measure({
    context: { tokens, window, percent: Math.round((tokens / window) * 100) },
    rateLimits,
    changed: ['context', 'rateLimits'],
  })
}

async function bandText($: Engine, surface: (typeof SURFACES)[number], props = BAND_PROPS) {
  const ui = await $.ui.mount({ plugin: 'cache-meter', surface, component: 'AbovePrompt', props })
  // The first Text is the outermost: the whole line.
  const line = await ui.find({ type: 'Text' })
  const button = await ui.find({ type: 'Button', key: 'compact' })
  await ui.unmount()
  return { text: line?.text ?? '', hasCompact: button !== undefined }
}

test('zeigt Countdown, Trefferquote und sonniges Wetter', async ($, on) => {
  const w = world(on)
  await start($)
  await step($, w, usage(80_000, 1_000, 300))
  await measure($, 46_000)
  for (const surface of SURFACES) {
    const { text, hasCompact } = await bandText($, surface)
    expect(text).toContain('⏱ Cache 60:00')
    expect(text).toContain('Treffer 98 %')
    expect(text).toContain('☀️ Kontext 23 % (46k / 200k)')
    expect(hasCompact).toBe(false)
  }
})

test('der Countdown läuft und der Cache läuft ab (5 min ohne Abo)', async ($, on) => {
  const w = world(on)
  await start($)
  await step($, w, usage(80_000, 1_000, 300))
  await measure($, 46_000, [])
  await w.clock.advance(2 * MINUTE)
  for (const surface of SURFACES) {
    expect((await bandText($, surface)).text).toContain('Cache 03:00')
  }
  await w.clock.advance(3 * MINUTE + 1000)
  for (const surface of SURFACES) {
    const { text } = await bandText($, surface)
    expect(text).toContain('❄️ Cache abgelaufen')
    expect(text).toContain('nächste Nachricht lädt 46k neu')
  }
})

test('ein Treffer nach mehr als 5 min belegt eine Stunde', async ($, on) => {
  const w = world(on)
  await start($)
  await measure($, 46_000, [])
  await step($, w, usage(80_000, 1_000, 300))
  await w.clock.advance(10 * MINUTE)
  await step($, w, usage(81_000, 500, 200))
  expect((await bandText($, 'terminal')).text).toContain('⏱ Cache 60:00')
})

test('die Option ttl=5m übersteuert das Abo', { options: { ttl: '5m' } }, async ($, on) => {
  const w = world(on)
  await start($)
  await step($, w, usage(80_000, 1_000, 300))
  await measure($, 46_000)
  expect((await bandText($, 'terminal')).text).toContain('⏱ Cache 05:00')
})

test('bei Regen gibt es Hinweis und Compact-Knopf, nicht während Claude arbeitet', async ($, on) => {
  const w = world(on)
  await start($)
  await step($, w, usage(120_000, 2_000, 300))
  await measure($, 128_000)
  for (const surface of SURFACES) {
    const idle = await bandText($, surface)
    expect(idle.text).toContain('🌧️ Kontext 64 % (128k / 200k)')
    expect(idle.text).toContain('Zeit für Compact oder /clear')
    expect(idle.hasCompact).toBe(true)
    const working = await bandText($, surface, { ...BAND_PROPS, isWorking: true })
    expect(working.hasCompact).toBe(false)
  }
})

// The kit hands a compaction the plugin raises itself an empty transcript, so
// this raises it as /compact does; the button's $.session.compact() takes the
// same hook in a session.
test('Compact zeigt die gesparten Token bis zur nächsten Nachricht', async ($, on) => {
  const w = world(on)
  await start($)
  await step($, w, usage(120_000, 2_000, 300))
  await measure($, 128_000)
  await $.session.compact({
    trigger: 'manual',
    messages: [{ role: 'user', text: 'Hallo', toolUses: [] }],
  })
  for (const surface of SURFACES) {
    const { text, hasCompact } = await bandText($, surface)
    expect(text).toContain('✓ Sitzung komprimiert · 77.000 Token gespart')
    expect(text).toContain('☀️ Kontext 22 % (43k / 200k)')
    expect(text).not.toContain('Treffer')
    expect(hasCompact).toBe(false)
  }
  await $.turn.start({ text: 'weiter', turnId: 't2' })
  expect((await bandText($, 'terminal')).text).not.toContain('gespart')
})

test('Schritte von Subagenten zählen nicht', async ($, on) => {
  const w = world(on)
  await start($)
  await step($, w, usage(80_000, 1_000, 300))
  await step($, w, usage(0, 50_000, 300), 'agent-1')
  await measure($, 46_000)
  expect((await bandText($, 'terminal')).text).toContain('Treffer 98 %')
})

test('/clear setzt die Leiste zurück', async ($, on) => {
  const w = world(on)
  await start($)
  await step($, w, usage(80_000, 1_000, 300))
  await measure($, 46_000)
  await $.session.end({ reason: 'clear', sessionId: 's1', resume: { id: 's1' } })
  const { text } = await bandText($, 'terminal')
  expect(text).not.toContain('Treffer')
  expect(text).not.toContain('Kontext')
})
