/** The last main-thread model request: when it started and what the cache did. */
export type CacheHit = {
  at: number
  read: number
  written: number
  fresh: number
  model: string
}

/** The live context window as `session.measure` reports it. */
export type CacheContext = { tokens?: number; window: number; percent?: number }

export type Compaction =
  | { phase: 'idle' }
  | { phase: 'running' }
  | { phase: 'done'; saved?: number }

export type CacheTtl = '5m' | '1h'

declare module 'claude-code' {
  interface PluginState {
    'cache-meter': {
      last: CacheHit | null
      context: CacheContext | null
      ttl: CacheTtl | null
      now: number
      compaction: Compaction
    }
  }
}
