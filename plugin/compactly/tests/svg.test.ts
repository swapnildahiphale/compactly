import { expect, test } from 'claude-code/testing'

import type { Clock, Tile } from '../hooks/model'
import { clockAlt, clockSvg, sparkAlt, sparkSvg } from '../hooks/svg'

const MIN = 60_000
const clock = (over: Partial<Clock> = {}): Clock => ({ zone: 'warm', remainingMs: 30 * MIN, ttlMs: 60 * MIN, windowMs: 5 * MIN, ...over })

test('a sparkline has one point per value and no NaN, even when the series is flat', async () => {
  const svg = sparkSvg([1, 2, 3, 2])
  expect(svg.startsWith('<svg')).toBe(true)
  const points = /points="([^"]+)"/.exec(svg)![1]!.split(' ')
  expect(points).toHaveLength(4)
  expect(/NaN/.test(sparkSvg([5, 5, 5]))).toBe(false)
})

test('the clock Svg fills the warm and window zones and marks now, and has a tooltip', async () => {
  const svg = clockSvg(clock())
  expect(svg).toMatch(/class="ok"/)
  expect(svg).toMatch(/class="win"/)
  expect(svg).toMatch(/class="mk"/)
  expect(svg).toMatch(/<title>30 min of cache left<\/title>/)
})

test('a cold clock has no fill and no marker', async () => {
  const svg = clockSvg(clock({ zone: 'cold', remainingMs: 0 }))
  expect(svg).not.toMatch(/class="ok"/)
  expect(svg).not.toMatch(/class="mk"/)
  expect(svg).toMatch(/<title>Cache cold<\/title>/)
})

test('the alt texts say what the pictures show', async () => {
  const tile: Tile = { id: 'hit', label: 'Cache hit', value: '84.0%', series: [0.8, 0.9] }
  expect(sparkAlt(tile)).toBe('Cache hit over the last 2 turns, latest 84.0%')
  expect(clockAlt(clock())).toBe('Cache expiry: warm, 30 min left of 60. The last 5 min are the compact window.')
  expect(clockAlt(clock({ zone: 'cold', remainingMs: 0 }))).toBe('Cache expiry: cold, the cache has expired.')
})

test('the tooltip and the alt text give the same minutes left', async () => {
  const c = clock({ remainingMs: 42.6 * MIN })
  expect(clockSvg(c)).toMatch(/<title>42 min of cache left<\/title>/)
  expect(clockAlt(c)).toBe('Cache expiry: warm, 42 min left of 60. The last 5 min are the compact window.')
})

test('the compact window zone has the marker, the window fill and its own alt text', async () => {
  const c = clock({ zone: 'window', remainingMs: 4 * MIN })
  const svg = clockSvg(c)
  expect(svg).toMatch(/class="mk"/)
  expect(svg).toMatch(/class="win"/)
  expect(svg).toMatch(/<title>4 min of cache left<\/title>/)
  expect(clockAlt(c)).toBe('Cache expiry: in the compact window, 4 min left of 60. The last 5 min are the compact window.')
})

test('an unknown clock has no fill and no marker, and says so', async () => {
  const c = clock({ zone: 'unknown', remainingMs: 0 })
  const svg = clockSvg(c)
  expect(svg).not.toMatch(/class="ok"/)
  expect(svg).not.toMatch(/class="win"/)
  expect(svg).not.toMatch(/class="mk"/)
  expect(svg).toMatch(/<title>Cache state unknown<\/title>/)
  expect(clockAlt(c)).toBe('Cache expiry: unknown until the next reply.')
})

test('an empty or single-point sparkline draws without NaN or throwing', async () => {
  expect(() => sparkSvg([])).not.toThrow()
  expect(/NaN|Infinity/.test(sparkSvg([]))).toBe(false)
  const one = sparkSvg([3])
  expect(/NaN|Infinity/.test(one)).toBe(false)
  expect(/points="[\d.]+,[\d.]+"/.test(one)).toBe(true)
})

test('under a minute the tooltip and alt text say "<1 min", as the panel header does', async () => {
  const c = clock({ zone: 'window', remainingMs: 30_000 })
  expect(clockSvg(c)).toMatch(/<title><1 min of cache left<\/title>/)
  expect(clockAlt(c)).toMatch(/<1 min left of 60/)
})
