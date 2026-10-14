# Panel Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild the cost & cache panel with stat tiles and sparklines, a cache clock, and hints that carry Compact now / Snooze 10 min / Not this session buttons, on the terminal and the desktop app.

**Architecture:** A pure `model.ts` turns `PanelState` into tiles, a clock and ranked hints. `panel-view.tsx` draws them with `Box`/`Text`/`Button` on both surfaces, and with `Svg` graphics where the surface has `Svg` (desktop). `register.tsx` composes the pane and owns state.

**Tech Stack:** Claude Code plugin hooks module (TypeScript, JSX against the global `h`), tests via `claude plugin test`.

**Spec:** `docs/superpowers/specs/2026-10-14-panel-redesign-design.md`

## Global Constraints

- Works on the terminal and the desktop app. Only elements both tables have, plus `Svg` where `'Svg' in els`. No `Raster`, no `Image`.
- Spacing with `gap` and `'xs'..'xl'` tokens, never raw cell counts. Numbers use `tabular`. Text bars use `mono`.
- `report.ts` (the text fallback) is not touched.
- No new dependencies. No commits and no push: the user approves the result first. Steps end in a test run, not a commit.
- Commands run from the repo root: `claude plugin validate plugin/compactly`, `claude plugin test plugin/compactly`. Baseline: 42 tests pass.
- Tests loop over `['terminal', 'desktop']`; the kit checks structure, not paint.
- The spec's `armedAt` is stored as `compactAt` (the time the pre-expiry timer fires): Task 6 fixes the spec.

## Review Focus

- State from before the change (hot reload) has no `snoozed` or `compactAt`: hints and the panel must still work. (Task 1 test.)
- Cache state unknown (tokens known, no turn yet): no bar, no crash, the "Next:" line still shows when armed. (Task 5 test.)
- 5-minute TTL: the compact window is 1 minute and the timer fires at 4 minutes, matching `beforeExpiryMs`. (Task 2 test.)
- Fewer than 2 turns: tiles show the value with no sparkline on both surfaces. (Task 4 and 5 tests.)
- A narrow pane (40 columns) still draws every section. (Task 4 test.)

---

### Task 1: State fields and snoozable hints

**Files:**
- Modify: `plugin/compactly/types/index.d.ts` (the `PanelState` type, after `unrated?: Unrated`)
- Modify: `plugin/compactly/hooks/hints.ts`
- Create: `plugin/compactly/tests/model.test.ts`

**Interfaces:**
- Produces: `PanelState.snoozed?: Record<string, number>`, `PanelState.compactAt?: number`; `SNOOZE_MS: number`; `compactCost(tokens: number, p: Price): number`; `hints()` drops a hint while `now < snoozed[id]`.

- [ ] **Step 1: Write the failing test**

Create `plugin/compactly/tests/model.test.ts`:

```ts
import { expect, test } from 'claude-code/testing'

import type { PanelState } from '../types'
import { hints, SNOOZE_MS } from '../hooks/hints'

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
```

- [ ] **Step 2: Run to verify it fails**

Run: `claude plugin test plugin/compactly`
Expected: FAIL: `SNOOZE_MS` is not exported from `../hooks/hints`.

- [ ] **Step 3: Implement**

In `types/index.d.ts`, after the line `unrated?: Unrated`, add:

```ts
  /** Hint ids hidden until the given $.clock.now() time. Absent in state from before snoozing existed. */
  snoozed?: Record<string, number>
  /** When the pre-expiry compaction will run, in $.clock.now() milliseconds; absent when none is armed. */
  compactAt?: number
```

In `hooks/hints.ts`, change the pricing import and add the two exports after `HORIZON`:

```ts
import { cheaperModel, kTokens, priceOf, usd, writePrice } from './pricing'
import type { Price } from './pricing'
```

```ts
/** How long "Snooze" hides a hint. */
export const SNOOZE_MS = 10 * 60_000

/** What a handoff compaction costs now: the summarizer reads the context from cache and writes a short summary. */
export const compactCost = (tokens: number, p: Price) => (tokens * p.read) / 1e6 + (SUMMARY_TOKENS * p.output) / 1e6
```

Replace `const compactNow = carry + (SUMMARY_TOKENS * p.output) / 1e6` with `const compactNow = compactCost(s.tokens, p)`.

