import type { On } from 'claude-code'
import { expect, mock, test, type TestBody } from 'claude-code/testing'

const PANE = { plugin: 'compactly', component: 'Pane', requestId: 'cost-panel' } as const
// The kit fills the scroll and view handles a live pane carries.
const PROPS = { title: 'Cost & cache', isFocused: false, bodyColumns: 90, placement: 'dock' } as never
const NARROW = { title: 'Cost & cache', isFocused: false, bodyColumns: 40, placement: 'dock' } as never

// The engine beneath the plugin for a 420K-token Opus 5 session with a 1h cache.
const world = (on: On) => {
  const compacts: (string | undefined)[] = []
  const toasts: string[] = []
  const clock = mock.clock(on)
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens: 420_000, window: 1_000_000 }, rateLimits: [], cost: { usd: 12.4 } } }))
  on('session.model', () => ({ value: 'claude-opus-5' }))
  on('ui.toast', ($, e) => (toasts.push(e.text), { value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('ui.log', () => ({ value: undefined }))
  on('session.compact', ($, e) => {
    compacts.push(e.instructions)
    return { messages: [{ role: 'user', text: 'summary', toolUses: [] }] as never, tokensBefore: 420_000, tokensAfter: 20_000 }
  })
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  return { clock, compacts, toasts }
}

const reply = async ($: Parameters<TestBody>[0], id = 't1') => {
  await $.turn.start({ text: 'go', turnId: id })
  await $.turn.complete({
    answer: 'done', durationMs: 1, isAborted: false, turnId: id, reason: 'answer',
    usage: { input_tokens: 10, output_tokens: 800, cache_read_input_tokens: 400_000, cache_creation_input_tokens: 20_000, model: 'claude-opus-5' },
  })
}

test('the panel draws on the terminal and the desktop: the desktop gets the SVG chart, the terminal a sparkline', async ($, on) => {
  world(on)
  await reply($)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface, props: PROPS })
    expect(await ui.find({ type: 'Text', text: /● Warm/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /expires in 60 min/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: '$12.4' })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /95\.2%/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /Large context: 420K/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /claude-opus-5-5 reads the cache 60% cheaper/ })).toBeDefined()
    const svg = await ui.find({ type: 'Svg' })
    if (surface === 'terminal') expect(svg).toBeUndefined()
    else expect(svg).toBeDefined()
    await ui.unmount()
  }
})

test('near expiry the top hint says so, and its button compacts with the handoff prompt', async ($, on) => {
  const { clock, compacts } = world(on)
  await reply($)
  await clock.advance(55 * 60_000)
  const ui = await $.ui.mount({ ...PANE, surface: 'desktop', props: PROPS })
  expect(await ui.find({ type: 'Text', text: /Cache expires in 5 min/ })).toBeDefined()
  await ui.press({ key: 'compact-expiring' })
  expect(compacts).toHaveLength(1)
  expect(compacts[0]).toMatch(/Open work and follow-ups/)
})

test('past the TTL the cache reads cold with the rebuild cost', async ($, on) => {
  const { clock } = world(on)
  await reply($)
  await clock.advance(61 * 60_000)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: PROPS })
  expect(await ui.find({ type: 'Text', text: /○ Cold/ })).toBeDefined()
  expect(await ui.find({ type: 'Text', text: /Cache is cold/ })).toBeDefined()
})

test('dismissing a hint removes it', async ($, on) => {
  world(on)
  await reply($)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: PROPS })
  await ui.press({ key: 'dismiss-large' })
  expect(await ui.find({ type: 'Text', text: /Large context/ })).toBeUndefined()
})

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

test('a live terminal never takes the Svg branch: the clock bar and the sparklines draw as text', async ($, on) => {
  world(on)
  await reply($, 't1')
  await reply($, 't2')
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: PROPS })
  expect(await ui.find({ type: 'Svg' })).toBeUndefined()
  // the clock bar is 40 cells at 90 columns; no other row is a bar that long
  expect(await ui.findAll({ type: 'Text', text: /^[█░]{40}$/ })).toHaveLength(1)
  // four tile sparklines and the cost chart: one block per turn, two turns
  expect(await ui.findAll({ type: 'Text', text: /^[▁▂▃▄▅▆▇█]{2}$/ })).toHaveLength(5)
  await ui.unmount()
})

test('the Hints section sits above the savings block, right under the cache clock', async ($, on) => {
  world(on)
  await reply($)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: PROPS })
  const order = (await ui.findAll({ type: 'Text' })).map(n => n.text)
  const hints = order.indexOf('Hints')
  expect(hints).toBeGreaterThan(-1)
  expect(hints).toBeLessThan(order.indexOf('Saved by compacting'))
  await ui.unmount()
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

test('the legend names the auto-compact band in the default auto mode, on both surfaces', async ($, on) => {
  world(on)
  await reply($)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface, props: PROPS })
    expect(await ui.find({ type: 'Text', text: /last 5 min before expiry: auto-compact/ })).toBeDefined()
    await ui.unmount()
  }
})

