import { expect, test } from 'claude-code/testing'

import type { PanelState, TurnRow } from '../types'
import { hints, SNOOZE_MS } from '../hooks/hints'
import { clockShares, panelModel, windowMsOf } from '../hooks/model'

// A 420K-token Opus 5 session whose cache was last refreshed at time 0.
export const state = (over: Partial<PanelState> = {}): PanelState => ({
  turns: [],
  dismissed: [],
  tick: 0,
  tokens: 420_000,
  window: 1_000_000,
  sessionUsd: 12.4,
  model: 'claude-opus-5',
  lastActivityAt: 0,
  saved: { gross: 0, spent: 0, removed: 0, compactions: 0, isFresh: false, pastUsd: 0, pastCompactions: 0 },
  ...over,
})

const ids = (s: PanelState, now: number) => hints(s, now, '1h').map(h => h.id)

test('a snoozed hint is hidden until its time, then returns', async () => {
  const s = state({ snoozed: { large: SNOOZE_MS } })
  expect(ids(s, 0)).not.toContain('large')
  expect(ids(s, SNOOZE_MS - 1)).not.toContain('large')
  expect(ids(s, SNOOZE_MS)).toContain('large')
})

test('state from before the change, with no snoozed map, still lists its hints', async () => {
  expect(ids(state(), 0)).toContain('large')
})

test('a dismissed hint stays hidden whatever the clock says', async () => {
  expect(ids(state({ dismissed: ['large'] }), 99 * SNOOZE_MS)).not.toContain('large')
})

const turn = (over: Partial<TurnRow> = {}): TurnRow => ({
  at: 1, model: 'claude-opus-5', ctx: 100_000, readTokens: 90_000, writeTokens: 10_000,
  read: 0.045, write: 0.1, output: 0.01, input: 0, ...over,
})

const MIN = 60_000

test('the model has no tiles for an unpriced model or an empty context', async () => {
  expect(panelModel(state({ model: 'mystery' }), 0, '1h')).toBeUndefined()
  expect(panelModel(state({ tokens: 0 }), 0, '1h')).toBeUndefined()
})

test('four tiles in order, with a series per turn', async () => {
  const m = panelModel(state({ turns: [turn(), turn({ at: 2, readTokens: 100_000, writeTokens: 0 })] }), 0, '1h')!
  expect(m.tiles.map(t => t.label)).toEqual(['Session cost', 'Cache hit', 'Re-read per turn', 'Rebuild if cold'])
  expect(m.tiles.map(t => t.value)).toEqual(['$12.4', '95.0%', '$0.21', '$4.20'])
  const round = (xs: number[]) => xs.map(n => Number(n.toFixed(3)))
  expect(round(m.tiles[0]!.series)).toEqual([0.155, 0.31])
  expect(round(m.tiles[1]!.series)).toEqual([0.9, 1])
  expect(round(m.tiles[2]!.series)).toEqual([0.05, 0.05])
  expect(round(m.tiles[3]!.series)).toEqual([1, 1])
})

test('with no turns the tiles carry empty series', async () => {
  const m = panelModel(state(), 0, '1h')!
  expect(m.tiles.every(t => t.series.length === 0)).toBe(true)
  expect(m.tiles[1]!.value).toBe('–')
})

test('the clock zone follows the remaining time: warm, window, cold, unknown', async () => {
  const zone = (now: number, over: Partial<PanelState> = {}, ttl = '1h') => panelModel(state(over), now, ttl)!.clock.zone
  expect(zone(30 * MIN)).toBe('warm')
  expect(zone(55 * MIN)).toBe('window')
  expect(zone(61 * MIN)).toBe('cold')
  expect(zone(0, { lastActivityAt: undefined })).toBe('unknown')
})

test('the 5-minute cache has a 1-minute window', async () => {
  expect(windowMsOf('5m')).toBe(MIN)
  expect(windowMsOf('1h')).toBe(5 * MIN)
  const zone = (now: number) => panelModel(state(), now, '5m')!.clock.zone
  expect(zone(3 * MIN)).toBe('warm')
  expect(zone(4 * MIN)).toBe('window')
})

test('the clock says when the idle compaction runs and what it saves, only while armed', async () => {
  expect(panelModel(state(), 30 * MIN, '1h')!.clock.compactInMs).toBeUndefined()
  const c = panelModel(state({ compactAt: 55 * MIN }), 30 * MIN, '1h')!.clock
  expect(c.compactInMs).toBe(25 * MIN)
  // rebuild $4.20 less the handoff compaction, $0.21 to read and $0.075 to write the summary
  expect(c.saves! > 3.9 && c.saves! < 3.92).toBe(true)
})

test('clock shares add up to the whole TTL', async () => {
  const c = panelModel(state(), 30 * MIN, '1h')!.clock
  const sh = clockShares(c)
  expect(Math.abs(sh.window + sh.warm + sh.track - 1) < 1e-9).toBe(true)
  expect(Math.abs(sh.window - 1 / 12) < 1e-9).toBe(true)
  expect(Math.abs(sh.warm - 0.5 + 1 / 12) < 1e-9).toBe(true)
})

test('the cache-hit series skips a turn with no cache tokens instead of plotting a 0', async () => {
  const m = panelModel(state({ turns: [turn(), turn({ at: 2, readTokens: 0, writeTokens: 0 }), turn({ at: 3 })] }), 0, '1h')!
  const series = m.tiles[1]!.series
  expect(series).toHaveLength(2)
  expect(series).not.toContain(0)
})

test('the clock zone changes exactly at the window edge and at expiry', async () => {
  const zone = (now: number) => panelModel(state(), now, '1h')!.clock.zone
  expect(zone(55 * MIN - 1)).toBe('warm')
  expect(zone(55 * MIN)).toBe('window')
  expect(zone(55 * MIN + 1)).toBe('window')
  expect(zone(60 * MIN - 1)).toBe('window')
  expect(zone(60 * MIN)).toBe('cold')
})

test('with no cache timestamp the clock is unknown, with no remaining time and no NaN', async () => {
  const m = panelModel(state({ lastActivityAt: undefined }), 30 * MIN, '1h')!
  expect(m.clock.zone).toBe('unknown')
  expect(m.clock.remainingMs).toBe(0)
  expect(JSON.stringify(m)).not.toMatch(/NaN|Infinity/)
})

test('with no turns the model has placeholders and no NaN anywhere', async () => {
  const m = panelModel(state(), 0, '1h')!
  expect(m.tiles[1]!.value).toBe('–')
  expect(JSON.stringify(m)).not.toMatch(/NaN|Infinity/)
})