Replace the last line of `hints()`:

```ts
  return out.filter(h => !s.dismissed.includes(h.id) && (s.snoozed?.[h.id] ?? 0) <= now).sort((a, b) => b.stake - a.stake)
```

- [ ] **Step 4: Run to verify it passes**

Run: `claude plugin test plugin/compactly`
Expected: PASS, 45 tests (42 + 3).

---

### Task 2: The panel model

**Files:**
- Create: `plugin/compactly/hooks/model.ts`
- Modify: `plugin/compactly/tests/model.test.ts`

**Interfaces:**
- Consumes: `hints`, `cacheState`, `hitRatio`, `compactCost`, `Hint` (hints.ts); `priceOf`, `writePrice`, `usd` (pricing.ts); `state()` helper (model.test.ts).
- Produces:
  - `ttlMsOf(ttl: string): number`, `windowMsOf(ttl: string): number`
  - `type Tile = { id: 'session' | 'hit' | 'carry' | 'rebuild'; label: string; value: string; series: number[] }`
  - `type Zone = 'unknown' | 'warm' | 'window' | 'cold'`
  - `type Clock = { zone: Zone; remainingMs: number; ttlMs: number; windowMs: number; compactInMs?: number; saves?: number }`
  - `type PanelModel = { tiles: Tile[]; clock: Clock; hints: Hint[] }`
  - `panelModel(s: PanelState, now: number, ttl: string): PanelModel | undefined`
  - `clockShares(c: Clock): { window: number; warm: number; track: number }` (shares of the TTL, sum 1)

- [ ] **Step 1: Write the failing tests**

Append to `tests/model.test.ts` (add `import { clockShares, panelModel, windowMsOf } from '../hooks/model'` and `import type { TurnRow } from '../types'` at the top):

```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `claude plugin test plugin/compactly`
Expected: FAIL: cannot resolve `../hooks/model`.

- [ ] **Step 3: Implement `hooks/model.ts`**

```ts
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

const hitOf = (t: TurnRow) => (t.readTokens + t.writeTokens === 0 ? 0 : t.readTokens / (t.readTokens + t.writeTokens))

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
      { id: 'hit', label: 'Cache hit', value: ratio === undefined ? '–' : `${(ratio * 100).toFixed(1)}%`, series: s.turns.map(hitOf) },
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
```

- [ ] **Step 4: Run to verify it passes**

Run: `claude plugin test plugin/compactly`
Expected: PASS, 52 tests.

---

### Task 3: The Svg graphics

**Files:**
- Create: `plugin/compactly/hooks/svg.ts`
- Create: `plugin/compactly/tests/svg.test.ts`

**Interfaces:**
- Consumes: `SERIES` (chart.ts), `Clock`, `Tile`, `clockShares` (model.ts).
- Produces: `sparkSvg(series: readonly number[]): string`, `sparkAlt(t: Tile): string`, `clockSvg(c: Clock): string`, `clockAlt(c: Clock): string`.

- [ ] **Step 1: Write the failing tests**

Create `tests/svg.test.ts`:

```ts
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
```

- [ ] **Step 2: Run to verify it fails**

Run: `claude plugin test plugin/compactly`
Expected: FAIL: cannot resolve `../hooks/svg`.

- [ ] **Step 3: Implement `hooks/svg.ts`**

```ts
import { SERIES } from './chart'
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

const mins = (ms: number) => Math.round(ms / 60_000)

