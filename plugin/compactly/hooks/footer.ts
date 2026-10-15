import type { PanelState } from '../types'
import { panelModel } from './model'
import { usd } from './pricing'

/** Context share at which the footer starts to show it, the same point the pane's bar turns red. */
const CTX_WARN = 0.8

export type Footer = { text: string; color: 'success' | 'warning' | 'error' | undefined }

const short = (ms: number) => (ms < 60_000 ? '<1m' : `${Math.floor(ms / 60_000)}m`)

/**
 * The one-line footer: cache state always, then whatever is worth acting on. Fields drop from the right
 * until the line fits `width`. Undefined while there is nothing priced to show.
 */
export const footerLine = (s: PanelState, now: number, ttl: string, width = Infinity): Footer | undefined => {
  const m = panelModel(s, now, ttl)
  if (m === undefined) return undefined
  const rebuild = m.tiles.find(t => t.id === 'rebuild')!.value
  const { zone, remainingMs } = m.clock
  const tips = m.hints.length
  const share = s.window > 0 ? s.tokens / s.window : 0

  const head = zone === 'unknown' ? '○ cache ?' : zone === 'cold' ? '○ cold' : `● warm ${short(remainingMs)}`
  const color = zone === 'cold' || zone === 'window' ? 'warning' : zone === 'warm' ? 'success' : undefined
  const parts = [
    zone === 'cold' ? `next msg re-writes ${rebuild}` : zone === 'unknown' ? '' : `${rebuild} if cold`,
    tips > 0 ? `▲ ${tips} tip${tips === 1 ? '' : 's'}` : '',
    share >= CTX_WARN ? `ctx ${Math.round(share * 100)}%` : '',
  ].filter(p => p !== '')

  let line = [head, ...parts]
  while (line.length > 1 && line.join(' · ').length > width) line = line.slice(0, -1)
  return { text: line.join(' · '), color: share >= CTX_WARN ? 'error' : color }
}
