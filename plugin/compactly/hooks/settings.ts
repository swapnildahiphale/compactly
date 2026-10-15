import type { Prefs } from '../types'

export const VIEWS = [
  { id: 'tiles', label: 'Stat tiles' },
  { id: 'clock', label: 'Cache clock' },
  { id: 'context', label: 'Context bar' },
  { id: 'hints', label: 'Hints' },
  { id: 'saved', label: 'Saved by compacting' },
  { id: 'chart', label: 'Cost per turn' },
] as const

export const FIELDS = [
  { id: 'cache', label: 'Cache state' },
  { id: 'rebuild', label: 'Rebuild cost' },
  { id: 'tips', label: 'Tip count' },
  { id: 'ctx', label: 'Context % (from 80%)' },
] as const

export type ViewId = (typeof VIEWS)[number]['id']
export type FieldId = (typeof FIELDS)[number]['id']

/** `standard` is what the footer showed before it was configurable. */
export const PRESETS: Record<string, Record<FieldId, boolean>> = {
  minimal: { cache: true, rebuild: false, tips: false, ctx: false },
  cost: { cache: true, rebuild: true, tips: false, ctx: false },
  standard: { cache: true, rebuild: true, tips: true, ctx: true },
}

export const DEFAULT_PREFS: Prefs = {
  views: { tiles: true, clock: true, context: true, hints: true, saved: true, chart: true },
  fields: PRESETS.standard!,
}

/** The preset whose fields match exactly, else `custom`. */
export const presetOf = (fields: Prefs['fields']): string =>
  Object.keys(PRESETS).find(name => FIELDS.every(f => PRESETS[name]![f.id] === fields[f.id])) ?? 'custom'

/** A stored value from an older or hand-edited store: keep what is a boolean, default the rest. */
export const normalize = (raw: unknown): Prefs => {
  const r = (raw ?? {}) as Partial<Record<'views' | 'fields', Record<string, unknown>>>
  const pick = <K extends string>(ids: readonly { id: K }[], from: Record<string, unknown> | undefined, base: Record<K, boolean>) =>
    Object.fromEntries(ids.map(({ id }) => [id, typeof from?.[id] === 'boolean' ? from[id] : base[id]])) as Record<K, boolean>
  return { views: pick(VIEWS, r.views, DEFAULT_PREFS.views), fields: pick(FIELDS, r.fields, DEFAULT_PREFS.fields) }
}
