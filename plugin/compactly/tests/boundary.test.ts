import type { On } from 'claude-code'
import { expect, mock, test, type TestBody } from 'claude-code/testing'

type World = {
  toasts: string[]
  logs: string[]
  compacts: (string | undefined)[]
  clock: ReturnType<typeof mock.clock>
  messages: { role: 'user' | 'assistant'; text: string; toolUses: never[] }[]
  // When set, a compaction waits on it, so a test can overlap two compactions.
  hold?: Promise<void>
}

const COMMITTED = [
  { role: 'user', text: 'commit it', toolUses: [] },
  { role: 'assistant', text: 'Committed as 3f2a1c on main.', toolUses: [] },
] as World['messages']

// Stands for the engine beneath the plugin: context size, model, UI, compaction, Bash.
const world = (on: On, tokens: number): World => {
  const w: World = { toasts: [], logs: [], compacts: [], clock: mock.clock(on), messages: COMMITTED }
  on('session.messages', () => ({ value: w.messages as never }))
  on('session.usage', () => ({ value: { startedAt: 0, context: { tokens, window: 1_000_000 }, rateLimits: [] } }))
  on('session.model', () => ({ value: 'claude-opus-5' }))
  on('ui.toast', ($, e) => (w.toasts.push(e.text), { value: undefined }))
  on('ui.status', () => ({ value: undefined }))
  on('prompt.suggest', () => ({ isShown: true }) as never)
  on('ui.log', ($, e) => (e.to === 'debug' || w.logs.push(e.text), { value: undefined }))
  on('session.compact', async ($, e) => {
    w.compacts.push(e.instructions)
    await w.hold
    return { messages: [{ role: 'user', text: 'summary', toolUses: [] }] as never, tokensBefore: tokens, tokensAfter: 20_000 }
  })
  on('tool.call', { tool: 'Bash' }, ($, e) =>
    /fail/.test(e.command)
      ? ({ isError: true, result: 'exit 1', text: 'exit 1' } as never)
      : ({ result: { stdout: '', stderr: '', interrupted: false }, text: '' } as never),
  )
  on('turn.start', ($, e) => ({ turnId: e.turnId }))
  on('turn.complete', ($, e) => ({ text: e.answer }))
  return w
}

const PANE = { plugin: 'compactly', component: 'Pane', requestId: 'cost-panel' } as const
const PROPS = { title: 'Cost & cache', isFocused: false, bodyColumns: 90, placement: 'dock' } as never

const turn = async ($: Parameters<TestBody>[0], commands: string[], agentId?: string) => {
  await $.turn.start({ text: 'do it', turnId: 't1' })
  for (const command of commands) await $.tool.call({ tool: 'Bash', command, ...(agentId ? { agentId } : {}) } as never)
  await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
}

test('suggest mode: a commit on a large context nudges, does not compact', { options: { mode: 'suggest' } }, async ($, on) => {
  const w = world(on, 420_000)
  await turn($, ['git add -A', 'git commit -m "feat: x"'])
  expect(w.compacts).toHaveLength(0)
  expect(w.toasts).toHaveLength(1)
  expect(w.toasts[0]).toMatch(/Task boundary \(commit\) with 420K/)
  expect(w.toasts[0]).toMatch(/\$0\.21 per turn/)
})

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

test('a plugin reload drops the armed idle compaction announcement, since its timer does not survive', async ($, on) => {
  world(on, 420_000)
  on('session.start', ($, e) => ({ cwd: e.cwd }))
  on('command.register', () => ({ value: undefined }) as never)
  on('ui.open', () => ({ value: { isPlaced: false, reason: 'test' } }) as never)
  await turn($, ['git commit -m x'])
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: PROPS })
  expect(await ui.find({ type: 'Text', text: /Next: auto-compact/ })).toBeDefined()
  await $.session.start({ cwd: '/repo', surface: 'terminal', isInteractive: true } as never)
  expect(await ui.find({ type: 'Text', text: /Next: auto-compact/ })).toBeUndefined()
  await ui.unmount()
})

test('the default mode is auto with the Sonnet judge: a commit alone does not compact', async ($, on) => {
  const w = world(on, 420_000)
  await turn($, ['git commit -m x'])
  await w.clock.advance(2000)
  expect(w.compacts).toHaveLength(0)
  expect(w.toasts).toHaveLength(0)
})

