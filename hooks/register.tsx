import { atom, read, update } from 'claude-code'
import type { EngineInterface, Register } from 'claude-code'

import type { CacheContext, CacheHit, CacheTtl, Compaction } from '../types'
import {
  TTL_MS,
  WEATHER,
  clock,
  countdownTone,
  hitRate,
  hitTone,
  kTokens,
  thousands,
  weatherLevel,
} from './format'

const last = atom({ plugin: 'cache-meter', key: 'last' } as const, null)
const context = atom({ plugin: 'cache-meter', key: 'context' } as const, null)
const detectedTtl = atom({ plugin: 'cache-meter', key: 'ttl' } as const, null)
const now = atom({ plugin: 'cache-meter', key: 'now' } as const, 0)
const compaction = atom({ plugin: 'cache-meter', key: 'compaction' } as const, {
  phase: 'idle',
} as Compaction)

const SUBSCRIPTION_WINDOWS = ['five_hour', 'seven_day']

async function ttlMs($: EngineInterface, forcedTtl: CacheTtl | null): Promise<number> {
  return TTL_MS[forcedTtl ?? (await read($, detectedTtl)) ?? '5m']
}

// Ticks while the cache is warm and once more when it lapses, so the band
// counts down without redrawing every second of an idle session.
async function tick($: EngineInterface, forcedTtl: CacheTtl | null) {
  const hit = await read($, last)
  if (hit === null) return
  const expiresAt = hit.at + (await ttlMs($, forcedTtl))
  if ((await read($, now)) >= expiresAt) return
  const t = await $.clock.now()
  await update($, now, () => t)
}

