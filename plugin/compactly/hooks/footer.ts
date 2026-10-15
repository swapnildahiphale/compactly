import type { PanelState, Prefs } from '../types'
import { panelModel } from './model'
import { DEFAULT_PREFS } from './settings'

/** Context share at which the footer starts to show it, the same point the pane's bar turns red. */
const CTX_WARN = 0.8

export type Footer = { text: string; color: 'success' | 'warning' | 'error' | undefined }

const short = (ms: number) => (ms < 60_000 ? '<1m' : `${Math.floor(ms / 60_000)}m`)

/**
 * The one-line footer: the fields `fields` turns on, in order, dropping from the right until the line fits
 * `width`. Undefined while there is nothing priced to show, or no field is on.
 */
export const footerLine = (
  s: PanelState,
  now: number,
  ttl: string,
  width = Infinity,
  fields: Prefs['fields'] = DEFAULT_PREFS.fields,
): Footer | undefined => {
  const m = panelModel(s, now, ttl)
  if (m === undefined) return undefined
  const rebuild = m.tiles.find(t => t.id === 'rebuild')!.value
  const { zone, remainingMs } = m.clock
  const tips = m.hints.length
  const share = s.window > 0 ? s.tokens / s.window : 0

  const head = zone === 'unknown' ? '○ cache ?' : zone === 'cold' ? '○ cold' : `● warm ${short(remainingMs)}`
  const color = zone === 'cold' || zone === 'window' ? 'warning' : zone === 'warm' ? 'success' : undefined
  const parts = [
    fields.cache ? head : '',
    fields.rebuild ? (zone === 'cold' ? `next msg re-writes ${rebuild}` : zone === 'unknown' ? '' : `${rebuild} if cold`) : '',
    fields.tips && tips > 0 ? `▲ ${tips} tip${tips === 1 ? '' : 's'}` : '',
    fields.ctx && share >= CTX_WARN ? `ctx ${Math.round(share * 100)}%` : '',
  ].filter(p => p !== '')
  if (parts.length === 0) return undefined

  let line = parts
  while (line.length > 1 && line.join(' · ').length > width) line = line.slice(0, -1)
  return { text: line.join(' · '), color: share >= CTX_WARN ? 'error' : color }
}