/** The cache bar: window zone then warm zone filled up to what remains, a marker at "now", the rest drained. */
export const clockSvg = (c: Clock, w = 560, h = 36) => {
  const sh = clockShares(c)
  const [winW, warmW] = [sh.window * w, sh.warm * w]
  const bar = { y: 6, h: 14 }
  const rect = (cls: string, x: number, width: number) =>
    width <= 0 ? '' : `<rect class="${cls}" x="${x.toFixed(1)}" y="${bar.y}" width="${width.toFixed(1)}" height="${bar.h}"/>`
  const end = winW + warmW
  const isLive = c.zone === 'warm' || c.zone === 'window'
  const tip = c.zone === 'cold' ? 'Cache cold' : c.zone === 'unknown' ? 'Cache state unknown' : `${Math.floor(c.remainingMs / 60_000)} min of cache left`
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
      : `Cache expiry: ${c.zone === 'window' ? 'in the compact window' : 'warm'}, ${mins(c.remainingMs)} min left of ${mins(c.ttlMs)}. The last ${mins(c.windowMs)} min are the compact window.`
```

Note: the alt test for the warm case expects `warm, 30 min left of 60` and the title test expects `30 min of cache left`: both match the code above.

- [ ] **Step 4: Run to verify it passes**

Run: `claude plugin test plugin/compactly`
Expected: PASS, 56 tests.

---

### Task 4: Draw the panel with the new views

**Files:**
- Modify: `plugin/compactly/hooks/chart.ts` (add `blocks`)
- Create: `plugin/compactly/hooks/panel-view.tsx`
- Modify: `plugin/compactly/hooks/register.tsx`
- Modify: `plugin/compactly/tests/panel.test.ts`

**Interfaces:**
- Consumes: `panelModel`, `Clock`, `Tile`, `clockShares`, `ttlMsOf`, `windowMsOf` (model.ts); `SNOOZE_MS`, `Hint`, `minutes` (hints.ts); svg.ts functions; `ElementTable` from `claude-code`.
- Produces:
  - `blocks(series: readonly number[], width: number): string` (chart.ts)
  - `LEVEL`, `tilesView(els, tiles)`, `clockView(els, c, t: { tokens: string; rebuild: string }, cols)`, `hintView(els, hint, act: { compact: () => void; snooze: () => void; dismiss: () => void }, hasKeys: boolean)` (panel-view.tsx). They are plain functions returning trees, called as `{tilesView(...)}`, never used as `<Component/>`: a tree may only hold the surface's own elements.

- [ ] **Step 1: Write the failing tests**

In `tests/panel.test.ts`:

1. Let `reply` take a turn id: change its signature to `const reply = async ($: Parameters<TestBody>[0], id = 't1') => {`, and use `id` for both `turnId: 't1'` occurrences.
2. Add below `PROPS`: `const NARROW = { title: 'Cost & cache', isFocused: false, bodyColumns: 40, placement: 'dock' } as never`.
3. Replace the first test's title with `'the panel draws on the terminal and the desktop: the desktop gets the SVG chart, the terminal a sparkline'` and its loop with `for (const surface of ['terminal', 'desktop'] as const)`. In the second test change `surface: 'vscode'` to `surface: 'desktop'`.
4. Replace the Compact-button press in the second test only if its key changes: keys stay `compact-expiring`.
5. Append:

```ts
test('tiles and the cache clock draw on both surfaces; only the desktop gets Svg graphics', async ($, on) => {
  world(on)
  await reply($, 't1')
  await reply($, 't2')
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface, props: PROPS })
    for (const label of ['Session cost', 'Cache hit', 'Re-read per turn', 'Rebuild if cold']) {
      expect(await ui.find({ type: 'Text', text: label })).toBeDefined()
    }
    expect(await ui.find({ type: 'Text', text: /expires in 60 min/ })).toBeDefined()
    // four tile sparklines, the clock and the cost chart
    expect(await ui.findAll({ type: 'Svg' })).toHaveLength(surface === 'desktop' ? 6 : 0)
    await ui.unmount()
  }
})

test('with one turn the tiles show their value and no sparkline', async ($, on) => {
  world(on)
  await reply($)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: PROPS })
  expect(await ui.find({ type: 'Text', text: '$12.4' })).toBeDefined()
  // only the clock and the cost chart
  expect(await ui.findAll({ type: 'Svg' })).toHaveLength(2)
})

test('a narrow pane still draws the tiles, the clock and the hints', async ($, on) => {
  world(on)
  await reply($)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface, props: NARROW })
    expect(await ui.find({ type: 'Text', text: 'Cache hit' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /expires in 60 min/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Large context/ })).toBeDefined()
    await ui.unmount()
  }
})

