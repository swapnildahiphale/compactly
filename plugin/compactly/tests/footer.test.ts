import { expect, test } from 'claude-code/testing'

import { footerLine } from '../hooks/footer'
import { state } from './model.test'

const MIN = 60_000

test('nothing to show for an unpriced model or an empty context', async () => {
  expect(footerLine(state({ model: 'mystery' }), 0, '1h')).toBeUndefined()
  expect(footerLine(state({ tokens: 0 }), 0, '1h')).toBeUndefined()
})

test('warm: state and timer, then what a cold cache would cost', async () => {
  const f = footerLine(state({ tokens: 100_000, dismissed: ['model'] }), 18 * MIN, '1h')!
  expect(f.text).toMatch(/^● warm 42m · \$[\d.]+ if cold$/)
  expect(f.color).toBe('success')
})

test('cold: says what the next message re-writes', async () => {
  const f = footerLine(state({ tokens: 100_000 }), 61 * MIN, '1h')!
  expect(f.text).toMatch(/^○ cold · next msg re-writes \$[\d.]+/)
  expect(f.color).toBe('warning')
})

test('a pending hint and a nearly full context show up', async () => {
  const f = footerLine(state({ tokens: 850_000 }), 0, '1h')!
  expect(f.text).toMatch(/▲ \d tips? · ctx 85%$/)
  expect(f.color).toBe('error')
})

test('a narrow width drops fields from the right, never the state', async () => {
  const wide = footerLine(state({ tokens: 850_000 }), 0, '1h')!.text
  const narrow = footerLine(state({ tokens: 850_000 }), 0, '1h', 20)!.text
  expect(wide.startsWith(narrow)).toBe(true)
  expect(narrow).toBe('● warm 60m')
})

test('no activity yet: the cache state is unknown', async () => {
  const f = footerLine(state({ tokens: 100_000, lastActivityAt: undefined }), 0, '1h')!
  expect(f.text.startsWith('○ cache ?')).toBe(true)
})
