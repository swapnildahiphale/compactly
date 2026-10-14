import type { PanelState, TurnRow } from '../types'
import { cacheState, compactCost, hints, hitRatio } from './hints'
import type { Hint } from './hints'
import { priceOf, usd, writePrice } from './pricing'

export const ttlMsOf = (ttl: string) => (ttl === '5m' ? 5 * 60_000 : 60 * 60_000)

/** The last stretch of the cache's life, when the plugin compacts if no prompt came: 5 minutes, or a fifth of the 5-minute TTL. */
export const windowMsOf = (ttl: string) => Math.min(5 * 60_000, ttlMsOf(ttl) / 5)

export type Tile = { id: 'session' | 'hit' | 'carry' | 'rebuild'; label: string; value: string; series: number[] }
export type Zone = 'unknown' | 'warm' | 'window' | 'cold'
export type Clock = {
  zone: Zone
  remainingMs: number
  ttlMs: number
  windowMs: number
  /** Set while the pre-expiry compaction is armed. */
  compactInMs?: number
  /** What that compaction saves against the cache rebuild, in USD. */
  saves?: number
}
export type PanelModel = { tiles: Tile[]; clock: Clock; hints: Hint[] }

const cost = (t: TurnRow) => t.read + t.write + t.output + t.input

const running = (turns: readonly TurnRow[]) => {
  let sum = 0
  return turns.map(t => (sum += cost(t)))
}

const hitOf = (t: TurnRow) => t.readTokens / (t.readTokens + t.writeTokens)

/** What the panel shows, or undefined while there is nothing priced to show. */
export const panelModel = (s: PanelState, now: number, ttl: string): PanelModel | undefined => {
  const p = priceOf(s.model)
  if (p === undefined || s.tokens === 0) return undefined
  const ttlMs = ttlMsOf(ttl)
  const windowMs = windowMsOf(ttl)
  const carry = (s.tokens * p.read) / 1e6
  const rebuild = (s.tokens * writePrice(p, ttl)) / 1e6
  const ratio = hitRatio(s)
  const priceFor = (t: TurnRow) => priceOf(t.model) ?? p
  const cache = cacheState(s, now, ttlMs)
  const zone: Zone = cache === undefined ? 'unknown' : !cache.isWarm ? 'cold' : cache.remainingMs <= windowMs ? 'window' : 'warm'
  return {
    tiles: [
      { id: 'session', label: 'Session cost', value: usd(s.sessionUsd), series: running(s.turns) },
      { id: 'hit', label: 'Cache hit', value: ratio === undefined ? '–' : `${(ratio * 100).toFixed(1)}%`, series: s.turns.filter(t => t.readTokens + t.writeTokens > 0).map(hitOf) },
      { id: 'carry', label: 'Re-read per turn', value: usd(carry), series: s.turns.map(t => (t.ctx * priceFor(t).read) / 1e6) },
      { id: 'rebuild', label: 'Rebuild if cold', value: usd(rebuild), series: s.turns.map(t => (t.ctx * writePrice(priceFor(t), ttl)) / 1e6) },
    ],
    clock: {
      zone,
      remainingMs: cache?.remainingMs ?? 0,
      ttlMs,
      windowMs,
      ...(s.compactAt === undefined
        ? {}
        : { compactInMs: Math.max(0, s.compactAt - now), saves: Math.max(0, rebuild - compactCost(s.tokens, p)) }),
    },
    hints: hints(s, now, ttl).slice(0, 4),
  }
}

/** The bar left to right: the compact window, the rest of the warm time, then what has drained. Shares of the TTL. */
export const clockShares = (c: Clock) => {
  const filled = Math.min(1, c.remainingMs / c.ttlMs)
  const window = Math.min(filled, c.windowMs / c.ttlMs)
  return { window, warm: filled - window, track: 1 - filled }
}