test('with the judge on, a commit no prompt follows compacts just before the 1-hour cache expires', async ($, on) => {
  const w = world(on, 420_000)
  await turn($, ['git commit -m x'])
  await w.clock.advance(54 * 60_000)
  expect(w.compacts).toHaveLength(0)
  await w.clock.advance(60_000)
  expect(w.compacts).toHaveLength(1)
  expect(w.compacts[0]).toMatch(/task boundary \(commit\)/)
  expect(w.logs[0]).toMatch(/commit → compacted 420K → 20K .* · idle, before the cache expired/)
})

test('recent turns that mention paused work hold back the idle compaction', async ($, on) => {
  const w = world(on, 420_000)
  w.messages = [
    { role: 'user', text: 'run the users migration', toolUses: [] },
    { role: 'assistant', text: 'Paused after step 3: replica lag is above 30s. Resume once it is back under 5s.', toolUses: [] },
    ...COMMITTED,
  ]
  await turn($, ['git commit -m x'])
  await w.clock.advance(60 * 60_000)
  expect(w.compacts).toHaveLength(0)
  expect(w.logs[0]).toMatch(/commit, but recent turns mention paused or blocked work/)
})

test('a pause older than the last three prompts no longer holds compaction back', async ($, on) => {
  const w = world(on, 420_000)
  w.messages = [
    { role: 'user', text: 'pause the rollout', toolUses: [] },
    ...['fix the typo', 'add a test', 'commit it'].map(text => ({ role: 'user' as const, text, toolUses: [] })),
    { role: 'assistant', text: 'Committed as 3f2a1c on main.', toolUses: [] },
  ]
  await turn($, ['git commit -m x'])
  await w.clock.advance(60 * 60_000)
  expect(w.compacts).toHaveLength(1)
})

test('judge=off: paused work holds back the commit compaction too', { options: { judge: 'off' } }, async ($, on) => {
  const w = world(on, 420_000)
  w.messages = [{ role: 'user', text: "commit what we have, but don't continue the migration until Friday", toolUses: [] }]
  await turn($, ['git commit -m x'])
  await w.clock.advance(2000)
  expect(w.compacts).toHaveLength(0)
})

test('with the judge on and the 5-minute cache, the idle compaction runs at 4 minutes', { options: { cacheTtl: '5m' } }, async ($, on) => {
  const w = world(on, 420_000)
  await turn($, ['git commit -m x'])
  await w.clock.advance(4 * 60_000)
  expect(w.compacts).toHaveLength(1)
})

test('a prompt before the cache expires cancels the idle compaction: the judge decides', async ($, on) => {
  const w = world(on, 420_000)
  await turn($, ['git commit -m x'])
  await w.clock.advance(30 * 60_000)
  await $.turn.start({ text: 'next', turnId: 't2' })
  await w.clock.advance(60 * 60_000)
  expect(w.compacts).toHaveLength(0)
})

test('judge=off: auto mode compacts on a commit, as before', { options: { judge: 'off' } }, async ($, on) => {
  const w = world(on, 420_000)
  await turn($, ['git commit -m x'])
  await w.clock.advance(2000)
  expect(w.compacts).toHaveLength(1)
  expect(w.toasts).toHaveLength(0)
})

test('auto mode: compacts after the turn settles, with the handoff prompt', { options: { mode: 'auto', judge: 'off' } }, async ($, on) => {
  const w = world(on, 420_000)
  const clock = w.clock
  await turn($, ['npm test', 'git commit -m x', 'gh pr create --fill'])
  expect(w.compacts).toHaveLength(0)
  await clock.advance(2000)
  expect(w.compacts).toHaveLength(1)
  expect(w.compacts[0]).toMatch(/task boundary \(pr\)/)
  expect(w.compacts[0]).toMatch(/Open work and follow-ups/)
  expect(w.compacts[0]).toMatch(/paused, blocked or waiting: what it is, why it stopped/)
  expect(w.logs[0]).toMatch(/pr → compacted 420K → 20K/)
})

test('auto mode: a new turn before the delay cancels the compaction', { options: { mode: 'auto', judge: 'off' } }, async ($, on) => {
  const w = world(on, 420_000)
  const clock = w.clock
  await turn($, ['git commit -m x'])
  await $.turn.start({ text: 'next', turnId: 't2' })
  await clock.advance(2000)
  expect(w.compacts).toHaveLength(0)
})

