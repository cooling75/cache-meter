import type { CacheHit, CacheTtl } from '../types'

export type Tone = 'success' | 'warning' | 'error'

export const TTL_MS: Record<CacheTtl, number> = { '5m': 5 * 60_000, '1h': 60 * 60_000 }

/** Context fill as weather: 0 sunny … 3 thunderstorm. */
export const WEATHER = [
  { icon: '☀️', below: 40 },
  { icon: '⛅', below: 60 },
  { icon: '🌧️', below: 80 },
  { icon: '⛈️', below: Infinity },
] as const

export function weatherLevel(percent: number): number {
  return WEATHER.findIndex(w => percent < w.below)
}

/** Share of the request's input the cache served, 0–100. */
export function hitRate(hit: CacheHit): number {
  const total = hit.read + hit.written + hit.fresh
  return total === 0 ? 0 : Math.round((hit.read / total) * 100)
}

export function hitTone(rate: number): Tone {
  return rate >= 80 ? 'success' : rate >= 40 ? 'warning' : 'error'
}

export function countdownTone(leftMs: number, ttlMs: number): Tone {
  return leftMs < 60_000 ? 'error' : leftMs < ttlMs / 4 ? 'warning' : 'success'
}

/** 754_000 ms → "12:34"; rounds up so "00:00" means expired. */
export function clock(ms: number): string {
  const seconds = Math.max(0, Math.ceil(ms / 1000))
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${pad(Math.floor(seconds / 60))}:${pad(seconds % 60)}`
}

/** 46_300 → "46k", 1_000_000 → "1M". */
export function kTokens(n: number): string {
  if (n < 1000) return String(n)
  if (n < 1_000_000) return `${Math.round(n / 1000)}k`
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '').replace('.', ',')}M`
}

/** 77000 → "77.000", without Intl (the hooks environment may lack the locale). */
export function thousands(n: number): string {
  return String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, '.')
}
