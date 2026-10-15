import { expect, test } from 'claude-code/testing'

import { DEFAULT_PREFS, normalize, PRESETS, presetOf } from '../hooks/settings'

test('the defaults are the standard preset, which is what the footer showed before settings existed', () => {
  expect(presetOf(DEFAULT_PREFS.fields)).toBe('standard')
  expect(Object.keys(PRESETS).map(n => presetOf(PRESETS[n]!))).toEqual(Object.keys(PRESETS))
})

test('a field that matches no preset is custom', () => {
  expect(presetOf({ ...PRESETS.minimal!, tips: true })).toBe('custom')
})

test('a stored value from a hand edit keeps its booleans and defaults the rest', () => {
  const p = normalize({ views: { hints: false, chart: 'no' }, fields: 7 })
  expect(p.views.hints).toBe(false)
  expect(p.views.chart).toBe(true)
  expect(p.fields).toEqual(DEFAULT_PREFS.fields)
  expect(normalize(undefined)).toEqual(DEFAULT_PREFS)
})