test('the top hint carries the hotkeys 1, 2 and 3; lower hints carry none', async ($, on) => {
  world(on)
  await reply($)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: PROPS })
  expect((await ui.find({ type: 'Button', key: 'compact-large' }))?.props.hotkey).toBe('1')
  expect((await ui.find({ type: 'Button', key: 'snooze-large' }))?.props.hotkey).toBe('2')
  expect((await ui.find({ type: 'Button', key: 'dismiss-large' }))?.props.hotkey).toBe('3')
  expect((await ui.find({ type: 'Button', key: 'snooze-model' }))).toBeDefined()
  expect((await ui.find({ type: 'Button', key: 'snooze-model' }))?.props.hotkey).toBeUndefined()
})

test('snoozing a hint hides it for 10 minutes, then it returns', async ($, on) => {
  const { clock } = world(on)
  await reply($)
  const mount = () => $.ui.mount({ ...PANE, surface: 'terminal', props: PROPS })
  let ui = await mount()
  await ui.press({ key: 'snooze-large' })
  expect(await ui.find({ type: 'Text', text: /Large context/ })).toBeUndefined()
  await ui.unmount()
  await clock.advance(9 * 60_000)
  ui = await mount()
  expect(await ui.find({ type: 'Text', text: /Large context/ })).toBeUndefined()
  await ui.unmount()
  await clock.advance(60_000)
  ui = await mount()
  expect(await ui.find({ type: 'Text', text: /Large context/ })).toBeDefined()
})

test('the header Compact button compacts with the handoff prompt', async ($, on) => {
  const { compacts } = world(on)
  await reply($)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: PROPS })
  await ui.press({ key: 'compact-header' })
  expect(compacts).toHaveLength(1)
  expect(compacts[0]).toMatch(/Open work and follow-ups/)
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `claude plugin test plugin/compactly`
Expected: FAIL in the new tests (no `Svg` tile sparklines, no `snooze-large`, no `compact-header`); the rest pass.

- [ ] **Step 3: Implement**

**3a. `hooks/chart.ts`**: replace `sparkline` with a series version plus the old signature:

```ts
/** One block per value, tallest at the series' own maximum. */
export const blocks = (series: readonly number[], width: number) => {
  const shown = series.slice(-Math.max(1, width))
  const max = Math.max(...shown, 1e-9)
  return shown.map(v => BLOCKS[Math.min(7, Math.round((v / max) * 7))]).join('')
}

/** The terminal's stand-in for the chart: one block per turn, height by cost. */
export const sparkline = (turns: readonly TurnRow[], width: number) => blocks(turns.map(total), width)
```

**3b. Create `hooks/panel-view.tsx`:**