test('no boundary when the command failed, the context is small, or a subagent ran it', { options: { mode: 'auto', judge: 'off' } }, async ($, on) => {
  const w = world(on, 420_000)
  const clock = w.clock
  await turn($, ['pytest tests/ # fail'])
  await turn($, ['git commit -m x'], 'agent-1')
  await clock.advance(2000)
  expect(w.compacts).toHaveLength(0)
})

test('below minTokens nothing happens', async ($, on) => {
  const w = world(on, 90_000)
  await turn($, ['git commit -m x'])
  await w.clock.advance(60 * 60_000)
  expect(w.toasts).toHaveLength(0)
  expect(w.compacts).toHaveLength(0)
})

test('a manual /compactly cancels the armed idle compaction, so the timer does not compact again', async ($, on) => {
  const w = world(on, 420_000)
  await turn($, ['git commit -m x'])
  await $.command.run({ command: 'compactly' } as never)
  await w.clock.advance(2000)
  expect(w.compacts).toHaveLength(1)
  await w.clock.advance(60 * 60_000)
  expect(w.compacts).toHaveLength(1)
})

// The SDK-host fallback ($.session.compact unavailable → /compact via $.command.run) is not
// testable here: the kit skips a mock that throws instead of handing its error to the plugin.
// It was verified live in a stream-json session (the SDK host mode).

test('git global options before the subcommand still count as a commit', { options: { mode: 'suggest' } }, async ($, on) => {
  const w = world(on, 420_000)
  await turn($, ['git -C /repo commit -m x'])
  expect(w.toasts).toHaveLength(1)
})

test('signals=all: a deploy counts; the default (git) ignores it', { options: { mode: 'suggest', signals: 'all' } }, async ($, on) => {
  const w = world(on, 420_000)
  await turn($, ['helm upgrade --install alloy ./charts/alloy -f values.yaml'])
  expect(w.toasts[0]).toMatch(/Task boundary \(deploy\)/)
})

test('the default signal set ignores validation and deploy commands', { options: { mode: 'suggest' } }, async ($, on) => {
  const w = world(on, 420_000)
  await turn($, ['helm lint ./charts/alloy', 'helm upgrade alloy ./charts/alloy'])
  expect(w.toasts).toHaveLength(0)
})

test('a timer firing while a button compaction runs does not compact a second time', async ($, on) => {
  const w = world(on, 420_000)
  let release!: () => void
  w.hold = new Promise<void>(r => (release = r))
  await turn($, ['git commit -m x'])
  await w.clock.advance(54 * 60_000)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: PROPS })
  await ui.press({ key: 'compact-header' })
  await w.clock.advance(60_000)
  release()
  await w.clock.advance(2000)
  expect(w.compacts).toHaveLength(1)
  await ui.unmount()
})

test('a manual /compactly that lands as the idle compaction is armed leaves no announcement behind', async ($, on) => {
  const w = world(on, 420_000)
  let isInterposed = false
  // The announcement is written after the timer is armed: a manual compaction runs inside that write.
  on('state.set', async (_, e, next) => {
    if (!isInterposed && (e.value as { compactAt?: number } | undefined)?.compactAt !== undefined) {
      isInterposed = true
      await $.command.run({ command: 'compactly' } as never)
      await w.clock.advance(200)
    }
    return next(e)
  })
  await turn($, ['git commit -m x'])
  expect(isInterposed).toBe(true)
  await w.clock.advance(60 * 60_000)
  expect(w.compacts).toHaveLength(1)
  const ui = await $.ui.mount({ ...PANE, surface: 'terminal', props: PROPS })
  expect(await ui.find({ type: 'Text', text: /Next: auto-compact/ })).toBeUndefined()
  await ui.unmount()
})

test('signals=all: a todo list with every item completed counts', { options: { mode: 'suggest', signals: 'all' } }, async ($, on) => {
  const w = world(on, 420_000)
  on('tool.call', { tool: 'TodoWrite' }, () => ({ result: {}, text: '' }) as never)
  await $.turn.start({ text: 'go', turnId: 't1' })
  await $.tool.call({ tool: 'TodoWrite', todos: [{ content: 'a', status: 'completed', activeForm: 'a' }] } as never)
  await $.turn.complete({ answer: 'done', durationMs: 1, isAborted: false, turnId: 't1', reason: 'answer' })
  expect(w.toasts[0]).toMatch(/Task boundary \(todos\)/)
})
