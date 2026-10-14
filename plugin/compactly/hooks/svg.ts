import { SERIES } from './chart'
import { minutes } from './hints'
import { clockShares } from './model'
import type { Clock, Tile } from './model'

// The chart's palette: reads blue, writes orange, output green; the same dark-mode pairs.
const [READ, WRITE, OUT] = [SERIES[0], SERIES[1], SERIES[2]]
const STYLE =
  `.sp{stroke:${READ.light}}.ok{fill:${OUT.light}}.win{fill:${WRITE.light}}.tr{fill:#e1e0d9}.mk{stroke:#52514e}.lb{fill:#898781;font:10px system-ui,sans-serif}` +
  `@media (prefers-color-scheme: dark){.sp{stroke:${READ.dark}}.ok{fill:${OUT.dark}}.win{fill:${WRITE.dark}}.tr{fill:#2c2c2a}.mk{stroke:#c3c2b7}}`

const doc = (w: number, h: number, body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}"><style>${STYLE}</style>${body}</svg>`

/** One line through the series, scaled to its own range; a flat series runs through the middle. */
export const sparkSvg = (series: readonly number[], w = 120, h = 28) => {
  const lo = Math.min(...series)
  const hi = Math.max(...series)
  const pad = 2
  const points = series
    .map((v, i) => {
      const x = pad + (series.length === 1 ? 0 : (i / (series.length - 1)) * (w - 2 * pad))
      const y = hi === lo ? h / 2 : h - pad - ((v - lo) / (hi - lo)) * (h - 2 * pad)
      return `${x.toFixed(1)},${y.toFixed(1)}`
    })
    .join(' ')
  return doc(w, h, `<polyline class="sp" fill="none" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round" points="${points}"/>`)
}

export const sparkAlt = (t: Tile) => `${t.label} over the last ${t.series.length} turns, latest ${t.value}`

// Floor, to match `minutes()` in hints.ts, which the panel header uses for "expires in N min".
const mins = (ms: number) => Math.floor(ms / 60_000)

/** The cache bar: window zone then warm zone filled up to what remains, a marker at "now", the rest drained. */
export const clockSvg = (c: Clock, w = 560, h = 36) => {
  const sh = clockShares(c)
  const [winW, warmW] = [sh.window * w, sh.warm * w]
  const bar = { y: 6, h: 14 }
  const rect = (cls: string, x: number, width: number) =>
    width <= 0 ? '' : `<rect class="${cls}" x="${x.toFixed(1)}" y="${bar.y}" width="${width.toFixed(1)}" height="${bar.h}"/>`
  const end = winW + warmW
  const isLive = c.zone === 'warm' || c.zone === 'window'
  const tip = c.zone === 'cold' ? 'Cache cold' : c.zone === 'unknown' ? 'Cache state unknown' : `${minutes(c.remainingMs)} of cache left`
  const body =
    `<title>${tip}</title>` +
    `<rect class="tr" x="0" y="${bar.y}" width="${w}" height="${bar.h}" rx="3"/>` +
    rect('win', 0, winW) +
    rect('ok', winW, warmW) +
    (isLive ? `<line class="mk" x1="${end.toFixed(1)}" x2="${end.toFixed(1)}" y1="${bar.y - 3}" y2="${bar.y + bar.h + 3}" stroke-width="2"/>` : '') +
    `<text class="lb" x="0" y="${h - 4}">0</text>` +
    `<text class="lb" x="${((c.windowMs / c.ttlMs) * w).toFixed(1)}" y="${h - 4}">${mins(c.windowMs)} min</text>` +
    `<text class="lb" x="${w}" y="${h - 4}" text-anchor="end">${mins(c.ttlMs)} min</text>`
  return doc(w, h, body)
}

export const clockAlt = (c: Clock) =>
  c.zone === 'cold'
    ? 'Cache expiry: cold, the cache has expired.'
    : c.zone === 'unknown'
      ? 'Cache expiry: unknown until the next reply.'
      : `Cache expiry: ${c.zone === 'window' ? 'in the compact window' : 'warm'}, ${minutes(c.remainingMs)} left of ${mins(c.ttlMs)}. The last ${mins(c.windowMs)} min are the compact window.`