```tsx
import type { ElementTable } from 'claude-code'

import { blocks } from './chart'
import { minutes } from './hints'
import type { Hint } from './hints'
import { clockShares } from './model'
import type { Clock, Tile } from './model'
import { usd } from './pricing'
import { clockAlt, clockSvg, sparkAlt, sparkSvg } from './svg'

export const LEVEL = {
  critical: { icon: '▲', color: 'error', word: 'Act now' },
  warning: { icon: '◆', color: 'warning', word: 'Worth it' },
  info: { icon: '●', color: 'suggestion', word: 'Tip' },
} as const

/** Bordered stat tiles that wrap with the pane's width; a sparkline under each value once there are two turns. */
export const tilesView = (els: ElementTable, tiles: readonly Tile[]) => {
  const { Box, Text } = els
  const Svg = 'Svg' in els ? els.Svg : undefined
  const spark = (t: Tile) =>
    t.series.length < 2 ? (
      <Text dimColor>–</Text>
    ) : Svg !== undefined ? (
      <Svg source={sparkSvg(t.series)} alt={sparkAlt(t)} />
    ) : (
      <Text color="claude" mono>{blocks(t.series, 14)}</Text>
    )
  return (
    <Box flexDirection="row" flexWrap="wrap" gap="sm" marginTop={1}>
      {tiles.map(t => (
        <Box key={`tile-${t.id}`} flexDirection="column" borderStyle="round" paddingX={1}>
          <Text dimColor>{t.label}</Text>
          <Text bold tabular>{t.value}</Text>
          {spark(t)}
        </Box>
      ))}
    </Box>
  )
}

export type ClockText = { tokens: string; rebuild: string }

/** The cache clock: state line, the draining bar by zone, a legend, and the armed idle compaction when there is one. */
export const clockView = (els: ElementTable, c: Clock, t: ClockText, cols: number) => {
  const { Box, Text } = els
  const Svg = 'Svg' in els ? els.Svg : undefined
  const sh = clockShares(c)
  const cells = Math.max(10, Math.min(40, cols - 24))
  const win = Math.round(sh.window * cells)
  const warm = Math.round((sh.window + sh.warm) * cells) - win
  const status =
    c.zone === 'unknown' ? (
      <Text dimColor>○ Cache state unknown until the next reply</Text>
    ) : c.zone === 'cold' ? (
      <Text>
        <Text color="warning">○ Cold</Text>
        <Text>  the next message re-writes {t.tokens}</Text>
        <Text dimColor>  · {t.rebuild}</Text>
      </Text>
    ) : (
      <Text>
        <Text color={c.zone === 'window' ? 'warning' : 'success'}>● Warm</Text>
        <Text>  expires in {minutes(c.remainingMs)}</Text>
        <Text dimColor>  · rebuilding later costs {t.rebuild}</Text>
      </Text>
    )
  const next =
    c.compactInMs === undefined
      ? undefined
      : `Next: auto-compact in ${minutes(c.compactInMs)}${c.saves !== undefined && c.saves > 0 ? ` (saves ≈ ${usd(c.saves)})` : ''}`
  return (
    <Box flexDirection="column" marginTop={1}>
      {status}
      {c.zone !== 'unknown' &&
        (Svg !== undefined ? (
          <Svg source={clockSvg(c)} alt={clockAlt(c)} isInteractive />
        ) : (
          <Text>
            <Text color="warning" mono>{'█'.repeat(win)}</Text>
            <Text color="success" mono>{'█'.repeat(warm)}</Text>
            <Text dimColor mono>{'░'.repeat(cells - win - warm)}</Text>
          </Text>
        ))}
      <Text dimColor>● warm  ◆ last {minutes(c.windowMs)} before expiry: auto-compact  ○ cold</Text>
      {next !== undefined && <Text>{next}</Text>}
    </Box>
  )
}

export type HintActions = { compact: () => void; snooze: () => void; dismiss: () => void }

/** One hint with its three actions. Only the top hint takes the hotkeys 1, 2, 3: two buttons on a hotkey, the later wins. */
export const hintView = (els: ElementTable, hint: Hint, act: HintActions, hasKeys: boolean) => {
  const { Box, Text, Button } = els
  const lv = LEVEL[hint.level]
  const key = (digit: string) => (hasKeys ? { hotkey: digit } : {})
  return (
    <Box key={`hint-${hint.id}`} flexDirection="column" marginTop={1}>
      <Text>
        <Text color={lv.color}>{lv.icon} {lv.word}</Text>
        <Text bold>  {hint.title}</Text>
        <Text dimColor>  ~{usd(hint.stake)} at stake</Text>
      </Text>
      <Text dimColor wrap="wrap">  {hint.detail}</Text>
      <Box flexDirection="row" marginLeft={2} gap="sm">
        {hint.action === 'compact' && (
          <Button key={`compact-${hint.id}`} variant="primary" label="Compact now" {...key('1')} onPress={act.compact} />
        )}
        <Button key={`snooze-${hint.id}`} label="Snooze 10 min" {...key('2')} onPress={act.snooze} />
        <Button key={`dismiss-${hint.id}`} label="Not this session" {...key('3')} onPress={act.dismiss} />
      </Box>
    </Box>
  )
}
```

**3c. `hooks/register.tsx`:**

1. Imports. Remove `hints, hitRatio` from the `./hints` import and add `SNOOZE_MS`; keep `cacheState, minutes` and the `Hint` type import. Add:

```ts
import { panelModel, ttlMsOf, windowMsOf } from './model'
import { clockView, hintView, tilesView } from './panel-view'
```

2. Delete the local `const ttlMsOf = ...` line and the `LEVEL` const (both moved), and replace `beforeExpiryMs`:

```ts
const beforeExpiryMs = (ttl: string) => ttlMsOf(ttl) - windowMsOf(ttl)
```

3. Replace the whole block from `on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {` to its closing `})` (the last hook before `}` that ends `register`) with:

```tsx
  on('ui.render', { component: 'Pane', requestId: PANE }, async ($, e) => {
    const els = $.ui.resolve(e)
    const { Box, Text, Button } = els
    const Svg = 'Svg' in els ? els.Svg : undefined
    const [s, now] = await Promise.all([read($, panel), $.clock.now()])
    const m = panelModel(s, now, ttl)
    const p = priceOf(s.model)
    const cols = e.props.bodyColumns

    if (m === undefined || p === undefined) {
      return (
        <Box flexDirection="column" paddingX={1}>
          <Text bold>Cost & cache</Text>
          <Text dimColor>Send a message: the panel fills in after the first reply.</Text>
        </Box>
      )
    }

    const share = s.window > 0 ? s.tokens / s.window : 0
    const fill = meter(share, Math.max(10, Math.min(30, cols - 30)))
    const fillColor = share >= 0.8 ? 'error' : share >= 0.5 ? 'warning' : 'claude'
    const rebuild = (s.tokens * writePrice(p, ttl)) / 1e6
    const last = s.turns.at(-1)
    const v = s.saved
    const perTurn = (v.removed * p.read) / 1e6
    const turnsLeft = payback(v, perTurn)
    const total = lifetime(v)
    const lv = level(total)
    const progress = meter(lv.next === undefined ? 1 : (total - lv.at) / (lv.next.usd - lv.at), Math.max(10, Math.min(30, cols - 30)))

    const actions = (hint: Hint) => ({
      compact: () => void compactAndLog($, ttl),
      snooze: () =>
        void $.clock.now().then(at => update($, panel, st => ({ ...st, snoozed: { ...st.snoozed, [hint.id]: at + SNOOZE_MS } }))),
      dismiss: () => void update($, panel, st => ({ ...st, dismissed: [...st.dismissed, hint.id] })),
    })

    return (
      <Box flexDirection="column" paddingX={1}>
        <Box flexDirection="row" justifyContent="space-between">
          <Text>
            <Text bold>Cost & cache</Text>
            <Text dimColor>  {s.model} · {ttl} cache</Text>
          </Text>
          <Button key="compact-header" label="Compact" onPress={() => void compactAndLog($, ttl)} />
        </Box>

        {tilesView(els, m.tiles)}
        {clockView(els, m.clock, { tokens: kTokens(s.tokens), rebuild: usd(rebuild) }, cols)}

        <Text>
          <Text dimColor>Context  </Text>
          <Text color={fillColor}>{fill.filled}</Text>
          <Text dimColor>{fill.track}</Text>
          <Text>  {kTokens(s.tokens)} / {kTokens(s.window)} ({Math.round(share * 100)}%)</Text>
        </Text>

        <Box flexDirection="column" marginTop={1}>
          <Text bold>Saved by compacting</Text>
          {v.compactions === 0 ? (
            <Text dimColor>Nothing yet this session. Compact at a task boundary to start saving.</Text>
          ) : (
            <Text>
              <Text bold color={net(v) >= 0 ? 'success' : 'warning'}>{signed(net(v))}</Text>
              <Text> this session</Text>
              <Text dimColor>
                {'  '}· {v.compactions} compaction{v.compactions === 1 ? '' : 's'} · {kTokens(v.removed)} less to re-read, ~{usd(perTurn)} per turn
              </Text>
            </Text>
          )}
          {turnsLeft > 0 && <Text dimColor>  The compaction pays for itself in {turnsLeft} more turn{turnsLeft === 1 ? '' : 's'}.</Text>}
          <Text>
            <Text color="claude">★ Level {lv.rank}: {lv.name}</Text>
            <Text dimColor>  all time {signed(total)}</Text>
          </Text>
          {lv.next !== undefined && (
            <Text>
              <Text color="claude">{progress.filled}</Text>
              <Text dimColor>{progress.track}</Text>
              <Text dimColor>  {usd(lv.next.usd - total)} to {lv.next.name}</Text>
            </Text>
          )}
        </Box>

        {s.turns.length > 0 && (
          <Box flexDirection="column" marginTop={1}>
            <Text bold>Cost per turn</Text>
            {Svg !== undefined ? (
              <Svg source={costChart(s.turns)} alt={chartAlt(s.turns)} isInteractive />
            ) : (
              <Text color="claude">{sparkline(s.turns, Math.max(10, cols - 4))}</Text>
            )}
            {last !== undefined && (
              <Text dimColor wrap="wrap">
                Last turn: {SERIES.map(x => `${x.label.toLowerCase()} ${usd(last[x.key])}`).join(' · ')}
              </Text>
            )}
          </Box>
        )}

        <Box flexDirection="column" marginTop={1}>
          <Text bold>Hints</Text>
          {m.hints.length === 0 ? (
            <Text>
              <Text color="success">✓ Nothing to act on.</Text>
              <Text dimColor>  The cache is doing its job.</Text>
            </Text>
          ) : (
            m.hints.map((hint, i) => hintView(els, hint, actions(hint), i === 0))
          )}
        </Box>
      </Box>
    )
  })
```