test('in suggest mode the legend keeps the band but drops auto-compact, on both surfaces', { options: { mode: 'suggest' } }, async ($, on) => {
  world(on)
  await reply($)
  for (const surface of ['terminal', 'desktop'] as const) {
    const ui = await $.ui.mount({ ...PANE, surface, props: PROPS })
    expect(await ui.find({ type: 'Text', text: /last 5 min before expiry/ })).toBeDefined()
    expect(await ui.find({ type: 'Text', text: /auto-compact/ })).toBeUndefined()
    await ui.unmount()
  }
})

test('a second press while a compaction runs does not compact again, and says so', async ($, on) => {
  const { compacts, toasts } = world(on)
  await reply($)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: PROPS })
  const first = ui.press({ key: 'compact-header' })
  const second = ui.press({ key: 'compact-header' })
  await Promise.all([first, second])
  expect(compacts).toHaveLength(1)
  expect(toasts.filter(t => /already compacting/i.test(t))).toHaveLength(1)
})

test('a new snooze drops the snoozes that have run out', async ($, on) => {
  const { clock } = world(on)
  const saved: Record<string, { snoozed?: Record<string, number> }> = {}
  on('state.set', ($, e, next) => ((saved[e.key] = e.value as never), next(e)))
  await reply($)
  const snoozedKeys = () => Object.keys(Object.values(saved).at(-1)?.snoozed ?? {})
  let ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: PROPS })
  await ui.press({ key: 'snooze-large' })
  await ui.unmount()
  await clock.advance(11 * 60_000)
  ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: PROPS })
  await ui.press({ key: 'snooze-model' })
  await ui.unmount()
  expect(snoozedKeys()).toEqual(['model'])
})

test('without a terminal or desktop surface, /cost-panel answers with the text report', async ($, on) => {
  world(on)
  on('session.surfaces', () => ({ value: ['vscode'] }))
  await reply($)
  const { text } = await $.command.run({ command: 'cost-panel' } as never)
  expect(text).toMatch(/● Warm, expires in 60 min/)
  expect(text).toMatch(/cache hit 95\.2%/)
  expect(text).toMatch(/Large context: 420K/)
  expect(text).toMatch(/→ \/compactly/)
})

test('on the desktop app, /cost-panel opens the pane rather than replying with text', async ($, on) => {
  world(on)
  on('session.surfaces', () => ({ value: ['desktop'] }))
  on('ui.open', () => ({ value: { isPlaced: true } }) as never)
  await reply($)
  const { text } = await $.command.run({ command: 'cost-panel' } as never)
  expect(text ?? '').not.toMatch(/● Warm, expires in 60 min/)
})

const MODE = { plugin: 'compactly', component: 'SessionMode' } as const

test('the footer line shows beside the mode labels and pressing it opens the pane', async ($, on) => {
  world(on)
  const opened: string[] = []
  on('ui.open', ($, e) => (opened.push(e.id), { value: { isPlaced: true } } as never))
  await reply($)
  const ui = await $.ui.mount({ ...MODE, surface: 'terminal', props: { modes: ['auto mode'] } as never })
  expect(await ui.find({ type: 'Text', text: 'auto mode' })).toBeDefined()
  await ui.press({ key: 'footer-open' })
  expect(opened).toContain('cost-panel')
  await ui.unmount()
})

test('Settings: a section toggled off leaves the panel and the choice is stored', async ($, on) => {
  world(on)
  const store: Record<string, unknown> = {}
  on('store.keys', () => ({ value: Object.keys(store) }))
  on('store.get', ($, e) => ({ value: store[e.key] }))
  on('store.set', ($, e) => ((store[e.key] = e.value), { value: undefined }))
  await reply($)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: PROPS })
  expect(await ui.find({ type: 'Text', text: 'Cost per turn' })).toBeDefined()
  await ui.press({ key: 'settings-open' })
  await ui.press({ key: 'view-chart' })
  await ui.press({ key: 'settings-close' })
  expect(await ui.find({ type: 'Text', text: 'Cost per turn' })).toBeUndefined()
  expect(await ui.find({ type: 'Text', text: 'Saved by compacting' })).toBeDefined()
  expect(store.prefs).toMatchObject({ views: { chart: false, hints: true } })
  expect(store.prefs).not.toHaveProperty('isSettingsOpen')
  await ui.unmount()
})

test('Settings: a preset sets the footer fields and a single toggle makes it custom', async ($, on) => {
  world(on)
  on('store.set', () => ({ value: undefined }))
  await reply($)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: PROPS })
  await ui.press({ key: 'settings-open' })
  await ui.press({ key: 'preset-minimal' })
  expect(await ui.find({ type: 'Text', text: /^Now: ● warm 60m$/ })).toBeDefined()
  await ui.press({ key: 'field-rebuild' })
  expect(await ui.find({ type: 'Text', text: /^Now: ● warm 60m · \$[\d.]+ if cold$/ })).toBeDefined()
  await ui.unmount()
})