export const register: Register = (on, options) => {
  const forcedTtl: CacheTtl | null =
    options.ttl === '5m' || options.ttl === '1h' ? options.ttl : null

  on('session.start', ($, e, next) => {
    $.clock.every(1000, () => void tick($, forcedTtl))
    return next(e)
  })

  on('turn.step', async function* ($, e, next) {
    const startedAt = await $.clock.now()
    const result = yield* next(e)
    if (e.agentId !== undefined || result.usage === null) return result

    const usage = result.usage
    const hit: CacheHit = {
      at: startedAt,
      read: usage.cache_read_input_tokens,
      written: usage.cache_creation_input_tokens,
      fresh: usage.input_tokens,
      model: usage.model,
    }
    const previous = await read($, last)
    // A hit after more than five minutes proves the one-hour lifetime.
    if (
      previous !== null &&
      hit.read > 0 &&
      previous.model === hit.model &&
      startedAt - previous.at > TTL_MS['5m'] + 5000
    ) {
      await update($, detectedTtl, () => '1h' as CacheTtl)
    }
    await update($, last, () => hit)
    await update($, now, () => startedAt)
    return result
  })

  on('session.measure', async ($, e, next) => {
    const windows = e.rateLimits.filter(l => SUBSCRIPTION_WINDOWS.includes(l.kind))
    if (windows.length > 0) {
      // Past a window's limit the account runs on usage credits: five minutes.
      const ttl: CacheTtl = windows.some(l => l.percentUsed >= 100) ? '5m' : '1h'
      await update($, detectedTtl, () => ttl)
    } else if ((await read($, detectedTtl)) === null) {
      await update($, detectedTtl, () => '5m' as CacheTtl)
    }

    // Right after a compaction the engine has no fill yet: keep our estimate.
    if (e.context.tokens !== undefined) {
      const { tokens, window, percent } = e.context
      await update($, context, () => ({ tokens, window, percent }))
    }
    return next(e)
  })

  on('session.compact', async ($, e, next) => {
    if (e.trigger === 'precompute' || e.agentId !== undefined) return next(e)

    await update($, compaction, () => ({ phase: 'running' }) as Compaction)
    let result
    try {
      result = await next(e)
    } catch (error) {
      await update($, compaction, () => ({ phase: 'idle' }) as Compaction)
      throw error
    }
    if (result.skip !== undefined) {
      await update($, compaction, () => ({ phase: 'idle' }) as Compaction)
      return result
    }

    const { tokensBefore, tokensAfter } = result
    const saved =
      tokensBefore !== undefined && tokensAfter !== undefined
        ? Math.max(0, tokensBefore - tokensAfter)
        : undefined
    await update($, compaction, () => ({ phase: 'done', saved }) as Compaction)
    if (tokensAfter !== undefined) {
      await update($, context, c =>
        c === null
          ? null
          : { ...c, tokens: tokensAfter, percent: Math.round((tokensAfter / c.window) * 100) },
      )
    }
    // The summary is a new prefix: the old cache entry no longer applies.
    await update($, last, () => null)
    return result
  }).catch(($, e, next) => next(e)) // a meter never stands in a compaction's way

  on('turn.start', async ($, e, next) => {
    if ((await read($, compaction)).phase === 'done') {
      await update($, compaction, () => ({ phase: 'idle' }) as Compaction)
    }
    return next(e)
  })

  on('session.end', async ($, e, next) => {
    if (e.reason === 'clear') {
      await update($, last, () => null)
      await update($, context, () => null)
      await update($, compaction, () => ({ phase: 'idle' }) as Compaction)
    }
    return next(e)
  })

  on('ui.render', { component: 'AbovePrompt' }, async ($, e, next) => {
    if (e.props.hasSurvey) return next(e)

    const hit = await read($, last)
    const ctx: CacheContext | null = await read($, context)
    const compacting = await read($, compaction)
    if (hit === null && ctx === null && compacting.phase === 'idle') return next(e)

    const { Box, Button, Text } = $.ui.resolve(e)
    const parts: JSX.Element[] = []
    const dot = (key: string) => (
      <Text key={key} dimColor>
        {' · '}
      </Text>
    )

    if (compacting.phase === 'running') {
      parts.push(<Text key="compacting">⏳ Sitzung wird komprimiert …</Text>)
    } else if (compacting.phase === 'done') {
      parts.push(
        <Text key="compacted" color="success">
          {compacting.saved === undefined
            ? '✓ Sitzung komprimiert'
            : `✓ Sitzung komprimiert · ${thousands(compacting.saved)} Token gespart`}
        </Text>,
      )
    } else if (hit !== null) {
      const ttl = await ttlMs($, forcedTtl)
      const left = hit.at + ttl - (await read($, now))
      if (left > 0) {
        parts.push(
          <Text key="cache">
            ⏱ Cache <Text color={countdownTone(left, ttl)}>{clock(Math.min(left, ttl))}</Text>
          </Text>,
        )
      } else {
        parts.push(
          <Text key="cache" color="error">
            ❄️ Cache abgelaufen
          </Text>,
        )
        if (ctx?.tokens !== undefined) {
          parts.push(dot('d0'), <Text key="reload">nächste Nachricht lädt {kTokens(ctx.tokens)} neu</Text>)
        }
      }
      const rate = hitRate(hit)
      parts.push(
        dot('d1'),
        <Text key="hit">
          Treffer <Text color={hitTone(rate)}>{rate} %</Text>
        </Text>,
      )
    }

    let level = 0
    if (ctx !== null && ctx.tokens !== undefined) {
      const percent = ctx.percent ?? Math.round((ctx.tokens / ctx.window) * 100)
      level = weatherLevel(percent)
      if (parts.length > 0) parts.push(dot('d2'))
      parts.push(
        <Text key="context">
          {WEATHER[level]?.icon} Kontext {percent} % ({kTokens(ctx.tokens)} / {kTokens(ctx.window)})
        </Text>,
      )
      if (level >= 2 && compacting.phase === 'idle') {
        parts.push(
          dot('d3'),
          <Text key="advice" color={level >= 3 ? 'error' : 'warning'}>
            Zeit für Compact oder /clear
          </Text>,
        )
      }
    }

    const canCompact = level >= 1 && !e.props.isWorking && compacting.phase !== 'running'

    return (
      <Box flexDirection="row" width={e.props.bodyColumns}>
        <Box flexShrink={1}>
          <Text wrap="truncate-end">{parts}</Text>
        </Box>
        {canCompact ? (
          <Box marginLeft={2} flexShrink={0}>
            <Button
              key="compact"
              label="Compact"
              onPress={async () => {
                try {
                  await $.session.compact()
                } catch (error) {
                  $.ui.toast(`Compact fehlgeschlagen: ${String(error)}`)
                }
              }}
            />
          </Box>
        ) : null}
      </Box>
    )
  })
}