If the type checker objects to `'Svg' in els ? els.Svg : undefined`, use the old form `const hasSvg = 'Svg' in els && els.Svg !== undefined` with `<els.Svg …/>` in the same places.

4. Remove imports `register.tsx` no longer uses. Run `grep -c "hitRatio\|hints(\|<Svg\|writePrice\|kTokens" plugin/compactly/hooks/register.tsx` and delete any name from an import line that no longer appears in the body.

- [ ] **Step 4: Run to verify it passes**

Run: `claude plugin validate plugin/compactly && claude plugin test plugin/compactly`
Expected: validate passes; tests PASS, 62 (56 + 6 new). The two earlier panel assertions on `/● Warm/` and `$12.4` pass unchanged.

---

### Task 5: Arm and clear the idle-compaction marker

**Files:**
- Modify: `plugin/compactly/hooks/register.tsx`
- Modify: `plugin/compactly/tests/boundary.test.ts`

**Interfaces:**
- Consumes: `PanelState.compactAt`, `beforeExpiryMs`, `update`, `panel`.
- Produces: `disarm($)` (clears the timer and `compactAt`); `compactAt = now + beforeExpiryMs(ttl)` is set when the timer is armed in `turn.complete`.

- [ ] **Step 1: Write the failing test**

In `tests/boundary.test.ts` add above the first test:

```ts
const PANE = { plugin: 'compactly', component: 'Pane', requestId: 'cost-panel' } as const
const PROPS = { title: 'Cost & cache', isFocused: false, bodyColumns: 90, placement: 'dock' } as never
```

and append:

```ts
test('the panel announces the armed idle compaction on both surfaces, and drops it when a prompt cancels it', async ($, on) => {
  world(on, 420_000)
  await turn($, ['git commit -m x'])
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface, props: PROPS })
    expect(await ui.find({ type: 'Text', text: /Next: auto-compact in 55 min \(saves ≈ \$3\.9/ })).toBeDefined()
    await ui.unmount()
  }
  await $.turn.start({ text: 'next', turnId: 't2' })
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: PROPS })
  expect(await ui.find({ type: 'Text', text: /Next: auto-compact/ })).toBeUndefined()
})

test('the announcement goes when the idle compaction has run', async ($, on) => {
  const w = world(on, 420_000)
  await turn($, ['git commit -m x'])
  await w.clock.advance(55 * 60_000)
  expect(w.compacts).toHaveLength(1)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: PROPS })
  expect(await ui.find({ type: 'Text', text: /Next: auto-compact/ })).toBeUndefined()
})
```

- [ ] **Step 2: Run to verify it fails**

Run: `claude plugin test plugin/compactly`
Expected: FAIL: no `Next: auto-compact` text (nothing sets `compactAt`).

- [ ] **Step 3: Implement in `register.tsx`**

1. After the `cancel` const add:

```ts
  // The panel announces the armed compaction: drop that with the timer.
  const disarm = async ($: EngineInterface) => {
    cancel()
    await update($, panel, s => (s.compactAt === undefined ? s : { ...s, compactAt: undefined }))
  }
```

2. `turn.start` hook becomes:

```ts
  on('turn.start', async ($, e, next) => {
    isTurnRunning = true
    await disarm($)
    return next(e)
  })
```

3. In `prompt.submit`, replace `if (!e.text.trimStart().startsWith('/')) cancel()` with `if (!e.text.trimStart().startsWith('/')) await disarm($)`.

4. In `turn.complete`'s judge branch, replace `cancel()` with `await disarm($)`, make the timer callback clear the marker first, and set it after arming:

