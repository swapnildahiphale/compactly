import type { ElementTable } from 'claude-code'

import type { Prefs } from '../types'
import { FIELDS, PRESETS, presetOf, VIEWS } from './settings'
import type { FieldId, ViewId } from './settings'

export type SettingsActions = {
  toggleView: (id: ViewId) => void
  toggleField: (id: FieldId) => void
  setPreset: (name: string) => void
  close: () => void
}

const box = (on: boolean) => (on ? '[x]' : '[ ]')

/** The panel's settings page: which sections to draw, and which fields the footer line carries. */
export const settingsView = (els: ElementTable, p: Prefs, footer: string | undefined, act: SettingsActions) => {
  const { Box, Text, Button } = els
  const preset = presetOf(p.fields)
  return (
    <Box flexDirection="column" paddingX={1}>
      <Box flexDirection="row" justifyContent="space-between">
        <Text bold>Cost & cache settings</Text>
        <Button key="settings-close" label="← Back" onPress={act.close} />
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text bold>Panel sections</Text>
        <Box flexDirection="row" flexWrap="wrap" gap={1}>
          {VIEWS.map(v => (
            <Button key={`view-${v.id}`} label={`${box(p.views[v.id])} ${v.label}`} onPress={() => act.toggleView(v.id)} />
          ))}
        </Box>
      </Box>

      <Box flexDirection="column" marginTop={1}>
        <Text bold>Footer line</Text>
        <Box flexDirection="row" flexWrap="wrap" gap={1}>
          {[...Object.keys(PRESETS), ...(preset === 'custom' ? ['custom'] : [])].map(name => (
            <Button
              key={`preset-${name}`}
              label={`${name === preset ? '(•)' : '( )'} ${name}`}
              onPress={() => name in PRESETS && act.setPreset(name)}
            />
          ))}
        </Box>
        <Box flexDirection="row" flexWrap="wrap" gap={1}>
          {FIELDS.map(f => (
            <Button key={`field-${f.id}`} label={`${box(p.fields[f.id])} ${f.label}`} onPress={() => act.toggleField(f.id)} />
          ))}
        </Box>
        <Text dimColor>Now: {footer ?? '(nothing to show: the footer line is hidden)'}</Text>
      </Box>
    </Box>
  )
}