```ts
      if (judge !== undefined && !isSdk) {
        await disarm($)
        const timer = $.clock.after(beforeExpiryMs(ttl), () => {
          cancelTimer = undefined
          void update($, panel, st => ({ ...st, compactAt: undefined }))
          if (isTurnRunning) return
          // (the rest of the callback is unchanged)
        })
        cancelTimer = () => timer.cancel()
        await update($, panel, st => ({ ...st, compactAt: now + beforeExpiryMs(ttl) }))
        return result
      }
```

5. In `settle`, clear the marker with the boundary: in the object it returns add `compactAt: undefined,` after `bigOutput: undefined,`.

- [ ] **Step 4: Run to verify it passes**

Run: `claude plugin validate plugin/compactly && claude plugin test plugin/compactly`
Expected: PASS, 64 tests. The `$3.9` in the first test is the saves figure `$4.20 − $0.285 = $3.915`, which `usd` prints as `$3.92`; the regex `\$3\.9` matches it.

---

### Task 6: Docs, spec fixes and the final check

**Files:**
- Modify: `plugin/compactly/README.md` (the "Cost & cache panel" bullet)
- Modify: `docs/superpowers/specs/2026-10-14-panel-redesign-design.md`

- [ ] **Step 1: Update the plugin README bullet**

Replace the sentence "It is a window with **Compact** and **Dismiss** buttons. Where no window can be drawn, the command replies with the same report as text." with:

```
  It is a window with stat tiles, a cache clock and ranked hints; each hint has **Compact now**,
  **Snooze 10 min** and **Not this session** buttons (hotkeys 1, 2, 3 on the top hint). Where no
  window can be drawn, the command replies with the same report as text.
```

Leave the top-level README and `images/` alone: the screenshots are paused until the build is verified live.

- [ ] **Step 2: Fix the spec to match the build**

In the spec, replace `armedAt` with `compactAt` (state field: the time the timer fires), replace "tiles 2×2, then one column" with "tiles wrap with the pane's width (`flexWrap`)", and replace the first three lines of the status paragraph with `Status: approved design; built per docs/superpowers/plans/2026-10-14-panel-redesign.md. Uncommitted.`

- [ ] **Step 3: Full check**

Run: `claude plugin validate plugin/compactly && claude plugin test plugin/compactly`
Expected: validate passes, 64 tests pass.

- [ ] **Step 4: Live checks (the user runs these; the kit cannot see paint)**

1. Terminal, in `/tui fullscreen`: `/cost-panel`; tiles wrap, the clock bar is colored by zone, hotkeys `1/2/3` act on the top hint (focus the pane with a click or `ctrl+x tab` first).
2. Desktop app (Code tab): same. Check the two open points from the docs: do the tile borders draw, and do the Svg sparkline and clock bar draw crisply. If borders don't draw, tiles keep their content, and the plan stands; if an Svg fails to draw, the engine's debug log has `ui.render (Pane): a hook returned a tree that does not validate`.
3. Report the result for each surface plainly, with a screenshot if anything looks off.
4. After both pass: update `images/` and the top README text (separate task, paused until now).

## Self-review

- **Spec coverage:** tiles with sparklines (Tasks 2, 3, 4), clock with zones and the armed line (2, 3, 4, 5), hint actions with hotkeys and snooze (1, 4), header Compact (4), desktop/terminal split by `Svg` presence (3, 4), narrow panes (4), old-state compatibility (1), text fallback untouched (no task touches `report.ts`), live checks (6).
- **Placeholders:** none; the one "rest of the callback is unchanged" in Task 5 points at lines the engineer is not editing.
- **Types:** `Tile`, `Clock`, `PanelModel`, `panelModel`, `clockShares`, `ttlMsOf`, `windowMsOf` are defined in Task 2 and used with the same names in Tasks 3, 4, 5; `compactAt` is defined in Task 1 and read in Task 2; button keys `compact-<id>`, `snooze-<id>`, `dismiss-<id>`, `compact-header` match between Task 4's tests and view.
- **Test count:** 42 → 45 (Task 1) → 52 (Task 2) → 56 (Task 3) → 62 (Task 4) → 64 (Task 5). The counts are expectations; report the real numbers.
